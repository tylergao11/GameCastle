// GameCastle Runtime Adapter
// Isolates GDevelop game loop behind a clean public-API-only interface.
// Uses ONLY public GDevelop APIs: onKeyPressed, onKeyReleased, isKeyPressed,
// onFrameEnded, sceneStack.step, sceneStack.renderWithoutStep, loadAllAssets.
// Does NOT touch _keys, _pressedKeys, or any GDevelop private fields.

var GC_ADAPTER_KEY_MAP = {
  move_up:    "ArrowUp",
  move_down:  "ArrowDown",
  move_left:  "ArrowLeft",
  move_right: "ArrowRight",
  shoot:      "Space",
  p1_move_up:    "ArrowUp",
  p1_move_down:  "ArrowDown",
  p1_move_left:  "ArrowLeft",
  p1_move_right: "ArrowRight",
  p1_shoot:      "Space",
  p1_jump:       "Space",
  p2_move_up:    "KeyW",
  p2_move_down:  "KeyS",
  p2_move_left:  "KeyA",
  p2_move_right: "KeyD",
  p2_shoot:      "KeyF",
  p2_jump:       "Space",
  jump:       "Space",
  start:      "Enter",
  restart:    "KeyR",
  action1:    "KeyZ",
  action2:    "KeyX",
  action3:    "KeyC",
};

var _KEY_NAME_TO_CODE = {
  "ArrowUp":38, "ArrowDown":40, "ArrowLeft":37, "ArrowRight":39,
  "Space":32, "Enter":13, "KeyR":82,
  "KeyZ":90, "KeyX":88, "KeyC":67,
  "KeyA":65, "KeyS":83, "KeyD":68, "KeyF":70, "KeyW":87,
  "ShiftLeft":16, "ShiftRight":16,
  "Escape":27, "Tab":9,
};

function _keyNameToCode(name) {
  return _KEY_NAME_TO_CODE[name] !== undefined ? _KEY_NAME_TO_CODE[name] : null;
}

function GameCastleRuntimeAdapter(game) {
  this._game = game;
  this._sceneStack = null;
  this._inputManager = null;
  this._renderer = null;
  this._declaredInputs = [];
  this._captureInputs = [];
  this._inputMap = {};
  this._rAFId = null;
  this._tickFn = null;
  this._running = false;
  this._tickRate = 60;
  this._tickIntervalMs = 1000 / 60;
  this._accumulator = 0;
  this._lastFrameTime = 0;
  this._totalTicks = 0;
  this._performance = { frameCount: 0, simulatedTicks: 0, elapsedMs: 0, catchUpCount: 0, missedTickCount: 0, maxConsecutiveMissedTicks: 0, consecutiveMissedTicks: 0, stepDurationsMs: [], inputToStateTickLatency: 0, debt: null };
  this._rawPressedCodes = {};
  this._rawInputBound = false;
  this._virtualInputs = {};
  this._injectedCodes = {};
}

GameCastleRuntimeAdapter.prototype.init = function (config) {
  config = config || {};
  this._sceneStack = this._game.getSceneStack();
  this._inputManager = this._game.getInputManager();
  this._renderer = this._game.getRenderer();
  this._declaredInputs = config.inputs || [];
  this._captureInputs = config.captureInputs || this._declaredInputs;
  var policy = config.tickPolicy || null;
  this._tickRate = policy ? policy.simulationHz : (config.tickRate || 60);
  if (this._tickRate < 30) throw new Error('GameCastleRuntimeAdapter rejects cadence below 30 Hz');
  this._tickIntervalMs = 1000 / this._tickRate;
  this._maxCatchUpTicks = policy ? policy.maxCatchUpTicks : 5;

  this._inputMap = {};
  var map = config.keyMap || GC_ADAPTER_KEY_MAP;
  var mappedInputs = this._declaredInputs.concat(this._captureInputs);
  for (var i = 0; i < mappedInputs.length; i++) {
    var inputName = mappedInputs[i];
    var keyName = map[inputName];
    if (keyName) this._inputMap[inputName] = keyName;
  }
  this._bindRawInputListeners();
};

