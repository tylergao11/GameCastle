var assert = require('assert');
var semantic = require('@gamecastle/semantic-module');
var assemblyModule = require('@gamecastle/assembly-module');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');
var executor = require('../../packages/product/src/semantic-product-executor');

var source = {
  schemaVersion: sourceContract.SCHEMA_VERSION,
  documentKind: 'game-semantic-source',
  dictionarySource: semantic.dictionary.source,
  game: { semanticId: 'executor_demo', name: 'Executor Demo' },
  entities: [{ semanticId: 'player', roles: ['player'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [{ semanticId: 'jump_height', roles: ['movement'], value: 100, bindings: [] }] }],
  components: [],
  events: [],
  assetIntents: [],
  layoutIntents: [{ semanticId: 'player_layout', roles: ['world'], subject: 'player', bounds: { width: 64, height: 64 }, relations: [{ semanticId: 'player_anchor', layoutRef: 'gc-layout://world/center', subjects: ['player'] }], bindings: [] }],
  tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
};
var result = executor.execute({ requestId: 'seed', source: source });
assert.strictEqual(result.artifactKind, 'gdjs-project-seed');
assert.strictEqual(result.sourceHash, sourceContract.sourceHash(source));
assert.strictEqual(result.semanticAssemblyHash, semantic.compileSemanticAssembly(source).contentHash);
assert.deepStrictEqual(result.artifact, assemblyModule.createProjectSeed({ source: source }));
var revised = executor.execute({
  requestId: 'revision',
  source: source,
  revision: {
    schemaVersion: sourceContract.SCHEMA_VERSION,
    documentKind: 'game-semantic-revision',
    baseSourceHash: sourceContract.sourceHash(source),
    operations: [{ op: 'adjust_member_value', target: { entity: 'player', member: 'jump_height' }, direction: 'increase', degree: 'slight' }]
  }
});
assert.strictEqual(revised.artifact.project.objects[0].variables[0].value, 110);
assert.throws(function() { executor.execute({ source: source, feedback: {} }); }, function(error) { return error.code === 'SEMANTIC_EXECUTION_REQUEST_UNKNOWN_FIELD'; });
assert.throws(function() { executor.execute({ source: source, assetWorld: {} }); }, function(error) { return error.code === 'SEMANTIC_EXECUTION_REQUEST_UNKNOWN_FIELD'; }, 'External AssetWorld binding is owned only by ProductDeliveryOrchestrator.');
console.log('[SemanticProductExecutor] source/revision execution uses the sole public assembly path and contains no feedback or AssetWorld orchestration path');
