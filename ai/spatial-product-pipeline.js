var crypto = require('crypto');
var spatialAssembly = require('./spatial-assembly-stage');
var spatialPlanner = require('./spatial-planner-langgraph');
var geometryProducer = require('./spatial-geometry-fact-producer');
var assetWorld = require('./asset-world');

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SpatialProductPipeline'; throw error; }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }

async function run(input) {
  input = input || {};
  if (!input.runId || !input.projectId || !input.assetProduct || !input.previewDir) fail('SPATIAL_PRODUCT_INPUT_INVALID', 'Spatial product assembly requires runId, projectId, an accepted assetProduct, and previewDir.');
  if (Object.prototype.hasOwnProperty.call(input, 'geometryFacts')) fail('SPATIAL_PRODUCT_GEOMETRY_INJECTION_FORBIDDEN', 'Spatial geometry is produced only by the canonical Geometry Fact Producer.');
  var assetProduct = input.assetProduct;
  if (assetProduct.documentKind !== 'semantic-asset-product' || !assetProduct.source || !assetProduct.assembly || !assetProduct.assembly.componentExpansion || !assetProduct.artifact || !assetProduct.assetState || assetProduct.assetState.accepted !== true || !assetProduct.assetState.assetWorld) fail('SPATIAL_PRODUCT_ASSET_BOUNDARY_INVALID', 'Spatial product assembly requires an accepted semantic-asset-product artifact with component-expansion evidence.');
  var acceptedWorld = assetWorld.validateAcceptedAssetWorld(assetProduct.assetState.assetWorld, { sourceHash: assetProduct.sourceHash });
  var geometryFacts = geometryProducer.produce({ assetBoundSeed: assetProduct.artifact, assetWorld: acceptedWorld });
  var spatialInput = spatialAssembly.prepare(assetProduct.artifact, acceptedWorld, { componentExpansion: assetProduct.assembly.componentExpansion, geometryFacts: geometryFacts });
  var plannerRun = await spatialPlanner.runSpatialPlanner({ runId: input.runId, projectId: input.projectId, spatialInput: spatialInput, assetBoundSeed: assetProduct.artifact, assetWorld: acceptedWorld, semanticSource: assetProduct.source, previewDir: input.previewDir, traceDir: input.traceDir, maxRounds: input.maxRounds, maxTokens: input.maxTokens, plannerPort: input.plannerPort, providerRuntime: input.providerRuntime, providerOptions: input.providerOptions, onSpatialRound: input.onSpatialRound });
  if (!plannerRun || plannerRun.status !== 'accepted' || !plannerRun.resolution || !plannerRun.acceptedProjection) {
    var error = new Error('Spatial Planner did not produce one accepted resolution and GDJS projection.');
    error.code = 'SPATIAL_PRODUCT_BLOCKED'; error.owner = 'SpatialProductPipeline'; error.plannerRun = plannerRun || null; throw error;
  }
  var result = { schemaVersion: 3, documentKind: 'semantic-spatial-product', runId: input.runId, projectId: input.projectId, sourceHash: spatialInput.sourceHash, assetProductHash: assetProduct.contentHash, assetWorldHash: acceptedWorld.contentHash, geometryFacts: geometryFacts, spatialInput: spatialInput, plannerRun: plannerRun, traceArtifact: plannerRun.traceArtifact, resolution: plannerRun.resolution, acceptedProjection: plannerRun.acceptedProjection };
  result.contentHash = 'semantic-spatial-product.' + digest(result);
  return result;
}

module.exports = { run: run };
