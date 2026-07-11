var assert = require('assert');

var agentWorkflow = require('./agent-workflow');
var creativeAgent = require('./creative-agent');
var pipeline = require('./pipeline');

async function main() {
  var emptyEnv = { LLM_MODEL: '' };
  assert.strictEqual(agentWorkflow.resolveRoleModel('creative', emptyEnv), 'deepseek-v4-flash');
  assert.strictEqual(agentWorkflow.resolveRoleModel('intent', emptyEnv), 'deepseek-v4-flash');

  var customEnv = {
    GAMECASTLE_CREATIVE_MODEL: 'creative-model',
    GAMECASTLE_INTENT_MODEL: 'intent-model',
    GAMECASTLE_INTENT_REPAIR_MODEL: 'repair-model',
  };
  assert.strictEqual(agentWorkflow.resolveRoleModel('creative', customEnv), 'creative-model');
  assert.strictEqual(agentWorkflow.resolveRoleModel('intent', customEnv), 'intent-model');
  assert.strictEqual(agentWorkflow.resolveRoleModel('intentRepair', customEnv), 'repair-model');

  ['creative', 'intent', 'intentRepair', 'imageGeneration', 'vision'].forEach(function(role) {
    assert(agentWorkflow.getRole(role), 'role must be registered: ' + role);
  });
  assert.strictEqual(agentWorkflow.getRegisteredRoles().length, 5);
  assert.strictEqual(agentWorkflow.createAgent('creative').owner, 'LLM1');
  assert.strictEqual(agentWorkflow.createAgent('intent').owner, 'LLM2');
  assert.strictEqual(agentWorkflow.getRole('creative').reasoningEffort, 'medium', 'LLM1 director order should use medium reasoning');
  assert.strictEqual(agentWorkflow.getRole('intent').reasoningEffort, 'medium', 'LLM2 slot mapping should use medium reasoning');
  assert.strictEqual(agentWorkflow.getRole('intentRepair').reasoningEffort, 'medium', 'LLM2 slot repair should use medium reasoning');

  var templates = {
    modules: [
      { id: 'core.platformer', category: 'core', llm1Card: 'A complete platformer game core.' },
      { id: 'core.shooter', category: 'core', llm1Card: 'A complete shooter game core.' },
    ],
  };
  var systemPrompt = creativeAgent.buildCreativeSystemPrompt(templates);
  assert(systemPrompt.indexOf('Creative Imagination') >= 0, 'LLM1 prompt must identify creative ownership');
  ['template_selection carries', 'game_definition carries', 'play_plan carries', 'placement_plan carries', 'control_plan carries', 'win_condition carries'].forEach(function(token) {
    assert(systemPrompt.indexOf(token) >= 0, 'LLM1 prompt must explain director order slot content: ' + token);
  });
  ['DSL', 'example', 'never', 'do not', "don't"].forEach(function(token) {
    assert(systemPrompt.toLowerCase().indexOf(token.toLowerCase()) < 0, 'LLM1 prompt must keep director language affirmative and non-executable: ' + token);
  });

  var previousVision = JSON.stringify({
    template_selection: 'mobile_platformer',
    game_definition: 'A moonlit courier crosses a rearranging city.',
    play_plan: 'Read streets and deliver before the next bell.',
    placement_plan: 'Routes climb through city blocks with rewards on alternate paths.',
    control_plan: 'Run and jump between changing routes.',
    win_condition: 'Complete the final delivery before dawn.',
  });
  var userPrompt = creativeAgent.buildCreativeUserPrompt('Make the city feel more alive.', previousVision);
  assert(userPrompt.indexOf(previousVision) >= 0, 'iteration prompt must retain the previous creative vision');
  assert(userPrompt.indexOf('Make the city feel more alive.') >= 0, 'iteration prompt must retain the user request');

  var generated = await creativeAgent.generateDirectorOrder({
    userPrompt: 'Imagine a strange platformer.',
    previousVision: null,
    history: [],
    productModuleCatalog: templates,
    callModel: async function(_prompt, prompt, options) {
      assert.strictEqual(prompt, systemPrompt);
      assert.strictEqual(options.agentRole, 'creative');
      return JSON.stringify({
        template_selection: 'mobile_platformer',
        game_definition: 'A castle of changing staircases.',
        play_plan: 'Climb and reshape routes with each landing.',
        placement_plan: 'Stairs rise through rooms with weather memories on high routes.',
        control_plan: 'Jump and choose stair routes.',
        win_condition: 'Reach the highest room.',
      });
    },
  });
  var generatedOrder = creativeAgent.parseDirectorOrder(generated, templates);
  assert.strictEqual(generatedOrder.game_definition, 'A castle of changing staircases.');

  var change = pipeline.makeCreativeVisionChange(previousVision, generated);
  assert.strictEqual(change.isNew, false);
  assert.strictEqual(change.changed, true);
  assert.strictEqual(change.previousVision, previousVision);
  assert.strictEqual(change.currentVision, generated);

  console.log('[CreativeWorkflow] concise LLM1 director order and separate LLM2 ownership passed');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
