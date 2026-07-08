var agentWorkflow = require('./agent-workflow');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function main() {
  var emptyEnv = {};
  assert(
    agentWorkflow.resolveRoleModel('requirement', emptyEnv) === 'deepseek-v4-flash',
    'requirement model should default to deepseek-v4-flash'
  );
  assert(
    agentWorkflow.resolveRoleModel('dsl', emptyEnv) === 'deepseek-v4-flash',
    'dsl model should default to deepseek-v4-flash'
  );
  assert(
    agentWorkflow.resolveRoleModel('dslModuleRepair', emptyEnv) === 'deepseek-v4-flash',
    'module repair should inherit dsl model by default'
  );
  assert(
    agentWorkflow.resolveRoleModel('dslInternalRepair', emptyEnv) === 'deepseek-v4-flash',
    'internal repair should inherit dsl model by default'
  );

  var customEnv = {
    GAMECASTLE_REQUIREMENT_MODEL: 'req-model',
    GAMECASTLE_DSL_MODEL: 'dsl-model',
    GAMECASTLE_IMAGE_MODEL: 'image-model',
    GAMECASTLE_VISION_MODEL: 'vision-model',
  };
  assert(agentWorkflow.resolveRoleModel('requirement', customEnv) === 'req-model', 'requirement env override failed');
  assert(agentWorkflow.resolveRoleModel('dsl', customEnv) === 'dsl-model', 'dsl env override failed');
  assert(agentWorkflow.resolveRoleModel('dslModuleRepair', customEnv) === 'dsl-model', 'repair should inherit dsl env override');
  assert(agentWorkflow.resolveRoleModel('imageGeneration', customEnv) === 'image-model', 'image model env override failed');
  assert(agentWorkflow.resolveRoleModel('vision', customEnv) === 'vision-model', 'vision model env override failed');

  var summary = agentWorkflow.getWorkflowSummary(customEnv);
  var roles = summary.map(function(role) { return role.id; });
  ['requirement', 'dsl', 'dslModuleRepair', 'dslInternalRepair', 'imageGeneration', 'vision'].forEach(function(role) {
    assert(roles.indexOf(role) >= 0, 'missing workflow role: ' + role);
  });

  console.log('[AgentWorkflow] ' + summary.length + ' roles OK');

  var req = agentWorkflow.createAgent('requirement');
  assert(req.roleId === 'requirement', 'createAgent roleId');
  assert(req.owner === 'LLM1', 'createAgent owner');
  assert(typeof req.resolveModel === 'function', 'createAgent resolveModel');
  assert(req.buildCallOptions().agentRole === 'requirement', 'buildCallOptions agentRole');
  var img = agentWorkflow.createAgent('imageGeneration');
  assert(img.implemented === true, 'imageGeneration implemented');
  var vis = agentWorkflow.createAgent('vision');
  assert(vis.implemented === false, 'vision not implemented');
  assert(agentWorkflow.getRegisteredRoles().length === 6, '6 registered roles');
  console.log('[AgentWorkflow] createAgent factory OK');
}

main();
