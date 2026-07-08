var path = require('path');
var moduleCompiler = require('./module-compiler');

var PRODUCT_MODULES_DIR = path.join(__dirname, 'product-modules');

function main() {
  var catalog = moduleCompiler.loadProductModuleCatalog(PRODUCT_MODULES_DIR);
  console.log('[ProductModules] ' + catalog.modules.length + ' modules loaded');
  catalog.modules.forEach(function(manifest) {
    console.log('  OK ' + manifest.id + ' <- ' + manifest.sourceFile);
  });
}

main();
