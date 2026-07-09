// GameCastle Frame Sync Session
// Pure netcode core: frame buffers, player slots, input delay, redundancy,
// acknowledgements, pruning, and reconnect-friendly gap filling.
// It does not know about GDevelop, DOM input, WebSocket, or rendering.

function GameCastleFrameSyncSession(config) {
  config = config || {};
  this._inputDelay = config.inputDelay !== undefined ? config.inputDelay : 2;
  this._historySize = config.historySize !== undefined ? config.historySize : 120;
  this._redundancy = config.redundancy !== undefined ? config.redundancy : 5;
  this._localSlot = config.localSlot || "p1";
  this._remoteSlot = config.remoteSlot || "p2";
  this._tick = 0;
  this._readyTick = 0;
  this._localPlayerId = config.localPlayerId || null;
  this._peerIds = [];
  this._playerSlots = {};
  this._localInputs = {};
  this._remoteInputs = {};
  this._orderedInputs = {};
  this._peerAck = {};
  this._connected = true;
  this._lastPacket = null;
  if (this._localPlayerId) this._playerSlots[this._localPlayerId] = this._localSlot;
}

GameCastleFrameSyncSession.prototype.reset = function(options) {
  options = options || {};
  this._tick = options.tick || 0;
  this._readyTick = options.readyTick || 0;
  this._localInputs = {};
  this._remoteInputs = {};
  this._orderedInputs = {};
  this._peerAck = {};
  this._peerIds = [];
  this._connected = true;
  this._lastPacket = null;
  if (options.localPlayerId) this.setLocalPlayer(options.localPlayerId, options.localSlot || this._localSlot);
};

GameCastleFrameSyncSession.prototype.setLocalPlayer = function(playerId, slot) {
  this._localPlayerId = playerId || this._localPlayerId;
  this._localSlot = slot || this._localSlot;
  if (this._localPlayerId) this._playerSlots[this._localPlayerId] = this._localSlot;
};

GameCastleFrameSyncSession.prototype.setPeerPlayer = function(playerId, slot) {
  if (!playerId) return;
  if (this._peerIds.indexOf(playerId) < 0) this._peerIds.push(playerId);
  this._playerSlots[playerId] = slot || this._remoteSlot;
};

GameCastleFrameSyncSession.prototype.removePeerPlayer = function(playerId) {
  var next = [];
  for (var i = 0; i < this._peerIds.length; i++) {
    if (this._peerIds[i] !== playerId) next.push(this._peerIds[i]);
  }
  this._peerIds = next;
  delete this._playerSlots[playerId];
};

GameCastleFrameSyncSession.prototype.setConnected = function(value) {
  this._connected = !!value;
};

GameCastleFrameSyncSession.prototype.captureLocalFrame = function(inputs) {
  var tick = this._tick;
  this._localInputs[tick] = cloneFrame(inputs || {});
  var packet = this._buildInputPacket(tick);
  this._lastPacket = packet;
  this._tick++;
  this._prune();
  return packet;
};

GameCastleFrameSyncSession.prototype._buildInputPacket = function(tick) {
  var prev = {};
  for (var i = 1; i <= this._redundancy; i++) {
    var pt = tick - i;
    if (this._localInputs[pt] !== undefined) prev[pt] = this._localInputs[pt];
  }
  return {
    tick: tick,
    inputs: this._localInputs[tick] || {},
    prev: prev,
    ack: this._readyTick - 1,
  };
};

GameCastleFrameSyncSession.prototype.receiveRemoteFrame = function(playerId, packetOrTick, inputs) {
  if (!playerId) playerId = "__remote__";
  if (this._peerIds.indexOf(playerId) < 0) this.setPeerPlayer(playerId, this._remoteSlot);

  var packet = typeof packetOrTick === "object"
    ? packetOrTick
    : { tick: packetOrTick, inputs: inputs || {} };
  if (!packet || packet.tick === undefined) return;

  if (packet.ack !== undefined) this._peerAck[playerId] = Number(packet.ack);
  this._storeRemoteFrame(playerId, packet.tick, packet.inputs || {});
  if (packet.prev) {
    for (var pt in packet.prev) {
      if (packet.prev.hasOwnProperty(pt)) this._storeRemoteFrame(playerId, Number(pt), packet.prev[pt] || {});
    }
  }
  this._prune();
};

GameCastleFrameSyncSession.prototype.receiveOrderedFrame = function(tick, orderedInputs) {
  if (tick === undefined || !orderedInputs) return;
  this._orderedInputs[tick] = orderedInputs;
  this._prune();
};

GameCastleFrameSyncSession.prototype._storeRemoteFrame = function(playerId, tick, inputs) {
  if (!this._remoteInputs[tick]) this._remoteInputs[tick] = {};
  if (this._remoteInputs[tick][playerId] === undefined) {
    this._remoteInputs[tick][playerId] = cloneFrame(inputs || {});
  }
};

