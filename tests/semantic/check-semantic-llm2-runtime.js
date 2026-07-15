var assert = require('assert');
var dictionary = require('../../ai/capability-semantic-dictionary');
var runtime = require('../../ai/semantic-llm2-runtime');
var sourceContract = require('../../ai/game-semantic-source');
var stateMachine = require('../../ai/semantic-run-state-machine');

var index = dictionary.buildIndex();
var references = require('../../ai/semantic-reference-runtime').create(index);

function fakeSequence(outputs, captured) {
  return {
    invokeRole: async function(request) {
      captured.push(request);
      var output = outputs.shift();
      if (output === undefined) throw new Error('Fake provider output exhausted.');
      return {
        ok: true,
        output: { text: output, finishReason: 'stop', diagnostics: { elapsedMs: 1, firstContentMs: 1 } },
        receipt: { receiptId: 'provider.test-' + captured.length, usage: { prompt_cache_hit_tokens: captured.length > 1 ? 90 : 0, prompt_cache_miss_tokens: captured.length > 1 ? 10 : 100 } }
      };
    }
  };
}

function invoke(outputs, captured, extra) {
  return runtime.create({ providerRuntime: fakeSequence(outputs, captured) }).invoke(Object.assign({
    requestId: 'semantic.check',
    projectId: 'check',
    userRequest: 'make a compact score game',
    creativeVision: 'clear readable play',
    index: index
  }, extra || {}));
}

function planCommand(task) {
  return 'plan-task(' + [
    'semanticId=' + task.semanticId,
    'goal=' + JSON.stringify(task.goal),
    'dependsOn=' + JSON.stringify(task.dependsOn || []),
    'targets=' + JSON.stringify(task.targets),
    'uses=' + JSON.stringify(task.uses || []),
    'catalogs=' + JSON.stringify(task.catalogs || []),
    'retrieves=' + JSON.stringify(task.retrieves || [])
  ].join(',') + ')';
}

