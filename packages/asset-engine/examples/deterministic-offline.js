'use strict';

var assetEngine = require('..');

var assetRequirementSet = {
  schemaVersion: 1,
  documentKind: 'asset-requirement-set',
  sourceHash: 'semantic.demo.asset-engine.v1',
  projectId: 'demo-asset-engine',
  requirements: [{
    semanticId: 'hero',
    subject: 'hero',
    description: 'A cheerful playable hero sprite',
    productionFamily: 'character',
    recipeId: 'character-sprite.v1',
    styleId: 'gamecastle.style-dna.v1',
    semanticTags: ['hero', 'character'],
    constraints: { width: 24, height: 32, transparent: true },
    acceptedFormats: ['png']
  }]
};

assetEngine.runOffline(assetRequirementSet).then(function(acceptedAssetWorld) {
  process.stdout.write(JSON.stringify(acceptedAssetWorld, null, 2) + '\n');
}).catch(function(error) {
  process.stderr.write((error.stack || error.message) + '\n');
  process.exitCode = 1;
});
