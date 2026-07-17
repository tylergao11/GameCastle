// Friend-session policy: lightweight invite multiplayer.
// Host = room initiator. Sync = lockstep input intents. Local machine = simulator, not each-peer authority.
// Simulation cadence is playable-only: default 60 Hz, never below 30 Hz (20 Hz is rejected as unplayable).

var tickPolicy = require('./tick-policy-resolver');

var DEFAULT_SIM_HZ = 60;
var MIN_SIM_HZ = 30;
var DEFAULT_INPUT_DELAY_TICKS = 2;
var DEFAULT_MAX_PLAYERS = 8;

function fail(code, message) {
  var error = new Error(message);
  error.code = code;
  error.owner = 'FriendSessionPolicy';
  throw error;
}

function resolve(input) {
  input = input || {};
  var initiatorId = input.initiatorId != null ? String(input.initiatorId).trim() : '';
  if (!initiatorId) fail('FRIEND_SESSION_INITIATOR_REQUIRED', 'Friend session requires initiatorId (room host).');

  var hostPlayerId = input.hostPlayerId != null && String(input.hostPlayerId).trim()
    ? String(input.hostPlayerId).trim()
    : initiatorId;
  if (hostPlayerId !== initiatorId) {
    fail('FRIEND_SESSION_HOST_MISMATCH', 'Friend session host must be the room initiator for MVP.');
  }

  var requestedHz = input.tickRate == null || input.tickRate === 0 ? DEFAULT_SIM_HZ : Number(input.tickRate);
  if (!isFinite(requestedHz) || requestedHz <= 0) fail('FRIEND_SESSION_TICK_INVALID', 'tickRate must be a positive number.');
  if (requestedHz < MIN_SIM_HZ) {
    fail(
      'FRIEND_SESSION_TICK_UNPLAYABLE',
      'Friend-session simulation must be at least ' + MIN_SIM_HZ + ' Hz; ' + requestedHz + ' Hz is unplayable.'
    );
  }

  var policy = tickPolicy.resolve({
    sync: 'lockstep',
    tickRate: requestedHz,
    authority: 'host'
  });

  var inputDelayTicks = input.inputDelayTicks == null ? DEFAULT_INPUT_DELAY_TICKS : Number(input.inputDelayTicks);
  if (!Number.isInteger(inputDelayTicks) || inputDelayTicks < 0 || inputDelayTicks > 8) {
    fail('FRIEND_SESSION_INPUT_DELAY_INVALID', 'inputDelayTicks must be an integer in 0..8.');
  }

  var maxPlayers = input.maxPlayers == null ? DEFAULT_MAX_PLAYERS : Number(input.maxPlayers);
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 16) {
    fail('FRIEND_SESSION_PLAYERS_INVALID', 'maxPlayers must be an integer in 2..16.');
  }

  // Product admission: room should bind an accepted delivery; adapter enforces until signaling validates.
  var delivery = null;
  if (input.deliveryAttestation && typeof input.deliveryAttestation === 'object') {
    var att = input.deliveryAttestation;
    if (!att.sourceHash || typeof att.sourceHash !== 'string') {
      fail('FRIEND_SESSION_DELIVERY_INVALID', 'deliveryAttestation.sourceHash is required when attestation is present.');
    }
    delivery = {
      sourceHash: att.sourceHash,
      assetWorldHash: att.assetWorldHash || null,
      spatialResolutionHash: att.spatialResolutionHash || null,
      assemblyReviewHash: att.assemblyReviewHash || null,
      contentHash: att.contentHash || null
    };
  }

  return Object.freeze({
    schemaVersion: 1,
    sessionKind: 'friend-invite',
    sync: 'lockstep',
    authority: 'host',
    hostPlayerId: hostPlayerId,
    initiatorId: initiatorId,
    topology: 'star-relay-or-p2p',
    simulationHz: policy.simulationHz,
    networkHz: policy.networkHz,
    fixedStepMs: policy.fixedStepMs,
    inputDelayTicks: inputDelayTicks,
    maxPlayers: maxPlayers,
    // Local machine predicts immediately; host input timeline is authority.
    latencyModel: Object.freeze({
      localPrediction: 'required',
      remoteInterpolation: policy.interpolationPolicy,
      hostDisconnect: 'dissolve-room',
      serverRole: 'signaling-and-relay-only'
    }),
    tickPolicy: policy,
    deliveryAttestation: delivery,
    contentHash: policy.contentHash
  });
}

module.exports = {
  resolve: resolve,
  DEFAULT_SIM_HZ: DEFAULT_SIM_HZ,
  MIN_SIM_HZ: MIN_SIM_HZ,
  DEFAULT_INPUT_DELAY_TICKS: DEFAULT_INPUT_DELAY_TICKS,
  DEFAULT_MAX_PLAYERS: DEFAULT_MAX_PLAYERS
};
