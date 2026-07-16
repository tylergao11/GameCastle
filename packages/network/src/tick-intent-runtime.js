// GameCastle Tick Intent Runtime
// Pure runtime core: tick clock, intent queues, deterministic replay frames,
// event log, snapshots, acknowledgements, pruning, and reconnect-friendly gap
// filling. It does not know about GDevelop, DOM input, WebSocket, or rendering.

function GameCastleTickIntentRuntime(config) {
  config = config || {};
  this._inputDelay = config.inputDelay !== undefined ? config.inputDelay : 2;
  this._historySize = config.historySize !== undefined ? config.historySize : 120;
  this._redundancy = config.redundancy !== undefined ? config.redundancy : 5;
  this._snapshotInterval = config.snapshotInterval !== undefined ? config.snapshotInterval : 20;
  this._localSlot = config.localSlot || "p1";
  this._remoteSlot = config.remoteSlot || "p2";
  this._tick = 0;
  this._readyTick = 0;
  this._localPlayerId = config.localPlayerId || null;
  this._peerIds = [];
  this._playerSlots = {};
  this._localIntents = {};
  this._remoteIntents = {};
  this._orderedIntents = {};
  this._peerAck = {};
  this._connected = true;
  this._lastPacket = null;
  this._events = [];
  this._snapshots = [];
  if (this._localPlayerId) this._playerSlots[this._localPlayerId] = this._localSlot;
}

GameCastleTickIntentRuntime.prototype.reset = function(options) {
  options = options || {};
  this._tick = options.tick || 0;
  this._readyTick = options.readyTick || 0;
  this._localIntents = {};
  this._remoteIntents = {};
  this._orderedIntents = {};
  this._peerAck = {};
  this._peerIds = [];
  this._connected = true;
  this._lastPacket = null;
  this._events = [];
  this._snapshots = [];
  if (options.localPlayerId) this.setLocalPlayer(options.localPlayerId, options.localSlot || this._localSlot);
};

GameCastleTickIntentRuntime.prototype.setLocalPlayer = function(playerId, slot) {
  this._localPlayerId = playerId || this._localPlayerId;
  this._localSlot = slot || this._localSlot;
  if (this._localPlayerId) this._playerSlots[this._localPlayerId] = this._localSlot;
};

GameCastleTickIntentRuntime.prototype.setPeerPlayer = function(playerId, slot) {
  if (!playerId) return;
  if (this._peerIds.indexOf(playerId) < 0) this._peerIds.push(playerId);
  this._playerSlots[playerId] = slot || this._remoteSlot;
};

GameCastleTickIntentRuntime.prototype.removePeerPlayer = function(playerId) {
  var next = [];
  for (var i = 0; i < this._peerIds.length; i++) {
    if (this._peerIds[i] !== playerId) next.push(this._peerIds[i]);
  }
  this._peerIds = next;
  delete this._playerSlots[playerId];
};

GameCastleTickIntentRuntime.prototype.setConnected = function(value) {
  this._connected = !!value;
};

GameCastleTickIntentRuntime.prototype.captureLocalIntent = function(intent) {
  var tick = this._tick;
  this._localIntents[tick] = cloneIntent(intent || {});
  var packet = this._buildIntentPacket(tick);
  this._lastPacket = packet;
  this._recordEvent(tick, "IntentCaptured", { playerId: this._localPlayerId || "local", intent: this._localIntents[tick] });
  this._tick++;
  this._prune();
  return packet;
};

GameCastleTickIntentRuntime.prototype._buildIntentPacket = function(tick) {
  var prev = {};
  for (var i = 1; i <= this._redundancy; i++) {
    var pt = tick - i;
    if (this._localIntents[pt] !== undefined) prev[pt] = this._localIntents[pt];
  }
  return {
    tick: tick,
    intent: this._localIntents[tick] || {},
    inputs: this._localIntents[tick] || {},
    prev: prev,
    ack: this._readyTick - 1,
  };
};

