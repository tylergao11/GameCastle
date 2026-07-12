var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var assetEngine = require('../../ai/asset-engine-langgraph');
var assetWorld = require('../../ai/asset-world');
var simulatedPortsModule = require('../../ai/simulated-local-asset-ports');
var styleDictionary = require('../../ai/asset-style-dictionary');
var cloudLocalPlanRunnerModule = require('../../ai/cloud-local-plan-runner');

function readJson(filePath, fallback) { try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (_error) { return fallback; } }
function safeSlot(value) { return /^[A-Za-z0-9._-]{1,128}$/.test(String(value || '')); }
function styleIdFor(spec) { return (spec || {}).styleId || styleDictionary.dictionary.defaultStyleId; }
function decodePng(dataUrl) {
  var match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) throw Object.assign(new Error('Only PNG data URLs are accepted.'), { code: 'ASSET_PNG_REQUIRED' });
  var bytes = Buffer.from(match[1], 'base64');
  if (bytes.length < 33 || bytes.length > 4 * 1024 * 1024) throw Object.assign(new Error('PNG asset is outside the allowed size.'), { code: 'ASSET_SIZE_INVALID' });
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw Object.assign(new Error('PNG signature is invalid.'), { code: 'ASSET_SIGNATURE_INVALID' });
  if (bytes.readUInt32BE(8) !== 13 || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') throw Object.assign(new Error('PNG header is invalid.'), { code: 'ASSET_SIGNATURE_INVALID' });
  var width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20), colorType = bytes[25];
  if (!width || !height || width * height > 4096 * 4096 || (colorType !== 4 && colorType !== 6)) throw Object.assign(new Error('PNG must be a transparent RGBA or grayscale-alpha image within pixel limits.'), { code: 'ASSET_PNG_CONTRACT_INVALID' });
  return { bytes: bytes, width: width, height: height };
}

async function runEngine(input) {
  var result = await assetEngine.runAssetEngine(input);
  return result.weaveResult;
}

