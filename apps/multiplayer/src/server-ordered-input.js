// GameCastle Server Ordered Input
// Server-side template for ordering client input frames. It does not run game
// simulation; it only emits tick-ordered input frames for clients to replay.

class ServerOrderedInputSession {
  constructor(options) {
    options = options || {};
    this._processTick = options.startTick || 0;
    this._historySize = options.historySize !== undefined ? options.historySize : 120;
    this._buffer = {};
  }

  submitInput(playerId, tick, inputs) {
    tick = Number(tick);
    if (!playerId || !Number.isFinite(tick)) return false;
    if (tick < this._processTick) return false;
    if (!this._buffer[tick]) this._buffer[tick] = {};
    this._buffer[tick][playerId] = cloneValue(inputs || {});
    return true;
  }

  collectReadyFrames(maxFrames) {
    maxFrames = maxFrames !== undefined ? maxFrames : 10;
    const frames = [];
    while (frames.length < maxFrames) {
      const tick = this._processTick;
      const inputs = this._buffer[tick];
      if (!inputs) break;
      frames.push({ tick, inputs });
      delete this._buffer[tick];
      this._processTick++;
      this._prune();
    }
    return frames;
  }

  _prune() {
    const cutoff = this._processTick - this._historySize;
    for (const tick of Object.keys(this._buffer)) {
      if (Number(tick) < cutoff) delete this._buffer[tick];
    }
  }

  getProcessTick() { return this._processTick; }

  getStats() {
    return {
      processTick: this._processTick,
      bufferedTicks: Object.keys(this._buffer).length,
    };
  }
}

function cloneValue(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

module.exports = { ServerOrderedInputSession };
