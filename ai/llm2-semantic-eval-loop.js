var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var fullCreativeLoop = require('./full-creative-loop');
var llm2DecisionLoopRunner = require('./llm2-decision-loop-runner');

var LLM2_SEMANTIC_EVAL_SCHEMA_VERSION = 1;
var ROOT = path.join(__dirname, '..');
var OUTPUT_DIR = path.join(ROOT, 'output');

var DEFAULT_EVAL_CASES = [
  {
    id: 'coin_more_execute',
    userRequest: '金币多一点',
    kind: 'current_project',
    execute: true,
    projectMode: 'continue',
    batchLabel: 'llm2_semantic_eval_coin_more',
    expectedDecision: 'apply_intent',
  },
  {
    id: 'enemy_density_context',
    userRequest: '怪别太密',
    kind: 'synthetic_threat_context',
    execute: false,
    expectedFirstDecision: 'request_context',
    expectedDecision: 'apply_intent',
  },
  {
    id: 'death_too_fast_apply',
    userRequest: '玩家死太快',
    kind: 'synthetic_death_apply',
    execute: false,
    expectedDecision: 'apply_intent',
  },
  {
    id: 'ui_icon_reject',
    userRequest: '按钮换个酷炫图标',
    kind: 'synthetic_ui_reject',
    execute: false,
    expectedDecision: 'reject',
  },
  {
    id: 'button_move_reject',
    userRequest: '按钮往上一些',
    kind: 'synthetic_ui_reject',
    execute: false,
    expectedDecision: 'reject',
  },
  {
    id: 'look_again_noop',
    userRequest: '再看一下',
    kind: 'synthetic_stable_noop',
    execute: false,
    expectedDecision: 'no_op',
  },
  {
    id: 'route_readability_apply',
    userRequest: '这里不好躲',
    kind: 'synthetic_route_readability',
    execute: false,
    expectedDecision: 'apply_intent',
  },
  {
    id: 'content_density_apply',
    userRequest: '这个玩法节奏有点空',
    kind: 'synthetic_content_density',
    execute: false,
    expectedDecision: 'apply_intent',
  },
  {
    id: 'phase_feedback_apply',
    userRequest: '一波怪清完后给奖励',
    kind: 'synthetic_phase_feedback',
    execute: false,
    expectedFirstDecision: 'request_context',
    expectedDecision: 'apply_intent',
  },
  {
    id: 'remix_runner_apply',
    userRequest: '改得更像跑酷',
    kind: 'synthetic_remix_runner',
    execute: false,
    expectedDecision: 'apply_intent',
  },
  {
    id: 'remix_survivor_apply',
    userRequest: '改得更像割草',
    kind: 'synthetic_remix_survivor',
    execute: false,
    expectedDecision: 'apply_intent',
  },
];

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function writeJson(filePath, value) {
  writeText(filePath, JSON.stringify(value, null, 2));
}

function readJsonOutput(fileName) {
  return JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, fileName), 'utf8'));
}

