var crypto = require('crypto');

var LOCAL_HZ = 60;
var REALTIME_MIN_HZ = 30;
var MAX_CATCH_UP_TICKS = 5;

function fail(message) { var error = new Error(message); error.code = 'TICK_POLICY_INVALID'; throw error; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function resolve(input) {
  input = input || {};
  var sync = input.sync || 'local';
  var requested = input.tickRate == null || input.tickRate === 0 ? null : Number(input.tickRate);
  if (requested !== null && (!isFinite(requested) || requested <= 0)) fail('tickRate must be a positive number when declared');
  var profile;
  if (sync === 'local') {
    if (requested !== null && requested !== LOCAL_HZ) fail('local interactive TickPolicy is fixed at 60 Hz');
    profile = { profile: 'local-interactive', simulationHz: LOCAL_HZ, inputSampleHz: LOCAL_HZ, networkPolicy: 'none', networkHz: null, interpolationPolicy: 'optional-when-phase-aligned' };
  } else if (sync === 'lockstep' || sync === 'lockstep-input') {
    var lockstepHz = requested || LOCAL_HZ;
    if (lockstepHz < REALTIME_MIN_HZ) fail('realtime lockstep TickPolicy must be at least 30 Hz');
    profile = { profile: 'realtime-lockstep', simulationHz: lockstepHz, inputSampleHz: lockstepHz, networkPolicy: 'tick-input', networkHz: lockstepHz, interpolationPolicy: lockstepHz < LOCAL_HZ ? 'required' : 'optional-when-phase-aligned' };
  } else if (sync === 'server-authoritative') {
    var authorityHz = requested || LOCAL_HZ;
    if (authorityHz < REALTIME_MIN_HZ) fail('server-authoritative TickPolicy must be at least 30 Hz');
    profile = { profile: 'server-authoritative', simulationHz: authorityHz, inputSampleHz: authorityHz, networkPolicy: 'authoritative-snapshot', networkHz: authorityHz, interpolationPolicy: 'required' };
  } else if (sync === 'event' || sync === 'async-state' || sync === 'snapshot' || sync === 'peer-event') {
    profile = { profile: 'asynchronous', simulationHz: LOCAL_HZ, inputSampleHz: LOCAL_HZ, networkPolicy: 'event-driven', networkHz: null, interpolationPolicy: 'optional-when-phase-aligned' };
  } else {
    fail('unsupported TickPolicy sync: ' + sync);
  }
  var policy = {
    schemaVersion: 1,
    profile: profile.profile,
    simulationHz: profile.simulationHz,
    inputSampleHz: profile.inputSampleHz,
    renderPolicy: 'request-animation-frame',
    networkPolicy: profile.networkPolicy,
    networkHz: profile.networkHz,
    fixedStepMs: 1000 / profile.simulationHz,
    maxCatchUpTicks: MAX_CATCH_UP_TICKS,
    interpolationPolicy: profile.interpolationPolicy,
    sync: sync,
    authority: input.authority || (sync === 'local' ? 'runtime' : 'host')
  };
  policy.contentHash = hash(policy);
  return policy;
}

module.exports = { resolve: resolve, LOCAL_HZ: LOCAL_HZ, REALTIME_MIN_HZ: REALTIME_MIN_HZ, MAX_CATCH_UP_TICKS: MAX_CATCH_UP_TICKS };
