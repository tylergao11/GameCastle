var crypto = require('crypto');
var productContract = require('../contracts/product-delivery-contract.json');

var OPTION_FIELDS = ['provider', 'estimatedCost', 'timeoutMs', 'maxAttempts', 'maxTokens'];
var REVIEW_FIELDS = ['requestNamespace', 'projectId', 'source', 'assetCards', 'assetProductHash', 'spatialProductHash', 'resolutionHash', 'projectionHash', 'browserEvidence'];

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'AssemblyReviewProviderPort'; throw error; }
function allowed(value, fields, label) { Object.keys(value || {}).forEach(function(field) { if (fields.indexOf(field) < 0) fail('ASSEMBLY_REVIEW_PROVIDER_INPUT_INVALID', label + ' contains unknown field: ' + field); }); }
function allowedOutput(value, fields, label) { Object.keys(value || {}).forEach(function(field) { if (fields.indexOf(field) < 0) fail('ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID', label + ' contains unknown field: ' + field); }); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID', label + ' must be an object.'); return value; }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) fail('ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID', label + ' must be non-empty text.'); return value.trim(); }
function finite(value, label) { if (!Number.isFinite(value)) fail('ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID', label + ' must be a finite number.'); return value; }

var OUTPUT_SCHEMA = {
  name: 'gamecastle_assembly_review',
  schema: {
    type: 'object', additionalProperties: false, required: ['decision', 'observations'],
    properties: {
      decision: { type: 'string', enum: ['accepted', 'rejected'] },
      observations: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['code', 'description', 'targets', 'evidence'],
          properties: {
            code: { type: 'string', enum: productContract.semanticAssemblyObservationCodes.slice() },
            description: { type: 'string', minLength: 1 },
            targets: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['collection', 'semanticId'], properties: { collection: { type: 'string', enum: ['entities', 'components', 'events', 'assetIntents', 'layoutIntents'] }, semanticId: { type: 'string', minLength: 1 } } } },
            evidence: { type: 'object', additionalProperties: false, required: ['visualFact', 'screenshotRegion'], properties: { visualFact: { type: 'string', minLength: 1 }, screenshotRegion: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: ['x', 'y', 'width', 'height'], properties: { x: { type: 'number', minimum: 0 }, y: { type: 'number', minimum: 0 }, width: { type: 'number', exclusiveMinimum: 0 }, height: { type: 'number', exclusiveMinimum: 0 } } }] } } }
          }
        }
      }
    }
  }
};

function validateOutput(value) {
  object(value, 'Assembly Reviewer output');
  allowedOutput(value, ['decision', 'observations'], 'Assembly Reviewer output');
  var decision = text(value.decision, 'decision');
  if (decision !== 'accepted' && decision !== 'rejected') fail('ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID', 'decision must be accepted or rejected.');
  if (!Array.isArray(value.observations)) fail('ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID', 'observations must be an array.');
  var observations = value.observations.map(function(observation, observationIndex) {
    var label = 'observations[' + observationIndex + ']';
    object(observation, label); allowedOutput(observation, ['code', 'description', 'targets', 'evidence'], label);
    if (!Array.isArray(observation.targets) || !observation.targets.length) fail('ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID', label + '.targets must identify at least one Source item.');
    var seenTargets = Object.create(null);
    var targets = observation.targets.map(function(target, targetIndex) {
      var targetLabel = label + '.targets[' + targetIndex + ']';
      object(target, targetLabel); allowedOutput(target, ['collection', 'semanticId'], targetLabel);
      var collection = text(target.collection, targetLabel + '.collection');
      if (['entities', 'components', 'events', 'assetIntents', 'layoutIntents'].indexOf(collection) < 0) fail('ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID', targetLabel + '.collection is not semantic truth.');
      var validTarget = { collection: collection, semanticId: text(target.semanticId, targetLabel + '.semanticId') }, key = validTarget.collection + '/' + validTarget.semanticId;
      if (seenTargets[key]) fail('ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID', label + '.targets repeats semantic target: ' + key);
      seenTargets[key] = true;
      return validTarget;
    });
    var evidenceLabel = label + '.evidence', evidence = object(observation.evidence, evidenceLabel);
    allowedOutput(evidence, ['visualFact', 'screenshotRegion'], evidenceLabel);
    var region = evidence.screenshotRegion;
    if (region !== null) {
      object(region, evidenceLabel + '.screenshotRegion');
      allowedOutput(region, ['x', 'y', 'width', 'height'], evidenceLabel + '.screenshotRegion');
      region = { x: finite(region.x, evidenceLabel + '.screenshotRegion.x'), y: finite(region.y, evidenceLabel + '.screenshotRegion.y'), width: finite(region.width, evidenceLabel + '.screenshotRegion.width'), height: finite(region.height, evidenceLabel + '.screenshotRegion.height') };
      if (region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0) fail('ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID', evidenceLabel + '.screenshotRegion must use non-negative coordinates and positive dimensions.');
    }
    var code = text(observation.code, label + '.code');
    if (productContract.semanticAssemblyObservationCodes.indexOf(code) < 0) fail('ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID', label + '.code is outside the factual assembly taxonomy.');
    return { code: code, description: text(observation.description, label + '.description'), targets: targets, evidence: { visualFact: text(evidence.visualFact, evidenceLabel + '.visualFact'), screenshotRegion: region } };
  });
  if (decision === 'accepted' && observations.length) fail('ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID', 'accepted review cannot carry unresolved observations.');
  if (decision === 'rejected' && !observations.length) fail('ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID', 'rejected review requires factual observations.');
  return { decision: decision, observations: observations };
}

