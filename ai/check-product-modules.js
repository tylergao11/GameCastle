var path = require('path');
var moduleCompiler = require('./module-compiler');

var PRODUCT_MODULES_DIR = path.join(__dirname, 'product-modules');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function walkStrings(value, visit, pathName) {
  pathName = pathName || '';
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    visit(value, pathName);
    return;
  }
  if (typeof value !== 'object') return;
  Object.keys(value).forEach(function(key) {
    walkStrings(value[key], visit, pathName ? pathName + '.' + key : key);
  });
}

function assertNoLlm2LowLevelAuthorization(catalog) {
  var patterns = [
    /LLM2 may/i,
    /LLM2 can/i,
    /LLM2 should.*\b(x|y|coordinate|event|DSL|variable gate|spawn line|move event)\b/i,
  ];
  catalog.modules.forEach(function(manifest) {
    (manifest.capabilities || []).forEach(function(capability) {
      walkStrings(capability.constraints || {}, function(text, pathName) {
        patterns.forEach(function(pattern) {
          assert(
            !pattern.test(text),
            'Capability constraint must not authorize LLM2 low-level/machine edits: ' + capability.id + '.' + pathName
          );
        });
      });
    });
  });
}

function main() {
  var catalog = moduleCompiler.loadProductModuleCatalog(PRODUCT_MODULES_DIR);
  console.log('[ProductModules] ' + catalog.modules.length + ' modules loaded');
  catalog.modules.forEach(function(manifest) {
    console.log('  OK ' + manifest.id + ' <- ' + manifest.sourceFile);
  });
  assertNoLlm2LowLevelAuthorization(catalog);

  var badModules = JSON.parse(JSON.stringify(catalog.modules));
  badModules[0].summary = 'Use core.platformer directly';
  try {
    moduleCompiler.validateProductModules(catalog.schema, badModules);
  } catch (error) {
    assert(error.message.indexOf('prohibited machine/backend form') >= 0, 'Intent-facing product module fields should reject module ids');
    return;
  }
  throw new Error('Intent-facing product module fields should reject module ids');
}

main();