GameCastleFrameSyncSession.prototype.nextLockstepFrames = function() {
  var frames = [];
  var effectiveDelay = this._peerIds.length ? this._inputDelay : 0;
  while (this._connected) {
    var tick = this._readyTick;
    if (tick + effectiveDelay >= this._tick) break;
    if (this._localInputs[tick] === undefined) break;
    if (!this._hasRemoteInputsForTick(tick)) break;

    var combined = {};
    this._copySlotInputs(combined, this._localInputs[tick] || {}, this._localSlot);
    var remoteAtTick = this._remoteInputs[tick] || {};
    for (var i = 0; i < this._peerIds.length; i++) {
      var pid = this._peerIds[i];
      this._copySlotInputs(combined, remoteAtTick[pid] || {}, this._slotForPlayer(pid));
    }

    frames.push({
      tick: tick,
      inputs: combined,
      localInputs: this._localInputs[tick] || {},
      remoteInputs: remoteAtTick,
    });
    this._readyTick++;
  }
  this._prune();
  return frames;
};

GameCastleFrameSyncSession.prototype.nextAuthorityFrames = function() {
  var frames = [];
  var effectiveDelay = this._peerIds.length ? this._inputDelay : 0;
  while (this._connected) {
    var tick = this._readyTick;
    if (tick + effectiveDelay >= this._tick) break;
    var ordered = this._orderedInputs[tick];
    if (!ordered) break;
    var combined = {};
    for (var pid in ordered) {
      if (ordered.hasOwnProperty(pid)) {
        this._copySlotInputs(combined, ordered[pid] || {}, this._slotForPlayer(pid));
      }
    }
    frames.push({ tick: tick, inputs: combined, orderedInputs: ordered });
    this._readyTick++;
  }
  this._prune();
  return frames;
};

GameCastleFrameSyncSession.prototype._hasRemoteInputsForTick = function(tick) {
  if (!this._peerIds.length) return true;
  var remoteAtTick = this._remoteInputs[tick] || {};
  for (var i = 0; i < this._peerIds.length; i++) {
    if (remoteAtTick[this._peerIds[i]] === undefined) return false;
  }
  return true;
};

GameCastleFrameSyncSession.prototype._copySlotInputs = function(target, frame, slot) {
  frame = frame || {};
  for (var key in frame) {
    if (!frame.hasOwnProperty(key)) continue;
    if (/^p\d+_/.test(key)) continue;
    target[slot + "_" + key] = frame[key];
  }
};

GameCastleFrameSyncSession.prototype._slotForPlayer = function(playerId) {
  if (this._playerSlots[playerId]) return this._playerSlots[playerId];
  if (playerId === this._localPlayerId) return this._localSlot;
  this.setPeerPlayer(playerId, this._remoteSlot);
  return this._remoteSlot;
};

GameCastleFrameSyncSession.prototype._prune = function() {
  var cutoff = this._readyTick - this._historySize;
  var minPeerAck = null;
  for (var pid in this._peerAck) {
    if (!this._peerAck.hasOwnProperty(pid)) continue;
    var ack = this._peerAck[pid];
    if (minPeerAck === null || ack < minPeerAck) minPeerAck = ack;
  }
  if (minPeerAck !== null) cutoff = Math.min(cutoff, minPeerAck - this._redundancy);
  pruneTicks(this._localInputs, cutoff);
  pruneTicks(this._remoteInputs, cutoff);
  pruneTicks(this._orderedInputs, cutoff);
};

GameCastleFrameSyncSession.prototype.getTick = function() { return this._tick; };
GameCastleFrameSyncSession.prototype.getReadyTick = function() { return this._readyTick; };
GameCastleFrameSyncSession.prototype.getPeerIds = function() { return this._peerIds.slice(); };
GameCastleFrameSyncSession.prototype.getLocalSlot = function() { return this._localSlot; };
GameCastleFrameSyncSession.prototype.getRemoteSlot = function() { return this._remoteSlot; };
GameCastleFrameSyncSession.prototype.getLastPacket = function() { return this._lastPacket; };
GameCastleFrameSyncSession.prototype.isConnected = function() { return this._connected; };
GameCastleFrameSyncSession.prototype.getStats = function() {
  return {
    tick: this._tick,
    readyTick: this._readyTick,
    peers: this._peerIds.slice(),
    localSlot: this._localSlot,
    remoteSlot: this._remoteSlot,
    connected: this._connected,
  };
};

function cloneFrame(frame) {
  var copy = {};
  frame = frame || {};
  for (var key in frame) if (frame.hasOwnProperty(key)) copy[key] = frame[key];
  return copy;
}

function pruneTicks(map, cutoff) {
  for (var key in map) {
    if (map.hasOwnProperty(key) && Number(key) < cutoff) delete map[key];
  }
}

if (typeof module !== "undefined") {
  module.exports = { GameCastleFrameSyncSession: GameCastleFrameSyncSession };
}
