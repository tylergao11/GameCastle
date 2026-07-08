/*
 * GameCastle runtime code generator.
 *
 * It emits the same scene entry shape the GDJS runtime expects:
 * gdjs.<SceneMangledName>Code.func(runtimeScene).
 */

function quote(value) {
  return JSON.stringify(String(value === undefined ? '' : value));
}

function asNumber(value, fallback) {
  var parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
}

function keyCode(key) {
  var map = {
    Up: 38,
    Down: 40,
    Left: 37,
    Right: 39,
    ArrowUp: 38,
    ArrowDown: 40,
    ArrowLeft: 37,
    ArrowRight: 39,
    Space: 32,
    Return: 13,
    Enter: 13,
    Escape: 27,
    Esc: 27,
  };
  return map[key] || map[String(key || '').toLowerCase()] || 0;
}

function compileCondition(condition) {
  var type = condition && condition.type && condition.type.value;
  var parameters = (condition && condition.parameters) || [];

  if (type === 'DepartScene') return 'runtimeScene.getTimeManager().isFirstFrame()';
  if (type === 'KeyPressed') return 'input.isKeyPressed(' + keyCode(parameters[1]) + ')';
  if (type === 'SourisSurObjet') return 'isMouseOverObject(' + quote(parameters[2]) + ') && primaryPointerAction()';
  if (type === 'CollisionNP') return 'objectsCollide(' + quote(parameters[0]) + ', ' + quote(parameters[1]) + ')';
  if (type === 'Variable') {
    return 'compareVariable(gameVar(' + quote(parameters[0]) + '), ' + quote(parameters[1]) + ', ' + quote(parameters[2]) + ')';
  }

  return 'false';
}

