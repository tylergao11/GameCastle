var spatialAssembly = require('./spatial-assembly-stage');
var spatialPlanner = require('./spatial-planner-langgraph');

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SpatialProductPipeline'; throw error; }

async function run(input) {
  input = input || {};
  if (!input.runId || !input.projectId || !input.assetProduct || !input.geometryFacts || !input.previewDir) fail('SPATIAL_PRODUCT_INPUT_INVALID', 'Spatial product assembly requires runId, projectId, assetProduct, geometryFacts, and previewDir.');
  var assetProduct = input.assetProduct;
  if (assetProduct.documentKind !== 'semantic-asset-product' || !assetProduct.source || !assetProduct.assembly || !assetProduct.assembly.componentExpansion || !assetProduct.artifact || !assetProduct.assetState || !assetProduct.assetState.assetWorld) fail('SPATIAL_PRODUCT_ASSET_BOUNDARY_INVALID', 'Spatial product assembly requires an accepted semantic-asset-product artifact with component-expansion evidence.');
  var spatialInput = spatialAssembly.prepare(assetProduct.artifact, assetProduct.assetState.assetWorld, { componentExpansion: assetProduct.assembly.componentExpansion, geometryFacts: input.geometryFacts });
  var plannerRun = await spatialPlanner.runSpatialPlanner({ runId: input.runId, projectId: input.projectId, spatialInput: spatialInput, assetBoundSeed: assetProduct.artifact, assetWorld: assetProduct.assetState.assetWorld, semanticSource: assetProduct.source, previewDir: input.previewDir, traceDir: input.traceDir, maxRounds: input.maxRounds, maxTokens: input.maxTokens, plannerPort: input.plannerPort, providerRuntime: input.providerRuntime, providerOptions: input.providerOptions, onSpatialRound: input.onSpatialRound });
  return { schemaVersion: 1, documentKind: 'semantic-spatial-product', runId: input.runId, projectId: input.projectId, sourceHash: spatialInput.sourceHash, assetProductHash: assetProduct.artifact.contentHash, spatialInput: spatialInput, plannerRun: plannerRun, traceArtifact: plannerRun.traceArtifact, acceptedProjection: plannerRun.acceptedProjection || null };
}

module.exports = { run: run };
