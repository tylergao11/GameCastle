var agentWorkflow = require('./agent-workflow');
var componentCatalog = require('./component-catalog');
var diagnosticRouter = require('./intent-diagnostic-router');
var intentSurfaceGuard = require('./intent-surface-guard');
var projectWorld = require('./project-world');
var semanticFeedback = require('./semantic-feedback');

function cleanDslOutput(text) {
  text = String(text || '').trim();
  var fence = text.match(/^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1].trim();
  return text;
}

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
      actions: sanitizeIntentTextList(ai.actions),
      safeExamples: sanitizeIntentTextList(ai.safeExamples)
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

function sanitizePreviousIntentDslForRepair(text) {
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
  return omitted ? '[previous Intent DSL omitted because it contained prohibited machine syntax]' : '';
}

function semanticPlacementFromBriefPlacement(placement) {
  if (!placement) return null;
  var result = {
    object: sanitizeIntentTextField(placement.object || placement.name)
  };
  if (placement.anchor || placement.near) result.anchor = sanitizeIntentTextField(placement.anchor || placement.near);
  if (placement.direction) result.direction = sanitizeIntentTextField(placement.direction);
  if (placement.pattern) result.pattern = sanitizeIntentTextField(placement.pattern);
  if (result.anchor || result.direction || result.pattern) return result;

  var x = Number(placement.x);
  var y = Number(placement.y);
  if (!isFinite(x) && !isFinite(y)) return result.object ? result : null;

  var horizontal = !isFinite(x) ? null : (x < 267 ? 'left' : (x > 533 ? 'right' : 'center'));
  var vertical = !isFinite(y) ? null : (y < 200 ? 'top' : (y > 400 ? 'bottom' : 'middle'));
  var parts = [];
  if (vertical && vertical !== 'middle') parts.push(vertical);
  if (horizontal && horizontal !== 'center') parts.push(horizontal);
  result.anchor = 'screen';
  result.direction = parts.length ? parts.join('-') : 'center';
  return result;
}

function sanitizeDesignBriefForIntentPrompt(brief) {
  if (!brief) return null;
  return {
    theme: sanitizeIntentTextField(brief.theme),
    objects: compactList(brief.objects, function(object) {
      var name = sanitizeIntentTextField(object.name);
      if (!name) return null;
      return {
        name: name,
        kind: sanitizeIntentTextField(object.kind),
        note: sanitizeIntentTextField(object.note)
      };
    }),
    rules: sanitizeIntentTextList(brief.rules),
    placements: compactList(brief.layout && brief.layout.placements, semanticPlacementFromBriefPlacement),
    behaviors: compactList(brief.behaviors, function(behavior) {
      var object = sanitizeIntentTextField(behavior.object);
      if (!object) return null;
      return {
        object: object,
        behavior: sanitizeIntentTextField(behavior.behavior || behavior.type)
      };
    }),
    variables: compactList(brief.variables, function(variable) {
      var name = sanitizeIntentTextField(variable.name);
      return name ? { name: name } : null;
    }),
    difficulty: sanitizeIntentTextField(brief.difficulty),
    controls: sanitizeIntentTextField(brief.controls)
  };
}

function sanitizePlacementChangeList(list) {
  return compactList(list, semanticPlacementFromBriefPlacement);
}

function sanitizeModifiedPlacementList(list) {
  return compactList(list, function(item) {
    var object = sanitizeIntentTextField(item.object);
    if (!object) return null;
    return {
      object: object,
      old: semanticPlacementFromBriefPlacement(item.old),
      new: semanticPlacementFromBriefPlacement(item.new)
    };
  });
}

