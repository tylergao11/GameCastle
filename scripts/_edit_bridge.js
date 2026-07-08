var fs = require('fs');
var p = 'C:/Ai/GameCastle/ai/network-runtime/game-bridge.js';
var s = fs.readFileSync(p, 'utf8');

// 1. Add RuntimeAdapter require
s = s.replace(
  'function GameCastleNetworkBridge(config) {',
  "var GameCastleRuntimeAdapter = require('./runtime-adapter.js').GameCastleRuntimeAdapter;\n\nfunction GameCastleNetworkBridge(config) {"
);

// 2. Fix attach to init adapter
s = s.replace(
  "this._inputManager = game.getInputManager();",
  "this._adapter = new GameCastleRuntimeAdapter(game);\n  this._inputManager = game.getInputManager();"
);

// 3. Fix local mode in attach
s = s.replace(
  'return false; // false = caller should call startGameLoop()',
  'this._startLocalLoop();\n    return true;'
);

// 4. Replace _onJoined (setInterval -> adapter)
s = s.replace(
  "var intervalMs = Math.round(1000 / this._tickRate);\n\n  this._tickInterval = setInterval(function () {\n    self._tickFrame();\n  }, intervalMs);\n\n  console.log(\"[GC:Bridge] Network loop started at \" + this._tickRate + \"hz\");",
  "this._adapter.startLoop(function (dtMs, tickNum) {\n    return self._onNetworkTick(dtMs, tickNum);\n  });\n\n  console.log(\"[GC:Bridge] Network loop started at \" + this._tickRate + \"hz via adapter\");"
);

// 5. Remove monkey-patch _flushRemoteInputs (set _keys/_pressedKeys)
var flushStart = s.indexOf('GameCastleNetworkBridge.prototype._flushRemoteInputs');
var flushEnd = s.indexOf('// ── Sending', flushStart);
if (flushStart >= 0 && flushEnd >= 0) {
  s = s.slice(0, flushStart) + s.slice(flushEnd);
}

// 6. Replace _readInputs (use adapter)
var riStart = s.indexOf('GameCastleNetworkBridge.prototype._readInputs');
var riEnd = s.indexOf('// ── Sending', riStart);
if (riStart >= 0 && riEnd >= 0) {
  var newRI = 'GameCastleNetworkBridge.prototype._readInputs = function () {\n  return this._adapter ? this._adapter.captureInputs() : {};\n};\n\n';
  s = s.slice(0, riStart) + newRI + s.slice(riEnd);
}

// 7. Replace _tickFrame with _onNetworkTick + lockstep/authority
var tfStart = s.indexOf('GameCastleNetworkBridge.prototype._tickFrame');
var tfEnd = s.indexOf('// ── Input reading', tfStart);
if (tfStart >= 0 && tfEnd >= 0) {
  s = s.slice(0, tfStart) + s.slice(tfEnd);
}
// Remove old "Input reading" comment section header too
s = s.replace("// ── Input reading (from GDevelop's public InputManager API) ─────────────\n\n", '');
s = s.replace("// ── Remote input injection ──────────────────────────────────────────────\n\n", '');

