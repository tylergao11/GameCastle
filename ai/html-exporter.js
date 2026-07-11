var fs = require('fs');
var path = require('path');
var gdevelopTruth = require('./gdevelop-truth');

var CORE_HTML_INCLUDES = [
  'libs/jshashtable.js',
  'logger.js',
  'gd.js',
  'libs/rbush.js',
  'AsyncTasksManager.js',
  'inputmanager.js',
  'jsonmanager.js',
  'Model3DManager.js',
  'ResourceLoader.js',
  'ResourceCache.js',
  'timemanager.js',
  'polygon.js',
  'runtimeobject.js',
  'profiler.js',
  'RuntimeInstanceContainer.js',
  'runtimescene.js',
  'scenestack.js',
  'force.js',
  'RuntimeLayer.js',
  'layer.js',
  'RuntimeCustomObjectLayer.js',
  'timer.js',
  'runtimewatermark.js',
  'runtimegame.js',
  'variable.js',
  'variablescontainer.js',
  'oncetriggers.js',
  'runtimebehavior.js',
  'SpriteAnimator.js',
  'spriteruntimeobject.js',
  'affinetransformation.js',
  'CustomRuntimeObjectInstanceContainer.js',
  'CustomRuntimeObject.js',
  'CustomRuntimeObject2D.js',
  'indexeddb.js',
  'events-tools/commontools.js',
  'events-tools/variabletools.js',
  'events-tools/runtimescenetools.js',
  'events-tools/inputtools.js',
  'events-tools/objecttools.js',
  'events-tools/cameratools.js',
  'events-tools/soundtools.js',
  'events-tools/storagetools.js',
  'events-tools/stringtools.js',
  'events-tools/windowtools.js',
  'events-tools/networktools.js',
  'splash/gd-logo-light.js',
  'pixi-renderers/pixi.js',
  'pixi-renderers/pixi-filters-tools.js',
  'pixi-renderers/runtimegame-pixi-renderer.js',
  'pixi-renderers/runtimescene-pixi-renderer.js',
  'pixi-renderers/layer-pixi-renderer.js',
  'pixi-renderers/pixi-image-manager.js',
  'pixi-renderers/pixi-bitmapfont-manager.js',
  'pixi-renderers/spriteruntimeobject-pixi-renderer.js',
  'pixi-renderers/CustomRuntimeObject2DPixiRenderer.js',
  'pixi-renderers/DebuggerPixiRenderer.js',
  'pixi-renderers/loadingscreen-pixi-renderer.js',
  'pixi-renderers/pixi-effects-manager.js',
  'howler-sound-manager/howler.min.js',
  'howler-sound-manager/howler-sound-manager.js',
  'fontfaceobserver-font-manager/fontfaceobserver.js',
  'fontfaceobserver-font-manager/fontfaceobserver-font-manager.js',
];

var COMMON_OBJECT_CAPABILITY_INCLUDES = [
  'object-capabilities/AnimatableBehavior.js',
  'object-capabilities/EffectBehavior.js',
  'object-capabilities/FlippableBehavior.js',
  'object-capabilities/OpacityBehavior.js',
  'object-capabilities/ResizableBehavior.js',
  'object-capabilities/ScalableBehavior.js',
  'object-capabilities/TextContainerBehavior.js',
];

var THREE_D_BASE_INCLUDES = [
  'pixi-renderers/three.js',
  'pixi-renderers/ThreeAddons.js',
  'Extensions/3D/Scene3DTools.js',
  'Extensions/3D/A_RuntimeObject3D.js',
  'Extensions/3D/A_RuntimeObject3DRenderer.js',
  'Extensions/3D/CustomRuntimeObject3D.js',
  'Extensions/3D/CustomRuntimeObject3DRenderer.js',
  'Extensions/3D/Base3DBehavior.js',
  'Extensions/3D/HemisphereLight.js',
  'Extensions/3D/AmbientLight.js',
  'Extensions/3D/DirectionalLight.js',
  'Extensions/3D/LinearFog.js',
  'Extensions/3D/ExponentialFog.js',
  'Extensions/3D/Skybox.js',
  'Extensions/3D/BloomEffect.js',
  'Extensions/3D/BrightnessAndContrastEffect.js',
  'Extensions/3D/ExposureEffect.js',
  'Extensions/3D/HueAndSaturationEffect.js',
];

