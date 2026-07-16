/* Test-only deterministic port. It is deliberately not selectable by runtime
 * governance and exists only to exercise AssetEngine owner boundaries. */
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var png = require('../../packages/assets/src/local-derivation-port');
var styleDNA = require('../../packages/assets/src/style-dna');
var reviewContract = require('../../packages/assets/contracts/asset-semantic-review-contract.json');

function createTestAssetEnginePorts(options) {
  var outputDir = path.resolve(options.outputDir);
  return {
    productionFingerprint: function() { return 'test-provider.production.v1'; },
    reviewCandidate: async function(state) { var candidate = state.candidate, identities = candidate.frames ? candidate.frames.map(function(frame) { return frame.sha256; }) : [candidate.sha256], texts = styleDNA.reviewTexts(state.slot.styleId, state.slot, state.phase), policyFingerprint = styleDNA.reviewPolicyFingerprint(state.slot.styleId, state.slot, state.phase), decisions = identities.map(function(imageSha256, index) { return { receiptId: 'test-image-review.' + imageSha256.slice(0, 24) + '.' + index, owner: 'TestSemanticReviewer', phase: state.phase, modelRevision: reviewContract.model.revision, modelFingerprint: 'test-model.fixture.v1', imageSha256: imageSha256, semanticSimilarity: 1, semanticMargin: 1, styleMargin: 1, compositionChecks: texts.compositionChecks.map(function(check) { return { id: check.id, positiveSimilarity: 1, negativeSimilarity: 0, margin: 1 }; }), decision: 'accepted' }; }), receiptIdentity = { workItemPlanId: state.workItem && state.workItem.workItemPlanId, targetVisualSlotId: state.slot && state.slot.targetVisualSlotId, reviewPolicyFingerprint: policyFingerprint, imageSha256s: identities }, digest = crypto.createHash('sha256').update(JSON.stringify(receiptIdentity)).digest('hex'); return { receiptId: 'test-semantic-review.' + digest.slice(0, 24), owner: 'TestSemanticReviewer', phase: state.phase, workItemPlanId: receiptIdentity.workItemPlanId, targetVisualSlotId: receiptIdentity.targetVisualSlotId, reviewPolicyFingerprint: policyFingerprint, modelRevision: reviewContract.model.revision, modelFingerprint: 'test-model.fixture.v1', imageSha256s: identities, semanticMargin: 1, styleMargin: 1, decisions: decisions, decision: 'accepted' }; },
    generateMaster: async function(state) {
      var slot = state.slot || {};
      var width = Number(slot.generationWidth || (slot.constraints || {}).width || 96);
      var height = Number(slot.generationHeight || (slot.constraints || {}).height || 96);
      var raster = { width: width, height: height, data: new Uint8ClampedArray(width * height * 4) };
      for (var y = Math.floor(height * 0.3); y < Math.ceil(height * 0.7); y++) for (var x = Math.floor(width * 0.3); x < Math.ceil(width * 0.7); x++) { var pixel = (y * width + x) * 4; raster.data[pixel] = 238; raster.data[pixel + 1] = 73; raster.data[pixel + 2] = 58; raster.data[pixel + 3] = 255; }
      var bytes = png.encodePng(raster), sha256 = crypto.createHash('sha256').update(bytes).digest('hex'), file = path.join(outputDir, sha256.slice(0, 16) + '.png');
      fs.mkdirSync(outputDir, { recursive: true }); fs.writeFileSync(file, bytes);
      return { assetId: 'test-master.' + sha256.slice(0, 16), revisionId: 'master-image.' + sha256, sha256: sha256, path: file, format: 'png', width: width, height: height, transparent: true, semanticTags: (slot.semanticTags || []).slice(), styleTags: (slot.styleTags || []).slice(), styleId: slot.styleId || 'gamecastle.style-dna.v1', status: 'master', provenance: 'test-only-master-provider', providerReceipt: { receiptId: 'test-provider.' + sha256.slice(0, 24) }, publishability: { playable: false, publishable: false, blocksFinalExport: true } };
    },
    materializeCandidate: async function(state) { return state.candidate; }
  };
}

module.exports = { createTestAssetEnginePorts: createTestAssetEnginePorts };
