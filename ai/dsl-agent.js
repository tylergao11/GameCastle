var agentWorkflow = require('./agent-workflow');
var componentCatalog = require('./component-catalog');
var diagnosticRouter = require('./intent-diagnostic-router');

function cleanDslOutput(text) {
  text = String(text || '').trim();
  var fence = text.match(/^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1].trim();
  return text;
}

function buildModuleCommanderSystemPrompt(productModuleCatalog, moduleCompiler) {
  return [
    'You are GameCastle Module Patch Commander.',
    'Compile LLM1 creative intent into product Module DSL patches.',
    'Do not output low-level object/event DSL, JSON, Markdown, explanations, or project.json.',
    'Prefer coarse product modules. Do not expose micro-module internals to the user or to LLM1.',
    '',
    moduleCompiler.buildModuleDslReference(productModuleCatalog),
    '',
    'Rules:',
    '- For a new game, install the minimum product modules needed for a playable first version.',
    '- For iteration, install only missing product modules needed by the requested change.',
    '- Do not reinstall modules already present in ProjectWorld.modules; use configure module for supported installed-module parameters.',
    '- Include sync, authority, tickRate, and seed when the choice matters.',
    '- Output only Module DSL lines.',
  ].join('\n');
}

function buildIntentComponentReference(catalog) {
  catalog = catalog || componentCatalog.loadComponentCatalog();
  return catalog.components.filter(function(component) {
    var compiler = component.compilerManifest || {};
    var ai = component.aiManifest || {};
    return !compiler.abstract && ai.exposeToLlm2 !== false;
  }).map(function(component) {
    var ai = component.aiManifest || {};
    return {
      name: component.name,
      kind: component.kind,
      summary: ai.summary,
      aliases: ai.aliases || [],
      actions: ai.actions || [],
      safeExamples: ai.safeExamples || []
    };
  });
}

function buildIntentModuleReference(productModuleCatalog) {
  return productModuleCatalog.modules.map(function(manifest) {
    return {
      name: manifest.name,
      category: manifest.category,
      summary: manifest.summary,
      presets: Object.keys(manifest.presets || {}).map(function(preset) {
        return preset === 'mobile' ? 'mobile-friendly' : preset;
      })
    };
  });
}

function buildIntentCommanderSystemPrompt(productModuleCatalog, componentCatalogInstance) {
  return [
    'You are GameCastle Intent Commander.',
    'Compile LLM1 creative intent into AI-first natural Intent DSL.',
    'GDJS is target code, not your creation language.',
    'Do not output Module DSL, low-level object/event DSL, JSON, Markdown, explanations, project.json, coordinates, event indexes, ids, component ids, backend implementation names, or key=value fields.',
    '',
    'Canonical Intent DSL examples:',
    'make a mobile platformer',
    'give Player platformer movement',
    'add joystick controls Player near screen bottom-left',
    'add jump button controls Player near screen bottom-right',
    'add attack button controls Player near jump button left',
    'add inventory owned by Player with 24 slots near screen right',
    'place coins near Player front as trail count 8',
    '',
    'Allowed concepts are game-world concepts only: thing, component, relation, placement, value, role, action.',
    'Placement must use near/direction/pattern language, never concrete x/y coordinates.',
    '',
    'Product module cards, shown without machine ids:',
    JSON.stringify(buildIntentModuleReference(productModuleCatalog), null, 2),
    '',
    'Component cards, shown without compiler ids or adapter names:',
    JSON.stringify(buildIntentComponentReference(componentCatalogInstance), null, 2),
    '',
    'Rules:',
    '- For a new game, output the minimum natural Intent DSL needed for a playable first version.',
    '- For mobile games, use joystick and jump/attack buttons as natural controls when appropriate.',
    '- For inventory/backpack requests, use natural inventory ownership and slot count.',
    '- For placement, prefer screen directions for UI and object-relative directions for world objects.',
    '- Output only Intent DSL lines.',
  ].join('\n');
}

