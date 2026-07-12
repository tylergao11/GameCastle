var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var crypto = require('crypto');
var engineModule = require('./cloud-asset-engine');

var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-cloud-port-'));
try {
  var graph = null, queue = null, blobs = {}, calls = { put: 0, get: 0, rebuild: 0 };
  var ports = {
    blobStore: {
      put: function(bytes, metadata) { calls.put++; blobs['opaque://' + metadata.sha256] = Buffer.from(bytes); return { storageKey: 'opaque://' + metadata.sha256, sha256: metadata.sha256 }; },
      get: function(ref) { calls.get++; return Buffer.from(blobs[ref.storageKey]); }
    },
    relationIndex: { load: function() { return graph; }, save: function(value) { graph = value; } },
    promotionQueue: { load: function() { return queue; }, save: function(value) { queue = value; } },
    projectionIndex: { rebuild: function(value) { calls.rebuild++; return { approvedRevisionIds: value.revisions.filter(function(revision) { return revision.status === 'approved' && revision.scope === 'cloud-shared'; }).map(function(revision) { return revision.revisionId; }) }; } }
  };
  var source = path.join(root, 'shared.png'), bytes = Buffer.from([137,80,78,71,13,10,26,10]); fs.writeFileSync(source, bytes);
  var engine = engineModule.createCloudAssetEngine({ rootDir: path.join(root, 'unused-filesystem-root'), ports: ports });
  var asset = { assetId: 'port.hero', path: source, kind: 'raster', format: 'png', width: 16, height: 16, transparent: true, styleId: 'gamecastle.style-1', semanticTags: ['role.hero'], provenanceTypeId: 'provenance.user-final', licensePolicyId: 'license.creator-share', qualityTierId: 'quality.accepted', qualityFlags: [] };
  engine.enqueuePromotion({ cloudPromotionQueue: [{ requestId: 'promotion.port.hero', asset: asset, receipt: { accepted: true }, runtimeBindingReceipt: { status: 'bound' }, shareConsent: true }] });
  assert.equal(engine.sync()[0].state, 'published');
  var found = engine.findExactForSpec({ styleId: 'gamecastle.style-1', semanticTags: ['hero'] });
  var localized = engine.materialize({ requestId: 'materialize.port.hero', revisionId: found.revisionId, projectId: 'project.port', targetScope: 'project-local', projectAssetDir: path.join(root, 'project') });
  assert.equal(calls.put, 1); assert(calls.get >= 1); assert(calls.rebuild >= 1); assert(fs.existsSync(localized.path));
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(localized.path)).digest('hex'), found.sha256);
  assert.equal(fs.existsSync(path.join(root, 'unused-filesystem-root', 'cloud-asset-graph.json')), false);
  console.log('[CloudAssetEnginePorts] blob, relation, projection, and promotion planes are replaceable without Runtime changes');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
