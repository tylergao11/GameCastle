var path = require('path');
var capabilities = require('./capabilities');

var catalog = capabilities.loadCapabilityCatalog(path.join(__dirname, 'product-modules'));
console.log('[Capabilities] ' + catalog.cards.length + ' cards loaded');
catalog.cards.forEach(function(card) {
  console.log('  OK ' + card.id + ' <- ' + card._sourceFile);
});
