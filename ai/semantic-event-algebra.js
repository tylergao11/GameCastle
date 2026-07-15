var dictionary = require('./capability-semantic-dictionary');

function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'SemanticEventAlgebra'; throw error; }
function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function clean(value) { return String(value || '').replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function memberTarget(value) {
  var match = /^([A-Za-z][A-Za-z0-9_.-]*)\.([A-Za-z][A-Za-z0-9_.-]*)$/.exec(String(value || '').trim());
  if (!match) fail('SEMANTIC_ALGEBRA_MEMBER_INVALID', 'State target uses Entity.member: ' + value);
  return { entity: match[1], reference: match[1] + '.' + match[2] };
}
function stateBinding(value, runtime, objectCapability, sceneCapability, objectArgs, sceneArgs) {
  var target = memberTarget(value);
  var scope = runtime && runtime.memberScope ? runtime.memberScope(target.reference) : 'object';
  return scope === 'scene'
    ? invocation(sceneCapability, sceneArgs(target))
    : invocation(objectCapability, objectArgs(target));
}
function invocation(capabilityId, args) { return { capabilityId: capabilityId, arguments: args }; }
function expression(use, args) { return Object.assign({ use: use }, args || {}); }
function operation(key, kind, summary, fields, expand) {
  return { key: key, kind: kind, summary: summary, fields: fields, expand: expand };
}

var ENTITY_KINDS = {
  state: null,
  sprite: 'gdjs://object/Sprite::Sprite',
  text: 'gdjs://object/TextObject::Text',
  'bitmap-text': 'gdjs://object/BitmapText::BitmapTextObject',
  panel: 'gdjs://object/PanelSpriteObject::PanelSprite',
  'tiled-sprite': 'gdjs://object/TiledSpriteObject::TiledSprite',
  'text-input': 'gdjs://object/TextInput::TextInputObject',
  video: 'gdjs://object/Video::VideoObject'
};

var BEHAVIOR_KINDS = {
  topdown: 'gdjs://behavior/TopDownMovementBehavior::TopDownMovementBehavior',
  platformer: 'gdjs://behavior/PlatformBehavior::PlatformerObjectBehavior',
  platform: 'gdjs://behavior/PlatformBehavior::PlatformBehavior',
  physics2d: 'gdjs://behavior/Physics2::Physics2Behavior',
  tween: 'gdjs://behavior/Tween::TweenBehavior',
  'destroy-outside': 'gdjs://behavior/DestroyOutsideBehavior::DestroyOutside',
  pathfinding: 'gdjs://behavior/PathfindingBehavior::PathfindingBehavior',
  obstacle: 'gdjs://behavior/PathfindingBehavior::PathfindingObstacleBehavior'
};

var EVENT_KINDS = {
  rule: 'BuiltinCommonInstructions::Standard',
  else: 'BuiltinCommonInstructions::Else',
  group: 'BuiltinCommonInstructions::Group',
  while: 'BuiltinCommonInstructions::While',
  repeat: 'BuiltinCommonInstructions::Repeat',
  'for-each-entity': 'BuiltinCommonInstructions::ForEach'
};

var OPERATIONS = [
  operation('always', 'condition', 'always run this rule', {}, function() {
    return [invocation('BuiltinCommonInstructions::global::extension::condition::Always', {})];
  }),
  operation('scene.starts', 'condition', 'the scene has just started', {}, function() {
    return [invocation('BuiltinScene::global::extension::condition::SceneJustBegins', {})];
  }),
  operation('trigger.once', 'condition', 'run once when the other conditions become true', {}, function() {
    return [invocation('BuiltinCommonInstructions::global::extension::condition::Once', {})];
  }),
  operation('input.key.pressed', 'condition', 'a keyboard key is held', { key: 'keyboard key' }, function(a) {
    return [invocation('BuiltinKeyboard::global::extension::condition::KeyFromTextPressed', { key_to_check: a.key })];
  }),
  operation('input.key.just-pressed', 'condition', 'a keyboard key was newly pressed', { key: 'keyboard key' }, function(a) {
    return [invocation('BuiltinKeyboard::global::extension::condition::KeyFromTextJustPressed', { key_to_check: a.key })];
  }),
  operation('input.key.released', 'condition', 'a keyboard key was released', { key: 'keyboard key' }, function(a) {
    return [invocation('BuiltinKeyboard::global::extension::condition::KeyFromTextReleased', { key_to_check: a.key })];
  }),
  operation('number.compare', 'condition', 'compare two numeric values', { left: 'number or number expression', operator: 'dictionary-token', right: 'number or number expression' }, function(a) {
    return [invocation('BuiltinCommonInstructions::global::extension::condition::CompareNumbers', { first_expression: a.left, sign_of_the_test: a.operator, second_expression: a.right })];
  }),
  operation('text.compare', 'condition', 'compare two text values', { left: 'text or text expression', operator: 'dictionary-token', right: 'text or text expression' }, function(a) {
    return [invocation('BuiltinCommonInstructions::global::extension::condition::CompareStrings', { first_string_expression: a.left, sign_of_the_test: a.operator, second_string_expression: a.right })];
  }),
  operation('object.collides', 'condition', 'two entity instances overlap', { first: 'entity', second: 'entity' }, function(a) {
    return [invocation('BuiltinObject::global::extension::condition::CollisionNP', { object: a.first, object_2: a.second, ignore_objects_that_are_touching_each_other_on_their: 'no' })];
  }),
  operation('object.pick-all', 'condition', 'select every instance of an entity for the remaining conditions and actions', { target: 'entity' }, function(a) {
    return [invocation('BuiltinObject::global::extension::condition::PickAllInstances', { object: a.target })];
  }),
  operation('object.pick-random', 'condition', 'select one random instance of an entity', { target: 'entity' }, function(a) {
    return [invocation('BuiltinObject::global::extension::condition::PickRandomInstance', { object: a.target })];
  }),
  operation('object.pick-nearest', 'condition', 'select the entity instance nearest a position', { target: 'entity', x: 'number or expression', y: 'number or expression' }, function(a) {
    return [invocation('BuiltinObject::global::extension::condition::PickNearest', { object: a.target, x_position: a.x, y_position: a.y })];
  }),
  operation('object.x.compare', 'condition', 'compare entity X position', { target: 'entity', operator: 'dictionary-token', value: 'number or expression' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::condition::PosX', { object: a.target, operator: a.operator, value: a.value })];
  }),
  operation('object.y.compare', 'condition', 'compare entity Y position', { target: 'entity', operator: 'dictionary-token', value: 'number or expression' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::condition::PosY', { object: a.target, operator: a.operator, value: a.value })];
  }),
  operation('object.count.compare', 'condition', 'compare the number of entity instances in the scene', { target: 'entity', operator: 'dictionary-token', value: 'number or expression' }, function(a) {
    return [invocation('BuiltinObject::global::extension::condition::SceneInstancesCount', { object: a.target, operator: a.operator, value: a.value })];
  }),
  operation('state.number.compare', 'condition', 'compare an entity numeric member', { target: 'Entity.member', operator: 'dictionary-token', value: 'number or expression' }, function(a, runtime) {
    return [stateBinding(a.target, runtime,
      'BuiltinObject::object::BuiltinObject::__object_metadata__::condition::NumberObjectVariable', 'BuiltinVariables::global::extension::condition::VarScene',
      function(target) { return { object: target.entity, variable: target.reference, operator: a.operator, value: a.value }; },
      function(target) { return { variable: target.reference, operator: a.operator, value: a.value }; })];
  }),
  operation('state.text.compare', 'condition', 'compare an entity text member', { target: 'Entity.member', operator: 'dictionary-token', value: 'text or expression' }, function(a, runtime) {
    return [stateBinding(a.target, runtime,
      'BuiltinObject::object::BuiltinObject::__object_metadata__::condition::StringObjectVariable', 'BuiltinVariables::global::extension::condition::VarSceneTxt',
      function(target) { return { object: target.entity, variable: target.reference, operator: a.operator, value: a.value }; },
      function(target) { return { variable: target.reference, operator: a.operator, value: a.value }; })];
  }),
  operation('state.boolean.is', 'condition', 'check an entity boolean member', { target: 'Entity.member', value: 'true|false' }, function(a, runtime) {
    return [stateBinding(a.target, runtime,
      'BuiltinObject::object::BuiltinObject::__object_metadata__::condition::ObjectVariableAsBoolean', 'BuiltinVariables::global::extension::condition::SceneVariableAsBoolean',
      function(target) { return { object: target.entity, variable: target.reference, check_if_the_value_is: a.value }; },
      function(target) { return { variable: target.reference, check_if_the_value_is: a.value }; })];
  }),
  operation('timer.elapsed', 'condition', 'compare a scene timer in seconds', { timer: 'timer name', operator: 'dictionary-token', seconds: 'number or expression' }, function(a) {
    return [invocation('BuiltinTime::global::extension::condition::CompareTimer', { timer_s_name: a.timer, sign_of_the_test: a.operator, time_in_seconds: a.seconds })];
  }),
  operation('object.timer.elapsed', 'condition', 'compare an entity timer in seconds', { target: 'entity', timer: 'timer name', operator: 'dictionary-token', seconds: 'number or expression' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::condition::CompareObjectTimer', { object: a.target, timer_s_name: a.timer, sign_of_the_test: a.operator, time_in_seconds: a.seconds })];
  }),
  operation('sprite.animation.finished', 'condition', 'the current sprite animation finished', { target: 'entity' }, function(a) {
    return [invocation('Sprite::object::Sprite::Sprite::condition::AnimationEnded2', { object: a.target })];
  }),

  operation('object.create', 'action', 'create an entity instance', { target: 'entity', x: 'number or expression', y: 'number or expression', layer: 'layer name optional' }, function(a) {
    return [invocation('BuiltinObject::global::extension::action::Create', { object_to_create: a.target, x_position: a.x, y_position: a.y, layer: a.layer === undefined ? '' : a.layer })];
  }),
  operation('object.delete', 'action', 'delete the picked entity instances', { target: 'entity' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::action::Delete', { object: a.target })];
  }),
  operation('object.position.set', 'action', 'set both coordinates of an entity', { target: 'entity', x: 'number or expression', y: 'number or expression' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::action::SetXY', { object: a.target, modification_s_sign: '=', x_position: a.x, modification_s_sign_2: '=', y_position: a.y })];
  }),
  operation('object.position.add', 'action', 'add offsets to both coordinates of an entity', { target: 'entity', x: 'number or expression', y: 'number or expression' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::action::SetXY', { object: a.target, modification_s_sign: '+', x_position: a.x, modification_s_sign_2: '+', y_position: a.y })];
  }),
  operation('object.x.set', 'action', 'set entity X position', { target: 'entity', value: 'number or expression' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::action::SetX', { object: a.target, operator: '=', value: a.value })];
  }),
  operation('object.x.add', 'action', 'add to entity X position', { target: 'entity', value: 'number or expression' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::action::SetX', { object: a.target, operator: '+', value: a.value })];
  }),
  operation('object.y.set', 'action', 'set entity Y position', { target: 'entity', value: 'number or expression' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::action::SetY', { object: a.target, operator: '=', value: a.value })];
  }),
  operation('object.y.add', 'action', 'add to entity Y position', { target: 'entity', value: 'number or expression' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::action::SetY', { object: a.target, operator: '+', value: a.value })];
  }),
  operation('object.place.random-grid', 'action', 'place an entity on a random grid coordinate', { target: 'entity', minX: 'number', maxX: 'number', minY: 'number', maxY: 'number', step: 'positive number' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::action::SetXY', {
      object: a.target,
      modification_s_sign: '=',
      x_position: expression('number.random-step', { min: a.minX, max: a.maxX, step: a.step }),
      modification_s_sign_2: '=',
      y_position: expression('number.random-step', { min: a.minY, max: a.maxY, step: a.step })
    })];
  }),
  operation('object.stop', 'action', 'remove all forces from an entity', { target: 'entity' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::action::ClearForces', { object: a.target })];
  }),
  operation('object.show', 'action', 'show an entity', { target: 'entity' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::action::Show', { object: a.target })];
  }),
  operation('object.hide', 'action', 'hide an entity', { target: 'entity' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::action::Hide', { object: a.target })];
  }),
  operation('object.angle.set', 'action', 'set entity angle in degrees', { target: 'entity', value: 'number or expression' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::action::SetAngle', { object: a.target, operator: '=', value: a.value })];
  }),
  operation('object.force.add', 'action', 'add a movement force by angle and speed', { target: 'entity', angle: 'degrees', speed: 'pixels per second', permanent: 'true|false' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::action::AddForceAL', { object: a.target, angle: a.angle, speed_in_pixels_per_second: a.speed, force_multiplier: a.permanent ? 1 : 0 })];
  }),
  operation('state.number.set', 'action', 'set an entity numeric member', { target: 'Entity.member', value: 'number or expression' }, function(a, runtime) {
    return [stateBinding(a.target, runtime,
      'BuiltinObject::object::BuiltinObject::__object_metadata__::action::ModVarObjet', 'BuiltinVariables::global::extension::action::ModVarScene',
      function(target) { return { object: target.entity, variable: target.reference, operator: '=', value: a.value }; },
      function(target) { return { variable: target.reference, operator: '=', value: a.value }; })];
  }),
  operation('state.number.add', 'action', 'add to an entity numeric member', { target: 'Entity.member', value: 'number or expression' }, function(a, runtime) {
    return [stateBinding(a.target, runtime,
      'BuiltinObject::object::BuiltinObject::__object_metadata__::action::ModVarObjet', 'BuiltinVariables::global::extension::action::ModVarScene',
      function(target) { return { object: target.entity, variable: target.reference, operator: '+', value: a.value }; },
      function(target) { return { variable: target.reference, operator: '+', value: a.value }; })];
  }),
  operation('state.number.subtract', 'action', 'subtract from an entity numeric member', { target: 'Entity.member', value: 'number or expression' }, function(a, runtime) {
    return [stateBinding(a.target, runtime,
      'BuiltinObject::object::BuiltinObject::__object_metadata__::action::ModVarObjet', 'BuiltinVariables::global::extension::action::ModVarScene',
      function(target) { return { object: target.entity, variable: target.reference, operator: '-', value: a.value }; },
      function(target) { return { variable: target.reference, operator: '-', value: a.value }; })];
  }),
  operation('state.text.set', 'action', 'set an entity text member', { target: 'Entity.member', value: 'text or expression' }, function(a, runtime) {
    return [stateBinding(a.target, runtime,
      'BuiltinObject::object::BuiltinObject::__object_metadata__::action::ModVarObjetTxt', 'BuiltinVariables::global::extension::action::ModVarSceneTxt',
      function(target) { return { object: target.entity, variable: target.reference, operator: '=', value: a.value }; },
      function(target) { return { variable: target.reference, operator: '=', value: a.value }; })];
  }),
  operation('state.boolean.set', 'action', 'set an entity boolean member', { target: 'Entity.member', value: 'true|false' }, function(a, runtime) {
    return [stateBinding(a.target, runtime,
      'BuiltinObject::object::BuiltinObject::__object_metadata__::action::SetObjectVariableAsBoolean', 'BuiltinVariables::global::extension::action::SetSceneVariableAsBoolean',
      function(target) { return { object: target.entity, variable: target.reference, new_value: a.value }; },
      function(target) { return { variable: target.reference, new_value: a.value }; })];
  }),
  operation('state.boolean.toggle', 'action', 'toggle an entity boolean member', { target: 'Entity.member' }, function(a, runtime) {
    return [stateBinding(a.target, runtime,
      'BuiltinObject::object::BuiltinObject::__object_metadata__::action::ToggleObjectVariableAsBoolean', 'BuiltinVariables::global::extension::action::ToggleSceneVariableAsBoolean',
      function(target) { return { object: target.entity, variable: target.reference }; },
      function(target) { return { variable: target.reference }; })];
  }),
  operation('text.set', 'action', 'replace the content of a text entity', { target: 'entity', value: 'text or string expression' }, function(a) {
    return [invocation('TextObject::object::TextObject::Text::action::String', { object: a.target, operator: '=', value: a.value })];
  }),
  operation('text.append', 'action', 'append content to a text entity', { target: 'entity', value: 'text or string expression' }, function(a) {
    return [invocation('TextObject::object::TextObject::Text::action::String', { object: a.target, operator: '+', value: a.value })];
  }),
  operation('text.display-number', 'action', 'replace text with a prefix followed by a numeric value', { target: 'entity', prefix: 'text', value: 'number or number expression' }, function(a) {
    return [
      invocation('TextObject::object::TextObject::Text::action::String', { object: a.target, operator: '=', value: a.prefix }),
      invocation('TextObject::object::TextObject::Text::action::String', { object: a.target, operator: '+', value: expression('number.to-text', { value: a.value }) })
    ];
  }),
  operation('timer.reset', 'action', 'start or reset a scene timer', { timer: 'timer name' }, function(a) {
    return [invocation('BuiltinTime::global::extension::action::ResetTimer', { timer_s_name: a.timer })];
  }),
  operation('object.timer.reset', 'action', 'start or reset an entity timer', { target: 'entity', timer: 'timer name' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::action::ResetObjectTimer', { object: a.target, timer_s_name: a.timer })];
  }),
  operation('scene.change', 'action', 'switch to another scene', { scene: 'scene name' }, function(a) {
    return [invocation('BuiltinScene::global::extension::action::Scene', { name_of_the_new_scene: a.scene, stop_any_other_paused_scenes: 'yes' })];
  }),
  operation('sprite.animation.set', 'action', 'change a sprite animation by name', { target: 'entity', animation: 'animation name' }, function(a) {
    return [invocation('Sprite::object::Sprite::Sprite::action::SetAnimationName', { object: a.target, animation_name: a.animation })];
  }),

  operation('number.random', 'number-expression', 'random integer from 0 through max', { max: 'number or expression' }, function(a) {
    return [invocation('BuiltinMathematicalTools::global::extension::number-expression::Random', { maximum_value: a.max })];
  }),
  operation('number.random-range', 'number-expression', 'random integer in an inclusive range', { min: 'number or expression', max: 'number or expression' }, function(a) {
    return [invocation('BuiltinMathematicalTools::global::extension::number-expression::RandomInRange', { minimum_value: a.min, maximum_value: a.max })];
  }),
  operation('number.random-step', 'number-expression', 'random value in a range aligned to a step', { min: 'number or expression', max: 'number or expression', step: 'number or expression' }, function(a) {
    return [invocation('BuiltinMathematicalTools::global::extension::number-expression::RandomWithStep', { minimum_value: a.min, maximum_value: a.max, step: a.step })];
  }),
  operation('number.floor', 'number-expression', 'round a numeric value down', { value: 'number or expression' }, function(a) {
    return [invocation('BuiltinMathematicalTools::global::extension::number-expression::floor', { expression: a.value })];
  }),
  operation('number.to-text', 'string-expression', 'format a numeric value as text', { value: 'number or expression' }, function(a) {
    return [invocation('BuiltinCommonConversions::global::extension::string-expression::ToString', { expression_to_be_converted_to_text: a.value })];
  }),
  operation('object.x', 'number-expression', 'read entity X position', { target: 'entity' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::number-expression::X', { object: a.target })];
  }),
  operation('object.y', 'number-expression', 'read entity Y position', { target: 'entity' }, function(a) {
    return [invocation('BuiltinObject::object::BuiltinObject::__object_metadata__::number-expression::Y', { object: a.target })];
  }),
  operation('object.count', 'number-expression', 'read the number of entity instances', { target: 'entity' }, function(a) {
    return [invocation('BuiltinObject::global::extension::number-expression::SceneInstancesCount', { object: a.target })];
  }),
  operation('state.number', 'number-expression', 'read an entity numeric member', { target: 'Entity.member' }, function(a, runtime) {
    return [stateBinding(a.target, runtime,
      'BuiltinObject::object::BuiltinObject::__object_metadata__::number-expression::Variable', 'BuiltinVariables::global::extension::number-expression::Variable',
      function(target) { return { object: target.entity, variable: target.reference }; },
      function(target) { return { variable: target.reference }; })];
  }),
  operation('state.text', 'string-expression', 'read an entity text member', { target: 'Entity.member' }, function(a, runtime) {
    return [stateBinding(a.target, runtime,
      'BuiltinObject::object::BuiltinObject::__object_metadata__::string-expression::VariableString', 'BuiltinVariables::global::extension::string-expression::VariableString',
      function(target) { return { object: target.entity, variable: target.reference }; },
      function(target) { return { variable: target.reference }; })];
  }),
  operation('timer.value', 'number-expression', 'read a scene timer in seconds', { timer: 'timer name' }, function(a) {
    return [invocation('BuiltinTime::global::extension::number-expression::TimerElapsedTime', { timer_s_name: a.timer })];
  }),
  operation('text.value', 'string-expression', 'read a text entity content', { target: 'entity' }, function(a) {
    return [invocation('TextObject::object::TextObject::Text::string-expression::String', { object: a.target })];
  })
];

