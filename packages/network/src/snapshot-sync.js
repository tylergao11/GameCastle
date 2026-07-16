// GameCastle Snapshot Sync
// Pure snapshot session + transport strategy for authoritative state snapshots.
// The session owns sequence numbers, buffering, latest snapshot selection, and
// history pruning. The strategy only adapts it to GameCastleTransport.

var SNAPSHOT_SYNC_CHANNEL = "snapshot";

function GameCastleSnapshotSyncSession(config) {
  config = config || {};
  this._historySize = config.historySize !== undefined ? config.historySize : 60;
  this._interpolationDelayMs = config.interpolationDelayMs !== undefined ? config.interpolationDelayMs : 100;
  this._nextSeq = 0;
  this._latestSeq = -1;
  this._snapshots = [];
  this._bySeq = {};
}

GameCastleSnapshotSyncSession.prototype.createSnapshot = function(data, tick) {
  var seq = this._nextSeq++;
  return {
    __gc: {
      type: "snapshot",
      seq: seq,
      tick: tick !== undefined ? tick : seq,
      full: true,
      sentAt: nowMs(),
      data: cloneValue(data || {}),
    },
  };
};

GameCastleSnapshotSyncSession.prototype.receiveSnapshot = function(packet) {
  var meta = packet && packet.__gc;
  if (!meta || meta.type !== "snapshot" || meta.seq === undefined) return null;
  var seq = Number(meta.seq);
  if (this._bySeq[seq]) return null;
  var snapshot = {
    seq: seq,
    tick: meta.tick !== undefined ? Number(meta.tick) : seq,
    full: meta.full !== false,
    sentAt: meta.sentAt || 0,
    receivedAt: nowMs(),
    data: cloneValue(meta.data || {}),
  };
  this._bySeq[seq] = snapshot;
  this._snapshots.push(snapshot);
  this._snapshots.sort(function(a, b) { return a.seq - b.seq; });
  if (seq > this._latestSeq) this._latestSeq = seq;
  this._prune();
  return snapshot;
};

GameCastleSnapshotSyncSession.prototype.getLatestSnapshot = function() {
  if (this._latestSeq < 0) return null;
  return this._bySeq[this._latestSeq] || null;
};

GameCastleSnapshotSyncSession.prototype.consumeReadySnapshots = function(now) {
  now = now !== undefined ? now : nowMs();
  var ready = [];
  var cutoff = now - this._interpolationDelayMs;
  for (var i = 0; i < this._snapshots.length; i++) {
    var snapshot = this._snapshots[i];
    if (snapshot.receivedAt <= cutoff) ready.push(snapshot);
  }
  return ready;
};

GameCastleSnapshotSyncSession.prototype.reset = function() {
  this._nextSeq = 0;
  this._latestSeq = -1;
  this._snapshots = [];
  this._bySeq = {};
};

GameCastleSnapshotSyncSession.prototype._prune = function() {
  while (this._snapshots.length > this._historySize) {
    var removed = this._snapshots.shift();
    delete this._bySeq[removed.seq];
  }
};

GameCastleSnapshotSyncSession.prototype.getStats = function() {
  return {
    nextSeq: this._nextSeq,
    latestSeq: this._latestSeq,
    buffered: this._snapshots.length,
    interpolationDelayMs: this._interpolationDelayMs,
  };
};

function SnapshotSyncStrategy(transport, config) {
  config = config || {};
  if (config.tickRate == null) throw new Error("SnapshotSyncStrategy: tickRate is required");
  this._transport = transport;
  this._tickRate = config.tickRate || 10;
  this._authority = config.authority || "host";
  this._isAuthority = false;
  this._timer = null;
  this._tick = 0;
  this._session = new GameCastleSnapshotSyncSession(config);
  this._listeners = {};
  this._requests = {};

  var self = this;
  transport.on("joined", function() {
    if (self._authority === "host" && transport.getPlayers().size === 0) self._isAuthority = true;
  });
  transport.on("sync", function(from, channel, data) {
    if (channel !== SNAPSHOT_SYNC_CHANNEL || self._isAuthority) return;
    var snapshot = self._session.receiveSnapshot(data);
    if (!snapshot) return;
    self._emit("snapshot", snapshot.data, snapshot);
  });
}

SnapshotSyncStrategy.prototype.on = function(event, handler) {
  if (!this._listeners[event]) this._listeners[event] = [];
  this._listeners[event].push(handler);
};

SnapshotSyncStrategy.prototype.onRequest = function(event, handler) {
  this._requests[event] = handler;
};

SnapshotSyncStrategy.prototype._emit = function(event) {
  var args = Array.prototype.slice.call(arguments, 1);
  var handlers = this._listeners[event];
  if (handlers) {
    for (var i = 0; i < handlers.length; i++) handlers[i].apply(null, args);
  }
};

SnapshotSyncStrategy.prototype.start = function() {
  if (!this._isAuthority || this._timer) return;
  var self = this;
  var intervalMs = Math.round(1000 / this._tickRate);
  this._timer = setInterval(function() {
    var readFn = self._requests.readSnapshot || self._requests.readState;
    if (!readFn) return;
    var data = readFn(self._tick);
    if (data === undefined || data === null) return;
    self._transport.sync(SNAPSHOT_SYNC_CHANNEL, self._session.createSnapshot(data, self._tick));
    self._tick++;
  }, intervalMs);
};

SnapshotSyncStrategy.prototype.stop = function() {
  if (this._timer) {
    clearInterval(this._timer);
    this._timer = null;
  }
  this._isAuthority = false;
};

SnapshotSyncStrategy.prototype.isAuthority = function() { return this._isAuthority; };
SnapshotSyncStrategy.prototype.getSession = function() { return this._session; };
SnapshotSyncStrategy.prototype.getStats = function() { return this._session.getStats(); };

function cloneValue(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function nowMs() {
  if (typeof performance !== "undefined" && performance.now) return performance.now();
  return Date.now();
}

if (typeof module !== "undefined") {
  module.exports = {
    GameCastleSnapshotSyncSession: GameCastleSnapshotSyncSession,
    SnapshotSyncStrategy: SnapshotSyncStrategy,
    SNAPSHOT_SYNC_CHANNEL: SNAPSHOT_SYNC_CHANNEL,
  };
}
