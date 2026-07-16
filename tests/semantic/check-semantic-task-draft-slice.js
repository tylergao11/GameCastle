var assert = require('assert');
var references = require('../../packages/semantic/src/semantic-reference-runtime').create();
var draftApi = require('../../packages/semantic/src/semantic-draft');
var taskPlan = require('../../packages/semantic/src/semantic-task-plan');
var sliceApi = require('../../packages/semantic/src/semantic-task-draft-slice');

function byId(items, semanticId) { return items.filter(function(item) { return item.semanticId === semanticId; })[0]; }
function fact(slice, claim) { return slice.facts.filter(function(item) { return item.claim === claim; })[0]; }

var authoring = draftApi.create(references, null);
draftApi.execute(authoring, { type: 'game', semanticId: 'demo', name: 'Existing Demo' });
draftApi.execute(authoring, { type: 'entity', semanticId: 'GameState', roles: ['state'], kind: 'state', behaviors: [] });
draftApi.execute(authoring, { type: 'member', entity: 'GameState', semanticId: 'score', roles: ['score'], value: 12, bindings: [] });
draftApi.execute(authoring, { type: 'entity', semanticId: 'actor', roles: ['player'], kind: 'sprite', behaviors: [] });
draftApi.execute(authoring, { type: 'member', entity: 'actor', semanticId: 'speed', roles: ['speed'], value: 12, bindings: [] });
draftApi.execute(authoring, { type: 'entity', semanticId: 'unrelated', roles: ['decoration'], kind: 'sprite', behaviors: [] });
draftApi.execute(authoring, { type: 'policy', degree: 'slight', mode: 'percentage', value: 0.25 });
draftApi.execute(authoring, { type: 'event', semanticId: 'loop', kind: 'repeat', count: 3, loopIndex: 'index', locals: { index: 0, limit: 12 } });
draftApi.execute(authoring, { type: 'then', event: 'loop', use: 'object.x.add', target: 'actor', value: 4 });

var existingSource = draftApi.materialize(authoring);
var draft = draftApi.create(references, existingSource);
var materializedBeforeProjection = JSON.stringify(draftApi.materialize(draft));
var compact = draftApi.structure(draft);
assert.strictEqual(compact.game.name, undefined, 'compact index intentionally omits the existing game name');
assert.strictEqual(byId(byId(compact.entities, 'GameState').members, 'score').value, undefined, 'compact index intentionally omits untouched member values');
assert.deepStrictEqual(compact.tuningDegrees, ['slight'], 'compact index intentionally retains only policy identity');