GameCastleRuntimeAdapter.prototype._bindRawInputListeners = function () {
  if (this._rawInputBound || typeof window === "undefined") return;
  this._rawInputBound = true;
  var self = this;
  window.addEventListener("keydown", function (event) {
    var code = event && event.keyCode;
    if (code != null) self._rawPressedCodes[code] = true;
  }, true);
  window.addEventListener("keyup", function (event) {
    var code = event && event.keyCode;
    if (code != null) self._rawPressedCodes[code] = false;
  }, true);
  window.addEventListener("blur", function () {
    self._rawPressedCodes = {};
  }, true);
};

GameCastleRuntimeAdapter.prototype.startLoop = function (tickFn) {
  if (this._running) return;
  this._running = true;
  this._tickFn = tickFn;
  this._lastFrameTime = performance.now();
  this._accumulator = 0;
  this._totalTicks = 0;
  this._performance = { frameCount: 0, simulatedTicks: 0, elapsedMs: 0, catchUpCount: 0, missedTickCount: 0, maxConsecutiveMissedTicks: 0, consecutiveMissedTicks: 0, stepDurationsMs: [], inputToStateTickLatency: 0, debt: null };
  var self = this;
  var maxCatchupMs = self._tickIntervalMs * self._maxCatchUpTicks;

  function frame(now) {
    if (!self._running) return;
    self._rAFId = requestAnimationFrame(frame);
    var rawDelta = Math.max(0, now - self._lastFrameTime);
    self._lastFrameTime = now;
    self._performance.elapsedMs += rawDelta;
    // Preserve overload truth before applying the bounded catch-up budget. A
    // long frame may not silently become a normal 5-tick frame.
    var droppedMs = Math.max(0, rawDelta - maxCatchupMs);
    if (droppedMs > 0) {
      var droppedTicks = Math.floor(droppedMs / self._tickIntervalMs);
      if (droppedTicks > 0) {
        self._performance.missedTickCount += droppedTicks;
        self._performance.consecutiveMissedTicks += droppedTicks;
        self._performance.maxConsecutiveMissedTicks = Math.max(self._performance.maxConsecutiveMissedTicks, self._performance.consecutiveMissedTicks);
        self._performance.debt = { code: 'TICK_CATCH_UP_BUDGET_EXCEEDED', missedTicks: droppedTicks, maxCatchUpTicks: self._maxCatchUpTicks, droppedMs: droppedMs };
      }
    }
    self._accumulator += Math.min(rawDelta, maxCatchupMs);
    var ticksThisFrame = 0;
    self._performance.frameCount++;
    while (self._accumulator >= self._tickIntervalMs && ticksThisFrame < self._maxCatchUpTicks) {
      self._accumulator -= self._tickIntervalMs;
      self._totalTicks++;
      ticksThisFrame++;
      var stepStarted = performance.now();
      if (self._tickFn) {
        var ok = self._tickFn(self._tickIntervalMs, self._totalTicks);
        if (ok === false) { self.stopLoop(); return; }
      }
      self._performance.stepDurationsMs.push(performance.now() - stepStarted);
      self._performance.simulatedTicks++;
    }
    if (ticksThisFrame > 1) self._performance.catchUpCount++;
    if (self._accumulator >= self._tickIntervalMs) {
      var missed = Math.floor(self._accumulator / self._tickIntervalMs);
      self._performance.missedTickCount += missed;
      self._performance.consecutiveMissedTicks += missed;
      self._performance.maxConsecutiveMissedTicks = Math.max(self._performance.maxConsecutiveMissedTicks, self._performance.consecutiveMissedTicks);
      self._performance.debt = { code: 'TICK_CATCH_UP_BUDGET_EXCEEDED', missedTicks: missed, maxCatchUpTicks: self._maxCatchUpTicks };
      self._accumulator = self._accumulator % self._tickIntervalMs;
    } else if (!droppedMs) self._performance.consecutiveMissedTicks = 0;
    self.render();
  }
  this._rAFId = requestAnimationFrame(frame);
};

GameCastleRuntimeAdapter.prototype.stopLoop = function () {
  this._running = false;
  if (this._rAFId) { cancelAnimationFrame(this._rAFId); this._rAFId = null; }
};

GameCastleRuntimeAdapter.prototype.stepSimulation = function (dtMs) {
  if (!this._sceneStack) return false;
  return this._sceneStack.step(dtMs);
};

