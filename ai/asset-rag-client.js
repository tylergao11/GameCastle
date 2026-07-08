/**
 * asset-rag-client.js — lightweight cloud RAG client for asset verification.
 *
 * Local builds carry ZERO ML dependencies.
 * Embedding (CLIP via Transformers.js) + vector search (LanceDB) runs in cloud.
 *
 * When cloud is unreachable, falls back to local stub (pass-through in dev mode).
 *
 * Usage:
 *   var rag = require('./asset-rag-client');
 *   var client = rag.createRagClient({ endpoint: 'https://rag.gamecastle.io' });
 *   var result = await client.verifyAsset('./player.png', ['player'], ['arcade'], {});
 */

var fs = require('fs');

var RAG_CLIENT_VERSION = 1;

/** Default cloud RAG endpoint. Override via GAMECASTLE_RAG_ENDPOINT env. */
var DEFAULT_RAG_ENDPOINT = process.env.GAMECASTLE_RAG_ENDPOINT || null;

/** Timeout for cloud RAG calls (ms). Shorter than pipeline timeout. */
var RAG_TIMEOUT_MS = parseInt(process.env.GAMECASTLE_RAG_TIMEOUT || '15000', 10);

/**
 * Create a RAG client instance.
 * @param {Object} options
 * @param {string} [options.endpoint] - cloud RAG service URL
 * @param {boolean} [options.offline] - force offline stub mode
 * @returns {{ verifyAsset, searchSimilar, indexAsset, isOffline, getEndpoint }}
 */
function createRagClient(options) {
  options = options || {};
  var endpoint = options.endpoint || DEFAULT_RAG_ENDPOINT;
  var offline = options.offline === true || !endpoint;

  /**
   * Verify an asset image against its declared semantic tags.
   *
   * Cloud path:  POST image bytes + tags → RAG service → { verified, confidence, issues }
   * Offline path: stub pass-through (dev mode — never blocks generation).
   *
   * @param {string} assetPath - path to image file on disk
   * @param {string[]} semanticTags - e.g. ['player', 'character']
   * @param {string[]} styleTags - e.g. ['pixel-art', 'arcade']
   * @param {Object} metadata - generator metadata (quality, version, etc.)
   * @returns {Promise<{verified:boolean, confidence:number, issues:string[], source:string, needsCloudVerification?:boolean}>}
   */
  async function verifyAsset(assetPath, semanticTags, styleTags, metadata) {
    if (!assetPath) {
      return { verified: false, confidence: 0, issues: ['no_asset_path'], source: 'local' };
    }

    if (!fs.existsSync(assetPath)) {
      return { verified: false, confidence: 0, issues: ['file_missing'], source: 'local' };
    }

    // Offline / no endpoint configured → stub
    if (offline || !endpoint) {
      return stubVerify(assetPath, semanticTags, styleTags, metadata);
    }

    try {
      var imageBuffer = fs.readFileSync(assetPath);
      var base64 = imageBuffer.toString('base64');
      var ext = assetPath.split('.').pop().toLowerCase();

      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, RAG_TIMEOUT_MS);

      var response = await fetch(endpoint + '/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          imageFormat: ext || 'png',
          semanticTags: semanticTags || [],
          styleTags: styleTags || [],
          metadata: metadata || {},
          schemaVersion: RAG_CLIENT_VERSION,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          verified: false,
          confidence: 0,
          issues: ['rag_service_error:' + response.status],
          source: 'cloud_error',
        };
      }

      var result = await response.json();
      result.source = 'cloud';
      return result;
    } catch (e) {
      if (e.name === 'AbortError') {
        return {
          verified: false,
          confidence: 0,
          issues: ['rag_timeout'],
          source: 'cloud_timeout',
        };
      }
      // Network error → fall back to stub (never block on network)
      return stubVerify(assetPath, semanticTags, styleTags, metadata);
    }
  }

  /**
   * Search for similar assets in the cloud index by tag vectors.
   *
   * @param {string[]} semanticTags
   * @param {string[]} styleTags
   * @param {string} kind - asset kind ('sprite', 'background', etc.)
   * @param {number} [limit=5]
   * @returns {Promise<Array>} matching assets with similarity scores
   */
  async function searchSimilar(semanticTags, styleTags, kind, limit) {
    limit = limit || 5;
    if (offline || !endpoint) return [];

    try {
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, RAG_TIMEOUT_MS);

      var response = await fetch(endpoint + '/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          semanticTags: semanticTags || [],
          styleTags: styleTags || [],
          kind: kind || 'sprite',
          limit: limit,
          schemaVersion: RAG_CLIENT_VERSION,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      if (!response.ok) return [];
      var result = await response.json();
      return result.assets || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Register/index an asset in the cloud RAG vector index.
   * Called AFTER local approval (promoted status).
   *
   * @param {string} assetId
   * @param {string} assetPath
   * @param {string[]} semanticTags
   * @param {string[]} styleTags
   * @param {Object} metadata
   * @returns {Promise<{indexed:boolean, reason?:string}>}
   */
  async function indexAsset(assetId, assetPath, semanticTags, styleTags, metadata) {
    if (offline || !endpoint) return { indexed: false, reason: 'offline' };

    try {
      if (!fs.existsSync(assetPath)) {
        return { indexed: false, reason: 'file_missing' };
      }

      var imageBuffer = fs.readFileSync(assetPath);
      var base64 = imageBuffer.toString('base64');

      var response = await fetch(endpoint + '/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: assetId,
          imageBase64: base64,
          imageFormat: assetPath.split('.').pop().toLowerCase(),
          semanticTags: semanticTags || [],
          styleTags: styleTags || [],
          metadata: metadata || {},
          schemaVersion: RAG_CLIENT_VERSION,
        }),
      });

      if (!response.ok) {
        return { indexed: false, reason: 'http_' + response.status };
      }
      return await response.json();
    } catch (e) {
      return { indexed: false, reason: e.message };
    }
  }

  return {
    verifyAsset: verifyAsset,
    searchSimilar: searchSimilar,
    indexAsset: indexAsset,
    isOffline: function () { return offline; },
    getEndpoint: function () { return endpoint; },
  };
}

