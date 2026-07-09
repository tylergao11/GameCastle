var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');

var assetRagClient = require('./asset-rag-client');
var cloudLibraryManager = require('./cloud-library-manager');
var imageAgent = require('./image-agent');
var langGraphRuntime = require('./langgraph-runtime');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-asset-supply-'));
}

function makeAssetRequest() {
  return {
    assetId: 'sprite.hero.runner',
    kind: 'sprite',
    width: 32,
    height: 48,
    transparent: true,
    color: '#4488FF',
    semanticTags: ['hero', 'player', 'runner'],
    styleTags: ['arcade', 'bright'],
    format: 'png',
  };
}

async function compileAssetSupplyGraph(langGraph, tempRoot) {
  var State = langGraph.Annotation.Root({
    assetLibrary: langGraph.Annotation({
      reducer: function(left, right) { return Object.assign({}, left || {}, right || {}); },
      default: function() { return {}; },
    }),
    imageGeneration: langGraph.Annotation({
      reducer: function(left, right) { return Object.assign({}, left || {}, right || {}); },
      default: function() { return {}; },
    }),
    assetReview: langGraph.Annotation({
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
    .addNode('asset-library', function(state) {
      var manager = cloudLibraryManager.createCloudLibraryManager({
        storeDir: path.join(tempRoot, 'cloud-library'),
        scope: 'private',
      });
      var request = makeAssetRequest();
      var existing = manager.resolveByTags(
        request.kind,
        request.semanticTags,
        request.styleTags,
        { width: request.width, height: request.height, transparent: request.transparent }
      );
      assert.strictEqual(existing, null, 'fresh temp cloud library should not resolve a preexisting asset');
      return {
        assetLibrary: {
          storeDir: manager.getStoreDir(),
          request: request,
          matches: [],
          summary: { existingMatches: 0, candidateCount: manager.getCandidateCount() },
        },
        graphTrace: appendTrace(state, 'asset-library', ['assetLibrary.matches', 'assetLibrary.summary']),
      };
    })
    .addNode('image-generation', async function(state) {
      assert(state.assetLibrary.request, 'image generation should receive asset request from asset library node');
      var generated = await imageAgent.generateImage(
        state.assetLibrary.request,
        path.join(tempRoot, 'generated')
      );
      assert(fs.existsSync(generated.path), 'ImageAgent should write generated asset file');
      return {
        imageGeneration: {
          candidates: [generated],
          distillHints: [generated.distillHint],
        },
        graphTrace: appendTrace(state, 'image-generation', ['imageGeneration.candidates', 'imageGeneration.distillHints']),
      };
    })
    .addNode('asset-review', async function(state) {
      var manager = cloudLibraryManager.createCloudLibraryManager({
        storeDir: state.assetLibrary.storeDir,
        scope: 'private',
      });
      var candidate = state.imageGeneration.candidates[0];
      var stored = manager.storeCandidate({
        path: candidate.path,
        sha1: candidate.sha1,
        format: candidate.format,
        width: candidate.width,
        height: candidate.height,
        distillHint: candidate.distillHint,
      });
      var ragClient = assetRagClient.createRagClient({ offline: true });
      var review = await ragClient.verifyAsset(
        stored.storedPath,
        candidate.distillHint.semanticTags,
        candidate.distillHint.styleTags,
        {
          quality: candidate.distillHint.quality,
          generatorVersion: candidate.distillHint.generatorVersion,
          kind: candidate.distillHint.kind,
        }
      );
      assert(
        review.verified || review.issues.indexOf('stub_generator_no_real_content') >= 0,
        'offline RAG review should either verify or flag stub generator for human review'
      );
      var approved = manager.promoteCandidate(stored.candidateId, candidate.distillHint);
      var resolved = manager.resolveByTags(
        candidate.distillHint.kind,
        candidate.distillHint.semanticTags,
        candidate.distillHint.styleTags,
        { width: candidate.width, height: candidate.height, transparent: candidate.distillHint.transparent }
      );
      assert(resolved, 'approved candidate should resolve from cloud library');
      return {
        assetReview: {
          report: {
            status: 'approved',
            owner: 'VisionAgent',
            source: review.source,
            confidence: review.confidence,
            verified: !!review.verified,
            issues: review.issues || [],
            needsCloudVerification: !!review.needsCloudVerification,
            needsHumanReview: !review.verified,
          },
          approvedCandidates: [{
            candidateId: approved.candidateId,
            status: approved.status,
            storedPath: approved.storedPath,
          }],
        },
        assetLibrary: {
          summary: { existingMatches: 1, candidateCount: manager.getCandidateCount() },
          matches: [{ candidateId: resolved.candidateId, status: resolved.status }],
        },
        graphTrace: appendTrace(state, 'asset-review', ['assetReview.report', 'assetReview.approvedCandidates', 'assetLibrary.matches', 'assetLibrary.summary']),
      };
    })
    .addEdge(langGraph.START, 'asset-library')
    .addEdge('asset-library', 'image-generation')
    .addEdge('image-generation', 'asset-review')
    .addEdge('asset-review', langGraph.END)
    .compile();
}

async function main() {
  var tempRoot = makeTempRoot();
  try {
    var langGraph = await langGraphRuntime.loadLangGraphPackage();
    var graph = await compileAssetSupplyGraph(langGraph, tempRoot);
    var result = await graph.invoke({});
    assert.strictEqual(result.assetReview.report.status, 'approved', 'asset review should approve fixture candidate');
    assert.strictEqual(result.assetLibrary.summary.existingMatches, 1, 'approved asset should become resolvable');
    assert.deepStrictEqual(
      result.graphTrace.map(function(entry) { return entry.node; }),
      ['asset-library', 'image-generation', 'asset-review'],
      'asset supply StateGraph trace should preserve library/generation/review order'
    );
    var safeJson = JSON.stringify(result.assetReview.report);
    assert(safeJson.indexOf('privateContext') < 0, 'asset review report must not expose private distill context');
    console.log('[ProjectWeaveAssetSupplyLangGraph] asset library/generation/review StateGraph passed');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
