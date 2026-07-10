var assert = require('assert');

var intentPipelineGraph = require('./intent-pipeline-graph');
var pipelineState = require('./pipeline-state');
var projectPipelineGraph = require('./project-pipeline-graph');

function main() {
  var spec = projectPipelineGraph.getProjectGraphSpec();
  projectPipelineGraph.assertProjectGraphSpec(spec);

  assert.strictEqual(spec.name, 'Project Weave Graph', 'project graph should have a stable discussion name');
  assert.deepStrictEqual(
    spec.embeddedGraphs.worldIntent.nodeSequence,
    intentPipelineGraph.INTENT_PIPELINE_NODE_SEQUENCE,
    'Project Weave Graph must embed the canonical World Intent Layer'
  );

  [
    'asset-library',
    'image-generation',
    'asset-review',
    'asset-resolver',
    'asset-world',
    'runtime-linker',
    'tick-runtime',
    'server-runtime',
    'html-export',
    'runtime-validator',
    'project-world',
    'tick-playtest',
    'semantic-feedback',
  ].forEach(function(nodeName) {
    var node = projectPipelineGraph.getNodeDefinition(nodeName);
    assert(node, 'missing project graph node: ' + nodeName);
    assert.strictEqual(node.status, 'wired-langgraph-smoke', nodeName + ' should be covered by a LangGraph smoke');
    assert(node.owner, nodeName + ' should declare an owner');
    assert(node.reads.length > 0, nodeName + ' should declare reads');
    assert(node.writes.length > 0, nodeName + ' should declare writes');
  });

  assert.deepStrictEqual(
    projectPipelineGraph.getLayerNodes('asset-weave'),
    ['asset-library', 'image-generation', 'asset-review', 'asset-resolver', 'asset-world'],
    'asset-weave layer should own resource lineup nodes'
  );
  assert.deepStrictEqual(
    projectPipelineGraph.getLayerNodes('runtime-assembly'),
    ['runtime-linker', 'tick-runtime', 'html-export', 'runtime'],
    'runtime-assembly layer should own assembly and execution nodes'
  );
  assert.deepStrictEqual(
    projectPipelineGraph.getLayerNodes('server-weave'),
    ['server-runtime'],
    'server-weave layer should own server composition'
  );

  assert.deepStrictEqual(
    projectPipelineGraph.getWiredLangGraphNodes(),
    intentPipelineGraph.INTENT_PIPELINE_NODE_SEQUENCE,
    'only the World Intent Layer should be marked live wired'
  );
  assert.deepStrictEqual(
    projectPipelineGraph.getLangGraphSmokeNodes(),
    [
      'asset-library',
      'image-generation',
      'asset-review',
      'asset-resolver',
      'asset-world',
      'runtime-linker',
      'tick-runtime',
      'server-runtime',
      'html-export',
      'runtime-validator',
      'project-world',
      'tick-playtest',
      'semantic-feedback',
    ],
    'scattered project owners should be covered by official LangGraph smoke nodes'
  );
  assert.deepStrictEqual(
    projectPipelineGraph.getContractReadyNodes(),
    [],
    'Project Weave Graph should not leave contract-ready owner nodes without LangGraph smoke coverage'
  );

  var coveredModules = {};
  spec.nodeSequence.forEach(function(nodeName) {
    (spec.nodes[nodeName].modules || []).forEach(function(modulePath) {
      coveredModules[modulePath] = nodeName;
    });
  });
  [
    'ai/asset-resolver.js',
    'ai/asset-world.js',
    'ai/cloud-library-manager.js',
    'ai/image-agent.js',
    'ai/distillation-agent.js',
    'ai/asset-rag-client.js',
    'ai/html-exporter.js',
    'ai/semantic-playtest-agent.js',
    'ai/tick-playtest-runtime.js',
    'ai/semantic-feedback.js',
    'ai/semantic-mapping/semantic-feedback.json',
    'ai/network-runtime/codegen.js',
    'ai/network-runtime/transport.js',
    'ai/network-runtime/tick-intent-bridge.js',
    'server/signaling-server.js',
    'server/room.js',
    'server/game-loop.js',
    'server/server-ordered-input.js',
    'server/state-store.js',
  ].forEach(function(modulePath) {
    assert(coveredModules[modulePath], 'Project Weave Graph must cover scattered module: ' + modulePath);
  });

  var llm2ProjectNode = projectPipelineGraph.getNodeDefinition('llm2-intent');
  assert(llm2ProjectNode.prohibitedReads.indexOf('assetResolver.manifest') >= 0, 'LLM2 must not read raw AssetManifest');
  assert(llm2ProjectNode.prohibitedReads.indexOf('assetWorld.world') >= 0, 'LLM2 must not read raw AssetWorld');
  assert(llm2ProjectNode.prohibitedReads.indexOf('bridge.bridgePlan') >= 0, 'LLM2 must not read bridge plan');

  var llm2StateContract = pipelineState.getNodeContract('llm2-intent');
  assert.deepStrictEqual(
    llm2StateContract.reads,
    ['llm2.nodeInput'],
    'project graph expansion must not widen the live LLM2 PipelineState read surface'
  );

  console.log('[ProjectPipelineGraph] Project Weave Graph spec passed');
}

main();
