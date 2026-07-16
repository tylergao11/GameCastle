var crypto = require('crypto');
var path = require('path');
var engineContract = require('../contracts/spatial-engine-contract.json');
var spatialEngine = require('./runtime');
var plannerContext = require('./spatial-planner-context');
var plannerPrompt = require('./spatial-planner-prompt');
var plannerDsl = require('./spatial-planner-dsl');
var plannerTrace = require('./spatial-planner-trace');
var preview = require('../../gdjs/src/gdjs-spatial-preview');
var providerAdapters = require('../../providers/src/provider-runtime-adapters');

var compiledSpatialGraphCache = { signature: null, promise: null };
var compiledSpatialGraphCounters = { compiles: 0, cacheHits: 0, invocations: 0 };

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, Object.create(null)); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SpatialPlannerLangGraph'; throw error; }
function positiveInteger(value, label) { if (!Number.isInteger(value) || value <= 0) fail('SPATIAL_PLANNER_INPUT_INVALID', label + ' must be a positive integer'); return value; }
function append(trace, entry) { return (trace || []).concat([entry]); }
function loadLangGraph() { return import('@langchain/langgraph'); }

function describeGraph() {
  var stages = engineContract.graph || [], definitions = engineContract.stageDefinitions || {}, definitionStages = Object.keys(definitions);
  if (!stages.length || stages.some(function(stage) { return definitionStages.indexOf(stage) < 0; }) || definitionStages.some(function(stage) { return stages.indexOf(stage) < 0; })) fail('SPATIAL_PLANNER_STAGE_DEFINITION_MISMATCH', 'Spatial Planner graph and stageDefinitions must declare the same stage ids.');
  return {
    contractId: engineContract.contractId,
    schemaVersion: engineContract.schemaVersion,
    stages: stages.map(function(stage) {
      var dependencies = definitions[stage];
      if (!Array.isArray(dependencies) || !dependencies.length) fail('SPATIAL_PLANNER_STAGE_DEFINITION_MISSING', 'Spatial Planner stage has no dependency definition: ' + stage);
      return { stage: stage, dependencies: dependencies.map(function(definition) {
        if (!definition || typeof definition.module !== 'string' || !Array.isArray(definition.exports) || !definition.exports.length) fail('SPATIAL_PLANNER_STAGE_DEFINITION_INVALID', 'Spatial Planner stage dependency is incomplete: ' + stage);
        var file = path.resolve(__dirname, '..', '..', '..', definition.module), loaded;
        try { loaded = require(file); } catch (error) { fail('SPATIAL_PLANNER_STAGE_MODULE_MISSING', stage + ' cannot load ' + definition.module + ': ' + error.message); }
        definition.exports.forEach(function(name) { if (typeof loaded[name] !== 'function') fail('SPATIAL_PLANNER_STAGE_EXPORT_MISSING', stage + ' requires ' + definition.module + '#' + name); });
        return { module: definition.module, exports: definition.exports.slice() };
      }) };
    })
  };
}
function assertLangGraphRuntime(lg) {
  if (!lg || !lg.Annotation || !lg.Annotation.Root || !lg.StateGraph || lg.START === undefined || lg.END === undefined) fail('SPATIAL_PLANNER_LANGGRAPH_RUNTIME_INVALID', 'Official @langchain/langgraph must expose Annotation.Root, StateGraph, START, and END.');
}
function receiptSummary(receipt) {
  if (!receipt || typeof receipt !== 'object') return null;
  return { receiptId: receipt.receiptId || null, provider: receipt.provider || null, model: receipt.model || null, status: receipt.status || null, simulated: !!(receipt.provenance && receipt.provenance.simulated) };
}
function feedbackFact(error) { return { code: error.code || 'SPATIAL_PLANNER_STAGE_FAILED', owner: error.owner || 'SpatialPlanner', message: String(error.message || error) }; }
function imageInputs(context, lastPreview) {
  var inputs = (context.imageInputs || []).map(function(item) { return { imageRef: item.imageRef, path: item.path, kind: 'accepted-asset', semanticId: item.semanticId, contentHash: item.contentHash }; });
  if (lastPreview && lastPreview.imagePath) inputs.push({ imageRef: 'candidate-preview:' + lastPreview.contentHash, path: lastPreview.imagePath, kind: 'candidate-preview', contentHash: lastPreview.contentHash });
  return inputs;
}
function emitRound(state, entry) { if (typeof state.onSpatialRound === 'function') state.onSpatialRound(clone(entry)); }
function traceIdentity(state) { return { runId: state.runId, projectId: state.projectId, sourceHash: state.spatialInput.sourceHash, spatialAssemblyInputHash: state.spatialInput.contentHash, traceDir: state.traceDir }; }
function persistRound(state) {
  var entries = state.trace.filter(function(entry) { return entry.round === state.round; });
  state.roundTraceArtifacts = state.roundTraceArtifacts.concat([plannerTrace.writeRound(Object.assign(traceIdentity(state), { round: state.round, entries: entries }))]);
}

