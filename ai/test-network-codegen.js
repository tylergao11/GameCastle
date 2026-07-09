var assert = require("assert");
var codegen = require("./network-runtime/codegen");

function render(sync) {
  return codegen.generate({
    modules: [
      {
        id: "network." + sync,
        syncPolicy: {
          sync: sync,
          tickRate: 20,
          authority: sync === "server-authoritative" ? "server" : "host",
        },
        inputs: ["move_left", "move_right", "jump"],
        state: ["Player", "Score"],
        deterministic: true,
      },
    ],
  }, {
    signalingUrl: "ws://example.test",
  });
}

var lockstepJs = render("lockstep");
assert(lockstepJs.includes("new GameCastleTickIntentBridge"), "lockstep build should include bridge");
assert(lockstepJs.includes("function GameCastleTickIntentRuntime"), "lockstep build should include tick-intent runtime core");
assert(!lockstepJs.includes("new InputSyncStrategy"), "lockstep build should not instantiate legacy input strategy");

var authorityJs = render("server-authoritative");
assert(authorityJs.includes("new GameCastleTickIntentBridge"), "authority build should include bridge");
assert(authorityJs.includes("function GameCastleTickIntentRuntime"), "authority build should include tick-intent runtime core");
assert(!authorityJs.includes("new AuthoritySyncStrategy"), "authority build should not instantiate legacy authority strategy");

var asyncJs = render("async-state");
assert(asyncJs.includes("new AsyncPersistenceStrategy"), "async-state build should instantiate async persistence strategy");
assert(asyncJs.includes("function GameCastleAsyncPersistenceSession"), "async-state build should include async persistence core");
assert(!asyncJs.includes("new AsyncStateStrategy"), "async-state should not instantiate legacy async-state strategy");

var snapshotJs = render("snapshot");
assert(snapshotJs.includes("new SnapshotSyncStrategy"), "snapshot build should instantiate snapshot strategy");
assert(snapshotJs.includes("function GameCastleSnapshotSyncSession"), "snapshot build should include snapshot-sync core");
assert(!codegen.REGISTRY.state, "state should not remain a canonical sync template");

console.log("PASS network_codegen_bridge_ownership");

var mixedPlanJs = codegen.generate({
  schemaVersion: 1,
  modules: [],
  plan: {
    schemaVersion: 1,
    realtime: {
      sync: "lockstep",
      authority: "host",
      tickRate: 20,
      deterministic: true,
      inputs: ["move_left", "move_right", "jump", "restart"],
      state: ["Player", "Score"],
      moduleIds: ["core.platformer"]
    },
    channels: [{
      id: "shell.game_over_screen",
      sync: "event",
      authority: "host",
      tickRate: 0,
      deterministic: true,
      inputs: ["restart"],
      state: []
    }],
    allInputs: ["move_left", "move_right", "jump", "restart"],
    allState: ["Player", "Score"]
  }
}, {
  signalingUrl: "ws://example.test",
});
assert(mixedPlanJs.includes("new GameCastleTickIntentBridge"), "mixed plan should include realtime bridge");
assert(mixedPlanJs.includes("function GameCastleTickIntentRuntime"), "mixed plan should include tick-intent runtime core");
assert(mixedPlanJs.includes("new EventRelayStrategy"), "mixed plan should include event side-channel strategy");
assert(!mixedPlanJs.includes("new InputSyncStrategy"), "mixed plan should not instantiate legacy lockstep strategy");
assert(mixedPlanJs.includes('inputs: ["move_left","move_right","jump","restart"]'), "bridge inputs should come from tick runtime plan");

var eventOnlyJs = codegen.generate({
  schemaVersion: 1,
  modules: [],
  plan: {
    schemaVersion: 1,
    realtime: null,
    channels: [{
      id: "network.event-room",
      sync: "event",
      authority: "server",
      tickRate: 0,
      deterministic: false,
      inputs: [],
      state: []
    }],
    allInputs: [],
    allState: []
  }
}, {
  signalingUrl: "ws://example.test",
});
assert(!eventOnlyJs.includes("new GameCastleTickIntentBridge"), "event-only plan should not create a bridge");
assert(eventOnlyJs.includes("new EventRelayStrategy"), "event-only plan should include event strategy");
assert(eventOnlyJs.includes("function hostWithoutBridge()"), "event-only plan should expose non-bridge room lifecycle");

console.log("PASS network_codegen_plan_ownership");
