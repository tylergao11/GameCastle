var fs = require('fs');
var path = require('path');
var intentSurfaceGuard = require('./intent-surface-guard');

var RULES_PATH = path.join(__dirname, 'intent-routing-rules.json');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasAll(list, required, label) {
  required.forEach(function(item) {
    assert(list.indexOf(item) >= 0, label + ' missing: ' + item);
  });
}

function uniqueIds(items, label) {
  var seen = {};
  items.forEach(function(item) {
    assert(item.id, label + ' item missing id');
    assert(!seen[item.id], label + ' duplicate id: ' + item.id);
    seen[item.id] = true;
  });
}

function main() {
  var rules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));

  assert(rules.schemaVersion === 1, 'schemaVersion must be 1');
  assert(rules.intentSurface, 'missing intentSurface');
  assert(rules.intentSurface.canonicalStyle === 'natural-game-intent', 'canonicalStyle must be natural-game-intent');

  hasAll(rules.intentSurface.allowedConcepts || [], [
    'thing',
    'component',
    'relation',
    'placement',
    'value',
    'role',
    'action'
  ], 'allowedConcepts');

  var prohibited = rules.intentSurface.prohibitedSurfacePatterns || [];
  uniqueIds(prohibited, 'prohibitedSurfacePatterns');
  hasAll(prohibited.map(function(item) { return item.id; }), [
    'coordinates',
    'event-index',
    'gdjs-instruction',
    'module-id',
    'component-id',
    'runtime-adapter',
    'key-value-machine-fields'
  ], 'prohibitedSurfacePatterns');
  prohibited.forEach(function(item) {
    assert(item.description, 'prohibited pattern missing description: ' + item.id);
    assert(Array.isArray(item.examples) && item.examples.length > 0, 'prohibited pattern missing examples: ' + item.id);
  });

  assert(rules.admissionRule && Array.isArray(rules.admissionRule.allRequired), 'missing admissionRule.allRequired');
  assert(rules.admissionRule.allRequired.length >= 4, 'admissionRule must require at least four checks');

  hasAll(rules.routingOwners || [], [
    'symbol-rewrite',
    'inheritance-defaults',
    'component-manifest',
    'component-expander',
    'placement-resolver',
    'binding-compiler',
    'gdjs-bridge',
    'runtime-adapter',
    'gdevelop-truth',
    'component-catalog'
  ], 'routingOwners');

  var routes = rules.bridgeIssueRoutes || [];
  assert(routes.length >= 10, 'bridgeIssueRoutes should cover at least ten concrete cases');
  uniqueIds(routes, 'bridgeIssueRoutes');
  var owners = rules.routingOwners || [];
  routes.forEach(function(route) {
    assert(route.problem, 'route missing problem: ' + route.id);
    assert(owners.indexOf(route.routeOwner) >= 0, 'route has unknown owner ' + route.routeOwner + ': ' + route.id);
    assert(route.routeMechanism, 'route missing mechanism: ' + route.id);
    assert(Array.isArray(route.prohibitedDslExpansions) && route.prohibitedDslExpansions.length > 0, 'route missing prohibitedDslExpansions: ' + route.id);
    assert(Array.isArray(route.resultCardEvidence) && route.resultCardEvidence.length > 0, 'route missing resultCardEvidence: ' + route.id);
    assert(route.routeOwner !== 'llm2-intent', 'route must not default to LLM2 intent repair: ' + route.id);
  });

  hasAll(routes.map(function(route) { return route.id; }), [
    'touch-multitouch-state',
    'joystick-dead-zone',
    'responsive-ui',
    'missing-placement-anchor',
    'ui-overlap',
    'front-direction-context',
    'object-relative-placement',
    'semantic-pattern-placement',
    'collision-mask-setup',
    'awkward-gdjs-parameters',
    'inventory-expansion',
    'inventory-persistence',
    'networked-touch-input',
    'missing-gdjs-runtime-include',
    'new-reusable-game-system'
  ], 'bridgeIssueRoutes');

  assert(rules.resultCard && Array.isArray(rules.resultCard.requiredFields), 'missing resultCard.requiredFields');
  hasAll(rules.resultCard.requiredFields, [
    'input',
    'resolved',
    'rewrites',
    'overrides',
    'autoAdded',
    'emitted',
    'diagnostics',
    'warnings',
    'ownerTrace'
  ], 'resultCard.requiredFields');

  assert(rules.rewriteContract, 'missing rewriteContract');
  hasAll(rules.rewriteContract.requiredFields || [], [
    'from',
    'to',
    'owner',
    'mechanism',
    'stage'
  ], 'rewriteContract.requiredFields');
  hasAll(rules.rewriteContract.allowedOwners || [], [
    'intent-compiler',
    'component-catalog'
  ], 'rewriteContract.allowedOwners');
  hasAll(rules.rewriteContract.allowedMechanisms || [], [
    'module-inference',
    'component-alias',
    'natural-anchor',
    'semantic-group'
  ], 'rewriteContract.allowedMechanisms');

  intentSurfaceGuard.assertIntentSurfaceAllowed([
    'make a mobile platformer',
    'give Player platformer movement',
    'add joystick controls Player near screen bottom-left',
    'add jump button controls Player near screen bottom-right',
    'place coins near Player front as trail count 8'
  ].join('\n'), { rules: rules });

  var machineText = [
    'install module id=core.platformer preset=mobile',
    'add component id=input.jump_button target=Player near=screen direction=bottom-right',
    'place at x=120 y=480',
    'remove event #2',
    'use runtime adapter gdjs.virtual_joystick',
    'CollisionNP'
  ].join('\n');
  var violations = intentSurfaceGuard.detectProhibitedSurface(machineText, { rules: rules });
  hasAll(violations.map(function(violation) { return violation.id; }), [
    'coordinates',
    'event-index',
    'gdjs-instruction',
    'module-id',
    'component-id',
    'runtime-adapter',
    'key-value-machine-fields'
  ], 'intent surface guard violations');

  var route = intentSurfaceGuard.getBridgeIssueRoute('awkward-gdjs-parameters', { rules: rules });
  assert(route.routeOwner === 'gdjs-bridge', 'awkward GDJS parameters should route to gdjs-bridge');
  assert(route.routeMechanism === 'target-rewrite', 'awkward GDJS parameters should use target rewrite');

  console.log('[IntentRoutingRules] ' + routes.length + ' bridge routes, ' + prohibited.length + ' prohibited surface patterns');
}

main();
