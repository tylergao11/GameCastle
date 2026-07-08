var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var DISTILL_HINT_SCHEMA_VERSION = 1;

function sha1(text) {
  return crypto.createHash('sha1').update(String(text)).digest('hex');
}

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function parseHexColor(color, fallback) {
  fallback = fallback || { r: 255, g: 255, b: 255 };
  var hex = String(color || '').replace('#', '');
  function read(start, key) {
    var parsed = parseInt(hex.substring(start, start + 2), 16);
    return isNaN(parsed) ? fallback[key] : parsed;
  }
  return { r: read(0, 'r'), g: read(2, 'g'), b: read(4, 'b') };
}

/**
 * Generate a pretend image asset.
 *
 * This is a stub generator that writes a minimal 1x1 PNG placeholder.
 * When real image generation is wired, replace the body with an LLM call
 * through llm-provider (callImageModel). The DistillHint output contract
 * must stay stable regardless of generator implementation.
 *
 * @param {Object} request
 * @param {string} request.assetId - stable id for this asset (e.g., "sprite.player.runner")
 * @param {string} request.kind - 'sprite' | 'background' | 'ui' | 'icon' | etc.
 * @param {number} request.width
 * @param {number} request.height
 * @param {boolean} request.transparent
 * @param {string} [request.color] - fallback color hint (e.g., "#4488FF")
 * @param {string[]} request.semanticTags - e.g., ["player", "hero", "runner"]
 * @param {string[]} request.styleTags - e.g., ["arcade", "bright"]
 * @param {string} outputDir - directory to write the generated file
 * @returns {{ path: string, format: string, sha1: string, width: number, height: number, distillHint: object }}
 */
async function generateImage(request, outputDir) {
  if (!request || !request.assetId) throw new Error('ImageAgent.generateImage requires assetId');
  if (!outputDir) throw new Error('ImageAgent.generateImage requires outputDir');

  fs.mkdirSync(outputDir, { recursive: true });

  var width = Number(request.width) || 32;
  var height = Number(request.height) || 32;
  var format = request.format || 'png';
  var fileName = request.assetId.replace(/[^a-zA-Z0-9_.-]/g, '_') + '.' + format;
  var filePath = path.join(outputDir, fileName);

  // Pretend generation: write a minimal valid PNG (1x1 blue pixel).
  // Real generation would call an image model here.
  var minimalPng = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 pixels
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // RGB, no alpha
    0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // CRC, IDAT
    0x54, 0x08, 0xD7, 0x63, 0x68, 0xE0, 0x60, 0x60,
    0x60, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01, 0x1A,
    0x1A, 0x0F, 0x0B, 0x00, 0x00, 0x00, 0x00, 0x49, // CRC, IEND
    0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
  ]);

  await fs.promises.writeFile(filePath, minimalPng);

  var fileBytes = await fs.promises.readFile(filePath);
  var fileSha1 = sha1(fileBytes.toString('base64'));

  var distillHint = buildDistillHint(request, fileSha1, width, height);

  return {
    path: filePath,
    format: format,
    sha1: fileSha1,
    width: width,
    height: height,
    distillHint: distillHint,
  };
}

function buildDistillHint(request, fileSha1, width, height) {
  var color = parseHexColor(request.color || '#4488FF');
  return {
    schemaVersion: DISTILL_HINT_SCHEMA_VERSION,
    assetId: request.assetId,
    kind: request.kind || 'sprite',
    width: width,
    height: height,
    transparent: !!request.transparent,
    format: request.format || 'png',
    sha1: fileSha1,
    generator: 'ImageAgent',
    generatorVersion: 'stub', // 'stub' until real image model is wired
    semanticTags: clone(request.semanticTags || []),
    styleTags: clone(request.styleTags || []),
    colorHint: { r: color.r, g: color.g, b: color.b },
    reuseHint: {
      reusable: true,
      scope: 'private',
      suggestedCanonicalId: request.assetId,
      suggestedTags: clone((request.semanticTags || []).concat(request.styleTags || [])),
    },
    quality: {
      confidence: 0.5, // stub generator is low confidence
      needsHumanReview: true,
      needsDistillation: true,
    },
    privateContext: {},
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  DISTILL_HINT_SCHEMA_VERSION: DISTILL_HINT_SCHEMA_VERSION,
  generateImage: generateImage,
  buildDistillHint: buildDistillHint,
};
