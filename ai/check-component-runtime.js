var assert = require('assert');
var dictionary = require('./capability-semantic-dictionary');
var referencesApi = require('./semantic-reference-runtime');
var draftApi = require('./semantic-draft');
var sourceContract = require('./game-semantic-source');
var expander = require('./component-expander');
var linker = require('./semantic-runtime-linker');
var spatialPlannerContext = require('./spatial-planner-context');

var index = dictionary.buildIndex();
var references = referencesApi.create(index);
var componentRows = references.parameterContext().components;
var joystickHandle = componentRows.filter(function(row) { return row.indexOf('|Virtual Joystick|') >= 0; })[0].split('|')[0];
var buttonHandle = componentRows.filter(function(row) { return row.indexOf('|Action Button|') >= 0; })[0].split('|')[0];
var skillHandle = componentRows.filter(function(row) { return row.indexOf('|Cooldown Skill|') >= 0; })[0].split('|')[0];
var stateMachineHandle = componentRows.filter(function(row) { return row.indexOf('|State Machine|') >= 0; })[0].split('|')[0];
var worldCenterHandle = references.parameterContext().layouts.filter(function(row) { return row.indexOf('|World center|') >= 0; })[0].split('|')[0];

function baseDraft() {
  var draft = draftApi.create(references);
  draftApi.execute(draft, { type: 'game', semanticId: 'component_demo', name: 'Component Demo' });
  draftApi.execute(draft, { type: 'entity', semanticId: 'Player', roles: ['player'], kind: 'sprite', behaviors: [] });
  draftApi.execute(draft, { type: 'layout', semanticId: 'Player-layout', roles: ['world'], subject: 'Player', bounds: { width: 64, height: 64 }, relations: [{ semanticId: 'Player-layout-placement', layout: worldCenterHandle, subjects: ['Player'] }], bindings: [] });
  return draft;
}

var joystickDraft = baseDraft();
draftApi.execute(joystickDraft, { type: 'component', semanticId: 'MoveControl', kind: joystickHandle, target: 'Player', config: { direction: 'horizontal' }, bindings: {} });
var joystickSource = sourceContract.validateSource(draftApi.materialize(joystickDraft), { index: index });
assert.strictEqual(joystickSource.schemaVersion, sourceContract.SCHEMA_VERSION, 'component source uses the only current schema');
assert.strictEqual(joystickSource.components.length, 1, 'source truth retains one component instance');
assert.strictEqual(joystickSource.components[0].componentRef, 'gc-component://input.virtual_joystick', 'source pins the dictionary component reference');
assert.strictEqual(joystickSource.entities[0].behaviorTypeRefs.length, 0, 'selecting a component leaves the entity command unchanged in Source');

var horizontal = expander.expand(joystickSource, { index: index, references: references });
var horizontalCompilationSource = expander._compilationSource(horizontal);
assert.strictEqual(Object.prototype.hasOwnProperty.call(horizontal, 'realizedSource'), false, 'component expansion contract does not expose a second Source document');
assert.strictEqual(JSON.stringify(horizontal).indexOf('game-semantic-source'), -1, 'serialized component evidence cannot be resubmitted as Source');
assert.strictEqual(horizontalCompilationSource.components.length, 0, 'internal compilation material has no recursive component truth');
assert(horizontalCompilationSource.entities.some(function(entity) { return entity.semanticId === 'MoveControl.surface'; }), 'joystick expansion creates its shared visual surface');
assert(horizontalCompilationSource.entities.filter(function(entity) { return entity.semanticId === 'Player'; })[0].behaviorTypeRefs.indexOf('gdjs://behavior/TopDownMovementBehavior::TopDownMovementBehavior') >= 0, 'joystick expansion supplies the required movement receiver');
assert.strictEqual(horizontalCompilationSource.events[0].actions[1].arguments.radius_in_pixels, '48', 'control size is a diameter and the circle is centered with half-size radius');
assert.deepStrictEqual(horizontal.components[0].generatedEvents, ['MoveControl.draw-circle', 'MoveControl.left', 'MoveControl.right'], 'horizontal direction omits vertical branches');

draftApi.execute(joystickDraft, { type: 'component', semanticId: 'MoveControl', kind: joystickHandle, target: 'Player', config: { direction: 'omnidirectional', shape: 'rectangle' }, bindings: {} });
var omnidirectionalSource = sourceContract.validateSource(draftApi.materialize(joystickDraft), { index: index });
var linked = linker.assemble(omnidirectionalSource, { index: index });
assert.strictEqual(linked.componentExpansion.components[0].generatedEvents.length, 5, 'one joystick config change selects rectangle plus four direction branches');
assert.strictEqual(linked.eventGraph.events.length, 5, 'Runtime compiles every selected component branch into GDJS events');
assert.strictEqual(linked.projectSeed.objectDeclarations.filter(function(item) { return item.semanticId === 'MoveControl.surface'; }).length, 1, 'Runtime materializes one component-expanded control object');
assert.strictEqual(linked.projectSeed.project.layouts[0].instances.length, 0, 'component controls stay unresolved until asset-aware spatial assembly');
assert(linked.projectSeed.spatialAssemblyRequest.subjects.some(function(subject) { return subject.subject === 'MoveControl.surface' && subject.reservation.width === 96 && subject.reservation.height === 96; }), 'component expansion preserves its control reservation without inventing a GDJS origin');
assert.strictEqual(linked.sourceHash, sourceContract.sourceHash(omnidirectionalSource), 'assembly identity remains the component source truth hash');
assert.notStrictEqual(linked.realizedSourceHash, linked.sourceHash, 'derived realization has a separate evidence hash, not a second editable truth');

