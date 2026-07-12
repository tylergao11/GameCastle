var path = require('path');

var artifactStoreModule = require('./artifact-store');
var coordinatorModule = require('./run-coordinator');
var httpServerModule = require('./http-server');
var pipelineRunnerModule = require('./pipeline-runner');
var stateStoreModule = require('./state-store');
var transactionModule = require('./workspace-transaction');
var localAssetStoreModule = require('./local-asset-store');
var cloudAssetEngineModule = require('../../ai/cloud-asset-engine');
var simulatedPortsModule = require('../../ai/simulated-local-asset-ports');

function createRuntime(options) {
  options = options || {};
  var root = options.root || path.resolve(__dirname, '..', '..');
  var outputDir = options.outputDir || path.join(root, 'output');
  var dataDir = options.dataDir || path.join(root, '.gamecastle');
  var artifactStore = options.artifactStore || artifactStoreModule.createArtifactStore({
    outputDir: outputDir,
    releasesDir: path.join(dataDir, 'releases'),
  });
  var stateStore = options.stateStore || stateStoreModule.createStateStore(path.join(dataDir, 'local-runtime-state.json'));
  var simulatedPorts = options.simulatedPorts || simulatedPortsModule.createSimulatedLocalAssetPorts({ outputDir: outputDir });
  var localAssetStore = options.localAssetStore || localAssetStoreModule.createLocalAssetStore({ outputDir: outputDir, ports: simulatedPorts });
  var cloudAssetRoot = options.cloudAssetRoot || process.env.GAMECASTLE_CLOUD_ASSET_ROOT || path.join(root, '.gamecastle-cloud-assets');
  var cloudAssetEngine = options.cloudAssetEngine || cloudAssetEngineModule.createCloudAssetEngine({ rootDir: cloudAssetRoot });
  var transaction = options.transaction || transactionModule.createWorkspaceTransaction({
    outputDir: outputDir,
    transactionDir: path.join(dataDir, 'active-transaction'),
  });
  var runner = options.runner || pipelineRunnerModule.createPipelineRunner({
    cwd: root,
    scriptPath: path.join(root, 'ai', 'pipeline.js'),
  });
  var coordinator = coordinatorModule.createRunCoordinator({
    artifactStore: artifactStore,
    stateStore: stateStore,
    transaction: transaction,
    runner: runner,
    playBaseUrl: options.playBaseUrl || '',
    diagnosticsPath: options.diagnosticsPath || path.join(dataDir, 'runtime-diagnostics.jsonl'),
  });
  var server = httpServerModule.createLocalGameRuntimeServer({
    coordinator: coordinator,
    artifactStore: artifactStore,
    localAssetStore: localAssetStore,
    cloudAssetEngine: cloudAssetEngine,
    allowedUiOrigin: options.allowedUiOrigin || process.env.GAMECASTLE_UI_ORIGIN || 'http://127.0.0.1:5173',
  });
  return { server: server, coordinator: coordinator, artifactStore: artifactStore, localAssetStore: localAssetStore, cloudAssetEngine: cloudAssetEngine, simulatedPorts: simulatedPorts };
}

module.exports = {
  createRuntime: createRuntime,
};
