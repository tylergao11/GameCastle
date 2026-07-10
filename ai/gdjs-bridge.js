var path = require('path');
var moduleCompiler = require('./module-compiler');
var componentCatalog = require('./component-catalog');
var diagnosticRouter = require('./intent-diagnostic-router');
var emissionContract = require('./gdjs-bridge-emission-contract');
var runtimeAdapterContract = require('./runtime-adapter-requirement-contract');

var GDJS_BRIDGE_PLAN_SCHEMA_VERSION = 1;
var PRODUCT_MODULES_DIR = path.join(__dirname, 'product-modules');

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function addUnique(list, seen, item, key) {
  key = key || JSON.stringify(item);
  if (seen[key]) return;
  seen[key] = true;
  list.push(item);
}

function lineKey(line) {
  return String(line || '').trim();
}

function addLine(plan, line, owner, source, meta) {
  meta = meta || {};
  if (!line || plan._lineSeen[lineKey(line)]) return;
  plan._lineSeen[lineKey(line)] = true;
  plan.targetPlanLines.push(line);
  plan.emitted.push({
    kind: 'target-plan-line',
    owner: owner,
    source: source,
    mechanism: meta.mechanism || null,
    routeId: meta.routeId || null,
    routeMechanism: meta.routeMechanism || null,
    line: line
  });
}

function addTrace(card, stage, owner) {
  if (!card) return;
  if (!card.ownerTrace) card.ownerTrace = [];
  var exists = card.ownerTrace.some(function(item) {
    return item.stage === stage && item.owner === owner;
  });
  if (!exists) card.ownerTrace.push({ stage: stage, owner: owner });
}

function addCardDiagnostic(card, diagnostic) {
  if (!card) return;
  if (!card.diagnostics) card.diagnostics = [];
  card.diagnostics.push(clone(diagnostic));
}

function addCardEmission(card, line) {
  if (!card) return;
  if (!card.emitted) card.emitted = [];
  card.emitted.push(line);
}

function findPlacement(plan, subject) {
  return (plan.placements || []).find(function(placement) {
    return placement.subject === subject && !placement.unresolved;
  }) || null;
}

function pointOf(placement) {
  if (!placement) return null;
  if (placement.resolved) return placement.resolved;
  if (placement.points && placement.points.length) return placement.points[0];
  if (placement.x !== undefined && placement.y !== undefined) return { x: placement.x, y: placement.y };
  return null;
}

function baseWorldHasInstances(baseWorld, objectName) {
  if (!baseWorld || !objectName) return false;
  return ((baseWorld.scenes || [])).some(function(scene) {
    return ((scene || {}).instances || []).some(function(instance) {
      return (instance.object || instance.name) === objectName;
    });
  });
}

function sceneName(options) {
  return options.scene || 'Game';
}

function compileModules(graph, options) {
  var catalog = options.productModuleCatalog || moduleCompiler.loadProductModuleCatalog(PRODUCT_MODULES_DIR);
  var commands = (graph.modules || []).map(function(moduleIntent, index) {
    return {
      verb: 'install',
      lineNumber: index + 1,
      id: moduleIntent.id,
      params: {
        id: moduleIntent.id,
        preset: moduleIntent.preset || 'basic'
      }
    };
  });
  if (!commands.length) {
    return {
      targetPlanLines: [],
      installedModules: [],
      tickRuntimeManifest: null
    };
  }
  return moduleCompiler.compileModuleCommands(commands, catalog, options.moduleCompileOptions || {});
}

function objectSpecForComponent(component, manifest) {
  if (!manifest) return null;
  var config = component.config || {};
  var bridge = (manifest.compilerManifest && manifest.compilerManifest.gdjsBridge) || {};
  var objectSpec = bridge.objectSpec || null;
  if (objectSpec) {
    var width = Number(config.width);
    var height = Number(config.height);
    return {
      name: component.thing,
      type: objectSpec.type,
      shape: config.shape,
      color: config.color,
      width: width,
      height: height,
      layer: config.layer,
      mechanism: objectSpec.mechanism,
      routeId: objectSpec.routeId,
      routeMechanism: objectSpec.routeMechanism,
      layerEmission: objectSpec.layerEmission,
      placementEmission: objectSpec.placementEmission
    };
  }
  return null;
}