function prompt(input) {
  return {
    systemPrompt: [
      'Role: independent Assembly Reviewer.',
      'Judge only the supplied screenshot of the real source-bound GDJS runtime build.',
      'Report observable product facts, never repair instructions, routing, task scope, or suggested fixes.',
      'Every rejected fact must target exact semantic ids already present in Source.',
      'Accept only when composition, legibility, visual hierarchy, asset-role correctness, and layout intent are all coherent at the captured viewport.'
    ].join('\n'),
    prompt: [
      'Immutable identities:',
      JSON.stringify({ assetProductHash: input.assetProductHash, spatialProductHash: input.spatialProductHash, resolutionHash: input.resolutionHash, projectionHash: input.projectionHash, browserCaptureHash: input.browserEvidence.contentHash, runtimeBuildHash: input.browserEvidence.runtimeBuildHash }),
      'GameSemanticSource:',
      JSON.stringify(input.source),
      'Read-only AssetCards:',
      JSON.stringify(input.assetCards || null),
      'Return accepted with no observations, or rejected with factual source-targeted observations.'
    ].join('\n')
  };
}

function create(providerRuntime, options) {
  if (!providerRuntime || typeof providerRuntime.invokeRole !== 'function') fail('ASSEMBLY_REVIEW_PROVIDER_UNAVAILABLE', 'Assembly review requires ProviderRuntime.');
  options = options || {};
  allowed(options, OPTION_FIELDS, 'Assembly review provider options');
  async function reviewAssembly(input) {
    input = input || {};
    allowed(input, REVIEW_FIELDS, 'Assembly review request');
    var requestNamespace = text(input.requestNamespace, 'requestNamespace'), projectId = text(input.projectId, 'projectId');
    var request = prompt(input);
    var result = await providerRuntime.invokeRole({
      requestId: requestNamespace + ':assembly-review:' + digest([input.assetProductHash, input.spatialProductHash, input.browserEvidence && input.browserEvidence.contentHash]).slice(0, 24),
      projectId: projectId,
      role: 'vision-review',
      provider: options.provider,
      estimatedCost: options.estimatedCost,
      timeoutMs: options.timeoutMs,
      maxAttempts: options.maxAttempts,
      input: { systemPrompt: request.systemPrompt, prompt: request.prompt, imagePath: input.browserEvidence && input.browserEvidence.imagePath, maxTokens: options.maxTokens || 2048, jsonSchema: OUTPUT_SCHEMA }
    });
    if (!result || result.ok !== true || !result.output || typeof result.output.text !== 'string') {
      var debt = result && result.debt || {};
      fail(debt.code || 'ASSEMBLY_REVIEW_PROVIDER_FAILED', debt.message || 'Assembly review provider returned no structured result.');
    }
    var value;
    try { value = JSON.parse(result.output.text); } catch (error) { fail('ASSEMBLY_REVIEW_PROVIDER_OUTPUT_INVALID', 'Assembly review provider returned invalid JSON: ' + error.message); }
    value = validateOutput(value);
    var receipt = result.receipt || {};
    return {
      receiptId: receipt.receiptId || 'assembly-review.' + digest(value).slice(0, 24),
      modelFingerprint: 'assembly-review-model.' + digest({ provider: receipt.provider || null, model: receipt.model || null, provenance: receipt.provenance || null }),
      decision: value.decision,
      observations: value.observations.map(function(observation) { var current = clone(observation); current.evidence = Object.assign({ browserCaptureHash: input.browserEvidence.contentHash }, current.evidence || {}); return current; })
    };
  }
  return { reviewAssembly: reviewAssembly };
}

module.exports = { create: create, OUTPUT_SCHEMA: clone(OUTPUT_SCHEMA), prompt: prompt, validateOutput: validateOutput };
