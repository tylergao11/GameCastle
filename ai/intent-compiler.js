var intentDsl = require('./intent-dsl');
var placementResolver = require('./placement-resolver');
var componentCatalog = require('./component-catalog');
var gdjsBridge = require('./gdjs-bridge');
var diagnosticRouter = require('./intent-diagnostic-router');
var compileContract = require('./intent-compile-contract');

var INTENT_GRAPH_SCHEMA_VERSION = 1;
var RESULT_CARD_SCHEMA_VERSION = 1;

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function idFromName(prefix, name) {
  return prefix + '.' + String(name || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function titleName(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .map(function(part) {
      return part ? part[0].toUpperCase() + part.slice(1) : part;
    })
    .join('');
}

function compactName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function createEmptyGraph() {
  return {
    schemaVersion: INTENT_GRAPH_SCHEMA_VERSION,
    modules: [],
    things: [],
    components: [],
    relations: [],
    placements: [],
    values: [],
    bindings: [],
    requirements: [],
    diagnostics: []
  };
}

function createResultCard(commands) {
  return {
    schemaVersion: RESULT_CARD_SCHEMA_VERSION,
    input: commands.map(function(command) { return command.raw; }),
    resolved: [],
    rewrites: [],
    overrides: [],
    autoAdded: [],
    emitted: [],
    diagnostics: [],
    warnings: [],
    ownerTrace: []
  };
}

function makeCompilerState(catalog) {
  return {
    graph: createEmptyGraph(),
    resultCard: null,
    componentCatalog: catalog,
    thingsByName: {},
    componentsByKey: {},
    modulesById: {}
  };
}

function recordTrace(state, stage, owner) {
  var exists = state.resultCard.ownerTrace.some(function(item) {
    return item.stage === stage && item.owner === owner;
  });
  if (!exists) state.resultCard.ownerTrace.push({ stage: stage, owner: owner });
}

function addRewrite(state, from, to, owner, mechanism, stage) {
  state.resultCard.rewrites.push({
    from: from,
    to: to,
    owner: owner,
    mechanism: mechanism,
    stage: stage || 'Resolve Symbols'
  });
}

function addAuto(state, kind, id, reason) {
  state.resultCard.autoAdded.push({ kind: kind, id: id, reason: reason });
}

function addOverride(state, componentId, key, value, owner, source) {
  state.resultCard.overrides.push({
    component: componentId,
    key: key,
    value: value,
    owner: owner,
    source: source
  });
}

function addDiagnostic(state, stage, category, routeId, message, subject) {
  var diagnostic = {
    stage: stage,
    category: category,
    owner: 'intent-compiler',
    message: message
  };
  if (subject) diagnostic.intentSubject = subject;
  diagnostic = routeId ? diagnosticRouter.routeDiagnostic(routeId, diagnostic) : diagnostic;
  state.graph.diagnostics.push(diagnostic);
  state.resultCard.diagnostics.push(clone(diagnostic));
}

function addModule(state, id, preset, source) {
  if (state.modulesById[id]) return state.modulesById[id];
  var moduleIntent = {
    id: id,
    preset: preset || 'basic',
    source: source
  };
  state.graph.modules.push(moduleIntent);
  state.modulesById[id] = moduleIntent;
  state.resultCard.resolved.push({
    module: id,
    preset: moduleIntent.preset,
    source: source
  });
  return moduleIntent;
}

function addThing(state, name, archetype, role, source, autoReason) {
  var normalized = String(name || '').trim();
  var key = normalized.toLowerCase();
  if (state.thingsByName[key]) return state.thingsByName[key];
  var compactKey = compactName(normalized);
  if (state.thingsByName[compactKey]) return state.thingsByName[compactKey];
  var thing = {
    id: idFromName('thing', normalized),
    name: normalized,
    archetype: archetype || 'unknown'
  };
  if (role) thing.role = role;
  if (source) thing.source = source;
  state.graph.things.push(thing);
  state.thingsByName[key] = thing;
  state.thingsByName[compactKey] = thing;
  if (autoReason) addAuto(state, 'thing', thing.id, autoReason);
  return thing;
}

function findThingByNaturalName(state, name) {
  var key = String(name || '').trim().toLowerCase();
  return state.thingsByName[key] || state.thingsByName[compactName(name)] || null;
}

function inferModuleFromDescription(description) {
  var lower = String(description || '').toLowerCase();
  if (lower.indexOf('platformer') >= 0 || lower.indexOf('platform') >= 0) {
    return { id: 'core.platformer', preset: lower.indexOf('mobile') >= 0 ? 'mobile' : 'basic' };
  }
  if (lower.indexOf('shooter') >= 0 || lower.indexOf('shoot') >= 0) {
    return { id: 'core.shooter', preset: lower.indexOf('mobile') >= 0 ? 'mobile' : 'basic' };
  }
  return null;
}

function inferThingArchetype(name) {
  var lower = String(name || '').toLowerCase();
  if (lower === 'player' || lower === 'hero' || lower === 'main character') return 'player';
  if (lower.indexOf('coin') >= 0) return 'coin';
  if (lower.indexOf('enemy') >= 0) return 'enemy';
  if (lower.indexOf('button') >= 0 || lower.indexOf('joystick') >= 0) return 'ui';
  if (lower.indexOf('inventory') >= 0) return 'inventory';
  return 'unknown';
}

function mergeConfig(defaultConfig, overrides) {
  var config = clone(defaultConfig || {}) || {};
  Object.keys(overrides || {}).forEach(function(key) {
    if (overrides[key] !== undefined) config[key] = overrides[key];
  });
  return config;
}

function resolveComponentConfig(state, manifest, overrides, source) {
  var compiler = manifest.compilerManifest || {};
  var inheritance = compiler.inheritance || {};
  var exposed = inheritance.exposedOverrides || [];
  var config = clone(compiler.defaultConfig || {}) || {};
  Object.keys(config).forEach(function(key) {
    addAuto(
      state,
      'config-default',
      manifest.id + '.' + key,
      'inherited from ' + (inheritance.defaultOwner || 'component-manifest')
    );
  });
  Object.keys(overrides || {}).forEach(function(key) {
    if (overrides[key] === undefined) return;
    if (exposed.indexOf(key) < 0) {
      throw new Error('Component override is not exposed by inheritance contract: ' + manifest.id + '.' + key);
    }
    config[key] = overrides[key];
    addOverride(state, manifest.id, key, overrides[key], 'intent-compiler', source);
  });
  return config;
}

function normalizeAction(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function addComponent(state, componentId, target, owner, thing, config, source, autoReason) {
  var key = [componentId, target || '', owner || '', thing || ''].join('|').toLowerCase();
  if (state.componentsByKey[key]) return state.componentsByKey[key];
  var component = {
    id: idFromName('cmp', componentId + '.' + (target || owner || thing || state.graph.components.length + 1)),
    componentId: componentId,
    config: config || {}
  };
  if (target) component.target = target;
  if (owner) component.owner = owner;
  if (thing) component.thing = thing;
  if (source) component.source = source;
  state.graph.components.push(component);
  state.componentsByKey[key] = component;
  if (autoReason) addAuto(state, 'component', component.id, autoReason);
  return component;
}

function hasMovement(state, targetName) {
  return state.graph.components.some(function(component) {
    return component.target === targetName && /movement/.test(component.componentId);
  });
}

function ensureMovement(state, targetName, reason) {
  if (hasMovement(state, targetName)) return;
  addComponent(state, 'movement.platformer', targetName, null, null, {}, 'auto', reason);
  state.graph.requirements.push({
    subject: targetName,
    requirement: 'movement',
    status: 'autoAdded',
    owner: 'intent-compiler'
  });
}

function ensureRequiredComponents(state, manifest, targetName) {
  var compiler = manifest.compilerManifest || {};
  (compiler.requires || []).forEach(function(requirement) {
    if (!requirement.componentId) return;
    var requiredTarget = requirement.target === 'sameTarget' ? targetName : requirement.target;
    if (!requiredTarget) return;
    addComponent(
      state,
      requirement.componentId,
      requiredTarget,
      null,
      null,
      {},
      'component:' + manifest.id,
      requirement.reason || (manifest.id + ' requires ' + requirement.componentId)
    );
    state.graph.requirements.push({
      subject: requiredTarget,
      requirement: requirement.componentId,
      status: 'autoAdded',
      owner: 'component catalog',
      sourceComponent: manifest.id
    });
  });
}

function addPlacement(state, subject, placement, source) {
  var anchor = placement.anchor;
  var anchorLower = anchor.toLowerCase();
  var anchorThing = null;
  if (anchorLower !== 'screen' && anchorLower !== 'screen.safearea') {
    anchorThing = findThingByNaturalName(state, anchor);
    if (anchorThing) {
      if (anchorThing.name !== anchor) addRewrite(state, anchor, anchorThing.name, 'intent-compiler', 'natural-anchor', 'Resolve Placement Intent');
      anchor = anchorThing.name;
    }
  }
  var placementIntent = {
    subject: subject,
    anchor: anchor,
    space: anchor.toLowerCase() === 'screen' ? 'ui' : (anchorThing && anchorThing.archetype === 'ui' ? 'ui_relative' : 'object_relative'),
    direction: placement.direction
  };
  if (placement.pattern) placementIntent.pattern = placement.pattern;
  if (placement.count !== undefined) placementIntent.count = placement.count;
  if (source) placementIntent.source = source;
  state.graph.placements.push(placementIntent);
  return placementIntent;
}

function processMakeGame(state, command) {
  var inferred = inferModuleFromDescription(command.description);
  if (inferred) {
    addModule(state, inferred.id, inferred.preset, command.raw);
    addRewrite(state, command.description, inferred.id, 'intent-compiler', 'module-inference', 'Resolve Symbols');
    if (inferred.id === 'core.platformer') {
      addThing(state, 'Player', 'player', 'hero', 'module:' + inferred.id, 'module preset provides Player');
      addComponent(state, 'movement.platformer', 'Player', null, null, {}, 'module:' + inferred.id, 'module preset provides movement');
    }
    return;
  }
  addDiagnostic(state, 'Resolve Symbols', 'module-unresolved', 'new-reusable-game-system', 'Could not infer module from: ' + command.description);
}

function processGiveAbility(state, command) {
  var thing = addThing(state, command.target, inferThingArchetype(command.target), undefined, command.raw);
  var manifest = componentCatalog.findAbilityComponent(state.componentCatalog, command.ability);
  if (!manifest) {
    addDiagnostic(state, 'Resolve Symbols', 'unknown-component', 'new-reusable-game-system', 'Could not resolve ability component: ' + command.ability, command.target);
    return;
  }
  var compiler = manifest.compilerManifest;
  var componentId = compiler.componentId;
  addComponent(state, componentId, thing.name, null, null, resolveComponentConfig(state, manifest, {}, command.raw), command.raw);
  addRewrite(state, command.ability, componentId, 'component-catalog', 'component-alias', 'Resolve Symbols');
  state.resultCard.resolved.push({ target: thing.name, component: componentId, source: command.raw });
}

function processAddControl(state, command) {
  var targetThing = addThing(state, command.target, inferThingArchetype(command.target), undefined, command.raw, 'control target referenced');
  var manifest = componentCatalog.findControlComponent(state.componentCatalog, command.control, command.action);
  if (!manifest) {
    addDiagnostic(state, 'Resolve Symbols', 'unknown-component', 'new-reusable-game-system', 'Could not resolve control component: ' + command.control, targetThing.name);
    return;
  }
  var compiler = manifest.compilerManifest;
  var componentId = compiler.componentId;
  var action = command.action ? normalizeAction(command.action) : compiler.defaultAction;
  var controlThingName = compiler.thingName || titleName(command.control);
  var controlThing = addThing(state, controlThingName, compiler.thingArchetype || 'ui', compiler.role || 'control', command.raw, 'control thing from component');
  ensureRequiredComponents(state, manifest, targetThing.name);
  addComponent(state, componentId, targetThing.name, null, controlThing.name, resolveComponentConfig(state, manifest, command.action ? { action: action } : {}, command.raw), command.raw);
  state.graph.relations.push({
    type: 'controls',
    from: controlThing.name,
    to: targetThing.name,
    params: { action: action }
  });
  state.graph.bindings.push({
    action: action,
    source: controlThing.name,
    target: targetThing.name,
    inputKind: (compiler.binding || {}).inputKind || 'touch_button'
  });
  addPlacement(state, controlThing.name, command.placement, command.raw);
  addRewrite(state, command.control, componentId, 'component-catalog', 'component-alias', 'Resolve Symbols');
  state.resultCard.resolved.push({
    target: targetThing.name,
    component: componentId,
    placement: command.placement.anchor + '.' + command.placement.direction,
    requirements: [targetThing.name + '.movement ok']
  });
}

function processAddInventory(state, command) {
  var manifest = componentCatalog.findSystemComponent(state.componentCatalog, 'inventory');
  if (!manifest) {
    addDiagnostic(state, 'Resolve Symbols', 'unknown-component', 'new-reusable-game-system', 'Could not resolve system component: inventory', command.owner);
    return;
  }
  var compiler = manifest.compilerManifest;
  var ownerThing = addThing(state, command.owner, inferThingArchetype(command.owner), undefined, command.raw, 'inventory owner referenced');
  var inventoryThing = addThing(state, compiler.thingName || 'Inventory', compiler.thingArchetype || 'inventory', compiler.role || 'inventory', command.raw, 'inventory component thing');
  addComponent(state, compiler.componentId, null, ownerThing.name, inventoryThing.name, resolveComponentConfig(state, manifest, { slots: command.slots }, command.raw), command.raw);
  state.graph.relations.push({ type: 'owns', from: ownerThing.name, to: inventoryThing.name });
  addPlacement(state, inventoryThing.name, command.placement, command.raw);
  addRewrite(state, 'inventory', compiler.componentId, 'component-catalog', 'component-alias', 'Resolve Symbols');
  state.resultCard.resolved.push({
    owner: ownerThing.name,
    component: compiler.componentId,
    placement: command.placement.anchor + '.' + command.placement.direction
  });
}

function processPlaceGroup(state, command) {
  var groupName = titleName(command.subject);
  if (!/group$/i.test(groupName)) groupName += 'Group';
  var thing = addThing(state, groupName, inferThingArchetype(command.archetype), 'group', command.raw);
  var placementIntent = addPlacement(state, thing.name, command.placement, command.raw);
  state.graph.relations.push({
    type: 'near',
    from: thing.name,
    to: placementIntent.anchor,
    params: {
      direction: placementIntent.direction,
      pattern: placementIntent.pattern,
      count: placementIntent.count
    }
  });
  addRewrite(state, command.subject, thing.id, 'intent-compiler', 'semantic-group', 'Build Intent Graph');
  state.resultCard.resolved.push({
    subject: thing.name,
    placement: command.placement.anchor + '.' + command.placement.direction,
    pattern: command.placement.pattern,
    count: command.placement.count
  });
}

function emitGraphFacts(state, placementPlan, bridgePlan) {
  state.resultCard.emitted = [
    'intent graph things=' + state.graph.things.length,
    'intent graph components=' + state.graph.components.length,
    'intent graph relations=' + state.graph.relations.length,
    'intent graph placements=' + state.graph.placements.length,
    'intent graph bindings=' + state.graph.bindings.length,
    'placement plan placements=' + (placementPlan ? placementPlan.placements.length : 0),
    'bridge plan internalDslLines=' + (bridgePlan ? bridgePlan.dslLines.length : 0),
    'bridge plan runtimeAdapters=' + (bridgePlan ? bridgePlan.runtimeAdapterRequirements.length : 0)
  ];
}

function compileIntentAst(ast, options) {
  options = options || {};
  if (!ast || ast.schemaVersion !== intentDsl.INTENT_DSL_SCHEMA_VERSION) {
    throw new Error('Unsupported Intent DSL AST');
  }
  var state = makeCompilerState(options.componentCatalog || componentCatalog.loadComponentCatalog());
  state.resultCard = createResultCard(ast.commands || []);
  recordTrace(state, 'Parse', 'intent-dsl');
  recordTrace(state, 'Resolve Symbols', 'intent-compiler');
  recordTrace(state, 'Build Intent Graph', 'intent-compiler');
  recordTrace(state, 'Validate Requirements', 'intent-compiler');
  recordTrace(state, 'Fill Defaults', 'intent-compiler');

  (ast.commands || []).forEach(function(command) {
    if (command.kind === 'makeGame') processMakeGame(state, command);
    else if (command.kind === 'giveAbility') processGiveAbility(state, command);
    else if (command.kind === 'addControl') processAddControl(state, command);
    else if (command.kind === 'addInventory') processAddInventory(state, command);
    else if (command.kind === 'placeGroup') processPlaceGroup(state, command);
    else addDiagnostic(state, 'Build Intent Graph', 'unsupported-command', null, 'Unsupported AST command: ' + command.kind);
  });

  var placementPlan = placementResolver.resolvePlacements(
    state.graph,
    options.placementContext,
    { resultCard: state.resultCard }
  );
  if (state.graph.bindings.length) {
    recordTrace(state, 'Compile Bindings', 'binding-compiler');
  }
  recordTrace(state, 'Expand Components', 'component-expander');
  var bridgePlan = gdjsBridge.compileBridge({
    graph: state.graph,
    placementPlan: placementPlan,
    resultCard: state.resultCard
  }, {
    componentCatalog: state.componentCatalog,
    productModuleCatalog: options.productModuleCatalog,
    moduleCompileOptions: options.moduleCompileOptions,
    scene: options.scene,
    resultCard: state.resultCard
  });
  emitGraphFacts(state, placementPlan, bridgePlan);
  var compiled = {
    schemaVersion: 1,
    graph: state.graph,
    placementPlan: placementPlan,
    bridgePlan: bridgePlan,
    resultCard: state.resultCard
  };
  compiled.contracts = compileContract.assertCompiledIntent(compiled);
  return compiled;
}

function compileIntentDsl(text, options) {
  return compileIntentAst(intentDsl.parseIntentDsl(text), options);
}

module.exports = {
  INTENT_GRAPH_SCHEMA_VERSION: INTENT_GRAPH_SCHEMA_VERSION,
  RESULT_CARD_SCHEMA_VERSION: RESULT_CARD_SCHEMA_VERSION,
  compileIntentAst: compileIntentAst,
  compileIntentDsl: compileIntentDsl
};
