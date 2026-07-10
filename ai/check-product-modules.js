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

  var badCapabilityDsl = JSON.parse(JSON.stringify(catalog.modules));
  badCapabilityDsl[0].capabilities[0].dsl = {
    commands: ['create object name=Player scene=Game'],
  };
  try {
    moduleCompiler.validateProductModules(catalog.schema, badCapabilityDsl);
  } catch (error) {
    assert(error.message.indexOf('must not expose low-level DSL') >= 0, 'Product module validation should reject capability DSL');
    badCapabilityDsl = null;
  }
  assert(badCapabilityDsl === null, 'Product module validation should fail when a capability exposes low-level DSL');

  var badLegacyPatchTemplates = JSON.parse(JSON.stringify(catalog.modules));
  badLegacyPatchTemplates[0].compiler.slotPatches = {
    failAction: {
      dsl: ['on collision Player Enemy -> restart scene=Game'],
    },
  };
  try {
    moduleCompiler.validateProductModules(catalog.schema, badLegacyPatchTemplates);
  } catch (error) {
    assert(error.message.indexOf('compiler.slotPatches is removed') >= 0, 'Product module validation should reject legacy slotPatches');
    badLegacyPatchTemplates = null;
  }
  assert(badLegacyPatchTemplates === null, 'Product module validation should fail when legacy compiler patch templates are present');

  var badLegacyConfigureTemplates = JSON.parse(JSON.stringify(catalog.modules));
  badLegacyConfigureTemplates[0].compiler.configurePatches = {
    title: {
      dsl: ['on start -> text TitleText Game scene=Start'],
    },
  };
  try {
    moduleCompiler.validateProductModules(catalog.schema, badLegacyConfigureTemplates);
  } catch (error) {
    assert(error.message.indexOf('compiler.configurePatches is removed') >= 0, 'Product module validation should reject legacy configurePatches');
    badLegacyConfigureTemplates = null;
  }
  assert(badLegacyConfigureTemplates === null, 'Product module validation should fail when legacy configure patch templates are present');

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
