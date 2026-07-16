// GameCastle Game Loop
// Timer wrapper around ServerOrderedInputSession.
// Does not run game logic; it only emits server-ordered input frames.

const { ServerOrderedInputSession } = require("./server-ordered-input");

class GameLoop {
  constructor(options) {
    options = options || {};
    this._tickRate = options.tickRate || 60;
    if (this._tickRate < 30) throw new Error('GameLoop realtime cadence must be at least 30 Hz');
    this._session = new ServerOrderedInputSession({
      startTick: options.startTick || 0,
      historySize: options.historySize,
    });
    this._timer = null;
    this._running = false;
    this._onTick = options.onTick || null;
  }

  start() {
    if (this._running) return;
    this._running = true;
    const intervalMs = Math.round(1000 / this._tickRate);
    this._timer = setInterval(() => this._processReadyTicks(), intervalMs);
  }

  stop() {
    this._running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  get isRunning() { return this._running; }

  submitInput(playerId, tick, inputs) {
    this._session.submitInput(playerId, tick, inputs);
  }

  _processReadyTicks() {
    const frames = this._session.collectReadyFrames(10);
    for (const frame of frames) {
      if (this._onTick) this._onTick(frame.inputs, frame.tick);
    }
  }

  getSession() { return this._session; }
}

module.exports = { GameLoop };
