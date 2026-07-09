var fs = require('fs');
var path = require('path');

var RULES_PATH = path.join(__dirname, 'intent-routing-rules.json');

var PATTERN_CHECKS = {
  'coordinates': [
    /\b[xy]\s*=\s*-?\d+(?:\.\d+)?\b/i,
    /\bplace\s+at\s+-?\d+(?:\.\d+)?\s*,?\s*-?\d+(?:\.\d+)?\b/i
  ],
  'event-index': [
    /\bevent\s+index\s+\d+\b/i,
    /\bremove\s+event\s+#\d+\b/i
  ],
  'gdjs-instruction': [
    /\bCollisionNP\b/,
    /\bMettreXY\b/,
    /\bTextObject::String\b/,
    /\bPrimitiveDrawing::[A-Za-z0-9_:]+\b/,
    /\bPlatformBehavior::[A-Za-z0-9_:]+\b/
  ],
  'module-id': [
    /\binstall\s+module\s+id\s*=/i,
    /\bconfigure\s+module\s+id\s*=/i
  ],
  'component-id': [
    /\badd\s+component\s+id\s*=/i,
    /\binstall\s+component\s+id\s*=/i
  ],
  'runtime-adapter': [
    /\bruntime\s+adapter\b/i,
    /\badapter\s*=\s*[A-Za-z0-9_.-]+/i,
    /\bgdjs\.[A-Za-z0-9_.-]+\b/
  ],
  'key-value-machine-fields': [
    /\b(?:id|near|direction|target|owner|action|slots|preset|sync|authority|tickRate|seed|deadZone|radius|axisSmoothing|pressMode|cooldown|pointerId|storageKey)\s*=/i
  ]
};

function loadRules() {
  return JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
}

function indexById(items) {
  var byId = {};
  (items || []).forEach(function(item) {
    byId[item.id] = item;
  });
  return byId;
}

function detectProhibitedSurface(text, options) {
  options = options || {};
  var rules = options.rules || loadRules();
  var prohibited = indexById(rules.intentSurface && rules.intentSurface.prohibitedSurfacePatterns);
  var result = [];
  var source = String(text || '');

  Object.keys(PATTERN_CHECKS).forEach(function(id) {
    var checks = PATTERN_CHECKS[id];
    for (var i = 0; i < checks.length; i++) {
      if (checks[i].test(source)) {
        result.push({
          id: id,
          description: prohibited[id] && prohibited[id].description,
          pattern: String(checks[i])
        });
        break;
      }
    }
  });

  return result;
}

function assertIntentSurfaceAllowed(text, options) {
  var violations = detectProhibitedSurface(text, options);
  if (violations.length) {
    var ids = violations.map(function(violation) { return violation.id; }).join(', ');
    throw new Error('Intent surface contains prohibited machine/backend form(s): ' + ids);
  }
  return true;
}

function getBridgeIssueRoute(id, options) {
  options = options || {};
  var rules = options.rules || loadRules();
  var routes = indexById(rules.bridgeIssueRoutes);
  var route = routes[id];
  if (!route) throw new Error('Unknown bridge issue route: ' + id);
  return route;
}

function listBridgeIssueRoutes(options) {
  options = options || {};
  var rules = options.rules || loadRules();
  return (rules.bridgeIssueRoutes || []).slice();
}

module.exports = {
  loadRules: loadRules,
  detectProhibitedSurface: detectProhibitedSurface,
  assertIntentSurfaceAllowed: assertIntentSurfaceAllowed,
  getBridgeIssueRoute: getBridgeIssueRoute,
  listBridgeIssueRoutes: listBridgeIssueRoutes
};
