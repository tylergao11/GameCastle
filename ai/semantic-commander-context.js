function build(references, draft, request, creativeVision, retrieved, ledger) {
  var taskLedger = require('./semantic-run-ledger').context(ledger);
  var applied = taskLedger.applied;
  delete taskLedger.applied;
  return {
    task: String(request || ''),
    foundationOperations: references.foundationOperationLines(),
    parameterContext: references.parameterContext(),
    world: { mode: draft.baseSource ? 'revision' : 'source', draft: require('./semantic-draft').structure(draft) },
    retrieve: retrieved.slice(),
    applied: applied,
    taskLedger: taskLedger
  };
}
module.exports = { build: build };
