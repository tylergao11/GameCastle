var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var sourceRoot = require('./gdevelop-source-root');

var ROOT = path.resolve(__dirname, '..');
var SOURCE_ROOT = sourceRoot.resolveSourceRoot();
var SOURCE_MANIFEST = require('../ai/gdevelop-truth/gdevelop-codegen-source.json');
var SPATIAL_SOURCE = require('../ai/gdevelop-truth/spatial-coordinate-source.json');
var PROJECT_DEFAULTS = require('../ai/gdevelop-truth/project-defaults.json');
var OUT = path.join(ROOT, 'ai', 'gdevelop-truth', 'spatial-coordinate-truth.json');
var CHECK = process.argv.indexOf('--check') >= 0;
var SOURCE_FILES = [
  'GDJS/package.json',
  'GDJS/package-lock.json',
  'GDJS/Runtime/RuntimeLayer.ts',
  'GDJS/Runtime/layer.ts',
  'GDJS/Runtime/runtimescene.ts',
  'GDJS/Runtime/RuntimeInstanceContainer.ts',
  'GDJS/Runtime/runtimeobject.ts',
  'GDJS/Runtime/spriteruntimeobject.ts',
  'GDJS/Runtime/pixi-renderers/runtimescene-pixi-renderer.ts',
  'GDJS/Runtime/pixi-renderers/layer-pixi-renderer.ts',
  'GDJS/Runtime/pixi-renderers/spriteruntimeobject-pixi-renderer.ts'
];