function addObjectLines(plan, spec, placement, options, owner) {
  if (!spec || !spec.name) return;
  var scene = sceneName(options);
  if (spec.layer) {
    addLine(plan, 'add layer name=' + spec.layer + ' scene=' + scene + ' visible=true', owner, spec.name, {
      mechanism: spec.layerEmission.mechanism,
      routeId: spec.layerEmission.routeId,
      routeMechanism: spec.layerEmission.routeMechanism
    });
  }
  addLine(
    plan,
    'create object name=' + spec.name +
      ' type=' + spec.type +
      ' shape=' + spec.shape +
      ' color=' + spec.color +
      ' width=' + spec.width +
      ' height=' + spec.height +
      ' scene=' + scene,
    owner,
    spec.name,
    {
      mechanism: spec.mechanism,
      routeId: spec.routeId,
      routeMechanism: spec.routeMechanism
    }
  );

  var point = pointOf(placement);
  if (!point) {
    plan.diagnostics.push(diagnosticRouter.routeDiagnostic('missing-placement-anchor', {
      stage: 'Emit Target Plan',
      category: 'missing-placement',
      intentSubject: spec.name,
      message: 'Component object has no resolved placement: ' + spec.name
    }));
    return;
  }

  addLine(
    plan,
    'place object=' + spec.name +
      ' at=' + Math.round(point.x) + ',' + Math.round(point.y) +
      ' scene=' + scene +
      ' width=' + spec.width +
      ' height=' + spec.height +
      (spec.layer ? ' layer=' + spec.layer : ''),
    owner,
    spec.name,
    {
      mechanism: spec.placementEmission.mechanism,
      routeId: spec.placementEmission.routeId,
      routeMechanism: spec.placementEmission.routeMechanism
    }
  );
}

function addAdapterRequirement(plan, manifest, component, placement) {
  var bridge = (manifest.compilerManifest && manifest.compilerManifest.gdjsBridge) || {};
  var adapters = bridge.runtimeAdapters || [];
  adapters.forEach(function(adapter) {
    var adapterMeta = (bridge.adapterRoutes || {})[adapter];
    addUnique(plan.runtimeAdapterRequirements, plan._adapterSeen, {
      adapter: adapter,
      componentId: manifest.id,
      thing: component.thing || component.target || component.owner,
      target: component.target,
      owner: adapterMeta.owner,
      source: manifest.id,
      mechanism: adapterMeta.mechanism,
      routeId: adapterMeta.routeId,
      routeOwner: adapterMeta.routeOwner,
      routeMechanism: adapterMeta.routeMechanism,
      config: clone(component.config || {}),
      placement: placement ? {
        subject: placement.subject,
        space: placement.space,
        anchor: placement.anchor,
        resolved: clone(placement.resolved || pointOf(placement))
      } : null,
      status: bridge.status || 'pending',
      ownerTrace: 'component compiler manifest'
    }, adapter + '|' + manifest.id + '|' + (component.thing || component.target || component.owner || ''));
  });
}

function addConfigExpansions(plan, manifest, component) {
  var bridge = (manifest.compilerManifest && manifest.compilerManifest.gdjsBridge) || {};
  (bridge.configExpansions || []).forEach(function(expansion) {
    if (expansion.kind !== 'global-variable') return;
    var value = component.config && component.config[expansion.configKey];
    if (value === undefined) value = expansion.defaultValue;
    if (value === undefined) return;
    addLine(
      plan,
      'set variable name=' + expansion.name +
        ' value=' + value +
        ' type=' + (expansion.type || 'Number') +
        ' scope=' + (expansion.scope || 'global'),
      'gdjs-bridge',
      manifest.id,
      {
        mechanism: 'component-config-expansion',
        routeId: expansion.routeId || 'inventory-expansion',
        routeMechanism: expansion.routeMechanism || 'component-expansion'
      }
    );
  });
}

function emitComponent(plan, component, catalog, placementPlan, options) {
  var manifest = componentCatalog.getComponent(catalog, component.componentId);
  if (!manifest) {
    plan.diagnostics.push(diagnosticRouter.routeDiagnostic('new-reusable-game-system', {
      stage: 'Emit Target Plan',
      category: 'unknown-component',
      intentSubject: component.componentId,
      message: 'No component manifest for bridge emission: ' + component.componentId
    }));
    return;
  }

  if (manifest.kind === 'ability') {
    plan.satisfiedBy.push({
      componentId: component.componentId,
      target: component.target,
      owner: 'product-module-or-runtime-bridge'
    });
    return;
  }

  var placement = findPlacement(placementPlan, component.thing);
  var spec = objectSpecForComponent(component, manifest);
  addObjectLines(plan, spec, placement, options, 'gdjs-bridge');
  addAdapterRequirement(plan, manifest, component, placement);
  addConfigExpansions(plan, manifest, component);
}

