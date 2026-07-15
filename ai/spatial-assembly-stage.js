var spatialEngine = require('../runtime/spatial');

// Assembly-layer orchestration only. SpatialPlanner owns the first candidate;
// SpatialEngine only validates and materializes hash-bound facts.

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SpatialAssemblyStage'; throw error; }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SPATIAL_ASSEMBLY_STAGE_INVALID', label + ' must be an object'); return value; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('SPATIAL_ASSEMBLY_STAGE_INVALID', label + ' must be non-empty text'); return value.trim(); }
function allowed(value, fields, label) { Object.keys(value).forEach(function(field) { if (fields.indexOf(field) < 0) fail('SPATIAL_ASSEMBLY_STAGE_INVALID', label + ' contains unknown field: ' + field); }); }

function prepare(assetBoundSeed, assetWorld, options) {
  options = options || {};
  object(assetBoundSeed, 'GDJS asset-bound project seed');
  if (assetBoundSeed.documentKind !== 'gdjs-asset-bound-project-seed') fail('SPATIAL_ASSEMBLY_STAGE_INVALID', 'Spatial assembly requires a resource-bound GDJS project seed.');
  object(assetWorld, 'accepted AssetWorld');
  if (assetWorld.documentKind !== 'semantic-asset-world' || text(assetWorld.sourceHash, 'accepted AssetWorld.sourceHash') !== assetBoundSeed.sourceHash || text(assetWorld.contentHash, 'accepted AssetWorld.contentHash') !== assetBoundSeed.assetWorldHash) fail('SPATIAL_ASSEMBLY_STAGE_ASSET_MISMATCH', 'Spatial assembly requires the exact accepted AssetWorld used by resource binding.');
  allowed(options, ['componentExpansion', 'geometryFacts'], 'Spatial assembly options');
  return spatialEngine.createAssemblyInput(assetBoundSeed.spatialAssemblyRequest, {
    layoutPlan: assetBoundSeed.layoutPlan,
    assetWorld: assetWorld,
    assetBoundSeed: assetBoundSeed,
    componentExpansion: options.componentExpansion,
    geometryFacts: options.geometryFacts
  });
}

module.exports = { prepare: prepare };
