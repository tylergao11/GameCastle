var fs = require('fs');
var path = require('path');
var imageAgent = require('./image-agent');
var cloudLibraryManager = require('./cloud-library-manager');

/**
 * TextureProvider is the thin integration layer between the pipeline executor
 * and the asset generation+storage subsystem. It does NOT contain prompt logic
 * or LLM calls — those live in image-agent.js. It does NOT contain storage
 * logic — that lives in cloud-library-manager.js.
 */

var DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', 'output', 'assets');
var DEFAULT_STORE_DIR = path.join(__dirname, '..', 'output', '.cloud-library');

var _manager = null;

function getManager() {
  if (!_manager) {
    _manager = cloudLibraryManager.createCloudLibraryManager({
      rootDir: path.join(__dirname, '..'),
      storeDir: DEFAULT_STORE_DIR,
      scope: 'private',
    });
  }
  return _manager;
}

function resetManager() {
  _manager = null;
}

/**
 * Resolve a texture for a game object.
 *
 * 1. Check CloudLibraryManager for existing approved/promoted match.
 * 2. If not found, call ImageAgent to generate (pretend for now).
 * 3. Store the result as a candidate.
 *
 * @param {Object} params - parsed DSL parameters from "create object"
 * @param {string} params.name - object name (e.g., "Player")
 * @param {string} params.type - object type (must be "Sprite")
 * @param {string} [params.texture] - explicit texture filename
 * @param {number} [params.width]
 * @param {number} [params.height]
 * @param {string} [params.color] - color hint (e.g., "#4488FF")
 * @param {string} [params.role] - semantic role (e.g., "player", "enemy")
 * @returns {{ texturePath: string, candidateId: string|null, generated: boolean }}
 */
async function resolveTexture(params) {
  if (params.type !== 'Sprite') return { texturePath: null, candidateId: null, generated: false };

  var manager = getManager();
  var assetId = 'sprite.' + (params.role || params.name || 'unknown').replace(/[^a-zA-Z0-9_.-]/g, '_').toLowerCase();
  var width = Number(params.width) || 32;
  var height = Number(params.height) || 32;
  var color = params.color || '#4488FF';
  var semanticTags = [params.role || params.name || 'object', 'game'].filter(Boolean);
  var styleTags = ['arcade', 'bright'];

  // 1. Try cloud library first
  var resolved = manager.resolveByTags('sprite', semanticTags, styleTags, { width: width, height: height });
  if (resolved) {
    // Use the stored candidate
    var relPath = path.relative(DEFAULT_OUTPUT_DIR, resolved.storedPath);
    // If the stored path is outside output/assets, copy it in
    if (relPath.startsWith('..')) {
      var outDir = DEFAULT_OUTPUT_DIR;
      fs.mkdirSync(outDir, { recursive: true });
      var destName = assetId + path.extname(resolved.storedPath);
      var destPath = path.join(outDir, destName);
      await fs.promises.copyFile(resolved.storedPath, destPath);
      return { texturePath: destName, candidateId: resolved.candidateId, generated: false };
    }
    return { texturePath: resolved.storedPath, candidateId: resolved.candidateId, generated: false };
  }

  // 2. Generate via ImageAgent
  var request = {
    assetId: assetId,
    kind: 'sprite',
    width: width,
    height: height,
    transparent: true,
    color: color,
    semanticTags: semanticTags,
    styleTags: styleTags,
    role: params.role || params.name,
  };

  var result = await imageAgent.generateImage(request, DEFAULT_OUTPUT_DIR);

  // 3. Store as candidate
  var stored = manager.storeCandidate({
    path: result.path,
    sha1: result.sha1,
    format: result.format,
    width: result.width,
    height: result.height,
    distillHint: result.distillHint,
  });

  // Return path relative to output/assets for the GDevelop project
  var textureFileName = path.basename(result.path);
  return {
    texturePath: textureFileName,
    candidateId: stored.candidateId,
    generated: true,
  };
}

module.exports = {
  resolveTexture: resolveTexture,
  getManager: getManager,
  resetManager: resetManager,
};
