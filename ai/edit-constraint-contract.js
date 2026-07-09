var intentSurfaceGuard = require('./intent-surface-guard');

var ALLOWED_DIMENSIONS = {
  placement: true
};

var ALLOWED_OPERATORS = {
  nudge: true,
  increase: true,
  decrease: true
};

var ALLOWED_AMOUNTS = {
  slightly: true,
  small: true,
  normal: true,
  far: true
};

function assertEdit(edit) {
  if (!edit) throw new Error('Missing edit constraint');
  if (edit.kind !== 'editConstraint') throw new Error('Edit constraint kind must be editConstraint');
  if (!edit.subject) throw new Error('Edit constraint missing subject');
  if (!ALLOWED_DIMENSIONS[edit.dimension]) throw new Error('Edit constraint dimension is not allowed: ' + edit.dimension);
  if (!ALLOWED_OPERATORS[edit.operator]) throw new Error('Edit constraint operator is not allowed: ' + edit.operator);
  if (edit.amount !== undefined && !ALLOWED_AMOUNTS[edit.amount]) {
    throw new Error('Edit constraint amount must be semantic, not numeric: ' + edit.amount);
  }
  if (edit.owner !== 'placement-resolver') throw new Error('Placement edit constraint must route to placement-resolver: ' + edit.subject);
  if (edit.source) intentSurfaceGuard.assertIntentSurfaceAllowed(edit.source);
  return true;
}

function assertGraph(graph) {
  (graph.edits || []).forEach(assertEdit);
  return true;
}

module.exports = {
  assertEdit: assertEdit,
  assertGraph: assertGraph
};
