var fs = require('fs');
var path = require('path');
var intentSurfaceGuard = require('./intent-surface-guard');

var COMPONENTS_DIR = path.join(__dirname, 'components');

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assertArray(value, message) {
  if (!Array.isArray(value)) throw new Error(message);
}

function assertObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
}

function mergeUnique(left, right) {
  var seen = {};
  var result = [];
  (left || []).concat(right || []).forEach(function(item) {
    var key = JSON.stringify(item);
    if (seen[key]) return;
    seen[key] = true;
    result.push(clone(item));
  });
  return result;
}

function mergeObject(parent, child) {
  return Object.assign({}, clone(parent || {}), clone(child || {}));
}

function mergeInheritance(parent, child) {
  if (!parent && !child) return undefined;
  parent = parent || {};
  child = child || {};
  return {
    contracts: mergeUnique(parent.contracts, child.contracts),
    defaultOwner: child.defaultOwner || parent.defaultOwner || 'component-manifest',
    exposedOverrides: mergeUnique(parent.exposedOverrides, child.exposedOverrides),
    sealedDefaults: mergeUnique(parent.sealedDefaults, child.sealedDefaults)
  };
}

function mergeGdjsBridge(parent, child) {
  if (!parent && !child) return undefined;
  parent = parent || {};
  child = child || {};
  var merged = mergeObject(parent, child);
  merged.runtimeAdapters = mergeUnique(parent.runtimeAdapters, child.runtimeAdapters);
  merged.adapterRoutes = mergeObject(parent.adapterRoutes, child.adapterRoutes);
  merged.configExpansions = mergeUnique(parent.configExpansions, child.configExpansions);
  if (parent.objectSpec || child.objectSpec) merged.objectSpec = mergeObject(parent.objectSpec, child.objectSpec);
  else delete merged.objectSpec;
  return merged;
}

function mergeCompilerManifest(parent, child, componentId) {
  parent = parent || {};
  child = child || {};
  var merged = mergeObject(parent, child);
  merged.componentId = componentId;
  merged.extends = child.extends;
  merged.abstract = child.abstract === true;
  merged.defaultConfig = mergeObject(parent.defaultConfig, child.defaultConfig);
  merged.inheritance = mergeInheritance(parent.inheritance, child.inheritance);
  merged.provides = mergeUnique(parent.provides, child.provides);
  merged.requires = mergeUnique(parent.requires, child.requires);
  merged.relations = mergeUnique(parent.relations, child.relations);
  merged.binding = mergeObject(parent.binding, child.binding);
  merged.placement = mergeObject(parent.placement, child.placement);
  merged.gdjsBridge = mergeGdjsBridge(parent.gdjsBridge, child.gdjsBridge);
  return merged;
}

