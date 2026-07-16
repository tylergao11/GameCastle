var crypto = require('crypto');
var sourceContract = require('../../semantic/src/game-semantic-source');
var deliveryRun = require('./product-delivery-run');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function(out, key) { out[key] = stable(value[key]); return out; }, {}); return value; }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24); }
function fail(code, message) { var error = new Error(message); error.code = code; error.owner = 'AssetCardProjector'; throw error; }

function project(input) {
  input = input || {};
  var source = sourceContract.validateSource(input.source, input.index ? { index: input.index } : undefined);
  var sourceHash = sourceContract.sourceHash(source), run = deliveryRun.validate(input.deliveryRun);
  if (run.currentSourceHash !== sourceHash) fail('ASSET_CARD_SOURCE_MISMATCH', 'AssetCard projection requires the active ProductDeliveryRun sourceHash.');
  var requirements = Object.create(null), slots = Object.create(null), debts = Object.create(null), workReports = Object.create(null);
  ((input.assembly && input.assembly.assetRequirements && input.assembly.assetRequirements.requirements) || []).forEach(function(requirement) { requirements[requirement.semanticId] = requirement; });
  ((input.assetState && input.assetState.assetWorld && input.assetState.assetWorld.slots) || []).forEach(function(slot) { slots[slot.semanticId] = slot; });
  ((input.assetState && input.assetState.debts) || []).forEach(function(debt) { if (!debts[debt.slotId]) debts[debt.slotId] = []; debts[debt.slotId].push(debt); });
  ((input.assetState && input.assetState.assetProductionReport && input.assetState.assetProductionReport.workItemReports) || []).forEach(function(report) {
    var semanticId = report.semanticId || report.slotId || null;
    if (semanticId) workReports[semanticId] = report;
  });
  var cards = (source.assetIntents || []).map(function(intent) {
    var requirement = requirements[intent.semanticId] || null, slot = slots[intent.semanticId] || null, cardDebts = debts[intent.semanticId] || [], report = workReports[intent.semanticId] || null;
    var status = slot ? 'accepted' : cardDebts.length ? 'blocked' : run.status === 'asset-producing' ? 'producing' : 'pending';
    var result = slot ? {
      assetId: slot.assetId || null,
      revisionId: slot.revisionId || slot.frameSet && slot.frameSet.revisionId || null,
      resourceKind: slot.resourceKind || slot.frameSet && slot.frameSet.resourceKind || null,
      format: slot.format || slot.frameSet && slot.frameSet.format || null,
      contentHash: slot.frameSet && slot.frameSet.contentHash || slot.sha256 || null,
      assetWorldHash: input.assetState.assetWorld.contentHash
    } : null;
    var card = {
      schemaVersion: 1,
      documentKind: 'asset-card',
      sourceHash: sourceHash,
      semanticId: intent.semanticId,
      intent: clone(intent),
      requirement: requirement ? clone(requirement) : null,
      lifecycle: {
        status: status,
        productionSetId: input.assetState && input.assetState.assetProduction && input.assetState.assetProduction.plan && input.assetState.assetProduction.plan.productionSetId || input.assetState && input.assetState.assetWorld && input.assetState.assetWorld.productionSetId || null,
        attempt: report && report.loopState && report.loopState.attempt || null,
        debtCodes: cardDebts.map(function(debt) { return debt.code; }).sort()
      },
      result: result
    };
    card.contentHash = 'asset-card.' + digest(card);
    return card;
  }).sort(function(left, right) { return left.semanticId.localeCompare(right.semanticId); });
  var set = { schemaVersion: 1, documentKind: 'asset-card-set', sourceHash: sourceHash, assetWorldHash: input.assetState && input.assetState.assetWorld && input.assetState.assetWorld.contentHash || null, deliveryRunHash: run.contentHash, cards: cards };
  set.contentHash = 'asset-card-set.' + digest(set);
  return set;
}

module.exports = { project: project };
