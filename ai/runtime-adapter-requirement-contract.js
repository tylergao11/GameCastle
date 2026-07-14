var intentSurfaceGuard = require('./intent-surface-guard');

var ALLOWED_MECHANISMS = {
  'touch-axis-adapter': true,
  'touch-button-adapter': true,
  'inventory-storage-adapter': true,
  'inventory-panel-adapter': true,
  'ui-action-group-adapter': true,
  'ui-choice-surface-adapter': true,
  'ui-targeting-reticle-adapter': true
};

function assertConfigField(requirement, key) {
  var config = requirement.config || {};
  if (config[key] === undefined || config[key] === null || config[key] === '') {
    throw new Error('Runtime adapter requirement missing config.' + key + ': ' + requirement.adapter);
  }
}

function assertConfigArray(requirement, key) {
  var config = requirement.config || {};
  if (!Array.isArray(config[key]) || !config[key].length) {
    throw new Error('Runtime adapter requirement missing config.' + key + ': ' + requirement.adapter);
  }
}

function assertAdapterConfig(requirement) {
  if (requirement.adapter === 'touch-button') {
    ['keyboardKey', 'controlLabel', 'width', 'height', 'shape', 'color'].forEach(function(key) {
      assertConfigField(requirement, key);
    });
  } else if (requirement.adapter === 'virtual-joystick') {
    ['width', 'height', 'shape', 'color'].forEach(function(key) {
      assertConfigField(requirement, key);
    });
    assertConfigArray(requirement, 'inputs');
  } else if (requirement.adapter === 'inventory-panel') {
    ['panelTitle', 'slots', 'width', 'height', 'shape', 'color'].forEach(function(key) {
      assertConfigField(requirement, key);
    });
  } else if (requirement.adapter === 'inventory-storage') {
    ['slots', 'persistence'].forEach(function(key) {
      assertConfigField(requirement, key);
    });
  } else if (requirement.adapter === 'action-group') {
    ['surfaceName', 'arrangement', 'buttonSize', 'width', 'height', 'shape', 'color'].forEach(function(key) { assertConfigField(requirement, key); });
    assertConfigArray(requirement, 'actions');
  } else if (requirement.adapter === 'choice-surface') {
    ['surfaceName', 'optionCount', 'trigger', 'pausePolicy', 'selectionMode', 'width', 'height', 'shape', 'color'].forEach(function(key) { assertConfigField(requirement, key); });
    var optionCount = Number((requirement.config || {}).optionCount);
    if (!Number.isInteger(optionCount) || optionCount < 2 || optionCount > 12) throw new Error('Runtime adapter requirement has invalid choice optionCount');
  } else if (requirement.adapter === 'targeting-reticle') {
    ['surfaceName', 'trackingMode', 'width', 'height', 'shape', 'color'].forEach(function(key) { assertConfigField(requirement, key); });
  }
}

function assertRequirement(requirement) {
  if (!requirement) throw new Error('Missing runtime adapter requirement');
  if (!requirement.adapter) throw new Error('Runtime adapter requirement missing adapter');
  if (!requirement.componentId) throw new Error('Runtime adapter requirement missing componentId: ' + requirement.adapter);
  if (!requirement.owner) throw new Error('Runtime adapter requirement missing owner: ' + requirement.adapter);
  if (!requirement.mechanism) throw new Error('Runtime adapter requirement missing mechanism: ' + requirement.adapter);
  if (!ALLOWED_MECHANISMS[requirement.mechanism]) {
    throw new Error('Runtime adapter requirement mechanism is not allowed: ' + requirement.mechanism);
  }
  if (!requirement.routeId) throw new Error('Runtime adapter requirement missing routeId: ' + requirement.adapter);
  var route = intentSurfaceGuard.getBridgeIssueRoute(requirement.routeId);
  if (!requirement.routeOwner) throw new Error('Runtime adapter requirement missing routeOwner: ' + requirement.adapter);
  if (!requirement.routeMechanism) throw new Error('Runtime adapter requirement missing routeMechanism: ' + requirement.adapter);
  if (requirement.routeOwner !== route.routeOwner) {
    throw new Error('Runtime adapter requirement routeOwner mismatch for ' + requirement.adapter + ': expected ' + route.routeOwner + ', got ' + requirement.routeOwner);
  }
  if (requirement.routeMechanism !== route.routeMechanism) {
    throw new Error('Runtime adapter requirement routeMechanism mismatch for ' + requirement.adapter + ': expected ' + route.routeMechanism + ', got ' + requirement.routeMechanism);
  }
  if (!requirement.source) throw new Error('Runtime adapter requirement missing source: ' + requirement.adapter);
  assertAdapterConfig(requirement);
  return true;
}

function assertRequirements(requirements) {
  (requirements || []).forEach(assertRequirement);
  return true;
}

module.exports = {
  assertRequirement: assertRequirement,
  assertRequirements: assertRequirements
};
