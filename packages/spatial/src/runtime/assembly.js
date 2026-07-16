var crypto = require('crypto');
var engineContract = require('../../contracts/spatial-engine-contract.json');
var layoutDictionary = require('../../../semantic/contracts/semantic-layout-dictionary.json');
var planningSpace = require('./planning-space');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, Object.create(null)); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function fullHash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SpatialEngine'; throw error; }
function object(value, label, code) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, label + ' must be an object'); return value; }
function array(value, label, code) { if (!Array.isArray(value)) fail(code, label + ' must be an array'); return value; }
function text(value, label, code) { if (typeof value !== 'string' || !value.trim()) fail(code, label + ' must be non-empty text'); return value.trim(); }
function finite(value, label, code) { if (typeof value !== 'number' || !Number.isFinite(value)) fail(code, label + ' must be finite'); return value; }
function positive(value, label, code) { value = finite(value, label, code); if (value <= 0) fail(code, label + ' must be positive'); return value; }
function allowed(value, fields, label, code) { Object.keys(value).forEach(function(field) { if (fields.indexOf(field) < 0) fail(code, label + ' contains unknown field: ' + field); }); }
function same(left, right) { return JSON.stringify(stable(left)) === JSON.stringify(stable(right)); }
function verifyContentHash(value, prefix, label, code) {
  var contentHash = text(value.contentHash, label + '.contentHash', code), core = clone(value);
  delete core.contentHash;
  if (contentHash !== prefix + hash(core)) fail(code, label + '.contentHash does not bind its document content');
  return contentHash;
}

function validateReservation(value, label, code) {
  object(value, label, code); allowed(value, ['width', 'height'], label, code);
  return { width: positive(value.width, label + '.width', code), height: positive(value.height, label + '.height', code) };
}
function validateTextArray(value, label, code) {
  array(value, label, code);
  var seen = Object.create(null);
  return value.map(function(item, index) {
    item = text(item, label + '[' + index + ']', code);
    if (seen[item]) fail(code, label + ' has duplicate value: ' + item);
    seen[item] = true;
    return item;
  });
}
function validateRelation(value, label, code) {
  object(value, label, code); allowed(value, ['semanticId', 'semanticRef', 'title', 'description', 'subjects', 'placement'], label, code);
  var semanticId = text(value.semanticId, label + '.semanticId', code), semanticRef = text(value.semanticRef, label + '.semanticRef', code);
  var relation = layoutDictionary.relations[semanticRef];
  if (!relation) fail(code, label + '.semanticRef is absent from the semantic layout dictionary: ' + semanticRef);
  var title = text(value.title, label + '.title', code), description = text(value.description, label + '.description', code), subjects = validateTextArray(value.subjects, label + '.subjects', code);
  object(value.placement, label + '.placement', code);
  if (title !== relation.title || description !== relation.description || !same(value.placement, relation.placement)) fail(code, label + ' must preserve the selected semantic layout dictionary relation exactly');
  return { semanticId: semanticId, semanticRef: semanticRef, title: title, description: description, subjects: subjects, placement: clone(value.placement) };
}
function validateIntents(value, label, code) {
  array(value, label, code);
  var seen = Object.create(null), subjects = Object.create(null);
  return value.map(function(intent, index) {
    var intentLabel = label + '[' + index + ']'; object(intent, intentLabel, code); allowed(intent, ['semanticId', 'subject', 'roles', 'reservation', 'gdjsBindings', 'relation'], intentLabel, code);
    var semanticId = text(intent.semanticId, intentLabel + '.semanticId', code), subject = text(intent.subject, intentLabel + '.subject', code);
    if (seen[semanticId]) fail(code, label + ' has duplicate intent: ' + semanticId); seen[semanticId] = true;
    if (subjects[subject]) fail(code, label + ' has multiple intents for subject: ' + subject); subjects[subject] = true;
    return {
      semanticId: semanticId,
      subject: subject,
      roles: validateTextArray(intent.roles, intentLabel + '.roles', code),
      reservation: validateReservation(intent.reservation, intentLabel + '.reservation', code),
      gdjsBindings: validateTextArray(intent.gdjsBindings, intentLabel + '.gdjsBindings', code),
      relation: validateRelation(intent.relation, intentLabel + '.relation', code)
    };
  });
}
function validateLayoutPlan(value) {
  var code = 'SPATIAL_ASSEMBLY_PLAN_INVALID';
  object(value, 'SemanticLayoutPlan', code);
  allowed(value, ['schemaVersion', 'documentKind', 'compilerKind', 'sourceHash', 'realizedSourceHash', 'dictionarySource', 'coordinateContract', 'intents', 'contentHash'], 'SemanticLayoutPlan', code);
  if (value.schemaVersion !== 5 || value.documentKind !== 'semantic-layout-plan' || value.compilerKind !== 'semantic-source-to-layout-plan') fail(code, 'SemanticLayoutPlan has an invalid kind or version');
  var sourceHash = text(value.sourceHash, 'SemanticLayoutPlan.sourceHash', code), realizedSourceHash = text(value.realizedSourceHash, 'SemanticLayoutPlan.realizedSourceHash', code);
  object(value.dictionarySource, 'SemanticLayoutPlan.dictionarySource', code); object(value.coordinateContract, 'SemanticLayoutPlan.coordinateContract', code);
  if (text(value.dictionarySource.layoutDictionaryHash, 'SemanticLayoutPlan.dictionarySource.layoutDictionaryHash', code) !== fullHash(layoutDictionary)) fail(code, 'SemanticLayoutPlan.dictionarySource does not bind the current semantic layout dictionary');
  if (!same(value.coordinateContract, layoutDictionary.coordinateContract)) fail(code, 'SemanticLayoutPlan.coordinateContract must equal the semantic layout dictionary coordinate contract');
  var intents = validateIntents(value.intents, 'SemanticLayoutPlan.intents', code), contentHash = verifyContentHash(value, 'layout.', 'SemanticLayoutPlan', code);
  return { sourceHash: sourceHash, realizedSourceHash: realizedSourceHash, dictionarySource: clone(value.dictionarySource), coordinateContract: clone(value.coordinateContract), contentHash: contentHash, intents: intents };
}

