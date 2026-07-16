var crypto = require('crypto');
var sourceContract = require('../../semantic/src/game-semantic-source');
var feedbackContract = require('../../semantic/src/semantic-feedback-contract');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'ProductFeedbackBuilder'; throw error; }
function kindForStage(stage) { if (stage === 'asset') return 'asset-observation'; if (stage === 'spatial') return 'layout-observation'; if (stage === 'assembly') return 'assembly-observation'; return null; }

function build(input) {
  input = input || {};
  var source = sourceContract.validateSource(input.source, input.index ? { index: input.index } : undefined);
  if (!Array.isArray(input.issues) || !input.issues.length) fail('PRODUCT_FEEDBACK_ISSUES_REQUIRED', 'Semantic repair requires one or more classified factual issues.');
  var view = sourceContract.structureView(source, input.index ? { index: input.index } : undefined);
  var entries = input.issues.map(function(issue, index) {
    var kind = kindForStage(issue.stage);
    if (!kind) fail('PRODUCT_FEEDBACK_STAGE_INVALID', 'Product feedback cannot route stage ' + issue.stage + ' to LLM2.');
    if (!Array.isArray(issue.targets) || !issue.targets.length) fail('PRODUCT_FEEDBACK_TARGET_REQUIRED', 'Semantic feedback issue has no exact semantic target: ' + issue.code);
    var targets = issue.targets.map(function(target) { return clone(target); });
    return {
      feedbackId: 'feedback.' + String(issue.stage).replace(/[^A-Za-z0-9_.-]/g, '-') + '.' + digest([input.semanticCycle || 0, index, issue.code, targets, issue.evidenceHash]),
      kind: kind,
      targets: targets,
      observation: {
        code: issue.code,
        description: issue.message,
        evidence: Object.assign({ stage: issue.stage, evidenceHash: issue.evidenceHash || null, semanticCycle: input.semanticCycle || 0 }, clone(issue.evidence || {}))
      }
    };
  });
  var batch = feedbackContract.validate({ schemaVersion: feedbackContract.SCHEMA_VERSION, documentKind: feedbackContract.DOCUMENT_KIND, baseSourceHash: view.sourceHash, baseStructureHash: view.structureHash, entries: entries }, { source: source, sourceHash: view.sourceHash, structureHash: view.structureHash });
  return { feedbackBatch: batch };
}

module.exports = { build: build };
