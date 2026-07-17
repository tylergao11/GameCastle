// Live command-following probe for current semantic-dsl-v9 only.
// Planner: plan-task / plan-complete. Executor: free-write forms (no structure plan-*).
var runtimeApi = require('../../packages/providers/src/provider-runtime');
var grammar = require('../../packages/semantic/src/semantic-dsl-gbnf');
var parser = require('../../packages/semantic/src/semantic-dsl-parser');
var syntax = require('../../packages/semantic/src/semantic-dsl-syntax');

function systemPrompt(phase, workMode) {
  workMode = workMode || 'new';
  var forms = phase === 'planner' ? syntax.PLAN_LINES : syntax.writeLinesForMode(workMode);
  return [
    'GameCastle Semantic ' + (phase === 'planner' ? 'Planner' : 'Executor'),
    'LANGUAGE|' + syntax.LANGUAGE_ID,
    'THINKING_MODE|disabled',
    'OUTPUT|DSL commands only; first non-whitespace is commandName(',
    'FORMS|',
    forms.join('\n')
  ].join('\n');
}

var cases = [
  { name: 'plan-task', phase: 'planner', prompt: 'Emit only: plan-task(semanticId=core,goal="Create player",after=list())', expected: { type: 'plan-task', semanticId: 'core', goal: 'Create player', after: [] } },
  { name: 'plan-complete', phase: 'planner', prompt: 'Emit only: plan-complete()', expected: { type: 'plan-complete' } },
  { name: 'game', phase: 'executor', workMode: 'new', prompt: 'Emit only: game(slot=root,name="Tiny Game")', expected: { type: 'game', slot: 'root', name: 'Tiny Game' } },
  { name: 'entity', phase: 'executor', workMode: 'new', prompt: 'Emit only: entity(slot=hero,roles=list(player,hero),kind=sprite)', expected: { type: 'entity', slot: 'hero', roles: ['player', 'hero'], kind: 'sprite', behaviors: [] } },
  { name: 'member', phase: 'executor', workMode: 'revision', prompt: 'Emit only: member(slot=GameState.score,roles=list(score),value=0)', expected: { type: 'member', slot: 'GameState.score', roles: ['score'], value: 0, bindings: [] } },
  { name: 'event', phase: 'executor', workMode: 'revision', prompt: 'Emit only: event(slot=start,kind=rule)', expected: { type: 'event', slot: 'start', kind: 'rule', locals: {} } },
  { name: 'when', phase: 'executor', workMode: 'revision', prompt: 'Emit only: when(slot=start,capability=input.key.just-pressed,key="Space")', expected: { type: 'when', slot: 'start', capability: 'input.key.just-pressed', key: 'Space' } },
  { name: 'then', phase: 'executor', workMode: 'revision', prompt: 'Emit only: then(slot=start,capability=state.number.set,target=GameState.score,value=0)', expected: { type: 'then', slot: 'start', capability: 'state.number.set', target: 'GameState.score', value: 0 } }
];

function matchesExpected(command, expected) {
  var keys = Object.keys(expected);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (JSON.stringify(command[key]) !== JSON.stringify(expected[key])) return false;
  }
  return true;
}

(async function() {
  var runtime = runtimeApi.createProviderRuntime({ maxCost: Infinity });
  var passed = 0;
  var grammarPassed = 0;
  var totalMs = 0;
  for (var index = 0; index < cases.length; index++) {
    var test = cases[index];
    var startedAt = Date.now();
    var phase = test.phase;
    var workMode = test.workMode || 'new';
    var result = await runtime.invokeRole({
      requestId: 'semantic-follow-' + Date.now() + '-' + index,
      projectId: 'gamecastle-command-benchmark',
      role: 'semantic-design',
      provider: 'ollama',
      model: 'qwen3:8b',
      estimatedCost: 0,
      timeoutMs: 60000,
      input: {
        messages: [
          { role: 'system', content: systemPrompt(phase, workMode) },
          { role: 'user', content: test.prompt }
        ],
        maxTokens: 192,
        thinking: { type: 'disabled' },
        temperature: 0,
        grammar: grammar.forPhase(phase, { workMode: workMode })
      }
    });
    var elapsedMs = Date.now() - startedAt;
    totalMs += elapsedMs;
    var grammarOk = false;
    var exact = false;
    var output = '';
    if (result.ok) {
      output = String(result.output.text || '').trim();
      try {
        var parsed = parser.parse(output, { phase: phase });
        grammarOk = parsed.commands.length === 1;
        exact = grammarOk && matchesExpected(parsed.commands[0], test.expected);
      } catch (_error) {}
    }
    if (grammarOk) grammarPassed += 1;
    if (exact) passed += 1;
    process.stdout.write(
      '[' + test.name + '] ' + (exact ? 'PASS' : 'FAIL') +
      ' grammar=' + grammarOk + ' ms=' + elapsedMs +
      (exact ? '' : ' out=' + JSON.stringify(output).slice(0, 120)) +
      '\n'
    );
  }
  process.stdout.write(
    '[SemanticCommandFollowing] passed=' + passed + '/' + cases.length +
    ' grammarOk=' + grammarPassed + '/' + cases.length +
    ' avgMs=' + Math.round(totalMs / cases.length) +
    '\n'
  );
  if (passed !== cases.length) process.exit(1);
})().catch(function(error) {
  console.error(error);
  process.exit(1);
});
