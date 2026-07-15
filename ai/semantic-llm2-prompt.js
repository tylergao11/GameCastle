var bundle = require('./semantic-prompt-bundle');

module.exports = {
  PROFILE_VERSIONS: bundle.PROFILE_VERSIONS,
  buildPlannerBundle: bundle.buildPlannerBundle,
  buildExecutorBundle: bundle.buildExecutorBundle,
};
