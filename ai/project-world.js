var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var WORLD_SCHEMA_VERSION = 1;
var LEDGER_SCHEMA_VERSION = 1;

function slug(value) {
  var text = String(value || 'item')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return text || 'item';
}

function shortHash(value) {
  return crypto
    .createHash('sha1')
    .update(String(value))
    .digest('hex')
    .slice(0, 8);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function(key) {
    return JSON.stringify(key) + ':' + stableStringify(value[key]);
  }).join(',') + '}';
}

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function compactList(list, mapper) {
  return (list || []).map(mapper).filter(Boolean);
}

function normalizeDslLines(textOrLines) {
  var lines = Array.isArray(textOrLines) ? textOrLines : String(textOrLines || '').split(/\r?\n/);
  return lines.map(function(line) {
    return String(line || '').trim();
  }).filter(function(line) {
    return line && line[0] !== '#';
  });
}

function summarizeDiagnostics(list) {
  return compactList(list, function(item) {
    return {
      owner: item.owner || null,
      category: item.category || item.code || null,
      routeId: item.routeId || null,
      routeOwner: item.routeOwner || null,
      routeMechanism: item.routeMechanism || null,
      nextAction: item.nextAction || null,
      message: item.message || null,
      target: item.target || null,
    };
  });
}

function countBy(list, key) {
  var result = {};
  (list || []).forEach(function(item) {
    var value = item && item[key];
    if (!value) return;
    result[value] = (result[value] || 0) + 1;
  });
  return result;
}