(async function() {
  var screenTopLeftHandle = references.parameterContext().layouts.filter(function(row) { return row.indexOf('|Screen top left|') >= 0; })[0].split('|')[0];
  var initialPlan = planCommand({
    semanticId: 'build_score_game',
    goal: 'Create the complete score game semantic truth in one atomic task.',
    targets: [
      { kind: 'game', semanticId: 'demo', intent: 'create' },
      { kind: 'entity', semanticId: 'GameState', intent: 'create' },
      { kind: 'member', owner: 'GameState', semanticId: 'score', intent: 'create' },
      { kind: 'entity', semanticId: 'ScoreText', intent: 'create' },
      { kind: 'layout', semanticId: 'score_layout', intent: 'create' },
      { kind: 'event', semanticId: 'update_score', facets: ['metadata', 'conditions', 'actions'], intent: 'create' },
      { kind: 'policy', semanticId: 'slight', intent: 'create' }
    ],
    uses: ['always', 'state.number', 'text.display-number'],
    catalogs: ['entity-kinds', 'event-kinds', 'layouts']
  });
  var initialWrite = [
    'game(semanticId=demo,name="Demo")',
    'entity(semanticId=GameState,roles=["state"],kind=state,behaviors=[])',
    'member(entity=GameState,semanticId=score,roles=["score"],value=0,bindings=["state.number","text.display-number"])',
    'entity(semanticId=ScoreText,roles=["ui","score"],kind=text,behaviors=[])',
    'layout(semanticId=score_layout,roles=["ui"],subject=ScoreText,bounds={"width":240,"height":48},relations=[{"semanticId":"score_anchor","layout":"' + screenTopLeftHandle + '","subjects":["ScoreText"]}],bindings=[])',
    'event(semanticId=update_score,kind=rule)',
    'when(event=update_score,use=always)',
    'then(event=update_score,use=text.display-number,target=ScoreText,prefix="Score: ",value={"use":"state.number","target":"GameState.score"})',
    'policy(degree=slight,mode=percentage,value=0.1)'
  ].join(';');

  var directCalls = [];
  var direct = await invoke([initialPlan, initialWrite, 'complete()'], directCalls);
  assert.strictEqual(direct.ok, true);
  assert.strictEqual(direct.modelCalls, 3, 'Planner, one atomic task, and finalization each own one provider call.');
  assert.deepStrictEqual(direct.runTrace.map(function(entry) { return entry.kind; }), ['task-plan', 'draft-write', 'completion']);
  assert.strictEqual(direct.runState.state, stateMachine.STATES.COMPLETED);
  assert.strictEqual(direct.taskPlan.tasks.length, 1);
  assert.strictEqual(direct.runLedger.events.filter(function(event) { return event.type === 'TASK_COMMITTED'; }).length, 1);
  assert.strictEqual(direct.runTrace[1].hashes.deltaHash, direct.runLedger.events.filter(function(event) { return event.type === 'TASK_RETRIEVED'; })[0].eventHash, 'task bundle deltaHash binds the post-retrieval state-machine head');
  assert.strictEqual(direct.document.assembly.documentKind, 'semantic-runtime-assembly');
  assert.strictEqual(direct.document.assembly.projectSeed.sceneVariables[0].value, 0);
  assert.strictEqual(direct.document.source.events[0].actions.length, 2, 'one semantic display operation expands deterministically at assembly time');
  assert.strictEqual(directCalls[0].provider, 'deepseek');
  assert.strictEqual(directCalls[0].model, 'deepseek-v4-flash');
  assert.deepStrictEqual(directCalls[0].input.thinking, { type: 'enabled' });
  assert.strictEqual(directCalls[0].input.reasoningEffort, 'high');
  assert.strictEqual(directCalls[0].input.temperature, 0);
  assert(directCalls[0].input.messages[0].content.indexOf('GameCastle Semantic Planner') >= 0);
  assert(directCalls[0].input.messages[0].content.indexOf('plan-task(') >= 0);
  assert(directCalls[1].input.messages[0].content.indexOf('GameCastle Semantic Executor') >= 0);
  assert.strictEqual(directCalls[1].input.messages[0].content.indexOf('plan-task('), -1, 'executor has no planner grammar');
  assert.strictEqual(directCalls[1].input.messages[0].content, directCalls[2].input.messages[0].content, 'task execution and finalization share one stable executor prefix');
  assert.strictEqual(direct.runTrace[1].hashes.stablePrefixHash, direct.runTrace[2].hashes.stablePrefixHash);
  assert.strictEqual(direct.cacheSummary.passed, true);
  assert(directCalls[1].input.messages[1].content.indexOf('[L3-active-task]') >= 0);
  assert(directCalls[2].input.messages[1].content.indexOf('[L3-final-candidate]') >= 0);
  assert.strictEqual(JSON.stringify(direct.runLedger).indexOf('Create the complete score game'), -1, 'event ledger stores hashes and transitions, not plan content');

  var infeasiblePlans = [
    { name: 'create-existing', plan: planCommand({ semanticId: 'create_existing', goal: 'Incorrectly create an existing entity.', targets: [{ kind: 'entity', semanticId: 'GameState', intent: 'create' }], catalogs: ['entity-kinds'] }) },
    { name: 'update-missing', plan: planCommand({ semanticId: 'update_missing', goal: 'Incorrectly update a missing entity.', targets: [{ kind: 'entity', semanticId: 'MissingState', intent: 'update' }], catalogs: ['entity-kinds'] }) },
    { name: 'missing-member-owner', plan: planCommand({ semanticId: 'missing_owner', goal: 'Incorrectly create a member without its owner.', targets: [{ kind: 'member', owner: 'MissingState', semanticId: 'score', intent: 'create' }] }) },
    { name: 'missing-event-metadata', plan: planCommand({ semanticId: 'missing_event_metadata', goal: 'Incorrectly create actions without event metadata.', targets: [{ kind: 'event', semanticId: 'missing_event', facets: ['actions'], intent: 'create' }], uses: ['always'] }) },
    { name: 'revision-game', plan: planCommand({ semanticId: 'revision_game', goal: 'Incorrectly revise the game identity.', targets: [{ kind: 'game', semanticId: 'demo', intent: 'update' }] }) },
    { name: 'revision-policy', plan: planCommand({ semanticId: 'revision_policy', goal: 'Incorrectly revise a tuning policy.', targets: [{ kind: 'policy', semanticId: 'slight', intent: 'update' }] }) },
    { name: 'missing-capability-source', plan: planCommand({ semanticId: 'missing_entity_catalog', goal: 'Incorrectly create an entity without a capability source.', targets: [{ kind: 'entity', semanticId: 'UnresolvedEntity', intent: 'create' }] }) }
  ];
  for (var infeasible of infeasiblePlans) {
    var infeasibleCalls = [];
    await assert.rejects(function() {
      return invoke([infeasible.plan, infeasible.plan], infeasibleCalls, { source: direct.document.source, userRequest: 'exercise planner feasibility gate: ' + infeasible.name });
    }, function(error) {
      var planFailures = error.runLedger.events.filter(function(event) { return event.type === stateMachine.EVENT_TYPES.FAILURE_RECORDED && event.payload.phase === 'plan'; });
      return error.code === 'SEMANTIC_RUN_FUSED' && error.runState.state === stateMachine.STATES.FUSED && error.runTrace.length === 2 && error.runTrace.every(function(entry) { return entry.phase === 'planner' && entry.result.code === 'SEMANTIC_TASK_PLAN_INFEASIBLE'; }) && planFailures.length === 2 && error.runLedger.events.some(function(event) { return event.type === stateMachine.EVENT_TYPES.PLAN_RETRY_STARTED; }) && !error.runLedger.events.some(function(event) { return event.type === stateMachine.EVENT_TYPES.PLAN_ACCEPTED; });
    }, infeasible.name + ' must remain in PLAN_REPAIR and never freeze an impossible TaskPlan');
    assert.strictEqual(infeasibleCalls.length, 2, infeasible.name + ' consumes only the bounded planner repair attempts');
  }

  var repairedPlanCalls = [];
  var recoverableBadPlan = planCommand({ semanticId: 'bad_missing_update', goal: 'Attempt an impossible update first.', targets: [{ kind: 'entity', semanticId: 'StillMissing', intent: 'update' }], catalogs: ['entity-kinds'] });
  var recoveredPlan = planCommand({ semanticId: 'recovered_entity', goal: 'Create one valid replacement after planner repair.', targets: [{ kind: 'entity', semanticId: 'PlannerRecovered', intent: 'create' }], catalogs: ['entity-kinds'] });
  var repairedPlanRun = await invoke([recoverableBadPlan, recoveredPlan, 'entity(semanticId=PlannerRecovered,roles=["recovered"],kind=state,behaviors=[])', 'complete()'], repairedPlanCalls, { source: direct.document.source, userRequest: 'recover from one infeasible plan' });
  assert.strictEqual(repairedPlanRun.runState.state, stateMachine.STATES.COMPLETED);
  assert.strictEqual(repairedPlanRun.modelCalls, 4, 'one planner repair adds only one bounded model call');
  assert(repairedPlanRun.runLedger.events.some(function(event) { return event.type === stateMachine.EVENT_TYPES.PLAN_RETRY_STARTED; }), 'a distinct repaired plan advances through the state machine instead of fusing');
  assert.strictEqual(repairedPlanCalls[0].input.messages[0].content, repairedPlanCalls[1].input.messages[0].content, 'planner repair preserves the versioned stable system prefix');

  var rollbackPlan = planCommand({
    semanticId: 'replace_event',
    goal: 'Delete the old score event and add one replacement entity.',
    targets: [{ kind: 'event', semanticId: 'update_score', intent: 'delete' }, { kind: 'entity', semanticId: 'replacement', intent: 'create' }],
    catalogs: ['entity-kinds']
  });
  var rollbackCalls = [];
  await assert.rejects(function() {
    var badBatch = 'remove(collection=events,semanticId=update_score);entity(semanticId=replacement,roles=["replacement"],kind=bad,behaviors=[])';
    return invoke([rollbackPlan, badBatch, badBatch], rollbackCalls, { source: direct.document.source });
  }, function(error) {
    var taskEntries = error.runTrace.slice(1);
    return error.code === 'SEMANTIC_RUN_FUSED' && error.runState.state === stateMachine.STATES.FUSED && taskEntries.length === 2 && taskEntries.every(function(entry) { return entry.result.code === 'SEMANTIC_TASK_CAPABILITY_UNDECLARED' && entry.result.rolledBack && entry.result.beforeDraftHash === entry.result.afterDraftHash; }) && error.draft.events.some(function(event) { return event.semanticId === 'update_score'; });
  }, 'a repeated task failure rolls back the whole candidate Draft and fuses only in the state machine');
  assert(rollbackCalls[2].input.messages[1].content.indexOf(rollbackCalls[1].input.messages[1].content) === 0, 'task repair appends transition lines without rewriting the prior prompt prefix');

  var firstFailurePlan = planCommand({ semanticId: 'invalid_first_command', goal: 'Update one existing event action atomically.', targets: [{ kind: 'event', semanticId: 'update_score', facets: ['actions'], intent: 'update' }], uses: ['state.number.set'] });
  await assert.rejects(function() {
    return invoke([firstFailurePlan, 'remove(collection=events,semanticId=update_score)', 'remove(collection=events,semanticId=update_score)'], [], { source: direct.document.source });
  }, function(error) {
    var failedWrites = error.runTrace.filter(function(entry) { return entry.kind === 'draft-write'; });
    return error.code === 'SEMANTIC_RUN_FUSED' && failedWrites.length === 2 && failedWrites.every(function(entry) { return entry.result.rolledBack === true && entry.result.beforeDraftHash === entry.result.afterDraftHash && entry.results.every(function(result) { return result.rolledBack === true; }); });
  }, 'a first-command failure still emits explicit whole-batch rollback evidence');

  var observerThrowRun = await invoke([initialPlan, initialWrite, 'complete()'], [], { onSemanticEvent: function() { throw new Error('monitor unavailable'); } });
  assert.strictEqual(observerThrowRun.runState.state, stateMachine.STATES.COMPLETED, 'monitor callback failures cannot alter semantic state');
  assert.strictEqual(observerThrowRun.observerWarnings.length, 3, 'monitor callback failures remain diagnostics only');

  var fusedCalls = [];
  await assert.rejects(function() {
    return invoke(['entity(semanticId=wrong,roles=["wrong"],kind=sprite,behaviors=[])', 'entity(semanticId=wrong,roles=["wrong"],kind=sprite,behaviors=[])'], fusedCalls);
  }, function(error) {
    return error.code === 'SEMANTIC_RUN_FUSED' && error.runState.state === stateMachine.STATES.FUSED && fusedCalls.length === 2;
  }, 'the same exact planner failure twice fuses through the one state-machine truth');

  var extensionGroup = references.parameterContext().extensionGroups.filter(function(row) { return row.split('|')[2].split(',').indexOf('action') >= 0; })[0].split('|')[0];
  var extensionPlan = planCommand({ semanticId: 'extension_root', goal: 'Resolve one extension group and create the root.', targets: [{ kind: 'game', semanticId: 'extension_demo', intent: 'create' }], retrieves: [{ group: extensionGroup, kind: 'action' }] });
  var extensionCalls = [];
  var extensionRun = await invoke([extensionPlan, 'game(semanticId=extension_demo,name="Extension Demo")', 'complete()'], extensionCalls);
  assert.strictEqual(extensionRun.modelCalls, 3, 'deterministic capability retrieval adds no model round');
  assert(extensionCalls[1].input.messages[1].content.indexOf('[L3-retrieve-facts]') >= 0 && extensionCalls[1].input.messages[1].content.indexOf('"operations"') >= 0, 'extension facts are scoped to the active task');
  assert(extensionRun.runLedger.events.some(function(event) { return event.type === 'TASK_RETRIEVED'; }), 'state machine receipts task-local capability resolution');

  var assetSource = {
    schemaVersion: sourceContract.SCHEMA_VERSION,
    documentKind: 'game-semantic-source',
    dictionarySource: index.source,
    game: { semanticId: 'asset_edit', name: 'Asset Edit' },
    entities: [{ semanticId: 'player', roles: ['player'], objectTypeRef: references.resolveEntityKind('sprite'), behaviorTypeRefs: [], members: [] }],
    components: [], events: [],
    assetIntents: [{ semanticId: 'player_art', roles: ['visual', 'player'], subject: 'player', description: 'A blue player hero.', productionFamily: references.resolveFamily('f1'), styleId: references.resolveStyle('s0'), constraints: { transparent: true, palette: 'blue' }, bindings: [] }],
    layoutIntents: [], tuningPolicies: { relativeChange: { slight: { mode: 'percentage', value: 0.1 } } }
  };
  assetSource = sourceContract.validateSource(assetSource, { index: index });
  var assetView = sourceContract.structureView(assetSource, { index: index });
  var feedback = { schemaVersion: 3, documentKind: 'semantic-feedback-batch', baseSourceHash: assetView.sourceHash, baseStructureHash: assetView.structureHash, entries: [{ feedbackId: 'player_art_review', kind: 'asset-observation', targets: [{ collection: 'assetIntents', semanticId: 'player_art' }], observation: { code: 'asset_style_mismatch', description: 'The player art reads as an enemy.', evidence: { semanticMargin: -0.03, requiredMargin: 0.005 } } }] };
  var assetPlan = planCommand({ semanticId: 'repair_player_art', goal: 'Repair the rejected player AssetIntent.', targets: [{ kind: 'asset', semanticId: 'player_art', intent: 'update' }], catalogs: ['asset-families', 'asset-styles'] });
  var assetWrite = 'asset(semanticId=player_art,roles=["visual","player"],subject=player,description="A friendly readable blue player hero.",family=f1,style=s0,constraints={"transparent":true,"palette":"blue","silhouette":"friendly"},bindings=[])';
  var assetCalls = [];
  var repaired = await invoke([assetPlan, assetWrite, 'complete()'], assetCalls, { source: assetSource, feedbackBatch: feedback, userRequest: 'repair the rejected player asset' });
  assert.strictEqual(repaired.document.source.assetIntents[0].description, 'A friendly readable blue player hero.');
  assert(repaired.document.revision.operations.some(function(operation) { return operation.op === 'upsert' && operation.collection === 'assetIntents'; }));
  assert(assetCalls[0].input.messages[1].content.indexOf('asset_style_mismatch') >= 0, 'typed feedback is visible to the planner before decomposition');
  assert(assetCalls[0].input.messages[1].content.indexOf('"targets":[{"collection":"assetIntents","semanticId":"player_art"}]') >= 0, 'planner receives the source-bound feedback target');
  assert(assetCalls[1].input.messages[1].content.indexOf('A blue player hero.') >= 0, 'executor task slice contains every LLM2-owned AssetIntent fact');

  await assert.rejects(function() { return invoke([], [], { world: {} }); }, function(error) { return error.code === 'SEMANTIC_LLM2_INPUT_INVALID'; }, 'external world is deleted from the LLM2 input contract');
  await assert.rejects(function() { return invoke([], [], { provider: 'old-provider' }); }, function(error) { return error.code === 'SEMANTIC_LLM2_INPUT_INVALID'; }, 'provider selection remains policy-owned');
  await assert.rejects(function() { return invoke([], [], { timeoutMs: 120001 }); }, function(error) { return error.code === 'SEMANTIC_LLM2_TIMEOUT_INVALID'; }, 'semantic work cannot widen the total limit beyond 120 seconds');
  var localDeadlineStarted = Date.now();
  await assert.rejects(function() {
    return runtime.create({ providerRuntime: { invokeRole: function() { return new Promise(function() {}); } } }).invoke({ requestId: 'semantic-local-deadline', projectId: 'semantic-local-deadline', timeoutMs: 20, maxTokens: 64, userRequest: 'create one generic game root', creativeVision: '', index: index });
  }, function(error) {
    return error.code === 'SEMANTIC_RUN_TIMEOUT' && error.runState && error.runState.state === 'EXPIRED' && error.runTrace && error.runTrace[error.runTrace.length - 1].result.code === 'SEMANTIC_RUN_TIMEOUT';
  }, 'runtime owns the hard deadline even when a provider promise never settles');
  assert(Date.now() - localDeadlineStarted < 500, 'local deadline does not wait for an uncooperative provider');
  for (var retired of [{ maxRounds: 8 }, { changeScope: {} }, { onSemanticRound: function() {} }]) await assert.rejects(function() { return invoke([], [], retired); }, function(error) { return error.code === 'SEMANTIC_LLM2_INPUT_INVALID'; });
  console.log('[SemanticLLM2Runtime] planner-task-finalize state loop, atomic rollback, exact fuse, typed feedback revision, and single inner truth passed');
})().catch(function(error) { console.error(error); process.exit(1); });
