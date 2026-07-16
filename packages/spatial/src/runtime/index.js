var assembly = require('./assembly');
var candidate = require('./candidate');
var gdjsProjection = require('./gdjs-projection');
var planningSpace = require('./planning-space');

// Public Spatial Engine facade. Planner candidates are validated here; this
// boundary never generates the first spatial draft.

module.exports = {
  contract: assembly.contract,
  createAssemblyRequest: assembly.createAssemblyRequest,
  validateAssemblyRequest: assembly.validateAssemblyRequest,
  createAssemblyInput: assembly.createAssemblyInput,
  validateAssemblyInput: assembly.validateAssemblyInput,
  validateAssemblyInputAgainstSeed: assembly.validateAssemblyInputAgainstSeed,
  coordinateTruth: planningSpace.coordinateTruth,
  createPlanningSpace: planningSpace.createPlanningSpace,
  validatePlanningSpace: planningSpace.validatePlanningSpace,
  createLayoutCandidate: candidate.createLayoutCandidate,
  validateLayoutCandidate: candidate.validateLayoutCandidate,
  acceptCandidate: candidate.acceptCandidate,
  validatePreviewEvidence: candidate.validatePreviewEvidence,
  validateSpatialResolution: candidate.validateSpatialResolution,
  createCandidateProjection: gdjsProjection.createCandidateProjection,
  createAcceptedProjection: gdjsProjection.createAcceptedProjection,
  validateProjection: gdjsProjection.validateProjection
};