function summarizeIntentArtifacts(options) {
  options = options || {};
  var intentGraph = options.intentGraph || null;
  var placementPlan = options.placementPlan || null;
  var bridgePlan = options.bridgePlan || null;
  var intentContracts = options.intentContracts || options.contracts || null;
  var resultCard = options.compileResultCard || options.resultCard || null;
  var runtimeAdapterRequirements = options.runtimeAdapterRequirements ||
    (bridgePlan && bridgePlan.runtimeAdapterRequirements) ||
    [];
  var intentDslLines = normalizeDslLines(options.intentDslLines || options.intentDslText);

  if (!intentDslLines.length && !intentGraph && !placementPlan && !bridgePlan && !resultCard && !runtimeAdapterRequirements.length) {
    return null;
  }

  return {
    schemaVersion: 1,
    patchKind: options.patchKind || 'intent',
    intentDslLines: intentDslLines,
    contracts: intentContracts || null,
    intentGraph: intentGraph ? {
      counts: {
        modules: (intentGraph.modules || []).length,
        things: (intentGraph.things || []).length,
        components: (intentGraph.components || []).length,
        relations: (intentGraph.relations || []).length,
        placements: (intentGraph.placements || []).length,
        bindings: (intentGraph.bindings || []).length,
        requirements: (intentGraph.requirements || []).length,
        diagnostics: (intentGraph.diagnostics || []).length,
      },
      modules: compactList(intentGraph.modules, function(module) {
        return { id: module.id, preset: module.preset || null, source: module.source || null };
      }),
      things: compactList(intentGraph.things, function(thing) {
        return { name: thing.name, archetype: thing.archetype || null, role: thing.role || null };
      }),
      components: compactList(intentGraph.components, function(component) {
        return {
          componentId: component.componentId,
          thing: component.thing || null,
          owner: component.owner || null,
          target: component.target || null,
          control: component.control || null,
          configKeys: Object.keys(component.config || {}).sort(),
        };
      }),
      relations: compactList(intentGraph.relations, function(relation) {
        return {
          type: relation.type,
          from: relation.from || null,
          to: relation.to || null,
          params: relation.params || undefined,
        };
      }),
      placements: compactList(intentGraph.placements, function(placement) {
        return {
          subject: placement.subject,
          anchor: placement.anchor,
          space: placement.space || null,
          direction: placement.direction || null,
          pattern: placement.pattern || null,
          count: placement.count,
        };
      }),
      bindings: compactList(intentGraph.bindings, function(binding) {
        return {
          action: binding.action || null,
          source: binding.source || null,
          target: binding.target || null,
          inputKind: binding.inputKind || null,
        };
      }),
      diagnostics: summarizeDiagnostics(intentGraph.diagnostics),
    } : null,
    placementPlan: placementPlan ? {
      context: placementPlan.context || null,
      placements: compactList(placementPlan.placements, function(placement) {
        return {
          subject: placement.subject,
          space: placement.space || null,
          anchor: placement.anchor || null,
          layer: placement.layer || null,
          directionRewrite: placement.directionRewrite || null,
          routeEvidence: compactList(placement.routeEvidence, function(item) {
            return {
              owner: item.owner || null,
              mechanism: item.mechanism || null,
              routeId: item.routeId || null,
              routeMechanism: item.routeMechanism || null,
            };
          }),
          pattern: placement.pattern || null,
          count: placement.count,
          emission: placement.emission ? {
            mechanism: placement.emission.mechanism || null,
            routeId: placement.emission.routeId || null,
            routeMechanism: placement.emission.routeMechanism || null,
          } : null,
          resolved: placement.resolved || null,
          points: placement.points || [],
        };
      }),
      diagnostics: summarizeDiagnostics(placementPlan.diagnostics),
    } : null,
    bridgePlan: bridgePlan ? {
      target: bridgePlan.target || null,
      internalDslLines: (bridgePlan.dslLines || []).length,
      contracts: bridgePlan.contracts || null,
      emittedMechanisms: countBy(bridgePlan.emitted, 'mechanism'),
      emittedRoutes: countBy(bridgePlan.emitted, 'routeId'),
      installedModules: compactList(bridgePlan.installedModules, function(module) {
        return { id: module.id, preset: module.preset || null, syncPolicy: module.syncPolicy || null };
      }),
      runtimeAdapterRequirements: runtimeAdapterRequirements.length,
      diagnostics: summarizeDiagnostics(bridgePlan.diagnostics),
    } : null,
    resultCard: resultCard ? {
      resolved: (resultCard.resolved || []).length,
      rewrites: compactList(resultCard.rewrites, function(rewrite) {
        return {
          from: rewrite.from || null,
          to: rewrite.to || null,
          owner: rewrite.owner || null,
          mechanism: rewrite.mechanism || null,
          stage: rewrite.stage || null,
        };
      }),
      overrides: compactList(resultCard.overrides, function(override) {
        return {
          component: override.component || null,
          key: override.key || null,
          value: override.value,
          owner: override.owner || null,
          source: override.source || null,
        };
      }),
      autoAdded: compactList(resultCard.autoAdded, function(item) {
        return { kind: item.kind || null, id: item.id || null, reason: item.reason || null };
      }),
      diagnostics: summarizeDiagnostics(resultCard.diagnostics),
      warnings: (resultCard.warnings || []).slice(),
      ownerTrace: compactList(resultCard.ownerTrace, function(item) {
        return { stage: item.stage || null, owner: item.owner || null };
      }),
      emitted: (resultCard.emitted || []).slice(),
    } : null,
    runtimeAdapterRequirements: compactList(runtimeAdapterRequirements, function(requirement) {
      return {
        adapter: requirement.adapter,
        componentId: requirement.componentId || null,
        thing: requirement.thing || null,
        target: requirement.target || null,
        owner: requirement.owner || null,
        source: requirement.source || null,
        mechanism: requirement.mechanism || null,
        routeId: requirement.routeId || null,
        routeOwner: requirement.routeOwner || null,
        routeMechanism: requirement.routeMechanism || null,
        action: requirement.action || null,
      };
    }),
  };
}

function intentSemanticPayload(intentSummary) {
  if (!intentSummary) return null;
  var summary = clone(intentSummary);
  delete summary.intentDslLines;
  return summary;
}

function makeEmptyRegistry() {
  return {
    scenes: {},
    objects: {},
    instances: {},
    events: {},
    variables: {},
    modules: {},
  };
}

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function saveJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function getWorldPath(stateDir) {
  return path.join(stateDir, 'project-world.json');
}

