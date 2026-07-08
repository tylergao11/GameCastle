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
  if (object.type === 'PrimitiveDrawing::ShapePainter') {
    described.kind = 'ShapePainter';
    described.shape = object.shapeType || 'rectangle';
    described.color = colorToHex(object.fillColor);
    if (object.centerPosition) {
      described.width = normalizeNumber(object.centerPosition.x * 2);
      described.height = normalizeNumber(object.centerPosition.y * 2);
    }
  } else if (object.type === 'TextObject::Text' || object.type === 'Text') {
    described.kind = 'Text';
    described.text = object.string || object.name;
    described.size = object.characterSize || undefined;
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

function buildProjectWorld(project, previousWorld) {
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
    modules: clone(previousWorld && previousWorld.modules) || [],
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
  loadProjectWorld: loadProjectWorld,
  saveProjectWorld: saveProjectWorld,
  loadExecutionLedger: loadExecutionLedger,
  appendExecutionReport: appendExecutionReport,
  makeExecutionReport: makeExecutionReport,
  getWorldPath: getWorldPath,
  getLedgerPath: getLedgerPath,
};
