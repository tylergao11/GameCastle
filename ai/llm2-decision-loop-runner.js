var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var intentSurfaceGuard = require('./intent-surface-guard');
var llm2ContextCacheRouter = require('./llm2-context-cache-router');
var llm2ContextProvider = require('./llm2-context-provider');
var llm2DeepSeekDecisionProvider = require('./llm2-deepseek-decision-provider');
var llm2DecisionRuntime = require('./llm2-decision-runtime');
var semanticFeedback = require('./semantic-feedback');

var LLM2_DECISION_LOOP_SCHEMA_VERSION = 1;
var ROOT = path.join(__dirname, '..');
var OUTPUT_DIR = path.join(ROOT, 'output');

var DEFAULT_OUTPUTS = {
  report: 'llm2-decision-loop-report.json',
  intentDsl: 'llm2-decision-loop.intent.dsl',
  contextRoute: 'llm2-decision-loop-context-route.json',
  providedContext: 'llm2-decision-loop-provided-context.json',
  semanticIterationMemory: 'semantic-iteration-memory.json',
};

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function writeJson(filePath, value) {
  writeText(filePath, JSON.stringify(value, null, 2));
}

function readJsonOutput(fileName) {
  return JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, fileName), 'utf8'));
}

function readOptionalJsonOutput(fileName) {
  var filePath = path.join(OUTPUT_DIR, fileName);
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
}

function assertSafeIntentText(text, label) {
  var hits = intentSurfaceGuard.detectProhibitedSurface(text || '');
  if (hits.length) {
    throw new Error(label + ' contains prohibited machine surface: ' + hits.map(function(hit) { return hit.id; }).join(', '));
  }
}

function assertNoMachineLeak(value, label) {
  var text = JSON.stringify(value || {});
  if (text.indexOf('"x"') >= 0 || text.indexOf('"y"') >= 0) {
    throw new Error(label + ' must not expose coordinates');
  }
  ['gdjs', 'componentId', 'bridgePlan', 'runtime adapter', 'adapter'].forEach(function(token) {
    if (text.indexOf(token) >= 0) throw new Error(label + ' must not expose ' + token);
  });
  var hits = intentSurfaceGuard.detectProhibitedSurface(text);
  if (hits.length) {
    throw new Error(label + ' contains prohibited machine surface: ' + hits.map(function(hit) { return hit.id; }).join(', '));
  }
}

function safeText(value, fallback) {
  var text = String(value || fallback || '').trim();
  if (!text) return null;
  if (intentSurfaceGuard.detectProhibitedSurface(text).length) return null;
  return text;
}

function safeIntentLines(lines) {
  return (lines || []).filter(function(line) {
    return !!safeText(line, null);
  });
}

function semanticHashFromIntentWorldView(view) {
  return safeText((((view || {}).contextCache || {}).targetSemanticHash), null);
}

function attachSemanticIterationMemory(intentWorldView, memory) {
  var view = clone(intentWorldView);
  if (!memory) return view;
  assertNoMachineLeak(memory, 'SemanticIterationMemory');
  var currentHash = semanticHashFromIntentWorldView(view);
  var memoryHash = safeText((((memory || {}).scope || {}).afterSemanticHash), null);
  if (!currentHash || !memoryHash || currentHash !== memoryHash) return view;
  view.semanticIterationMemory = memory;
  assertNoMachineLeak(view.semanticIterationMemory, 'IntentWorldView.semanticIterationMemory');
  return view;
}

function summarizeIssue(issue) {
  return {
    kind: safeText(issue.kind, 'semantic_issue'),
    experienceDimension: safeText(issue.dimension, null),
    gameplayRole: safeText(issue.gameplayRole, null),
    repairVerb: safeText(issue.repairVerb, null),
    meaning: safeText(issue.message, issue.kind),
  };
}

function buildNextSemanticFocus(remainingIssues, regressedMeasurements, improved) {
  if (regressedMeasurements.length) {
    return regressedMeasurements.map(function(measurement) {
      return 'repair regressed ' + measurement;
    });
  }
  if (remainingIssues.length) {
    return remainingIssues.map(function(issue) {
      return [
        issue.repairVerb || 'repair',
        issue.experienceDimension || issue.kind || 'semantic_issue',
        issue.gameplayRole ? 'for ' + issue.gameplayRole : '',
      ].filter(Boolean).join(' ');
    });
  }
  return improved
    ? ['keep improved gameplay feel unless the designer asks for another change']
    : ['request focused tick evidence before changing gameplay again'];
}