function getLedgerPath(stateDir) {
  return path.join(stateDir, 'execution-ledger.json');
}

function loadProjectWorld(stateDir) {
  return loadJson(getWorldPath(stateDir), null);
}

function loadExecutionLedger(stateDir) {
  return loadJson(getLedgerPath(stateDir), {
    schemaVersion: LEDGER_SCHEMA_VERSION,
    runs: [],
  });
}

function assignId(registry, bucket, key, prefix, usedIds) {
  if (!registry[bucket]) registry[bucket] = {};
  if (registry[bucket][key]) {
    usedIds[registry[bucket][key]] = true;
    return registry[bucket][key];
  }

  var base = prefix + '_' + slug(key).slice(0, 40);
  var id = base;
  if (usedIds[id]) id = base + '_' + shortHash(key);
  var i = 2;
  while (usedIds[id]) id = base + '_' + i++;
  registry[bucket][key] = id;
  usedIds[id] = true;
  return id;
}

function normalizeNumber(value) {
  var n = Number(value);
  return isFinite(n) ? Number(n.toFixed(4)) : 0;
}

function colorToHex(color) {
  if (!color) return undefined;
  function part(n) {
    var value = Math.max(0, Math.min(255, Number(n) || 0)).toString(16);
    return value.length === 1 ? '0' + value : value;
  }
  return '#' + part(color.r) + part(color.g) + part(color.b);
}

function describeObject(object) {
  var described = {
    name: object.name,
    type: object.type,
  };
  if (object.type === 'PrimitiveDrawing::Drawer') {
    described.kind = 'ShapePainter';
    described.color = colorToHex(object.fillColor);
  } else if (object.type === 'TextObject::Text' || object.type === 'Text') {
    described.kind = 'Text';
    described.text = (object.content && object.content.text) || object.string || object.name;
    described.size = (object.content && object.content.characterSize) || object.characterSize || undefined;
  }

  var behaviors = (object.behaviors || []).map(function(behavior) {
    return {
      name: behavior.name,
      type: behavior.type,
    };
  });
  if (behaviors.length) described.behaviors = behaviors;

  var variables = (object.variables || []).map(describeVariable);
  if (variables.length) described.variables = variables;
  return described;
}

function describeVariable(variable) {
  return {
    name: variable.name,
    type: variable.type,
    value: variable.value,
  };
}

function describeCondition(condition) {
  var type = condition && condition.type && condition.type.value;
  var p = (condition && condition.parameters) || [];
  if (type === 'DepartScene') return 'on start';
  if (type === 'CollisionNP') return 'on collision ' + p[0] + ' ' + p[1];
  if (type === 'KeyPressed') return 'on key ' + (p[1] || '');
  if (type === 'Variable') return 'on var ' + p.join(' ');
  if (type === 'SourisSurObjet') return 'on mouse ' + (p[2] || '');
  if (type) return 'on ' + type + '(' + p.join(',') + ')';
  return 'on unknown';
}

function describeAction(action) {
  var type = action && action.type && action.type.value;
  var p = (action && action.parameters) || [];
  if (type === 'Delete') return 'destroy ' + p[0];
  if (type === 'CreateObject') return 'spawn ' + p[0] + ' at ' + p[1] + ',' + p[2];
  if (type === 'SetVariable') return 'variable ' + p[0] + ' ' + p[1] + ' ' + p[2];
  if (type === 'ResetGame') return 'restart';
  if (type === 'AddForce') return 'jump ' + p[0] + ' ' + p[2];
  if (type === 'MettreXY') return 'move ' + p[0] + ' to ' + p[2] + ',' + p[4];
  if (type === 'TextObject::String') return 'text ' + p[0] + ' "' + p[2] + '"';
  if (type === 'ChangeScene') return 'scene ' + p[0];
  if (type === 'PrimitiveDrawing::Drawer::ClearShapes') return 'clear drawer ' + p[0];
  if (type === 'PrimitiveDrawing::Rectangle') return 'draw rectangle ' + p[0] + ' ' + p.slice(1).join(' ');
  if (type === 'PrimitiveDrawing::Circle') return 'draw circle ' + p[0] + ' ' + p.slice(1).join(' ');
  if (type === 'PrimitiveDrawing::SetRectangularCollisionMask') return 'collision mask ' + p[0] + ' ' + p.slice(1).join(' ');
  if (type) return type + '(' + p.join(',') + ')';
  return 'unknown action';
}