GameCastleRuntimeAdapter.prototype.captureInputs = function () {
  if (!this._inputManager) return {};
  var frame = {};
  var useRawInput = this._rawInputBound;
  var im = this._inputManager;
  for (var i = 0; i < this._captureInputs.length; i++) {
    var name = this._captureInputs[i];
    var key = this._inputMap[name];
    var code = key ? _keyNameToCode(key) : null;
    if (code !== null) frame[name] = !!this._virtualInputs[name] || !!this._rawPressedCodes[code] || (!this._injectedCodes[code] && im.isKeyPressed(code));
  }
  return frame;
};

// Touch, accessibility and deterministic replay enter the same named frame as
// physical input. The bridge captures this state before every simulation tick.
GameCastleRuntimeAdapter.prototype.setVirtualInput = function (name, pressed) {
  if (name) this._virtualInputs[name] = !!pressed;
};

GameCastleRuntimeAdapter.prototype.getInputSnapshot = function (names) {
  var snapshot = {};
  var requested = names || this._declaredInputs;
  for (var i = 0; i < requested.length; i++) {
    var name = requested[i];
    var key = this._inputMap[name];
    var code = key ? _keyNameToCode(key) : null;
    snapshot[name] = code !== null && this._inputManager ? this._inputManager.isKeyPressed(code) : false;
  }
  return snapshot;
};

GameCastleRuntimeAdapter.prototype.injectInputs = function (frame, isLocal) {
  if (!this._inputManager || isLocal) return;
  var im = this._inputManager;
  im.releaseAllPressedKeys();
  this._injectedCodes = {};
  for (var i = 0; i < this._declaredInputs.length; i++) {
    var name = this._declaredInputs[i];
    var key = this._inputMap[name];
    if (!key || !frame[name]) continue;
    var code = _keyNameToCode(key);
    if (code !== null) { im.onKeyPressed(code); this._injectedCodes[code] = true; }
  }
};

GameCastleRuntimeAdapter.prototype.endFrame = function () {
  if (this._inputManager) this._inputManager.onFrameEnded();
};

GameCastleRuntimeAdapter.prototype.render = function () {
  if (this._sceneStack) this._sceneStack.renderWithoutStep();
};

GameCastleRuntimeAdapter.prototype.getStateHash = function () {
  try {
    var scene = this._sceneStack ? this._sceneStack.getCurrentScene() : null;
    if (!scene) return "nosce";
    var data = scene.getNetworkSyncData({ playerNumber:1, isHost:true, syncGameVariables:true, syncLayers:true, syncSceneTimers:true });
    if (!data) return "empty";
    var json = JSON.stringify(data);
    var hash = 5381;
    for (var i = 0; i < json.length; i++) hash = ((hash << 5) + hash + json.charCodeAt(i)) | 0;
    return (hash >>> 0).toString(16);
  } catch(e) { return "err:" + e.message; }
};

GameCastleRuntimeAdapter.prototype.getTickCount = function () { return this._totalTicks; };
GameCastleRuntimeAdapter.prototype.isRunning = function () { return this._running; };
GameCastleRuntimeAdapter.prototype.getTickIntervalMs = function () { return this._tickIntervalMs; };
GameCastleRuntimeAdapter.prototype.getPerformanceReport = function () {
  var durations = this._performance.stepDurationsMs.slice().sort(function(a, b) { return a - b; });
  function percentile(p) { return durations.length ? durations[Math.min(durations.length - 1, Math.floor((durations.length - 1) * p))] : 0; }
  var elapsedSeconds = this._performance.elapsedMs / 1000;
  return { observedSimulationHz: elapsedSeconds ? this._performance.simulatedTicks / elapsedSeconds : 0, observedRenderHz: elapsedSeconds ? this._performance.frameCount / elapsedSeconds : 0, elapsedMs: this._performance.elapsedMs, p50StepDurationMs: percentile(0.5), p95StepDurationMs: percentile(0.95), missedTickCount: this._performance.missedTickCount, maximumConsecutiveMissedTicks: this._performance.maxConsecutiveMissedTicks, catchUpCount: this._performance.catchUpCount, inputToStateTickLatency: this._performance.inputToStateTickLatency, debt: this._performance.debt };
};

if (typeof module !== "undefined") {
  module.exports = { GameCastleRuntimeAdapter: GameCastleRuntimeAdapter, GC_ADAPTER_KEY_MAP: GC_ADAPTER_KEY_MAP };
}