function parentIdsOf(manifest) {
  var value = manifest && manifest.compilerManifest && manifest.compilerManifest.extends;
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function resolveManifestInheritance(rawById, id, resolved, stack) {
  if (resolved[id]) return resolved[id];
  var raw = rawById[id];
  if (!raw) throw new Error('Unknown component inheritance parent: ' + id);
  stack = stack || [];
  if (stack.indexOf(id) >= 0) throw new Error('Component inheritance cycle: ' + stack.concat([id]).join(' -> '));
  var manifest = clone(raw);
  var parentIds = parentIdsOf(manifest);
  if (parentIds.length) {
    var inherited = {};
    parentIds.forEach(function(parentId) {
      var parent = resolveManifestInheritance(rawById, parentId, resolved, stack.concat([id]));
      inherited = mergeCompilerManifest(inherited, parent.compilerManifest, manifest.id);
    });
    manifest.compilerManifest = mergeCompilerManifest(inherited, manifest.compilerManifest, manifest.id);
  }
  resolved[id] = manifest;
  return manifest;
}

function validateAiManifest(manifest) {
  assertObject(manifest.aiManifest, manifest.id + ' missing aiManifest');
  assertArray(manifest.aiManifest.aliases, manifest.id + ' aiManifest.aliases must be an array');
  if (!manifest.aiManifest.summary) throw new Error(manifest.id + ' missing aiManifest.summary');

  var aiText = [
    manifest.name,
    manifest.aiManifest.summary,
    (manifest.aiManifest.aliases || []).join('\n'),
    (manifest.aiManifest.actions || []).join('\n'),
    (manifest.aiManifest.targetRoles || []).join('\n'),
    (manifest.aiManifest.ownerRoles || []).join('\n'),
    (manifest.aiManifest.safeExamples || []).join('\n')
  ].join('\n');
  intentSurfaceGuard.assertIntentSurfaceAllowed(aiText);
}

function validateCompilerManifest(manifest) {
  assertObject(manifest.compilerManifest, manifest.id + ' missing compilerManifest');
  if (!manifest.compilerManifest.componentId) throw new Error(manifest.id + ' missing compilerManifest.componentId');
  if (manifest.compilerManifest.componentId !== manifest.id) {
    throw new Error(manifest.id + ' compilerManifest.componentId must match id');
  }
  assertArray(manifest.compilerManifest.provides || [], manifest.id + ' compilerManifest.provides must be an array');
  assertArray(manifest.compilerManifest.requires || [], manifest.id + ' compilerManifest.requires must be an array');
  assertObject(manifest.compilerManifest.gdjsBridge || {}, manifest.id + ' missing compilerManifest.gdjsBridge');
  validateGdjsBridge(manifest);
  validateInheritance(manifest);
}

function validateGdjsBridge(manifest) {
  var bridge = manifest.compilerManifest.gdjsBridge || {};
  var adapters = bridge.runtimeAdapters || [];
  assertArray(adapters, manifest.id + ' gdjsBridge.runtimeAdapters must be an array');
  if (!adapters.length) return;
  assertObject(bridge.adapterRoutes, manifest.id + ' gdjsBridge.adapterRoutes required when runtimeAdapters are present');
  adapters.forEach(function(adapter) {
    var route = bridge.adapterRoutes[adapter];
    assertObject(route, manifest.id + ' gdjsBridge.adapterRoutes missing ' + adapter);
    ['owner', 'mechanism', 'routeId', 'routeOwner', 'routeMechanism'].forEach(function(field) {
      if (!route[field]) throw new Error(manifest.id + ' gdjsBridge.adapterRoutes.' + adapter + ' missing ' + field);
    });
  });
  if (bridge.objectSpec) {
    ['type', 'mechanism', 'routeId', 'routeMechanism'].forEach(function(field) {
      if (!bridge.objectSpec[field]) throw new Error(manifest.id + ' gdjsBridge.objectSpec missing ' + field);
    });
    ['layerEmission', 'placementEmission'].forEach(function(section) {
      assertObject(bridge.objectSpec[section], manifest.id + ' gdjsBridge.objectSpec missing ' + section);
      ['mechanism', 'routeId', 'routeMechanism'].forEach(function(field) {
        if (!bridge.objectSpec[section][field]) throw new Error(manifest.id + ' gdjsBridge.objectSpec.' + section + ' missing ' + field);
      });
    });
    ['shape', 'color', 'width', 'height', 'layer'].forEach(function(key) {
      if ((manifest.compilerManifest.defaultConfig || {})[key] === undefined) {
        throw new Error(manifest.id + ' gdjsBridge.objectSpec requires defaultConfig.' + key);
      }
    });
  }
}

function validateInheritance(manifest) {
  var compiler = manifest.compilerManifest;
  var defaults = compiler.defaultConfig || {};
  var keys = Object.keys(defaults);
  if (!keys.length) return;
  assertObject(compiler.inheritance, manifest.id + ' compilerManifest.inheritance required when defaultConfig is present');
  assertArray(compiler.inheritance.contracts || [], manifest.id + ' inheritance.contracts must be an array');
  if (!(compiler.inheritance.contracts || []).length) throw new Error(manifest.id + ' inheritance.contracts must not be empty');
  if (compiler.inheritance.defaultOwner !== 'component-manifest') {
    throw new Error(manifest.id + ' inheritance.defaultOwner must be component-manifest');
  }
  assertArray(compiler.inheritance.exposedOverrides || [], manifest.id + ' inheritance.exposedOverrides must be an array');
  assertArray(compiler.inheritance.sealedDefaults || [], manifest.id + ' inheritance.sealedDefaults must be an array');
  var classified = {};
  (compiler.inheritance.exposedOverrides || []).forEach(function(key) {
    if (classified[key]) throw new Error(manifest.id + ' inheritance key classified twice: ' + key);
    classified[key] = 'exposedOverrides';
  });
  (compiler.inheritance.sealedDefaults || []).forEach(function(key) {
    if (classified[key]) throw new Error(manifest.id + ' inheritance key classified twice: ' + key);
    classified[key] = 'sealedDefaults';
  });
  keys.forEach(function(key) {
    if (!classified[key]) throw new Error(manifest.id + ' defaultConfig key lacks inheritance classification: ' + key);
  });
}

function validateManifest(manifest, sourceFile) {
  if (manifest.schemaVersion !== 1) throw new Error(sourceFile + ' unsupported component schemaVersion');
  ['id', 'kind', 'name', 'aiManifest', 'compilerManifest'].forEach(function(field) {
    if (manifest[field] === undefined) throw new Error(sourceFile + ' missing ' + field);
  });
  if (!/^[a-z][a-z0-9]*(\.[a-z0-9_]+)+$/.test(manifest.id)) {
    throw new Error(sourceFile + ' invalid component id ' + manifest.id);
  }
  if (['ability', 'control', 'system', 'ui'].indexOf(manifest.kind) < 0) {
    throw new Error(sourceFile + ' invalid component kind ' + manifest.kind);
  }
  validateAiManifest(manifest);
  validateCompilerManifest(manifest);
}

function indexManifest(catalog, manifest) {
  if (catalog.byId[manifest.id]) throw new Error('Duplicate component id: ' + manifest.id);
  catalog.components.push(manifest);
  catalog.byId[manifest.id] = manifest;
  if (!isLlm2Exposed(manifest)) return;
  (manifest.aiManifest.aliases || []).forEach(function(alias) {
    var key = normalize(alias);
    if (!catalog.byAlias[key]) catalog.byAlias[key] = [];
    catalog.byAlias[key].push(manifest);
  });
}

function loadComponentCatalog(dir) {
  dir = dir || COMPONENTS_DIR;
  var catalog = {
    schemaVersion: 1,
    sourceDir: dir,
    components: [],
    byId: {},
    byAlias: {}
  };

  var rawById = {};
  fs.readdirSync(dir).filter(function(file) {
    return /\.json$/i.test(file) && file !== 'schema.json';
  }).sort().forEach(function(file) {
    var fullPath = path.join(dir, file);
    var manifest = readJson(fullPath);
    manifest.sourceFile = file;
    if (!manifest.id) throw new Error(file + ' missing id');
    if (rawById[manifest.id]) throw new Error('Duplicate component id: ' + manifest.id);
    rawById[manifest.id] = manifest;
  });

  var resolved = {};
  Object.keys(rawById).sort().forEach(function(id) {
    var manifest = resolveManifestInheritance(rawById, id, resolved);
    validateManifest(manifest, manifest.sourceFile);
    indexManifest(catalog, manifest);
  });

  return catalog;
}

function getComponent(catalog, id) {
  return catalog.byId[id] || null;
}

function scoreCandidate(manifest, query, action, kind) {
  if (manifest.compilerManifest && manifest.compilerManifest.abstract) return -1;
  if (kind && manifest.kind !== kind) return -1;
  var score = 0;
  var normalizedQuery = normalize(query);
  var aliases = (manifest.aiManifest.aliases || []).map(normalize);
  if (aliases.indexOf(normalizedQuery) >= 0) score += 10;
  aliases.forEach(function(alias) {
    if (normalizedQuery.indexOf(alias) >= 0 || alias.indexOf(normalizedQuery) >= 0) score += 3;
  });

  if (action) {
    var actionKey = normalize(action);
    var actions = (manifest.aiManifest.actions || []).map(normalize);
    if (actions.indexOf(actionKey) >= 0) score += 8;
    else if (actions.length) score -= 4;
  }
  return score;
}

function findByIntent(catalog, query, options) {
  options = options || {};
  var best = null;
  var bestScore = -1;
  catalog.components.forEach(function(manifest) {
    var score = scoreCandidate(manifest, query, options.action, options.kind);
    if (score > bestScore) {
      best = manifest;
      bestScore = score;
    }
  });
  return bestScore > 0 ? best : null;
}

function findControlComponent(catalog, control, action) {
  return findByIntent(catalog, control, { kind: 'control', action: action });
}

function findAbilityComponent(catalog, ability) {
  return findByIntent(catalog, ability, { kind: 'ability' });
}

function findSystemComponent(catalog, systemName) {
  return findByIntent(catalog, systemName, { kind: 'system' });
}

function findUiComponent(catalog, surfaceName) {
  return findByIntent(catalog, surfaceName, { kind: 'ui' });
}

function compilerView(manifest) {
  return clone(manifest.compilerManifest);
}

function isLlm2Exposed(manifest) {
  if (!manifest || !manifest.aiManifest || !manifest.compilerManifest) return false;
  if (manifest.compilerManifest.abstract) return false;
  return manifest.aiManifest.exposeToLlm2 !== false;
}

function aiView(manifest) {
  if (!isLlm2Exposed(manifest)) return null;
  return clone(manifest.aiManifest);
}

module.exports = {
  COMPONENTS_DIR: COMPONENTS_DIR,
  normalize: normalize,
  loadComponentCatalog: loadComponentCatalog,
  validateManifest: validateManifest,
  getComponent: getComponent,
  findByIntent: findByIntent,
  findControlComponent: findControlComponent,
  findAbilityComponent: findAbilityComponent,
  findSystemComponent: findSystemComponent,
  findUiComponent: findUiComponent,
  compilerView: compilerView,
  isLlm2Exposed: isLlm2Exposed,
  aiView: aiView
};