function spatialGraphNode(_stage, work) { return async function(wire) { var state = Object.assign({}, wire.state); await work(state); return { state: state }; }; }
function setFeedback(state, status, fact) {
  state.feedback = plannerPrompt.buildFeedback({ round: state.round, status: status, fact: fact || null, readyCandidate: state.lastCandidate && state.lastPreview ? { candidateHash: state.lastCandidate.contentHash, candidateProjectionHash: state.lastCandidateProjection.contentHash, previewHash: state.lastPreview.contentHash, previewImageRef: 'candidate-preview:' + state.lastPreview.contentHash } : null });
}
function spatialGraphHandlers() {
  return {
    'context-build': function(state) {
      state.context = plannerContext.createContext(state.spatialInput, state.assetBoundSeed, state.assetWorld, state.semanticSource);
      state.trace = append(state.trace, { stage: 'context-build', contextHash: state.context.contentHash });
    },
    'planner-invoke': async function(state) {
      if (state.round >= state.maxRounds) { state.status = 'round-limit'; state.next = 'end'; return; }
      state.round += 1;
      var requestImages = imageInputs(state.context, state.lastPreview), requestPrompt = plannerPrompt.buildPrompt(state.context, state.feedback, state.round, requestImages), result;
      var requestInput = { contextHash: state.context.contentHash, systemPrompt: requestPrompt.systemPrompt, prompt: requestPrompt.prompt, imageInputs: requestImages };
      try {
        result = await state.plannerPort.invoke({ requestId: state.runId + ':spatial:' + state.round, projectId: state.projectId, systemPrompt: requestPrompt.systemPrompt, prompt: requestPrompt.prompt, imagePaths: requestImages.map(function(item) { return item.path; }), maxTokens: state.maxTokens, round: state.round, contextHash: state.context.contentHash });
      } catch (error) {
        state.status = 'provider-failed'; state.next = 'end'; state.trace = append(state.trace, { stage: 'planner-invoke', round: state.round, input: requestInput, providerFailure: feedbackFact(error) }); persistRound(state); return;
      }
      if (!result || result.ok !== true || !result.output || typeof result.output.text !== 'string') {
        state.status = 'provider-failed'; state.next = 'end'; state.trace = append(state.trace, { stage: 'planner-invoke', round: state.round, input: requestInput, providerFailure: result && result.debt || { code: 'SPATIAL_PLANNER_OUTPUT_INVALID', owner: 'SpatialPlannerPort', message: 'Planner port returned no text output' }, receipt: receiptSummary(result && result.receipt) }); persistRound(state); return;
      }
      var dsl = result.output.text;
      var outputEntry = { stage: 'planner-invoke', round: state.round, input: requestInput, dsl: dsl, receipt: receiptSummary(result.receipt) };
      state.trace = append(state.trace, outputEntry);
      state.modelOutputArtifacts = state.modelOutputArtifacts.concat([plannerTrace.writeModelOutput(Object.assign(traceIdentity(state), { round: state.round, entry: outputEntry }))]);
      emitRound(state, outputEntry);
      try {
        state.program = plannerDsl.parseProgram(dsl);
        state.trace = append(state.trace, { stage: 'dsl-parse', round: state.round, status: 'valid', program: clone(state.program) });
      } catch (error) {
        var parseFact = feedbackFact(error);
        state.trace = append(state.trace, { stage: 'dsl-parse', round: state.round, status: 'invalid', fact: parseFact });
        setFeedback(state, 'dsl-invalid', parseFact); state.next = 'feedback'; return;
      }
      if (state.program.kind === 'accept') {
        if (!state.lastCandidate || !state.lastCandidateProjection || !state.lastPreview) { setFeedback(state, 'acceptance-not-ready', { code: 'SPATIAL_ACCEPTANCE_PREVIEW_MISSING', owner: 'SpatialEngine', message: 'ACCEPT requires a candidate projection and preview from an earlier round.' }); state.next = 'feedback'; return; }
        state.next = 'accept';
        return;
      }
      state.next = 'candidate';
    },
    'candidate-validate': function(state) {
      try {
        state.pendingCandidate = spatialEngine.createLayoutCandidate(state.spatialInput, { round: state.round, placements: state.program.placements });
        state.trace = append(state.trace, { stage: 'candidate-validate', round: state.round, candidateHash: state.pendingCandidate.contentHash, candidate: clone(state.pendingCandidate), status: 'valid' });
        state.next = 'candidate-project';
      } catch (error) {
        setFeedback(state, 'candidate-invalid', feedbackFact(error)); state.trace = append(state.trace, { stage: 'candidate-validate', round: state.round, status: 'invalid', fact: feedbackFact(error) }); state.next = 'feedback';
      }
    },
    'candidate-gdjs-project': function(state) {
      try {
        state.pendingProjection = spatialEngine.createCandidateProjection(state.spatialInput, state.assetBoundSeed, state.pendingCandidate);
        state.trace = append(state.trace, { stage: 'candidate-gdjs-project', round: state.round, projectionHash: state.pendingProjection.contentHash, status: 'valid' });
        state.next = 'preview';
      } catch (error) {
        setFeedback(state, 'candidate-projection-invalid', feedbackFact(error)); state.trace = append(state.trace, { stage: 'candidate-gdjs-project', round: state.round, status: 'invalid', fact: feedbackFact(error) }); state.next = 'feedback';
      }
    },
    'preview': async function(state) {
      try {
        var rendered = await preview.renderPreview({ spatialInput: state.spatialInput, assetBoundSeed: state.assetBoundSeed, assetWorld: state.assetWorld, projection: state.pendingProjection, outputDir: state.previewDir });
        state.lastCandidate = state.pendingCandidate;
        state.lastCandidateProjection = state.pendingProjection;
        state.lastPreview = rendered;
        state.trace = append(state.trace, { stage: 'preview', round: state.round, candidateHash: state.lastCandidate.contentHash, projectionHash: state.lastCandidateProjection.contentHash, previewHash: rendered.contentHash, imagePath: rendered.imagePath });
        setFeedback(state, 'preview-ready', null);
      } catch (error) {
        setFeedback(state, 'preview-invalid', feedbackFact(error)); state.trace = append(state.trace, { stage: 'preview', round: state.round, status: 'invalid', fact: feedbackFact(error) });
      }
      state.next = 'feedback';
    },
    'planner-feedback': function(state) {
      state.trace = append(state.trace, { stage: 'planner-feedback', round: state.round, feedback: clone(state.feedback) });
      persistRound(state);
      if (state.round >= state.maxRounds) { state.status = 'round-limit'; state.next = 'end'; } else state.next = 'planner';
    },
    'acceptance': function(state) {
      try {
        state.resolution = spatialEngine.acceptCandidate(state.spatialInput, state.lastCandidate, { acceptanceRound: state.round, assetBoundSeed: state.assetBoundSeed, candidateProjection: state.lastCandidateProjection, preview: state.lastPreview });
        state.trace = append(state.trace, { stage: 'acceptance', round: state.round, candidateHash: state.lastCandidate.contentHash, resolutionHash: state.resolution.contentHash, resolution: clone(state.resolution) });
        state.next = 'accepted-project';
      } catch (error) {
        setFeedback(state, 'acceptance-invalid', feedbackFact(error)); state.trace = append(state.trace, { stage: 'acceptance', round: state.round, status: 'invalid', fact: feedbackFact(error) }); state.next = 'feedback';
      }
    },
    'accepted-gdjs-project': function(state) {
      try {
        state.acceptedProjection = spatialEngine.createAcceptedProjection(state.spatialInput, state.assetBoundSeed, state.resolution, { candidate: state.lastCandidate, candidateProjection: state.lastCandidateProjection, preview: state.lastPreview });
        state.status = 'accepted';
        state.trace = append(state.trace, { stage: 'accepted-gdjs-project', round: state.round, projectionHash: state.acceptedProjection.contentHash, resolutionHash: state.resolution.contentHash });
      } catch (error) {
        state.status = 'accepted-projection-failed'; state.trace = append(state.trace, { stage: 'accepted-gdjs-project', round: state.round, status: 'invalid', fact: feedbackFact(error) });
      }
      persistRound(state);
      state.next = 'end';
    }
  };
}
async function buildCompiledSpatialGraph(graphDefinition) {
  var lg = await loadLangGraph();
  assertLangGraphRuntime(lg);
  var handlers = spatialGraphHandlers(), stages = graphDefinition.stages.map(function(definition) { return definition.stage; });
  if (stages.some(function(stage) { return typeof handlers[stage] !== 'function'; }) || Object.keys(handlers).some(function(stage) { return stages.indexOf(stage) < 0; })) fail('SPATIAL_PLANNER_STAGE_HANDLER_MISMATCH', 'Spatial Planner handlers must exactly match packages/spatial/contracts/spatial-engine-contract.json.');
  var A = lg.Annotation.Root({ state: lg.Annotation({ reducer: function(_left, right) { return right; }, default: function() { return null; } }) }), graph = new lg.StateGraph(A);
  stages.forEach(function(stage) { graph.addNode(stage, spatialGraphNode(stage, handlers[stage])); });
  graph.addEdge(lg.START, 'context-build');
  graph.addEdge('context-build', 'planner-invoke');
  graph.addConditionalEdges('planner-invoke', function(wire) { return wire.state.next; }, { candidate: 'candidate-validate', accept: 'acceptance', feedback: 'planner-feedback', end: lg.END });
  graph.addConditionalEdges('candidate-validate', function(wire) { return wire.state.next; }, { 'candidate-project': 'candidate-gdjs-project', feedback: 'planner-feedback' });
  graph.addConditionalEdges('candidate-gdjs-project', function(wire) { return wire.state.next; }, { preview: 'preview', feedback: 'planner-feedback' });
  graph.addEdge('preview', 'planner-feedback');
  graph.addConditionalEdges('planner-feedback', function(wire) { return wire.state.next; }, { planner: 'planner-invoke', end: lg.END });
  graph.addConditionalEdges('acceptance', function(wire) { return wire.state.next; }, { 'accepted-project': 'accepted-gdjs-project', feedback: 'planner-feedback' });
  graph.addEdge('accepted-gdjs-project', lg.END);
  var compiled = graph.compile();
  compiledSpatialGraphCounters.compiles += 1;
  return compiled;
}
function compiledSpatialGraph(graphDefinition) {
  var signature = JSON.stringify(graphDefinition);
  if (compiledSpatialGraphCache.promise && compiledSpatialGraphCache.signature === signature) { compiledSpatialGraphCounters.cacheHits += 1; return compiledSpatialGraphCache.promise; }
  var pending = buildCompiledSpatialGraph(graphDefinition);
  compiledSpatialGraphCache = { signature: signature, promise: pending };
  pending.then(null, function() { if (compiledSpatialGraphCache.promise === pending) compiledSpatialGraphCache = { signature: null, promise: null }; });
  return pending;
}
function compiledSpatialGraphMetrics() { return { compiles: compiledSpatialGraphCounters.compiles, cacheHits: compiledSpatialGraphCounters.cacheHits, invocations: compiledSpatialGraphCounters.invocations, cached: !!compiledSpatialGraphCache.promise }; }
function resetCompiledSpatialGraphCache() { compiledSpatialGraphCache = { signature: null, promise: null }; compiledSpatialGraphCounters = { compiles: 0, cacheHits: 0, invocations: 0 }; }
async function prewarmGraph() { var graphDefinition = describeGraph(); await compiledSpatialGraph(graphDefinition); return { ready: true, stages: graphDefinition.stages.map(function(stage) { return stage.stage; }) }; }

