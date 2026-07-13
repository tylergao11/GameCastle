/*
 * The only natural-language SemanticPort for ProjectWeave.
 * It owns LLM1 creative direction and LLM2 closed-slot compilation; it never
 * writes a project, assets, or release artifacts.
 */
var agentWorkflow = require('./agent-workflow');
var creativeAgent = require('./creative-agent');
var intentAgent = require('./intent-agent');
var llmProvider = require('./llm-provider');
var intentCompiler = require('./intent-compiler');
var moduleCompiler = require('./module-compiler');
var placementContext = require('./placement-context');

var PRODUCT_MODULES_DIR = require('path').join(__dirname, 'product-modules');
var MAX_REPAIR_ROUNDS = 2;

function makeCreativeVisionChange(previousVision, currentVision) {
  var previous = previousVision === undefined || previousVision === null ? null : String(previousVision).trim();
  var current = currentVision === undefined || currentVision === null ? '' : String(currentVision).trim();
  return { isNew: !previous, changed: previous !== current, previousVision: previous, currentVision: current };
}

function callModel(prompt, systemPrompt, options) {
  return llmProvider.callTextModel(prompt, systemPrompt, options);
}

async function compile(request, previousWorld) {
  var catalog = moduleCompiler.loadProductModuleCatalog(PRODUCT_MODULES_DIR);
  var previousSession = request.previousSemanticSession || {};
  var previousVision = previousSession.creativeVision || null;
  var history = Array.isArray(previousSession.history) ? previousSession.history.slice() : [];
  var creativeVision = await creativeAgent.generateDirectorOrder({
    userPrompt: request.naturalIntent,
    history: history,
    previousVision: previousVision,
    productModuleCatalog: catalog,
    callModel: callModel,
  });
  if (!creativeVision) throw new Error('LLM1_CREATIVE_VISION_UNAVAILABLE');

  var creativeChange = makeCreativeVisionChange(previousVision, creativeVision);
  var llm2SystemPrompt = intentAgent.buildIntentCommanderSystemPrompt(catalog);
  var worldContext = { projectWorld: previousWorld || null, lastExecutionReport: request.previousExecutionReport || null };
  var prompt = intentAgent.buildIntentUserPrompt({
    userPrompt: request.naturalIntent,
    worldContext: worldContext,
    creativeVision: creativeVision,
    creativeChange: creativeChange,
    isNew: creativeChange.isNew || !previousVision,
  });
  var slotText = await callModel(prompt, llm2SystemPrompt, agentWorkflow.buildTextCallOptions('intent', { label: 'LLM2-Intent' }));
  if (!slotText) throw new Error('LLM2_INTENT_SLOT_UNAVAILABLE');
  var compiled = await intentAgent.compileIntentSlotsWithRepair({
    intentSlotText: slotText,
    intentCompiler: intentCompiler,
    productModuleCatalog: catalog,
    baseModules: (previousWorld && previousWorld.modules) || [],
    projectWorld: previousWorld || null,
    placementContext: placementContext.contextFromProjectWorld(previousWorld || null),
    maxRepairRounds: MAX_REPAIR_ROUNDS,
    allowLlmRepair: true,
    llm2SystemPrompt: llm2SystemPrompt,
    userPrompt: request.naturalIntent,
    creativeVision: creativeVision,
    worldContext: worldContext,
    callModel: callModel,
  });
  history.push({ role: 'user', content: request.naturalIntent });
  history.push({ role: 'assistant', content: creativeVision });
  return {
    intentDslText: compiled.intentDslText,
    intentGraph: compiled.compiled.graph,
    placementPlan: compiled.compiled.placementPlan,
    bridgePlan: compiled.compiled.bridgePlan,
    intentContracts: compiled.compiled.contracts,
    compileResultCard: compiled.compiled.resultCard,
    runtimeAdapterRequirements: compiled.compiled.bridgePlan.runtimeAdapterRequirements,
    semanticSession: { creativeVision: creativeVision, history: history, creativeChange: creativeChange }
  };
}

module.exports = { compile: compile, makeCreativeVisionChange: makeCreativeVisionChange };