var authoritative = draftApi.taskStructure(draft);
assert.strictEqual(authoritative.structureKind, 'semantic-draft-task-structure');
assert.deepStrictEqual(authoritative.game, { semanticId: 'demo', name: 'Existing Demo' });
assert.strictEqual(byId(byId(authoritative.entities, 'GameState').members, 'score').value, 12, 'task-safe projection preserves existing member value');
assert.deepStrictEqual(authoritative.tuningPolicies.relativeChange.slight, { mode: 'percentage', value: 0.25 }, 'task-safe projection preserves exact policy mode and value');
var loop = byId(authoritative.events, 'loop');
assert.deepStrictEqual(loop.locals, { index: 0, limit: 12 }, 'task-safe projection preserves exact event locals');
assert.strictEqual(loop.argumentFact.truthKind, 'compiled-exact', 'v6 event arguments without semantic provenance are explicitly compiled facts');
assert.strictEqual(loop.argumentFact.semanticArgumentsAvailable, false, 'compiled event arguments do not pretend to be recovered semantic arguments');
assert.strictEqual(loop.argumentFact.parameterValues.count, 3, 'compiled event number argument remains exact');
assert.deepStrictEqual(loop.argumentFact.parameterValues.loopIndex, { referenceKind: 'local', semanticId: 'index' }, 'runtime local name is safely reverse-projected');
assert(/^semantic\.compiled-fact\.[a-f0-9]{64}$/.test(loop.argumentFact.compiledArgumentsHash));
assert.strictEqual(loop.actions.length, 1);
assert.strictEqual(loop.actions[0].argumentFact.truthKind, 'compiled-exact', 'existing v6 operation is represented as exact compiled invocations');
assert.strictEqual(loop.actions[0].argumentFact.semanticArgumentsAvailable, false, 'existing operation does not claim unavailable semantic arguments');
assert.strictEqual(loop.actions[0].argumentFact.replaceOperationId, loop.actions[0].operationId, 'compiled operation exposes the safe whole-operation replacement boundary');
assert.deepStrictEqual(loop.actions[0].argumentFact.invocations[0].parameterValues.object, { referenceKind: 'entity', semanticId: 'actor' });
assert.strictEqual(loop.actions[0].argumentFact.invocations[0].parameterValues.value, '4');
assert(/^x\d+$/.test(loop.actions[0].argumentFact.invocations[0].capability), 'compiled capability uses a safe dictionary handle');
assert(/^semantic\.compiled-fact\.[a-f0-9]{64}$/.test(loop.actions[0].argumentFact.compiledGroupHash));
assert.strictEqual(/gdjs:\/\/|gc-component:\/\//.test(JSON.stringify(authoritative)), false, 'task-safe projection contains no internal reference URI');
assert.strictEqual(JSON.stringify(draftApi.materialize(draft)), materializedBeforeProjection, 'task-safe projection is pure and does not mutate the Draft');
assert.strictEqual(Object.isFrozen(authoritative), true, 'task-safe projection is deeply frozen');
assert.strictEqual(Object.isFrozen(authoritative.events[0].argumentFact), true, 'nested task-safe facts are frozen');

draftApi.execute(draft, { type: 'then', event: 'loop', use: 'object.y.add', target: 'actor', value: 5 });
var afterWrite = draftApi.taskStructure(draft);
assert.strictEqual(afterWrite.events[0].actions[1].argumentFact.truthKind, 'semantic-arguments', 'new Draft operation retains exact semantic arguments');
assert.strictEqual(afterWrite.events[0].actions[1].argumentFact.semanticArgumentsAvailable, true);
assert.deepStrictEqual(afterWrite.events[0].actions[1].argumentFact.values, { target: 'actor', value: 5 });

var plan = taskPlan.create([
  { type: 'plan-task', semanticId: 'model', goal: 'Own actor metadata.', dependsOn: [], targets: [{ kind: 'entity', semanticId: 'actor', intent: 'update' }], uses: [], catalogs: ['entity-kinds'], retrieves: [] },
  { type: 'plan-task', semanticId: 'stats', goal: 'Own actor speed.', dependsOn: ['model'], targets: [{ kind: 'member', owner: 'actor', semanticId: 'speed', intent: 'update' }], uses: [], catalogs: [], retrieves: [] },
  { type: 'plan-task', semanticId: 'edit', goal: 'Edit exact existing facts.', dependsOn: ['stats'], targets: [{ kind: 'game', semanticId: 'demo', intent: 'update' }, { kind: 'member', owner: 'GameState', semanticId: 'score', intent: 'update' }, { kind: 'policy', semanticId: 'slight', intent: 'update' }, { kind: 'event', semanticId: 'loop', intent: 'update', facets: ['metadata', 'actions'] }], uses: ['object.y.add'], catalogs: ['event-kinds'], retrieves: [] }
]);
var entityOnlySlice = sliceApi.create(draft, plan, 'model');
assert.strictEqual(fact(entityOnlySlice, 'entity/actor').value.members, undefined, 'entity claim is metadata-only and cannot bypass member claims');
assert.strictEqual(fact(entityOnlySlice, 'member/actor/speed'), undefined, 'entity-only task receives no independent member fact');
var slice = sliceApi.create(draft, plan, 'edit');
assert.strictEqual(slice.taskId, 'edit');
assert(/^semantic-draft\./.test(slice.baseDraftHash));
assert(/^semantic\.slice\./.test(slice.structureHash));
assert.strictEqual(fact(slice, 'game/demo').value.name, 'Existing Demo', 'target fact comes from authoritative task projection');
assert.strictEqual(fact(slice, 'member/GameState/score').value.value, 12, 'member target includes its existing value');
assert.deepStrictEqual(fact(slice, 'policy/slight').value, { degree: 'slight', mode: 'percentage', value: 0.25 }, 'policy target includes exact mode and value');
assert.deepStrictEqual(fact(slice, 'event/loop#metadata').value.locals, { index: 0, limit: 12 }, 'event metadata target includes exact locals');
assert.strictEqual(fact(slice, 'event/loop#metadata').value.argumentFact.parameterValues.count, 3, 'event metadata target includes exact argument fact');
assert.strictEqual(fact(slice, 'event/loop#actions').value[0].argumentFact.truthKind, 'compiled-exact');
assert(slice.facts.some(function(item) { return item.claim === 'entity/actor' && item.exists; }), 'dependency target enters exact facts');
assert.strictEqual(fact(slice, 'entity/actor').value.members, undefined, 'dependency entity claim remains metadata-only');
assert.strictEqual(fact(slice, 'member/actor/speed').value.value, 12, 'explicit member dependency receives the member truth separately');
assert(slice.index.entities.some(function(item) { return item.semanticId === 'unrelated'; }), 'global identity remains in compact index');
assert.strictEqual(slice.facts.some(function(item) { return item.claim === 'entity/unrelated'; }), false, 'unrelated full Draft fact is not broadcast');
assert.strictEqual(/gdjs:\/\/|gc-component:\/\//.test(JSON.stringify(slice)), false, 'task slice contains no internal reference URI');
assert.strictEqual(Object.isFrozen(slice), true, 'Draft slice is immutable');
assert.strictEqual(Object.isFrozen(slice.index), true, 'Draft slice index is deeply immutable');
assert.strictEqual(Object.isFrozen(slice.facts), true, 'Draft slice facts are deeply immutable');

console.log('[SemanticTaskDraftSlice] authoritative existing values, explicit compiled-operation facts, task claims, compact index, URI safety, and deep freeze passed');