GameCastleTickIntentRuntime.prototype.receiveRemoteIntent = function(playerId, packetOrTick, intent) {
  if (!playerId) playerId = "__remote__";
  if (this._peerIds.indexOf(playerId) < 0) this.setPeerPlayer(playerId, this._remoteSlot);

  var packet = typeof packetOrTick === "object"
    ? packetOrTick
    : { tick: packetOrTick, intent: intent || {}, inputs: intent || {} };
  if (!packet || packet.tick === undefined) return;

  if (packet.ack !== undefined) this._peerAck[playerId] = Number(packet.ack);
  this._storeRemoteIntent(playerId, packet.tick, packet.intent || packet.inputs || {});
  if (packet.prev) {
    for (var pt in packet.prev) {
      if (packet.prev.hasOwnProperty(pt)) this._storeRemoteIntent(playerId, Number(pt), packet.prev[pt] || {});
    }
  }
  this._recordEvent(Number(packet.tick), "RemoteIntentReceived", { playerId: playerId });
  this._prune();
};

GameCastleTickIntentRuntime.prototype.receiveOrderedIntent = function(tick, orderedIntents) {
  if (tick === undefined || !orderedIntents) return;
  this._orderedIntents[tick] = orderedIntents;
  this._recordEvent(Number(tick), "OrderedIntentReceived", { players: Object.keys(orderedIntents) });
  this._prune();
};

GameCastleTickIntentRuntime.prototype._storeRemoteIntent = function(playerId, tick, intent) {
  if (!this._remoteIntents[tick]) this._remoteIntents[tick] = {};
  if (this._remoteIntents[tick][playerId] === undefined) {
    this._remoteIntents[tick][playerId] = cloneIntent(intent || {});
  }
};

GameCastleTickIntentRuntime.prototype.nextLockstepTicks = function() {
  var ticks = [];
  var effectiveDelay = this._peerIds.length ? this._inputDelay : 0;
  while (this._connected) {
    var tick = this._readyTick;
    if (tick + effectiveDelay >= this._tick) break;
    if (this._localIntents[tick] === undefined) break;
    if (!this._hasRemoteIntentsForTick(tick)) break;

    var combined = {};
    this._copySlotIntents(combined, this._localIntents[tick] || {}, this._localSlot);
    var remoteAtTick = this._remoteIntents[tick] || {};
    for (var i = 0; i < this._peerIds.length; i++) {
      var pid = this._peerIds[i];
      this._copySlotIntents(combined, remoteAtTick[pid] || {}, this._slotForPlayer(pid));
    }

    ticks.push(this._buildReadyTick(tick, combined, {
      localIntent: this._localIntents[tick] || {},
      remoteIntents: remoteAtTick,
      mode: "lockstep",
    }));
    this._readyTick++;
  }
  this._prune();
  return ticks;
};

GameCastleTickIntentRuntime.prototype.nextAuthorityTicks = function() {
  var ticks = [];
  var effectiveDelay = this._peerIds.length ? this._inputDelay : 0;
  while (this._connected) {
    var tick = this._readyTick;
    if (tick + effectiveDelay >= this._tick) break;
    var ordered = this._orderedIntents[tick];
    if (!ordered) break;
    var combined = {};
    for (var pid in ordered) {
      if (ordered.hasOwnProperty(pid)) {
        this._copySlotIntents(combined, ordered[pid] || {}, this._slotForPlayer(pid));
      }
    }
    ticks.push(this._buildReadyTick(tick, combined, {
      orderedIntents: ordered,
      mode: "server-authoritative",
    }));
    this._readyTick++;
  }
  this._prune();
  return ticks;
};

GameCastleTickIntentRuntime.prototype._buildReadyTick = function(tick, intents, meta) {
  this._recordEvent(tick, "TickAdvanced", { mode: meta.mode, intents: intents });
  var snapshot = this._snapshotForTick(tick, intents);
  return {
    tick: tick,
    intents: intents,
    inputs: intents,
    localIntent: meta.localIntent,
    remoteIntents: meta.remoteIntents,
    orderedIntents: meta.orderedIntents,
    remoteInputs: meta.remoteIntents,
    orderedInputs: meta.orderedIntents,
    events: this.getEvents(tick),
    snapshot: snapshot,
  };
};

GameCastleTickIntentRuntime.prototype._snapshotForTick = function(tick, intents) {
  if (this._snapshotInterval <= 0 && tick !== this._readyTick) return null;
  if (this._snapshotInterval > 0 && tick % this._snapshotInterval !== 0) return null;
  var snapshot = {
    tick: tick,
    hash: hashValue({ tick: tick, intents: intents }),
    readyTick: this._readyTick,
  };
  this._snapshots.push(snapshot);
  return snapshot;
};