var buttonDraft = baseDraft();
draftApi.execute(buttonDraft, { type: 'component', semanticId: 'ActionControl', kind: buttonHandle, target: 'Player', config: { pressMode: 'released' }, bindings: { action: { use: 'object.hide', arguments: { target: 'Player' } } } });
var buttonSource = sourceContract.validateSource(draftApi.materialize(buttonDraft), { index: index });
var buttonExpansion = expander.expand(buttonSource, { index: index, references: references });
assert.deepStrictEqual(buttonExpansion.components[0].generatedEvents, ['ActionControl.draw-circle', 'ActionControl.activate'], 'action button expands one visual branch and one bound action branch');
var actionEvent = expander._compilationSource(buttonExpansion).events.filter(function(event) { return event.semanticId === 'ActionControl.activate'; })[0];
assert.strictEqual(actionEvent.conditions[0].operation.use, 'input.pointer.released', 'pressMode selects one dictionary-backed pointer phase');
assert.strictEqual(actionEvent.actions[0].operation.use, 'object.hide', 'button action binding becomes the event action without a new button component type');

draftApi.execute(buttonDraft, { type: 'remove', collection: 'components', semanticId: 'ActionControl' });
assert.strictEqual(draftApi.materialize(buttonDraft).components.length, 0, 'component delete removes the instance as one semantic operation');
assert.throws(function() {
  draftApi.execute(baseDraft(), { type: 'component', semanticId: 'BadButton', kind: buttonHandle, target: 'Player', config: {}, bindings: {} });
}, function(error) { return error.code === 'SEMANTIC_COMPONENT_BINDING_MISSING'; }, 'required component bindings fail before completion');
assert.throws(function() {
  draftApi.execute(baseDraft(), { type: 'component', semanticId: 'WrongButton', kind: buttonHandle, target: 'Player', config: {}, bindings: { action: { use: 'always', arguments: {} } } });
}, function(error) { return error.code === 'SEMANTIC_COMPONENT_BINDING_INVALID'; }, 'binding kind mismatches fail in the WRITE round');
assert.throws(function() {
  draftApi.execute(baseDraft(), { type: 'component', semanticId: 'MissingArgumentButton', kind: buttonHandle, target: 'Player', config: {}, bindings: { action: { use: 'object.hide', arguments: {} } } });
}, function(error) { return error.code === 'SEMANTIC_COMPONENT_BINDING_INVALID' && /requires parameter target/.test(error.message); }, 'missing binding arguments fail in the WRITE round');
assert.throws(function() {
  draftApi.execute(baseDraft(), { type: 'component', semanticId: 'ExtraArgumentButton', kind: buttonHandle, target: 'Player', config: {}, bindings: { action: { use: 'object.hide', arguments: { target: 'Player', bogus: true } } } });
}, function(error) { return error.code === 'SEMANTIC_COMPONENT_BINDING_INVALID' && /no parameter named bogus/.test(error.message); }, 'extra binding arguments fail in the WRITE round');
var invalidButtonSource = JSON.parse(JSON.stringify(buttonSource));
invalidButtonSource.components[0].bindings.action.arguments = {};
assert.throws(function() { sourceContract.validateSource(invalidButtonSource, { index: index }); }, function(error) { return error.code === 'SEMANTIC_COMPONENT_BINDING_INVALID'; }, 'Source validation enforces the same binding argument contract');

