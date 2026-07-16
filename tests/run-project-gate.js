var childProcess = require('child_process');
var path = require('path');

var root = path.resolve(__dirname, '..');

var semanticLoop = [
  ['tests/semantic/check-semantic-task-plan.js'],
  ['tests/semantic/check-semantic-run-state-machine.js'],
  ['tests/semantic/check-semantic-prompt-bundle.js'],
  ['tests/semantic/check-semantic-task-draft-slice.js'],
  ['tests/semantic/check-semantic-run-observer.js'],
  ['tests/semantic/check-semantic-llm2-runtime.js'],
  ['tests/semantic/check-snake-semantic-benchmark.js'],
  ['tests/semantic/check-snake-semantic-offline-suite.js']
];

var productLoop = [
  ['tests/product/check-product-delivery-run.js'],
  ['tests/product/check-product-failure-classifier.js'],
  ['tests/product/check-asset-card-projector.js'],
  ['tests/product/check-product-delivery-orchestrator.js'],
  ['tests/product/check-product-assembly-feedback-loop.js'],
  ['tests/product/check-assembly-review-provider-port.js'],
  ['tests/product/check-gdjs-browser-capture.js'],
  ['tests/product/test-product-engine-api.js']
];

var semanticEngine = [
  ['scripts/gdevelop/extract-gdevelop-capability-universe.js', '--check'],
  ['scripts/gdevelop/extract-official-capability-bindings.js', '--check'],
  ['scripts/gdevelop/extract-gdevelop-event-grammar.js', '--check'],
  ['scripts/gdevelop/extract-capability-semantic-index.js', '--check'],
  ['scripts/gdevelop/extract-gdevelop-project-defaults.js', '--check'],
  ['scripts/gdevelop/extract-gdevelop-spatial-coordinate-truth.js', '--check'],
  ['scripts/gdevelop/extract-gdevelop-object-configuration-truth.js', '--check'],
  ['tests/semantic/check-capability-semantic-coverage.js'],
  ['tests/semantic/check-official-capability-metadata.js'],
  ['tests/semantic/check-components.js'],
  ['tests/semantic/check-component-runtime.js'],
  ['tests/product/check-spatial-engine-contract.js'],
  ['tests/semantic/check-game-semantic-source.js'],
  ['tests/semantic/check-semantic-feedback-contract.js']
].concat(semanticLoop, [
  ['tests/semantic/check-semantic-compiler.js'],
  ['tests/semantic/check-semantic-assembly.js'],
  ['tests/semantic/check-gdjs-project-assembler.js'],
  ['tests/asset/check-gdjs-project-asset-binder.js'],
  ['tests/asset/check-gdjs-project-frame-set-binder.js'],
  ['tests/asset/check-animated-asset-engine.js'],
  ['tests/asset/check-semantic-asset-product-pipeline.js'],
  ['tests/asset/check-gdjs-asset-binding-dictionary.js'],
  ['tests/asset/check-asset-contract-validator.js'],
  ['tests/asset/check-asset-library.js'],
  ['tests/asset/check-asset-library-supabase-port.js'],
  ['tests/asset/check-frame-set.js'],
  ['tests/asset/check-non-image-resource-ingestion.js'],
  ['tests/semantic/check-semantic-product-executor.js'],
  ['tests/semantic/check-semantic-game-family-coverage.js'],
  ['tests/asset/test-asset-production-planner.js'],
  ['tests/asset/check-rembg-background-removal.js'],
  ['tests/asset/check-asset-production-pipeline.js'],
  ['tests/asset/check-asset-engine-langgraph.js'],
  ['tests/asset/check-gamecastle-style-dna.js'],
  ['tests/asset/check-master-image-quality.js'],
  ['tests/asset/check-comfyui-local-provider.js']
], productLoop);

var assetEngineExecution = [
  ['tests/asset/check-asset-engine-execution-policy.js'],
  ['tests/asset/check-asset-derivation-alpha.js'],
  ['tests/asset/check-local-derivation-kernel.js'],
  ['tests/asset/check-local-derivation-handlers.js'],
  ['tests/asset/check-local-asset-ops.mjs']
];
var provider = [
  ['tests/provider/check-ai-provider-governance.js'],
  ['tests/provider/check-provider-runtime-contract.js'],
  ['tests/provider/check-provider-runtime.js'],
  ['tests/provider/check-responses-client.js'],
  ['tests/provider/check-chat-completions-client.js'],
  ['tests/provider/check-deepseek-cache-monitor.js']
];
var llmTransport = [['tests/provider/check-responses-client.js']];
var network = [
  ['tests/network/test-tick-policy-resolver.js'],
  ['tests/network/test-tick-performance-evidence.js'],
  ['tests/network/test-tick-intent-runtime.js'],
  ['tests/network/test-tick-intent-bridge-local.js'],
  ['tests/network/test-tick-input-replay.js'],
  ['tests/network/test-runtime-adapter.js'],
  ['tests/network/test-network-codegen.js'],
  ['tests/network/test-snapshot-sync.js'],
  ['tests/network/test-server-ordered-input.js'],
  ['tests/network/test-event-relay.js'],
  ['tests/network/test-async-persistence.js'],
  ['tests/network/test-transport-reconnect.js'],
  ['tests/network/test-smoke.js'],
  ['tests/network/test-all.js'],
  ['tests/network/test-shooter-bridge-e2e.js']
];
var project = semanticEngine.concat(assetEngineExecution, provider, network);

var suites = {
  'semantic-loop': semanticLoop,
  'product-loop': productLoop,
  'semantic-engine': semanticEngine,
  'asset-engine-execution': assetEngineExecution,
  'project': project,
  'provider': provider,
  'network': network,
  'llm-transport': llmTransport
};

var name = process.argv[2];
if (!Object.prototype.hasOwnProperty.call(suites, name)) {
  process.stderr.write('Unknown check suite: ' + String(name || '<missing>') + '\n');
  process.exit(2);
}

suites[name].forEach(function(command, index) {
  process.stdout.write('\n[CheckSuite:' + name + '] ' + (index + 1) + '/' + suites[name].length + ' node ' + command.join(' ') + '\n');
  var result = childProcess.spawnSync(process.execPath, command, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status === null ? 1 : result.status);
});

process.stdout.write('\n[CheckSuite:' + name + '] passed ' + suites[name].length + ' checks\n');
