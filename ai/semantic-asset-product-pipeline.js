var crypto = require('crypto');
var dictionary = require('./capability-semantic-dictionary');
var sourceContract = require('./game-semantic-source');
var linker = require('./semantic-runtime-linker');
var assetEngine = require('./asset-engine-langgraph');
var binder = require('./gdjs-project-asset-binder');

function fail(code, message, assetState) { var error = new Error(message); error.code = code; error.owner = 'SemanticAssetProductPipeline'; if (assetState) error.assetState = assetState; throw error; }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }

async function run(input) {
  input = input || {};
  if (!input.runId || !input.source || !input.projectAssetDir) fail('SEMANTIC_ASSET_PRODUCT_INPUT_INVALID', 'Semantic asset product production requires runId, source, and projectAssetDir.');
  var index = input.index || dictionary.loadIndex();
  var source = sourceContract.validateSource(input.source, { index: index });
  if (input.revision) source = sourceContract.applyRevision(source, input.revision, { index: index });
  var assembly = linker.assemble(source, { index: index });
  var engineInput = Object.assign({}, input.assetEngine || {}, {
    runId: input.runId,
    projectId: input.projectId || input.runId,
    assetRequirementContract: assembly.assetRequirements,
    projectAssetDir: input.projectAssetDir
  });
  var assetState = await assetEngine.runAssetEngine(engineInput);
  if (!assetState.accepted) fail('SEMANTIC_ASSET_PRODUCT_BLOCKED', 'Asset LangGraph completed with blocking debt; GDJS binding was not attempted.', assetState);
  var artifact = binder.bindResources(assembly.projectSeed, assetState.assetWorld);
  var result = { schemaVersion: 2, documentKind: 'semantic-asset-product', runId: input.runId, projectId: engineInput.projectId, sourceHash: assembly.sourceHash, source: source, assembly: assembly, assetState: assetState, artifact: artifact };
  result.contentHash = 'semantic-asset-product.' + digest(result);
  return result;
}

module.exports = { run: run };
