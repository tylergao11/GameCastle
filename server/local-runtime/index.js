var path = require('path');

var artifactStoreModule = require('./artifact-store');
var coordinatorModule = require('./run-coordinator');
var httpServerModule = require('./http-server');
var projectWeaveRunnerModule = require('./project-weave-runner');
var stateStoreModule = require('./state-store');
var transactionModule = require('./workspace-transaction');
var localAssetStoreModule = require('./local-asset-store');
var simulatedPortsModule = require('../../ai/simulated-local-asset-ports');
var projectStoreModule = require('../../ai/project-store');

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
  var projectStore = options.projectStore || projectStoreModule.createProjectStore({ rootDir: dataDir });
  var simulatedPorts = options.simulatedPorts || simulatedPortsModule.createSimulatedLocalAssetPorts({ outputDir: outputDir });
  var localAssetStore = options.localAssetStore || localAssetStoreModule.createLocalAssetStore({ outputDir: outputDir, ports: simulatedPorts });
  // Shared-library truth is an explicitly injected service. Local creation must never recreate a file-system cloud library.
  var cloudAssetEngine = options.cloudAssetEngine || null;
  var transaction = options.transaction || transactionModule.createWorkspaceTransaction({
    outputDir: outputDir,
    transactionDir: path.join(dataDir, 'active-transaction'),
  });
  var runner = options.runner || projectWeaveRunnerModule.createProjectWeaveRunner({
    workspaceRoot: dataDir,
    outputDir: outputDir,
  });
  var coordinator = coordinatorModule.createRunCoordinator({
    artifactStore: artifactStore,
    projectStore: projectStore,
    stateStore: stateStore,
    transaction: transaction,
    runner: runner,
    playBaseUrl: options.playBaseUrl || '',
    diagnosticsPath: options.diagnosticsPath || path.join(dataDir, 'runtime-diagnostics.jsonl'),
    projectStore: projectStore,
    outputDir: outputDir,
  });
  var server = httpServerModule.createLocalGameRuntimeServer({
    coordinator: coordinator,
    artifactStore: artifactStore,
    projectStore: projectStore,
    localAssetStore: localAssetStore,
    cloudAssetEngine: cloudAssetEngine,
    allowedUiOrigin: options.allowedUiOrigin || process.env.GAMECASTLE_UI_ORIGIN || 'http://127.0.0.1:5173',
  });
  return { server: server, coordinator: coordinator, artifactStore: artifactStore, projectStore: projectStore, localAssetStore: localAssetStore, cloudAssetEngine: cloudAssetEngine, simulatedPorts: simulatedPorts };
}

module.exports = {
  createRuntime: createRuntime,
};
