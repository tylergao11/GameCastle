/**
 * Live multi-slot style cohesion probe.
 * Generates hero + enemy + gem through the official Asset LangGraph + ComfyUI,
 * then reports StyleCohesion / styleAnchor / final style margins.
 *
 * Usage:
 *   node scripts/shared/run-with-local-env.js scripts/assets/live-style-cohesion-multi-slot.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var assetEngine = require('../../packages/assets/src/asset-engine-langgraph');
var rembg = require('../../packages/assets/src/rembg-background-removal');
var runtimeModule = require('../../packages/providers/src/provider-runtime');
var libraryPorts = require('../../tests/fixtures/test-asset-library-ports');
var comfy = require('../../packages/assets/src/comfyui-local-provider');

var root = path.resolve(__dirname, '..', '..');
var runId = 'live-style-cohesion-' + Date.now().toString(36);
var outRoot = path.join(root, '.gamecastle', 'output', 'diagnostics', 'live-style-cohesion', runId);

function requirements() {
  return {
    schemaVersion: 1,
    documentKind: 'semantic-asset-requirements',
    sourceHash: 'semantic.live-style-cohesion.' + runId,
    requirements: [
      {
        semanticId: 'hero_visual',
        subject: 'hero',
        description: 'one compact western-cartoon hero adventurer, full body, readable face, chunky silhouette',
        roles: ['hero', 'player'],
        productionFamily: 'character',
        recipeId: 'character-sprite.v1',
        styleId: 'gamecastle.style-dna.v1',
        semanticTags: ['hero', 'character'],
        constraints: { width: 64, height: 96, transparent: true, anchor: 'bottom-center' },
        acceptedFormats: ['png'],
        gdjsBindings: []
      },
      {
        semanticId: 'enemy_visual',
        subject: 'enemy',
        description: 'one compact western-cartoon enemy slime monster, full body, chunky silhouette',
        roles: ['enemy'],
        productionFamily: 'character',
        recipeId: 'character-sprite.v1',
        styleId: 'gamecastle.style-dna.v1',
        semanticTags: ['enemy', 'character'],
        constraints: { width: 64, height: 64, transparent: true, anchor: 'bottom-center' },
        acceptedFormats: ['png'],
        gdjsBindings: []
      },
      {
        semanticId: 'gem_visual',
        subject: 'collectible',
        description: 'one blue cartoon gem collectible prop, centered, chunky silhouette',
        roles: ['collectible'],
        productionFamily: 'prop',
        recipeId: 'prop-sprite.v1',
        styleId: 'gamecastle.style-dna.v1',
        semanticTags: ['gem', 'collectible'],
        constraints: { width: 48, height: 48, transparent: true },
        acceptedFormats: ['png'],
        gdjsBindings: []
      }
    ]
  };
}

function summarize(state) {
  var production = state.assetProduction || {};
  var workItems = production.workItems || [];
  return {
    runId: state.runId,
    accepted: !!state.accepted,
    decision: production.decision || null,
    pass: production.pass,
    styleAnchor: production.styleAnchor || state.styleAnchor || null,
    styleCohesion: production.styleCohesionReceipt || null,
    debts: production.debts || state.debts || [],
    workItems: workItems.map(function(item) {
      var receipt = item.semanticReviewReceipt || null;
      var candidate = item.candidate || null;
      return {
        slotId: item.workItem && item.workItem.slotId,
        productionFamily: item.workItem && item.workItem.productionFamily,
        accepted: !!item.accepted,
        debt: item.debt || null,
        path: candidate && (candidate.path || (candidate.frames && candidate.frames[0] && candidate.frames[0].path)) || null,
        sha256: candidate && candidate.sha256 || null,
        styleMargin: receipt && receipt.styleMargin,
        semanticMargin: receipt && receipt.semanticMargin,
        generationPromptPreview: null
      };
    })
  };
}

function copyAcceptedImages(summary) {
  var imageDir = path.join(outRoot, 'accepted');
  fs.mkdirSync(imageDir, { recursive: true });
  summary.workItems.forEach(function(item) {
    if (!item.path || !fs.existsSync(item.path)) return;
    var dest = path.join(imageDir, item.slotId + path.extname(item.path));
    fs.copyFileSync(item.path, dest);
    item.copiedPath = dest;
  });
}

(async function main() {
  fs.mkdirSync(outRoot, { recursive: true });
  var health = await comfy.health({ endpoint: process.env.COMFYUI_ENDPOINT || 'http://127.0.0.1:8188' }).catch(function(error) {
    return { ok: false, error: error.message };
  });
  if (!health || health.ok === false) {
    // health may return different shape - also try raw fetch
  }
  try {
    var res = await fetch((process.env.COMFYUI_ENDPOINT || 'http://127.0.0.1:8188').replace(/\/$/, '') + '/system_stats');
    if (!res.ok) throw new Error('ComfyUI system_stats HTTP ' + res.status);
    console.log('[live-style] ComfyUI healthy');
  } catch (error) {
    console.error('[live-style] ComfyUI is not healthy:', error.message);
    process.exit(2);
  }

  if (!process.env.COMFYUI_MODEL_PATH || !process.env.COMFYUI_REFINER_PATH) {
    console.error('[live-style] COMFYUI_MODEL_PATH / COMFYUI_REFINER_PATH required (use run-with-local-env.js)');
    process.exit(2);
  }
  // Ensure absolute model paths for Comfy
  process.env.COMFYUI_MODEL_PATH = path.resolve(root, process.env.COMFYUI_MODEL_PATH);
  process.env.COMFYUI_REFINER_PATH = path.resolve(root, process.env.COMFYUI_REFINER_PATH);
  if (!process.env.COMFYUI_MODEL_SHA256 && fs.existsSync(process.env.COMFYUI_MODEL_PATH)) {
    process.env.COMFYUI_MODEL_SHA256 = crypto.createHash('sha256').update(fs.readFileSync(process.env.COMFYUI_MODEL_PATH)).digest('hex');
  }
  if (!process.env.COMFYUI_REFINER_SHA256 && fs.existsSync(process.env.COMFYUI_REFINER_PATH)) {
    process.env.COMFYUI_REFINER_SHA256 = crypto.createHash('sha256').update(fs.readFileSync(process.env.COMFYUI_REFINER_PATH)).digest('hex');
  }

  process.env.COMFYUI_ALLOW_LOCAL = process.env.COMFYUI_ALLOW_LOCAL || 'true';
  process.env.ASSET_MODEL_PROVIDER = process.env.ASSET_MODEL_PROVIDER || 'comfyui-local';
  process.env.COMFYUI_TRANSIT_DIR = process.env.COMFYUI_TRANSIT_DIR || path.join(outRoot, 'transit');
  fs.mkdirSync(process.env.COMFYUI_TRANSIT_DIR, { recursive: true });

  var projectAssetDir = path.join(outRoot, 'project-assets');
  var ledgerPath = path.join(outRoot, 'ledger.json');
  var started = Date.now();
  console.log('[live-style] runId=', runId);
  console.log('[live-style] out=', outRoot);
  console.log('[live-style] generating hero + enemy + gem (production profile, up to 15m deadline)...');

  var runtime = runtimeModule.createProviderRuntime({ maxCost: Infinity, receiptDir: path.join(outRoot, 'provider-receipts') });
  var backgroundRemoval = rembg.createRembgBackgroundRemoval({ root: root });

  var state;
  try {
    state = await assetEngine.runAssetEngine({
      runId: runId,
      projectId: runId,
      executionProfileId: 'asset-engine-production.v1',
      assetRequirementContract: requirements(),
      ports: { backgroundRemoval: backgroundRemoval },
      providerRuntime: runtime,
      providerOptions: { provider: 'comfyui-local' },
      assetLibraryPort: libraryPorts.createTestAssetLibraryPort(),
      projectAssetDir: projectAssetDir,
      modelPolicy: { provider: 'comfyui-local', localAllowed: true },
      maxCost: Infinity,
      ledgerPath: ledgerPath
    });
  } catch (error) {
    var failReport = {
      runId: runId,
      error: { code: error.code, owner: error.owner, message: error.message, diagnostics: error.diagnostics || null },
      elapsedMs: Date.now() - started
    };
    fs.writeFileSync(path.join(outRoot, 'error.json'), JSON.stringify(failReport, null, 2));
    console.error('[live-style] engine threw:', error.code || '', error.message);
    if (error.diagnostics) console.error(JSON.stringify(error.diagnostics, null, 2));
    process.exit(1);
  }

  var summary = summarize(state);
  summary.elapsedMs = Date.now() - started;
  copyAcceptedImages(summary);
  fs.writeFileSync(path.join(outRoot, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outRoot, 'state-slim.json'), JSON.stringify({
    accepted: state.accepted,
    debts: state.debts || null,
    production: {
      pass: state.assetProduction && state.assetProduction.pass,
      decision: state.assetProduction && state.assetProduction.decision,
      styleAnchor: state.assetProduction && state.assetProduction.styleAnchor,
      styleCohesionReceipt: state.assetProduction && state.assetProduction.styleCohesionReceipt,
      debts: state.assetProduction && state.assetProduction.debts
    }
  }, null, 2));

  console.log('[live-style] elapsedMs=', summary.elapsedMs);
  console.log('[live-style] accepted=', summary.accepted, 'pass=', summary.pass, 'decision=', summary.decision);
  console.log('[live-style] styleAnchor=', summary.styleAnchor && summary.styleAnchor.slotId);
  if (summary.styleCohesion) {
    console.log('[live-style] cohesion decision=', summary.styleCohesion.decision, 'pairs=', (summary.styleCohesion.pairwise || []).length);
    (summary.styleCohesion.pairwise || []).forEach(function(pair) {
      console.log('  pair', pair.leftSlotId, '<->', pair.rightSlotId, 'sim=', Number(pair.paletteSimilarity).toFixed(4), 'ok=', pair.accepted);
    });
    (summary.styleCohesion.structure || []).forEach(function(item) {
      console.log('  structure', item.slotId, 'colors=', item.colorFamilyCount, 'opaque=', Number(item.opaqueRatio).toFixed(3), 'ok=', item.accepted);
    });
  }
  summary.workItems.forEach(function(item) {
    console.log('[live-style] slot', item.slotId, 'accepted=', item.accepted, 'styleMargin=', item.styleMargin, 'semanticMargin=', item.semanticMargin, 'path=', item.copiedPath || item.path);
    if (item.debt) console.log('  debt', item.debt.code, item.debt.message);
  });
  if (summary.debts && summary.debts.length) {
    console.log('[live-style] debts=', JSON.stringify(summary.debts, null, 2));
  }
  console.log('[live-style] report=', path.join(outRoot, 'summary.json'));
  process.exit(summary.accepted && summary.pass ? 0 : 1);
})().catch(function(error) {
  console.error(error && error.stack || error);
  process.exit(1);
});