function createAssemblyRequest(layoutPlan) {
  var plan = validateLayoutPlan(layoutPlan);
  var result = {
    schemaVersion: 2,
    documentKind: 'spatial-assembly-request',
    engineContract: { contractId: engineContract.contractId, schemaVersion: engineContract.schemaVersion },
    sourceHash: plan.sourceHash,
    realizedSourceHash: plan.realizedSourceHash,
    dictionarySource: clone(plan.dictionarySource),
    layoutPlanHash: plan.contentHash,
    subjects: plan.intents.map(function(intent) { return { layoutIntentId: intent.semanticId, subject: intent.subject, reservation: clone(intent.reservation) }; }),
    requiredGeometryFactKinds: Object.keys(engineContract.geometryFactKinds).sort()
  };
  result.contentHash = 'spatial-assembly-request.' + hash(result);
  return result;
}
function validateRequest(value) {
  var code = 'SPATIAL_ASSEMBLY_REQUEST_INVALID';
  object(value, 'SpatialAssemblyRequest', code);
  allowed(value, ['schemaVersion', 'documentKind', 'engineContract', 'sourceHash', 'realizedSourceHash', 'dictionarySource', 'layoutPlanHash', 'subjects', 'requiredGeometryFactKinds', 'contentHash'], 'SpatialAssemblyRequest', code);
  if (value.schemaVersion !== 2 || value.documentKind !== 'spatial-assembly-request') fail(code, 'SpatialAssemblyRequest has an invalid kind or version');
  object(value.engineContract, 'SpatialAssemblyRequest.engineContract', code);
  if (value.engineContract.contractId !== engineContract.contractId || value.engineContract.schemaVersion !== engineContract.schemaVersion) fail(code, 'SpatialAssemblyRequest references a different Spatial Engine contract');
  var sourceHash = text(value.sourceHash, 'SpatialAssemblyRequest.sourceHash', code), realizedSourceHash = text(value.realizedSourceHash, 'SpatialAssemblyRequest.realizedSourceHash', code), layoutPlanHash = text(value.layoutPlanHash, 'SpatialAssemblyRequest.layoutPlanHash', code);
  object(value.dictionarySource, 'SpatialAssemblyRequest.dictionarySource', code);
  array(value.subjects, 'SpatialAssemblyRequest.subjects', code); array(value.requiredGeometryFactKinds, 'SpatialAssemblyRequest.requiredGeometryFactKinds', code);
  var required = Object.keys(engineContract.geometryFactKinds).sort();
  if (!same(value.requiredGeometryFactKinds.slice().sort(), required)) fail(code, 'SpatialAssemblyRequest must require the current Spatial Engine geometry fact kinds');
  var subjects = Object.create(null);
  value.subjects.forEach(function(item, index) {
    var label = 'SpatialAssemblyRequest.subjects[' + index + ']'; object(item, label, code); allowed(item, ['layoutIntentId', 'subject', 'reservation'], label, code);
    var intent = text(item.layoutIntentId, label + '.layoutIntentId', code), subject = text(item.subject, label + '.subject', code);
    if (subjects[subject]) fail(code, 'SpatialAssemblyRequest has multiple subjects named ' + subject); subjects[subject] = { layoutIntentId: intent, subject: subject, reservation: validateReservation(item.reservation, label + '.reservation', code) };
  });
  var contentHash = verifyContentHash(value, 'spatial-assembly-request.', 'SpatialAssemblyRequest', code);
  return { sourceHash: sourceHash, realizedSourceHash: realizedSourceHash, dictionarySource: clone(value.dictionarySource), layoutPlanHash: layoutPlanHash, subjects: subjects, contentHash: contentHash };
}