function sanitizeDiffSection(section) {
  section = section || {};
  return {
    objects: compactList(section.objects, function(object) {
      if (object && object.name && object.new) {
        var modifiedName = sanitizeIntentTextField(object.name);
        if (!modifiedName) return null;
        return {
          name: modifiedName,
          old: object.old ? { name: sanitizeIntentTextField(object.old.name), kind: sanitizeIntentTextField(object.old.kind), note: sanitizeIntentTextField(object.old.note) } : null,
          new: object.new ? { name: sanitizeIntentTextField(object.new.name), kind: sanitizeIntentTextField(object.new.kind), note: sanitizeIntentTextField(object.new.note) } : null
        };
      }
      if (!object) return null;
      var name = sanitizeIntentTextField(object.name);
      if (!name) return null;
      return { name: name, kind: sanitizeIntentTextField(object.kind), note: sanitizeIntentTextField(object.note) };
    }),
    placements: sanitizePlacementChangeList(section.placements),
    behaviors: compactList(section.behaviors, function(behavior) {
      var object = sanitizeIntentTextField(behavior.object);
      if (!object) return null;
      return {
        object: object,
        behavior: sanitizeIntentTextField(behavior.behavior || behavior.type)
      };
    }),
    variables: compactList(section.variables, function(variable) {
      var name = sanitizeIntentTextField(variable.name);
      return name ? { name: name } : null;
    }),
    rules: sanitizeIntentTextList(section.rules)
  };
}

function sanitizeModifiedDiffSection(section) {
  section = section || {};
  var sanitized = sanitizeDiffSection(section);
  sanitized.placements = sanitizeModifiedPlacementList(section.placements);
  sanitized.behaviors = compactList(section.behaviors, function(behavior) {
    var object = sanitizeIntentTextField(behavior.object);
    if (!object) return null;
    return {
      object: object,
      behavior: sanitizeIntentTextField(behavior.behavior)
    };
  });
  sanitized.variables = compactList(section.variables, function(variable) {
    var name = sanitizeIntentTextField(variable.name);
    return name ? { name: name } : null;
  });
  return sanitized;
}

function sanitizeDesignDiffForIntentPrompt(diff) {
  if (!diff) return null;
  if (diff.isNew) {
    return {
      isNew: true,
      added: sanitizeDesignBriefForIntentPrompt(diff.added || {})
    };
  }
  return {
    isNew: false,
    added: sanitizeDiffSection(diff.added),
    removed: sanitizeDiffSection(diff.removed),
    modified: sanitizeModifiedDiffSection(diff.modified)
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
    semanticMapping: semanticFeedback.buildSemanticMappingLlmView()
  };
}

function buildIntentCommanderSystemPrompt(productModuleCatalog, componentCatalogInstance) {
  return [
    'You are GameCastle Intent Commander.',
    'Compile LLM1 creative intent into AI-first natural Intent DSL.',
    'Engine target code is not your creation language.',
    'Do not output engine target code, backend commands, JSON, Markdown, explanations, engine files, coordinates, event indexes, ids, component ids, backend implementation names, or key=value fields.',
    '',
    'Canonical Intent DSL examples:',
    'make a mobile platformer',
    'give Player platformer movement',
    'add joystick controls Player near screen bottom-left',
    'add jump button controls Player near screen bottom-right',
    'add attack button controls Player near jump button left',
    'add inventory owned by Player with 24 slots near screen right',
    'adjust Fox placement above slightly',
    'place coins near Player front as trail count 8',
    '',
    'Allowed concepts are game-world concepts only: thing, component, relation, placement, edit, value, role, action.',
    'Placement and edits must use near/direction/pattern/semantic amount language, never concrete x/y coordinates or numeric deltas.',
    '',
    'Game capability cards, shown without machine ids or module ids:',
    JSON.stringify(buildIntentCapabilityReference(productModuleCatalog), null, 2),
    '',
    'Component cards, shown without compiler ids or adapter names:',
    JSON.stringify(buildIntentComponentReference(componentCatalogInstance), null, 2),
    '',
    'Semantic feedback mapping, shown as an LLM-safe game-world dictionary:',
    JSON.stringify(semanticFeedback.buildSemanticMappingLlmView(), null, 2),
    '',
    'Rules:',
    '- For a new game, output the minimum natural Intent DSL needed for a playable first version.',
    '- For mobile games, use joystick and jump/attack buttons as natural controls when appropriate.',
    '- For inventory/backpack requests, use natural inventory ownership and slot count.',
    '- For placement, prefer screen directions for UI and object-relative directions for world objects.',
    '- For small changes to an existing object, use semantic edit lines such as adjust Fox placement above slightly.',
    '- Output only Intent DSL lines.',
  ].join('\n');
}

