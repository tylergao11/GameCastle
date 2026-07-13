var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var engineModule = require('./cloud-asset-engine');
var encoder = require('./local-derivation-port');
var memoryCloudPorts = require('./test-memory-cloud-ports');

var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamecastle-cloud-shared-loop-'));
try {
  var producerProject = path.join(root, 'producer-project'), consumerProject = path.join(root, 'consumer-project'), cloud = memoryCloudPorts.createInMemoryCloudPorts();
  fs.mkdirSync(producerProject, { recursive: true });
  var source = path.join(producerProject, 'hero.png'); fs.writeFileSync(source, encoder.encodePng({ width: 1, height: 1, data: new Uint8ClampedArray([238,73,58,255]) }));
  var producer = engineModule.createCloudAssetEngine({ ports: cloud.ports });
  producer.enqueuePromotion({ cloudPromotionQueue: [{ requestId: 'producer.hero.v1', asset: { assetId: 'producer.hero', path: source, kind: 'raster', format: 'png', width: 1, height: 1, transparent: true, styleId: 'gamecastle.style-dna.v1', semanticTags: ['role.hero'], provenanceTypeId: 'provenance.user-final', licensePolicyId: 'license.creator-share', qualityTierId: 'quality.accepted', qualityFlags: [] }, receipt: { accepted: true }, runtimeBindingReceipt: { slotId: 'hero', status: 'bound' }, shareConsent: true }] });
  assert.equal(producer.sync()[0].state, 'published');
  var consumer = engineModule.createCloudAssetEngine({ ports: cloud.ports });
  var candidate = consumer.query({ requestId: 'consumer.query.hero', assetSpec: { styleId: 'gamecastle.style-dna.v1', semanticTags: ['hero'] }, templateContext: {}, localCapabilities: {}, policy: {} }).candidates[0];
  assert(candidate && candidate.revisionId);
  var localized = consumer.materialize({ requestId: 'consumer.materialize.hero', revisionId: candidate.revisionId, projectId: 'consumer.project', targetScope: 'project-local', projectAssetDir: path.join(consumerProject, 'assets') });
  assert(fs.existsSync(localized.path)); assert(localized.path.indexOf(consumerProject) === 0); assert.equal(fs.readFileSync(localized.path).toString('hex'), fs.readFileSync(source).toString('hex'));
  assert.equal(consumer.getPromotionStatus()[0].requestId, 'producer.hero.v1');
  console.log('[CloudSharedLibraryLoop] producer promotion is queryable and project-local materializable by an independent Runtime sharing the cloud root');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
