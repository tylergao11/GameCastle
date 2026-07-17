var assert = require('assert');
var Runtime = require('../../packages/network/src/tick-intent-runtime').GameCastleTickIntentRuntime;

var rt = new Runtime({ localSlot: 'p1', remoteSlot: 'p2', inputDelay: 0, localPrediction: true });
rt.setLocalPlayer('alice', 'p1');
rt.setPeerPlayer('bob', 'p2');

// Capture two local intents without remote → predict ahead for feel.
rt.captureLocalIntent({ move: 1 });
rt.captureLocalIntent({ move: 2 });
var predicted = rt.nextPredictedTicks();
assert.strictEqual(predicted.length >= 1, true, 'should predict unconfirmed ticks');
assert.strictEqual(predicted[0].predicted, true);
assert.strictEqual(predicted[0].mode, 'predicted');
assert.strictEqual(predicted[0].intents.p1_move, 1);

// No lockstep confirm yet without remote.
assert.strictEqual(rt.nextLockstepTicks().length, 0);

// Remote arrives matching hold-last empty → may reconcile or confirm.
rt.receiveRemoteIntent('bob', { tick: 0, intent: { move: 9 }, ack: -1 });
rt.receiveRemoteIntent('bob', { tick: 1, intent: { move: 8 }, ack: -1 });
var confirmed = rt.nextLockstepTicks();
assert.strictEqual(confirmed.length, 2);
assert.strictEqual(confirmed[0].predicted, false);
assert.strictEqual(confirmed[0].mode, 'lockstep');
assert.strictEqual(confirmed[0].intents.p1_move, 1);
assert.strictEqual(confirmed[0].intents.p2_move, 9);
// Predicted used hold-last empty remote; confirmed has remote → reconcile rollback marker.
assert.strictEqual(confirmed[0].reconcile && confirmed[0].reconcile.rollback, true);

// Prediction disabled: no predicted ticks.
var plain = new Runtime({ localSlot: 'p1', remoteSlot: 'p2', inputDelay: 0, localPrediction: false });
plain.setLocalPlayer('a', 'p1');
plain.setPeerPlayer('b', 'p2');
plain.captureLocalIntent({ x: 1 });
assert.deepStrictEqual(plain.nextPredictedTicks(), []);

console.log('PASS local_prediction');
