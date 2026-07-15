var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var dictionary = require('./capability-semantic-dictionary');
var sourceContract = require('./game-semantic-source');
var providerRuntimeApi = require('./provider-runtime');
var semanticRuntimeApi = require('./semantic-llm2-runtime');
var assetPipeline = require('./semantic-asset-product-pipeline');
var spatialPipeline = require('./spatial-product-pipeline');
var browserCapture = require('./gdjs-browser-capture');
var assemblyReviewer = require('./assembly-reviewer');
var assemblyReviewProvider = require('./assembly-review-provider-port');
var deliveryRunApi = require('./product-delivery-run');
var classifier = require('./product-failure-classifier');
var feedbackBuilder = require('./product-feedback-builder');
var assetCards = require('./asset-card-projector');

var INPUT_FIELDS = ['deliveryId', 'projectId', 'source', 'userRequest', 'creativeVision'];
var SEMANTIC_SETTING_FIELDS = ['estimatedCost', 'timeoutMs', 'maxTokens'];

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function fail(code, message, owner) { var error = new Error(message); error.code = code; error.owner = owner || 'ProductDeliveryOrchestrator'; return error; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) throw fail('PRODUCT_DELIVERY_INPUT_INVALID', label + ' must be non-empty text.'); return value.trim(); }
function identifier(value, label) { value = text(value, label); if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) throw fail('PRODUCT_DELIVERY_INPUT_INVALID', label + ' must be a filesystem-safe product identifier.'); return value; }
function allowed(value, fields, label) { Object.keys(value || {}).forEach(function(field) { if (fields.indexOf(field) < 0) throw fail('PRODUCT_DELIVERY_INPUT_INVALID', label + ' contains unsupported field: ' + field); }); }
function attemptOf(run, stage) { return run.usage.stageAttempts[(run.currentSourceHash || 'source-pending') + '/' + stage] || 0; }
function revisionHash(revision) { return revision ? 'semantic-revision.' + digest(revision) : null; }
function providerSafeId(value) { return String(value || '').replace(/[^A-Za-z0-9_.-]/g, '_'); }
function providerSnapshot(runtime, requestNamespace) {
  if (!runtime || typeof runtime.listReceipts !== 'function') return { settled: 0, ids: [] };
  var prefix = providerSafeId(requestNamespace + ':'), receipts = runtime.listReceipts().filter(function(receipt) { return typeof receipt.requestId === 'string' && receipt.requestId.indexOf(prefix) === 0; }), settled = 0;
  receipts.forEach(function(receipt) { settled += Number(receipt && receipt.cost && receipt.cost.settled || 0); });
  return { settled: settled, ids: receipts.map(function(receipt) { return receipt.receiptId; }).filter(Boolean).sort() };
}
function assertInside(root, target, label) {
  root = path.resolve(root); target = path.resolve(target);
  if (target !== root && target.indexOf(root + path.sep) !== 0) throw fail('PRODUCT_DELIVERY_PATH_INVALID', label + ' escaped the product storage root.');
  return target;
}
function atomicJson(file, value) {
  var temporary = file + '.tmp.' + process.pid + '.' + crypto.randomBytes(8).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', flag: 'wx' }); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true }); }
}