function validateBounds(value, label, code) {
  object(value, label, code); allowed(value, ['left', 'top', 'right', 'bottom'], label, code);
  var left = finite(value.left, label + '.left', code), top = finite(value.top, label + '.top', code), right = finite(value.right, label + '.right', code), bottom = finite(value.bottom, label + '.bottom', code);
  if (right <= left || bottom <= top) fail(code, label + ' must have positive area');
  return { left: left, top: top, right: right, bottom: bottom };
}
function validatePoint(value, label, code) {
  object(value, label, code); allowed(value, ['x', 'y'], label, code);
  return { x: finite(value.x, label + '.x', code), y: finite(value.y, label + '.y', code) };
}
function validateSize(value, label, code) {
  object(value, label, code); allowed(value, ['width', 'height'], label, code);
  return { width: positive(value.width, label + '.width', code), height: positive(value.height, label + '.height', code) };
}
function validateEvidence(value, label, code) {
  object(value, label, code); allowed(value, ['documentKind', 'contentHash', 'producerRevision'], label, code);
  return { documentKind: text(value.documentKind, label + '.documentKind', code), contentHash: text(value.contentHash, label + '.contentHash', code), producerRevision: text(value.producerRevision, label + '.producerRevision', code) };
}
function validateGeometryFactSet(value, request, assetWorldHash, acceptedAssetWorld) {
  var code = 'SPATIAL_ASSEMBLY_GEOMETRY_INVALID';
  object(value, 'SpatialGeometryFactSet', code);
  allowed(value, ['schemaVersion', 'documentKind', 'sourceHash', 'assetWorldHash', 'facts', 'contentHash'], 'SpatialGeometryFactSet', code);
  if (value.schemaVersion !== 2 || value.documentKind !== 'spatial-geometry-fact-set') fail(code, 'SpatialGeometryFactSet has an invalid kind or version');
  if (text(value.sourceHash, 'SpatialGeometryFactSet.sourceHash', code) !== request.sourceHash) fail(code, 'SpatialGeometryFactSet sourceHash does not match the spatial assembly request');
  if (text(value.assetWorldHash, 'SpatialGeometryFactSet.assetWorldHash', code) !== assetWorldHash) fail(code, 'SpatialGeometryFactSet assetWorldHash does not match the accepted asset world');
  array(value.facts, 'SpatialGeometryFactSet.facts', code);
  var facts = Object.create(null), assetSlots = Object.create(null);
  if (acceptedAssetWorld) (acceptedAssetWorld.slots || []).forEach(function(slot) { assetSlots[slot.semanticId] = slot; });
  value.facts.forEach(function(fact, index) {
    var label = 'SpatialGeometryFactSet.facts[' + index + ']'; object(fact, label, code); allowed(fact, ['subject', 'kind', 'assetSemanticId', 'drawableBounds', 'nativeSize', 'objectOrigin', 'positionSemantic', 'sizeSemantic', 'layerSemantic', 'evidence'], label, code);
    var subject = text(fact.subject, label + '.subject', code), kind = text(fact.kind, label + '.kind', code);
    if (!request.subjects[subject]) fail(code, 'SpatialGeometryFactSet fact targets a subject outside the semantic request: ' + subject);
    if (!engineContract.geometryFactKinds[kind]) fail(code, 'SpatialGeometryFactSet fact has an unknown kind: ' + kind);
    if (!facts[subject]) facts[subject] = Object.create(null);
    if (facts[subject][kind]) fail(code, 'SpatialGeometryFactSet has duplicate ' + kind + ' facts for ' + subject);
    var normalized = { subject: subject, kind: kind, evidence: validateEvidence(fact.evidence, label + '.evidence', code) };
    if (kind === 'render-geometry') {
      normalized.assetSemanticId = text(fact.assetSemanticId, label + '.assetSemanticId', code);
      normalized.drawableBounds = validateBounds(fact.drawableBounds, label + '.drawableBounds', code);
      normalized.nativeSize = validateSize(fact.nativeSize, label + '.nativeSize', code);
      normalized.objectOrigin = validatePoint(fact.objectOrigin, label + '.objectOrigin', code);
      if (acceptedAssetWorld) {
        var acceptedSlot = assetSlots[normalized.assetSemanticId];
        if (!acceptedSlot) fail(code, 'Render geometry evidence references no accepted AssetWorld slot: ' + normalized.assetSemanticId);
        var expectedEvidenceHash = acceptedSlot.frameSet && acceptedSlot.frameSet.contentHash || acceptedSlot.sha256;
        if (normalized.evidence.documentKind !== 'accepted-asset-geometry' || normalized.evidence.contentHash !== expectedEvidenceHash || normalized.evidence.producerRevision !== 'gamecastle.spatial-geometry.v1') fail(code, 'Render geometry evidence does not bind the exact accepted AssetWorld slot: ' + normalized.assetSemanticId);
      }
    } else {
      normalized.positionSemantic = text(fact.positionSemantic, label + '.positionSemantic', code);
      normalized.sizeSemantic = text(fact.sizeSemantic, label + '.sizeSemantic', code);
      normalized.layerSemantic = text(fact.layerSemantic, label + '.layerSemantic', code);
      if (normalized.positionSemantic !== planningSpace.coordinateTruth.coordinateModel.positionSemantic || normalized.sizeSemantic !== planningSpace.coordinateTruth.coordinateModel.sizeSemantic || normalized.layerSemantic !== planningSpace.coordinateTruth.coordinateModel.layerSemantic) fail(code, 'GDJS coordinate fact must match the pinned GDevelop spatial coordinate truth');
      if (normalized.evidence.documentKind !== planningSpace.coordinateTruth.documentKind || normalized.evidence.contentHash !== planningSpace.coordinateTruth.contentHash || normalized.evidence.producerRevision !== planningSpace.coordinateTruth.source.commit) fail(code, 'GDJS coordinate fact evidence must bind the exact pinned GDevelop spatial coordinate truth');
    }
    facts[subject][kind] = normalized;
  });
  Object.keys(request.subjects).forEach(function(subject) {
    Object.keys(engineContract.geometryFactKinds).forEach(function(kind) { if (!facts[subject] || !facts[subject][kind]) fail('SPATIAL_ASSEMBLY_GEOMETRY_MISSING', 'Spatial assembly is missing ' + kind + ' for ' + subject); });
  });
  verifyContentHash(value, 'spatial-geometry-fact-set.', 'SpatialGeometryFactSet', code);
  return clone(value);
}
function validateComponentExpansion(value, request, code) {
  object(value, 'SemanticComponentExpansion', code);
  allowed(value, ['schemaVersion', 'documentKind', 'sourceHash', 'realizedSourceHash', 'dictionarySource', 'components', 'contentHash'], 'SemanticComponentExpansion', code);
  if (value.schemaVersion !== 1 || value.documentKind !== 'semantic-component-expansion') fail(code, 'SemanticComponentExpansion has an invalid kind or version');
  if (text(value.sourceHash, 'SemanticComponentExpansion.sourceHash', code) !== request.sourceHash || text(value.realizedSourceHash, 'SemanticComponentExpansion.realizedSourceHash', code) !== request.realizedSourceHash) fail(code, 'SemanticComponentExpansion does not match the spatial assembly request');
  object(value.dictionarySource, 'SemanticComponentExpansion.dictionarySource', code);
  if (!same(value.dictionarySource, request.dictionarySource)) fail(code, 'SemanticComponentExpansion does not bind the active semantic dictionary source');
  array(value.components, 'SemanticComponentExpansion.components', code);
  value.components.forEach(function(component, index) {
    var label = 'SemanticComponentExpansion.components[' + index + ']'; object(component, label, code); allowed(component, ['semanticId', 'componentRef', 'target', 'resolvedConfig', 'generatedMembers', 'generatedEntities', 'generatedLayouts', 'generatedEvents'], label, code);
    text(component.semanticId, label + '.semanticId', code); text(component.componentRef, label + '.componentRef', code); text(component.target, label + '.target', code); object(component.resolvedConfig, label + '.resolvedConfig', code); array(component.generatedMembers, label + '.generatedMembers', code); array(component.generatedEntities, label + '.generatedEntities', code); array(component.generatedLayouts, label + '.generatedLayouts', code); array(component.generatedEvents, label + '.generatedEvents', code);
  });
  verifyContentHash(value, 'component-expansion.', 'SemanticComponentExpansion', code);
  return clone(value);
}

