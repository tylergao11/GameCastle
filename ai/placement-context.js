var path = require('path');
var moduleCompiler = require('./module-compiler');

var PRODUCT_MODULES_DIR = path.join(__dirname, 'product-modules');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function makeEmptyContext() {
  return {
    objectBounds: {},
  };
}

function mergeBound(left, right) {
  var merged = Object.assign({}, left || {}, right || {});
  if ((merged.width === undefined || merged.width === 0) && left && left.width) merged.width = left.width;
  if ((merged.height === undefined || merged.height === 0) && left && left.height) merged.height = left.height;
  return merged;
}

function mergePlacementContexts() {
  var result = makeEmptyContext();
  Array.prototype.slice.call(arguments).forEach(function(context) {
    if (!context) return;
    Object.keys(context).forEach(function(key) {
      if (key !== 'objectBounds' && context[key] !== undefined) result[key] = clone(context[key]);
    });
    Object.keys(context.objectBounds || {}).forEach(function(name) {
      result.objectBounds[name] = mergeBound(result.objectBounds[name], context.objectBounds[name]);
    });
  });
  return result;
}

function contextFromModuleIntents(moduleIntents, productModuleCatalog) {
  var catalog = productModuleCatalog || moduleCompiler.loadProductModuleCatalog(PRODUCT_MODULES_DIR);
  var context = makeEmptyContext();
  (moduleIntents || []).forEach(function(moduleIntent) {
    var manifest = (catalog.modules || []).find(function(candidate) {
      return candidate.id === moduleIntent.id;
    });
    if (!manifest) return;
    ((manifest.declarationContract && manifest.declarationContract.spatialSubjects) || []).forEach(function(subject) {
      var bounds = subject.bounds || {};
      context.objectBounds[subject.prototypeId] = mergeBound(context.objectBounds[subject.prototypeId], {
        width: Number(bounds.width || 0), height: Number(bounds.height || 0), layer: subject.layerRole || ''
      });
    });
  });
  return context;
}

function contextFromModuleDeclaration(declaration) {
  var context = makeEmptyContext();
  (declaration && declaration.subjects || []).forEach(function(subject) {
    var bounds = subject.bounds || {};
    context.objectBounds[subject.prototypeId] = mergeBound(context.objectBounds[subject.prototypeId], {
      width: Number(bounds.width || 0), height: Number(bounds.height || 0), layer: subject.layerRole || ''
    });
  });
  return context;
}

function contextFromProjectWorld(world) {
  var context = makeEmptyContext();
  (world && world.scenes || []).forEach(function(scene) {
    (scene.instances || []).forEach(function(instance) {
      if (!instance.object) return;
      context.objectBounds[instance.object] = mergeBound(context.objectBounds[instance.object], {
        x: Number(instance.x || 0),
        y: Number(instance.y || 0),
        width: Number(instance.width || 0),
        height: Number(instance.height || 0),
        layer: instance.layer || '',
      });
    });
  });
  return context;
}

module.exports = {
  contextFromModuleIntents: contextFromModuleIntents,
  contextFromModuleDeclaration: contextFromModuleDeclaration,
  contextFromProjectWorld: contextFromProjectWorld,
  mergePlacementContexts: mergePlacementContexts,
};
