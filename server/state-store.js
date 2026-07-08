// GameCastle — State Store
// In-memory key-value store with optional JSON file persistence.
//
// Usage:
//   const store = new StateStore({ filePath: './data/room-abc.json' });
//   store.put("p1_world", { level: 3 });
//   store.get("p1_world");           // → { level: 3 }
//   store.list("p1_");               // → [{ key, updatedAt }, ...]
//   store.remove("p1_world");
//
// When filePath is provided, state is persisted to disk on every
// mutation (debounced to 500ms). On construction, existing state
// is loaded from the file. Server restarts survive.

var fs = require("fs");
var path = require("path");

function StateStore(options) {
  options = options || {};
  this._data = new Map();
  this._filePath = options.filePath || null;
  this._persistTimer = null;

  if (this._filePath) {
    this._load();
  }
}

// ── File I/O ──────────────────────────────────────────────────────────────

StateStore.prototype._load = function () {
  try {
    var raw = fs.readFileSync(this._filePath, "utf8");
    var entries = JSON.parse(raw);
    var self = this;
    Object.keys(entries).forEach(function (key) {
      self._data.set(key, entries[key]);
    });
  } catch (e) {
    // First run or corrupt file — start empty. Do not crash.
    if (e.code !== "ENOENT") {
      console.warn("[StateStore] load warning: " + e.message);
    }
  }
};

StateStore.prototype._schedulePersist = function () {
  if (!this._filePath) return;
  if (this._persistTimer) clearTimeout(this._persistTimer);
  var self = this;
  this._persistTimer = setTimeout(function () {
    self._flush();
  }, 500);
};

StateStore.prototype._flush = function () {
  if (!this._filePath) return;
  var obj = {};
  this._data.forEach(function (entry, key) {
    obj[key] = entry;
  });
  try {
    fs.mkdirSync(path.dirname(this._filePath), { recursive: true });
    fs.writeFileSync(this._filePath, JSON.stringify(obj));
  } catch (e) {
    console.error("[StateStore] persist failed: " + e.message);
  }
};

// ── CRUD ──────────────────────────────────────────────────────────────────

StateStore.prototype.put = function (key, value) {
  this._data.set(key, { value: value, updatedAt: Date.now() });
  this._schedulePersist();
};

StateStore.prototype.get = function (key) {
  var entry = this._data.get(key);
  return entry ? entry.value : undefined;
};

StateStore.prototype.has = function (key) {
  return this._data.has(key);
};

StateStore.prototype.remove = function (key) {
  var result = this._data.delete(key);
  this._schedulePersist();
  return result;
};

// ── Bulk ──────────────────────────────────────────────────────────────────

StateStore.prototype.list = function (prefix) {
  var results = [];
  this._data.forEach(function (entry, key) {
    if (!prefix || key.startsWith(prefix)) {
      results.push({ key: key, updatedAt: entry.updatedAt });
    }
  });
  results.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  return results;
};

// ── Query ─────────────────────────────────────────────────────────────────

Object.defineProperty(StateStore.prototype, "size", {
  get: function () { return this._data.size; },
});

StateStore.prototype.clear = function () {
  this._data.clear();
  this._schedulePersist();
};

// ── Lifecycle ─────────────────────────────────────────────────────────────

StateStore.prototype.destroy = function () {
  if (this._persistTimer) clearTimeout(this._persistTimer);
  this._flush();
  this._data.clear();
};

module.exports = { StateStore: StateStore };