var THREE_D_ASSETS = [
  'pixi-renderers/draco/gltf/draco_decoder.wasm',
  'pixi-renderers/draco/gltf/draco_wasm_wrapper.js',
];

var MANAGED_RUNTIME_ROOTS = [
  'libs',
  'events-tools',
  'splash',
  'pixi-renderers',
  'howler-sound-manager',
  'fontfaceobserver-font-manager',
  'object-capabilities',
  'Extensions',
  'Cordova',
  'Electron',
  'FacebookInstantGames',
  'InGameEditor',
  'debugger-client',
  'types',
  'gdjs-runtime.js',
  'pixi.min.js',
  'howler.min.js',
  'ResourceManagers.js',
  'RuntimeRenderers.js',
  'extensions',
  'index.html',
  'manifest.webmanifest',
];

function addUnique(list, value) {
  if (list.indexOf(value) < 0) list.push(value);
}

function walkObjects(project, visitor) {
  (project.objects || []).forEach(visitor);
  (project.layouts || []).forEach(function(layout) {
    (layout.objects || []).forEach(visitor);
  });
}

function projectUses3D(project, modules) {
  var uses3D = false;
  walkObjects(project, function(object) {
    if (gdevelopTruth.isThreeDType(object.type)) uses3D = true;
    (object.behaviors || []).forEach(function(behavior) {
      if (gdevelopTruth.isThreeDType(behavior.type)) uses3D = true;
    });
  });
  (modules || []).forEach(function(module) {
    var capabilities = module.capabilities || module.runtimeCapabilities || [];
    if (capabilities.indexOf('3d') >= 0 || capabilities.indexOf('3D') >= 0) uses3D = true;
  });
  return uses3D;
}

function buildHtmlExportManifest(project, options) {
  options = options || {};
  var scriptFiles = [];
  var assetFiles = [];

  CORE_HTML_INCLUDES.forEach(function(file) { addUnique(scriptFiles, file); });
  COMMON_OBJECT_CAPABILITY_INCLUDES.forEach(function(file) { addUnique(scriptFiles, file); });

  if (projectUses3D(project, options.modules)) {
    THREE_D_BASE_INCLUDES.forEach(function(file) { addUnique(scriptFiles, file); });
    THREE_D_ASSETS.forEach(function(file) { addUnique(assetFiles, file); });
  }

  walkObjects(project, function(object) {
    gdevelopTruth.getObjectIncludes(object.type).forEach(function(file) { addUnique(scriptFiles, file); });
    (object.behaviors || []).forEach(function(behavior) {
      gdevelopTruth.getBehaviorIncludes(behavior.type).forEach(function(file) { addUnique(scriptFiles, file); });
    });
  });

  (options.codeFiles || []).forEach(function(file) { addUnique(scriptFiles, file.fileName || file); });
  addUnique(scriptFiles, 'data.js');
  if (options.hasIntentRuntime) addUnique(scriptFiles, 'intent-runtime.js');
  if (options.hasAssetRuntime) addUnique(scriptFiles, 'asset-runtime.js');
  addUnique(scriptFiles, 'tick-runtime.js');
  (options.assetFiles || []).forEach(function(file) { addUnique(assetFiles, file); });
return {
    schemaVersion: 1,
    target: 'html',
    scriptFiles: scriptFiles,
    assetFiles: assetFiles,
  };
}

function removeManagedRuntime(outputDir, runtimeDir) {
  MANAGED_RUNTIME_ROOTS.forEach(function(root) {
    fs.rmSync(path.join(outputDir, root), { recursive: true, force: true });
  });
  if (!fs.existsSync(runtimeDir)) return;
  fs.readdirSync(runtimeDir).forEach(function(root) {
    fs.rmSync(path.join(outputDir, root), { recursive: true, force: true });
  });
}

