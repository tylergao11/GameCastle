var agentWorkflow = require('./agent-workflow');
var componentCatalog = require('./component-catalog');
var diagnosticRouter = require('./intent-diagnostic-router');
var intentSurfaceGuard = require('./intent-surface-guard');
var projectWorld = require('./project-world');
var semanticFeedback = require('./semantic-feedback');
var intentSlots = require('./intent-slots');
var creativeAgent = require('./creative-agent');
var writeContract = require('./intent-write-contract');

function buildIntentComponentReference(catalog) {
  catalog = catalog || componentCatalog.loadComponentCatalog();
  return catalog.components.filter(function(component) {
    return componentCatalog.isLlm2Exposed(component);
  }).map(function(component) {
    var ai = component.aiManifest || {};
    var name = sanitizeIntentTextField(component.name);
    if (!name) return null;
    return {
      name: name,
      kind: sanitizeIntentTextField(component.kind),
      summary: sanitizeIntentTextField(ai.summary),
      aliases: sanitizeIntentTextList(ai.aliases),
      actions: sanitizeIntentTextList(ai.actions)
    };
  }).filter(Boolean);
}

function buildIntentCapabilityReference(productModuleCatalog) {
  return productModuleCatalog.modules.map(function(manifest) {
    var name = sanitizeIntentTextField(manifest.name);
    if (!name) return null;
    return {
      name: name,
      summary: sanitizeIntentTextField(manifest.summary)
    };
  }).filter(Boolean);
}

function withoutPromptExamples(value) {
  if (Array.isArray(value)) return value.map(withoutPromptExamples);
  if (!value || typeof value !== 'object') return value;
  var result = {};
  Object.keys(value).forEach(function(key) {
    if (/example|template/i.test(key)) return;
    result[key] = withoutPromptExamples(value[key]);
  });
  return result;
}

function compactList(list, mapper) {
  return (list || []).map(mapper).filter(Boolean);
}

function sanitizeIntentTextField(value) {
  if (value === undefined || value === null) return null;
  var text = String(value).trim();
  if (!text) return null;
  if (intentSurfaceGuard.detectProhibitedSurface(text).length) return null;
  return text;
}

function sanitizeIntentTextList(list) {
  return compactList(list, sanitizeIntentTextField);
}

function sanitizeUserPromptForIntentPrompt(text) {
  var omitted = 0;
  var lines = String(text || '').split(/\r?\n/).map(function(line) {
    line = String(line || '').trim();
    if (!line) return null;
    if (intentSurfaceGuard.detectProhibitedSurface(line).length) {
      omitted++;
      return null;
    }
    return line;
  }).filter(Boolean);
  if (lines.length) return lines.join('\n');
  return omitted ? '[original user request omitted because it contained prohibited machine syntax]' : '';
}

function sanitizeErrorForIntentPrompt(error) {
  var text = String(error && error.message || error || '');
  if (!text) return '';
  return text.split(/\r?\n/).map(function(line) {
    line = String(line || '').trim();
    if (!line) return null;
    if (intentSurfaceGuard.detectProhibitedSurface(line).length) {
      return '[compiler error detail omitted because it contained prohibited machine syntax]';
    }
    return line;
  }).filter(Boolean).join('\n');
}

function sanitizePreviousIntentSlotPacketForRepair(text) {
  try {
    return JSON.stringify(intentSlots.parseSlotPacket(text));
  } catch (_error) {
    return '[invalid previous slot packet omitted]';
  }
}

function sanitizeCreativeVisionForIntentPrompt(vision) {
  if (vision === undefined || vision === null) return null;
  try {
    var order = creativeAgent.parseDirectorOrder(String(vision));
    return JSON.stringify({
      game_mode: String(order.template_selection).replace(/_/g, ' '),
      game_definition: order.game_definition,
      play_plan: order.play_plan,
      placement_plan: order.placement_plan,
      control_plan: order.control_plan,
      win_condition: order.win_condition,
    });
  } catch (_error) {
    return '[director order unavailable]';
  }
}

function sanitizeCreativeChangeForIntentPrompt(change) {
  if (!change) return null;
  return {
    isNew: change.isNew === true,
    changed: change.changed !== false,
    previousVision: sanitizeCreativeVisionForIntentPrompt(change.previousVision),
    currentVision: sanitizeCreativeVisionForIntentPrompt(change.currentVision),
  };
}

function sanitizeProjectWorldForIntentPrompt(world) {
  return projectWorld.sanitizeProjectWorldForIntentPrompt(world);
}

function sanitizeExecutionSummaryForIntentPrompt(summary) {
  return projectWorld.sanitizeExecutionSummaryForIntentPrompt(summary);
}