function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function hashBytes(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function hashValue(value) { return hashBytes(JSON.stringify(stable(value))).slice(0, 24); }
function read(relativePath) {
  var absolutePath = path.join(SOURCE_ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) throw new Error('Missing pinned GDevelop spatial source: ' + absolutePath);
  return fs.readFileSync(absolutePath, 'utf8');
}
function assertSource(relativePath, fragments) {
  var source = read(relativePath);
  fragments.forEach(function(fragment) {
    if (source.indexOf(fragment) < 0) throw new Error('Pinned GDevelop spatial evidence drifted: ' + relativePath + ' no longer contains ' + fragment);
  });
}
if (SPATIAL_SOURCE.schemaVersion !== 1 || SPATIAL_SOURCE.repository !== SOURCE_MANIFEST.repository || SPATIAL_SOURCE.commit !== SOURCE_MANIFEST.commit) throw new Error('Pinned GDevelop spatial source manifest does not match the canonical codegen source revision');
if (JSON.stringify(SPATIAL_SOURCE.files.map(function(file) { return file.path; })) !== JSON.stringify(SOURCE_FILES)) throw new Error('Pinned GDevelop spatial source file set drifted');
SPATIAL_SOURCE.files.forEach(function(file) {
  var actualHash = hashBytes(fs.readFileSync(path.join(SOURCE_ROOT, file.path)));
  if (actualHash !== file.sha256) throw new Error('Pinned GDevelop spatial source checksum mismatch: ' + file.path);
});

assertSource('GDJS/Runtime/runtimescene.ts', [
  'for (let i = 0, len = sceneData.layers.length; i < len; ++i)',
  'this._orderedLayers.push(layer);',
  'getUnrotatedViewportMinX(): float {\n      return 0;',
  'getUnrotatedViewportMinY(): float {\n      return 0;',
  'return this._cachedGameResolutionWidth;',
  'return this._cachedGameResolutionHeight;',
  'return this._cachedGameResolutionWidth / 2;',
  'return this._cachedGameResolutionHeight / 2;'
]);
assertSource('GDJS/Runtime/RuntimeLayer.ts', [
  "layerData.defaultCameraBehavior || 'top-left-anchored-if-never-moved'"
]);
assertSource('GDJS/Runtime/layer.ts', [
  'this._cameraX = this._runtimeScene.getViewportOriginX();',
  'this._cameraY = this._runtimeScene.getViewportOriginY();',
  'x -= this.getRuntimeScene()._cachedGameResolutionWidth / 2;',
  'y -= this.getRuntimeScene()._cachedGameResolutionHeight / 2;',
  'position[0] = x + this.getCameraX(cameraId);',
  'position[1] = y + this.getCameraY(cameraId);'
]);
assertSource('GDJS/Runtime/RuntimeInstanceContainer.ts', [
  'newObject.setPosition(instanceData.x + xPos, instanceData.y + yPos);',
  'newObject.setZOrder(instanceData.zOrder);',
  'newObject.setLayer(instanceData.layer);',
  'this.getRenderer().setLayerIndex(layer, newIndex);'
]);
assertSource('GDJS/Runtime/runtimeobject.ts', [
  'Set the position of the object.',
  'getDrawableX will differ.',
  'getDrawableY will differ.'
]);
assertSource('GDJS/Runtime/spriteruntimeobject.ts', [
  'return this.x - animationFrame.origin.x * absScaleX;',
  'return this.y - animationFrame.origin.y * absScaleY;'
]);
assertSource('GDJS/Runtime/pixi-renderers/runtimescene-pixi-renderer.ts', [
  'this._pixiContainer.addChildAt(layerPixiObject, index);'
]);
assertSource('GDJS/Runtime/pixi-renderers/layer-pixi-renderer.ts', [
  'this._pixiContainer.sortableChildren = true;',
  'child.zIndex = zOrder || LayerPixiRenderer.zeroZOrderForPixi;',
  'child.zIndex = newZOrder;'
]);
assertSource('GDJS/Runtime/pixi-renderers/spriteruntimeobject-pixi-renderer.ts', [
  'this._sprite.position.x =',
  'this._sprite.position.y =',
  'this._sprite.rotation = gdjs.toRad(this._object.angle);'
]);
var packageLock = JSON.parse(read('GDJS/package-lock.json'));
var pixiDisplay = packageLock.packages && packageLock.packages['node_modules/@pixi/display'];
if (!pixiDisplay || pixiDisplay.version !== SPATIAL_SOURCE.runtimeDependency.version || pixiDisplay.integrity !== SPATIAL_SOURCE.runtimeDependency.integrity) throw new Error('Pinned Pixi display dependency does not match the GDevelop package lock');
var installedPixiDisplay = JSON.parse(read('GDJS/node_modules/@pixi/display/package.json'));
if (installedPixiDisplay.name !== SPATIAL_SOURCE.runtimeDependency.package || installedPixiDisplay.version !== SPATIAL_SOURCE.runtimeDependency.version) throw new Error('Installed Pixi display dependency does not match the pinned package lock');
if (hashBytes(fs.readFileSync(path.join(SOURCE_ROOT, SPATIAL_SOURCE.runtimeDependency.file))) !== SPATIAL_SOURCE.runtimeDependency.sha256) throw new Error('Installed Pixi display evidence checksum mismatch');
assertSource(SPATIAL_SOURCE.runtimeDependency.file, [
  'a.zIndex === b.zIndex ? a._lastSortedIndex - b._lastSortedIndex : a.zIndex - b.zIndex',
  'this.children.sort(sortChildren)',
  'this.children[i].render(renderer)'
]);

var gdjsPackage = JSON.parse(read('GDJS/package.json'));
var pixiVersion = (gdjsPackage.dependencies || gdjsPackage.devDependencies || {})['pixi.js'];
if (typeof pixiVersion !== 'string' || !pixiVersion) throw new Error('Pinned GDevelop package has no Pixi dependency version');
var output = stable({
  schemaVersion: 1,
  documentKind: 'gdevelop-spatial-coordinate-truth',
  source: {
    repository: SOURCE_MANIFEST.repository,
    commit: SOURCE_MANIFEST.commit,
    gdVersion: PROJECT_DEFAULTS.project.initialGDVersion,
    pixiVersion: pixiVersion,
    files: SPATIAL_SOURCE.files,
    runtimeDependency: SPATIAL_SOURCE.runtimeDependency
  },
  coordinateModel: {
    sceneSpace: 'initial-default-camera-2d',
    visibleRect: { left: 'zero', top: 'zero', right: 'game-resolution-width', bottom: 'game-resolution-height' },
    origin: 'initial-visible-top-left',
    positiveX: 'right',
    positiveY: 'down',
    positionSemantic: 'object-origin',
    sizeSemantic: 'display-size',
    layerSemantic: 'layer',
    angleUnit: 'degree',
    positiveAngle: 'clockwise'
  },
  cameraModel: {
    supportedDefaultBehavior: 'top-left-anchored-if-never-moved',
    initialCenterX: 'game-resolution-width-half',
    initialCenterY: 'game-resolution-height-half',
    initialZoom: 1,
    initialRotationDegrees: 0
  },
  layerModel: {
    projectOrder: 'back-to-front',
    higherLayerIndex: 'in-front',
    zOrderScope: 'within-layer',
    higherZOrder: 'in-front',
    equalZOrder: 'stable-instance-order'
  }
});
output.contentHash = 'gdevelop-spatial-coordinate-truth.' + hashValue(output);
var serialized = JSON.stringify(output, null, 2) + '\n';
if (CHECK) {
  if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== serialized) throw new Error('GDevelop spatial coordinate truth drifted. Run node scripts/extract-gdevelop-spatial-coordinate-truth.js');
  console.log('[GDevelopSpatialCoordinateTruth] snapshot OK: ' + output.source.gdVersion + ' @ ' + output.source.commit);
} else {
  fs.writeFileSync(OUT, serialized, 'utf8');
  console.log('[GDevelopSpatialCoordinateTruth] wrote ' + OUT);
}
