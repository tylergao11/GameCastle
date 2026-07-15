var dictionary = require('./capability-semantic-dictionary');
var sourceContract = require('./game-semantic-source');
var linker = require('./semantic-runtime-linker');
var assetEngine = require('./asset-engine-langgraph');
var binder = require('./gdjs-project-asset-binder');

function fail(code, message, assetState) { var error = new Error(message); error.code = code; error.owner = 'SemanticAssetProductPipeline'; if (assetState) error.assetState = assetState; throw error; }

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
  var artifact = binder.bind(assembly.projectSeed, assetState.assetWorld);
  return { schemaVersion: 1, documentKind: 'semantic-asset-product', runId: input.runId, projectId: engineInput.projectId, sourceHash: assembly.sourceHash, source: source, assembly: assembly, assetState: assetState, artifact: artifact };
}

module.exports = { run: run };