function copyRuntimeFile(runtimeDir, outputDir, relativePath) {
  var source = path.join(runtimeDir, relativePath);
  var target = path.join(outputDir, relativePath);
  if (!fs.existsSync(source)) {
    console.warn('[HtmlExport] Missing runtime file: ' + relativePath + ' (skipped — extension may not be installed)');
    return false;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return true;
}

function syncHtmlRuntime(runtimeDir, outputDir, manifest) {
  if (!fs.existsSync(runtimeDir)) {
    throw new Error('Official GDJS runtime is missing: ' + runtimeDir + '. Run `npm run runtime:prepare`, pass --source to scripts/prepare-gdjs-runtime.js, or set GAMECASTLE_GDJS_RUNTIME_DIR.');
  }
  removeManagedRuntime(outputDir, runtimeDir);
  var copied = 0, skipped = 0, missing = [];
  manifest.scriptFiles.concat(manifest.assetFiles || []).forEach(function(file) {
    if (/^code\d+\.js$/.test(file) || file === 'data.js' || file === 'tick-runtime.js' || file === 'intent-runtime.js' || file === 'asset-runtime.js' || file === 'asset-runtime-bindings.json' || file.indexOf('assets/local/') === 0 || file.indexOf('assets/cloud/') === 0 || file.indexOf('assets/generated/') === 0) return;
    if (copyRuntimeFile(runtimeDir, outputDir, file)) copied++; else { skipped++; missing.push(file); }
  });
  if (skipped > 0) {
    console.warn('[HtmlExport] ' + copied + ' copied, ' + skipped + ' skipped (missing from GDJS runtime):');
    missing.slice(0, 5).forEach(function(f) { console.warn('  - ' + f); });
    if (missing.length > 5) console.warn('  ... and ' + (missing.length - 5) + ' more');
  }
}

function renderHtml(manifest, options) {
  options = options || {};
  var hasTickRuntime = options.hasTickRuntime || false;
  var scriptTags = manifest.scriptFiles.map(function(file) {
    return '<script src="' + file.replace(/\\/g, '/') + '" crossorigin="anonymous"></script>';
  }).join('\n');

  var gameStartScript;
  if (hasTickRuntime) {
    // Tick mode: bridge controls the game loop
    gameStartScript = [
      '    (function() {',
      '      var game = new gdjs.RuntimeGame(gdjs.projectData, gdjs.runtimeGameOptions || {});',
      '      window.GameCastleRuntimeGame = game;',
      '      game.getRenderer().createStandardCanvas(document.body);',
      '      game.getRenderer().bindStandardEvents(game.getInputManager(), window, document);',
      '      if (window.GameCastleIntentRuntime) window.GameCastleIntentRuntime.attach(game);',
      '      var gcBridge = window.GameCastleTickRuntime && window.GameCastleTickRuntime.bridge;',
      '      if (gcBridge) gcBridge.attach(game);',
      '      game.loadAllAssets(function() {',
      '        if (gcBridge) {',
      '          gcBridge.start();',
      '        } else {',
      '          game.startGameLoop();',
      '        }',
      '      });',
      '    })();',
    ].join('\n');
  } else {
    // Local mode: standard GDevelop start
    gameStartScript = [
      '    (function() {',
      '      var game = new gdjs.RuntimeGame(gdjs.projectData, gdjs.runtimeGameOptions || {});',
      '      window.GameCastleRuntimeGame = game;',
      '      game.getRenderer().createStandardCanvas(document.body);',
      '      game.getRenderer().bindStandardEvents(game.getInputManager(), window, document);',
      '      if (window.GameCastleIntentRuntime) window.GameCastleIntentRuntime.attach(game);',
      '      game.loadAllAssets(function() {',
      '        game.startGameLoop();',
      '      });',
      '    })();',
    ].join('\n');
  }

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '  <meta charset="UTF-8"/>',
    '  <meta name="theme-color" content="#000000"/>',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>',
    '  <style>',
    '    body { margin: 0; padding: 0; background-color: #000000; overflow: hidden; }',
    '    canvas { margin-left: auto; margin-right: auto; display: block; }',
    '  </style>',
    scriptTags,
    '</head>',
    '<body>',
    '  <script>',
    gameStartScript,
    '  </script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function writeHtmlExport(outputDir, manifest, options) {
  options = options || {};
  var html = renderHtml(manifest, { hasTickRuntime: !!options.hasTickRuntime });
  fs.writeFileSync(path.join(outputDir, 'index.html'), html);
  fs.writeFileSync(path.join(outputDir, 'game.html'), html);
}

module.exports = {
  buildHtmlExportManifest: buildHtmlExportManifest,
  syncHtmlRuntime: syncHtmlRuntime,
  writeHtmlExport: writeHtmlExport,
  renderHtml: renderHtml,
};