async function runSpatialPlanner(input) {
  input = input || {};
  if (!input.runId || !input.projectId || !input.spatialInput || !input.assetBoundSeed || !input.assetWorld || !input.semanticSource || !input.previewDir) fail('SPATIAL_PLANNER_INPUT_INVALID', 'Spatial Planner requires runId, projectId, spatialInput, assetBoundSeed, assetWorld, semanticSource, and previewDir.');
  var maxRounds = positiveInteger(input.maxRounds, 'Spatial Planner maxRounds'), plannerPort = input.plannerPort || (input.providerRuntime && providerAdapters.createSpatialPlannerPort(input.providerRuntime, input.providerOptions || {}));
  if (!plannerPort || typeof plannerPort.invoke !== 'function') fail('SPATIAL_PLANNER_PORT_UNAVAILABLE', 'Spatial Planner requires a configured planner port or ProviderRuntime.');
  if (input.onSpatialRound !== undefined && typeof input.onSpatialRound !== 'function') fail('SPATIAL_PLANNER_INPUT_INVALID', 'Spatial Planner onSpatialRound must be a function when supplied.');
  var graphDefinition = describeGraph();
  var initial = {
    runId: input.runId,
    projectId: input.projectId,
    spatialInput: input.spatialInput,
    assetBoundSeed: input.assetBoundSeed,
    assetWorld: input.assetWorld,
    semanticSource: input.semanticSource,
    previewDir: input.previewDir,
    traceDir: input.traceDir || path.join(input.previewDir, 'trace'),
    maxRounds: maxRounds,
    maxTokens: input.maxTokens,
    plannerPort: plannerPort,
    onSpatialRound: input.onSpatialRound || null,
    round: 0,
    context: null,
    feedback: null,
    program: null,
    pendingCandidate: null,
    pendingProjection: null,
    lastCandidate: null,
    lastCandidateProjection: null,
    lastPreview: null,
    resolution: null,
    acceptedProjection: null,
    status: 'running',
    next: null,
    trace: [],
    modelOutputArtifacts: [],
    roundTraceArtifacts: []
  };
  var graph = await compiledSpatialGraph(graphDefinition);
  compiledSpatialGraphCounters.invocations += 1;
  var output = await graph.invoke({ state: initial });
  var state = output.state, runTraceArtifact = plannerTrace.writeRun(Object.assign(traceIdentity(state), { status: state.status, completedRounds: state.round, entries: state.trace, modelOutputs: state.modelOutputArtifacts, rounds: state.roundTraceArtifacts })), result = {
    schemaVersion: 1,
    documentKind: 'spatial-planner-run',
    runId: state.runId,
    projectId: state.projectId,
    sourceHash: state.context && state.context.sourceHash || null,
    spatialAssemblyInputHash: state.context && state.context.spatialAssemblyInputHash || null,
    status: state.status,
    rounds: state.round,
    contextHash: state.context && state.context.contentHash || null,
    trace: state.trace,
    traceArtifact: { directory: state.traceDir, modelOutputs: state.modelOutputArtifacts, rounds: state.roundTraceArtifacts, run: runTraceArtifact },
    candidate: state.lastCandidate,
    candidateProjection: state.lastCandidateProjection,
    preview: state.lastPreview,
    resolution: state.resolution,
    acceptedProjection: state.acceptedProjection
  };
  result.contentHash = 'spatial-planner-run.' + hash(result);
  return result;
}

module.exports = { runSpatialPlanner: runSpatialPlanner, prewarmGraph: prewarmGraph, describeGraph: describeGraph, assertLangGraphRuntime: assertLangGraphRuntime, _compiledGraphMetrics: compiledSpatialGraphMetrics, _resetCompiledGraphCache: resetCompiledSpatialGraphCache };
