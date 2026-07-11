var assert = require('assert');
var path = require('path');

var assetResolver = require('./asset-resolver');
var assetWorld = require('./asset-world');
var langGraphRuntime = require('./langgraph-runtime');

var LOCAL_REPO = path.join(__dirname, 'assets', 'local-repo.json');
var CLOUD_REPO = path.join(__dirname, 'assets', 'cloud-repo.json');

function makeSlot(slotId) {
  return {
    slotId: slotId,
    kind: 'icon',
    purpose: 'play button',
    required: true,
    owner: 'RuntimeAssetResolver',
    semanticTags: ['play', 'start', 'primary_action'],
    styleTags: ['arcade', 'bright', 'flat'],
    target: { scene: 'Start', object: 'StartButton', binding: 'uiImage' },
    constraints: {
      width: 128,
      height: 128,
      transparent: true,
      style: 'arcade',
      semantic: ['play', 'start', 'primary_action'],
      negative: [],
    },
    repoPolicy: {
      preferReuse: true,
      lookupOrder: ['cloudRepoExact', 'cloudRepoSemantic', 'localProject', 'runtimePlaceholder'],
      maxCandidates: 3,
      allowCrossGameReuse: true,
      allowLicensedAssets: true,
      requiredLicense: 'commercial',
      minConfidence: 0.7,
    },
    resolutionPolicy: {
      allowExactCache: false,
      allowRepoMatch: true,
      allowVariant: true,
      allowGeneration: false,
      allowPlaceholder: true,
      visionReview: 'lowConfidence',
    },
    fallback: {
      strategy: 'placeholder',
      source: 'runtimeFallback',
      publishable: false,
      repoEligible: false,
      trainingEligible: false,
      blocksFinalExport: true,
      debt: 'asset_missing',
    },
    publishPolicy: {
      playableWithPlaceholder: true,
      publishableWithPlaceholder: false,
      repoEligibleWhenGenerated: false,
      trainingEligibleWhenGenerated: false,
    },
  };
}

function makeBuildContract() {
  return {
    meta: {
      schemaVersion: 1,
      contractId: 'project-weave-asset-langgraph',
      owner: 'CreativeImagination',
      status: 'ready',
    },
    assetContract: {
      slots: [makeSlot('asset.ui.play_icon')],
      resolutionDefaults: {
        cacheKeyFields: ['kind', 'semanticTags', 'styleTags', 'width', 'height', 'transparent', 'requiredLicense'],
      },
    },
  };
}

function createInitialState() {
  return {
    buildContract: makeBuildContract(),
    assetResolver: {
      manifest: null,
      summary: null,
    },
    assetWorld: {
      previous: null,
      world: null,
      sanitizedForAgents: null,
    },
    graphTrace: [],
  };
}

async function compileAssetGraph(langGraph) {
  var State = langGraph.Annotation.Root({
    buildContract: langGraph.Annotation({
      reducer: function(_left, right) { return right; },
      default: function() { return null; },
    }),
    assetResolver: langGraph.Annotation({
      reducer: function(left, right) { return Object.assign({}, left || {}, right || {}); },
      default: function() { return {}; },
    }),
    assetWorld: langGraph.Annotation({
      reducer: function(left, right) { return Object.assign({}, left || {}, right || {}); },
      default: function() { return {}; },
    }),
    graphTrace: langGraph.Annotation({
      reducer: function(_left, right) { return right || []; },
      default: function() { return []; },
    }),
  });

  function appendTrace(state, nodeName, writes) {
    return (state.graphTrace || []).concat([{ node: nodeName, writes: writes }]);
  }

  return new langGraph.StateGraph(State)
    .addNode('asset-resolver', function(state) {
      var manifest = assetResolver.resolveAssetContract(state.buildContract, {
        repositoryPaths: [LOCAL_REPO, CLOUD_REPO],
      });
      return {
        assetResolver: {
          manifest: manifest,
          summary: manifest.summary,
        },
        graphTrace: appendTrace(state, 'asset-resolver', ['assetResolver.manifest', 'assetResolver.summary']),
      };
    })
    .addNode('asset-world', function(state) {
      var world = assetWorld.buildAssetWorld(
        state.assetResolver.manifest,
        state.assetWorld.previous
      );
      return {
        assetWorld: {
          world: world,
          sanitizedForAgents: {
            summary: world.summary,
            slots: world.slots.map(function(slot) {
              return {
                slotId: slot.slotId,
                status: slot.status,
                source: slot.source,
                debt: slot.debt,
              };
            }),
          },
        },
        graphTrace: appendTrace(state, 'asset-world', ['assetWorld.world', 'assetWorld.sanitizedForAgents']),
      };
    })
    .addEdge(langGraph.START, 'asset-resolver')
    .addEdge('asset-resolver', 'asset-world')
    .addEdge('asset-world', langGraph.END)
    .compile();
}

async function main() {
  var langGraph = await langGraphRuntime.loadLangGraphPackage();
  var graph = await compileAssetGraph(langGraph);
  var result = await graph.invoke(createInitialState());
  assert(result.assetResolver.manifest, 'asset resolver node should write AssetManifest');
  assert(result.assetWorld.world, 'asset world node should write AssetWorld');
  assert.strictEqual(result.assetResolver.summary.reused, 1, 'fixture should reuse one asset');
  assert.strictEqual(result.assetWorld.world.summary.debtCount, 0, 'fixture should have no asset debt');
  assert.deepStrictEqual(
    result.graphTrace.map(function(entry) { return entry.node; }),
    ['asset-resolver', 'asset-world'],
    'asset LangGraph trace should preserve resource lineup order'
  );
  var safeJson = JSON.stringify(result.assetWorld.sanitizedForAgents);
  assert(safeJson.indexOf('sha1') < 0, 'agent-facing AssetWorld summary must not expose raw hashes');
  assert(safeJson.indexOf('repoAssetId') < 0, 'agent-facing AssetWorld summary must not expose repo asset ids');
  console.log('[ProjectWeaveAssetLangGraph] resource lineup StateGraph passed');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
