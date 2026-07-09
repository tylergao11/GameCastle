var path = require('path');
var moduleCompiler = require('./module-compiler');

var PRODUCT_MODULES_DIR = path.join(__dirname, 'product-modules');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function renderTemplate(text, values) {
  return String(text || '').replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, function(_match, key) {
    return values[key] === undefined || values[key] === null ? '' : String(values[key]);
  });
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

function valuesForModule(moduleIntent, manifest) {
  var values = {};
  Object.assign(values, clone(manifest.defaults || {}));
  Object.assign(values, clone((manifest.compiler && manifest.compiler.slots) || {}));
  values.id = moduleIntent.id;
  values.preset = moduleIntent.preset || manifest.defaultPreset || 'basic';
  return values;
}

function addCreateObjectBounds(bounds, line) {
  var match = String(line || '').match(/^create\s+object\s+name=([^\s]+).*?\bwidth=([0-9.]+)\s+height=([0-9.]+)/i);
  if (!match) return;
  var name = match[1];
  bounds[name] = mergeBound(bounds[name], {
    width: Number(match[2]),
    height: Number(match[3]),
  });
}

function addPlaceObjectBounds(bounds, line) {
  var match = String(line || '').match(/^place\s+object=([^\s]+)\s+at=([-0-9.]+),([-0-9.]+)(.*)$/i);
  if (!match) return;
  var name = match[1];
  var tail = match[4] || '';
  var widthMatch = tail.match(/\bwidth=([0-9.]+)/i);
  var heightMatch = tail.match(/\bheight=([0-9.]+)/i);
  bounds[name] = mergeBound(bounds[name], {
    x: Number(match[2]),
    y: Number(match[3]),
    width: widthMatch ? Number(widthMatch[1]) : undefined,
    height: heightMatch ? Number(heightMatch[1]) : undefined,
  });
}

function contextFromModuleIntents(moduleIntents, productModuleCatalog) {
  var catalog = productModuleCatalog || moduleCompiler.loadProductModuleCatalog(PRODUCT_MODULES_DIR);
  var context = makeEmptyContext();
  (moduleIntents || []).forEach(function(moduleIntent) {
    var manifest = (catalog.modules || []).find(function(candidate) {
      return candidate.id === moduleIntent.id;
    });
    if (!manifest) return;
    var values = valuesForModule(moduleIntent, manifest);
    ((manifest.compiler && manifest.compiler.dsl) || []).forEach(function(templateLine) {
      var line = renderTemplate(templateLine, values);
      addCreateObjectBounds(context.objectBounds, line);
      addPlaceObjectBounds(context.objectBounds, line);
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
  contextFromProjectWorld: contextFromProjectWorld,
  mergePlacementContexts: mergePlacementContexts,
};
