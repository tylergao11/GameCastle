var assert = require('assert');
var capabilityIr = require('./gdjs-capability-ir');

var registry = capabilityIr.loadRegistry();
var closure = capabilityIr.auditClosure(registry);
assert.strictEqual(closure.capabilityCount, registry.officialBindings && Object.keys(registry.officialBindings).length, 'official GDJS capability closure count drifted');
assert.deepStrictEqual(closure.uncovered, [], 'GDJS capability IR has uncovered declarations');

var cursor = capabilityIr.renderExpression(registry, {
  semantic: 'gdjs.builtinmouse.global.extension.number_expression.cursorx',
  arguments: ['']
});
assert.strictEqual(cursor, 'CursorX()', 'global expression must lower through semantic lookup');

var event = capabilityIr.compileEventConnection(registry, {
  conditions: [{ capability: 'BuiltinMouse::global::extension::condition::MouseButtonPressed', parameters: ['', 'Left'] }],
  actions: [{
    capability: 'BuiltinObject::object::BuiltinObject::__object_metadata__::action::SetX',
    parameters: ['AimReticle', '=', { capability: 'BuiltinMouse::global::extension::number-expression::CursorX', arguments: [''] }]
  }]
});
assert.strictEqual(event.conditions[0].type.value, 'MouseButtonPressed');
assert.strictEqual(event.actions[0].type.value, 'SetX');
assert.strictEqual(event.actions[0].parameters[2], 'CursorX()');
assert.throws(function() {
  capabilityIr.compileEventConnection(registry, { conditions: [], actions: [{ capability: 'BuiltinMouse::global::extension::condition::MouseButtonPressed', parameters: [] }] });
}, /kind mismatch/);

console.log('[GDJSCapabilityIR] ' + closure.capabilityCount + '/' + closure.capabilityCount + ' official GDJS capabilities lower through typed semantic IR');