function buildIntentUserPrompt(options) {
  var safeWorldContext = sanitizeIntentWorldContext(options.worldContext);
  var safeDesignBrief = sanitizeDesignBriefForIntentPrompt(options.designBrief);
  var safeDiff = sanitizeDesignDiffForIntentPrompt(options.diff);
  var safeUserPrompt = sanitizeUserPromptForIntentPrompt(options.userPrompt);
  return [
    'Original user request:',
    safeUserPrompt,
    '',
    'Current world context for Intent planning. This is a sanitized game-world card, not engine internals:',
    JSON.stringify(safeWorldContext, null, 2),
    '',
    'LLM1 creative design brief:',
    JSON.stringify(safeDesignBrief, null, 2),
    '',
    'Design diff summary:',
    JSON.stringify(safeDiff, null, 2),
    '',
    options.isNew
      ? 'Task: output the Intent DSL for the first playable version.'
      : 'Task: output only the Intent DSL needed for this iteration.',
    '',
    'Remember: speak in game-world intent. Do not output module ids, component ids, backend implementation names, coordinates, event indexes, key=value fields, JSON, or explanations.',
  ].join('\n');
}

function buildIntentCompileRepairPrompt(options) {
  var safeWorldContext = sanitizeIntentWorldContext(options.worldContext);
  var safePreviousIntentDsl = sanitizePreviousIntentDslForRepair(options.intentDslText);
  var safeDesignBrief = sanitizeDesignBriefForIntentPrompt(options.designBrief);
  var safeUserPrompt = sanitizeUserPromptForIntentPrompt(options.userPrompt);
  var safeError = sanitizeErrorForIntentPrompt(options.error);
  return [
    'The previous Intent DSL failed before engine lowering.',
    'Repair only the Intent DSL. Do not output engine target code or backend commands.',
    '',
    'Original user prompt:',
    safeUserPrompt,
    '',
    'LLM1 creative design brief:',
    JSON.stringify(safeDesignBrief, null, 2),
    '',
    'Current world context for Intent repair. This is a sanitized game-world card, not engine internals:',
    JSON.stringify(safeWorldContext, null, 2),
    '',
    'Compiler error:',
    safeError,
    '',
    'Previous Intent DSL:',
    safePreviousIntentDsl,
    '',
    'Rules:',
    '- Output only corrected natural Intent DSL lines.',
    '- Do not add machine syntax to work around compiler errors.',
    '- If a concept is unsupported, rewrite it through an existing component, relation, placement, edit, value, role, or action.',
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

async function compileIntentDslWithRepair(options) {
  var intentDslText = cleanDslOutput(options.intentDslText);
  for (var attempt = 0; attempt <= options.maxRepairRounds; attempt++) {
    try {
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
        agentWorkflow.buildTextCallOptions('dslIntentRepair', { label: 'LLM2-IntentRepair' })
      );
      intentDslText = cleanDslOutput(repaired);
      if (!intentDslText) throw new Error('LLM2 returned empty Intent DSL repair');
    }
  }
  throw new Error('Intent DSL compile repair loop exhausted');
}

module.exports = {
  cleanDslOutput: cleanDslOutput,
  buildIntentCommanderSystemPrompt: buildIntentCommanderSystemPrompt,
  buildIntentUserPrompt: buildIntentUserPrompt,
  sanitizeIntentWorldContext: sanitizeIntentWorldContext,
  sanitizeDesignBriefForIntentPrompt: sanitizeDesignBriefForIntentPrompt,
  sanitizeDesignDiffForIntentPrompt: sanitizeDesignDiffForIntentPrompt,
  sanitizePreviousIntentDslForRepair: sanitizePreviousIntentDslForRepair,
  sanitizeUserPromptForIntentPrompt: sanitizeUserPromptForIntentPrompt,
  sanitizeErrorForIntentPrompt: sanitizeErrorForIntentPrompt,
  sanitizeExecutionSummaryForIntentPrompt: sanitizeExecutionSummaryForIntentPrompt,
  compileIntentDslWithRepair: compileIntentDslWithRepair,
};
