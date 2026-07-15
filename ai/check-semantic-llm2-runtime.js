var assert = require('assert');
var dictionary = require('./capability-semantic-dictionary');
var runtime = require('./semantic-llm2-runtime');
var sourceContract = require('./game-semantic-source');

var index = dictionary.buildIndex();
var references = require('./semantic-reference-runtime').create(index);
function fakeSequence(outputs, captured) {
  return { invokeRole: async function(request) { captured.push(request); var output = outputs.shift(); if (output === undefined) throw new Error('Fake provider output exhausted.'); return { ok: true, output: { text: output }, receipt: { receiptId: 'provider.test-' + captured.length } }; } };
}
function world() { return { mode: 'baseline', world: { sourceHash: 'semantic.base', structureHash: 'structure.base', payload: {} } }; }
function invoke(outputs, captured, extra) { return runtime.create({ providerRuntime: fakeSequence(outputs, captured) }).invoke(Object.assign({ requestId: 'semantic.check', projectId: 'check', userRequest: 'make a compact game', creativeVision: 'clear readable play', world: world(), index: index }, extra || {})); }

(async function() {
  var write = [
    'game(semanticId=demo,name="Demo")',
    'entity(semanticId=GameState,roles=["state"],kind=state,behaviors=[])',
    'member(entity=GameState,semanticId=score,roles=["score"],value=0,bindings=["state.number","text.display-number"])',
    'entity(semanticId=ScoreText,roles=["ui","score"],kind=text,behaviors=[])',
    'event(semanticId=update_score,kind=rule)',
    'when(event=update_score,use=always)',
    'then(event=update_score,use=text.display-number,target=ScoreText,prefix="Score: ",value={"use":"state.number","target":"GameState.score"})',
    'policy(degree=slight,mode=percentage,value=0.1)'
  ].join(';');
  var directCalls = [];
  assert.throws(function() { require('./semantic-dsl-parser').parse('member(entity=GameState,semanticId=score,roles=["score"],value=0,bindings=[state.number,text.display-number])'); }, function(error) { return error.code === 'SEMANTIC_DSL_VALUE_INVALID'; }, 'legacy non-JSON arrays stay rejected');
  ['complete', 'task-complete', '.complete()'].forEach(function(stale) { assert.strictEqual(require('./semantic-dsl-parser').parse(stale).commands.length, 0, stale + ' stays outside the one function-shaped DSL'); });
  assert.strictEqual(require('./semantic-dsl-parser').parse('complete()').commands[0].type, 'complete', 'completion uses the same function shape as every DSL command');
  var prefixedCommand = require('./semantic-dsl-parser').parse('>entity(semanticId=player,roles=["player"],kind=sprite,behaviors=[])');
  assert.strictEqual(prefixedCommand.commands.length, 0, 'prefixed commands stay outside the canonical DSL');
  assert(/bare command names/.test(prefixedCommand.warnings[0]), 'legacy prefixes receive the canonical bare-command fact');
  var direct = await invoke([write, 'complete()'], directCalls);
  assert.strictEqual(direct.ok, true);
  assert.strictEqual(direct.rounds, 2, 'foundation path writes the complete Draft and commits in two rounds');
  assert.strictEqual(direct.runTrace[0].kind, 'draft-write');
  assert.strictEqual(direct.runTrace[1].kind, 'completion');
  assert.strictEqual(direct.document.assembly.documentKind, 'semantic-runtime-assembly');
  assert.strictEqual(direct.document.assembly.projectSeed.sceneVariables[0].value, 0, 'state entities materialize as scene variables');
  assert.strictEqual(direct.document.source.events[0].actions.length, 2, 'one display-number operation expands into ordered set and append invocations');
  assert(JSON.stringify(direct.document.assembly.eventGraph).indexOf('Score: ') >= 0);
  assert.strictEqual(directCalls[0].provider, 'deepseek');
  assert.strictEqual(directCalls[0].model, 'deepseek-v4-flash');
  assert.deepStrictEqual(directCalls[0].input.thinking, { type: 'enabled' });
  assert.strictEqual(directCalls[0].input.reasoningEffort, 'medium');
  assert.strictEqual(directCalls[0].input.temperature, 0);

  var systemPrompt = directCalls[0].input.messages[0].content;
  var firstUserPrompt = directCalls[0].input.messages[1].content;
  var secondUserPrompt = directCalls[1].input.messages[1].content;
  assert(systemPrompt.indexOf('RUNTIME|validates, binds, multiplies each use') >= 0);
  assert(systemPrompt.indexOf('RESPONSE|one DSL batch; prose=0; command separator:semicolon or line break') >= 0);
  assert.strictEqual(/READ DSL|WRITE DSL|COMMIT DSL|\[current-round\]/.test(systemPrompt + firstUserPrompt), false);
  assert(firstUserPrompt.indexOf('[condition-uses]') >= 0 && firstUserPrompt.indexOf('\ninput.key.just-pressed|') >= 0, 'stable foundation conditions are present before the first write');
  assert(firstUserPrompt.indexOf('[action-uses]') >= 0 && firstUserPrompt.indexOf('text.display-number|') >= 0, 'runtime-multiplied action is present before the first write');
  assert.strictEqual(/gdjs:\/\//.test(firstUserPrompt), false, 'internal GDJS references stay inside runtime');
  assert(secondUserPrompt.indexOf('[applied]') >= 0 && secondUserPrompt.indexOf('"command"') >= 0, 'the next round receives the exact previous batch accepted by runtime');
  assert.strictEqual(secondUserPrompt.indexOf('"status":"running"'), -1, 'runtime flow status must not compete with LLM2 task completion judgment');
  assert.strictEqual(secondUserPrompt.indexOf('"rounds"'), -1, 'runtime round bookkeeping must stay outside semantic feedback');
  assert(secondUserPrompt.indexOf('"type":"game"') >= 0, 'runtime ledger returns the compact successful boundary');
  assert(secondUserPrompt.indexOf('"semanticId":"demo"') >= 0, 'runtime returns the locally applied Draft structure');
  assert.strictEqual(/\bnever\b|don't|\btemplate\b|\bexample\b/i.test(systemPrompt), false, 'system prompt uses positive fill-in guidance');

  var multiRoundCalls = [];
  var firstPlan = write.split(';').slice(0, -1).join(';');
  var multiRound = await invoke([firstPlan, 'policy(degree=slight,mode=percentage,value=0.1)', 'complete()'], multiRoundCalls, { maxRounds: 3 });
  assert.strictEqual(multiRound.ok, true);
  var completionPrompt = multiRoundCalls[2].input.messages[1].content;
  assert(completionPrompt.indexOf('"prefix":"Score: "') >= 0, 'Draft keeps accepted semantic operation values after their batch leaves [applied]');
  assert(completionPrompt.indexOf('"use":"state.number","target":"GameState.score"') >= 0, 'Draft keeps accepted nested expression values for completion comparison');
  var appliedSection = completionPrompt.split('[applied]\n')[1].split('\n[task-ledger]')[0];
  assert(appliedSection.indexOf('"type":"policy"') >= 0 && appliedSection.indexOf('"type":"then"') < 0, 'only the previous batch appears as [applied]');

  var extensionGroup = references.parameterContext().extensionGroups.find(function(row) { return row.split('|')[2].split(',').indexOf('action') >= 0; }).split('|')[0];
  var extensionCalls = [];
  var extension = await invoke(['retrieve(group=' + extensionGroup + ',kind=action)', write, 'complete()'], extensionCalls, { maxRounds: 3 });
  assert.strictEqual(extension.ok, true);
  assert.strictEqual(extension.runTrace[0].kind, 'parameter-read');
  assert(extensionCalls[1].input.messages[1].content.indexOf('"operations"') >= 0, 'retrieve expands one extension group into x handles');

  var repairCalls = [];
  var repaired = await invoke(['entity(semanticId=player,roles=["player"],kind=bad,behaviors=[])', write, 'complete()'], repairCalls, { maxRounds: 3 });
  assert.strictEqual(repaired.ok, true);
  assert(repairCalls[1].input.messages[1].content.indexOf('SEMANTIC_REFERENCE_HANDLE_INVALID') >= 0, 'runtime returns the current handle-validation failure as next-round repair facts');

  var fusedCalls = [];
  await assert.rejects(function() { return invoke(['entity(semanticId=player,roles=["player"],kind=bad,behaviors=[])', 'entity(semanticId=player,roles=["player"],kind=bad,behaviors=[])'], fusedCalls, { maxRounds: 3 }); }, function(error) { return error.code === 'SEMANTIC_RUN_FUSED' && error.runLedger.status === 'fused'; });

  var editable = { schemaVersion: 4, documentKind: 'game-semantic-source', dictionarySource: index.source, game: { semanticId: 'edit_demo', name: 'Edit Demo' }, entities: [{ semanticId: 'player', roles: ['player'], objectTypeRef: references.resolveEntityKind('sprite'), behaviorTypeRefs: [], members: [{ semanticId: 'speed', roles: ['movement'], value: 100, bindings: [] }] }], events: [], assetIntents: [], layoutIntents: [], tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } } };
  var revisionCalls = [];
  var edited = await invoke(['member(entity=player,semanticId=speed,roles=["movement"],value=110,bindings=[])', 'complete()'], revisionCalls, { source: editable, world: sourceContract.structureView(editable, { index: index }) });
  assert.strictEqual(edited.document.source.entities[0].members[0].value, 110);
  assert.strictEqual(revisionCalls[0].input.messages[1].content.indexOf('"value":100'), -1, 'existing Source values stay in local runtime state');
  assert.strictEqual(/gdjs:\/\//.test(revisionCalls[0].input.messages[1].content), false, 'revision Draft exposes semantic algebra names');

  await assert.rejects(function() { return invoke([], [], { provider: 'old-provider' }); }, function(error) { return error.code === 'SEMANTIC_LLM2_INPUT_INVALID'; });
  console.log('[SemanticLLM2Runtime] event algebra, runtime multiplication, extension retrieve, local Draft feedback, completion, and fuse passed');
})().catch(function(error) { console.error(error); process.exit(1); });
