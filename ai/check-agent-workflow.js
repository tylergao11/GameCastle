var agentWorkflow = require('./agent-workflow');
var agentContracts = require('./agent-contracts');
var capabilities = require('./capabilities');
var path = require('path');
var requirementAgent = require('./requirement-agent');
var pipeline = require('./pipeline');

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
    agentWorkflow.resolveRoleModel('intent', emptyEnv) === 'deepseek-v4-flash',
    'intent model should default to deepseek-v4-flash'
  );
  assert(
    agentWorkflow.resolveRoleModel('intentRepair', emptyEnv) === 'deepseek-v4-flash',
    'intent repair should inherit intent model by default'
  );

  var customEnv = {
    GAMECASTLE_REQUIREMENT_MODEL: 'req-model',
    GAMECASTLE_INTENT_MODEL: 'intent-model',
    GAMECASTLE_IMAGE_MODEL: 'image-model',
    GAMECASTLE_VISION_MODEL: 'vision-model',
  };
  assert(agentWorkflow.resolveRoleModel('requirement', customEnv) === 'req-model', 'requirement env override failed');
  assert(agentWorkflow.resolveRoleModel('intent', customEnv) === 'intent-model', 'intent env override failed');
  assert(agentWorkflow.resolveRoleModel('intentRepair', customEnv) === 'intent-model', 'intent repair should inherit intent env override');
  assert(agentWorkflow.resolveRoleModel('imageGeneration', customEnv) === 'image-model', 'image model env override failed');
  assert(agentWorkflow.resolveRoleModel('vision', customEnv) === 'vision-model', 'vision model env override failed');

  var summary = agentWorkflow.getWorkflowSummary(customEnv);
  var roles = summary.map(function(role) { return role.id; });
  ['requirement', 'intent', 'intentRepair', 'imageGeneration', 'vision'].forEach(function(role) {
    assert(roles.indexOf(role) >= 0, 'missing workflow role: ' + role);
  });
  var intentRole = agentWorkflow.getRole('intent');
  assert(intentRole.owner === 'LLM2', 'live intent role should remain the LLM2 owner');
  assert(intentRole.purpose.indexOf('Intent DSL') >= 0, 'live intent role should describe Intent DSL');
  assert(agentWorkflow.getRole('intentRepair').owner === 'LLM2', 'Intent repair should remain inside the LLM2 Intent owner boundary');
  assert(agentWorkflow.getRole('intentRepair').purpose.indexOf('Intent DSL') >= 0, 'Intent repair should describe Intent DSL');

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
  assert(agentWorkflow.getRegisteredRoles().length === 5, '5 registered roles');
  console.log('[AgentWorkflow] createAgent factory OK');

  var requirementPrompt = requirementAgent.buildRequirementSystemPrompt('movement, collectibles');
  assert(requirementPrompt.indexOf('project.json') < 0, 'RequirementModel prompt must not name project.json');
  assert(requirementPrompt.indexOf('"x"') < 0, 'RequirementModel prompt must not ask for x coordinates');
  assert(requirementPrompt.indexOf('"y"') < 0, 'RequirementModel prompt must not ask for y coordinates');
  assert(requirementPrompt.indexOf('"width"') < 0, 'RequirementModel prompt must not ask for object width');
  assert(requirementPrompt.indexOf('"height"') < 0, 'RequirementModel prompt must not ask for object height');
  assert(requirementPrompt.indexOf('"value"') < 0, 'RequirementModel prompt must not ask for variable values');
  assert(requirementPrompt.indexOf('"anchor"') >= 0, 'RequirementModel prompt should ask for natural placement anchors');
  assert(requirementPrompt.indexOf('"direction"') >= 0, 'RequirementModel prompt should ask for natural placement directions');

  var liveCapabilityCatalog = capabilities.loadCapabilityCatalog(path.join(__dirname, 'product-modules'));
  var liveCreativeSummary = capabilities.buildCreativeCapabilitySummary(liveCapabilityCatalog);
  var liveRequirementPrompt = requirementAgent.buildRequirementSystemPrompt(liveCreativeSummary);
  assert(liveRequirementPrompt.indexOf('Product modules:') < 0, 'RequirementModel live prompt must not expose product module cards');
  assert(liveRequirementPrompt.indexOf('core.platformer') < 0, 'RequirementModel live prompt must not expose product module ids');
  assert(liveRequirementPrompt.indexOf('shell.start_screen') < 0, 'RequirementModel live prompt must not expose shell module ids');
  assert(liveRequirementPrompt.indexOf('project.json') < 0, 'RequirementModel live prompt must not name project.json');
  assert(liveRequirementPrompt.indexOf('platformer') >= 0, 'RequirementModel live prompt should retain natural capability hints');

  var validBrief = {
    theme: 'mobile platformer',
    objects: [{ name: 'Player', kind: 'player', note: 'hero' }],
    rules: ['Player collects Coin -> score increases'],
    layout: { placements: [{ object: 'Player', anchor: 'screen', direction: 'center' }] },
    behaviors: [{ object: 'Player', behavior: 'platformer' }],
    variables: [{ name: 'Score' }],
    difficulty: 'easy',
    controls: 'joystick and jump'
  };
  assert(agentContracts.validateDesignBrief(validBrief).valid, 'natural DesignBrief should validate');

  var coordinateBrief = JSON.parse(JSON.stringify(validBrief));
  coordinateBrief.layout.placements = [{ object: 'Player', x: 100, y: 400 }];
  assert(!agentContracts.validateDesignBrief(coordinateBrief).valid, 'DesignBrief validator must reject x/y placement');

  var defaultBrief = JSON.parse(JSON.stringify(validBrief));
  defaultBrief.objects[0].width = 32;
  assert(!agentContracts.validateDesignBrief(defaultBrief).valid, 'DesignBrief validator must reject runtime size defaults');

  var variableValueBrief = JSON.parse(JSON.stringify(validBrief));
  variableValueBrief.variables[0].value = 0;
  assert(!agentContracts.validateDesignBrief(variableValueBrief).valid, 'DesignBrief validator must reject runtime variable values');

  var rawPriorBrief = {
    theme: 'mobile platformer',
    objects: [
      { name: 'Player', kind: 'player', width: 32, height: 48, color: '#4488FF', note: 'hero' },
      { name: 'gdjs.BadObject', kind: 'ui', note: 'componentId=input.jump_button' }
    ],
    rules: [
      'Player collects Coin -> score increases',
      'on key ArrowLeft held -> move Player x=-4 scene=Game'
    ],
    layout: { placements: [{ object: 'Player', x: 100, y: 520 }] },
    variables: [{ name: 'Score', value: 0 }],
    difficulty: 'easy',
    controls: 'keyboard'
  };
  var previousPrompt = requirementAgent.buildRequirementUserPrompt([
    'make it mobile',
    'move the hero slightly forward',
    'set placement object=Fox x=1 y=2 scene=Game'
  ].join('\n'), rawPriorBrief);
  assert(previousPrompt.indexOf('"x"') < 0, 'RequirementModel previous brief prompt must sanitize x');
  assert(previousPrompt.indexOf('"width"') < 0, 'RequirementModel previous brief prompt must sanitize width');
  assert(previousPrompt.indexOf('"value"') < 0, 'RequirementModel previous brief prompt must sanitize variable value');
  assert(previousPrompt.indexOf('gdjs.BadObject') < 0, 'RequirementModel previous brief prompt must sanitize GDJS-like object names');
  assert(previousPrompt.indexOf('componentId=input.jump_button') < 0, 'RequirementModel previous brief prompt must sanitize component ids in notes');
  assert(previousPrompt.indexOf('move Player x=-4') < 0, 'RequirementModel previous brief prompt must sanitize internal target rules');
    'move the hero slightly forward',
  assert(previousPrompt.indexOf('set placement object=Fox') < 0, 'RequirementModel user prompt must sanitize target-plan instructions');
  assert(previousPrompt.indexOf('make it mobile') >= 0, 'RequirementModel user prompt should preserve safe natural wording');
  assert(previousPrompt.indexOf('move the hero slightly forward') >= 0, 'RequirementModel user prompt should preserve safe natural edits');
  assert(previousPrompt.indexOf('bottom-left') >= 0, 'RequirementModel previous brief prompt should preserve semantic placement');

  var safeHistory = requirementAgent.sanitizeRequirementHistory([
    { role: 'user', content: 'make platformer\nmove the hero slightly forward\nset placement object=Fox x=1 y=2 scene=Game' },
    { role: 'assistant', content: JSON.stringify(rawPriorBrief) }
  ]);
  var safeHistoryText = JSON.stringify(safeHistory);
  assert(safeHistoryText.indexOf('"x"') < 0, 'RequirementModel history must sanitize x');
  assert(safeHistoryText.indexOf('"height"') < 0, 'RequirementModel history must sanitize height');
  assert(safeHistoryText.indexOf('#4488FF') < 0, 'RequirementModel history must sanitize implementation colors');
  assert(safeHistoryText.indexOf('set placement object=Fox') < 0, 'RequirementModel history must sanitize target-plan instructions');
  assert(safeHistoryText.indexOf('make platformer') >= 0, 'RequirementModel history should preserve safe user wording');
  assert(safeHistoryText.indexOf('move the hero slightly forward') >= 0, 'RequirementModel history should preserve safe natural edits');

  var movedBrief = JSON.parse(JSON.stringify(validBrief));
  movedBrief.layout.placements = [{ object: 'Player', anchor: 'screen', direction: 'bottom-left' }];
  var briefDiff = pipeline.diffDesignBriefs(validBrief, movedBrief);
  assert(briefDiff.modified.placements.length === 1, 'natural placement direction changes should be detected');
  assert(briefDiff.modified.placements[0].object === 'Player', 'natural placement diff should preserve object name');
  console.log('[RequirementAgent] natural DesignBrief boundary OK');
}

main();
