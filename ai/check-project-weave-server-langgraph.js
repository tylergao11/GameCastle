var assert = require('assert');
var fs = require('fs');
var path = require('path');

var langGraphRuntime = require('./langgraph-runtime');
var tickRuntimeCodegen = require('./network-runtime/codegen');

var ROOT = path.join(__dirname, '..');

function makeTickRuntimeManifest() {
  return {
    schemaVersion: 1,
    modules: [],
    plan: {
      schemaVersion: 1,
      realtime: {
        sync: 'server-authoritative',
        authority: 'server',
        tickRate: 20,
        deterministic: true,
        inputs: ['move_left', 'move_right', 'jump'],
        state: ['Player', 'Score'],
        moduleIds: ['core.platformer'],
      },
      channels: [],
      allInputs: ['move_left', 'move_right', 'jump'],
      allState: ['Player', 'Score'],
    },
  };
}

function assertFile(relativePath) {
  var fullPath = path.join(ROOT, relativePath);
  assert(fs.existsSync(fullPath), 'missing server weave file: ' + relativePath);
  return fullPath;
}

async function compileServerGraph(langGraph) {
  var State = langGraph.Annotation.Root({
    tickRuntime: langGraph.Annotation({
      reducer: function(left, right) { return Object.assign({}, left || {}, right || {}); },
      default: function() { return {}; },
    }),
    serverRuntime: langGraph.Annotation({
      reducer: function(left, right) { return Object.assign({}, left || {}, right || {}); },
      default: function() { return {}; },
    }),
    graphTrace: langGraph.Annotation({
      reducer: function(_left, right) { return right || []; },
      default: function() { return []; },
    }),
  });

  function appendTrace(state, nodeName, writes) {
    return (state.graphTrace || []).concat([{ node: nodeName, writes: writes }]);
  }

  return new langGraph.StateGraph(State)
    .addNode('tick-runtime', function(state) {
      var manifest = makeTickRuntimeManifest();
      var bundle = tickRuntimeCodegen.generate(manifest, { signalingUrl: 'ws://example.test' });
      assert(bundle.indexOf('new GameCastleTickIntentBridge') >= 0, 'tick intent runtime should include bridge');
      assert(bundle.indexOf('function GameCastleTickIntentRuntime') >= 0, 'tick intent runtime should include tick intent runtime core');
      return {
        tickRuntime: {
          manifest: manifest,
          bundle: bundle,
          summary: {
            sync: manifest.plan.realtime.sync,
            authority: manifest.plan.realtime.authority,
            inputs: manifest.plan.allInputs.length,
            state: manifest.plan.allState.length,
          },
        },
        graphTrace: appendTrace(state, 'tick-runtime', ['tickRuntime.manifest', 'tickRuntime.bundle', 'tickRuntime.summary']),
      };
    })
    .addNode('server-runtime', function(state) {
      assert(state.tickRuntime.summary, 'server runtime should receive tick intent runtime summary');
      var serverFiles = [
        'server/signaling-server.js',
        'server/room.js',
        'server/game-loop.js',
        'server/server-ordered-input.js',
        'server/state-store.js',
      ];
      serverFiles.forEach(assertFile);
      var roomModule = require(path.join(ROOT, 'server', 'room.js'));
      var loopModule = require(path.join(ROOT, 'server', 'game-loop.js'));
      var orderedInputModule = require(path.join(ROOT, 'server', 'server-ordered-input.js'));
      var stateStoreModule = require(path.join(ROOT, 'server', 'state-store.js'));
      assert.strictEqual(typeof roomModule.Room, 'function', 'server runtime should expose Room');
      assert.strictEqual(typeof loopModule.GameLoop, 'function', 'server runtime should expose GameLoop');
      assert.strictEqual(typeof orderedInputModule.ServerOrderedInputSession, 'function', 'server runtime should expose ordered input session');
      assert.strictEqual(typeof stateStoreModule.StateStore, 'function', 'server runtime should expose StateStore');
      return {
        serverRuntime: {
          report: {
            status: 'ready',
            owner: 'ServerRuntime',
            files: serverFiles,
            tickMode: state.tickRuntime.summary.sync,
          },
        },
        graphTrace: appendTrace(state, 'server-runtime', ['serverRuntime.report']),
      };
    })
    .addEdge(langGraph.START, 'tick-runtime')
    .addEdge('tick-runtime', 'server-runtime')
    .addEdge('server-runtime', langGraph.END)
    .compile();
}

async function main() {
  var langGraph = await langGraphRuntime.loadLangGraphPackage();
  var graph = await compileServerGraph(langGraph);
  var result = await graph.invoke({});
  assert.strictEqual(result.serverRuntime.report.status, 'ready', 'server runtime report should be ready');
  assert.deepStrictEqual(
    result.graphTrace.map(function(entry) { return entry.node; }),
    ['tick-runtime', 'server-runtime'],
    'server weave StateGraph trace should preserve server composition order'
  );
  console.log('[ProjectWeaveServerLangGraph] server weave StateGraph passed');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