function buildInternalDslRepairSystemPrompt(capabilityCatalog, capabilities) {
  return [
    'You are GameCastle internal DSL repair.',
    'This is a runtime/compiler fallback, not the product module interface.',
    'Read the ExecutionReport and output only the minimum low-level DSL diff needed to repair failed commands.',
    'Do not repeat completed commands. Do not output Module DSL, JSON, Markdown, or explanations.',
    '',
    capabilities.buildCompilerPromptSection(capabilityCatalog),
  ].join('\n');
}

function buildIntentPatchUserPrompt(options) {
  return [
    'Original user request:',
    options.userPrompt,
    '',
    'Current ProjectWorld context. This is not project.json:',
    JSON.stringify(options.worldContext, null, 2),
    '',
    'LLM1 creative design brief:',
    JSON.stringify(options.designBrief, null, 2),
    '',
    'Design diff summary:',
    JSON.stringify(options.diff, null, 2),
    '',
    options.isNew
      ? 'Task: output the Intent DSL patch for the first playable version.'
      : 'Task: output only the Intent DSL patch needed for this iteration.',
    '',
    'Remember: speak in game-world intent. Do not output module ids, component ids, backend implementation names, coordinates, event indexes, key=value fields, JSON, or explanations.',
  ].join('\n');
}

function buildModulePatchUserPrompt(options) {
  return [
    'Original user request:',
    options.userPrompt,
    '',
    'Current ProjectWorld context. This is not full project.json:',
    JSON.stringify(options.worldContext, null, 2),
    '',
    'LLM1 creative design brief:',
    JSON.stringify(options.designBrief, null, 2),
    '',
    'Design diff summary:',
    JSON.stringify(options.diff, null, 2),
    '',
    options.isNew
      ? 'Task: output the Module DSL patch for the first playable version.'
      : 'Task: output only the Module DSL patch needed for this iteration.',
    '',
    'Remember: product modules are coarse. Prefer core.*, shell.*, system.*, meta.*, and network.* modules. Do not output object/event DSL.' +
      ' The original user request is authoritative for explicitly requested product modules if LLM1 omitted them.',
  ].join('\n');
}

function buildIntentCompileRepairPrompt(options) {
  return [
    'The previous Intent DSL patch failed before bridge compilation.',
    'Repair only the Intent DSL patch. Do not output Module DSL or low-level DSL.',
    '',
    'Original user prompt:',
    options.userPrompt,
    '',
    'LLM1 creative design brief:',
    JSON.stringify(options.designBrief, null, 2),
    '',
    'Current ProjectWorld context:',
    JSON.stringify(options.worldContext, null, 2),
    '',
    'Compiler error:',
    String(options.error && options.error.message || options.error),
    '',
    'Previous Intent DSL:',
    options.intentDslText,
    '',
    'Rules:',
    '- Output only corrected natural Intent DSL lines.',
    '- Do not add machine syntax to work around compiler errors.',
    '- If a concept is unsupported, rewrite it through an existing component, relation, placement, value, role, or action.',
  ].join('\n');
}

function buildModuleCompileRepairPrompt(options) {
  return [
    'The previous Module DSL patch failed before execution.',
    'Repair only the Module DSL patch. Do not output low-level DSL.',
    '',
    'Original user prompt:',
    options.userPrompt,
    '',
    'LLM1 creative design brief:',
    JSON.stringify(options.designBrief, null, 2),
    '',
    'Current ProjectWorld context:',
    JSON.stringify(options.worldContext, null, 2),
    '',
    'Compiler error:',
    String(options.error && options.error.message || options.error),
    '',
    'Previous Module DSL:',
    options.moduleDslText,
    '',
    'Rules:',
    '- Output only the corrected Module DSL diff.',
    '- Do not reinstall modules already present in ProjectWorld.modules; use configure module for supported installed-module parameters.',
    '- Keep sync policy explicit when changing networking-relevant modules.',
  ].join('\n');
}

