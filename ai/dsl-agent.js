var agentWorkflow = require('./agent-workflow');

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

module.exports = {
  cleanDslOutput: cleanDslOutput,
  buildModuleCommanderSystemPrompt: buildModuleCommanderSystemPrompt,
  buildInternalDslRepairSystemPrompt: buildInternalDslRepairSystemPrompt,
  buildModulePatchUserPrompt: buildModulePatchUserPrompt,
  buildInternalExecutionRepairPrompt: buildInternalExecutionRepairPrompt,
  compileModulePatchWithRepair: compileModulePatchWithRepair,
};
