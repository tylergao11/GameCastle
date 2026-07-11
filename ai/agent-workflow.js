var ROLE_DEFINITIONS = {
  creative: {
    id: 'creative',
    label: 'CreativeImagination',
    owner: 'LLM1',
    contractOwner: 'CreativeImagination',
    purpose: 'Select a template and state a concise natural-language director order for the game.',
    modality: 'text',
    envModel: 'GAMECASTLE_CREATIVE_MODEL',
    fallbackModel: 'deepseek-v4-flash',
    temperature: 0.9,
    reasoningEffort: 'medium',
    maxTokens: 1200,
  },
  intent: {
    id: 'intent',
    label: 'IntentAgent',
    owner: 'LLM2',
    contractOwner: 'IntentAgent',
    purpose: 'Recognize creative semantics and fill the closed Intent slot contract.',
    modality: 'text',
    envModel: 'GAMECASTLE_INTENT_MODEL',
    fallbackModel: 'deepseek-v4-flash',
    temperature: 0,
    reasoningEffort: 'medium',
    maxTokens: 4096,
  },
  intentRepair: {
    id: 'intentRepair',
    label: 'IntentRepair',
    owner: 'LLM2',
    contractOwner: 'IntentAgent',
    purpose: 'Repair Intent slot selection after contract diagnostics.',
    modality: 'text',
    envModel: 'GAMECASTLE_INTENT_REPAIR_MODEL',
    fallbackRole: 'intent',
    temperature: 0,
    reasoningEffort: 'medium',
    maxTokens: 4096,
  },
  imageGeneration: {
    id: 'imageGeneration',
    label: 'ImageAgent',
    owner: 'ImageAgent',
    contractOwner: 'ImageAgent',
    purpose: 'Generate image assets for objects, scenes, UI shells, and thumbnails.',
    modality: 'image',
    envModel: 'GAMECASTLE_IMAGE_MODEL',
    fallbackModel: null,
    implemented: true,
  },
  vision: {
    id: 'vision',
    label: 'VisionAgent',
    owner: 'VisionAgent',
    contractOwner: 'VisionAgent',
    purpose: 'Inspect generated images, screenshots, references, and playtest captures.',
    modality: 'vision',
    envModel: 'GAMECASTLE_VISION_MODEL',
    fallbackModel: null,
    implemented: false,
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getRole(roleId) {
  var role = ROLE_DEFINITIONS[roleId];
  if (!role) throw new Error('Unknown agent workflow role: ' + roleId);
  return role;
}

function resolveRoleModel(roleId, env) {
  env = env || process.env;
  var role = getRole(roleId);
  var model = role.envModel ? env[role.envModel] : null;
  if (!model && role.fallbackRole) model = resolveRoleModel(role.fallbackRole, env);
  if (!model && role.modality === 'text') model = env.LLM_MODEL;
  if (!model) model = role.fallbackModel;
  return model || null;
}

function buildTextCallOptions(roleId, overrides, env) {
  var role = getRole(roleId);
  if (role.modality !== 'text') {
    throw new Error('Agent workflow role is not a text model: ' + roleId);
  }
  overrides = overrides || {};
  var options = {
    model: resolveRoleModel(roleId, env),
    temperature: role.temperature,
    reasoningEffort: role.reasoningEffort,
    label: role.label,
    maxTokens: role.maxTokens,
    agentRole: role.id,
  };
  Object.keys(overrides).forEach(function(key) {
    if (overrides[key] !== undefined) options[key] = overrides[key];
  });
  return options;
}

function getWorkflowSummary(env) {
  return Object.keys(ROLE_DEFINITIONS).map(function(roleId) {
    var role = ROLE_DEFINITIONS[roleId];
    var summary = clone(role);
    summary.model = resolveRoleModel(roleId, env);
    return summary;
  });
}

/**
 * Create a unified agent interface for a given role.
 * Returns { role, resolveModel, buildCallOptions } for that role.
 */
function createAgent(roleId, env) {
  var role = getRole(roleId);
  env = env || process.env;
  return {
    roleId: role.id,
    label: role.label,
    owner: role.owner,
    contractOwner: role.contractOwner,
    purpose: role.purpose,
    modality: role.modality,
    implemented: role.implemented !== false,
    resolveModel: function() { return resolveRoleModel(roleId, env); },
    buildCallOptions: function(overrides) { return buildTextCallOptions(roleId, overrides, env); },
  };
}

/**
 * Get all registered agent role IDs.
 */
function getRegisteredRoles() {
  return Object.keys(ROLE_DEFINITIONS);
}
module.exports = {
  ROLE_DEFINITIONS: ROLE_DEFINITIONS,
  getRole: getRole,
  resolveRoleModel: resolveRoleModel,
  buildTextCallOptions: buildTextCallOptions,
  getWorkflowSummary: getWorkflowSummary,
  createAgent: createAgent,
  getRegisteredRoles: getRegisteredRoles,
};