// Now add new methods after _onJoined
var insertAfter = '// ── Network tick ────────────────────────────────────────';
var newMethods = [
  '',
  'GameCastleNetworkBridge.prototype._onNetworkTick = function (dtMs, tickNum) {',
  '  var tick = tickNum;',
  '  switch (this._sync) {',
  '    case "lockstep":',
  '    case "lockstep-input":',
  '      return this._tickLockstep(dtMs, tick);',
  '    case "server-authoritative":',
  '      return this._tickAuthority(dtMs, tick);',
  '    default:',
  '      this._adapter.stepSimulation(dtMs);',
  '      this._adapter.endFrame();',
  '      return true;',
  '  }',
  '};',
  '',
  'GameCastleNetworkBridge.prototype._tickLockstep = function (dtMs, tick) {',
  '  var localInputs = this._adapter.captureInputs();',
  '  this._localInputs[tick] = localInputs;',
  '  this._sendInputs(tick, localInputs);',
  '  this._tick = tick;',
  '  this._tryAdvanceLockstep();',
  '  return true;',
  '};',
  '',
  'GameCastleNetworkBridge.prototype._tryAdvanceLockstep = function () {',
  '  var self = this;',
  '  while (this._running) {',
  '    var tick = this._readyTick;',
  '    if (tick + this._inputDelay >= this._tick) break;',
  '    if (this._localInputs[tick] === undefined) break;',
  '    if (this._remoteInputs[tick] === undefined) break;',
  '    this._adapter.injectInputs(this._remoteInputs[tick], false);',
  '    this._adapter.stepSimulation(this._adapter.getTickIntervalMs());',
  '    this._adapter.endFrame();',
  '    this._emit("advance", tick, this._localInputs[tick], this._remoteInputs[tick]);',
  '    delete this._localInputs[tick - 60];',
  '    delete this._remoteInputs[tick - 60];',
  '    this._readyTick++;',
  '  }',
  '};',
  '',
  'GameCastleNetworkBridge.prototype._tickAuthority = function (dtMs, tick) {',
  '  var localInputs = this._adapter.captureInputs();',
  '  if (this._transport && this._transport.sendGameInput) {',
  '    this._transport.sendGameInput(tick, localInputs);',
  '  }',
  '  this._tick = tick;',
  '  this._tryAdvanceAuthority();',
  '  return true;',
  '};',
  '',
  'GameCastleNetworkBridge.prototype._tryAdvanceAuthority = function () {',
  '  while (this._running) {',
  '    var tick = this._readyTick;',
  '    if (tick + this._inputDelay >= this._tick) break;',
  '    var ordered = this._orderedInputs[tick];',
  '    if (!ordered) break;',
  '    var self = this;',
  '    var myId = this._transport ? this._transport.getPlayerId() : null;',
  '    Object.keys(ordered).forEach(function (pid) {',
  '      if (pid !== myId) self._adapter.injectInputs(ordered[pid], false);',
  '    });',
  '    this._adapter.stepSimulation(this._adapter.getTickIntervalMs());',
  '    this._adapter.endFrame();',
  '    this._emit("advance", tick, ordered);',
  '    delete this._orderedInputs[tick - 60];',
  '    this._readyTick++;',
  '  }',
  '};',
  '',
].join('\n');

s = s.replace(insertAfter, newMethods + '\n' + insertAfter);

// 8. Add event system + _startLocalLoop + new fields
var ctorEnd = 'this._remoteInputBuffer = {};\n  this._lastRemoteTick = -1;\n}';
var ctorNew = 'this._remoteInputs = {};\n  this._orderedInputs = {};\n  this._localInputs = {};\n  this._peerId = null;\n  this._inputDelay = config.inputDelay || 2;\n  this._listeners = {};\n  this._remoteInputBuffer = {};\n  this._lastRemoteTick = -1;\n}';
s = s.replace(ctorEnd, ctorNew);

// Add event system after constructor
s = s.replace(
  '\n// ── Public API',
  '\nGameCastleNetworkBridge.prototype.on = function (event, handler) {\n  if (!this._listeners[event]) this._listeners[event] = [];\n  this._listeners[event].push(handler);\n};\n\nGameCastleNetworkBridge.prototype._emit = function (event) {\n  var args = Array.prototype.slice.call(arguments, 1);\n  var handlers = this._listeners[event];\n  if (handlers) for (var i = 0; i < handlers.length; i++) handlers[i].apply(null, args);\n};\n\n// ── Public API'
);

// Add _startLocalLoop before _autoConnect
s = s.replace(
  'GameCastleNetworkBridge.prototype._autoConnect = function () {',
  'GameCastleNetworkBridge.prototype._startLocalLoop = function () {\n  if (this._running) return;\n  this._running = true;\n  var self = this;\n  this._adapter.startLoop(function (dtMs, tickNum) {\n    self._adapter.stepSimulation(dtMs);\n    self._adapter.endFrame();\n    self._emit("tick", tickNum, self._adapter.captureInputs());\n    self._tick = tickNum;\n  });\n};\n\nGameCastleNetworkBridge.prototype._autoConnect = function () {'
);

// 9. Add getTickIntervalMs to adapter-dependent calls
s = s.replace(
  "this._adapter.stepSimulation(this._adapter.getTickIntervalMs());",
  "this._adapter.stepSimulation(1000 / this._tickRate);"
);

// 10. Wire remote input from transport events into bridge
s = s.replace(
  "transport.on('game_input', function (from, tick, inputs) {\n      bridge.receiveRemoteInputs(tick, inputs);\n    });",
  "transport.on('game_input', function (from, tick, inputs) {\n      bridge._onRemoteInput(from, tick, inputs);\n    });"
);

// Write
fs.writeFileSync(p, s, 'utf8');
console.log('OK: game-bridge.js edited (' + s.split('\n').length + ' lines)');

// Verify
var bad = s.includes('_keys') || s.includes('_pressedKeys');
console.log('Has _keys/_pressedKeys: ' + bad);
