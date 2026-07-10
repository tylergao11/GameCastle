var assert = require('assert');

var htmlExporter = require('./html-exporter');
var langGraphRuntime = require('./langgraph-runtime');
var pipeline = require('./pipeline');
var projectWorld = require('./project-world');
var runtimeCodegen = require('./runtime-codegen');
var semanticFeedback = require('./semantic-feedback');
var semanticPlaytestAgent = require('./semantic-playtest-agent');

function makeProject() {
  var project = pipeline.emptyProject('ProjectWeaveRuntimeCheck');
  var scene = {
    b: 0,
    disableInputWhenNotFocused: true,
    mangledName: 'Game',
    name: 'Game',
    r: 0,
    standardSortMethod: true,
    stopSoundsOnStartup: true,
    title: '',
    v: 0,
    uiSettings: {},
    instances: [],
    objects: [],
    events: [],
    layers: [{ name: '', visibility: true, cameras: [], effects: [] }],
    variables: [],
    objectsGroups: [],
    behaviorsSharedData: [],
    usedResources: [],
  };
  project.firstLayout = 'Game';
  project.layouts.push(scene);
  scene.objects.push({
    name: 'Player',
    type: 'PrimitiveDrawing::Drawer',
    fillColor: { r: 68, g: 136, b: 255 },
    outlineColor: { r: 255, g: 255, b: 255 },
    outlineSize: 0,
    variables: [],
    behaviors: [],
  });
  scene.instances.push({
    name: 'Player',
    x: 100,
    y: 100,
    width: 32,
    height: 48,
    layer: '',
    zOrder: 1,
  });
  scene.objects.push({
    name: 'Coin',
    type: 'PrimitiveDrawing::Drawer',
    fillColor: { r: 255, g: 215, b: 0 },
    outlineColor: { r: 255, g: 255, b: 255 },
    outlineSize: 0,
    variables: [],
    behaviors: [],
  });
  [180, 260, 340].forEach(function(x, index) {
    scene.instances.push({
      name: 'Coin',
      x: x,
      y: 100,
      width: 16,
      height: 16,
      layer: '',
      zOrder: index + 2,
    });
  });
  scene.events.push({
    type: 'BuiltinCommonInstructions::Standard',
    conditions: [{ type: { value: 'CollisionNP' }, parameters: ['Player', 'Coin'] }],
    actions: [],
    events: [],
  });
  scene.events.push({
    type: 'BuiltinCommonInstructions::Standard',
    conditions: [{ type: { value: 'DepartScene' }, parameters: [] }],
    actions: [],
    events: [],
  });
  return project;
}

function createInitialState() {
  return {
    project: makeProject(),
    bridge: {
      bridgePlan: {
        target: 'gdjs-target-plan',
        dslLines: ['create scene name=Game'],
        runtimeAdapterRequirements: [],
        diagnostics: [],
      },
      internalDslText: 'create scene name=Game',
    },
    assetResolver: {
      manifest: {
        summary: { resolved: 0, placeholders: 0, failed: 0, publishable: true },
        assets: [],
      },
    },
    assetWorld: {
      world: {
        summary: { totalSlots: 0, debtCount: 0, publishable: true },
        debts: [],
      },
    },
    assembly: {},
    htmlExport: {},
    runtime: {
      executionReport: null,
    },
    validation: {},
    projectWorld: {
      previous: null,
      world: null,
      sanitizedForLlm2: null,
    },
    executionLedger: {},
    tickPlaytest: {},
    semanticFeedback: {},
    graphTrace: [],
  };
}