var BY_KEY = Object.create(null);
OPERATIONS.forEach(function(item) {
  if (BY_KEY[item.key]) fail('SEMANTIC_ALGEBRA_DUPLICATE', 'Duplicate event algebra operation: ' + item.key);
  BY_KEY[item.key] = item;
});

function requiredFields(item) { return Object.keys(item.fields || {}).filter(function(key) { return !/ optional$/.test(item.fields[key]); }); }
function validateFields(item, args) {
  Object.keys(args).forEach(function(key) { if (!Object.prototype.hasOwnProperty.call(item.fields, key)) fail('SEMANTIC_ALGEBRA_FIELD_INVALID', item.key + ' has no parameter named ' + key + '. Fill: ' + Object.keys(item.fields).join(', ')); });
  requiredFields(item).forEach(function(key) { if (!Object.prototype.hasOwnProperty.call(args, key)) fail('SEMANTIC_ALGEBRA_FIELD_MISSING', item.key + ' requires parameter ' + key + '. Fill: ' + Object.keys(item.fields).join(', ')); });
}
function resolveEntry(index, capabilityId, expectedKind) {
  var entry = index.by_capability[capabilityId];
  if (!entry || entry.binding.status !== 'executable') fail('SEMANTIC_ALGEBRA_BINDING_INVALID', 'Event algebra binding is unavailable: ' + capabilityId);
  if (expectedKind && entry.kind !== expectedKind) fail('SEMANTIC_ALGEBRA_BINDING_KIND_INVALID', capabilityId + ' is ' + entry.kind + ', expected ' + expectedKind);
  return entry;
}
function assertAdapterContract(entry, args, label) {
  var parameters = entry.parameter_contract.parameters.filter(function(parameter) { return parameter.kind !== 'code-only'; });
  var byKey = Object.create(null);
  parameters.forEach(function(parameter) { byKey[parameter.semanticKey] = parameter; });
  Object.keys(args).forEach(function(key) { if (!byKey[key]) fail('SEMANTIC_ALGEBRA_BINDING_ARGUMENT_INVALID', label + ' maps unknown dictionary argument ' + key + ' for ' + entry.capability_id); });
  parameters.forEach(function(parameter) { if (!parameter.optional && !Object.prototype.hasOwnProperty.call(args, parameter.semanticKey)) fail('SEMANTIC_ALGEBRA_BINDING_ARGUMENT_MISSING', label + ' does not map required dictionary argument ' + parameter.semanticKey + ' for ' + entry.capability_id); });
}
function compileNested(value, runtime) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return clone(value);
  if (typeof value.use !== 'string') fail('SEMANTIC_ALGEBRA_EXPRESSION_INVALID', 'Nested expression requires a use field.');
  var args = clone(value); delete args.use;
  var invocations = compile(value.use, null, args, runtime);
  if (invocations.length !== 1 || (invocations[0].kind !== 'number-expression' && invocations[0].kind !== 'string-expression')) fail('SEMANTIC_ALGEBRA_EXPRESSION_INVALID', value.use + ' does not produce one expression.');
  return { semanticRef: invocations[0].semanticRef, arguments: invocations[0].arguments };
}
function compile(use, expectedKind, args, runtime) {
  var item = BY_KEY[use];
  if (!item) {
    if (!runtime || typeof runtime.resolveExtension !== 'function') fail('SEMANTIC_ALGEBRA_OPERATION_INVALID', 'Unknown event operation: ' + use);
    var extension = runtime.resolveExtension(use, expectedKind);
    var extensionArgs = args.arguments && typeof args.arguments === 'object' ? args.arguments : args;
    var normalizedExtension = Object.create(null);
    Object.keys(extensionArgs).forEach(function(key) { normalizedExtension[key] = compileNested(extensionArgs[key], runtime); });
    return [{ kind: extension.kind, semanticRef: extension.semantic_id, arguments: runtime.normalize(extension, normalizedExtension), use: use }];
  }
  if (expectedKind && item.kind !== expectedKind) fail('SEMANTIC_ALGEBRA_KIND_INVALID', use + ' is ' + item.kind + ', expected ' + expectedKind);
  validateFields(item, args);
  return item.expand(clone(args), runtime).map(function(raw) {
    var entry = resolveEntry(runtime.index, raw.capabilityId, item.kind);
    var nested = Object.create(null);
    Object.keys(raw.arguments).forEach(function(key) { nested[key] = compileNested(raw.arguments[key], runtime); });
    return { kind: entry.kind, semanticRef: entry.semantic_id, arguments: runtime.normalize(entry, nested), use: use };
  });
}
function sampleArgs(item) { return Object.keys(item.fields).reduce(function(out, key) { out[key] = key === 'target' ? 'Entity.member' : key; return out; }, Object.create(null)); }
function sampleExpansions(item) {
  var rows = [];
  [{ memberScope: function() { return 'object'; } }, { memberScope: function() { return 'scene'; } }].forEach(function(runtime) {
    item.expand(sampleArgs(item), runtime).forEach(function(raw) {
      var key = raw.capabilityId + '|' + Object.keys(raw.arguments).sort().join(',');
      if (!rows.some(function(row) { return row.key === key; })) rows.push({ key: key, raw: raw });
    });
  });
  return rows.map(function(row) { return row.raw; });
}
function probeValue(item, key, variant, booleanValues) {
  var shape = item.fields[key] || '';
  if (/true\|false/.test(shape)) return booleanValues[key];
  if (/Entity\.member/.test(shape)) return variant === 0 ? 'ProbeA.value' : 'ProbeB.value';
  return variant === 0 ? '__probe_a_' + key + '__' : '__probe_b_' + key + '__';
}
function booleanFieldSets(item) {
  var fields = Object.keys(item.fields).filter(function(key) { return /true\|false/.test(item.fields[key]); });
  var sets = [];
  for (var mask = 0; mask < Math.pow(2, fields.length); mask++) {
    var values = Object.create(null);
    fields.forEach(function(key, position) { values[key] = Boolean(mask & (1 << position)); });
    sets.push(values);
  }
  return sets;
}
function optionalFieldSets(item) {
  var optional = Object.keys(item.fields).filter(function(key) { return / optional$/.test(item.fields[key]); });
  var sets = [];
  for (var mask = 0; mask < Math.pow(2, optional.length); mask++) {
    var present = Object.create(null);
    optional.forEach(function(key, position) { if (mask & (1 << position)) present[key] = true; });
    sets.push(present);
  }
  return sets;
}
function probeArguments(item, variant, presentOptional, booleanValues) {
  return Object.keys(item.fields).reduce(function(out, key) {
    if (/ optional$/.test(item.fields[key]) && !presentOptional[key]) return out;
    out[key] = probeValue(item, key, variant, booleanValues);
    return out;
  }, Object.create(null));
}
function probeExpansion(index, item, scope, variant, presentOptional, booleanValues) {
  return compile(item.key, item.kind, probeArguments(item, variant, presentOptional, booleanValues), {
    index: index,
    memberScope: function() { return scope; },
    normalize: function(entry, values) {
      var normalized = clone(values);
      entry.parameter_contract.parameters.filter(function(parameter) { return parameter.kind !== 'code-only'; }).forEach(function(parameter) {
        if (parameter.runtimeNormalization === 'boolean-token' && typeof normalized[parameter.semanticKey] === 'boolean') normalized[parameter.semanticKey] = parameter.runtimeValues[normalized[parameter.semanticKey] ? 0 : 1];
      });
      return normalized;
    }
  });
}
function expansionPattern(left, right) {
  if (JSON.stringify(left) === JSON.stringify(right)) return { fixed: clone(left) };
  if (Array.isArray(left) && Array.isArray(right) && left.length === right.length) return { array: left.map(function(value, index) { return expansionPattern(value, right[index]); }) };
  if (left && right && typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right)) {
    var leftKeys = Object.keys(left).sort(), rightKeys = Object.keys(right).sort();
    if (JSON.stringify(leftKeys) === JSON.stringify(rightKeys)) return { object: leftKeys.reduce(function(out, key) { out[key] = expansionPattern(left[key], right[key]); return out; }, Object.create(null)) };
  }
  return { any: true };
}
function matchesExpansionPattern(value, pattern) {
  if (pattern.any) return true;
  if (Object.prototype.hasOwnProperty.call(pattern, 'fixed')) return JSON.stringify(value) === JSON.stringify(pattern.fixed);
  if (pattern.array) return Array.isArray(value) && value.length === pattern.array.length && pattern.array.every(function(child, index) { return matchesExpansionPattern(value[index], child); });
  if (pattern.object) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var keys = Object.keys(pattern.object).sort();
    if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(keys)) return false;
    return keys.every(function(key) { return matchesExpansionPattern(value[key], pattern.object[key]); });
  }
  return false;
}
function foundationExpansionPatterns(index, use) {
  var item = BY_KEY[use];
  if (!item) return [];
  var patterns = [];
  optionalFieldSets(item).forEach(function(presentOptional) {
    booleanFieldSets(item).forEach(function(booleanValues) {
      ['object', 'scene'].forEach(function(scope) {
        var left = probeExpansion(index, item, scope, 0, presentOptional, booleanValues);
        var right = probeExpansion(index, item, scope, 1, presentOptional, booleanValues);
        var pattern = expansionPattern(left, right);
        var signature = JSON.stringify(pattern);
        if (!patterns.some(function(existing) { return JSON.stringify(existing) === signature; })) patterns.push(pattern);
      });
    });
  });
  return patterns;
}
function assertFoundationExpansion(index, use, invocations) {
  if (!BY_KEY[use]) return false;
  var actual = invocations.map(function(invocation) { return { kind: dictionary.resolve(index, invocation.semanticRef).kind, semanticRef: invocation.semanticRef, arguments: invocation.arguments, use: use }; });
  if (!foundationExpansionPatterns(index, use).some(function(pattern) { return matchesExpansionPattern(actual, pattern); })) fail('SEMANTIC_ALGEBRA_EXPANSION_INVALID', use + ' does not match its dictionary-backed event algebra expansion.');
  return true;
}
function openTokenDomain(index, item, fieldName, expansions) {
  var fieldValues = sampleArgs(item);
  var domains = [];
  (expansions || sampleExpansions(item)).forEach(function(raw) {
    var entry = resolveEntry(index, raw.capabilityId, item.kind);
    var parameters = entry.parameter_contract.parameters.filter(function(parameter) { return parameter.kind !== 'code-only'; });
    Object.keys(raw.arguments).forEach(function(argumentName) {
      if (raw.arguments[argumentName] !== fieldValues[fieldName]) return;
      var parameter = parameters.filter(function(candidate) { return candidate.semanticKey === argumentName; })[0];
      if (!parameter || parameter.runtimeNormalization !== 'dictionary-token' || !Array.isArray(parameter.runtimeValues) || !parameter.runtimeValues.length) fail('SEMANTIC_ALGEBRA_TOKEN_DOMAIN_INVALID', item.key + '.' + fieldName + ' is not backed by one dictionary token domain.');
      domains.push(parameter.runtimeValues);
    });
  });
  if (!domains.length) fail('SEMANTIC_ALGEBRA_TOKEN_DOMAIN_INVALID', item.key + '.' + fieldName + ' has no dictionary token binding.');
  var intersection = domains[0].filter(function(value) { return domains.every(function(domain) { return domain.indexOf(value) >= 0; }); });
  if (!intersection.length) fail('SEMANTIC_ALGEBRA_TOKEN_DOMAIN_INVALID', item.key + '.' + fieldName + ' has no common dictionary token domain.');
  return intersection;
}
function assertOpenTokenDomains(index, item, expansions) {
  Object.keys(item.fields).filter(function(fieldName) { return item.fields[fieldName] === 'dictionary-token'; }).forEach(function(fieldName) { openTokenDomain(index, item, fieldName, expansions); });
}
function assertBooleanProjections(index, item) {
  Object.keys(item.fields).filter(function(fieldName) { return item.fields[fieldName] === 'true|false'; }).forEach(function(fieldName) {
    var leftArgs = sampleArgs(item), rightArgs = sampleArgs(item);
    leftArgs[fieldName] = false; rightArgs[fieldName] = true;
    var changed = ['object', 'scene'].some(function(scope) {
      var runtime = { memberScope: function() { return scope; } };
      var left = item.expand(clone(leftArgs), runtime);
      var right = item.expand(clone(rightArgs), runtime);
      left.concat(right).forEach(function(raw) { var entry = resolveEntry(index, raw.capabilityId, item.kind); assertAdapterContract(entry, raw.arguments, item.key); });
      return JSON.stringify(left) !== JSON.stringify(right);
    });
    if (!changed) fail('SEMANTIC_ALGEBRA_BOOLEAN_PROJECTION_INVALID', item.key + '.' + fieldName + ' does not affect its dictionary-backed expansion.');
  });
}
function assertFixedArgumentShapes(index, item, expansions) {
  var fields = sampleArgs(item);
  var dynamicValues = Object.keys(fields).map(function(key) { return fields[key]; });
  expansions.forEach(function(raw) {
    var entry = resolveEntry(index, raw.capabilityId, item.kind);
    var parameters = entry.parameter_contract.parameters.filter(function(parameter) { return parameter.kind !== 'code-only'; });
    Object.keys(raw.arguments).forEach(function(argumentName) {
      var value = raw.arguments[argumentName];
      if (dynamicValues.indexOf(value) >= 0 || (value && typeof value === 'object')) return;
      var parameter = parameters.filter(function(candidate) { return candidate.semanticKey === argumentName; })[0];
      if (!parameter) return;
      var normalization = parameter.runtimeNormalization;
      if (normalization === 'dictionary-token' && (!Array.isArray(parameter.runtimeValues) || parameter.runtimeValues.indexOf(value) < 0)) fail('SEMANTIC_ALGEBRA_FIXED_TOKEN_INVALID', item.key + '.' + argumentName + ' is outside the dictionary token domain for ' + entry.capability_id + '.');
      if (normalization === 'boolean-token' && typeof value !== 'boolean' && (!Array.isArray(parameter.runtimeValues) || parameter.runtimeValues.indexOf(value) < 0)) fail('SEMANTIC_ALGEBRA_FIXED_TOKEN_INVALID', item.key + '.' + argumentName + ' is outside the dictionary boolean domain for ' + entry.capability_id + '.');
      if (normalization === 'number-expression' && (typeof value !== 'number' || !isFinite(value))) fail('SEMANTIC_ALGEBRA_FIXED_VALUE_INVALID', item.key + '.' + argumentName + ' is not a finite semantic number for ' + entry.capability_id + '.');
      if (normalization === 'string-expression' && typeof value !== 'string') fail('SEMANTIC_ALGEBRA_FIXED_VALUE_INVALID', item.key + '.' + argumentName + ' is not semantic text for ' + entry.capability_id + '.');
      if (normalization === 'scalar' && (value === null || (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') || (typeof value === 'number' && !isFinite(value)))) fail('SEMANTIC_ALGEBRA_FIXED_VALUE_INVALID', item.key + '.' + argumentName + ' is not a finite scalar for ' + entry.capability_id + '.');
    });
  });
}
function initialize(index) {
  index = index || dictionary.loadIndex();
  OPERATIONS.forEach(function(item) {
    var expansions = sampleExpansions(item);
    expansions.forEach(function(raw) {
      var entry = resolveEntry(index, raw.capabilityId, item.kind);
      assertAdapterContract(entry, raw.arguments, item.key);
    });
    assertOpenTokenDomains(index, item, expansions);
    assertBooleanProjections(index, item);
    assertFixedArgumentShapes(index, item, expansions);
    optionalFieldSets(item).forEach(function(presentOptional) {
      booleanFieldSets(item).forEach(function(booleanValues) {
        ['object', 'scene'].forEach(function(scope) { probeExpansion(index, item, scope, 0, presentOptional, booleanValues); });
      });
    });
  });
  Object.keys(ENTITY_KINDS).forEach(function(key) { var ref = ENTITY_KINDS[key]; if (ref) dictionary.resolveObjectType(index, ref); });
  Object.keys(BEHAVIOR_KINDS).forEach(function(key) { dictionary.resolveBehaviorType(index, BEHAVIOR_KINDS[key]); });
  Object.keys(EVENT_KINDS).forEach(function(key) { dictionary.resolveEventType(index, EVENT_KINDS[key]); });
  return index;
}
function promptToken(value) { return JSON.stringify(value).replace(/\|/g, '\\u007c'); }
function tokenDomain(values) { return 'oneOf(' + values.map(promptToken).join(',') + ')'; }
function fieldText(index, item) { return Object.keys(item.fields).map(function(key) { var raw = item.fields[key]; var shape = raw === 'dictionary-token' ? tokenDomain(openTokenDomain(index, item, key)) : raw === 'true|false' ? 'oneOf(true,false)' : clean(raw); return key + '=' + shape; }).join(','); }
function promptLines(index) {
  index = initialize(index || dictionary.loadIndex());
  return OPERATIONS.map(function(item) { return [item.kind, item.key, fieldText(index, item), item.summary].join('|'); });
}
function eventParameterText(parameter) {
  var type = parameter.runtimeNormalization === 'dictionary-token' ? tokenDomain(parameter.runtimeValues) : parameter.promptType;
  return parameter.semanticKey + '=' + type + (parameter.optional ? ' optional' : '');
}
function eventKindLines(index) {
  return Object.keys(EVENT_KINDS).map(function(kind) {
    var entry = dictionary.resolveEventType(index, EVENT_KINDS[kind]);
    var grammar = entry.grammar || {};
    var channels = [
      grammar.hasConditions ? 'when' : null,
      grammar.hasActions ? 'then' : null,
      grammar.canHaveSubEvents ? 'child-event' : null
    ].filter(Boolean).join('+') || 'structure-only';
    return kind + '|commands:' + channels + '|parameters:' + (entry.serialization.parameters || []).map(eventParameterText).join(',');
  });
}
function normalizeEventValue(parameter, value, runtime) {
  if (parameter.runtimeNormalization === 'number-expression') {
    if (typeof value === 'number' && isFinite(value)) return value;
    if (value && typeof value === 'object' && !Array.isArray(value)) return compileNested(value, runtime);
    fail('SEMANTIC_EVENT_ARGUMENT_INVALID', parameter.semanticKey + ' takes a number or foundation number expression.');
  }
  if (parameter.runtimeNormalization === 'entity-object-name') return runtime.objectName(value);
  if (parameter.runtimeNormalization === 'scene-member-name') return runtime.sceneVariableName(value);
  if (parameter.runtimeNormalization === 'local-name') return runtime.localName(value);
  if (parameter.runtimeNormalization === 'dictionary-token') {
    if ((parameter.runtimeValues || []).indexOf(value) < 0) fail('SEMANTIC_EVENT_ARGUMENT_INVALID', parameter.semanticKey + ' takes one value: ' + (parameter.runtimeValues || []).join(', '));
    return value;
  }
  if (parameter.runtimeNormalization === 'text') { if (typeof value !== 'string') fail('SEMANTIC_EVENT_ARGUMENT_INVALID', parameter.semanticKey + ' takes text.'); return value; }
  fail('SEMANTIC_EVENT_ARGUMENT_INVALID', 'Event parameter has no dictionary normalization: ' + parameter.semanticKey);
}
function compileEventEntry(entry, args, runtime) {
  var parameters = entry.serialization.parameters || [];
  var byKey = Object.create(null); parameters.forEach(function(parameter) { byKey[parameter.semanticKey] = parameter; });
  Object.keys(args).forEach(function(key) { if (!byKey[key]) fail('SEMANTIC_EVENT_FIELD_INVALID', entry.explanation.title + ' has no parameter named ' + key + '. Fill: ' + parameters.map(function(parameter) { return parameter.semanticKey; }).join(', ')); });
  parameters.filter(function(parameter) { return !parameter.optional; }).forEach(function(parameter) { if (!Object.prototype.hasOwnProperty.call(args, parameter.semanticKey)) fail('SEMANTIC_EVENT_FIELD_MISSING', entry.explanation.title + ' requires parameter ' + parameter.semanticKey + '.'); });
  var normalized = Object.create(null);
  parameters.forEach(function(parameter) {
    var present = Object.prototype.hasOwnProperty.call(args, parameter.semanticKey);
    if (!present && parameter.emission === 'always' && Object.prototype.hasOwnProperty.call(parameter, 'defaultValue')) { normalized[parameter.semanticKey] = parameter.defaultValue; return; }
    if (!present && /^with:/.test(parameter.emission || '') && Object.prototype.hasOwnProperty.call(args, parameter.emission.slice(5)) && Object.prototype.hasOwnProperty.call(parameter, 'defaultValue')) { normalized[parameter.semanticKey] = parameter.defaultValue; return; }
    if (!present) return;
    if (/^with:/.test(parameter.emission || '') && !Object.prototype.hasOwnProperty.call(args, parameter.emission.slice(5))) fail('SEMANTIC_EVENT_FIELD_INVALID', parameter.semanticKey + ' requires ' + parameter.emission.slice(5) + '.');
    normalized[parameter.semanticKey] = normalizeEventValue(parameter, args[parameter.semanticKey], runtime);
  });
  return { eventTypeRef: entry.semantic_id, arguments: normalized };
}
function compileEventKind(index, kind, args, runtime) {
  if (!EVENT_KINDS[kind]) fail('SEMANTIC_EVENT_KIND_INVALID', 'Unknown event kind: ' + kind);
  return compileEventEntry(dictionary.resolveEventType(index, EVENT_KINDS[kind]), args, runtime);
}
function eventKindRef(index, kind) { if (!EVENT_KINDS[kind]) fail('SEMANTIC_EVENT_KIND_INVALID', 'Unknown event kind: ' + kind); return dictionary.resolveEventType(index, EVENT_KINDS[kind]).semantic_id; }
function eventKindForRef(index, reference) { var entry = dictionary.resolveEventType(index, reference); var found = Object.keys(EVENT_KINDS).find(function(key) { return EVENT_KINDS[key] === entry.eventType; }); return found || null; }
function entityKindRef(index, kind) { if (!Object.prototype.hasOwnProperty.call(ENTITY_KINDS, kind)) fail('SEMANTIC_ENTITY_KIND_INVALID', 'Unknown entity kind: ' + kind); return ENTITY_KINDS[kind] === null ? null : dictionary.resolveObjectType(index, ENTITY_KINDS[kind]).semantic_id; }
function entityKindForRef(index, reference) { if (reference === null || reference === undefined) return 'state'; var entry = dictionary.resolveObjectType(index, reference); return Object.keys(ENTITY_KINDS).find(function(key) { return ENTITY_KINDS[key] === entry.semantic_id; }) || null; }
function behaviorRefs(index, kinds) { return (kinds || []).map(function(kind) { if (!BEHAVIOR_KINDS[kind]) fail('SEMANTIC_BEHAVIOR_KIND_INVALID', 'Unknown behavior kind: ' + kind); return dictionary.resolveBehaviorType(index, BEHAVIOR_KINDS[kind]).semantic_id; }); }
function behaviorKindsForRefs(index, refs) { return (refs || []).map(function(reference) { var entry = dictionary.resolveBehaviorType(index, reference); var kind = Object.keys(BEHAVIOR_KINDS).find(function(key) { return BEHAVIOR_KINDS[key] === entry.semantic_id; }); if (!kind) fail('SEMANTIC_BEHAVIOR_KIND_INVALID', 'Behavior is outside the foundation algebra: ' + reference); return kind; }); }
function operationForUse(use) { return BY_KEY[use] || null; }
function foundationCapabilityIds(index) {
  initialize(index);
  var ids = Object.create(null);
  OPERATIONS.forEach(function(item) { sampleExpansions(item).forEach(function(raw) { ids[raw.capabilityId] = true; }); });
  return Object.keys(ids);
}
function bindingRefs(index, use) {
  initialize(index);
  var item = BY_KEY[use];
  if (!item) return null;
  var refs = [];
  sampleExpansions(item).forEach(function(raw) { var reference = resolveEntry(index, raw.capabilityId, item.kind).semantic_id; if (refs.indexOf(reference) < 0) refs.push(reference); });
  return refs;
}

module.exports = {
  ENTITY_KINDS: ENTITY_KINDS,
  BEHAVIOR_KINDS: BEHAVIOR_KINDS,
  EVENT_KINDS: EVENT_KINDS,
  OPERATIONS: OPERATIONS,
  initialize: initialize,
  promptLines: promptLines,
  eventKindLines: eventKindLines,
  compile: compile,
  compileEventEntry: compileEventEntry,
  compileEventKind: compileEventKind,
  eventKindRef: eventKindRef,
  eventKindForRef: eventKindForRef,
  entityKindRef: entityKindRef,
  entityKindForRef: entityKindForRef,
  behaviorRefs: behaviorRefs,
  behaviorKindsForRefs: behaviorKindsForRefs,
  operationForUse: operationForUse,
  assertFoundationExpansion: assertFoundationExpansion,
  foundationCapabilityIds: foundationCapabilityIds,
  bindingRefs: bindingRefs
};