var skillDraft = baseDraft();
draftApi.execute(skillDraft, { type: 'component', semanticId: 'DashSkill', kind: skillHandle, target: 'Player', config: { cooldownSeconds: 2 }, bindings: { trigger: { use: 'input.key.just-pressed', arguments: { key: 'Space' } }, effect: { use: 'object.hide', arguments: { target: 'Player' } } } });
var skillExpansion = expander.expand(sourceContract.validateSource(draftApi.materialize(skillDraft), { index: index }), { index: index, references: references });
var skillCompilationSource = expander._compilationSource(skillExpansion);
assert.deepStrictEqual(skillExpansion.components[0].generatedMembers, ['DashSkill-ready'], 'skill owns one generated readiness member');
assert.deepStrictEqual(skillExpansion.components[0].generatedEvents, ['DashSkill.activate', 'DashSkill.rearm'], 'skill expands activation and cooldown rearm as one component');
assert.strictEqual(skillCompilationSource.events[0].conditions[0].operation.use, 'input.key.just-pressed', 'skill trigger stays a semantic condition binding');
assert.strictEqual(skillCompilationSource.events[0].actions[0].operation.use, 'object.hide', 'skill effect stays a semantic action binding');
assert.throws(function() {
  var invalidSkill = baseDraft();
  draftApi.execute(invalidSkill, { type: 'component', semanticId: 'BadSkill', kind: skillHandle, target: 'Player', config: { cooldownSeconds: -1 }, bindings: { trigger: { use: 'input.key.just-pressed', arguments: { key: 'Space' } }, effect: { use: 'object.hide', arguments: { target: 'Player' } } } });
  sourceContract.validateSource(draftApi.materialize(invalidSkill), { index: index });
}, function(error) { return error.code === 'SEMANTIC_COMPONENT_CONFIG_INVALID'; }, 'dictionary config bounds reject negative cooldowns');

var machineDraft = baseDraft();
draftApi.execute(machineDraft, { type: 'component', semanticId: 'PlayerMachine', kind: stateMachineHandle, target: 'Player', config: { initialState: 'idle', transitions: [{ from: 'idle', to: 'moving', condition: 'moveRight', effect: 'showPlayer' }] }, bindings: { moveRight: { use: 'input.key.held', arguments: { key: 'Right' } }, showPlayer: { use: 'object.show', arguments: { target: 'Player' } } } });
var machineSource = sourceContract.validateSource(draftApi.materialize(machineDraft), { index: index });
var machineExpansion = expander.expand(machineSource, { index: index, references: references });
var machineCompilationSource = expander._compilationSource(machineExpansion);
var machineSpatialView = spatialPlannerContext.createSemanticView(machineSource, machineExpansion);
assert.strictEqual(machineSpatialView.components[0].semanticId, 'PlayerMachine', 'Spatial Planner semantic view receives the source component identity.');
assert.deepStrictEqual(machineSpatialView.components[0].config, machineSource.components[0].config, 'Spatial Planner semantic view preserves the source component config without a second component truth.');
assert.strictEqual(machineSpatialView.components[0].library.name, 'State Machine', 'Spatial Planner sees the component-library meaning, not only its internal reference.');
assert.deepStrictEqual(machineSpatialView.components[0].generatedEvents, machineExpansion.components[0].generatedEvents, 'Spatial Planner semantic view receives hash-bound component expansion facts.');
assert.deepStrictEqual(machineExpansion.components[0].generatedMembers, ['PlayerMachine-state'], 'state machine owns one generated state member');
assert.deepStrictEqual(machineExpansion.components[0].generatedEvents, ['PlayerMachine.transition-0'], 'one declared transition becomes one event');
assert.strictEqual(machineCompilationSource.entities[0].members[0].value, 'idle', 'state machine initializes its state from component config');
assert.strictEqual(machineCompilationSource.events[0].conditions[1].operation.use, 'input.key.held', 'transition condition is dictionary-bound data');
assert.strictEqual(machineCompilationSource.events[0].actions[0].operation.use, 'object.show', 'optional transition effect is dictionary-bound data');
assert.strictEqual(machineCompilationSource.events[0].actions[1].operation.use, 'state.text.set', 'Runtime applies the target state after the optional effect');
assert.throws(function() {
  var invalidMachine = baseDraft();
  draftApi.execute(invalidMachine, { type: 'component', semanticId: 'BadMachine', kind: stateMachineHandle, target: 'Player', config: { initialState: 'idle', transitions: [{ from: 'idle', to: 'moving', condition: 'missing' }] }, bindings: {} });
  sourceContract.validateSource(draftApi.materialize(invalidMachine), { index: index });
}, function(error) { return error.code === 'SEMANTIC_COMPONENT_BINDING_MISSING'; }, 'state transition binding names must resolve inside the same component instance');
var collisionDraft = baseDraft();
draftApi.execute(collisionDraft, { type: 'event', semanticId: 'Host', kind: 'group', locals: {} });
draftApi.execute(collisionDraft, { type: 'event', semanticId: 'PlayerMachine.transition-0', kind: 'rule', parent: 'Host', locals: {} });
draftApi.execute(collisionDraft, { type: 'component', semanticId: 'PlayerMachine', kind: stateMachineHandle, target: 'Player', config: { initialState: 'idle', transitions: [{ from: 'idle', to: 'moving', condition: 'moveRight' }] }, bindings: { moveRight: { use: 'input.key.held', arguments: { key: 'Right' } } } });
assert.throws(function() { expander.expand(sourceContract.validateSource(draftApi.materialize(collisionDraft), { index: index }), { index: index, references: references }); }, function(error) { return error.code === 'SEMANTIC_COMPONENT_ID_COLLISION'; }, 'generated events detect collisions across the complete nested event tree');

console.log('[ComponentRuntime] dictionary source, CRUD, inheritance, config variants, bindings, state machine, skill, expansion, and assembly passed');