GameCastleTickIntentRuntime.prototype._recordEvent = function(tick, type, payload) {
  this._events.push({
    tick: tick,
    type: type,
    payload: cloneIntent(payload || {}),
  });
};

GameCastleTickIntentRuntime.prototype.getEvents = function(tick) {
  var out = [];
  for (var i = 0; i < this._events.length; i++) {
    if (tick === undefined || this._events[i].tick === tick) out.push(cloneIntent(this._events[i]));
  }
  return out;
};

GameCastleTickIntentRuntime.prototype.getSnapshots = function() {
  return this._snapshots.map(cloneIntent);
};

GameCastleTickIntentRuntime.prototype._hasRemoteIntentsForTick = function(tick) {
  if (!this._peerIds.length) return true;
  var remoteAtTick = this._remoteIntents[tick] || {};
  for (var i = 0; i < this._peerIds.length; i++) {
    if (remoteAtTick[this._peerIds[i]] === undefined) return false;
  }
  return true;
};

GameCastleTickIntentRuntime.prototype._copySlotIntents = function(target, intent, slot) {
  intent = intent || {};
  for (var key in intent) {
    if (!intent.hasOwnProperty(key)) continue;
    if (/^p\d+_/.test(key)) continue;
    target[slot + "_" + key] = intent[key];
  }
};

GameCastleTickIntentRuntime.prototype._slotForPlayer = function(playerId) {
  if (this._playerSlots[playerId]) return this._playerSlots[playerId];
  if (playerId === this._localPlayerId) return this._localSlot;
  this.setPeerPlayer(playerId, this._remoteSlot);
  return this._remoteSlot;
};

GameCastleTickIntentRuntime.prototype._prune = function() {
  var cutoff = this._readyTick - this._historySize;
  var minPeerAck = null;
  for (var pid in this._peerAck) {
    if (!this._peerAck.hasOwnProperty(pid)) continue;
    var ack = this._peerAck[pid];
    if (minPeerAck === null || ack < minPeerAck) minPeerAck = ack;
  }
  if (minPeerAck !== null) cutoff = Math.min(cutoff, minPeerAck - this._redundancy);
  pruneTicks(this._localIntents, cutoff);
  pruneTicks(this._remoteIntents, cutoff);
  pruneTicks(this._orderedIntents, cutoff);
  this._events = this._events.filter(function(event) { return event.tick >= cutoff; });
  this._snapshots = this._snapshots.filter(function(snapshot) { return snapshot.tick >= cutoff; });
};

GameCastleTickIntentRuntime.prototype.getTick = function() { return this._tick; };
GameCastleTickIntentRuntime.prototype.getReadyTick = function() { return this._readyTick; };
GameCastleTickIntentRuntime.prototype.getPeerIds = function() { return this._peerIds.slice(); };
GameCastleTickIntentRuntime.prototype.getLocalSlot = function() { return this._localSlot; };
GameCastleTickIntentRuntime.prototype.getRemoteSlot = function() { return this._remoteSlot; };
GameCastleTickIntentRuntime.prototype.getLastPacket = function() { return this._lastPacket; };
GameCastleTickIntentRuntime.prototype.isConnected = function() { return this._connected; };
GameCastleTickIntentRuntime.prototype.getStats = function() {
  return {
    tick: this._tick,
    readyTick: this._readyTick,
    peers: this._peerIds.slice(),
    localSlot: this._localSlot,
    remoteSlot: this._remoteSlot,
    connected: this._connected,
    eventCount: this._events.length,
    snapshotCount: this._snapshots.length,
  };
};

function cloneIntent(intent) {
  return intent === undefined ? intent : JSON.parse(JSON.stringify(intent));
}

function pruneTicks(map, cutoff) {
  for (var key in map) {
    if (map.hasOwnProperty(key) && Number(key) < cutoff) delete map[key];
  }
}

function hashValue(value) {
  var json = JSON.stringify(value || {});
  var hash = 5381;
  for (var i = 0; i < json.length; i++) hash = ((hash << 5) + hash + json.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(16);
}

if (typeof module !== "undefined") {
  module.exports = { GameCastleTickIntentRuntime: GameCastleTickIntentRuntime };
}
