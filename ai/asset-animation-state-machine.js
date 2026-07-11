function createAnimationStateMachine(options) {
  options = options || {};
  var states = options.states || ['idle', 'move', 'hit', 'death'];
  var transitions = [{ from: 'idle', event: 'move', to: 'move' }, { from: 'move', event: 'stop', to: 'idle' }, { from: '*', event: 'hit', to: 'hit' }, { from: 'hit', event: 'recover', to: 'idle' }, { from: '*', event: 'die', to: 'death' }].filter(function(t) { return states.indexOf(t.to) >= 0 && (t.from === '*' || states.indexOf(t.from) >= 0); });
  return { schemaVersion: 1, initial: states.indexOf('idle') >= 0 ? 'idle' : states[0], states: states, transitions: transitions, framePolicy: { defaultFramesPerState: 1, runtimeTransformFirst: true, maxGeneratedKeyframesPerAction: 2, generateOnlyWhenNewPixelsRequired: true } };
}
function nextState(machine, current, event) { var transition = machine.transitions.find(function(t) { return t.event === event && (t.from === current || t.from === '*'); }); return transition ? transition.to : current; }
module.exports = { createAnimationStateMachine: createAnimationStateMachine, nextState: nextState };
