/**
 * Live product-delivery smoke (Director → semantic → asset → spatial → capture → review).
 *
 * Uses the real ProductDeliveryOrchestrator. For this machine, prefer:
 *   GAMECASTLE_RUNTIME_MODE=development  (DeepSeek for LLM2 when local Qwen is down)
 *   ComfyUI healthy on COMFYUI_ENDPOINT
 *
 * Usage:
 *   node scripts/shared/run-with-local-env.js scripts/product/live-product-deliver-smoke.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var productApi = require('../../packages/product/src/product-delivery-orchestrator');

var root = path.resolve(__dirname, '..', '..');
var runId = 'live-product-' + Date.now().toString(36);
var outRoot = path.join(root, '.gamecastle', 'output', 'diagnostics', 'live-product-deliver', runId);

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function summarizeError(error) {
  var cause = error && error.cause || null;
  return {
    code: error && error.code || null,
    owner: error && error.owner || null,
    message: error && error.message || String(error),
    issue: error && error.issue || null,
    deliveryRunStatus: error && error.deliveryRun && error.deliveryRun.status || null,
    blockedStage: error && error.issue && error.issue.stage || null,
    // Semantic fuse attaches diagnostics via traced(); product block() stores them on cause.
    cause: cause ? {
      code: cause.code || null,
      owner: cause.owner || null,
      message: cause.message || null,
      runState: cause.runState || null,
      taskPlan: cause.taskPlan || null,
      modelCalls: cause.modelCalls || null,
      totalElapsedMs: cause.totalElapsedMs || null,
      lastFailures: (cause.runTrace || []).filter(function(entry) {
        return entry && entry.outcome && entry.outcome.ok === false;
      }).slice(-12),
      failureEvents: cause.runLedger && cause.runLedger.events
        ? cause.runLedger.events.filter(function(event) {
          return event && (event.type === 'FAILURE_RECORDED' || /FAIL|FUSE/i.test(String(event.type || '')));
        }).slice(-20)
        : null
    } : null,
    // Also accept diagnostics hung directly on the thrown semantic error.
    runState: error && error.runState || null,
    lastFailures: error && error.runTrace
      ? error.runTrace.filter(function(entry) { return entry && entry.outcome && entry.outcome.ok === false; }).slice(-12)
      : null,
    partial: error && error.partial ? {
      hasSource: !!(error.partial.source),
      hasAssetProduct: !!(error.partial.assetProduct),
      hasSpatial: !!(error.partial.spatialProduct),
      hasCapture: !!(error.partial.browserCapture),
      hasReview: !!(error.partial.assemblyReview)
    } : null
  };
}

function summarizeProduct(product) {
  var run = product && product.deliveryRun || null;
  var assets = product && product.assetProduct || product && product.assetCards || null;
  return {
    deliveryId: product && product.deliveryId,
    projectId: product && product.projectId,
    status: run && run.status || product && product.status || null,
    sourceHash: product && product.sourceHash || null,
    contentHash: product && product.contentHash || null,
    assetCards: product && product.assetCards ? (Array.isArray(product.assetCards) ? product.assetCards.length : Object.keys(product.assetCards).length) : null,
    artifacts: run && run.artifacts || product && product.artifacts || null,
    hasSource: !!(product && product.source),
    hasAssetWorld: !!(product && product.assetProduct && product.assetProduct.assetWorld) || !!(product && product.assetWorld)
  };
}

(async function main() {
  fs.mkdirSync(outRoot, { recursive: true });

  // Prefer development text path when local Qwen is not running.
  if (!process.env.GAMECASTLE_RUNTIME_MODE) process.env.GAMECASTLE_RUNTIME_MODE = 'development';
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
    var comfy = await fetch((process.env.COMFYUI_ENDPOINT || 'http://127.0.0.1:8188').replace(/\/$/, '') + '/system_stats');
    if (!comfy.ok) throw new Error('HTTP ' + comfy.status);
    console.log('[live-product] ComfyUI healthy');
  } catch (error) {
    console.error('[live-product] ComfyUI down:', error.message);
    process.exit(2);
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('[live-product] DEEPSEEK_API_KEY required for director (and development semantic)');
    process.exit(2);
  }

  console.log('[live-product] runId=', runId);
  console.log('[live-product] out=', outRoot);
  console.log('[live-product] RUNTIME_MODE=', process.env.GAMECASTLE_RUNTIME_MODE);

  var storageRoot = path.join(outRoot, 'product-deliveries');
  var started = Date.now();
  var heartbeat = setInterval(function() {
    console.log('[live-product] heartbeat elapsedMs=', Date.now() - started);
  }, 20000);

  var orchestrator = productApi.create({
    storageRoot: storageRoot
  });

  var input = {
    deliveryId: runId,
    projectId: 'smoke-product-project',
    userRequest: 'Make a tiny colorful mobile-game scene with one playable hero character sprite and one blue gem collectible. Keep it simple: one level, full-color raster-toon style.'
  };
  writeJson(path.join(outRoot, 'request.json'), input);

  try {
    var product = await orchestrator.run(input);
    clearInterval(heartbeat);
    var summary = {
      ok: true,
      runId: runId,
      elapsedMs: Date.now() - started,
      product: summarizeProduct(product)
    };
    writeJson(path.join(outRoot, 'summary.json'), summary);
    writeJson(path.join(outRoot, 'product.json'), product);
    console.log('[live-product] ACCEPTED elapsedMs=', summary.elapsedMs);
    console.log('[live-product] status=', summary.product.status, 'sourceHash=', summary.product.sourceHash);
    console.log('[live-product] report=', path.join(outRoot, 'summary.json'));
    process.exit(0);
  } catch (error) {
    clearInterval(heartbeat);
    var fail = {
      ok: false,
      runId: runId,
      elapsedMs: Date.now() - started,
      error: summarizeError(error)
    };
    writeJson(path.join(outRoot, 'error.json'), fail);
    if (error && error.deliveryRun) writeJson(path.join(outRoot, 'delivery-run.json'), error.deliveryRun);
    if (error && error.partial) writeJson(path.join(outRoot, 'partial.json'), {
      source: error.partial.source || null,
      assetProductKeys: error.partial.assetProduct ? Object.keys(error.partial.assetProduct) : null,
      spatialKeys: error.partial.spatialProduct ? Object.keys(error.partial.spatialProduct) : null
    });
    // Full semantic diagnostics for root-cause analysis (can be large).
    var diagSource = error && error.cause || error;
    if (diagSource && (diagSource.runTrace || diagSource.runLedger || diagSource.runState)) {
      writeJson(path.join(outRoot, 'semantic-diagnostics.json'), {
        code: diagSource.code || null,
        message: diagSource.message || null,
        runState: diagSource.runState || null,
        taskPlan: diagSource.taskPlan || null,
        modelCalls: diagSource.modelCalls || null,
        totalElapsedMs: diagSource.totalElapsedMs || null,
        runTrace: diagSource.runTrace || null,
        runLedger: diagSource.runLedger || null,
        draft: diagSource.draft || null,
        cacheSummary: diagSource.cacheSummary || null,
        observerWarnings: diagSource.observerWarnings || null
      });
    }
    console.error('[live-product] BLOCKED/FAILED', fail.error.code, fail.error.message);
    if (fail.error.issue) console.error('[live-product] issue', JSON.stringify(fail.error.issue));
    if (fail.error.cause && fail.error.cause.lastFailures) {
      console.error('[live-product] lastFailures', JSON.stringify(fail.error.cause.lastFailures, null, 2));
    }
    if (fail.error.lastFailures) {
      console.error('[live-product] lastFailures(direct)', JSON.stringify(fail.error.lastFailures, null, 2));
    }
    if (fail.error.partial) console.error('[live-product] partial', JSON.stringify(fail.error.partial));
    console.error('[live-product] report=', path.join(outRoot, 'error.json'));
    process.exit(1);
  }
})().catch(function(error) {
  console.error(error && error.stack || error);
  process.exit(1);
});
