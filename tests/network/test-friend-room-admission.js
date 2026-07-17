// Friend room admission: delivery attestation + host dissolve.
var path = require('path');
var { fork } = require('child_process');
var { WebSocket } = require('ws');

var PORT = 3011;
var passed = 0;
var failed = 0;
function pass(n) { passed++; console.log('PASS ' + n); }
function fl(n, why) { failed++; console.log('FAIL ' + n + ': ' + why); }

var server = fork(path.join(__dirname, '..', '..', 'apps', 'multiplayer', 'src', 'signaling-server.js'), [], {
  env: Object.assign({}, process.env, { PORT: String(PORT) }),
  silent: true,
});

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
function send(ws, msg) { ws.send(JSON.stringify(msg)); }

function onceMessage(ws, predicate, timeoutMs) {
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
      ws.removeListener('message', onMsg);
      reject(new Error('timeout waiting for message'));
    }, timeoutMs || 3000);
    function onMsg(raw) {
      var m;
      try { m = JSON.parse(raw.toString()); } catch (e) { return; }
      if (predicate(m)) {
        clearTimeout(timer);
        ws.removeListener('message', onMsg);
        resolve(m);
      }
    }
    ws.on('message', onMsg);
  });
}

async function run() {
  await sleep(400);
  var wsHost = new WebSocket('ws://localhost:' + PORT);
  var wsGuest = new WebSocket('ws://localhost:' + PORT);
  await Promise.all([
    new Promise(function(r) { wsHost.on('open', r); }),
    new Promise(function(r) { wsGuest.on('open', r); }),
  ]);

  // Friend room without delivery → rejected.
  send(wsHost, { type: 'create_room', sessionKind: 'friend-invite', hostPlayerId: 'host1' });
  var errNoDelivery = await onceMessage(wsHost, function(m) { return m.type === 'error'; });
  if (errNoDelivery.error.indexOf('sourceHash') >= 0) pass('friend_requires_delivery');
  else fl('friend_requires_delivery', errNoDelivery.error);

  // Friend room with 20 Hz → rejected.
  send(wsHost, {
    type: 'create_room',
    sessionKind: 'friend-invite',
    hostPlayerId: 'host1',
    tickRate: 20,
    deliveryAttestation: { sourceHash: 'semantic.test' },
  });
  var errTick = await onceMessage(wsHost, function(m) { return m.type === 'error'; });
  if (errTick.error.indexOf('30') >= 0) pass('friend_rejects_20hz');
  else fl('friend_rejects_20hz', errTick.error);

  // Valid friend room.
  send(wsHost, {
    type: 'create_room',
    sessionKind: 'friend-invite',
    hostPlayerId: 'host1',
    tickRate: 60,
    deliveryAttestation: { sourceHash: 'semantic.test', assetWorldHash: 'asset.x' },
  });
  var created = await onceMessage(wsHost, function(m) { return m.type === 'room_created'; });
  if (created.sessionKind === 'friend-invite' && created.deliveryAttestation.sourceHash === 'semantic.test') {
    pass('friend_room_created');
  } else fl('friend_room_created', JSON.stringify(created));

  send(wsHost, {
    type: 'join_room',
    roomId: created.roomId,
    playerId: 'host1',
    deliveryAttestation: { sourceHash: 'semantic.test' },
  });
  await onceMessage(wsHost, function(m) { return m.type === 'joined' && m.playerId === 'host1'; });
  pass('host_joined');

  // Guest wrong hash.
  send(wsGuest, {
    type: 'join_room',
    roomId: created.roomId,
    playerId: 'guest1',
    deliveryAttestation: { sourceHash: 'semantic.other' },
  });
  var mismatch = await onceMessage(wsGuest, function(m) { return m.type === 'error'; });
  if (mismatch.error.indexOf('mismatch') >= 0) pass('guest_hash_mismatch');
  else fl('guest_hash_mismatch', mismatch.error);

  // Guest correct hash.
  send(wsGuest, {
    type: 'join_room',
    roomId: created.roomId,
    playerId: 'guest1',
    deliveryAttestation: { sourceHash: 'semantic.test' },
  });
  await onceMessage(wsGuest, function(m) { return m.type === 'joined' && m.playerId === 'guest1'; });
  pass('guest_joined');

  // Host leave dissolves room.
  var closed = onceMessage(wsGuest, function(m) { return m.type === 'room_closed'; });
  send(wsHost, { type: 'leave_room' });
  var closedMsg = await closed;
  if (closedMsg.reason === 'host_disconnect') pass('host_disconnect_dissolves');
  else fl('host_disconnect_dissolves', JSON.stringify(closedMsg));

  // Open room still works without delivery (backward compatible).
  send(wsHost, { type: 'create_room' });
  var openRoom = await onceMessage(wsHost, function(m) { return m.type === 'room_created'; });
  if (openRoom.roomId) pass('open_room_still_works');
  else fl('open_room_still_works', JSON.stringify(openRoom));

  wsHost.close();
  wsGuest.close();
  server.kill();
  console.log('\n' + passed + '/' + (passed + failed) + ' passed');
  if (failed) process.exit(1);
}

run().catch(function(err) {
  console.error(err);
  try { server.kill(); } catch (e) {}
  process.exit(1);
});
