var kernel = require('./kernel');
var coordinateTruth = require('../../ai/gdevelop-truth/spatial-coordinate-truth.json');

function clone(value) { return kernel.clone(value); }
function same(left, right) { return JSON.stringify(kernel.stable(left)) === JSON.stringify(kernel.stable(right)); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SpatialPlanningSpace'; throw error; }
function assertCoordinateTruth() {
  var code = 'SPATIAL_COORDINATE_TRUTH_INVALID', core = clone(coordinateTruth);
  delete core.contentHash;
  if (coordinateTruth.schemaVersion !== 1 || coordinateTruth.documentKind !== 'gdevelop-spatial-coordinate-truth' || coordinateTruth.contentHash !== 'gdevelop-spatial-coordinate-truth.' + kernel.hash(core)) fail(code, 'Pinned GDevelop spatial coordinate truth is invalid');
  var model = coordinateTruth.coordinateModel, camera = coordinateTruth.cameraModel, layer = coordinateTruth.layerModel;
  if (!model || model.sceneSpace !== 'initial-default-camera-2d' || model.visibleRect.left !== 'zero' || model.visibleRect.top !== 'zero' || model.visibleRect.right !== 'game-resolution-width' || model.visibleRect.bottom !== 'game-resolution-height' || model.origin !== 'initial-visible-top-left' || model.positiveX !== 'right' || model.positiveY !== 'down' || model.positionSemantic !== 'object-origin' || model.sizeSemantic !== 'display-size' || model.layerSemantic !== 'layer' || model.angleUnit !== 'degree' || model.positiveAngle !== 'clockwise') fail(code, 'Pinned GDevelop coordinate model is unsupported by this Spatial Runtime');
  if (!camera || camera.supportedDefaultBehavior !== 'top-left-anchored-if-never-moved' || camera.initialCenterX !== 'game-resolution-width-half' || camera.initialCenterY !== 'game-resolution-height-half' || camera.initialZoom !== 1 || camera.initialRotationDegrees !== 0) fail(code, 'Pinned GDevelop initial camera model is unsupported by this Spatial Runtime');
  if (!layer || layer.projectOrder !== 'back-to-front' || layer.higherLayerIndex !== 'in-front' || layer.zOrderScope !== 'within-layer' || layer.higherZOrder !== 'in-front' || layer.equalZOrder !== 'stable-instance-order') fail(code, 'Pinned GDevelop layer model is unsupported by this Spatial Runtime');
  return coordinateTruth;
}
function safeRegion(canvas, snapshot, intent, code) {
  var placement = intent.relation.placement, safeArea = snapshot.coordinateContract.safeAreas[placement.safeArea];
  if (!safeArea || typeof safeArea !== 'object') fail(code, 'Dictionary relation references an unavailable safe area: ' + placement.safeArea);
  ['leftFraction', 'topFraction', 'rightFraction', 'bottomFraction'].forEach(function(field) {
    if (typeof safeArea[field] !== 'number' || !Number.isFinite(safeArea[field]) || safeArea[field] < 0 || safeArea[field] >= 1) fail(code, 'Dictionary safe area has an invalid fraction: ' + placement.safeArea + '.' + field);
  });
  var rect = {
    left: canvas.width * safeArea.leftFraction,
    top: canvas.height * safeArea.topFraction,
    right: canvas.width * (1 - safeArea.rightFraction),
    bottom: canvas.height * (1 - safeArea.bottomFraction)
  };
  rect.width = rect.right - rect.left;
  rect.height = rect.bottom - rect.top;
  if (rect.width <= 0 || rect.height <= 0) fail(code, 'Dictionary safe area has no drawable area: ' + placement.safeArea);
  return { safeAreaId: placement.safeArea, fractions: clone(safeArea), rect: rect };
}
function derive(sceneCanvas, snapshot) {
  var truth = assertCoordinateTruth(), code = 'SPATIAL_PLANNING_SPACE_INVALID';
  var layerIndex = Object.create(null);
  var layers = sceneCanvas.layers.map(function(layer, index) {
    layerIndex[layer.name] = index;
    return {
      name: layer.name,
      index: index,
      renderingType: layer.renderingType,
      cameraType: layer.cameraType,
      visibility: layer.visibility,
      followBaseLayerCamera: layer.followBaseLayerCamera,
      camera: {
        behavior: layer.defaultCameraBehavior,
        centerX: sceneCanvas.width / 2,
        centerY: sceneCanvas.height / 2,
        width: sceneCanvas.width,
        height: sceneCanvas.height,
        zoom: truth.cameraModel.initialZoom,
        rotationDegrees: truth.cameraModel.initialRotationDegrees,
        visibleRect: { left: 0, top: 0, right: sceneCanvas.width, bottom: sceneCanvas.height, width: sceneCanvas.width, height: sceneCanvas.height }
      }
    };
  });
  var subjects = snapshot.intents.filter(function(intent) { return intent.relation.placement.materialization === 'scene-instance'; }).map(function(intent) {
    var placement = intent.relation.placement, region = safeRegion(sceneCanvas, snapshot, intent, code), index = layerIndex[placement.layer];
    if (index === undefined) fail(code, 'Dictionary relation targets a missing GDJS layer: ' + placement.layer);
    var subject = {
      layoutIntentId: intent.semanticId,
      subject: intent.subject,
      mode: placement.mode,
      space: placement.space,
      reservation: clone(intent.reservation),
      legalRegion: region,
      layer: { name: placement.layer, index: index },
      zOrderRange: clone(placement.zOrderRange),
      overlap: clone(placement.overlap)
    };
    if (placement.grid) subject.grid = clone(placement.grid);
    return subject;
  });
  var result = {
    schemaVersion: 1,
    documentKind: 'spatial-planning-space',
    coordinateTruth: { documentKind: truth.documentKind, contentHash: truth.contentHash, repository: truth.source.repository, commit: truth.source.commit, gdVersion: truth.source.gdVersion, pixiVersion: truth.source.pixiVersion },
    sceneName: sceneCanvas.sceneName,
    coordinateFrame: {
      space: truth.coordinateModel.sceneSpace,
      unit: 'gdjs-scene-unit',
      visibleRect: { left: 0, top: 0, right: sceneCanvas.width, bottom: sceneCanvas.height, width: sceneCanvas.width, height: sceneCanvas.height },
      origin: { x: 0, y: 0, semantic: truth.coordinateModel.origin },
      axes: { positiveX: truth.coordinateModel.positiveX, positiveY: truth.coordinateModel.positiveY },
      positionSemantic: truth.coordinateModel.positionSemantic,
      sizeSemantic: truth.coordinateModel.sizeSemantic,
      layerSemantic: truth.coordinateModel.layerSemantic,
      angle: { unit: truth.coordinateModel.angleUnit, positiveDirection: truth.coordinateModel.positiveAngle }
    },
    layerStack: { order: truth.layerModel.projectOrder, higherLayerIndex: truth.layerModel.higherLayerIndex, zOrderScope: truth.layerModel.zOrderScope, higherZOrder: truth.layerModel.higherZOrder, equalZOrder: truth.layerModel.equalZOrder, layers: layers },
    subjects: subjects
  };
  result.contentHash = 'spatial-planning-space.' + kernel.hash(result);
  return result;
}
function validatePlanningSpace(value, sceneCanvas, snapshot) {
  var expected = derive(sceneCanvas, snapshot);
  if (!same(value, expected)) fail('SPATIAL_PLANNING_SPACE_INVALID', 'Spatial planning space must be derived exactly from pinned GDevelop truth, the active scene canvas, and the layout dictionary snapshot');
  return clone(expected);
}

module.exports = { coordinateTruth: coordinateTruth, createPlanningSpace: derive, validatePlanningSpace: validatePlanningSpace };