function sanitizeExecutionReportForIntentPrompt(report) {
  return projectWorld.sanitizeExecutionReportForIntentPrompt(report);
}

function sanitizeIntentWorldContext(worldContext) {
  worldContext = worldContext || {};
  return {
    projectWorld: sanitizeProjectWorldForIntentPrompt(worldContext.projectWorld),
    lastExecutionReport: sanitizeExecutionReportForIntentPrompt(worldContext.lastExecutionReport),
    semanticMapping: { view: 'semantic-word-dictionary', llm2WriteContract: writeContract.llmView('mobile platformer') }
  };
}

function buildIntentCommanderSystemPrompt(productModuleCatalog, componentCatalogInstance) {
  return [
    'You are GameCastle Intent Slot Director.',
    'Translate the LLM1 director order by selecting command kinds and filling declared slots.',
    'A deterministic renderer converts the completed slots into Intent DSL.',
    'Return one valid JSON packet containing the completed contract.',
    '',
    'Packet contract:',
    '- Top-level fields: schemaVersion with numeric value 1; commands as an array.',
    '- Every command contains kind and slots.',
    '- make_game.description carries the natural genre and core play experience.',
    '- The writable slot contract lists the command kinds and slot values for this game mode.',
    '',
    'Game capability cards for semantic selection:',
    JSON.stringify(buildIntentCapabilityReference(productModuleCatalog), null, 2),
    '',
    'Writable slot contract:',
    JSON.stringify(writeContract.llmView('mobile platformer'), null, 2),
    '',
    'Rules:',
    '- Select the minimum command set needed for the requested change.',
    '- Read game_mode from the LLM1 director order and express that selected game mode through make_game.description.',
    '- The writable slot contract is the canonical source for every value written into the packet.',
    '- The platformer template defaults are already present; placement and controls express this round’s gameplay changes.',
    '- Use writable commands to express pressure through existing enemy placement when the template provides enemies.',
    '- Fill declared command kinds and slot names with values from the writable slot contract.',
    '- The response surface is the JSON contract fields described above.',
  ].join('\n');
}

function buildIntentUserPrompt(options) {
  var safeWorldContext = sanitizeIntentWorldContext(options.worldContext);
  var safeCreativeVision = sanitizeCreativeVisionForIntentPrompt(options.creativeVision);
  var safeCreativeChange = sanitizeCreativeChangeForIntentPrompt(options.creativeChange);
  var safeUserPrompt = sanitizeUserPromptForIntentPrompt(options.userPrompt);
  return [
    'Original user request:',
    safeUserPrompt,
    '',
    'Current world context for Intent planning. This is a sanitized game-world card, not engine internals:',
    JSON.stringify(safeWorldContext, null, 2),
    '',
    'LLM1 director order:',
    safeCreativeVision,
    '',
    'Creative vision change context:',
    JSON.stringify(safeCreativeChange, null, 2),
    '',
    options.isNew
      ? 'Task: fill the Intent slot packet for the first playable version.'
      : 'Task: fill the Intent slot commands needed for this iteration.',
    '',
    'Return the slot packet defined by the system contract.',
  ].join('\n');
}

function buildIntentCompileRepairPrompt(options) {
  var safeWorldContext = sanitizeIntentWorldContext(options.worldContext);
  var safePreviousSlotPacket = sanitizePreviousIntentSlotPacketForRepair(options.intentSlotText);
  var safeCreativeVision = sanitizeCreativeVisionForIntentPrompt(options.creativeVision);
  var safeUserPrompt = sanitizeUserPromptForIntentPrompt(options.userPrompt);
  var safeError = sanitizeErrorForIntentPrompt(options.error);
  return [
    'The rendered result from the previous slot packet failed validation.',
    'Update slot selection or slot values while the deterministic renderer handles DSL generation.',
    '',
    'Original user prompt:',
    safeUserPrompt,
    '',
    'LLM1 director order:',
    safeCreativeVision,
    '',
    'Current world context for Intent repair. This is a sanitized game-world card, not engine internals:',
    JSON.stringify(safeWorldContext, null, 2),
    '',
    'Compiler error:',
    safeError,
    '',
    'Previous slot packet:',
    safePreviousSlotPacket,
    '',
    'Rules:',
    '- Return a corrected slot packet.',
    '- Select from the declared command kinds and slot names.',
    '- Fill values from the declared slot domains.',
  ].join('\n');
}