async function compileRuntimeGraph(langGraph) {
  var State = langGraph.Annotation.Root({
    project: langGraph.Annotation({
      reducer: function(_left, right) { return right; },
      default: function() { return null; },
    }),
    bridge: langGraph.Annotation({
      reducer: function(left, right) { return Object.assign({}, left || {}, right || {}); },
      default: function() { return {}; },
    }),
    assetResolver: langGraph.Annotation({
      reducer: function(left, right) { return Object.assign({}, left || {}, right || {}); },
      default: function() { return {}; },
    }),
    assetWorld: langGraph.Annotation({
      reducer: function(left, right) { return Object.assign({}, left || {}, right || {}); },
      default: function() { return {}; },
    }),
    assembly: langGraph.Annotation({
      reducer: function(left, right) { return Object.assign({}, left || {}, right || {}); },
      default: function() { return {}; },
    }),
    htmlExport: langGraph.Annotation({
      reducer: function(left, right) { return Object.assign({}, left || {}, right || {}); },
      default: function() { return {}; },
    }),
    runtime: langGraph.Annotation({
      reducer: function(left, right) { return Object.assign({}, left || {}, right || {}); },
      default: function() { return {}; },
    }),
    validation: langGraph.Annotation({
      reducer: function(left, right) { return Object.assign({}, left || {}, right || {}); },
      default: function() { return {}; },
    }),
    projectWorld: langGraph.Annotation({
      reducer: function(left, right) { return Object.assign({}, left || {}, right || {}); },
      default: function() { return {}; },
    }),
    executionLedger: langGraph.Annotation({
      reducer: function(left, right) { return Object.assign({}, left || {}, right || {}); },
      default: function() { return {}; },
    }),
    tickPlaytest: langGraph.Annotation({
      reducer: function(left, right) { return Object.assign({}, left || {}, right || {}); },
      default: function() { return {}; },
    }),
    semanticFeedback: langGraph.Annotation({
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
    .addNode('runtime-linker', function(state) {
      var codeFiles = runtimeCodegen.generateProjectCodeFiles(state.project);
      return {
        assembly: {
          report: {
            status: 'ready',
            owner: 'RuntimeLinker',
            codeFiles: codeFiles.map(function(file) { return file.fileName; }),
            internalDslLines: (state.bridge.bridgePlan.dslLines || []).length,
            assetSlots: ((state.assetResolver.manifest || {}).assets || []).length,
          },
          runtimeFiles: codeFiles,
        },
        graphTrace: appendTrace(state, 'runtime-linker', ['assembly.report', 'assembly.runtimeFiles']),
      };
    })
    .addNode('html-export', function(state) {
      var manifest = htmlExporter.buildHtmlExportManifest(state.project, {
        codeFiles: state.assembly.runtimeFiles,
        hasIntentRuntime: false,
      });
      var html = htmlExporter.renderHtml(manifest, { hasNetwork: false });
      assert(html.indexOf('gdjs.RuntimeGame') >= 0, 'html export should render runtime bootstrap');
      return {
        htmlExport: {
          manifest: manifest,
          files: ['index.html', 'game.html'],
          summary: {
            scripts: manifest.scriptFiles.length,
            assets: (manifest.assetFiles || []).length,
            htmlBytes: html.length,
          },
        },
        graphTrace: appendTrace(state, 'html-export', ['htmlExport.manifest', 'htmlExport.files', 'htmlExport.summary']),
      };
    })
    .addNode('runtime-validator', function(state) {
      var assetDebt = (((state.assetWorld.world || {}).summary || {}).debtCount) || 0;
      var report = {
        status: assetDebt ? 'blocked' : 'passed',
        owner: 'RuntimeValidator',
        checks: [
          { id: 'runtime-linker', status: state.assembly.report.status },
          { id: 'html-export', status: state.htmlExport.manifest ? 'passed' : 'missing' },
          { id: 'asset-debt', status: assetDebt ? 'blocked' : 'passed', count: assetDebt },
        ],
        nextAction: assetDebt ? 'route-to-owner' : 'done',
      };
      return {
        validation: {
          report: report,
          ownerRoute: report.nextAction === 'done' ? null : { owner: 'RuntimeAssetResolver', stage: 'asset-weave' },
        },
        graphTrace: appendTrace(state, 'runtime-validator', ['validation.report', 'validation.ownerRoute']),
      };
    })
    .addNode('project-world', function(state) {
      var world = projectWorld.buildProjectWorld(state.project, state.projectWorld.previous, {});
      var report = projectWorld.makeExecutionReport({
        previousWorld: state.projectWorld.previous,
        world: world,
        dslLines: state.bridge.bridgePlan.dslLines || [],
        commandResults: [
          { index: 0, commandId: 'runtime_smoke_001', ok: true, label: 'runtime smoke', message: 'ok' },
        ],
        runIndex: 1,
        batchLabel: 'project_weave_runtime_langgraph',
      });
      return {
        projectWorld: {
          world: world,
          sanitizedForLlm2: projectWorld.sanitizeProjectWorldForIntentPrompt(world),
        },
        executionLedger: {
          latest: report,
        },
        runtime: {
          executionReport: report,
        },
        graphTrace: appendTrace(state, 'project-world', ['projectWorld.world', 'projectWorld.sanitizedForLlm2', 'executionLedger.latest', 'runtime.executionReport']),
      };
    })
    .addNode('tick-playtest', function(state) {
      var report = semanticPlaytestAgent.runSemanticPlaytest({
        projectWorld: state.projectWorld.world,
        executionReport: state.runtime.executionReport,
        minRewardReachabilityRate: 0.9,
      });
      assert(report.tickReport.eventLog.some(function(event) { return event.type === 'RewardReached'; }), 'semantic playtest should produce reward events');
      assert.strictEqual(report.llmReport.audience, 'llm', 'semantic playtest should produce an LLM report');
      assert.strictEqual(report.userReport.audience, 'user', 'semantic playtest should produce a user report');
      return {
        tickPlaytest: {
          playPolicy: report.playPolicy,
          report: report,
          summary: report.summary,
          llmReport: report.llmReport,
          userReport: report.userReport,
          repairIntentDslText: report.repairIntentDslText,
        },
        graphTrace: appendTrace(state, 'tick-playtest', ['tickPlaytest.playPolicy', 'tickPlaytest.report', 'tickPlaytest.llmReport', 'tickPlaytest.userReport', 'tickPlaytest.repairIntentDslText', 'tickPlaytest.summary']),
      };
    })
    .addNode('semantic-feedback', function(state) {
      var report = semanticFeedback.analyzeSemanticFeedback({
        projectWorld: state.projectWorld.world,
        executionReport: state.runtime.executionReport,
        probeReport: {
          summary: state.tickPlaytest.llmReport.tickSummary,
          issues: state.tickPlaytest.llmReport.tickIssues,
        },
      });
      assert(report.repairIntentDslText.indexOf('x=') < 0, 'semantic feedback must not produce coordinate repairs');
      return {
        semanticFeedback: {
          report: report,
          repairIntentDslText: report.repairIntentDslText,
          semanticMappingView: report.input.semanticMapping,
          summary: report.summary,
        },
        graphTrace: appendTrace(state, 'semantic-feedback', ['semanticFeedback.report', 'semanticFeedback.repairIntentDslText', 'semanticFeedback.semanticMappingView', 'semanticFeedback.summary']),
      };
    })
    .addEdge(langGraph.START, 'runtime-linker')
    .addEdge('runtime-linker', 'html-export')
    .addEdge('html-export', 'runtime-validator')
    .addEdge('runtime-validator', 'project-world')
    .addEdge('project-world', 'tick-playtest')
    .addEdge('tick-playtest', 'semantic-feedback')
    .addEdge('semantic-feedback', langGraph.END)
    .compile();
}

async function main() {
  var langGraph = await langGraphRuntime.loadLangGraphPackage();
  var graph = await compileRuntimeGraph(langGraph);
  var result = await graph.invoke(createInitialState());
  assert.strictEqual(result.assembly.report.status, 'ready', 'runtime linker should be ready');
  assert(result.htmlExport.manifest.scriptFiles.indexOf('data.js') >= 0, 'html export should include data.js');
  assert.strictEqual(result.validation.report.status, 'passed', 'runtime validator should pass clean fixture');
  assert(result.projectWorld.world.semanticHash, 'project-world node should write semantic hash');
  assert.strictEqual(result.executionLedger.latest.summary.nextAction, 'done', 'execution report should be done');
  assert.deepStrictEqual(
    result.graphTrace.map(function(entry) { return entry.node; }),
    ['runtime-linker', 'html-export', 'runtime-validator', 'project-world', 'tick-playtest', 'semantic-feedback'],
    'runtime weave StateGraph trace should preserve assembly/validation/writeback/feedback order'
  );
  assert.strictEqual(result.tickPlaytest.llmReport.audience, 'llm', 'tick-playtest node should write LLM report');
  assert.strictEqual(result.tickPlaytest.userReport.audience, 'user', 'tick-playtest node should write user report');
  assert(result.tickPlaytest.report.tickReport.summary.rewardReachabilityRate < 0.9, 'tick playtest should report a measurable reward pacing issue');
  assert.strictEqual(result.semanticFeedback.summary.nextAction, 'repair-intent', 'semantic feedback node should emit repair intent when probe reports an issue');
  assert.strictEqual(result.semanticFeedback.semanticMappingView.view, 'llm-safe-semantic-mapping', 'semantic feedback node should expose shared semantic mapping view');
  assert(result.semanticFeedback.repairIntentDslText.indexOf('place coins near Player front as trail count') >= 0, 'semantic feedback node should produce natural repair intent from tick issue');
  var safeJson = JSON.stringify(result.projectWorld.sanitizedForLlm2);
  assert(safeJson.indexOf('"x"') < 0, 'LLM2 ProjectWorld summary must not expose x coordinates');
  assert(safeJson.indexOf('bridgePlan') < 0, 'LLM2 ProjectWorld summary must not expose bridge plan');
  console.log('[ProjectWeaveRuntimeLangGraph] runtime assembly/validation/writeback StateGraph passed');
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});
