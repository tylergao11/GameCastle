// GameCastle — Game Loop
// Server-side input-ordering loop for authoritative mode.
//
// Players send inputs at their own tick rate. The server collects
// inputs and broadcasts them in tick order. Each game_state
// contains inputs from all players who submitted for that tick.
// Late submissions are dropped — the server does not wait.
//
// Does NOT run game logic — only orders and broadcasts inputs.

class GameLoop {
  constructor(options) {
    options = options || {};
    this._tickRate = options.tickRate || 20;
    this._processTick = 0;
    this._buffer = {};       // tick → { playerId: inputs }
    this._timer = null;
    this._running = false;
    this._onTick = options.onTick || null;  // (orderedInputs, tick)
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  start() {
    if (this._running) return;
    this._running = true;
    const intervalMs = Math.round(1000 / this._tickRate);
    this._timer = setInterval(() => this._processReadyTicks(), intervalMs);
  }

  stop() {
    this._running = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  get isRunning() { return this._running; }

  // ── Input ──────────────────────────────────────────────────────────────

  submitInput(playerId, tick, inputs) {
    if (tick < this._processTick) return; // Already processed
    if (!this._buffer[tick]) this._buffer[tick] = {};
    this._buffer[tick][playerId] = inputs;
  }

  // ── Processing ─────────────────────────────────────────────────────────

  _processReadyTicks() {
    // Process every tick that has at least one player's input.
    // We process sequentially — tick 0, then 1, then 2...
    // A tick is ready if ANY input exists for it.
    var maxTicksPerCall = 10;
    var processed = 0;
    while (this._running && processed < maxTicksPerCall) {
      const tick = this._processTick;
      const entries = this._buffer[tick];

      if (!entries) break;
      processed++; // Count processed ticks (rate-limiting guard: max 10 per call)

      if (this._onTick) this._onTick(entries, tick);
      delete this._buffer[tick];
      this._processTick++;

      // Periodic housekeeping (every 60 ticks)
      if (tick % 60 === 0) {
        const cutoff = tick - 120;
        for (const k in this._buffer) {
          if (Number(k) < cutoff) delete this._buffer[k];
        }
      }
    }
  }
}

module.exports = { GameLoop };