function makeIntentDiagnosticsError(diagnostics, decision) {
  var error = new Error('Intent compile produced blocking diagnostics: ' + decision.nextAction + '\n' + diagnosticRouter.describeDiagnostics(diagnostics));
  error.name = 'IntentCompileDiagnosticsError';
  error.intentDiagnostics = diagnostics;
  error.diagnosticDecision = decision;
  error.nonRepairableByLlm = decision.nextAction === 'route-to-owner';
  return error;
}

function assertIntentCompileDiagnostics(compiled) {
  var diagnostics = []
    .concat((compiled.graph && compiled.graph.diagnostics) || [])
    .concat((compiled.placementPlan && compiled.placementPlan.diagnostics) || [])
    .concat((compiled.bridgePlan && compiled.bridgePlan.diagnostics) || []);
  if (!diagnostics.length) return compiled;
  var decision = diagnosticRouter.classifyDiagnostics(diagnostics);
  if (decision.nextAction !== 'done') {
    throw makeIntentDiagnosticsError(diagnostics, decision);
  }
  return compiled;
}

async function compileIntentSlotsWithRepair(options) {
  var intentSlotText = String(options.intentSlotText || '').trim();
  var intentDslText = null;
  var intentSlotPacket = null;
  if (!intentSlotText) throw new Error('Intent slot packet is required.');
  for (var attempt = 0; attempt <= options.maxRepairRounds; attempt++) {
    try {
      var rendered = intentSlots.renderSlotPacket(intentSlotText);
      intentSlotPacket = rendered.packet;
      intentDslText = rendered.intentDslText;
      var compiled = options.intentCompiler.compileIntentDsl(intentDslText, {
        placementContext: options.placementContext,
        componentCatalog: options.componentCatalog,
        productModuleCatalog: options.productModuleCatalog,
        baseWorld: options.projectWorld,
        moduleCompileOptions: {
          baseModules: options.baseModules,
          projectWorld: options.projectWorld
        }
      });
      assertIntentCompileDiagnostics(compiled);
      if (options.onAttempt) options.onAttempt({ attempt: attempt, status: 'passed', intentSlotText: intentSlotText, intentDslText: intentDslText });
      return {
        intentDslText: intentDslText,
        intentSlotText: intentSlotText,
        intentSlotPacket: intentSlotPacket,
        compiled: compiled,
      };
    } catch (e) {
      if (options.onAttempt) options.onAttempt({ attempt: attempt, status: 'failed', intentSlotText: intentSlotText, error: e });
      if (e.nonRepairableByLlm) throw e;
      if (!options.allowLlmRepair || attempt >= options.maxRepairRounds) throw e;
      console.log('[IntentCompile] repair round ' + (attempt + 1) + '/' + options.maxRepairRounds + ': ' + e.message);
      var repairPrompt = buildIntentCompileRepairPrompt({
        userPrompt: options.userPrompt,
        creativeVision: options.creativeVision,
        worldContext: options.worldContext,
        error: e,
        intentSlotText: intentSlotText,
      });
      var repaired = await options.callModel(
        repairPrompt,
        options.llm2SystemPrompt,
        agentWorkflow.buildTextCallOptions('intentRepair', { label: 'LLM2-IntentRepair' })
      );
      intentSlotText = String(repaired || '').trim();
      if (options.onAttempt) options.onAttempt({ attempt: attempt + 1, status: 'repair-received', intentSlotText: intentSlotText });
      if (!intentSlotText) throw new Error('LLM2 returned an empty Intent slot repair');
      intentDslText = intentSlots.renderSlotPacket(intentSlotText).intentDslText;
    }
  }
  throw new Error('Intent DSL compile repair loop exhausted');
}

module.exports = {
  buildIntentCommanderSystemPrompt: buildIntentCommanderSystemPrompt,
  buildIntentUserPrompt: buildIntentUserPrompt,
  sanitizeIntentWorldContext: sanitizeIntentWorldContext,
  sanitizeCreativeVisionForIntentPrompt: sanitizeCreativeVisionForIntentPrompt,
  sanitizeCreativeChangeForIntentPrompt: sanitizeCreativeChangeForIntentPrompt,
  sanitizePreviousIntentSlotPacketForRepair: sanitizePreviousIntentSlotPacketForRepair,
  sanitizeUserPromptForIntentPrompt: sanitizeUserPromptForIntentPrompt,
  sanitizeErrorForIntentPrompt: sanitizeErrorForIntentPrompt,
  sanitizeExecutionSummaryForIntentPrompt: sanitizeExecutionSummaryForIntentPrompt,
  renderIntentSlotPacket: intentSlots.renderSlotPacket,
  compileIntentSlotsWithRepair: compileIntentSlotsWithRepair,
};
