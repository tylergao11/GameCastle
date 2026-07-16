var crypto = require('crypto');
var semanticModule = require('@gamecastle/semantic-module');
var assemblyModule = require('@gamecastle/assembly-module');
var assetEngine = require('../../assets/src/asset-engine-langgraph');

function fail(code, message, assetState) {
  var error = new Error(message);
  error.code = code;
  error.owner = 'SemanticAssetProductPipeline';
  if (assetState) error.assetState = assetState;
  throw error;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce(function(out, key) {
      out[key] = stable(value[key]);
      return out;
    }, {});
  }
  return value;
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24);
}

async function run(input) {
  input = input || {};
  if (!input.runId || !input.source || !input.projectAssetDir) {
    fail('SEMANTIC_ASSET_PRODUCT_INPUT_INVALID', 'Semantic asset product production requires runId, source, and projectAssetDir.');
  }
  // Public semantic module owns dictionary pin, Source validation, and SemanticAssembly.
  var source = semanticModule.validate(input.source);
  if (input.revision) source = semanticModule.applyRevision(source, input.revision);
  var semanticAssembly = semanticModule.compileSemanticAssembly(source);
  var projectSeed = assemblyModule.createProjectSeed({ semanticAssembly: semanticAssembly });
  var engineInput = Object.assign({}, input.assetEngine || {}, {
    runId: input.runId,
    projectId: input.projectId || input.runId,
    assetRequirementContract: semanticAssembly.assetRequirements,
    projectAssetDir: input.projectAssetDir
  });
  var assetState = await assetEngine.runAssetEngine(engineInput);
  if (!assetState.accepted) {
    fail('SEMANTIC_ASSET_PRODUCT_BLOCKED', 'Asset LangGraph completed with blocking debt; GDJS binding was not attempted.', assetState);
  }
  var artifact = assemblyModule.bindAcceptedAssets({
    semanticAssembly: semanticAssembly,
    projectSeed: projectSeed,
    acceptedAssetWorld: assetState.assetWorld
  });
  var result = {
    schemaVersion: 2,
    documentKind: 'semantic-asset-product',
    runId: input.runId,
    projectId: engineInput.projectId,
    sourceHash: semanticAssembly.sourceHash,
    source: source,
    // Single assembly truth: public SemanticAssembly (componentExpansion + assetRequirements).
    assembly: semanticAssembly,
    projectSeed: projectSeed,
    assetState: assetState,
    artifact: artifact
  };
  result.contentHash = 'semantic-asset-product.' + digest(result);
  return result;
}

function prewarm() {
  return assetEngine.prewarmGraph();
}

module.exports = { run: run, prewarm: prewarm };
