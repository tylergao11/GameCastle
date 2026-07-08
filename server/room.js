// GameCastle — Room
// Manages players, state store, event validation, and game loop.
// Composes StateStore and GameLoop.

const { StateStore } = require("./state-store");
const { GameLoop } = require("./game-loop");

class Room {
  constructor(id, options) {
    options = options || {};
    this.id = id;
    this._players = new Map();
    this._store = new StateStore();

    // Global send function for broadcasting (set via Room.setSender)
    this._send = null;

    // Capacity: 0 = unlimited
    this._maxPlayers = Math.max(0, Number(options.maxPlayers) || 0);

    // Event validator: fn(name, payload, fromPlayerId) → error | null
    this._eventValidator = options.eventValidator || null;

    // Authoritative game loop (activated when tickRate > 0)
    this._gameLoop = null;
    if (options.tickRate > 0) {
      this._gameLoop = new GameLoop({
        tickRate: options.tickRate,
        onTick: (inputs, tick) => this._onGameTick(inputs, tick),
      });
    }
  }

  // ── Sender ─────────────────────────────────────────────────────────────
  // Must be called before the room is used. The send function is
  // provided by the server's WebSocket transport layer.

  setSender(fn) {
    this._send = fn;
    if (this._gameLoop) this._gameLoop.start();
  }

  // ── Players ────────────────────────────────────────────────────────────

  add(playerId, ws) {
    if (this._maxPlayers > 0 && this._players.size >= this._maxPlayers) {
      throw new Error("room full (max " + this._maxPlayers + ")");
    }
    this._players.set(playerId, ws);
  }

  remove(playerId) {
    this._players.delete(playerId);
  }

  get playerCount()   { return this._players.size; }
  get isEmpty()       { return this._players.size === 0; }

  forEach(fn) { this._players.forEach(fn); }

  sendTo(playerId, msg) {
    const ws = this._players.get(playerId);
    if (ws && this._send) this._send(ws, msg);
  }

  broadcast(msg, excludeWs) {
    if (!this._send) return;
    for (const ws of this._players.values()) {
      if (ws !== excludeWs) this._send(ws, msg);
    }
  }

  // ── State Store ───────────────────────────────────────────────────��────

  saveState(key, value)  { this._store.put(key, value); }
  loadState(key)          { return this._store.get(key); }
  listStates(prefix)      { return this._store.list(prefix); }
  hasState(key)           { return this._store.has(key); }

  // ── Event Validation ───────────────────────────────────────────────────

  // Set a validator for this specific room. Replaces any global validator.
  setEventValidator(fn) {
    this._eventValidator = fn;
  }

  validateEvent(name, payload, fromPlayerId) {
    if (!this._eventValidator) return null;
    try { return this._eventValidator(name, payload, fromPlayerId); }
    catch (e) { return "validator error: " + e.message; }
  }

  // ── Authoritative Game Loop ────────────────────────────────────────────

  get hasGameLoop() { return !!this._gameLoop; }

  submitGameInput(playerId, tick, inputs) {
    if (this._gameLoop) this._gameLoop.submitInput(playerId, tick, inputs);
  }

  _onGameTick(orderedInputs, tick) {
    this.broadcast({
      type: "game_state",
      tick: tick,
      inputs: orderedInputs,
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  destroy() {
    if (this._gameLoop) this._gameLoop.stop();
    this._players.clear();
    this._store.clear();
  }
}

module.exports = { Room };
