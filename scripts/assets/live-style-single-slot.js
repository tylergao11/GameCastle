/**
 * Live single-slot asset probe (diagnostic profile).
 * One character sprite through official Asset LangGraph + ComfyUI.
 *
 * Usage:
 *   node scripts/shared/run-with-local-env.js scripts/assets/live-style-single-slot.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var assetEngine = require('../../packages/assets/src/asset-engine-langgraph');
var rembg = require('../../packages/assets/src/rembg-background-removal');
var comfy = require('../../packages/assets/src/comfyui-local-provider');
var runtimeModule = require('../../packages/providers/src/provider-runtime');
var libraryPorts = require('../../tests/fixtures/test-asset-library-ports');

var root = path.resolve(__dirname, '..', '..');
var runId = 'live-style-single-' + Date.now().toString(36);
var outRoot = path.join(root, '.gamecastle', 'output', 'diagnostics', 'live-style-single', runId);

function requirements() {
  return {
    schemaVersion: 1,
    documentKind: 'semantic-asset-requirements',
    sourceHash: 'semantic.live-style-single.' + runId,
    requirements: [{
      semanticId: 'hero_visual',
      subject: 'hero',
      description: 'one compact colorful cartoon hero adventurer, full body, readable face, chunky silhouette',
      roles: ['hero', 'player'],
      productionFamily: 'character',
      recipeId: 'character-sprite.v1',
      styleId: 'gamecastle.style-dna.v1',
      semanticTags: ['hero', 'character'],
      constraints: { width: 64, height: 96, transparent: true, anchor: 'bottom-center' },
      acceptedFormats: ['png'],
      gdjsBindings: []
    }]
  };
}

(async function main() {
  fs.mkdirSync(outRoot, { recursive: true });
  try {
    var res = await fetch((process.env.COMFYUI_ENDPOINT || 'http://127.0.0.1:8188').replace(/\/$/, '') + '/system_stats');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    console.log('[live-single] ComfyUI healthy');
  } catch (error) {
    console.error('[live-single] ComfyUI down:', error.message);
    process.exit(2);
  }

  process.env.COMFYUI_MODEL_PATH = path.resolve(root, process.env.COMFYUI_MODEL_PATH || '');
  process.env.COMFYUI_REFINER_PATH = path.resolve(root, process.env.COMFYUI_REFINER_PATH || '');
  if (!fs.existsSync(process.env.COMFYUI_MODEL_PATH) || !fs.existsSync(process.env.COMFYUI_REFINER_PATH)) {
    console.error('[live-single] missing SDXL checkpoints');
    process.exit(2);
  }
  if (!process.env.COMFYUI_MODEL_SHA256) process.env.COMFYUI_MODEL_SHA256 = crypto.createHash('sha256').update(fs.readFileSync(process.env.COMFYUI_MODEL_PATH)).digest('hex');
  if (!process.env.COMFYUI_REFINER_SHA256) process.env.COMFYUI_REFINER_SHA256 = crypto.createHash('sha256').update(fs.readFileSync(process.env.COMFYUI_REFINER_PATH)).digest('hex');
  process.env.COMFYUI_ALLOW_LOCAL = process.env.COMFYUI_ALLOW_LOCAL || 'true';
  process.env.ASSET_MODEL_PROVIDER = process.env.ASSET_MODEL_PROVIDER || 'comfyui-local';
  process.env.COMFYUI_TRANSIT_DIR = path.join(outRoot, 'transit');
  fs.mkdirSync(process.env.COMFYUI_TRANSIT_DIR, { recursive: true });

  var started = Date.now();
  console.log('[live-single] runId=', runId);
  console.log('[live-single] out=', outRoot);
  // Live SDXL+refiner on this machine needs ~2m for master alone; the diagnostic
  // 180s profile is too tight. Use production ceilings but only one requirement.
  console.log('[live-single] profile=asset-engine-production.v1 (1 slot only)...');

  var heartbeat = setInterval(function() {
    console.log('[live-single] heartbeat elapsedMs=', Date.now() - started);
  }, 15000);

  var state;
  try {
    state = await assetEngine.runAssetEngine({
      runId: runId,
      projectId: runId,
      executionProfileId: 'asset-engine-production.v1',
      assetRequirementContract: requirements(),
      ports: { backgroundRemoval: rembg.createRembgBackgroundRemoval({ root: root }) },
      providerRuntime: runtimeModule.createProviderRuntime({
        maxCost: Infinity,
        receiptDir: path.join(outRoot, 'provider-receipts'),
        httpTransports: { 'comfyui-local': comfy.invokeComfyUI }
      }),
      providerOptions: { provider: 'comfyui-local' },
      assetLibraryPort: libraryPorts.createTestAssetLibraryPort(),
      projectAssetDir: path.join(outRoot, 'project-assets'),
      modelPolicy: { provider: 'comfyui-local', localAllowed: true },
      maxCost: Infinity,
      ledgerPath: path.join(outRoot, 'ledger.json')
    });
  } catch (error) {
    clearInterval(heartbeat);
    var fail = { code: error.code, owner: error.owner, message: error.message, diagnostics: error.diagnostics || null, elapsedMs: Date.now() - started };
    fs.writeFileSync(path.join(outRoot, 'error.json'), JSON.stringify(fail, null, 2));
    console.error('[live-single] threw', fail.code, fail.message);
    process.exit(1);
  }
  clearInterval(heartbeat);

  var item = state.assetProduction && state.assetProduction.workItems && state.assetProduction.workItems[0];
  var candidate = item && item.candidate;
  var receipt = item && item.semanticReviewReceipt;
  var summary = {
    runId: runId,
    elapsedMs: Date.now() - started,
    accepted: !!state.accepted,
    pass: state.assetProduction && state.assetProduction.pass,
    decision: state.assetProduction && state.assetProduction.decision,
    debts: state.debts || (state.assetProduction && state.assetProduction.debts) || [],
    styleAnchor: state.assetProduction && state.assetProduction.styleAnchor,
    styleCohesion: state.assetProduction && state.assetProduction.styleCohesionReceipt,
    workItem: item ? {
      slotId: item.workItem.slotId,
      accepted: item.accepted,
      debt: item.debt || null,
      path: candidate && candidate.path,
      width: candidate && candidate.width,
      height: candidate && candidate.height,
      transparent: candidate && candidate.transparent,
      styleMargin: receipt && receipt.styleMargin,
      semanticMargin: receipt && receipt.semanticMargin,
      composition: receipt && receipt.decisions && receipt.decisions[0] && receipt.decisions[0].compositionChecks
    } : null
  };

  if (summary.workItem && summary.workItem.path && fs.existsSync(summary.workItem.path)) {
    var dest = path.join(outRoot, 'accepted-hero.png');
    fs.copyFileSync(summary.workItem.path, dest);
    summary.workItem.copiedPath = dest;
  }
  fs.writeFileSync(path.join(outRoot, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log('[live-single] elapsedMs=', summary.elapsedMs);
  console.log('[live-single] accepted=', summary.accepted, 'pass=', summary.pass);
  if (summary.workItem) {
    console.log('[live-single] styleMargin=', summary.workItem.styleMargin, 'semanticMargin=', summary.workItem.semanticMargin);
    console.log('[live-single] path=', summary.workItem.copiedPath || summary.workItem.path);
  }
  if (summary.debts && summary.debts.length) console.log('[live-single] debts=', JSON.stringify(summary.debts, null, 2));
  if (summary.styleCohesion) console.log('[live-single] cohesion=', summary.styleCohesion.decision, summary.styleCohesion.reason || '');
  console.log('[live-single] report=', path.join(outRoot, 'summary.json'));
  process.exit(summary.accepted ? 0 : 1);
})().catch(function(error) {
  console.error(error && error.stack || error);
  process.exit(1);
});