function compileAction(action) {
  var type = action && action.type && action.type.value;
  var parameters = (action && action.parameters) || [];

  if (type === 'Delete') {
    return 'deleteObjects(' + quote(parameters[0]) + ');';
  }
  if (type === 'SetVariable') {
    return 'setVariable(gameVar(' + quote(parameters[0]) + '), ' + quote(parameters[1]) + ', ' + quote(parameters[2]) + ');';
  }
  if (type === 'TextObject::String') {
    return 'setObjectText(' + quote(parameters[0]) + ', ' + quote(parameters[2]) + ');';
  }
  if (type === 'ChangeScene') {
    return 'runtimeScene.requestChange(gdjs.SceneChangeRequest.CLEAR_SCENES, ' + quote(parameters[0]) + ');';
  }
  if (type === 'ResetGame') {
    return 'runtimeScene.requestChange(gdjs.SceneChangeRequest.CLEAR_SCENES, runtimeScene.getGame().getGameData().firstLayout);';
  }
  if (type === 'PrimitiveDrawing::Drawer::ClearShapes') {
    return 'clearDrawer(' + quote(parameters[0]) + ');';
  }
  if (type === 'PrimitiveDrawing::Rectangle') {
    return 'drawRectangle(' + quote(parameters[0]) + ', ' + asNumber(parameters[1], 0) + ', ' + asNumber(parameters[2], 0) + ', ' + asNumber(parameters[3], 0) + ', ' + asNumber(parameters[4], 0) + ');';
  }
  if (type === 'PrimitiveDrawing::Circle') {
    return 'drawCircle(' + quote(parameters[0]) + ', ' + asNumber(parameters[1], 0) + ', ' + asNumber(parameters[2], 0) + ', ' + asNumber(parameters[3], 0) + ');';
  }
  if (type === 'PrimitiveDrawing::SetRectangularCollisionMask') {
    return 'setRectangularCollisionMask(' + quote(parameters[0]) + ', ' + asNumber(parameters[1], 0) + ', ' + asNumber(parameters[2], 0) + ', ' + asNumber(parameters[3], 0) + ', ' + asNumber(parameters[4], 0) + ');';
  }
  if (type === 'CreateObject') {
    return [
      'createObject(' + quote(parameters[0]) + ', ' + asNumber(parameters[1], 0) + ', ' + asNumber(parameters[2], 0) + ');',
    ].join('\n');
  }
  if (type === 'MettreXY') {
    return 'setObjectPosition(' + quote(parameters[0]) + ', ' + asNumber(parameters[2], 0) + ', ' + asNumber(parameters[4], 0) + ');';
  }
  if (type === 'AddForce') {
    var direction = String(parameters[1] || '');
    var strength = asNumber(parameters[2], 0);
    var x = direction === 'Left' ? -strength : direction === 'Right' ? strength : 0;
    var y = direction === 'Up' ? -strength : direction === 'Down' ? strength : 0;
    return 'applyForceOrPlatformJump(' + quote(parameters[0]) + ', ' + x + ', ' + y + ');';
  }
  if (type === 'PlatformBehavior::SimulateLeftKey') {
    return 'simulatePlatformControl(' + quote(parameters[0]) + ', ' + quote(parameters[1]) + ', "Left");';
  }
  if (type === 'PlatformBehavior::SimulateRightKey') {
    return 'simulatePlatformControl(' + quote(parameters[0]) + ', ' + quote(parameters[1]) + ', "Right");';
  }
  if (type === 'PlatformBehavior::SimulateJumpKey') {
    return 'simulatePlatformControl(' + quote(parameters[0]) + ', ' + quote(parameters[1]) + ', "Jump");';
  }

  return 'console.warn("[GameCastle runtime] Unsupported action: ' + String(type || 'unknown').replace(/"/g, '\\"') + '");';
}

function compileEvent(event, eventIndex) {
  var conditions = event.conditions || [];
  var actions = event.actions || [];
  var conditionCode = conditions.length
    ? conditions.map(compileCondition).join(' && ')
    : 'true';
  var actionCode = actions.map(compileAction).join('\n');

  if (!actionCode.trim()) return '';
  return [
    '  // event ' + eventIndex,
    '  if (' + conditionCode + ') {',
    indent(actionCode, 4),
    '  }',
  ].join('\n');
}

function indent(text, spaces) {
  var pad = new Array(spaces + 1).join(' ');
  return String(text).split('\n').map(function(line) {
    return line ? pad + line : line;
  }).join('\n');
}

function runtimeHelpers() {
  return [
    '  var input = runtimeScene.getGame().getInputManager();',
    '  if (typeof document !== "undefined" && document.body) document.body.dataset.gamecastleScene = runtimeScene.getName();',
    '  function objects(name) { return runtimeScene.getObjects(name).slice(); }',
    '  function gameVar(name) { return runtimeScene.getGame().getVariables().get(name); }',
    '  function numeric(value) { var n = parseFloat(value); return isNaN(n) ? 0 : n; }',
    '  function compareVariable(variable, op, value) {',
    '    var left = variable.getAsNumber();',
    '    var right = numeric(value);',
    '    if (op === "=" || op === "==") return left === right;',
    '    if (op === "!=") return left !== right;',
    '    if (op === ">") return left > right;',
    '    if (op === "<") return left < right;',
    '    if (op === ">=") return left >= right;',
    '    if (op === "<=") return left <= right;',
    '    return false;',
    '  }',
    '  function setVariable(variable, op, value) {',
    '    var n = numeric(value);',
    '    if (op === "+" || op === "+=") variable.add(n);',
    '    else if (op === "-" || op === "-=") variable.sub(n);',
    '    else if (/^-?\\d+(\\.\\d+)?$/.test(String(value))) variable.setNumber(n);',
    '    else variable.setString(String(value));',
    '  }',
    '  function setObjectText(name, text) {',
    '    objects(name).forEach(function(object) {',
    '      if (typeof object.setString === "function") object.setString(String(text));',
    '      else if (typeof object.setText === "function") object.setText(String(text));',
    '      else if (object.getRendererObject && object.getRendererObject()) object.getRendererObject().text = String(text);',
    '    });',
    '  }',
    '  function deleteObjects(name) {',
    '    objects(name).forEach(function(object) { object.deleteFromScene(); });',
    '  }',
    '  function createObject(name, x, y) {',
    '    var object = runtimeScene.createObject(name);',
    '    if (object) object.setPosition(x, y);',
    '    return object;',
    '  }',
    '  function setObjectPosition(name, x, y) {',
    '    objects(name).forEach(function(object) { object.setPosition(x, y); });',
    '  }',
    '  function clearDrawer(name) {',
    '    objects(name).forEach(function(object) {',
    '      if (typeof object.clear === "function") object.clear();',
    '    });',
    '  }',
    '  function drawRectangle(name, x1, y1, x2, y2) {',
    '    objects(name).forEach(function(object) {',
    '      if (typeof object.drawRectangle === "function") object.drawRectangle(x1, y1, x2, y2);',
    '    });',
    '  }',
    '  function drawCircle(name, x, y, radius) {',
    '    objects(name).forEach(function(object) {',
    '      if (typeof object.drawCircle === "function") object.drawCircle(x, y, radius);',
    '    });',
    '  }',
    '  function setRectangularCollisionMask(name, x1, y1, x2, y2) {',
    '    objects(name).forEach(function(object) {',
    '      if (typeof object.setRectangularCollisionMask === "function") object.setRectangularCollisionMask(x1, y1, x2, y2);',
    '    });',
    '  }',
    '  function objectsCollide(leftName, rightName) {',
    '    var left = objects(leftName);',
    '    var right = objects(rightName);',
    '    for (var i = 0; i < left.length; i++) {',
    '      for (var j = 0; j < right.length; j++) {',
    '        if (left[i] !== right[j] && gdjs.RuntimeObject.collisionTest(left[i], right[j], false)) return true;',
    '      }',
    '    }',
    '    return false;',
    '  }',
    '  function isMouseOverObject(name) {',
    '    return objects(name).some(function(object) {',
    '      return typeof object.cursorOnObject === "function" && object.cursorOnObject();',
    '    });',
    '  }',
    '  function primaryPointerAction() {',
    '    var left = gdjs.InputManager && gdjs.InputManager.MOUSE_LEFT_BUTTON !== undefined',
    '      ? gdjs.InputManager.MOUSE_LEFT_BUTTON',
    '      : 0;',
    '    return input.isMouseButtonPressed(left) || input.isMouseButtonReleased(left);',
    '  }',
    '  function simulatePlatformControl(name, behaviorName, control) {',
    '    objects(name).forEach(function(object) {',
    '      var behavior = object.getBehavior && object.getBehavior(behaviorName);',
    '      if (behavior && typeof behavior.simulateControl === "function") behavior.simulateControl(control);',
    '    });',
    '  }',
    '  function applyForceOrPlatformJump(name, x, y) {',
    '    objects(name).forEach(function(object) {',
    '      var behavior = object.getBehavior && object.getBehavior("PlatformerObject");',
    '      if (behavior && y < 0 && typeof behavior.simulateJumpKey === "function") behavior.simulateJumpKey();',
    '      else object.addForce(x, y, 0);',
    '    });',
    '  }',
  ].join('\n');
}

function generateSceneCode(layout) {
  var mangledName = layout.mangledName || layout.name.replace(/[^A-Za-z0-9_]/g, '_');
  var moduleName = mangledName + 'Code';
  var eventCode = (layout.events || []).map(compileEvent).filter(Boolean).join('\n');

  return [
    'var gdjs;',
    '(function(gdjs) {',
    'gdjs.' + moduleName + ' = gdjs.' + moduleName + ' || {};',
    'gdjs.' + moduleName + '.idToCallbackMap = {};',
    'gdjs.' + moduleName + '.func = function(runtimeScene) {',
    runtimeHelpers(),
    eventCode,
    '};',
    "gdjs['" + moduleName + "'] = gdjs." + moduleName + ';',
    '})(gdjs || (gdjs = {}));',
    '',
  ].join('\n');
}

function generateProjectCodeFiles(project) {
  return (project.layouts || []).map(function(layout, index) {
    return {
      fileName: 'code' + index + '.js',
      sceneName: layout.name,
      code: generateSceneCode(layout),
    };
  });
}

module.exports = {
  generateProjectCodeFiles: generateProjectCodeFiles,
  generateSceneCode: generateSceneCode,
};