function requestSubjectsMatchPlan(request, plan, code) {
  var expected = plan.intents.map(function(intent) { return { layoutIntentId: intent.semanticId, subject: intent.subject, reservation: intent.reservation }; }).sort(function(left, right) { return left.subject.localeCompare(right.subject); });
  var actual = Object.keys(request.subjects).sort().map(function(subject) { return request.subjects[subject]; });
  if (!same(actual, expected)) fail(code, 'SpatialAssemblyRequest subjects do not match the hash-bound semantic layout plan');
}
function createLayoutIntentSnapshot(plan) {
  var snapshot = {
    schemaVersion: 1,
    documentKind: 'spatial-layout-intent-snapshot',
    sourceHash: plan.sourceHash,
    realizedSourceHash: plan.realizedSourceHash,
    dictionarySource: clone(plan.dictionarySource),
    layoutPlanHash: plan.contentHash,
    coordinateContract: clone(plan.coordinateContract),
    intents: clone(plan.intents)
  };
  snapshot.contentHash = 'spatial-layout-intent-snapshot.' + hash(snapshot);
  return snapshot;
}
function validateLayoutIntentSnapshot(value, code) {
  object(value, 'SpatialLayoutIntentSnapshot', code);
  allowed(value, ['schemaVersion', 'documentKind', 'sourceHash', 'realizedSourceHash', 'dictionarySource', 'layoutPlanHash', 'coordinateContract', 'intents', 'contentHash'], 'SpatialLayoutIntentSnapshot', code);
  if (value.schemaVersion !== 1 || value.documentKind !== 'spatial-layout-intent-snapshot') fail(code, 'SpatialLayoutIntentSnapshot has an invalid kind or version');
  var sourceHash = text(value.sourceHash, 'SpatialLayoutIntentSnapshot.sourceHash', code), realizedSourceHash = text(value.realizedSourceHash, 'SpatialLayoutIntentSnapshot.realizedSourceHash', code), layoutPlanHash = text(value.layoutPlanHash, 'SpatialLayoutIntentSnapshot.layoutPlanHash', code);
  object(value.dictionarySource, 'SpatialLayoutIntentSnapshot.dictionarySource', code); object(value.coordinateContract, 'SpatialLayoutIntentSnapshot.coordinateContract', code);
  if (text(value.dictionarySource.layoutDictionaryHash, 'SpatialLayoutIntentSnapshot.dictionarySource.layoutDictionaryHash', code) !== fullHash(layoutDictionary)) fail(code, 'SpatialLayoutIntentSnapshot.dictionarySource does not bind the current semantic layout dictionary');
  if (!same(value.coordinateContract, layoutDictionary.coordinateContract)) fail(code, 'SpatialLayoutIntentSnapshot.coordinateContract must equal the semantic layout dictionary coordinate contract');
  var intents = validateIntents(value.intents, 'SpatialLayoutIntentSnapshot.intents', code), contentHash = verifyContentHash(value, 'spatial-layout-intent-snapshot.', 'SpatialLayoutIntentSnapshot', code);
  return { sourceHash: sourceHash, realizedSourceHash: realizedSourceHash, dictionarySource: clone(value.dictionarySource), layoutPlanHash: layoutPlanHash, coordinateContract: clone(value.coordinateContract), intents: intents, contentHash: contentHash };
}