function runNode(args, label) {
  var result = childProcess.spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(label + ' failed\nSTDOUT:\n' + result.stdout + '\nSTDERR:\n' + result.stderr);
  }
  return {
    label: label,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function makeBaseProject() {
  var createRequest = '做一个手机跑酷游戏，金币多一点，别太难';
  var createIntent = fullCreativeLoop.mockIntentSlotModel(
    fullCreativeLoop.mockCreativeModel(createRequest),
    createRequest
  );
  var createIntentPath = path.join(OUTPUT_DIR, 'llm2-semantic-eval-base.intent.dsl');
  writeText(createIntentPath, createIntent.intentDslText);
  return runNode([
    'ai/pipeline.js',
    '--intent-fixture-file',
    path.relative(ROOT, createIntentPath),
    '--batch-label',
    'llm2_semantic_eval_base',
  ], 'LLM2 Semantic Eval base project');
}

function makeView(options) {
  options = options || {};
  return {
    owner: 'IntentWorldView',
    contextCache: {
      baseSemanticHash: options.baseSemanticHash || 'semantic_eval_hash_a',
      targetSemanticHash: options.targetSemanticHash || 'semantic_eval_hash_a',
      semanticCacheHit: options.semanticCacheHit !== false,
      contextMode: options.contextMode || 'diff-only',
      diff: {
        latestIntentDslLines: options.latestIntentDslLines || ['place coins near Player front as trail count 5'],
        changedGameplayEvidence: options.evidence || [],
      },
    },
    evidence: options.evidence || [],
    sceneIntent: {
      gameplayFirst: true,
      sceneMode: 'single-scene',
      roles: [],
      uiPolicy: { role: 'supporting layer only' },
    },
    contextRequests: {
      defaultRead: options.defaultRead || (options.evidence && options.evidence.length ? ['tick_event_window', 'project_world_diff'] : ['project_world_diff']),
      available: [
        { id: 'tick_event_window' },
        { id: 'project_world_diff' },
        { id: 'snapshot_summary' },
        { id: 'ui_template_policy' },
      ],
    },
    semanticRepairRecommendations: options.actions || [],
    recommendationPolicy: {
      authority: 'semantic-repair-candidate-only',
      finalDecisionOwner: 'LLM2',
    },
  };
}

function makeTickReport(options) {
  options = options || {};
  var threatCount = Number(options.threatCount || 0);
  var eventLog = [
    { tick: 0, type: 'ActorSpawned', semantic: 'actor spawned', details: { actorPresent: true } },
    { tick: 1, type: 'ActorIntent', semantic: 'actor intent', details: { intent: 'move-forward' } },
  ];
  if (threatCount > 0) {
    eventLog.push({ tick: 220, type: 'PressureDetected', semantic: 'pressure detected', details: { subject: 'pressure', count: threatCount } });
  }
  if (options.damaged) {
    eventLog.push({ tick: 260, type: 'ActorDamaged', semantic: 'actor damaged', details: { subject: 'actor', source: 'pressure' } });
    eventLog.push({ tick: 300, type: 'ActorFailed', semantic: 'actor failed', details: { subject: 'actor' } });
  }
  return {
    eventLog: eventLog,
    snapshots: [
      { tick: 0, state: { player: 'ready', score: 0 }, metrics: { threatsSeen: threatCount } },
      { tick: 300, state: { player: options.damaged ? 'dead' : 'ready' }, metrics: { threatsSeen: threatCount, survived: !options.damaged } },
      { tick: 600, state: { player: options.damaged ? 'dead' : 'ready' }, metrics: { threatsSeen: threatCount, survived: !options.damaged } },
    ],
    summary: {
      durationTicks: 600,
      rewardsAvailable: Number(options.rewardsAvailable || 5),
      rewardsReached: Number(options.rewardsReached || 5),
      rewardReachabilityRate: Number(options.rewardReachabilityRate === undefined ? 1 : options.rewardReachabilityRate),
      firstDamageTick: options.damaged ? 260 : null,
      firstDeathTick: options.damaged ? 300 : null,
      survived: !options.damaged,
    },
  };
}

function caseInputs(testCase) {
  if (testCase.kind === 'synthetic_deepseek_coin_apply') {
    var coinTick = makeTickReport({ rewardReachabilityRate: 0.8, rewardsAvailable: 5, rewardsReached: 4 });
    return {
      intentWorldView: makeView({
        evidence: [],
        actions: [{
          action: 'apply_semantic_repair',
          experienceDimension: 'reward_pacing',
          gameplayRole: 'reward',
          repairVerb: 'increase_presence',
          priority: 'high',
          reason: 'request slot asks for more collectibles',
          safeIntentDsl: 'place coins near Player front as trail count 5',
        }],
      }),
      tickReport: coinTick,
      semanticPlaytestReport: { tickReport: coinTick },
    };
  }
  if (testCase.kind === 'synthetic_threat_context') {
    var threatTick = makeTickReport({ threatCount: 4, damaged: true, rewardReachabilityRate: 1 });
    return {
      intentWorldView: makeView({
        evidence: [{ tick: 220, issue: 'pressure_balance_high', meaning: 'pressure balance high' }],
        actions: [{
          action: 'apply_semantic_repair',
          experienceDimension: 'pressure_balance',
          gameplayRole: 'pressure',
          repairVerb: 'soften_pressure',
          priority: 'high',
          reason: 'enemy density high near the early route',
          safeIntentDsl: 'reduce enemy pressure near Player early route',
        }],
      }),
      tickReport: threatTick,
      semanticPlaytestReport: { tickReport: threatTick },
    };
  }
  if (testCase.kind === 'synthetic_death_apply') {
    var deathTick = makeTickReport({ threatCount: 3, damaged: true, rewardReachabilityRate: 0.8 });
    return {
      intentWorldView: makeView({
        semanticCacheHit: false,
        contextMode: 'summary-plus-diff',
        evidence: [{ tick: 300, issue: 'survival_window_short', meaning: 'survival window too short' }],
        actions: [{
          action: 'apply_semantic_repair',
          experienceDimension: 'survival_window',
          gameplayRole: 'actor',
          repairVerb: 'add_recovery_window',
          priority: 'high',
          reason: 'player death happened before survival target',
          safeIntentDsl: 'reduce enemy pressure near Player early route',
        }],
      }),
      tickReport: deathTick,
      semanticPlaytestReport: { tickReport: deathTick },
      hasStablePrefix: false,
    };
  }
  if (testCase.kind === 'synthetic_ui_reject') {
    var uiTick = makeTickReport({ rewardReachabilityRate: 1 });
    return {
      intentWorldView: makeView({ evidence: [] }),
      tickReport: uiTick,
      semanticPlaytestReport: { tickReport: uiTick },
    };
  }
  if (testCase.kind === 'synthetic_stable_noop') {
    var stableTick = makeTickReport({ rewardReachabilityRate: 1 });
    return {
      intentWorldView: makeView({ evidence: [] }),
      tickReport: stableTick,
      semanticPlaytestReport: { tickReport: stableTick },
    };
  }
  if (testCase.kind === 'synthetic_route_readability') {
    var routeTick = makeTickReport({ rewardReachabilityRate: 0.4, rewardsAvailable: 5, rewardsReached: 2 });
    return {
      intentWorldView: makeView({
        evidence: [{ tick: 180, issue: 'route_readability_low', meaning: 'route readability low' }],
        actions: [{
          action: 'apply_semantic_repair',
          experienceDimension: 'route_readability',
          gameplayRole: 'route',
          repairVerb: 'cluster_near_route',
          priority: 'high',
          reason: 'route lacks readable reward guidance',
          safeIntentDsl: 'place coins near Player front as trail count 5',
        }],
      }),
      tickReport: routeTick,
      semanticPlaytestReport: { tickReport: routeTick },
    };
  }
  if (testCase.kind === 'synthetic_content_density') {
    var densityTick = makeTickReport({ rewardReachabilityRate: 0.2, rewardsAvailable: 2, rewardsReached: 1 });
    return {
      intentWorldView: makeView({
        evidence: [{ tick: 240, issue: 'content_density_low', meaning: 'content density low' }],
        actions: [{
          action: 'apply_semantic_repair',
          experienceDimension: 'content_density',
          gameplayRole: 'reward',
          repairVerb: 'increase_presence',
          priority: 'high',
          reason: 'sampled window has too little meaningful content',
          safeIntentDsl: 'place coins near Player front as trail count 5',
        }],
      }),
      tickReport: densityTick,
      semanticPlaytestReport: { tickReport: densityTick },
    };
  }
  if (testCase.kind === 'synthetic_phase_feedback') {
    var phaseTick = makeTickReport({ rewardReachabilityRate: 0.8, rewardsAvailable: 5, rewardsReached: 4 });
    phaseTick.eventLog.push({ tick: 360, type: 'PhaseTransitioned', semantic: 'phase transitioned', details: { phase: 'wave_cleared' } });
    return {
      intentWorldView: makeView({
        evidence: [{ tick: 360, issue: 'phase_feedback_missing', meaning: 'phase feedback missing' }],
        actions: [{
          action: 'apply_semantic_repair',
          experienceDimension: 'phase_flow',
          gameplayRole: 'feedback',
          repairVerb: 'increase_feedback',
          requiresTickEvidence: true,
          priority: 'high',
          reason: 'phase transition lacks reward feedback',
          safeIntentDsl: 'place coins near Player front as trail count 4',
        }],
      }),
      tickReport: phaseTick,
      semanticPlaytestReport: { tickReport: phaseTick },
    };
  }
  if (testCase.kind === 'synthetic_remix_runner') {
    var remixTick = makeTickReport({ rewardReachabilityRate: 0.6, rewardsAvailable: 5, rewardsReached: 3 });
    return {
      intentWorldView: makeView({
        evidence: [{ tick: 120, issue: 'remix_style_shift', meaning: 'remix style shift requested' }],
        actions: [{
          action: 'apply_semantic_repair',
          experienceDimension: 'remix_style',
          gameplayRole: 'route',
          repairVerb: 'cluster_near_route',
          priority: 'high',
          reason: 'runner remix should prioritize readable route rewards before visuals',
          safeIntentDsl: 'place coins near Player front as trail count 5',
        }],
      }),
      tickReport: remixTick,
      semanticPlaytestReport: { tickReport: remixTick },
    };
  }
  if (testCase.kind === 'synthetic_remix_survivor') {
    var survivorTick = makeTickReport({ threatCount: 3, damaged: false, rewardReachabilityRate: 0.6, rewardsAvailable: 5, rewardsReached: 3 });
    return {
      intentWorldView: makeView({
        evidence: [{ tick: 120, issue: 'remix_style_shift', meaning: 'remix style shift requested' }],
        actions: [{
          action: 'apply_semantic_repair',
          experienceDimension: 'remix_style',
          gameplayRole: 'pressure',
          repairVerb: 'soften_pressure',
          priority: 'high',
          reason: 'survivor remix should tune pressure as gameplay before visuals',
          safeIntentDsl: 'reduce enemy pressure near Player early route',
        }],
      }),
      tickReport: survivorTick,
      semanticPlaytestReport: { tickReport: survivorTick },
    };
  }
  return {};
}

function extractContextIds(providedContext) {
  return Object.keys(((providedContext || {}).contexts) || {}).sort();
}

function tickSummaryFrom(reportSection) {
  return reportSection && reportSection.semanticSummary ? clone(reportSection.semanticSummary) : null;
}

function relativeOutput(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function summarizeCase(testCase, loopReport, transcriptPath) {
  var providerTrace = loopReport.decisionProviderTrace || [];
  var lastProvider = providerTrace.length ? providerTrace[providerTrace.length - 1] : null;
  return {
    id: testCase.id,
    userRequest: testCase.userRequest,
    expectedDecision: testCase.expectedDecision || null,
    expectedFirstDecision: testCase.expectedFirstDecision || null,
    firstDecisionType: loopReport.firstDecision.decisionType,
    finalDecisionType: loopReport.finalDecision.decisionType,
    contextRequested: loopReport.summary.contextRequested,
    providedContextIds: extractContextIds(loopReport.providedContext),
    contextRouteMode: loopReport.contextRoute.contextMode,
    cacheRisk: loopReport.contextRoute.estimatedCacheRisk,
    verifierPassed: !!(loopReport.finalDecision.verifier && loopReport.finalDecision.verifier.passed),
    provider: lastProvider ? lastProvider.owner : null,
    providerTraceCount: providerTrace.length,
    cacheGatePassed: loopReport.summary.cacheGatePassed,
    cacheHitRate: loopReport.summary.cacheHitRate,
    proofApplied: !!(loopReport.finalDecision.proof && loopReport.finalDecision.proof.applied),
    rawDecisionType: loopReport.finalDecision.proof ? loopReport.finalDecision.proof.rawDecisionType : null,
    executed: loopReport.summary.executed,
    skippedReason: loopReport.summary.skippedReason,
    intentDslText: loopReport.intentDslText,
    before: {
      tickSummary: tickSummaryFrom(loopReport.before),
    },
    after: {
      tickSummary: tickSummaryFrom(loopReport.after),
    },
    improved: loopReport.summary.improved,
    improvementComparison: clone(loopReport.improvementComparison || null),
    transcriptPath: relativeOutput(transcriptPath),
  };
}

function validateCase(testCase, caseSummary) {
  var failures = [];
  if (testCase.expectedFirstDecision && caseSummary.firstDecisionType !== testCase.expectedFirstDecision) {
    failures.push('expected first decision ' + testCase.expectedFirstDecision + ' but got ' + caseSummary.firstDecisionType);
  }
  if (testCase.expectedDecision && caseSummary.finalDecisionType !== testCase.expectedDecision) {
    failures.push('expected final decision ' + testCase.expectedDecision + ' but got ' + caseSummary.finalDecisionType);
  }
  if (!caseSummary.verifierPassed) failures.push('decision verifier did not pass');
  if (testCase.execute && !caseSummary.executed) failures.push('expected pipeline execution');
  if (testCase.execute && caseSummary.finalDecisionType === 'apply_intent' && caseSummary.executed) {
    var comparison = caseSummary.improvementComparison || {};
    if (comparison.view !== 'semantic-tick-improvement-comparison') {
      failures.push('executed apply_intent did not produce semantic improvement comparison');
    }
    if (comparison.regressed) {
      failures.push('executed apply_intent regressed semantic gameplay measurements');
    }
    if (!comparison.improved) {
      failures.push('executed apply_intent did not improve semantic gameplay measurements');
    }
  }
  if (testCase.decisionProvider === 'deepseek' || testCase.expectProvider === 'deepseek') {
    if (caseSummary.provider !== 'LLM2DeepSeekDecisionProvider') failures.push('expected DeepSeek provider trace');
    if (caseSummary.cacheGatePassed !== true) failures.push('expected DeepSeek cache gate to pass');
  }
  return failures;
}

function writeTranscript(testCase, loopReport, transcriptDir) {
  var transcriptPath = path.join(transcriptDir, testCase.id + '.json');
  var transcript = {
    schemaVersion: LLM2_SEMANTIC_EVAL_SCHEMA_VERSION,
    owner: 'LLM2SemanticEvalLoop',
    case: {
      id: testCase.id,
      userRequest: testCase.userRequest,
      kind: testCase.kind,
      execute: testCase.execute !== false,
    },
    route: loopReport.contextRoute,
    firstDecision: loopReport.firstDecision,
    providedContext: loopReport.providedContext,
    finalDecision: loopReport.finalDecision,
    decisionProviderTrace: loopReport.decisionProviderTrace || [],
    intentDslText: loopReport.intentDslText,
    execution: loopReport.execution,
    before: loopReport.before,
    after: loopReport.after,
    improvementComparison: loopReport.improvementComparison || null,
    summary: loopReport.summary,
  };
  writeJson(transcriptPath, transcript);
  return transcriptPath;
}

function runEvalCase(testCase, options) {
  var prefix = (options.outputPrefix || 'llm2-semantic-eval') + '-' + testCase.id;
  var inputs = caseInputs(testCase);
  var loopReport = llm2DecisionLoopRunner.runDecisionLoop(Object.assign({}, inputs, {
    userRequest: testCase.userRequest,
    projectMode: testCase.projectMode || 'continue',
    execute: testCase.execute !== false,
    hasStablePrefix: inputs.hasStablePrefix,
    batchLabel: testCase.batchLabel || ('llm2_semantic_eval_' + testCase.id),
    outputs: {
      report: prefix + '-decision-report.json',
      intentDsl: prefix + '.intent.dsl',
      contextRoute: prefix + '-context-route.json',
      providedContext: prefix + '-provided-context.json',
    },
  }));
  var transcriptPath = writeTranscript(testCase, loopReport, options.transcriptDir);
  var summary = summarizeCase(testCase, loopReport, transcriptPath);
  summary.failures = validateCase(testCase, summary);
  return summary;
}

function resolveCaseCacheHitThreshold(testCase, options) {
  if (testCase.cacheHitThreshold !== undefined) return testCase.cacheHitThreshold;
  if (options.cacheHitThreshold !== undefined) return options.cacheHitThreshold;
  return 0.9;
}

async function runEvalCaseAsync(testCase, options) {
  var prefix = (options.outputPrefix || 'llm2-semantic-eval') + '-' + testCase.id;
  var inputs = caseInputs(testCase);
  var providerName = testCase.decisionProvider || options.decisionProvider;
  var loopReport = await llm2DecisionLoopRunner.runDecisionLoopAsync(Object.assign({}, inputs, {
    userRequest: testCase.userRequest,
    projectMode: testCase.projectMode || 'continue',
    execute: testCase.execute !== false,
    hasStablePrefix: inputs.hasStablePrefix,
    decisionProvider: providerName,
    cacheHitThreshold: resolveCaseCacheHitThreshold(testCase, options),
    deepseekDecisionProvider: options.deepseekDecisionProvider,
    endpoint: options.endpoint,
    apiKey: options.apiKey,
    model: options.model,
    fetchImpl: options.fetchImpl,
    batchLabel: testCase.batchLabel || ('llm2_semantic_eval_' + testCase.id),
    outputs: {
      report: prefix + '-decision-report.json',
      intentDsl: prefix + '.intent.dsl',
      contextRoute: prefix + '-context-route.json',
      providedContext: prefix + '-provided-context.json',
    },
  }));
  var transcriptPath = writeTranscript(testCase, loopReport, options.transcriptDir);
  var summary = summarizeCase(testCase, loopReport, transcriptPath);
  summary.failures = validateCase(Object.assign({}, testCase, {
    decisionProvider: providerName,
    expectProvider: providerName,
  }), summary);
  return summary;
}

function unique(values) {
  var lookup = {};
  values.forEach(function(value) {
    if (value) lookup[value] = true;
  });
  return Object.keys(lookup).sort();
}

function buildSummary(cases) {
  return {
    passed: cases.filter(function(item) { return item.failures.length === 0; }).length,
    failed: cases.filter(function(item) { return item.failures.length > 0; }).length,
    applyIntent: cases.filter(function(item) { return item.finalDecisionType === 'apply_intent'; }).length,
    requestContext: cases.filter(function(item) { return item.contextRequested; }).length,
    reject: cases.filter(function(item) { return item.finalDecisionType === 'reject'; }).length,
    noOp: cases.filter(function(item) { return item.finalDecisionType === 'no_op'; }).length,
    executed: cases.filter(function(item) { return item.executed; }).length,
    cacheModes: unique(cases.map(function(item) { return item.contextRouteMode; })),
    provider: unique(cases.map(function(item) { return item.provider; })).filter(Boolean)[0] || null,
    cacheGatePassed: cases.some(function(item) { return item.cacheGatePassed !== null; })
      ? cases.every(function(item) { return item.cacheGatePassed === null || item.cacheGatePassed === true; })
      : null,
    cacheHitRate: (function() {
      var rates = cases.filter(function(item) { return typeof item.cacheHitRate === 'number'; }).map(function(item) { return item.cacheHitRate; });
      if (!rates.length) return null;
      return Number((rates.reduce(function(sum, value) { return sum + value; }, 0) / rates.length).toFixed(4));
    })(),
  };
}

function writeHumanSummary(report, filePath) {
  var lines = [
    'LLM2 Semantic Eval Loop',
    'cases: ' + report.scenarioCount,
    'passed: ' + report.summary.passed,
    'failed: ' + report.summary.failed,
    'apply_intent: ' + report.summary.applyIntent,
    'request_context: ' + report.summary.requestContext,
    'reject: ' + report.summary.reject,
    'no_op: ' + report.summary.noOp,
    'executed: ' + report.summary.executed,
    'cacheModes: ' + report.summary.cacheModes.join(', '),
  ];
  report.cases.forEach(function(item) {
    var improvedMeasurements = ((item.improvementComparison || {}).measurements || [])
      .filter(function(measurement) { return measurement.status === 'improved'; })
      .map(function(measurement) { return measurement.measurement; });
    lines.push(item.id + ': ' + item.firstDecisionType + ' -> ' + item.finalDecisionType + ', executed=' + item.executed + ', route=' + item.contextRouteMode + ', provider=' + (item.provider || 'mock') + ', cache=' + (item.cacheHitRate === null ? 'n/a' : item.cacheHitRate) + ', improvedMeasurements=' + (improvedMeasurements.length ? improvedMeasurements.join('|') : 'n/a'));
  });
  writeText(filePath, lines.join('\n') + '\n');
}

function runSemanticEvalLoop(options) {
  options = options || {};
  ensureOutputDir();
  var outputPrefix = options.outputPrefix || 'llm2-semantic-eval';
  var transcriptDir = path.join(OUTPUT_DIR, outputPrefix + '-transcripts');
  fs.mkdirSync(transcriptDir, { recursive: true });

  var cases = options.cases || DEFAULT_EVAL_CASES;
  var needsCurrentProject = cases.some(function(testCase) {
    return testCase.kind === 'current_project';
  });
  var setup = needsCurrentProject ? makeBaseProject() : null;
  var results = cases.map(function(testCase) {
    return runEvalCase(testCase, {
      outputPrefix: outputPrefix,
      transcriptDir: transcriptDir,
    });
  });
  var report = {
    schemaVersion: LLM2_SEMANTIC_EVAL_SCHEMA_VERSION,
    owner: 'LLM2SemanticEvalLoop',
    mode: 'deterministic-semantic-eval-loop',
    scenarioCount: results.length,
    setup: setup ? { command: setup.label } : null,
    cases: results,
    summary: buildSummary(results),
  };
  writeJson(path.join(OUTPUT_DIR, outputPrefix + '-report.json'), report);
  writeHumanSummary(report, path.join(OUTPUT_DIR, outputPrefix + '-summary.txt'));
  if (report.summary.failed > 0) {
    throw new Error('LLM2 Semantic Eval Loop failed cases: ' + results.filter(function(item) {
      return item.failures.length > 0;
    }).map(function(item) {
      return item.id + ' [' + item.failures.join('; ') + ']';
    }).join(', '));
  }
  return report;
}

async function runSemanticEvalLoopAsync(options) {
  options = options || {};
  ensureOutputDir();
  var outputPrefix = options.outputPrefix || 'llm2-semantic-eval';
  var transcriptDir = path.join(OUTPUT_DIR, outputPrefix + '-transcripts');
  fs.mkdirSync(transcriptDir, { recursive: true });

  var cases = options.cases || DEFAULT_EVAL_CASES;
  var needsCurrentProject = cases.some(function(testCase) {
    return testCase.kind === 'current_project';
  });
  var setup = needsCurrentProject ? makeBaseProject() : null;
  var results = [];
  for (var i = 0; i < cases.length; i++) {
    results.push(await runEvalCaseAsync(cases[i], {
      outputPrefix: outputPrefix,
      transcriptDir: transcriptDir,
      decisionProvider: options.decisionProvider,
      cacheHitThreshold: options.cacheHitThreshold === undefined ? 0.9 : options.cacheHitThreshold,
      deepseekDecisionProvider: options.deepseekDecisionProvider,
      endpoint: options.endpoint,
      apiKey: options.apiKey,
      model: options.model,
      fetchImpl: options.fetchImpl,
    }));
  }
  var report = {
    schemaVersion: LLM2_SEMANTIC_EVAL_SCHEMA_VERSION,
    owner: 'LLM2SemanticEvalLoop',
    mode: options.decisionProvider === 'deepseek' ? 'deepseek-semantic-eval-loop' : 'deterministic-semantic-eval-loop',
    scenarioCount: results.length,
    setup: setup ? { command: setup.label } : null,
    cases: results,
    summary: buildSummary(results),
  };
  writeJson(path.join(OUTPUT_DIR, outputPrefix + '-report.json'), report);
  writeHumanSummary(report, path.join(OUTPUT_DIR, outputPrefix + '-summary.txt'));
  if (report.summary.failed > 0) {
    throw new Error('LLM2 Semantic Eval Loop failed cases: ' + results.filter(function(item) {
      return item.failures.length > 0;
    }).map(function(item) {
      return item.id + ' [' + item.failures.join('; ') + ']';
    }).join(', '));
  }
  return report;
}

function main() {
  var report = runSemanticEvalLoop();
  console.log('[LLM2SemanticEvalLoop] cases=' + report.scenarioCount + ' passed=' + report.summary.passed + ' executed=' + report.summary.executed);
}

if (require.main === module) {
  main();
}

module.exports = {
  LLM2_SEMANTIC_EVAL_SCHEMA_VERSION: LLM2_SEMANTIC_EVAL_SCHEMA_VERSION,
  DEFAULT_EVAL_CASES: DEFAULT_EVAL_CASES,
  runSemanticEvalLoop: runSemanticEvalLoop,
  runSemanticEvalLoopAsync: runSemanticEvalLoopAsync,
};
