var sourceContract = require('./game-semantic-source');

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function create(source, options) {
  var view = sourceContract.structureView(source, options);
  return { schemaVersion: 2, ledgerKind: 'semantic-session-ledger', baseline: view, latest: view, structures: [view], revisions: [] };
}
function context(ledger, source, options) {
  if (!ledger || ledger.ledgerKind !== 'semantic-session-ledger') throw new Error('Semantic session ledger is required');
  var next = sourceContract.structureView(source, options);
  var knownHash = options && options.knownStructureHash;
  if (!knownHash) return { mode: 'baseline', world: next };
  var known = (ledger.structures || []).filter(function(view) { return view.structureHash === knownHash; })[0];
  if (!known) throw new Error('Semantic session ledger has no acknowledged structure: ' + knownHash);
  if (known.structureHash === next.structureHash) return { mode: 'no-structure-change', structureHash: next.structureHash, worldVersion: next.worldVersion };
  return { mode: 'structure-diff', diff: sourceContract.structuralDiff(known, next), worldVersion: next.worldVersion };
}
function commit(ledger, source, revision, options) {
  var next = sourceContract.applyRevision(source, revision, options);
  var nextView = sourceContract.structureView(next, options);
  var entry = { revisionBaseHash: revision.baseSourceHash, sourceHash: nextView.sourceHash, structureHash: nextView.structureHash, structuralDiff: sourceContract.structuralDiff(ledger.latest, nextView) };
  ledger.latest = nextView;
  if (!(ledger.structures || []).some(function(view) { return view.structureHash === nextView.structureHash; })) ledger.structures.push(nextView);
  ledger.revisions.push(entry);
  return { source: next, ledger: clone(ledger), entry: entry };
}
module.exports = { create: create, context: context, commit: commit };