function sceneIntents(snapshot) { return snapshot.intents.filter(function(intent) { return intent.relation.placement.materialization === 'scene-instance'; }); }
function validatePlanningCamera(value, label, code) {
  object(value, label, code); allowed(value, ['defaultSize', 'defaultViewport', 'width', 'height', 'viewportLeft', 'viewportTop', 'viewportRight', 'viewportBottom'], label, code);
  if (typeof value.defaultSize !== 'boolean' || typeof value.defaultViewport !== 'boolean') fail(code, label + ' has invalid default camera flags');
  var width = finite(value.width, label + '.width', code), height = finite(value.height, label + '.height', code), viewportLeft = finite(value.viewportLeft, label + '.viewportLeft', code), viewportTop = finite(value.viewportTop, label + '.viewportTop', code), viewportRight = finite(value.viewportRight, label + '.viewportRight', code), viewportBottom = finite(value.viewportBottom, label + '.viewportBottom', code);
  if (viewportLeft < 0 || viewportTop < 0 || viewportRight > 1 || viewportBottom > 1 || viewportRight <= viewportLeft || viewportBottom <= viewportTop) fail(code, label + ' has an invalid normalized viewport');
  if (!value.defaultSize && (width <= 0 || height <= 0)) fail(code, label + ' has a non-default size without positive dimensions');
  if (!value.defaultSize || !value.defaultViewport) fail('SPATIAL_SCENE_CAMERA_UNSUPPORTED', 'Spatial Planner currently requires one default-size, default-viewport camera per GDJS layer; custom camera framing is blocked before planning.');
  return { defaultSize: value.defaultSize, defaultViewport: value.defaultViewport, width: width, height: height, viewportLeft: viewportLeft, viewportTop: viewportTop, viewportRight: viewportRight, viewportBottom: viewportBottom };
}
function validateSceneCanvas(value, code) {
  object(value, 'SpatialAssemblyInput.sceneCanvas', code); allowed(value, ['sceneName', 'width', 'height', 'layers'], 'SpatialAssemblyInput.sceneCanvas', code);
  var sceneName = text(value.sceneName, 'SpatialAssemblyInput.sceneCanvas.sceneName', code), width = positive(value.width, 'SpatialAssemblyInput.sceneCanvas.width', code), height = positive(value.height, 'SpatialAssemblyInput.sceneCanvas.height', code);
  array(value.layers, 'SpatialAssemblyInput.sceneCanvas.layers', code);
  var names = Object.create(null), layers = value.layers.map(function(layer, index) {
    var label = 'SpatialAssemblyInput.sceneCanvas.layers[' + index + ']'; object(layer, label, code); allowed(layer, ['name', 'renderingType', 'cameraType', 'defaultCameraBehavior', 'visibility', 'followBaseLayerCamera', 'cameras'], label, code);
    var name = typeof layer.name === 'string' ? layer.name : null;
    if (name === null) fail(code, label + '.name must be text');
    if (names[name]) fail(code, 'SpatialAssemblyInput.sceneCanvas has duplicate layer: ' + name); names[name] = true;
    if (typeof layer.renderingType !== 'string' || typeof layer.cameraType !== 'string' || typeof layer.defaultCameraBehavior !== 'string' || typeof layer.visibility !== 'boolean' || typeof layer.followBaseLayerCamera !== 'boolean') fail(code, label + ' has invalid layer or camera scope');
    if (layer.defaultCameraBehavior !== planningSpace.coordinateTruth.cameraModel.supportedDefaultBehavior) fail('SPATIAL_SCENE_CAMERA_UNSUPPORTED', 'Spatial Planner requires the pinned top-left-anchored default camera behavior for first assembly.');
    array(layer.cameras, label + '.cameras', code);
    if (layer.cameras.length !== 1) fail('SPATIAL_SCENE_CAMERA_UNSUPPORTED', 'Spatial Planner currently requires exactly one camera per GDJS layer; multi-camera scenes are blocked before planning.');
    return { name: name, renderingType: layer.renderingType, cameraType: layer.cameraType, defaultCameraBehavior: layer.defaultCameraBehavior, visibility: layer.visibility, followBaseLayerCamera: layer.followBaseLayerCamera, cameras: layer.cameras.map(function(camera, cameraIndex) { return validatePlanningCamera(camera, label + '.cameras[' + cameraIndex + ']', code); }) };
  });
  if (!layers.length) fail(code, 'SpatialAssemblyInput.sceneCanvas must declare at least one GDJS layer');
  return { sceneName: sceneName, width: width, height: height, layers: layers };
}
function validateSceneSubjects(value, snapshot, canvas, code) {
  array(value, 'SpatialAssemblyInput.sceneSubjects', code);
  var expected = sceneIntents(snapshot), expectedBySubject = Object.create(null), seen = Object.create(null);
  expected.forEach(function(intent) { expectedBySubject[intent.subject] = intent; });
  var result = value.map(function(subject, index) {
    var label = 'SpatialAssemblyInput.sceneSubjects[' + index + ']'; object(subject, label, code); allowed(subject, ['layoutIntentId', 'subject', 'objectName'], label, code);
    var layoutIntentId = text(subject.layoutIntentId, label + '.layoutIntentId', code), name = text(subject.subject, label + '.subject', code), objectName = text(subject.objectName, label + '.objectName', code);
    if (!expectedBySubject[name] || expectedBySubject[name].semanticId !== layoutIntentId) fail(code, label + ' is outside the scene-instance layout intents');
    if (seen[name]) fail(code, 'SpatialAssemblyInput.sceneSubjects has duplicate subject: ' + name); seen[name] = true;
    return { layoutIntentId: layoutIntentId, subject: name, objectName: objectName };
  });
  if (result.length !== expected.length || expected.some(function(intent) { return !seen[intent.subject]; })) fail(code, 'SpatialAssemblyInput.sceneSubjects must contain all and only scene-instance layout subjects');
  expected.forEach(function(intent) { if (!canvas.layers.some(function(layer) { return layer.name === intent.relation.placement.layer; })) fail(code, 'SpatialAssemblyInput.sceneCanvas is missing the dictionary-declared layer for ' + intent.subject); });
  return result;
}
function deriveSceneCanvas(assetBoundSeed, code) {
  object(assetBoundSeed.project, 'GDJS asset-bound project', code);
  var project = assetBoundSeed.project, sceneName = text(assetBoundSeed.sceneName, 'GDJS asset-bound project.sceneName', code);
  object(project.properties, 'GDJS asset-bound project.properties', code); array(project.layouts, 'GDJS asset-bound project.layouts', code);
  var layout = project.layouts.filter(function(item) { return item && item.name === sceneName; })[0];
  if (!layout) fail(code, 'GDJS asset-bound project does not contain its selected scene');
  array(layout.layers, 'GDJS selected scene.layers', code);
  return validateSceneCanvas({
    sceneName: sceneName,
    width: positive(project.properties.windowWidth, 'GDJS asset-bound project.properties.windowWidth', code),
    height: positive(project.properties.windowHeight, 'GDJS asset-bound project.properties.windowHeight', code),
    layers: layout.layers.map(function(layer, index) {
      object(layer, 'GDJS selected scene.layers[' + index + ']', code);
      if (typeof layer.name !== 'string' || typeof layer.renderingType !== 'string' || typeof layer.cameraType !== 'string' || typeof layer.visibility !== 'boolean' || typeof layer.followBaseLayerCamera !== 'boolean' || !Array.isArray(layer.cameras)) fail(code, 'GDJS selected scene has incomplete layer camera facts');
      return { name: layer.name, renderingType: layer.renderingType, cameraType: layer.cameraType, defaultCameraBehavior: layer.defaultCameraBehavior || planningSpace.coordinateTruth.cameraModel.supportedDefaultBehavior, visibility: layer.visibility, followBaseLayerCamera: layer.followBaseLayerCamera, cameras: layer.cameras.map(function(camera) { return { defaultSize: camera.defaultSize, defaultViewport: camera.defaultViewport, width: camera.width, height: camera.height, viewportLeft: camera.viewportLeft, viewportTop: camera.viewportTop, viewportRight: camera.viewportRight, viewportBottom: camera.viewportBottom }; }) };
    })
  }, code);
}
function deriveSceneSubjects(assetBoundSeed, snapshot, code) {
  array(assetBoundSeed.objectDeclarations, 'GDJS asset-bound project.objectDeclarations', code);
  var declarations = Object.create(null);
  assetBoundSeed.objectDeclarations.forEach(function(declaration, index) {
    object(declaration, 'GDJS asset-bound project.objectDeclarations[' + index + ']', code);
    var semanticId = text(declaration.semanticId, 'GDJS asset-bound project.objectDeclarations[' + index + '].semanticId', code), objectName = text(declaration.objectName, 'GDJS asset-bound project.objectDeclarations[' + index + '].objectName', code);
    if (declarations[semanticId]) fail(code, 'GDJS asset-bound project has duplicate semantic object declaration: ' + semanticId);
    declarations[semanticId] = objectName;
  });
  return sceneIntents(snapshot).map(function(intent) {
    if (!declarations[intent.subject]) fail(code, 'Spatial scene subject has no GDJS object declaration: ' + intent.subject);
    return { layoutIntentId: intent.semanticId, subject: intent.subject, objectName: declarations[intent.subject] };
  });
}
function validateAssetBoundSeed(value, request, code) {
  object(value, 'GDJS asset-bound project seed', code);
  if (value.schemaVersion !== 1 || value.documentKind !== 'gdjs-asset-bound-project-seed') fail(code, 'Spatial assembly requires a current resource-bound GDJS project seed');
  if (text(value.sourceHash, 'GDJS asset-bound project seed.sourceHash', code) !== request.sourceHash || text(value.assetWorldHash, 'GDJS asset-bound project seed.assetWorldHash', code) === '') fail(code, 'GDJS asset-bound project seed does not match the spatial request');
  if (!value.contentHash) fail(code, 'GDJS asset-bound project seed must have a contentHash');
  var core = clone(value);
  delete core.contentHash;
  if (value.contentHash !== 'asset-bound-project-seed.' + hash(core)) fail(code, 'GDJS asset-bound project seed.contentHash does not bind its document content');
  return value;
}

