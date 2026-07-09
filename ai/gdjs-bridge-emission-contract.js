var ALLOWED_MECHANISMS = {
  'product-module-expansion': true,
  'component-ui-layer': true,
  'component-object-expansion': true,
  'component-placement-rewrite': true,
  'component-config-expansion': true,
  'semantic-group-placement-rewrite': true,
  'semantic-placement-edit-rewrite': true
};

function assertEmission(emission) {
  if (!emission) throw new Error('Missing bridge emission');
  if (emission.kind !== 'internal-dsl') throw new Error('Bridge emission kind must be internal-dsl');
  if (!emission.owner) throw new Error('Bridge emission missing owner: ' + (emission.line || 'unknown line'));
  if (!emission.source) throw new Error('Bridge emission missing source: ' + (emission.line || 'unknown line'));
  if (!emission.mechanism) throw new Error('Bridge emission missing mechanism: ' + (emission.line || 'unknown line'));
  if (!ALLOWED_MECHANISMS[emission.mechanism]) {
    throw new Error('Bridge emission mechanism is not allowed: ' + emission.mechanism);
  }
  if (emission.routeId && !emission.routeMechanism) {
    throw new Error('Bridge emission routeId requires routeMechanism: ' + emission.routeId);
  }
  return true;
}

function assertPlan(plan) {
  (plan.emitted || []).forEach(assertEmission);
  if ((plan.emitted || []).length !== (plan.dslLines || []).length) {
    throw new Error('Bridge emitted evidence must match dsl line count');
  }
  return true;
}

module.exports = {
  assertEmission: assertEmission,
  assertPlan: assertPlan
};