function emitPlacementGroups(plan, graph, placementPlan, options) {
  var scene = sceneName(options);
  (graph.things || []).filter(function(thing) {
    return thing.role === 'group';
  }).forEach(function(thing) {
    var placement = findPlacement(placementPlan, thing.name);
    if (!placement || !placement.points || !placement.points.length) return;
    var objectName = thing.archetype === 'coin' ? 'Coin' : thing.name.replace(/Group$/, '');
    var emission = placement.emission || {};
    if (baseWorldHasInstances(options.baseWorld, objectName)) {
      addLine(
        plan,
        'remove placement object=' + objectName + ' scene=' + scene,
        'gdjs-bridge',
        thing.name,
        {
          mechanism: emission.mechanism,
          routeId: emission.routeId,
          routeMechanism: emission.routeMechanism
        }
      );
    }
    placement.points.forEach(function(point) {
      addLine(
        plan,
        'place object=' + objectName + ' at=' + Math.round(point.x) + ',' + Math.round(point.y) + ' scene=' + scene,
        'gdjs-bridge',
        thing.name,
        {
          mechanism: emission.mechanism,
          routeId: emission.routeId,
          routeMechanism: emission.routeMechanism
        }
      );
    });
  });
}

function emitPlacementEdits(plan, placementPlan, options) {
  var scene = sceneName(options);
  ((((placementPlan || {}).editPlan || {}).edits) || []).forEach(function(edit) {
    if (!edit || edit.unresolved || !edit.resolved) return;
    var emission = edit.emission || {};
    addLine(
      plan,
      'set placement object=' + edit.subject + ' x=' + Math.round(edit.resolved.x) + ' y=' + Math.round(edit.resolved.y) + ' scene=' + scene,
      'gdjs-bridge',
      edit.subject,
      {
        mechanism: emission.mechanism,
        routeId: emission.routeId,
        routeMechanism: emission.routeMechanism
      }
    );
  });
}

function createEmptyPlan() {
  return {
    schemaVersion: GDJS_BRIDGE_PLAN_SCHEMA_VERSION,
    target: 'gdjs-target-plan',
    targetPlanLines: [],
    targetPlanText: '',
    emitted: [],
    runtimeAdapterRequirements: [],
    installedModules: [],
    tickRuntimeManifest: null,
    satisfiedBy: [],
    diagnostics: [],
    _lineSeen: {},
    _adapterSeen: {}
  };
}

function stripInternal(plan) {
  delete plan._lineSeen;
  delete plan._adapterSeen;
  return plan;
}

function compileBridge(compiledIntent, options) {
  options = options || {};
  var graph = compiledIntent.graph || compiledIntent;
  var placementPlan = compiledIntent.placementPlan || options.placementPlan || { placements: [] };
  var resultCard = options.resultCard || compiledIntent.resultCard;
  var catalog = options.componentCatalog || componentCatalog.loadComponentCatalog();
  var plan = createEmptyPlan();
  addTrace(resultCard, 'Emit Target Plan', 'gdjs-bridge');

  var moduleResult = compileModules(graph, options);
  (moduleResult.targetPlanLines || []).forEach(function(line) {
    addLine(plan, line, 'module-compiler', 'product-module', {
      mechanism: 'product-module-expansion'
    });
  });
  plan.installedModules = clone(moduleResult.installedModules || []);
  plan.tickRuntimeManifest = clone(moduleResult.tickRuntimeManifest || null);

  (graph.components || []).forEach(function(component) {
    emitComponent(plan, component, catalog, placementPlan, options);
  });
  emitPlacementGroups(plan, graph, placementPlan, options);
  emitPlacementEdits(plan, placementPlan, options);

  plan.diagnostics.forEach(function(diagnostic) {
    addCardDiagnostic(resultCard, diagnostic);
  });
  plan.targetPlanText = plan.targetPlanLines.join('\n');
  emissionContract.assertPlan(plan);
  runtimeAdapterContract.assertRequirements(plan.runtimeAdapterRequirements);
  plan.contracts = {
    emission: 'passed',
    runtimeAdapters: 'passed'
  };
  addCardEmission(resultCard, 'bridge target lines=' + plan.targetPlanLines.length);
  addCardEmission(resultCard, 'bridge plan runtimeAdapters=' + plan.runtimeAdapterRequirements.length);
  return stripInternal(plan);
}

module.exports = {
  GDJS_BRIDGE_PLAN_SCHEMA_VERSION: GDJS_BRIDGE_PLAN_SCHEMA_VERSION,
  compileBridge: compileBridge
};