function validateAssemblyInput(value) {
  var code = 'SPATIAL_ASSEMBLY_INPUT_INVALID';
  object(value, 'SpatialAssemblyInput', code);
  allowed(value, ['schemaVersion', 'documentKind', 'engineContract', 'sourceHash', 'realizedSourceHash', 'dictionarySource', 'spatialAssemblyRequestHash', 'layoutPlanHash', 'layoutIntentSnapshot', 'assetWorldHash', 'assetBoundProjectSeedHash', 'sceneCanvas', 'planningSpace', 'sceneSubjects', 'componentExpansion', 'geometryFacts', 'contentHash'], 'SpatialAssemblyInput', code);
  if (value.schemaVersion !== 4 || value.documentKind !== 'spatial-assembly-input') fail(code, 'SpatialAssemblyInput has an invalid kind or version');
  object(value.engineContract, 'SpatialAssemblyInput.engineContract', code);
  if (value.engineContract.contractId !== engineContract.contractId || value.engineContract.schemaVersion !== engineContract.schemaVersion) fail(code, 'SpatialAssemblyInput references a different Spatial Engine contract');
  var sourceHash = text(value.sourceHash, 'SpatialAssemblyInput.sourceHash', code), realizedSourceHash = text(value.realizedSourceHash, 'SpatialAssemblyInput.realizedSourceHash', code), requestHash = text(value.spatialAssemblyRequestHash, 'SpatialAssemblyInput.spatialAssemblyRequestHash', code), layoutPlanHash = text(value.layoutPlanHash, 'SpatialAssemblyInput.layoutPlanHash', code), assetWorldHash = text(value.assetWorldHash, 'SpatialAssemblyInput.assetWorldHash', code), assetBoundProjectSeedHash = text(value.assetBoundProjectSeedHash, 'SpatialAssemblyInput.assetBoundProjectSeedHash', code);
  object(value.dictionarySource, 'SpatialAssemblyInput.dictionarySource', code);
  var snapshot = validateLayoutIntentSnapshot(value.layoutIntentSnapshot, code);
  if (snapshot.sourceHash !== sourceHash || snapshot.realizedSourceHash !== realizedSourceHash || snapshot.layoutPlanHash !== layoutPlanHash || !same(snapshot.dictionarySource, value.dictionarySource)) fail(code, 'SpatialAssemblyInput intent snapshot does not match its outer identity');
  var subjects = Object.create(null);
  snapshot.intents.forEach(function(intent) { subjects[intent.subject] = { layoutIntentId: intent.semanticId, subject: intent.subject, reservation: intent.reservation }; });
  var canvas = validateSceneCanvas(value.sceneCanvas, code); planningSpace.validatePlanningSpace(value.planningSpace, canvas, snapshot);
  var sceneSubjects = validateSceneSubjects(value.sceneSubjects, snapshot, canvas, code), componentExpansion = validateComponentExpansion(value.componentExpansion, { sourceHash: sourceHash, realizedSourceHash: realizedSourceHash, dictionarySource: value.dictionarySource }, code), facts = validateGeometryFactSet(value.geometryFacts, { sourceHash: sourceHash, subjects: subjects }, assetWorldHash);
  verifyContentHash(value, 'spatial-assembly-input.', 'SpatialAssemblyInput', code);
  return clone(value);
}
function validateAssemblyInputAgainstSeed(inputValue, assetBoundSeedValue) {
  var input = validateAssemblyInput(inputValue), code = 'SPATIAL_ASSEMBLY_SEED_MISMATCH';
  var seed = validateAssetBoundSeed(assetBoundSeedValue, { sourceHash: input.sourceHash }, code);
  if (text(seed.assetWorldHash, 'GDJS asset-bound project seed.assetWorldHash', code) !== input.assetWorldHash || text(seed.contentHash, 'GDJS asset-bound project seed.contentHash', code) !== input.assetBoundProjectSeedHash) fail(code, 'Spatial Assembly Input does not bind the supplied asset-bound GDJS seed');
  var request = validateRequest(seed.spatialAssemblyRequest), plan = validateLayoutPlan(seed.layoutPlan), expectedSnapshot = createLayoutIntentSnapshot(plan);
  if (request.contentHash !== input.spatialAssemblyRequestHash) fail(code, 'Spatial Assembly Input must bind the exact spatial request carried by the asset-bound GDJS seed');
  if (plan.contentHash !== input.layoutPlanHash || !same(input.layoutIntentSnapshot, expectedSnapshot)) fail(code, 'Spatial Assembly Input layout intent must be derived from the exact layout plan carried by the asset-bound GDJS seed');
  var expectedCanvas = deriveSceneCanvas(seed, code);
  if (!same(input.sceneCanvas, expectedCanvas)) fail(code, 'Spatial Assembly Input sceneCanvas must be derived from the exact asset-bound GDJS seed');
  return clone(input);
}
function createAssemblyInput(requestValue, input) {
  var request = validateRequest(requestValue), code = 'SPATIAL_ASSEMBLY_INPUT_INVALID';
  input = object(input, 'SpatialAssembly input', code); allowed(input, ['layoutPlan', 'assetWorld', 'assetBoundSeed', 'componentExpansion', 'geometryFacts'], 'SpatialAssembly input', code);
  var plan = validateLayoutPlan(input.layoutPlan);
  if (plan.sourceHash !== request.sourceHash || plan.realizedSourceHash !== request.realizedSourceHash || plan.contentHash !== request.layoutPlanHash || !same(plan.dictionarySource, request.dictionarySource)) fail(code, 'SpatialAssembly input layout plan does not match its semantic request');
  requestSubjectsMatchPlan(request, plan, code);
  var assetWorld = object(input.assetWorld, 'accepted AssetWorld', code);
  if (assetWorld.documentKind !== 'semantic-asset-world' || text(assetWorld.sourceHash, 'accepted AssetWorld.sourceHash', code) !== request.sourceHash || !assetWorld.contentHash) fail(code, 'SpatialAssembly input requires a matching accepted AssetWorld');
  var assetBoundSeed = validateAssetBoundSeed(input.assetBoundSeed, request, code);
  if (text(assetBoundSeed.assetWorldHash, 'GDJS asset-bound project seed.assetWorldHash', code) !== text(assetWorld.contentHash, 'accepted AssetWorld.contentHash', code)) fail(code, 'GDJS asset-bound project seed must bind the exact accepted AssetWorld');
  var layoutIntentSnapshot = createLayoutIntentSnapshot(plan), canvas = deriveSceneCanvas(assetBoundSeed, code), sceneSubjects = deriveSceneSubjects(assetBoundSeed, layoutIntentSnapshot, code), componentExpansion = validateComponentExpansion(input.componentExpansion, request, code);
  validateSceneSubjects(sceneSubjects, layoutIntentSnapshot, canvas, code);
  var facts = validateGeometryFactSet(input.geometryFacts, request, text(assetWorld.contentHash, 'accepted AssetWorld.contentHash', code), assetWorld);
  var result = {
    schemaVersion: 4,
    documentKind: 'spatial-assembly-input',
    engineContract: { contractId: engineContract.contractId, schemaVersion: engineContract.schemaVersion },
    sourceHash: request.sourceHash,
    realizedSourceHash: request.realizedSourceHash,
    dictionarySource: clone(request.dictionarySource),
    spatialAssemblyRequestHash: request.contentHash,
    layoutPlanHash: plan.contentHash,
    layoutIntentSnapshot: layoutIntentSnapshot,
    assetWorldHash: assetWorld.contentHash,
    assetBoundProjectSeedHash: assetBoundSeed.contentHash,
    sceneCanvas: canvas,
    planningSpace: planningSpace.createPlanningSpace(canvas, layoutIntentSnapshot),
    sceneSubjects: sceneSubjects,
    componentExpansion: componentExpansion,
    geometryFacts: facts
  };
  result.contentHash = 'spatial-assembly-input.' + hash(result);
  return validateAssemblyInput(result);
}

module.exports = {
  contract: engineContract,
  createAssemblyRequest: createAssemblyRequest,
  validateAssemblyRequest: validateRequest,
  createAssemblyInput: createAssemblyInput,
  validateAssemblyInput: validateAssemblyInput,
  validateAssemblyInputAgainstSeed: validateAssemblyInputAgainstSeed,
  validateLayoutPlan: validateLayoutPlan,
  stable: stable,
  hash: hash,
  clone: clone
};