function create(options) {
  options = options || {};
  var storageRoot = path.resolve(options.storageRoot || path.join(__dirname, '..', 'output', 'product-deliveries'));
  var index = options.index || dictionary.loadIndex();
  var budgets = clone(options.budgets || deliveryRunApi.contract.defaultBudgets);
  var semanticSettings = Object.assign({}, options.semanticSettings || {});
  allowed(semanticSettings, SEMANTIC_SETTING_FIELDS, 'semanticSettings');
  var providerOptions = Object.assign({}, options.providerOptions || {});
  providerOptions.receiptDir = assertInside(storageRoot, path.join(storageRoot, 'provider-receipts'), 'provider receipt directory');
  var providerRuntime = options.providerRuntime || providerRuntimeApi.createProviderRuntime(providerOptions);
  var semanticRuntime = options.semanticRuntime || semanticRuntimeApi.create({ providerRuntime: providerRuntime });
  var assetProductPipeline = options.assetPipeline || assetPipeline;
  var spatialProductPipeline = options.spatialPipeline || spatialPipeline;
  var reviewerPort = options.assemblyReviewerPort || (options.assemblyReviewer ? null : assemblyReviewProvider.create(providerRuntime, options.assemblyReviewerOptions || {}));
  var captureProducer = options.browserCapture || browserCapture.create(options.browserCaptureOptions || {});
  var reviewer = options.assemblyReviewer || assemblyReviewer.create({ captureVerifier: captureProducer.verifyAttestation, reviewerPort: reviewerPort });
  var assetEngineBase = Object.assign({}, options.assetEngineOptions || {});
  var spatialBase = Object.assign({}, options.spatialOptions || {});
  if (Object.prototype.hasOwnProperty.call(assetEngineBase, 'previousAssetWorld')) throw fail('PRODUCT_DELIVERY_STALE_ASSET_WORLD_FORBIDDEN', 'Product composition cannot configure a previous AssetWorld.');

  function pathsFor(projectId, deliveryId) {
    var deliveryRoot = assertInside(storageRoot, path.join(storageRoot, projectId, deliveryId), 'delivery root');
    return {
      root: deliveryRoot,
      run: assertInside(deliveryRoot, path.join(deliveryRoot, 'product-delivery-run.json'), 'delivery run'),
      assets: assertInside(deliveryRoot, path.join(deliveryRoot, 'assets'), 'asset directory'),
      preview: assertInside(deliveryRoot, path.join(deliveryRoot, 'preview'), 'preview directory'),
      trace: assertInside(deliveryRoot, path.join(deliveryRoot, 'trace'), 'trace directory'),
      browser: assertInside(deliveryRoot, path.join(deliveryRoot, 'browser'), 'browser evidence directory'),
      sources: assertInside(deliveryRoot, path.join(deliveryRoot, 'sources'), 'source directory')
    };
  }
  function sourceFile(paths, sourceHash) { return assertInside(paths.sources, path.join(paths.sources, digest(sourceHash) + '.json'), 'source document'); }
  function storeSource(paths, source) {
    source = sourceContract.validateSource(source, { index: index });
    var sourceHash = sourceContract.sourceHash(source), file = sourceFile(paths, sourceHash);
    if (fs.existsSync(file)) {
      var existing = sourceContract.validateSource(JSON.parse(fs.readFileSync(file, 'utf8')), { index: index });
      if (sourceContract.sourceHash(existing) !== sourceHash || JSON.stringify(stable(existing)) !== JSON.stringify(stable(source))) throw fail('PRODUCT_DELIVERY_SOURCE_STORE_CONFLICT', 'Stored Source bytes do not match their sourceHash.');
      return source;
    }
    atomicJson(file, source);
    return source;
  }
  function loadSource(paths, sourceHash) {
    var file = sourceFile(paths, sourceHash);
    if (!fs.existsSync(file)) throw fail('PRODUCT_DELIVERY_SOURCE_MISSING', 'The active Source document is missing from product-owned storage.');
    var source = sourceContract.validateSource(JSON.parse(fs.readFileSync(file, 'utf8')), { index: index });
    if (sourceContract.sourceHash(source) !== sourceHash) throw fail('PRODUCT_DELIVERY_SOURCE_STORE_CONFLICT', 'Stored Source does not match ProductDeliveryRun.currentSourceHash.');
    return source;
  }

  async function execute(input, deliveryId, projectId, paths) {
    var requestNamespace = 'product.' + digest({ deliveryId: deliveryId, projectId: projectId });
    var suppliedSource = input.source ? sourceContract.validateSource(input.source, { index: index }) : null;
    if (suppliedSource) storeSource(paths, suppliedSource);
    var runState = deliveryRunApi.open({ file: paths.run, deliveryId: deliveryId, projectId: projectId, sourceHash: suppliedSource ? sourceContract.sourceHash(suppliedSource) : null, budgets: budgets });
    if (runState.status === 'accepted' || runState.status === 'blocked') { var terminal = fail('PRODUCT_DELIVERY_TERMINAL', 'Product delivery run is already terminal: ' + runState.status); terminal.deliveryRun = clone(runState); throw terminal; }
    var source = suppliedSource || (runState.currentSourceHash ? loadSource(paths, runState.currentSourceHash) : null);
    if (source && runState.currentSourceHash !== sourceContract.sourceHash(source)) { var mismatch = fail('PRODUCT_DELIVERY_SOURCE_RESUME_MISMATCH', 'The supplied Source does not equal the persisted active sourceHash.'); mismatch.deliveryRun = clone(runState); throw mismatch; }
    if (runState.status !== 'semantic-ready') runState = deliveryRunApi.write(paths.run, deliveryRunApi.recover(runState));
    var providerAtStart = providerSnapshot(providerRuntime, requestNamespace), costAtStart = runState.usage.settledCostUsd;
    var assetProduct = null, spatialProduct = null, capture = null, review = null, cards = null;

    function persist(next) { runState = deliveryRunApi.write(paths.run, next); return runState; }
    function block(issue, cause) {
      issue = issue || { code: cause && cause.code || 'PRODUCT_DELIVERY_BLOCKED', owner: cause && cause.owner || 'ProductDeliveryOrchestrator', message: cause && cause.message || 'Product delivery is blocked.', stage: null, evidenceHash: null };
      runState = persist(deliveryRunApi.block(runState, issue));
      var error = fail('PRODUCT_DELIVERY_BLOCKED', issue.message, 'ProductDeliveryOrchestrator');
      error.issue = clone(issue); error.deliveryRun = clone(runState); error.cause = cause || null;
      error.partial = { source: clone(source), assetProduct: clone(assetProduct), spatialProduct: clone(spatialProduct), browserCapture: clone(capture), assemblyReview: clone(review), assetCards: clone(cards) };
      throw error;
    }
    function settleCost(stage) {
      var current = providerSnapshot(providerRuntime, requestNamespace), settled = costAtStart + Math.max(0, current.settled - providerAtStart.settled);
      if (settled === runState.usage.settledCostUsd) return;
      try { runState = persist(deliveryRunApi.recordCost(runState, settled, current.ids.filter(function(id) { return providerAtStart.ids.indexOf(id) < 0; }))); }
      catch (error) {
        if (error.deliveryRun) runState = persist(error.deliveryRun);
        block({ code: error.code, owner: error.owner, message: error.message, stage: stage || null, evidenceHash: null }, error);
      }
    }
    function beginStage(stage) {
      try { runState = persist(deliveryRunApi.beginStage(runState, stage)); }
      catch (error) { block({ code: error.code, owner: error.owner, message: error.message, stage: stage, evidenceHash: null }, error); }
      return attemptOf(runState, stage);
    }
    function recordSemanticIssues(issues) {
      for (var issueIndex = 0; issueIndex < issues.length; issueIndex++) {
        var issue = issues[issueIndex], observed = deliveryRunApi.recordObservation(runState, issue);
        runState = persist(observed.run);
        if (observed.fused) block({ code: 'PRODUCT_DELIVERY_OBSERVATION_FUSED', owner: 'ProductDeliveryRun', message: 'The same product observation repeated without convergence.', stage: issue.stage, evidenceHash: issue.evidenceHash }, null);
      }
    }

    if (providerAtStart.settled > costAtStart) {
      try { runState = persist(deliveryRunApi.recordCost(runState, providerAtStart.settled, providerAtStart.ids)); costAtStart = runState.usage.settledCostUsd; }
      catch (error) {
        if (error.deliveryRun) runState = persist(error.deliveryRun);
        block({ code: error.code, owner: error.owner, message: error.message, stage: 'semantic', evidenceHash: null }, error);
      }
    }

    if (!source) {
      var initialSemanticAttempt = beginStage('semantic');
      var initial;
      try { initial = await semanticRuntime.invoke({ requestId: requestNamespace + ':semantic:initial:attempt-' + initialSemanticAttempt, projectId: projectId, estimatedCost: semanticSettings.estimatedCost, timeoutMs: semanticSettings.timeoutMs, maxTokens: semanticSettings.maxTokens, userRequest: text(input.userRequest, 'userRequest'), creativeVision: input.creativeVision || '', onSemanticEvent: options.onSemanticEvent, index: index }); }
      catch (error) { settleCost('semantic'); block({ code: error.code || 'SEMANTIC_INITIAL_DESIGN_FAILED', owner: error.owner || 'SemanticLLM2Runtime', message: error.message, stage: 'semantic', evidenceHash: null }, error); }
      settleCost('semantic');
      if (!initial || initial.ok !== true || !initial.document || !initial.document.source) block({ code: initial && initial.debt && initial.debt.code || 'SEMANTIC_INITIAL_DESIGN_FAILED', owner: 'SemanticLLM2Runtime', message: 'LLM2 did not produce a validated initial GameSemanticSource.', stage: 'semantic', evidenceHash: null }, null);
      source = storeSource(paths, initial.document.source);
      try { runState = persist(deliveryRunApi.startSource(runState, sourceContract.sourceHash(source), revisionHash(initial.document.revision))); }
      catch (error) { block({ code: error.code, owner: error.owner, message: error.message, stage: 'semantic', evidenceHash: null }, error); }
    }

    while (true) {
      var semanticIssues = null;
      while (true) {
        var assetAttempt = beginStage('asset');
        try {
          var assetEngineOptions = Object.assign({}, assetEngineBase);
          if (!assetEngineOptions.providerRuntime && !assetEngineOptions.ports) assetEngineOptions.providerRuntime = providerRuntime;
          assetEngineOptions.ledgerPath = path.join(paths.root, 'asset-production-' + sourceContract.sourceHash(source).slice(-24) + '.json');
          assetProduct = await assetProductPipeline.run({ runId: requestNamespace + ':asset:' + sourceContract.sourceHash(source).slice(-24) + ':attempt-' + assetAttempt, projectId: projectId, source: source, index: index, projectAssetDir: paths.assets, assetEngine: assetEngineOptions });
          settleCost('asset');
          runState = persist(deliveryRunApi.recordArtifacts(runState, 'asset', { assetWorldHash: assetProduct.assetState.assetWorld.contentHash, assetBoundSeedHash: assetProduct.artifact.contentHash }));
          cards = assetCards.project({ source: source, assembly: assetProduct.assembly, assetState: assetProduct.assetState, deliveryRun: runState, index: index });
          break;
        } catch (error) {
          if (error.code === 'PRODUCT_DELIVERY_BLOCKED') throw error;
          settleCost('asset');
          var assetCanRetry = assetAttempt < runState.budgets.stageAttemptsPerSource.asset;
          var assetDecision = classifier.classify('asset', error, { attempt: assetAttempt, canRetry: assetCanRetry, source: source });
          if (assetDecision.route === 'retry-stage') continue;
          if (assetDecision.route === 'semantic-revision') { semanticIssues = assetDecision.issues || [assetDecision.issue]; break; }
          block(assetDecision.issue, error);
        }
      }

      if (!semanticIssues) {
        while (true) {
          var spatialAttempt = beginStage('spatial');
          try {
            var spatialOptions = Object.assign({}, spatialBase);
            if (!spatialOptions.providerRuntime && !spatialOptions.plannerPort) spatialOptions.providerRuntime = providerRuntime;
            Object.assign(spatialOptions, { runId: requestNamespace + ':spatial:' + sourceContract.sourceHash(source).slice(-24) + ':attempt-' + spatialAttempt, projectId: projectId, assetProduct: assetProduct, previewDir: paths.preview, traceDir: paths.trace, maxRounds: deliveryRunApi.contract.stagePolicy.spatialMaxRounds, maxTokens: deliveryRunApi.contract.stagePolicy.spatialMaxTokens });
            spatialProduct = await spatialProductPipeline.run(spatialOptions);
            settleCost('spatial');
            runState = persist(deliveryRunApi.recordArtifacts(runState, 'spatial', { geometryFactSetHash: spatialProduct.geometryFacts.contentHash, spatialResolutionHash: spatialProduct.resolution.contentHash, finalProjectionHash: spatialProduct.acceptedProjection.contentHash }));
            break;
          } catch (error) {
            if (error.code === 'PRODUCT_DELIVERY_BLOCKED') throw error;
            settleCost('spatial');
            var spatialCanRetry = spatialAttempt < runState.budgets.stageAttemptsPerSource.spatial;
            var spatialDecision = classifier.classify('spatial', error, { attempt: spatialAttempt, canRetry: spatialCanRetry, source: source });
            if (spatialDecision.route === 'retry-stage') continue;
            if (spatialDecision.route === 'semantic-revision') { semanticIssues = spatialDecision.issues || [spatialDecision.issue]; break; }
            block(spatialDecision.issue, error);
          }
        }
      }

      if (!semanticIssues) {
        var assemblyAttempt = beginStage('assembly');
        try {
          capture = await captureProducer.capture({ assetProduct: assetProduct, spatialProduct: spatialProduct, outputDir: paths.browser });
          runState = persist(deliveryRunApi.recordArtifacts(runState, 'assembly', { browserCaptureHash: capture.contentHash }));
          review = await reviewer.review({ requestNamespace: requestNamespace + ':assembly-attempt-' + assemblyAttempt, projectId: projectId, assetProduct: assetProduct, spatialProduct: spatialProduct, browserEvidence: capture, assetCards: cards });
          settleCost('assembly');
          runState = persist(deliveryRunApi.recordArtifacts(runState, 'assembly', { assemblyReviewHash: review.contentHash }));
        } catch (error) {
          if (error.code === 'PRODUCT_DELIVERY_BLOCKED') throw error;
          settleCost('assembly');
          var assemblyDecision = classifier.classify('assembly', error, { attempt: assemblyAttempt, canRetry: false, source: source });
          if (assemblyDecision.route === 'semantic-revision') semanticIssues = assemblyDecision.issues || [assemblyDecision.issue];
          else block(assemblyDecision.issue, error);
        }
      }

      if (!semanticIssues) {
        try { runState = persist(deliveryRunApi.accept(runState)); }
        catch (error) { block({ code: error.code, owner: error.owner, message: error.message, stage: 'assembly', evidenceHash: null }, error); }
        var product = { schemaVersion: 1, documentKind: 'product-delivery-product', deliveryId: deliveryId, projectId: projectId, sourceHash: sourceContract.sourceHash(source), source: clone(source), assetProduct: clone(assetProduct), spatialProduct: clone(spatialProduct), browserCapture: clone(capture), assemblyReview: clone(review), assetCards: clone(cards), deliveryRun: clone(runState) };
        product.contentHash = 'product-delivery-product.' + digest({ deliveryId: deliveryId, projectId: projectId, sourceHash: product.sourceHash, assetWorldHash: runState.artifacts.assetWorldHash, spatialResolutionHash: runState.artifacts.spatialResolutionHash, finalProjectionHash: runState.artifacts.finalProjectionHash, browserCaptureHash: runState.artifacts.browserCaptureHash, assemblyReviewHash: runState.artifacts.assemblyReviewHash, deliveryRunHash: runState.contentHash });
        return product;
      }

      recordSemanticIssues(semanticIssues);
      var repair;
      try { repair = feedbackBuilder.build({ source: source, issues: semanticIssues, semanticCycle: runState.semanticCycle, index: index }); }
      catch (error) { block({ code: error.code || 'PRODUCT_FEEDBACK_BUILD_FAILED', owner: error.owner || 'ProductFeedbackBuilder', message: error.message, stage: 'semantic', evidenceHash: semanticIssues[0] && semanticIssues[0].evidenceHash || null }, error); }
      var revisionSemanticAttempt = beginStage('semantic');
      var semanticResult;
      try {
        semanticResult = await semanticRuntime.invoke({ requestId: requestNamespace + ':semantic:cycle-' + (runState.semanticCycle + 1) + ':attempt-' + revisionSemanticAttempt, projectId: projectId, estimatedCost: semanticSettings.estimatedCost, timeoutMs: semanticSettings.timeoutMs, maxTokens: semanticSettings.maxTokens, userRequest: input.userRequest || 'Resolve the source-bound product observations.', creativeVision: input.creativeVision || '', source: source, feedbackBatch: repair.feedbackBatch, onSemanticEvent: options.onSemanticEvent, index: index });
        settleCost('semantic');
      } catch (error) {
        if (error.code === 'PRODUCT_DELIVERY_BLOCKED') throw error;
        settleCost('semantic'); block({ code: error.code || 'SEMANTIC_REVISION_FAILED', owner: error.owner || 'SemanticLLM2Runtime', message: error.message, stage: 'semantic', evidenceHash: semanticIssues[0].evidenceHash }, error);
      }
      if (!semanticResult || semanticResult.ok !== true || !semanticResult.document || !semanticResult.document.revision || !semanticResult.document.source) block({ code: 'SEMANTIC_REVISION_MISSING', owner: 'SemanticLLM2Runtime', message: 'Product feedback did not produce a source-bound semantic Revision.', stage: 'semantic', evidenceHash: semanticIssues[0].evidenceHash }, null);
      var nextSource = sourceContract.validateSource(semanticResult.document.source, { index: index }), appliedSource;
      try { appliedSource = sourceContract.applyRevision(source, semanticResult.document.revision, { index: index }); }
      catch (error) { block({ code: error.code || 'SEMANTIC_REVISION_INVALID', owner: error.owner || 'GameSemanticSource', message: error.message, stage: 'semantic', evidenceHash: semanticIssues[0].evidenceHash }, error); }
      if (sourceContract.sourceHash(appliedSource) !== sourceContract.sourceHash(nextSource)) block({ code: 'SEMANTIC_REVISION_SOURCE_MISMATCH', owner: 'ProductDeliveryOrchestrator', message: 'LLM2 returned a Source that is not the exact result of its source-bound Revision.', stage: 'semantic', evidenceHash: semanticIssues[0].evidenceHash }, null);
      var nextHash = sourceContract.sourceHash(nextSource), previousHash = sourceContract.sourceHash(source);
      if (nextHash === previousHash) block({ code: 'SEMANTIC_REVISION_NO_SOURCE_CHANGE', owner: 'ProductDeliveryOrchestrator', message: 'Semantic feedback Revision did not change sourceHash.', stage: 'semantic', evidenceHash: semanticIssues[0].evidenceHash }, null);
      source = storeSource(paths, nextSource); assetProduct = null; spatialProduct = null; capture = null; review = null; cards = null;
      try { runState = persist(deliveryRunApi.startSource(runState, nextHash, revisionHash(semanticResult.document.revision))); }
      catch (error) { block({ code: error.code, owner: error.owner, message: error.message, stage: 'semantic', evidenceHash: semanticIssues[0].evidenceHash }, error); }
    }
  }

  async function run(input) {
    input = input || {};
    allowed(input, INPUT_FIELDS, 'product delivery input');
    var deliveryId = identifier(input.deliveryId, 'deliveryId'), projectId = identifier(input.projectId, 'projectId'), paths = pathsFor(projectId, deliveryId);
    var lease = deliveryRunApi.acquireLease(paths.run);
    try { return await execute(input, deliveryId, projectId, paths); }
    finally { deliveryRunApi.releaseLease(lease); }
  }

  return { run: run };
}

module.exports = { create: create };
