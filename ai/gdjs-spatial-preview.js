var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var png = require('./local-derivation-port');
var spatialEngine = require('../runtime/spatial');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, Object.create(null)); return value; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'GDJSSpatialPreview'; throw error; }
function object(value, label, code) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, label + ' must be an object'); return value; }
function text(value, label, code) { if (typeof value !== 'string' || !value.trim()) fail(code, label + ' must be non-empty text'); return value.trim(); }
function allowed(value, fields, label, code) { Object.keys(value).forEach(function(field) { if (fields.indexOf(field) < 0) fail(code, label + ' contains unknown field: ' + field); }); }
function verifyContentHash(value, prefix, label, code) {
  var contentHash = text(value.contentHash, label + '.contentHash', code), core = clone(value);
  delete core.contentHash;
  if (contentHash !== prefix + hash(core)) fail(code, label + '.contentHash does not bind its document content');
  return contentHash;
}
function resourcePath(projection, objectName) {
  var object = (projection.project.objects || []).filter(function(item) { return item && item.name === objectName; })[0], binding = object && object.assetBinding;
  if (!binding) return null;
  if (binding.resourceName) {
    var resource = (projection.project.__assetResources || []).filter(function(item) { return item && item.name === binding.resourceName; })[0];
    return resource && resource.file || null;
  }
  if (binding.frameSet) {
    var state = (binding.frameSet.states || []).filter(function(item) { return item && item.stateId === binding.frameSet.initialStateId; })[0];
    return state && state.frames && state.frames[0] && state.frames[0].path || null;
  }
  return null;
}
function geometryBySubject(spatialInput) {
  var facts = Object.create(null);
  spatialInput.geometryFacts.facts.forEach(function(fact) { if (fact.kind === 'render-geometry') facts[fact.subject] = fact; });
  return facts;
}
function orderedInstances(spatialInput, projection) {
  var layerIndex = Object.create(null), geometry = geometryBySubject(spatialInput);
  spatialInput.sceneCanvas.layers.forEach(function(layer, index) { layerIndex[layer.name] = index; });
  return projection.instances.map(function(instance) { return { instance: instance, geometry: geometry[instance.subject], layerIndex: layerIndex[instance.layer] }; }).sort(function(left, right) { return left.layerIndex - right.layerIndex || left.instance.zOrder - right.instance.zOrder || left.instance.subject.localeCompare(right.instance.subject); });
}
function createRaster(width, height) {
  var data = new Uint8ClampedArray(width * height * 4);
  for (var index = 0; index < data.length; index += 4) { data[index] = 30; data[index + 1] = 36; data[index + 2] = 48; data[index + 3] = 255; }
  return { width: width, height: height, data: data };
}
function blend(raster, x, y, red, green, blue, alpha) {
  if (x < 0 || y < 0 || x >= raster.width || y >= raster.height || alpha <= 0) return;
  var index = (y * raster.width + x) * 4, sourceAlpha = alpha / 255, targetAlpha = raster.data[index + 3] / 255, outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
  raster.data[index] = Math.round((red * sourceAlpha + raster.data[index] * targetAlpha * (1 - sourceAlpha)) / outputAlpha);
  raster.data[index + 1] = Math.round((green * sourceAlpha + raster.data[index + 1] * targetAlpha * (1 - sourceAlpha)) / outputAlpha);
  raster.data[index + 2] = Math.round((blue * sourceAlpha + raster.data[index + 2] * targetAlpha * (1 - sourceAlpha)) / outputAlpha);
  raster.data[index + 3] = Math.round(outputAlpha * 255);
}
function worldPoint(instance, geometry, localX, localY) {
  var scaleX = instance.width / geometry.nativeSize.width, scaleY = instance.height / geometry.nativeSize.height, radians = instance.angle * Math.PI / 180, cosine = Math.cos(radians), sine = Math.sin(radians), dx = (localX - geometry.objectOrigin.x) * scaleX, dy = (localY - geometry.objectOrigin.y) * scaleY;
  return { x: instance.x + dx * cosine - dy * sine, y: instance.y + dx * sine + dy * cosine };
}
function localPoint(instance, geometry, worldX, worldY) {
  var scaleX = instance.width / geometry.nativeSize.width, scaleY = instance.height / geometry.nativeSize.height, radians = instance.angle * Math.PI / 180, cosine = Math.cos(radians), sine = Math.sin(radians), dx = worldX - instance.x, dy = worldY - instance.y;
  return { x: geometry.objectOrigin.x + (dx * cosine + dy * sine) / scaleX, y: geometry.objectOrigin.y + (-dx * sine + dy * cosine) / scaleY };
}
function destinationBounds(instance, geometry) {
  var points = [worldPoint(instance, geometry, 0, 0), worldPoint(instance, geometry, geometry.nativeSize.width, 0), worldPoint(instance, geometry, 0, geometry.nativeSize.height), worldPoint(instance, geometry, geometry.nativeSize.width, geometry.nativeSize.height)];
  return { left: Math.floor(Math.min.apply(null, points.map(function(point) { return point.x; }))), top: Math.floor(Math.min.apply(null, points.map(function(point) { return point.y; }))), right: Math.ceil(Math.max.apply(null, points.map(function(point) { return point.x; }))), bottom: Math.ceil(Math.max.apply(null, points.map(function(point) { return point.y; }))) };
}
function colorFor(subject) {
  var value = 0;
  for (var index = 0; index < subject.length; index++) value = (value * 31 + subject.charCodeAt(index)) >>> 0;
  return { red: 80 + value % 120, green: 80 + (value >>> 8) % 120, blue: 80 + (value >>> 16) % 120 };
}
function drawFallback(raster, instance, geometry) {
  var bounds = destinationBounds(instance, geometry), drawable = geometry.drawableBounds, color = colorFor(instance.subject);
  for (var y = Math.max(0, bounds.top); y < Math.min(raster.height, bounds.bottom); y++) for (var x = Math.max(0, bounds.left); x < Math.min(raster.width, bounds.right); x++) {
    var local = localPoint(instance, geometry, x + 0.5, y + 0.5);
    if (local.x >= drawable.left && local.x < drawable.right && local.y >= drawable.top && local.y < drawable.bottom) blend(raster, x, y, color.red, color.green, color.blue, 220);
  }
}
function decodeImage(filePath, subject) {
  if (path.extname(filePath).toLowerCase() !== '.png') fail('GDJS_SPATIAL_PREVIEW_IMAGE_UNSUPPORTED', 'Preview requires an accepted PNG image for ' + subject + ' until a raster decoder is supplied for this resource format.');
  try { return png.decodePng(fs.readFileSync(filePath)); } catch (error) { fail('GDJS_SPATIAL_PREVIEW_IMAGE_UNSUPPORTED', 'Preview cannot decode accepted image for ' + subject + ': ' + error.message); }
}
function drawImage(raster, instance, geometry, filePath) {
  var source = decodeImage(filePath, instance.subject), bounds = destinationBounds(instance, geometry);
  for (var y = Math.max(0, bounds.top); y < Math.min(raster.height, bounds.bottom); y++) for (var x = Math.max(0, bounds.left); x < Math.min(raster.width, bounds.right); x++) {
    var local = localPoint(instance, geometry, x + 0.5, y + 0.5);
    if (local.x < 0 || local.y < 0 || local.x >= geometry.nativeSize.width || local.y >= geometry.nativeSize.height) continue;
    var sourceX = Math.min(source.width - 1, Math.max(0, Math.floor(local.x / geometry.nativeSize.width * source.width))), sourceY = Math.min(source.height - 1, Math.max(0, Math.floor(local.y / geometry.nativeSize.height * source.height))), index = (sourceY * source.width + sourceX) * 4;
    blend(raster, x, y, source.data[index], source.data[index + 1], source.data[index + 2], source.data[index + 3]);
  }
}
function renderRaster(spatialInput, projection) {
  var canvas = spatialInput.sceneCanvas;
  if (!Number.isInteger(canvas.width) || !Number.isInteger(canvas.height)) fail('GDJS_SPATIAL_PREVIEW_CANVAS_INVALID', 'GDJS scene canvas must have integer pixel dimensions for preview rendering');
  var raster = createRaster(canvas.width, canvas.height);
  orderedInstances(spatialInput, projection).forEach(function(item) {
    if (!item.geometry) fail('GDJS_SPATIAL_PREVIEW_GEOMETRY_MISSING', 'Preview is missing render geometry for ' + item.instance.subject);
    var filePath = resourcePath(projection, item.instance.objectName);
    if (filePath && fs.existsSync(filePath)) drawImage(raster, item.instance, item.geometry, filePath);
    else drawFallback(raster, item.instance, item.geometry);
  });
  return raster;
}
function validatePreview(value, projection) {
  var code = 'GDJS_SPATIAL_PREVIEW_INVALID';
  object(value, 'GDJSSpatialPreview', code);
  allowed(value, ['schemaVersion', 'documentKind', 'sourceHash', 'assetWorldHash', 'spatialAssemblyInputHash', 'candidateProjectionHash', 'imagePath', 'imageHash', 'pixelSize', 'contentHash'], 'GDJSSpatialPreview', code);
  if (value.schemaVersion !== 1 || value.documentKind !== 'gdjs-spatial-preview') fail(code, 'GDJSSpatialPreview has an invalid kind or version');
  if (text(value.sourceHash, 'GDJSSpatialPreview.sourceHash', code) !== projection.sourceHash || text(value.assetWorldHash, 'GDJSSpatialPreview.assetWorldHash', code) !== projection.assetWorldHash || text(value.spatialAssemblyInputHash, 'GDJSSpatialPreview.spatialAssemblyInputHash', code) !== projection.spatialAssemblyInputHash || text(value.candidateProjectionHash, 'GDJSSpatialPreview.candidateProjectionHash', code) !== projection.contentHash) fail(code, 'GDJSSpatialPreview does not bind the projected candidate it displays');
  var imagePath = text(value.imagePath, 'GDJSSpatialPreview.imagePath', code);
  if (!fs.existsSync(imagePath)) fail(code, 'GDJSSpatialPreview image is unavailable');
  if (text(value.imageHash, 'GDJSSpatialPreview.imageHash', code) !== sha256(fs.readFileSync(imagePath))) fail(code, 'GDJSSpatialPreview imageHash does not bind its image bytes');
  object(value.pixelSize, 'GDJSSpatialPreview.pixelSize', code);
  if (!Number.isInteger(value.pixelSize.width) || !Number.isInteger(value.pixelSize.height) || value.pixelSize.width <= 0 || value.pixelSize.height <= 0) fail(code, 'GDJSSpatialPreview pixelSize must be positive integers');
  verifyContentHash(value, 'gdjs-spatial-preview.', 'GDJSSpatialPreview', code);
  return clone(value);
}
async function renderPreview(input) {
  input = input || {};
  object(input, 'GDJS spatial preview input'); allowed(input, ['spatialInput', 'assetBoundSeed', 'assetWorld', 'projection', 'outputDir'], 'GDJS spatial preview input');
  var spatialInput = spatialEngine.validateAssemblyInput(input.spatialInput), projection = spatialEngine.validateProjection(spatialInput, input.assetBoundSeed, input.projection);
  if (projection.basis.documentKind !== 'spatial-layout-candidate') fail('GDJS_SPATIAL_PREVIEW_BASIS_INVALID', 'GDJS preview requires a provisional candidate projection');
  object(input.assetWorld, 'accepted AssetWorld');
  if (input.assetWorld.documentKind !== 'semantic-asset-world' || input.assetWorld.sourceHash !== spatialInput.sourceHash || input.assetWorld.contentHash !== spatialInput.assetWorldHash) fail('GDJS_SPATIAL_PREVIEW_INPUT_MISMATCH', 'GDJS preview requires the accepted AssetWorld bound to the active Spatial Assembly Input');
  var outputDir = text(input.outputDir, 'GDJS spatial preview outputDir');
  fs.mkdirSync(outputDir, { recursive: true });
  var imagePath = path.resolve(outputDir, 'spatial-preview-' + projection.contentHash.slice(-24) + '.png'), raster = renderRaster(spatialInput, projection), bytes = png.encodePng(raster);
  fs.writeFileSync(imagePath, bytes);
  var result = {
    schemaVersion: 1,
    documentKind: 'gdjs-spatial-preview',
    sourceHash: spatialInput.sourceHash,
    assetWorldHash: spatialInput.assetWorldHash,
    spatialAssemblyInputHash: spatialInput.contentHash,
    candidateProjectionHash: projection.contentHash,
    imagePath: imagePath,
    imageHash: sha256(bytes),
    pixelSize: { width: spatialInput.sceneCanvas.width, height: spatialInput.sceneCanvas.height }
  };
  result.contentHash = 'gdjs-spatial-preview.' + hash(result);
  return validatePreview(result, projection);
}

module.exports = { renderPreview: renderPreview, validatePreview: validatePreview, renderRaster: renderRaster };