function describeEvent(event) {
  if (event.type === 'BuiltinCommonInstructions::Repeat') {
    var child = event.events && event.events[0];
    var childActions = child ? (child.actions || []).map(describeAction) : [];
    return {
      type: 'repeat',
      text: 'every ' + event.repeatExpression + 's -> ' + childActions.join(', '),
      actions: childActions,
      children: (event.events || []).length,
    };
  }

  var conditions = (event.conditions || []).map(describeCondition);
  var actions = (event.actions || []).map(describeAction);
  return {
    type: 'standard',
    text: (conditions.join(' and ') || 'always') + ' -> ' + actions.join(', '),
    conditions: conditions,
    actions: actions,
  };
}

function buildProjectWorld(project, previousWorld, options) {
  options = options || {};
  var registry = clone(previousWorld && previousWorld.idRegistry) || makeEmptyRegistry();
  var usedIds = {};
  var nextRegistry = makeEmptyRegistry();

  function idFor(bucket, key, prefix) {
    var merged = {};
    merged[bucket] = registry[bucket] || {};
    var id = assignId(merged, bucket, key, prefix, usedIds);
    nextRegistry[bucket][key] = id;
    return id;
  }

  var world = {
    schemaVersion: WORLD_SCHEMA_VERSION,
    worldVersion: 1,
    project: {
      name: project.properties && project.properties.name || 'GameCastle',
      firstScene: project.firstLayout || '',
      width: project.properties && project.properties.windowWidth || 800,
      height: project.properties && project.properties.windowHeight || 600,
    },
    scenes: [],
    globalObjects: [],
    globalVariables: (project.variables || []).map(function(variable) {
      var key = 'global|' + variable.name;
      var described = describeVariable(variable);
      described.id = idFor('variables', key, 'var');
      described.scope = 'global';
      return described;
    }),
    modules: options.modules ? clone(options.modules) : (clone(previousWorld && previousWorld.modules) || []),
    intent: options.intent ? summarizeIntentArtifacts(options.intent) : (clone(previousWorld && previousWorld.intent) || null),
    idRegistry: nextRegistry,
  };

  world.globalObjects = (project.objects || []).map(function(object) {
    var key = 'global|' + object.name;
    var described = describeObject(object);
    described.id = idFor('objects', key, 'obj');
    described.scope = 'global';
    return described;
  });

  (project.layouts || []).forEach(function(scene) {
    var sceneKey = scene.name;
    var sceneId = idFor('scenes', sceneKey, 'scene');
    var sceneWorld = {
      id: sceneId,
      name: scene.name,
      objects: [],
      instances: [],
      variables: [],
      layers: [],
      events: [],
    };

    sceneWorld.layers = (scene.layers || []).map(function(layer, index) {
      return {
        id: 'layer_' + (layer.name ? slug(layer.name) : 'base'),
        name: layer.name || '',
        isBaseLayer: layer.name ? false : true,
        index: index,
        visible: layer.visibility !== false,
      };
    });

    sceneWorld.objects = (scene.objects || []).map(function(object) {
      var key = scene.name + '|' + object.name;
      var described = describeObject(object);
      described.id = idFor('objects', key, 'obj');
      described.scope = 'scene';
      return described;
    });

    sceneWorld.variables = (scene.variables || []).map(function(variable) {
      var key = scene.name + '|' + variable.name;
      var described = describeVariable(variable);
      described.id = idFor('variables', key, 'var');
      described.scope = 'scene';
      return described;
    });

    var instanceCounts = {};
    sceneWorld.instances = (scene.instances || []).map(function(instance) {
      var countKey = [
        scene.name,
        instance.name,
        normalizeNumber(instance.x),
        normalizeNumber(instance.y),
        normalizeNumber(instance.width),
        normalizeNumber(instance.height),
        instance.layer || '',
      ].join('|');
      instanceCounts[countKey] = (instanceCounts[countKey] || 0) + 1;
      var key = countKey + '|' + instanceCounts[countKey];
      return {
        id: idFor('instances', key, 'inst'),
        object: instance.name,
        x: normalizeNumber(instance.x),
        y: normalizeNumber(instance.y),
        width: normalizeNumber(instance.width),
        height: normalizeNumber(instance.height),
        layer: instance.layer || '',
        zOrder: instance.zOrder || 0,
      };
    });

    var eventCounts = {};
    sceneWorld.events = (scene.events || []).map(function(event) {
      var described = describeEvent(event);
      var countKey = scene.name + '|' + described.text;
      eventCounts[countKey] = (eventCounts[countKey] || 0) + 1;
      var key = countKey + '|' + eventCounts[countKey];
      described.id = idFor('events', key, 'evt');
      return described;
    });

    world.scenes.push(sceneWorld);
  });

  var semanticPayload = {
    project: world.project,
    scenes: world.scenes,
    globalObjects: world.globalObjects,
    globalVariables: world.globalVariables,
    modules: world.modules,
    intent: intentSemanticPayload(world.intent),
  };
  world.semanticHash = shortHash(stableStringify(semanticPayload));
  if (previousWorld && previousWorld.semanticHash === world.semanticHash) {
    world.worldVersion = previousWorld.worldVersion || 1;
  } else if (previousWorld && previousWorld.worldVersion) {
    world.worldVersion = previousWorld.worldVersion + 1;
  }

  return world;
}