function dimensionsForMeasurement(mapping, measurementId) {
  var matches = [];
  Object.keys((mapping || {}).experienceDimensions || {}).sort().forEach(function(dimensionId) {
    var dimension = mapping.experienceDimensions[dimensionId] || {};
    if ((dimension.measurements || []).indexOf(measurementId) >= 0) {
      matches.push({
        dimensionId: dimensionId,
        dimension: dimension,
      });
    }
  });
  return matches;
}

function regressedIssuesFromMeasurements(measurements) {
  var mapping = semanticFeedback.loadSemanticMapping();
  var issues = [];
  (measurements || []).forEach(function(item) {
    if (!(item.status === 'worsened' || item.status === 'regressed')) return;
    dimensionsForMeasurement(mapping, item.measurement).forEach(function(match) {
      issues.push({
        kind: 'regressed_' + safeText(item.measurement, 'semantic_measurement'),
        experienceDimension: safeText(match.dimensionId, null),
        gameplayRole: safeText((match.dimension.roles || [])[0], null),
        repairVerb: safeText((match.dimension.repairVerbs || [])[0], null),
        measurement: safeText(item.measurement, null),
        meaning: 'Semantic metric regressed after the last applied Intent.',
      });
    });
  });
  return issues;
}

function uniqueSemanticIssues(issues) {
  var seen = {};
  return (issues || []).filter(function(issue) {
    var key = [
      issue.kind,
      issue.experienceDimension,
      issue.gameplayRole,
      issue.repairVerb,
      issue.measurement,
    ].map(function(value) { return value || ''; }).join('|');
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function buildSemanticIterationMemory(args) {
  args = args || {};
  var comparison = args.improvementComparison || {};
  var measurements = (comparison.measurements || []).map(function(item) {
    return {
      measurement: safeText(item.measurement, 'unknown_measurement'),
      status: safeText(item.status, 'unknown'),
      before: item.before === undefined ? null : item.before,
      after: item.after === undefined ? null : item.after,
      direction: safeText(item.direction || item.improvement, null),
    };
  });
  var improvedMeasurements = measurements.filter(function(item) {
    return item.status === 'improved';
  }).map(function(item) { return item.measurement; });
  var regressedMeasurements = measurements.filter(function(item) {
    return item.status === 'worsened' || item.status === 'regressed';
  }).map(function(item) { return item.measurement; });
  var remainingIssues = uniqueSemanticIssues(
    (((args.afterSemanticPlaytestReport || {}).llmReport || {}).tickIssues || []).map(summarizeIssue)
      .concat(regressedIssuesFromMeasurements(measurements))
  );
  var memory = {
    schemaVersion: 1,
    owner: 'SemanticIterationMemory',
    contextKind: 'semantic-iteration-memory',
    gameplayFirst: true,
    sceneMode: 'single-scene',
    aiFirstNaming: 'experience_dimension -> gameplay_role -> repair_verb -> safe_intent',
    scope: {
      beforeSemanticHash: semanticHashFromIntentWorldView(args.beforeIntentWorldView),
      afterSemanticHash: semanticHashFromIntentWorldView(args.afterIntentWorldView),
    },
    latest: {
      userGoal: safeText(args.userRequest, 'continue gameplay iteration'),
      decisionType: safeText(args.decisionType, 'unknown'),
      appliedIntentDslLines: safeIntentLines(args.intentDslLines),
      improved: !!comparison.improved,
      regressed: !!comparison.regressed,
      improvedMeasurements: improvedMeasurements,
      regressedMeasurements: regressedMeasurements,
      remainingIssues: remainingIssues,
      nextSemanticFocus: buildNextSemanticFocus(remainingIssues, regressedMeasurements, !!comparison.improved),
    },
    evidence: {
      view: safeText(comparison.view, 'semantic-tick-improvement-comparison'),
      measurements: measurements,
      summary: clone(comparison.summary || {}),
    },
  };
  assertNoMachineLeak(memory, 'SemanticIterationMemory');
  return memory;
}

function runNode(args, label) {
  var result = childProcess.spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(label + ' failed\nSTDOUT:\n' + result.stdout + '\nSTDERR:\n' + result.stderr);
  }
  return {
    label: label,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function loadCurrentLoopInputs(options) {
  options = options || {};
  var semanticPlaytestReport = options.semanticPlaytestReport || readOptionalJsonOutput('semantic-playtest-report.json');
  var intentWorldView = options.intentWorldView || readOptionalJsonOutput('intent-world-view.json');
  if (!intentWorldView) throw new Error('LLM2 Decision Loop requires IntentWorldView');
  var semanticIterationMemory = options.semanticIterationMemory || readOptionalJsonOutput('semantic-iteration-memory.json');
  intentWorldView = attachSemanticIterationMemory(intentWorldView, semanticIterationMemory);
  var tickReport = options.tickReport || (semanticPlaytestReport && semanticPlaytestReport.tickReport) || null;
  return {
    semanticPlaytestReport: semanticPlaytestReport,
    intentWorldView: intentWorldView,
    tickReport: tickReport,
    semanticIterationMemory: semanticIterationMemory,
  };
}

function writeLoopArtifacts(outputs, route, providedContext, intentDslText, report) {
  writeJson(path.join(OUTPUT_DIR, outputs.contextRoute), route);
  writeJson(path.join(OUTPUT_DIR, outputs.providedContext), providedContext || {
    owner: 'LLM2ContextProvider',
    skipped: true,
    reason: 'Decision did not request additional context.',
  });
  writeText(path.join(OUTPUT_DIR, outputs.intentDsl), intentDslText || '');
  writeJson(path.join(OUTPUT_DIR, outputs.report), report);
}

function executeIntentArtifact(intentDslText, outputs, options) {
  if (!intentDslText.trim()) return null;
  assertSafeIntentText(intentDslText, 'LLM2 Decision Loop Intent DSL');
  return runNode([
    'ai/pipeline.js',
    '--continue',
    '--intent-fixture-file',
    path.relative(ROOT, path.join(OUTPUT_DIR, outputs.intentDsl)),
    '--batch-label',
    options.batchLabel || 'llm2_decision_loop',
  ], 'LLM2 Decision Loop pipeline continue');
}

function runDecisionPass(inputs, route, options, resolvedContext) {
  var decision = llm2DecisionRuntime.runDecisionRuntime({
    intentWorldView: inputs.intentWorldView,
    contextRoute: route,
    userRequest: options.userRequest,
    currentRequest: options.currentRequest,
    projectMode: options.projectMode || 'continue',
    resolvedContext: resolvedContext,
  });
  llm2DecisionRuntime.assertVerifiedDecision(decision);
  return decision;
}

function resolveCacheHitThreshold(options) {
  return options.cacheHitThreshold === undefined ? 0.9 : options.cacheHitThreshold;
}

async function runDecisionPassAsync(inputs, route, options, resolvedContext, providerTrace) {
  if (options.decisionProvider === 'deepseek') {
    var provider = options.deepseekDecisionProvider || llm2DeepSeekDecisionProvider.runDeepSeekDecisionProvider;
    var providerResult = await provider({
      intentWorldView: inputs.intentWorldView,
      contextRoute: route,
      userRequest: options.userRequest,
      currentRequest: options.currentRequest,
      projectMode: options.projectMode || 'continue',
      resolvedContext: resolvedContext,
      threshold: resolveCacheHitThreshold(options),
      endpoint: options.endpoint,
      apiKey: options.apiKey,
      model: options.model,
      fetchImpl: options.fetchImpl,
    });
    providerTrace.push(providerResult);
    if (providerResult.cacheGate && !providerResult.cacheGate.passed) {
      throw new Error('LLM2 DeepSeek cache gate failed: hitRate=' + providerResult.cacheGate.hitRate + ' threshold=' + providerResult.cacheGate.threshold);
    }
    llm2DecisionRuntime.assertVerifiedDecision(providerResult.decision);
    return providerResult.decision;
  }
  return runDecisionPass(inputs, route, options, resolvedContext);
}

function summarizeProviderTrace(providerTrace) {
  providerTrace = providerTrace || [];
  var hotTrace = providerTrace.filter(function(item) {
    return item && item.cacheGate && item.cacheGate.hasUsage;
  });
  if (!hotTrace.length) {
    return {
      provider: null,
      cacheGatePassed: null,
      cacheHitRate: null,
      providerTraceCount: providerTrace.length,
    };
  }
  var totalCached = 0;
  var totalMeasured = 0;
  var passed = true;
  hotTrace.forEach(function(item) {
    var usage = (item.cacheGate && item.cacheGate.usage) || {};
    totalCached += Number(usage.cachedTokens || 0);
    totalMeasured += Number(usage.measuredTokens || usage.inputTokens || 0);
    if (!item.cacheGate.passed) passed = false;
  });
  return {
    provider: providerTrace[0] && providerTrace[0].owner,
    cacheGatePassed: passed,
    cacheHitRate: totalMeasured ? Number((totalCached / totalMeasured).toFixed(4)) : 0,
    providerTraceCount: providerTrace.length,
  };
}

function compareLoopImprovement(beforeSummary, afterSummary, semanticPlaytestReport) {
  if (!beforeSummary || !afterSummary) {
    return {
      owner: 'LLM2DecisionLoopRunner',
      view: 'semantic-tick-improvement-comparison',
      measurements: [],
      improved: false,
      regressed: false,
      summary: { compared: 0, improved: 0, worsened: 0, unchanged: 0, missing: 0 },
    };
  }
  return semanticFeedback.compareSemanticTickSummaries({
    beforeSummary: beforeSummary,
    afterSummary: afterSummary,
    issues: (((semanticPlaytestReport || {}).llmReport || {}).tickIssues) || [],
  });
}

function runDecisionLoop(options) {
  options = options || {};
  ensureOutputDir();
  var outputs = Object.assign({}, DEFAULT_OUTPUTS, options.outputs || {});
  var inputs = loadCurrentLoopInputs(options);
  var userRequest = options.userRequest || options.currentRequest || '再看一下';
  var route = llm2ContextCacheRouter.routeLlm2Context({
    projectWorld: options.projectWorld,
    intentWorldView: inputs.intentWorldView,
    semanticHash: options.semanticHash,
    userRequest: userRequest,
    currentRequest: options.currentRequest,
    projectMode: options.projectMode || 'continue',
    consecutiveFailureCount: options.consecutiveFailureCount || 0,
    hasStablePrefix: options.hasStablePrefix,
  });

  var firstDecision = runDecisionPass(inputs, route, Object.assign({}, options, { userRequest: userRequest }), options.resolvedContext || null);
  var providedContext = options.resolvedContext || null;
  var finalDecision = firstDecision;

  if (firstDecision.decisionType === 'request_context') {
    providedContext = llm2ContextProvider.provideContext({
      requestedContext: firstDecision.requestedContext,
      intentWorldView: inputs.intentWorldView,
      tickReport: inputs.tickReport,
      semanticPlaytestReport: inputs.semanticPlaytestReport,
    });
    finalDecision = runDecisionPass(inputs, route, Object.assign({}, options, { userRequest: userRequest }), providedContext);
  }

  var intentDslLines = finalDecision.decisionType === 'apply_intent' ? finalDecision.intentDslLines : [];
  var intentDslText = intentDslLines.join('\n') + (intentDslLines.length ? '\n' : '');
  var execution = null;
  var after = null;
  var execute = options.execute !== false;
  var skippedReason = null;

  if (finalDecision.decisionType === 'apply_intent' && execute) {
    writeText(path.join(OUTPUT_DIR, outputs.intentDsl), intentDslText);
    execution = executeIntentArtifact(intentDslText, outputs, options);
    after = {
      semanticPlaytestReport: readJsonOutput('semantic-playtest-report.json'),
      intentWorldView: readJsonOutput('intent-world-view.json'),
    };
  } else if (finalDecision.decisionType !== 'apply_intent') {
    skippedReason = 'Decision type ' + finalDecision.decisionType + ' does not execute gameplay Intent.';
  } else {
    skippedReason = 'Execution disabled by caller.';
  }

  var beforeSummary = inputs.semanticPlaytestReport && inputs.semanticPlaytestReport.tickReport ? inputs.semanticPlaytestReport.tickReport.summary : null;
  var afterSummary = after && after.semanticPlaytestReport && after.semanticPlaytestReport.tickReport ? after.semanticPlaytestReport.tickReport.summary : null;
  var improvementComparison = compareLoopImprovement(beforeSummary, afterSummary, inputs.semanticPlaytestReport);
  var improved = improvementComparison.improved;
  var semanticIterationMemory = after ? buildSemanticIterationMemory({
    userRequest: userRequest,
    decisionType: finalDecision.decisionType,
    intentDslLines: intentDslLines,
    improvementComparison: improvementComparison,
    beforeIntentWorldView: inputs.intentWorldView,
    afterIntentWorldView: after.intentWorldView,
    afterSemanticPlaytestReport: after.semanticPlaytestReport,
  }) : null;

  var report = {
    schemaVersion: LLM2_DECISION_LOOP_SCHEMA_VERSION,
    owner: 'LLM2DecisionLoopRunner',
    mode: 'deterministic-mock-decision-loop',
    input: {
      userRequest: userRequest,
      execute: execute,
    },
    before: {
      semanticSummary: beforeSummary,
      intentWorldView: inputs.intentWorldView,
    },
    contextRoute: route,
    firstDecision: firstDecision,
    providedContext: providedContext,
    finalDecision: finalDecision,
    decisionProviderTrace: [],
    intentDslText: intentDslText,
    execution: execution ? {
      command: execution.label,
      stdout: execution.stdout,
      stderr: execution.stderr,
    } : null,
    after: after ? {
      semanticSummary: afterSummary,
      intentWorldView: after.intentWorldView,
    } : null,
    improvementComparison: improvementComparison,
    semanticIterationMemory: semanticIterationMemory,
    summary: {
      nextAction: finalDecision.decisionType === 'apply_intent'
        ? (execution ? (improved || !beforeSummary || !afterSummary ? 'done' : 'needs_iteration') : 'ready_to_execute')
        : finalDecision.decisionType,
      decisionType: finalDecision.decisionType,
      contextRequested: firstDecision.decisionType === 'request_context',
      executed: !!execution,
      skippedReason: skippedReason,
      improved: improved,
      cacheGatePassed: null,
      cacheHitRate: null,
    },
  };

  if (semanticIterationMemory) {
    writeJson(path.join(OUTPUT_DIR, outputs.semanticIterationMemory), semanticIterationMemory);
  }
  writeLoopArtifacts(outputs, route, providedContext, intentDslText, report);
  return report;
}

async function runDecisionLoopAsync(options) {
  options = options || {};
  ensureOutputDir();
  var outputs = Object.assign({}, DEFAULT_OUTPUTS, options.outputs || {});
  var inputs = loadCurrentLoopInputs(options);
  var userRequest = options.userRequest || options.currentRequest || '再看一下';
  var route = llm2ContextCacheRouter.routeLlm2Context({
    projectWorld: options.projectWorld,
    intentWorldView: inputs.intentWorldView,
    semanticHash: options.semanticHash,
    userRequest: userRequest,
    currentRequest: options.currentRequest,
    projectMode: options.projectMode || 'continue',
    consecutiveFailureCount: options.consecutiveFailureCount || 0,
    hasStablePrefix: options.hasStablePrefix,
  });
  var providerTrace = [];
  var passOptions = Object.assign({}, options, { userRequest: userRequest });

  var firstDecision = await runDecisionPassAsync(inputs, route, passOptions, options.resolvedContext || null, providerTrace);
  var providedContext = options.resolvedContext || null;
  var finalDecision = firstDecision;

  if (firstDecision.decisionType === 'request_context') {
    providedContext = llm2ContextProvider.provideContext({
      requestedContext: firstDecision.requestedContext,
      intentWorldView: inputs.intentWorldView,
      tickReport: inputs.tickReport,
      semanticPlaytestReport: inputs.semanticPlaytestReport,
    });
    finalDecision = await runDecisionPassAsync(inputs, route, passOptions, providedContext, providerTrace);
  }

  var intentDslLines = finalDecision.decisionType === 'apply_intent' ? finalDecision.intentDslLines : [];
  var intentDslText = intentDslLines.join('\n') + (intentDslLines.length ? '\n' : '');
  var execution = null;
  var after = null;
  var execute = options.execute !== false;
  var skippedReason = null;

  if (finalDecision.decisionType === 'apply_intent' && execute) {
    writeText(path.join(OUTPUT_DIR, outputs.intentDsl), intentDslText);
    execution = executeIntentArtifact(intentDslText, outputs, options);
    after = {
      semanticPlaytestReport: readJsonOutput('semantic-playtest-report.json'),
      intentWorldView: readJsonOutput('intent-world-view.json'),
    };
  } else if (finalDecision.decisionType !== 'apply_intent') {
    skippedReason = 'Decision type ' + finalDecision.decisionType + ' does not execute gameplay Intent.';
  } else {
    skippedReason = 'Execution disabled by caller.';
  }

  var beforeSummary = inputs.semanticPlaytestReport && inputs.semanticPlaytestReport.tickReport ? inputs.semanticPlaytestReport.tickReport.summary : null;
  var afterSummary = after && after.semanticPlaytestReport && after.semanticPlaytestReport.tickReport ? after.semanticPlaytestReport.tickReport.summary : null;
  var improvementComparison = compareLoopImprovement(beforeSummary, afterSummary, inputs.semanticPlaytestReport);
  var improved = improvementComparison.improved;
  var providerSummary = summarizeProviderTrace(providerTrace);
  var semanticIterationMemory = after ? buildSemanticIterationMemory({
    userRequest: userRequest,
    decisionType: finalDecision.decisionType,
    intentDslLines: intentDslLines,
    improvementComparison: improvementComparison,
    beforeIntentWorldView: inputs.intentWorldView,
    afterIntentWorldView: after.intentWorldView,
    afterSemanticPlaytestReport: after.semanticPlaytestReport,
  }) : null;

  var report = {
    schemaVersion: LLM2_DECISION_LOOP_SCHEMA_VERSION,
    owner: 'LLM2DecisionLoopRunner',
    mode: options.decisionProvider === 'deepseek' ? 'deepseek-decision-loop' : 'deterministic-mock-decision-loop',
    input: {
      userRequest: userRequest,
      execute: execute,
      decisionProvider: options.decisionProvider || 'mock',
      cacheHitThreshold: resolveCacheHitThreshold(options),
    },
    before: {
      semanticSummary: beforeSummary,
      intentWorldView: inputs.intentWorldView,
    },
    contextRoute: route,
    firstDecision: firstDecision,
    providedContext: providedContext,
    finalDecision: finalDecision,
    decisionProviderTrace: providerTrace.map(function(item) {
      return {
        owner: item.owner,
        provider: item.provider,
        input: item.input,
        rawText: item.rawText,
        usage: item.usage,
        cacheGate: item.cacheGate,
        summary: item.summary,
        decision: item.decision,
      };
    }),
    intentDslText: intentDslText,
    execution: execution ? {
      command: execution.label,
      stdout: execution.stdout,
      stderr: execution.stderr,
    } : null,
    after: after ? {
      semanticSummary: afterSummary,
      intentWorldView: after.intentWorldView,
    } : null,
    improvementComparison: improvementComparison,
    semanticIterationMemory: semanticIterationMemory,
    summary: {
      nextAction: finalDecision.decisionType === 'apply_intent'
        ? (execution ? (improved || !beforeSummary || !afterSummary ? 'done' : 'needs_iteration') : 'ready_to_execute')
        : finalDecision.decisionType,
      decisionType: finalDecision.decisionType,
      contextRequested: firstDecision.decisionType === 'request_context',
      executed: !!execution,
      skippedReason: skippedReason,
      improved: improved,
      provider: providerSummary.provider,
      providerTraceCount: providerSummary.providerTraceCount,
      cacheGatePassed: providerSummary.cacheGatePassed,
      cacheHitRate: providerSummary.cacheHitRate,
    },
  };

  if (semanticIterationMemory) {
    writeJson(path.join(OUTPUT_DIR, outputs.semanticIterationMemory), semanticIterationMemory);
  }
  writeLoopArtifacts(outputs, route, providedContext, intentDslText, report);
  return report;
}

function main() {
  var userRequest = process.argv.slice(2).join(' ').trim() || '再看一下';
  var report = runDecisionLoop({ userRequest: userRequest });
  console.log('[LLM2DecisionLoop] ' + report.summary.nextAction + ' decision=' + report.summary.decisionType + ' executed=' + report.summary.executed);
}

if (require.main === module) {
  main();
}

module.exports = {
  LLM2_DECISION_LOOP_SCHEMA_VERSION: LLM2_DECISION_LOOP_SCHEMA_VERSION,
  runDecisionLoop: runDecisionLoop,
  runDecisionLoopAsync: runDecisionLoopAsync,
  loadCurrentLoopInputs: loadCurrentLoopInputs,
  buildSemanticIterationMemory: buildSemanticIterationMemory,
};
