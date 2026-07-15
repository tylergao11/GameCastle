function build(references, draft, request, creativeVision, retrieved, ledger) {
  return {
    task: String(request || ''),
    foundationOperations: references.foundationOperationLines(),
    parameterContext: references.parameterContext(),
    world: { mode: draft.baseSource ? 'revision' : 'source', draft: require('./semantic-draft').structure(draft) },
    retrieve: retrieved.slice(),
    taskLedger: require('./semantic-run-ledger').context(ledger)
  };
}
module.exports = { build: build };