function makeExecutionReport(options) {
  var previousWorld = options.previousWorld;
  var world = options.world;
  var dslLines = options.dslLines || [];
  var commandResults = options.commandResults || [];
  var total = commandResults.length;
  var failed = commandResults.filter(function(result) { return !result.ok; });
  var completed = commandResults.filter(function(result) { return result.ok; });
  var runIndex = options.runIndex || 1;

  return {
    schemaVersion: LEDGER_SCHEMA_VERSION,
    runId: 'run_' + String(runIndex).padStart(3, '0'),
    batchLabel: options.batchLabel || null,
    baseWorldVersion: previousWorld ? previousWorld.worldVersion : null,
    targetWorldVersion: world ? world.worldVersion : null,
    baseSemanticHash: previousWorld ? previousWorld.semanticHash : null,
    targetSemanticHash: world ? world.semanticHash : null,
    summary: {
      total: total,
      completed: completed.length,
      failed: failed.length,
      nextAction: failed.length ? 'repair' : 'done',
    },
    intent: options.intent ? summarizeIntentArtifacts(options.intent) : null,
    completed: completed.map(function(result) {
      return {
        commandId: result.commandId,
        command: dslLines[result.index] || result.label,
        message: result.message,
      };
    }),
    failed: failed.map(function(result) {
      return {
        commandId: result.commandId,
        command: dslLines[result.index] || result.label,
        message: result.message,
      };
    }),
  };
}

function appendExecutionReport(stateDir, report) {
  var ledger = loadExecutionLedger(stateDir);
  ledger.runs.push(report);
  saveJson(getLedgerPath(stateDir), ledger);
  return ledger;
}

function saveProjectWorld(stateDir, world) {
  saveJson(getWorldPath(stateDir), world);
}

module.exports = {
  buildProjectWorld: buildProjectWorld,
  summarizeIntentArtifacts: summarizeIntentArtifacts,
  loadProjectWorld: loadProjectWorld,
  saveProjectWorld: saveProjectWorld,
  loadExecutionLedger: loadExecutionLedger,
  appendExecutionReport: appendExecutionReport,
  makeExecutionReport: makeExecutionReport,
  getWorldPath: getWorldPath,
  getLedgerPath: getLedgerPath,
};