/**
 * Stub verification for offline/dev mode.
 *
 * Does basic file checks. Never blocks — assets proceed with a warning.
 * Replace with real RAG service in production via GAMECASTLE_RAG_ENDPOINT.
 *
 * @returns {{ verified:boolean, confidence:number, issues:string[], needsCloudVerification:boolean, source:string, note:string }}
 */
function stubVerify(assetPath, semanticTags, styleTags, metadata) {
  var issues = [];

  // Basic file validation
  try {
    var stat = fs.statSync(assetPath);
    if (stat.size === 0) issues.push('empty_file');
    if (stat.size < 64) issues.push('suspiciously_small:' + stat.size + 'bytes');
  } catch (e) {
    return {
      verified: false,
      confidence: 0,
      issues: ['stat_failed'],
      source: 'local_stub',
    };
  }

  // Tag presence check (already done by qualityGate, double-check here)
  if (!semanticTags || semanticTags.length === 0) issues.push('no_semantic_tags');
  if (!styleTags || styleTags.length === 0) issues.push('no_style_tags');

  // Generator confidence from metadata
  var confidence = (metadata && metadata.quality && metadata.quality.confidence) || 0.5;

  // Stub generator produces 1x1 placeholder — always flag for review
  var genVersion = (metadata && metadata.generatorVersion) || 'unknown';
  if (genVersion === 'stub') {
    issues.push('stub_generator_no_real_content');
    confidence = 0.1;
  }

  return {
    verified: issues.length === 0,
    confidence: confidence,
    issues: issues,
    needsCloudVerification: genVersion !== 'stub',
    source: 'local_stub',
    note: 'RAG cloud endpoint not configured. Set GAMECASTLE_RAG_ENDPOINT for content verification.',
  };
}

module.exports = {
  RAG_CLIENT_VERSION: RAG_CLIENT_VERSION,
  createRagClient: createRagClient,
  DEFAULT_RAG_ENDPOINT: DEFAULT_RAG_ENDPOINT,
};
