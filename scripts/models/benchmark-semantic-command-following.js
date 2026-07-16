var runtimeApi = require('../../packages/providers/src/provider-runtime');
var grammar = require('../../packages/semantic/src/semantic-dsl-gbnf');
var parser = require('../../packages/semantic/src/semantic-dsl-parser');
var syntax = require('../../packages/semantic/src/semantic-dsl-syntax');

function systemPrompt(phase) {
  return [
    'GameCastle Semantic ' + (phase === 'planner' ? 'Planner' : 'Executor'),
    'THINKING_MODE|disabled',
    'OUTPUT_BODY|DSL commands only; each line is one complete command; do not explain',
    'IDENTIFIERS|preserve every identifier and value from the request exactly',
    'TEXT_VALUE|text containing spaces must preserve those spaces and be emitted as one quoted string',
    'OPTIONAL_FIELDS|omit optional fields unless explicitly requested',
    'COMMAND_FORMS|',
    syntax.renderPhase(phase).join('\n')
  ].join('\n');
}

var cases = [
  { name: 'game', phase: 'executor', prompt: '只输出一条 game 命令：目标 slot 是 root，游戏名称是 Tiny Game。', expected: { type: 'game', slot: 'root', name: 'Tiny Game' } },
  { name: 'entity', phase: 'executor', prompt: '只输出一条 entity 命令：slot 必须是 hero；roles 按顺序为 player、hero；kind 是 sprite；behaviors 为空。', expected: { type: 'entity', slot: 'hero', roles: ['player', 'hero'], kind: 'sprite', behaviors: [] } },
  { name: 'member', phase: 'executor', prompt: '只输出一条 member 命令：slot=score，roles 只有 score，value=0，bindings 只有 ui。', expected: { type: 'member', slot: 'score', roles: ['score'], value: 0, bindings: ['ui'] } },
  { name: 'component', phase: 'executor', prompt: '只输出一条 component 命令：slot=movement，kind=topdown-movement，targetSlot=hero，config 是 speed=200 的 record，bindings 是空 record。', expected: { type: 'component', slot: 'movement', kind: 'topdown-movement', targetSlot: 'hero', config: { speed: 200 }, bindings: {} } },
  { name: 'policy', phase: 'executor', prompt: '只输出一条 policy 命令：slot=difficulty，mode=percentage，value=75。', expected: { type: 'policy', slot: 'difficulty', mode: 'percentage', value: 75 } },
  { name: 'remove', phase: 'executor', prompt: '只输出一条 remove 命令，slot 必须精确等于 oldEnemy。', expected: { type: 'remove', slot: 'oldEnemy' } },
  { name: 'event', phase: 'executor', prompt: '只输出一条 event 命令：slot=start，kind=standard，locals 是空 record；不要填写可选字段。', expected: { type: 'event', slot: 'start', kind: 'standard', locals: {} } },
  { name: 'when', phase: 'executor', prompt: '只输出一条 when 命令：slot=collision，capability=hit，arguments=record(other=enemy)；不要填写其他可选字段。', expected: { type: 'when', slot: 'collision', capability: 'hit', arguments: { other: 'enemy' } } },
  { name: 'plan-task', phase: 'planner', prompt: '只输出一条 plan-task：semanticId=core，goal 是 Create player，after 为空列表。', expected: { type: 'plan-task', semanticId: 'core', goal: 'Create player', after: [] } },
  { name: 'plan-entity', phase: 'planner', prompt: '只输出一条 plan-entity：task=core，slot=hero，semanticId=player，intent=create。', expected: { type: 'plan-entity', task: 'core', slot: 'hero', semanticId: 'player', intent: 'create' } },
  { name: 'plan-use', phase: 'planner', prompt: '只输出一条 plan-use：task=core，alias=move，use=object.x.add。', expected: { type: 'plan-use', task: 'core', alias: 'move', use: 'object.x.add' } },
  { name: 'plan-retrieve', phase: 'planner', prompt: '只输出一条 plan-retrieve：task=core，alias=sprites，group=builtin.object，kind=object。', expected: { type: 'plan-retrieve', task: 'core', alias: 'sprites', group: 'builtin.object', kind: 'object' } }
];

(async function() {
  var runtime = runtimeApi.createProviderRuntime({ maxCost: Infinity }), passed = 0, grammarPassed = 0, noThinking = 0, totalMs = 0;
  for (var index = 0; index < cases.length; index++) {
    var test = cases[index], startedAt = Date.now(), result = await runtime.invokeRole({
      requestId: 'semantic-follow-' + Date.now() + '-' + index,
      projectId: 'gamecastle-command-benchmark',
      role: 'semantic-design', provider: 'llama-cpp-semantic', estimatedCost: 0, timeoutMs: 60000,
      input: { messages: [{ role: 'system', content: systemPrompt(test.phase) }, { role: 'user', content: test.prompt }], maxTokens: 192, thinking: { type: 'disabled' }, temperature: 0, grammar: grammar.forPhase(test.phase) }
    }), elapsedMs = Date.now() - startedAt, parsed = null, exact = false, grammarOk = false, thinkingOk = false, output = '';
    totalMs += elapsedMs;
    if (result.ok) {
      output = String(result.output.text || '').trim();
      thinkingOk = !result.output.reasoningText;
      try { parsed = parser.parse(output, { phase: test.phase }); grammarOk = parsed.commands.length === 1; } catch (_error) {}
      exact = grammarOk && JSON.stringify(parsed.commands[0]) === JSON.stringify(test.expected);
    }
    if (grammarOk) grammarPassed += 1;
    if (thinkingOk) noThinking += 1;
    if (exact) passed += 1;
    process.stdout.write((exact ? 'PASS' : 'FAIL') + ' | ' + test.name + ' | ' + elapsedMs + ' ms | ' + output.replace(/\s+/g, ' ') + '\n');
  }
  process.stdout.write('SUMMARY | exact=' + passed + '/' + cases.length + ' | grammar=' + grammarPassed + '/' + cases.length + ' | noThinking=' + noThinking + '/' + cases.length + ' | average=' + Math.round(totalMs / cases.length) + ' ms\n');
  process.exitCode = grammarPassed === cases.length && noThinking === cases.length && passed / cases.length >= 0.9 ? 0 : 2;
})().catch(function(error) { console.error(error); process.exit(1); });