function createLocalAssetStore(options) {
  var outputDir = path.resolve(options.outputDir);
  var ports = options.ports || {};
  var manifestPath = path.join(outputDir, 'asset-runtime-bindings.json');
  var assetsDir = path.join(outputDir, 'assets', 'local');
  function manifest() { return readJson(manifestPath, { schemaVersion: 1, bindings: [] }); }
  function save(value) { fs.mkdirSync(path.dirname(manifestPath), { recursive: true }); fs.writeFileSync(manifestPath, JSON.stringify(value, null, 2), 'utf8'); }
  function ensureRevision(record) {
    var asset = record.asset || {}, relativePath = String(asset.path || ''), filePath = path.join(outputDir, relativePath);
    if (!asset.sha256 && fs.existsSync(filePath)) asset.sha256 = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    if (!asset.sha256) throw Object.assign(new Error('Asset revision requires content hash.'), { code: 'ASSET_REVISION_INVALID' });
    var revisionId = record.revisionId || ('rev.' + asset.sha256.slice(0, 16));
    record.revisionId = revisionId;
    record.revision = {
      assetId: asset.assetId || null,
      revisionId: revisionId,
      parentRevisionId: asset.parentRevisionId || null,
      path: relativePath,
      sha256: asset.sha256,
      provenance: asset.provenance || 'unknown',
      scope: 'project-local',
      immutable: true
    };
    record.operationReceipt = {
      operationId: 'runtime-bind.' + record.binding + '.' + asset.sha256.slice(0, 16),
      inputHash: asset.sha256,
      outputHash: asset.sha256,
      tool: 'LocalAssetStore',
      toolVersion: '1',
      policyId: asset.styleId || styleIdFor(record.assetSpec)
    };
    return record;
  }
  function bindingCandidate(record) {
    var asset = record.asset || {}, spec = record.assetSpec || {}, binding = record.assetBinding || {};
    return {
      slotId: spec.slotId || record.binding,
      status: binding.status || 'reused',
      source: asset.source || 'localExplicit',
      assetId: asset.assetId || null,
      path: asset.path || null,
      format: 'png',
      width: (spec.constraints || {}).width || null,
      height: (spec.constraints || {}).height || null,
      transparent: true,
      semanticTags: spec.semanticTags || [],
      styleTags: spec.styleTags || [],
      resolution: { cacheHit: asset.source === 'localExplicit', ownerOnFailure: 'AssetDebtManager' },
      publishability: { playable: true, debt: 'none', blocksFinalExport: false, repoEligible: false }
    };
  }
  function persistAssetWorld(current) {
    var assets = current.bindings.map(bindingCandidate);
    var assetManifest = {
      meta: { schemaVersion: 1, contractId: 'runtime-binding-manifest', createdAt: new Date().toISOString(), owner: 'RuntimeAssetBinder', status: 'ready' },
      buildContractId: 'runtime-binding-manifest',
      assets: assets,
      summary: {
        resolved: assets.length,
        generated: assets.filter(function(asset) { return asset.status === 'generated'; }).length,
        reused: assets.filter(function(asset) { return asset.status === 'reused' || asset.status === 'variant'; }).length,
        placeholders: 0,
        failed: 0,
        cacheHit: assets.some(function(asset) { return asset.resolution.cacheHit; }),
        publishable: true
      }
    };
    var previous = assetWorld.loadAssetWorld(outputDir);
    assetWorld.saveAssetWorld(outputDir, assetWorld.buildAssetWorld(assetManifest, previous));
  }
  function persistBinding(record) { record = ensureRevision(record); var current = manifest(); current.bindings = current.bindings.filter(function(entry) { return entry.binding !== record.binding; }); current.bindings.push(record); save(current); persistAssetWorld(current); return record; }
  async function bind(input) {
    if (!input || !safeSlot(input.binding) || !input.asset || !input.visualIntent) throw Object.assign(new Error('Asset binding is malformed.'), { code: 'ASSET_BINDING_INVALID' });
    var png = decodePng(input.asset.png);
    var sha256 = crypto.createHash('sha256').update(png.bytes).digest('hex');
    var relativePath = 'assets/local/' + sha256 + '.png';
    var assetPath = path.join(outputDir, relativePath);
    fs.mkdirSync(assetsDir, { recursive: true });
    if (!fs.existsSync(assetPath)) fs.writeFileSync(assetPath, png.bytes);
    var assetSpec = input.assetSpec || { slotId: input.binding, kind: 'sprite', semanticTags: [input.binding], constraints: {} };
    assetSpec = Object.assign({}, assetSpec, { styleId: styleIdFor(assetSpec), styleTags: assetSpec.styleTags || [styleIdFor(assetSpec)] });
    var slot = { slotId: assetSpec.slotId || input.binding, kind: assetSpec.kind || 'sprite', semanticTags: assetSpec.semanticTags || [input.binding], styleId: assetSpec.styleId, styleTags: assetSpec.styleTags, constraints: { width: png.width, height: png.height, transparent: true } };
    var localAsset = { assetId: 'local.' + sha256.slice(0, 16), path: assetPath, format: 'png', width: png.width, height: png.height, transparent: true, semanticTags: slot.semanticTags, styleTags: slot.styleTags, status: 'local', provenance: 'sketch-pad', license: 'owned' };
    var weave = await runEngine({ runId: 'local-binding:' + sha256, buildContract: { assetContract: { slots: [slot] } }, localInputs: (function() { var records = {}; records[slot.slotId] = { path: assetPath, scope: 'project-local', source: 'user-upload' }; return records; })(), localAssets: (function() { var assets = {}; assets[slot.slotId] = localAsset; return assets; })(), visualIntents: (function() { var intents = {}; intents[slot.slotId] = input.visualIntent; return intents; })(), ports: {} });
    var resolved = weave.slots[0];
    if (!resolved.accepted || resolved.candidate.status === 'placeholder') throw Object.assign(new Error('Asset Weave rejected local binding: ' + (resolved.debt || 'unknown')), { code: 'ASSET_WEAVE_REJECTED' });
    var record = { binding: input.binding, revisionId: String(input.revisionId || ''), asset: { assetId: localAsset.assetId, sha256: sha256, path: relativePath, source: 'localExplicit', provenance: 'sketch-pad', license: 'owned', repositoryStatus: 'local', styleId: assetSpec.styleId }, assetSpec: assetSpec, visualIntent: input.visualIntent, assetBinding: weave.assetBindings[0], updatedAt: new Date().toISOString() };
    return persistBinding(record);
  }
  async function resolveCloud(input, cloudAssetEngine) {
    if (!input || !safeSlot(input.binding) || !input.assetSpec || !input.visualIntent || !cloudAssetEngine) throw Object.assign(new Error('Cloud asset resolve request is malformed.'), { code: 'ASSET_CLOUD_RESOLVE_INVALID' });
    var assetSpec = input.assetSpec;
    assetSpec = Object.assign({}, assetSpec, { styleId: styleIdFor(assetSpec), styleTags: assetSpec.styleTags || [styleIdFor(assetSpec)] });
    var slot = { slotId: assetSpec.slotId || input.binding, kind: assetSpec.kind || 'sprite', semanticTags: assetSpec.semanticTags || [], styleId: assetSpec.styleId, styleTags: assetSpec.styleTags, constraints: Object.assign({}, assetSpec.constraints || {}, { transparent: true }) };
    var projectAssetDir = path.join(outputDir, 'assets', 'cloud');
    var cloudPlanRunner = cloudLocalPlanRunnerModule.createCloudLocalPlanRunner({ outputDir: projectAssetDir });
    var weave = await runEngine({ runId: 'cloud-resolve:' + input.binding + ':' + JSON.stringify(slot), buildContract: { assetContract: { slots: [slot] } }, cloudAssetEngine: cloudAssetEngine, projectAssetDir: projectAssetDir, visualIntents: (function() { var intents = {}; intents[slot.slotId] = input.visualIntent; return intents; })(), ports: Object.assign({}, ports, { localPlan: cloudPlanRunner }) });
    var resolved = weave.slots[0];
    if (!resolved.accepted || resolved.candidate.status === 'placeholder') throw Object.assign(new Error('No approved cloud asset can satisfy this slot: ' + (resolved.debt || 'missing')), { code: 'ASSET_CLOUD_UNAVAILABLE' });
    var candidate = resolved.candidate, relativePath = path.relative(outputDir, candidate.path).replace(/\\/g, '/');
    if (!/^assets\/cloud\/[A-Za-z0-9._-]+\.png$/.test(relativePath)) throw Object.assign(new Error('Cloud asset was not materialized into project output.'), { code: 'ASSET_CLOUD_MATERIALIZE_FAILED' });
    return persistBinding({ binding: input.binding, revisionId: null, asset: { assetId: candidate.assetId, sha256: candidate.sha256 || null, path: relativePath, source: candidate.source === 'deterministicVariant' ? 'deterministicVariant' : 'cloudRepo', provenance: candidate.provenance, license: candidate.license, repositoryStatus: candidate.repositoryStatus, styleId: assetSpec.styleId, simulated: candidate.simulated === true }, assetSpec: assetSpec, visualIntent: input.visualIntent, assetBinding: weave.assetBindings[0], updatedAt: new Date().toISOString() });
  }
  async function generate(input) {
    if (!input || !safeSlot(input.binding) || !input.assetSpec || !input.visualIntent) throw Object.assign(new Error('Simulated asset request is malformed.'), { code: 'ASSET_SIMULATED_GENERATE_INVALID' });
    var spec = Object.assign({}, input.assetSpec, { styleId: styleIdFor(input.assetSpec), styleTags: input.assetSpec.styleTags || [styleIdFor(input.assetSpec)] }), slot = { slotId: spec.slotId || input.binding, kind: spec.kind || 'sprite', semanticTags: spec.semanticTags || [], styleId: spec.styleId, styleTags: spec.styleTags, constraints: Object.assign({}, spec.constraints || {}, { transparent: true }) };
    var generatedDir = path.join(outputDir, 'assets', 'generated');
    var weave = await runEngine({ runId: 'simulated-generate:' + input.binding + ':' + JSON.stringify(slot), buildContract: { assetContract: { slots: [slot] } }, projectAssetDir: generatedDir, visualIntents: (function() { var intents = {}; intents[slot.slotId] = input.visualIntent; return intents; })(), ports: ports, maxAttempts: 1, maxCost: 1 });
    var resolved = weave.slots[0];
    if (!resolved.accepted || resolved.candidate.status === 'placeholder' || resolved.candidate.simulated !== true) throw Object.assign(new Error('Simulated asset generation did not satisfy the contract: ' + (resolved.debt || 'unknown')), { code: 'ASSET_SIMULATED_GENERATE_REJECTED' });
    var candidate = resolved.candidate, relativePath = path.relative(outputDir, candidate.path).replace(/\\/g, '/');
    if (!/^assets\/generated\/simulated-[a-f0-9]{16}\.png$/.test(relativePath)) throw Object.assign(new Error('Simulated asset was not materialized into project output.'), { code: 'ASSET_SIMULATED_MATERIALIZE_FAILED' });
    return persistBinding({ binding: input.binding, revisionId: null, asset: { assetId: candidate.assetId, sha256: candidate.sha256, path: relativePath, source: 'simulatedLocal', provenance: candidate.provenance, license: candidate.license, repositoryStatus: 'simulation', styleId: spec.styleId, simulated: true }, assetSpec: spec, visualIntent: input.visualIntent, assetBinding: weave.assetBindings[0], simulated: true, updatedAt: new Date().toISOString() });
  }
  async function generateSheet(input) {
    if (!input || !Array.isArray(input.icons) || input.icons.length !== 3 || !input.visualIntent) throw Object.assign(new Error('Simulated sprite sheet request requires exactly three icons.'), { code: 'ASSET_SIMULATED_SHEET_INVALID' });
    var slots = input.icons.map(function(icon, index) { var binding = String(icon.binding || ''); if (!safeSlot(binding)) throw Object.assign(new Error('Simulated sprite sheet icon binding is invalid.'), { code: 'ASSET_SIMULATED_SHEET_INVALID' }); var spec = Object.assign({}, icon.assetSpec || {}); spec.styleId = styleIdFor(spec); spec.styleTags = spec.styleTags || [spec.styleId]; return { binding: binding, slot: { slotId: spec.slotId || binding, kind: spec.kind || 'sprite', semanticTags: spec.semanticTags || ['icon'], styleId: spec.styleId, styleTags: spec.styleTags, constraints: Object.assign({}, spec.constraints || {}, { width: 96, height: 96, transparent: true }) } }; });
    var sheet = simulatedPortsModule.makeSheet(slots.map(function(item) { return item.slot; })); var sheetHash = crypto.createHash('sha256').update(sheet.bytes).digest('hex'); var dir = path.join(outputDir, 'assets', 'generated'); fs.mkdirSync(dir, { recursive: true }); var sheetRelative = 'assets/generated/simulated-sheet-' + sheetHash.slice(0, 16) + '.png'; fs.writeFileSync(path.join(outputDir, sheetRelative), sheet.bytes);
    var frames = simulatedPortsModule.cropSheet(sheet.bytes, sheet.frameWidth, sheet.frameHeight, sheet.frameCount), records = [];
    for (var index = 0; index < slots.length; index++) {
      var frameBytes = frames[index], frameHash = crypto.createHash('sha256').update(frameBytes).digest('hex'), relative = 'assets/generated/simulated-sheet-' + sheetHash.slice(0, 16) + '-frame-' + (index + 1) + '.png'; fs.writeFileSync(path.join(outputDir, relative), frameBytes);
      var item = slots[index], localAsset = { assetId: 'simulated.frame.' + frameHash.slice(0, 16), sha256: frameHash, path: path.join(outputDir, relative), format: 'png', width: 96, height: 96, transparent: true, semanticTags: item.slot.semanticTags, styleTags: item.slot.styleTags, simulated: true, status: 'local', provenance: 'simulated-local-sprite-sheet:' + sheetHash, license: 'simulation-only' };
      var localAssets = {}; localAssets[item.slot.slotId] = localAsset; var intents = {}; intents[item.slot.slotId] = input.visualIntent;
      var weave = await runEngine({ runId: 'simulated-sheet:' + sheetHash + ':' + index, buildContract: { assetContract: { slots: [item.slot] } }, localAssets: localAssets, visualIntents: intents, ports: ports }); var resolved = weave.slots[0];
      if (!resolved.accepted) throw Object.assign(new Error('Simulated sprite sheet frame rejected: ' + (resolved.debt || 'unknown')), { code: 'ASSET_SIMULATED_GENERATE_REJECTED' });
      records.push(persistBinding({ binding: item.binding, revisionId: null, asset: { assetId: localAsset.assetId, sha256: frameHash, path: relative, source: 'simulatedSheetCrop', provenance: localAsset.provenance, license: localAsset.license, repositoryStatus: 'simulation', styleId: item.slot.styleId, simulated: true, sheet: { path: sheetRelative, index: index, frameWidth: 96, frameHeight: 96 } }, assetSpec: item.slot, visualIntent: input.visualIntent, assetBinding: weave.assetBindings[0], simulated: true, updatedAt: new Date().toISOString() }));
    }
    return { sheet: { path: sheetRelative, width: sheet.width, height: sheet.height, frames: 3, simulated: true }, bindings: records };
  }
  return { bind: bind, resolveCloud: resolveCloud, generate: generate, generateSheet: generateSheet, list: function() { return manifest().bindings.slice(); }, manifestPath: manifestPath };
}

module.exports = { createLocalAssetStore: createLocalAssetStore };