function buildInternalExecutionRepairPrompt(options) {
  return [
    'The previous internal low-level DSL batch executed with failures.',
    'Output only the minimum low-level DSL diff required to repair failed commands.',
    'Do not repeat completed commands.',
    '',
    'Original user prompt:',
    options.userPrompt,
    '',
    'LLM1 creative design brief:',
    JSON.stringify(options.designBrief, null, 2),
    '',
    'Current ProjectWorld:',
    JSON.stringify(options.world, null, 2),
    '',
    'Previous ExecutionReport:',
    JSON.stringify(options.report, null, 2),
    '',
    'Previous low-level DSL:',
    options.dslText,
    '',
    'Repair rules:',
    '- Only repair failed commands and missing prerequisites caused by those failures.',
    '- Completed commands are already applied.',
    '- Output only low-level DSL lines.',
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

async function compileModulePatchWithRepair(options) {
  var moduleDslText = cleanDslOutput(options.moduleDslText);
  for (var attempt = 0; attempt <= options.maxRepairRounds; attempt++) {
    try {
      var compiled = options.moduleCompiler.compileModuleDslText(moduleDslText, options.productModuleCatalog, {
        baseModules: options.baseModules,
        projectWorld: options.projectWorld,
      });
      return {
        moduleDslText: moduleDslText,
        compiled: compiled,
      };
    } catch (e) {
      if (!options.allowLlmRepair || attempt >= options.maxRepairRounds) throw e;
      console.log('[ModuleCompile] repair round ' + (attempt + 1) + '/' + options.maxRepairRounds + ': ' + e.message);
      var repairPrompt = buildModuleCompileRepairPrompt({
        userPrompt: options.userPrompt,
        designBrief: options.designBrief,
        worldContext: options.worldContext,
        error: e,
        moduleDslText: moduleDslText,
      });
      var repaired = await options.callModel(
        repairPrompt,
        options.llm2SystemPrompt,
        agentWorkflow.buildTextCallOptions('dslModuleRepair', { label: 'LLM2-ModuleRepair' })
      );
      moduleDslText = cleanDslOutput(repaired);
      if (!moduleDslText) throw new Error('LLM2 returned empty Module DSL repair');
    }
  }
  throw new Error('Module DSL compile repair loop exhausted');
}

async function compileIntentPatchWithRepair(options) {
  var intentDslText = cleanDslOutput(options.intentDslText);
  for (var attempt = 0; attempt <= options.maxRepairRounds; attempt++) {
    try {
      var compiled = options.intentCompiler.compileIntentDsl(intentDslText, {
        placementContext: options.placementContext,
        componentCatalog: options.componentCatalog,
        productModuleCatalog: options.productModuleCatalog,
        moduleCompileOptions: {
          baseModules: options.baseModules,
          projectWorld: options.projectWorld
        }
      });
      assertIntentCompileDiagnostics(compiled);
      return {
        intentDslText: intentDslText,
        compiled: compiled,
      };
    } catch (e) {
      if (e.nonRepairableByLlm) throw e;
      if (!options.allowLlmRepair || attempt >= options.maxRepairRounds) throw e;
      console.log('[IntentCompile] repair round ' + (attempt + 1) + '/' + options.maxRepairRounds + ': ' + e.message);
      var repairPrompt = buildIntentCompileRepairPrompt({
        userPrompt: options.userPrompt,
        designBrief: options.designBrief,
        worldContext: options.worldContext,
        error: e,
        intentDslText: intentDslText,
      });
      var repaired = await options.callModel(
        repairPrompt,
        options.llm2SystemPrompt,
        agentWorkflow.buildTextCallOptions('dslModuleRepair', { label: 'LLM2-IntentRepair' })
      );
      intentDslText = cleanDslOutput(repaired);
      if (!intentDslText) throw new Error('LLM2 returned empty Intent DSL repair');
    }
  }
  throw new Error('Intent DSL compile repair loop exhausted');
}

module.exports = {
  cleanDslOutput: cleanDslOutput,
  buildModuleCommanderSystemPrompt: buildModuleCommanderSystemPrompt,
  buildIntentCommanderSystemPrompt: buildIntentCommanderSystemPrompt,
  buildInternalDslRepairSystemPrompt: buildInternalDslRepairSystemPrompt,
  buildIntentPatchUserPrompt: buildIntentPatchUserPrompt,
  buildModulePatchUserPrompt: buildModulePatchUserPrompt,
  buildInternalExecutionRepairPrompt: buildInternalExecutionRepairPrompt,
  compileModulePatchWithRepair: compileModulePatchWithRepair,
  compileIntentPatchWithRepair: compileIntentPatchWithRepair,
};
