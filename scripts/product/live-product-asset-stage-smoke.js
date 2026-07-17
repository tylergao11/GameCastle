/**
 * Product asset-stage live smoke (bypasses Director/LLM2).
 *
 * Proves the product SemanticAssembly → Asset LangGraph → GDJS bind path with
 * real ComfyUI + Style DNA gates. Full /product/deliver still needs LLM2 Source.
 *
 * Usage:
 *   node scripts/shared/run-with-local-env.js scripts/product/live-product-asset-stage-smoke.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var semantic = require('@gamecastle/semantic-module');
var sourceContract = require('../../packages/semantic/src/game-semantic-source');
var pipeline = require('../../packages/product/src/semantic-asset-product-pipeline');
var rembg = require('../../packages/assets/src/rembg-background-removal');
var runtimeModule = require('../../packages/providers/src/provider-runtime');
var comfy = require('../../packages/assets/src/comfyui-local-provider');
var libraryPorts = require('../../tests/fixtures/test-asset-library-ports');

var root = path.resolve(__dirname, '..', '..');
var runId = 'live-product-asset-' + Date.now().toString(36);
var outRoot = path.join(root, '.gamecastle', 'output', 'diagnostics', 'live-product-asset-stage', runId);

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function sourceDoc() {
  return {
    schemaVersion: sourceContract.SCHEMA_VERSION,
    documentKind: 'game-semantic-source',
    dictionarySource: semantic.dictionary.source,
    game: { semanticId: 'product_asset_smoke', name: 'ProductAssetSmoke' },
    entities: [
      { semanticId: 'hero', roles: ['hero'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] },
      { semanticId: 'gem', roles: ['collectible'], objectTypeRef: 'gdjs://object/Sprite::Sprite', behaviorTypeRefs: [], members: [] }
    ],
    components: [],
    events: [],
    assetIntents: [
      {
        semanticId: 'hero_visual',
        roles: ['hero', 'visual'],
        subject: 'hero',
        description: 'one compact colorful cartoon hero adventurer, full body, readable face, chunky silhouette',
        productionFamily: 'character',
        styleId: 'gamecastle.style-dna.v1',
        constraints: { width: 64, height: 96, transparent: true, anchor: 'bottom-center' },
        bindings: []
      },
      {
        semanticId: 'gem_visual',
        roles: ['collectible', 'visual'],
        subject: 'gem',
        description: 'one bright blue cartoon gem collectible prop, centered, chunky silhouette',
        productionFamily: 'prop',
        styleId: 'gamecastle.style-dna.v1',
        constraints: { width: 48, height: 48, transparent: true },
        bindings: []
      }
    ],
    layoutIntents: [
      {
        semanticId: 'world_layout',
        roles: ['world'],
        subject: 'hero',
        bounds: { width: 320, height: 240 },
        relations: [{ semanticId: 'hero_anchor', layoutRef: 'gc-layout://world/center', subjects: ['hero'] }],
        bindings: []
      }
    ],
    tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
  };
}

(async function main() {
  fs.mkdirSync(outRoot, { recursive: true });
  process.env.COMFYUI_ALLOW_LOCAL = process.env.COMFYUI_ALLOW_LOCAL || 'true';
  process.env.ASSET_MODEL_PROVIDER = process.env.ASSET_MODEL_PROVIDER || 'comfyui-local';
  if (process.env.COMFYUI_MODEL_PATH && !path.isAbsolute(process.env.COMFYUI_MODEL_PATH)) {
    process.env.COMFYUI_MODEL_PATH = path.resolve(root, process.env.COMFYUI_MODEL_PATH);
  }
  if (process.env.COMFYUI_REFINER_PATH && !path.isAbsolute(process.env.COMFYUI_REFINER_PATH)) {
    process.env.COMFYUI_REFINER_PATH = path.resolve(root, process.env.COMFYUI_REFINER_PATH);
  }
  if (process.env.COMFYUI_MODEL_PATH && fs.existsSync(process.env.COMFYUI_MODEL_PATH) && !process.env.COMFYUI_MODEL_SHA256) {
    process.env.COMFYUI_MODEL_SHA256 = crypto.createHash('sha256').update(fs.readFileSync(process.env.COMFYUI_MODEL_PATH)).digest('hex');
  }
  if (process.env.COMFYUI_REFINER_PATH && fs.existsSync(process.env.COMFYUI_REFINER_PATH) && !process.env.COMFYUI_REFINER_SHA256) {
    process.env.COMFYUI_REFINER_SHA256 = crypto.createHash('sha256').update(fs.readFileSync(process.env.COMFYUI_REFINER_PATH)).digest('hex');
  }

  try {
    var health = await fetch((process.env.COMFYUI_ENDPOINT || 'http://127.0.0.1:8188').replace(/\/$/, '') + '/system_stats');
    if (!health.ok) throw new Error('HTTP ' + health.status);
    console.log('[product-asset] ComfyUI healthy');
  } catch (error) {
    console.error('[product-asset] ComfyUI down:', error.message);
    process.exit(2);
  }

  var started = Date.now();
  console.log('[product-asset] runId=', runId);
  console.log('[product-asset] out=', outRoot);
  var heartbeat = setInterval(function() {
    console.log('[product-asset] heartbeat elapsedMs=', Date.now() - started);
  }, 15000);

  var runtime = runtimeModule.createProviderRuntime({
    maxCost: Infinity,
    receiptDir: path.join(outRoot, 'provider-receipts'),
    httpTransports: { 'comfyui-local': comfy.invokeComfyUI }
  });

  try {
    var result = await pipeline.run({
      runId: runId,
      projectId: runId,
      source: sourceDoc(),
      projectAssetDir: path.join(outRoot, 'project-assets'),
      assetEngine: {
        executionProfileId: 'asset-engine-production.v1',
        ports: { backgroundRemoval: rembg.createRembgBackgroundRemoval({ root: root }) },
        providerRuntime: runtime,
        providerOptions: { provider: 'comfyui-local' },
        assetLibraryPort: libraryPorts.createTestAssetLibraryPort(),
        modelPolicy: { provider: 'comfyui-local', localAllowed: true },
        maxCost: Infinity,
        ledgerPath: path.join(outRoot, 'ledger.json')
      }
    });
    clearInterval(heartbeat);

    var world = result.assetState && result.assetState.assetWorld;
    var summary = {
      ok: true,
      runId: runId,
      elapsedMs: Date.now() - started,
      sourceHash: result.sourceHash,
      assemblyHash: result.assembly && result.assembly.contentHash,
      projectSeedHash: result.projectSeed && result.projectSeed.assemblyHash,
      assetWorldHash: world && world.contentHash,
      boundSeed: result.artifact && result.artifact.documentKind,
      slots: (result.assetState.assetProduction && result.assetState.assetProduction.workItems || []).map(function(item) {
        var receipt = item.semanticReviewReceipt;
        var candidate = item.candidate;
        return {
          slotId: item.workItem && item.workItem.slotId,
          accepted: !!item.accepted,
          styleMargin: receipt && receipt.styleMargin,
          semanticMargin: receipt && receipt.semanticMargin,
          size: candidate ? (candidate.width + 'x' + candidate.height) : null,
          path: candidate && candidate.path || null
        };
      }),
      cohesion: result.assetState.assetProduction && result.assetState.assetProduction.styleCohesionReceipt && result.assetState.assetProduction.styleCohesionReceipt.decision
    };
    writeJson(path.join(outRoot, 'summary.json'), summary);
    console.log('[product-asset] PASS elapsedMs=', summary.elapsedMs);
    console.log('[product-asset] sourceHash=', summary.sourceHash);
    console.log('[product-asset] cohesion=', summary.cohesion);
    summary.slots.forEach(function(slot) {
      console.log('[product-asset] slot', slot.slotId, 'accepted=', slot.accepted, 'style=', slot.styleMargin, 'sem=', slot.semanticMargin, 'size=', slot.size);
    });
    console.log('[product-asset] report=', path.join(outRoot, 'summary.json'));
    process.exit(0);
  } catch (error) {
    clearInterval(heartbeat);
    var fail = {
      ok: false,
      runId: runId,
      elapsedMs: Date.now() - started,
      code: error.code || null,
      owner: error.owner || null,
      message: error.message,
      debts: error.assetState && error.assetState.debts || null
    };
    writeJson(path.join(outRoot, 'error.json'), fail);
    console.error('[product-asset] FAIL', fail.code, fail.message);
    if (fail.debts) console.error('[product-asset] debts', JSON.stringify(fail.debts, null, 2));
    console.error('[product-asset] report=', path.join(outRoot, 'error.json'));
    process.exit(1);
  }
})().catch(function(error) {
  console.error(error && error.stack || error);
  process.exit(1);
});
