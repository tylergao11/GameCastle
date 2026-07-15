var crypto = require('crypto');
var fs = require('fs');
var frameSet = require('./frame-set');
var semanticDictionary = require('./capability-semantic-dictionary');
var sourceContract = require('./game-semantic-source');
var spatialEngine = require('../runtime/spatial');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, Object.create(null)); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SpatialPlannerContext'; throw error; }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SPATIAL_PLANNER_CONTEXT_INVALID', label + ' must be an object'); return value; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('SPATIAL_PLANNER_CONTEXT_INVALID', label + ' must be non-empty text'); return value.trim(); }

function firstFramePath(slot) {
  var revision = frameSet.validate(slot.frameSet), state = revision.states.filter(function(item) { return item.stateId === revision.initialStateId; })[0], frameId = state && state.frameIds && state.frameIds[0], frame = revision.frames.filter(function(item) { return item.frameId === frameId; })[0];
  if (!frame || !frame.path || !fs.existsSync(frame.path)) fail('SPATIAL_PLANNER_ASSET_IMAGE_MISSING', 'Accepted FrameSet has no readable initial frame: ' + slot.semanticId);
  return { path: frame.path, contentHash: frame.sha256, resourceKind: revision.resourceKind, source: 'frame-set-initial-frame' };
}
function assetVisual(slot) {
  if (slot.frameSet) return firstFramePath(slot);
  if (!slot.path || !fs.existsSync(slot.path)) fail('SPATIAL_PLANNER_ASSET_IMAGE_MISSING', 'Accepted asset has no readable local path: ' + slot.semanticId);
  return { path: slot.path, contentHash: slot.sha256 || slot.contentHash || null, resourceKind: slot.resourceKind || null, source: 'asset-world-slot' };
}
function invocationFact(invocation, condition) {
  var result = { semanticRef: invocation.semanticRef, operation: clone(invocation.operation), arguments: clone(invocation.arguments), channel: invocation.channel };
  if (condition) result.inverted = invocation.inverted;
  else result.awaited = invocation.awaited;
  return result;
}
function interactionFact(event) {
  return {
    semanticId: event.semanticId,
    eventTypeRef: event.eventTypeRef,
    arguments: clone(event.arguments),
    conditions: event.conditions.map(function(item) { return invocationFact(item, true); }),
    actions: event.actions.map(function(item) { return invocationFact(item, false); }),
    children: event.children.map(interactionFact)
  };
}
function componentFacts(source, expansion) {
  var byId = Object.create(null), index = semanticDictionary.loadIndex();
  (expansion.components || []).forEach(function(item) { if (byId[item.semanticId]) fail('SPATIAL_PLANNER_CONTEXT_COMPONENT_MISMATCH', 'Component expansion contains duplicate evidence: ' + item.semanticId); byId[item.semanticId] = item; });
  if (Object.keys(byId).length !== source.components.length) fail('SPATIAL_PLANNER_CONTEXT_COMPONENT_MISMATCH', 'Component expansion must contain all and only frozen Source components.');
  return source.components.map(function(component) {
    var evidence = byId[component.semanticId];
    if (!evidence || evidence.componentRef !== component.componentRef || evidence.target !== component.target) fail('SPATIAL_PLANNER_CONTEXT_COMPONENT_MISMATCH', 'Component expansion does not match the frozen Source component: ' + component.semanticId);
    var definition = semanticDictionary.resolveComponent(index, component.componentRef), libraryView = definition.llm2 || {};
    return {
      semanticId: component.semanticId,
      componentRef: component.componentRef,
      library: { name: libraryView.name || definition.name, summary: libraryView.summary || null, kind: definition.kind },
      target: component.target,
      config: clone(component.config),
      bindings: Object.keys(component.bindings).sort().map(function(name) { return { name: name, use: component.bindings[name].use, arguments: clone(component.bindings[name].arguments) }; }),
      resolvedConfig: clone(evidence.resolvedConfig),
      generatedMembers: clone(evidence.generatedMembers),
      generatedEntities: clone(evidence.generatedEntities),
      generatedLayouts: clone(evidence.generatedLayouts),
      generatedEvents: clone(evidence.generatedEvents)
    };
  });
}
function createSemanticView(source, expansion) {
  return {
    game: { semanticId: source.game.semanticId, name: source.game.name },
    entities: source.entities.map(function(entity) { return { semanticId: entity.semanticId, roles: clone(entity.roles || []), objectTypeRef: entity.objectTypeRef || null, behaviorTypeRefs: clone(entity.behaviorTypeRefs || []), members: (entity.members || []).map(function(member) { return { semanticId: member.semanticId, roles: clone(member.roles || []), value: clone(member.value) }; }) }; }),
    assetIntents: source.assetIntents.map(function(intent) { return { semanticId: intent.semanticId, subject: intent.subject, roles: clone(intent.roles), description: intent.description, productionFamily: intent.productionFamily, styleId: intent.styleId, constraints: clone(intent.constraints), animation: clone(intent.animation || null) }; }),
    components: componentFacts(source, expansion),
    componentExpansion: { contentHash: expansion.contentHash, realizedSourceHash: expansion.realizedSourceHash },
    interactions: source.events.map(interactionFact)
  };
}
function createContext(inputValue, assetBoundSeed, assetWorld, semanticSource) {
  var input = spatialEngine.validateAssemblyInput(inputValue);
  object(assetBoundSeed, 'GDJS asset-bound project seed'); object(assetWorld, 'accepted AssetWorld'); object(semanticSource, 'GameSemanticSource');
  if (assetBoundSeed.documentKind !== 'gdjs-asset-bound-project-seed' || text(assetBoundSeed.sourceHash, 'GDJS asset-bound project seed.sourceHash') !== input.sourceHash || text(assetBoundSeed.assetWorldHash, 'GDJS asset-bound project seed.assetWorldHash') !== input.assetWorldHash || text(assetBoundSeed.contentHash, 'GDJS asset-bound project seed.contentHash') !== input.assetBoundProjectSeedHash) fail('SPATIAL_PLANNER_CONTEXT_INPUT_MISMATCH', 'SpatialPlannerContext requires the exact asset-bound GDJS seed recorded by Spatial Assembly Input.');
  if (assetWorld.documentKind !== 'semantic-asset-world' || text(assetWorld.sourceHash, 'accepted AssetWorld.sourceHash') !== input.sourceHash || text(assetWorld.contentHash, 'accepted AssetWorld.contentHash') !== input.assetWorldHash) fail('SPATIAL_PLANNER_CONTEXT_INPUT_MISMATCH', 'SpatialPlannerContext requires the exact accepted AssetWorld recorded by Spatial Assembly Input.');
  var source = sourceContract.validateSource(semanticSource);
  if (sourceContract.sourceHash(source) !== input.sourceHash) fail('SPATIAL_PLANNER_CONTEXT_INPUT_MISMATCH', 'SpatialPlannerContext semantic design does not match Spatial Assembly Input.');
  var slots = Object.create(null), requirementsBySubject = Object.create(null), intents = Object.create(null), geometry = Object.create(null), imageInputsBySemanticId = Object.create(null);
  (assetWorld.slots || []).forEach(function(slot) { if (!slot || !slot.semanticId || slots[slot.semanticId]) fail('SPATIAL_PLANNER_CONTEXT_ASSET_INVALID', 'Accepted AssetWorld slots must have unique semanticId values.'); slots[slot.semanticId] = slot; });
  (assetBoundSeed.assetBindingRequirements || []).forEach(function(requirement) { if (!requirement || !requirement.subject || !requirement.semanticId) fail('SPATIAL_PLANNER_CONTEXT_ASSET_INVALID', 'GDJS asset binding requirement is incomplete.'); if (!requirementsBySubject[requirement.subject]) requirementsBySubject[requirement.subject] = []; requirementsBySubject[requirement.subject].push(requirement.semanticId); });
  input.layoutIntentSnapshot.intents.forEach(function(intent) { intents[intent.subject] = intent; });
  input.geometryFacts.facts.forEach(function(fact) { if (!geometry[fact.subject]) geometry[fact.subject] = {}; geometry[fact.subject][fact.kind] = fact; });
  var subjects = input.sceneSubjects.map(function(sceneSubject) {
    var requirementIds = (requirementsBySubject[sceneSubject.subject] || []).slice().sort(), visuals = requirementIds.map(function(semanticId) {
      var slot = slots[semanticId];
      if (!slot) fail('SPATIAL_PLANNER_CONTEXT_ASSET_INVALID', 'GDJS asset binding has no accepted AssetWorld slot: ' + semanticId);
      var visual = assetVisual(slot);
      var imageRef = null;
      if (visual.resourceKind === 'image' || slot.frameSet) {
        imageRef = 'accepted-asset:' + semanticId;
        if (!imageInputsBySemanticId[semanticId]) imageInputsBySemanticId[semanticId] = { imageRef: imageRef, semanticId: semanticId, path: visual.path, contentHash: visual.contentHash, source: visual.source };
      }
      return { semanticId: semanticId, imageRef: imageRef, path: visual.path, contentHash: visual.contentHash, resourceKind: visual.resourceKind, source: visual.source };
    });
    var intent = intents[sceneSubject.subject], renderGeometry = geometry[sceneSubject.subject] && geometry[sceneSubject.subject]['render-geometry'];
    if (!intent || !renderGeometry) fail('SPATIAL_PLANNER_CONTEXT_INPUT_MISMATCH', 'Spatial Assembly Input lost declared planner facts for ' + sceneSubject.subject);
    return {
      layoutIntentId: sceneSubject.layoutIntentId,
      subject: sceneSubject.subject,
      objectName: sceneSubject.objectName,
      roles: clone(intent.roles),
      reservation: clone(intent.reservation),
      relation: clone(intent.relation),
      renderGeometry: { nativeSize: clone(renderGeometry.nativeSize), drawableBounds: clone(renderGeometry.drawableBounds), objectOrigin: clone(renderGeometry.objectOrigin) },
      acceptedVisuals: visuals
    };
  });
  var imageInputs = Object.keys(imageInputsBySemanticId).sort().map(function(semanticId) { return imageInputsBySemanticId[semanticId]; });
  var result = {
    schemaVersion: 1,
    documentKind: 'spatial-planner-context',
    sourceHash: input.sourceHash,
    assetWorldHash: input.assetWorldHash,
    spatialAssemblyInputHash: input.contentHash,
    sceneCanvas: clone(input.sceneCanvas),
    semanticView: createSemanticView(source, input.componentExpansion),
    subjects: subjects,
    imageInputs: imageInputs
  };
  result.contentHash = 'spatial-planner-context.' + hash(result);
  return result;
}

module.exports = { createContext: createContext, createSemanticView: createSemanticView, firstFramePath: firstFramePath, assetVisual: assetVisual };
