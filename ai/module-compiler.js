var fs = require('fs');
var path = require('path');
var moduleDsl = require('./module-dsl');
var intentSurfaceGuard = require('./intent-surface-guard');

var PRODUCT_MODULE_SCHEMA_VERSION = 1;
var NETWORK_MANIFEST_SCHEMA_VERSION = 1;
var SYNC_MODES = [
  'local',
  'lockstep',
  'lockstep-input',
  'snapshot',
  'event',
  'peer-event',
  'async-state',
  'server-authoritative'
];
var AUTHORITIES = ['client', 'host', 'server'];
var MODULE_COMMAND_KEYS = ['id', 'preset', 'sync', 'authority', 'tickRate', 'seed'];
var BRIDGE_SYNC_MODES = {
  'lockstep': true,
  'lockstep-input': true,
  'server-authoritative': true
};
var CHANNEL_SYNC_MODES = {
  'snapshot': true,
  'event': true,
  'peer-event': true,
  'async-state': true
};

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadProductModuleCatalog(modulesDir) {
  var schema = loadJson(path.join(modulesDir, 'schema.json'));
  if (!schema || schema.schemaVersion !== PRODUCT_MODULE_SCHEMA_VERSION) {
    throw new Error('Unsupported product module schema version');
  }
  var files = fs.readdirSync(modulesDir)
    .filter(function(file) { return file.endsWith('.json') && file !== 'schema.json'; })
    .sort();
  var modules = files.map(function(file) {
    var manifest = loadJson(path.join(modulesDir, file));
    manifest.sourceFile = file;
    return manifest;
  });
  validateProductModules(schema, modules);
  return {
    schemaVersion: PRODUCT_MODULE_SCHEMA_VERSION,
    schema: schema,
    modules: modules
  };
}

function validateProductModules(schema, modules) {
  var required = schema.requiredFields || [];
  var seen = {};
  modules.forEach(function(manifest) {
    required.forEach(function(field) {
      if (manifest[field] === undefined || manifest[field] === null) {
        throw new Error('Product module ' + (manifest.id || manifest.sourceFile) + ' missing field: ' + field);
      }
    });
    if (manifest.schemaVersion !== PRODUCT_MODULE_SCHEMA_VERSION) {
      throw new Error('Product module ' + manifest.id + ' has unsupported schemaVersion');
    }
    if (seen[manifest.id]) throw new Error('Duplicate product module id: ' + manifest.id);
    seen[manifest.id] = true;
    if (!manifest.presets[manifest.defaultPreset]) {
      throw new Error('Product module ' + manifest.id + ' defaultPreset not found: ' + manifest.defaultPreset);
    }
    if (!manifest.compiler || !Array.isArray(manifest.compiler.dsl)) {
      throw new Error('Product module ' + manifest.id + ' must define compiler.dsl');
    }
    validatePatchMap(manifest, 'slotPatches');
    validatePatchMap(manifest, 'configurePatches');
    validateNetworking(manifest);
    validateRepositoryPolicy(manifest);
    validateInteractionContracts(manifest);
    validateIntentFacingModuleFields(manifest);
  });
}

function validateIntentFacingModuleFields(manifest) {
  var text = [
    manifest.name,
    manifest.category,
    manifest.summary,
    Object.keys(manifest.presets || {}).map(function(preset) {
      return preset === 'mobile' ? 'mobile-friendly' : preset;
    }).join('\n')
  ].join('\n');
  intentSurfaceGuard.assertIntentSurfaceAllowed(text);
}

function validateRepositoryPolicy(manifest) {
  var policy = manifest.repositoryPolicy;
  if (!policy) throw new Error('Product module ' + manifest.id + ' missing repositoryPolicy');
  ['preferReuse', 'cloudRepoEligible', 'promoteGeneratedVariants', 'trainingEligible'].forEach(function(field) {
    if (typeof policy[field] !== 'boolean') {
      throw new Error('Product module ' + manifest.id + ' repositoryPolicy.' + field + ' must be boolean');
    }
  });
  if (policy.promotionTarget !== 'cloudModuleRepo') {
    throw new Error('Product module ' + manifest.id + ' repositoryPolicy.promotionTarget must be cloudModuleRepo');
  }
}

function validatePatchMap(manifest, fieldName) {
  var patches = (manifest.compiler && manifest.compiler[fieldName]) || {};
  Object.keys(patches).forEach(function(key) {
    var patch = patches[key];
    if (!Array.isArray(patch.dsl)) {
      throw new Error('Product module ' + manifest.id + ' ' + fieldName + '.' + key + ' must define dsl');
    }
    if (patch.findEvent && !patch.findEvent.textPrefix) {
      throw new Error('Product module ' + manifest.id + ' ' + fieldName + '.' + key + ' findEvent missing textPrefix');
    }
  });
}

function validateNetworking(manifest) {
  var networking = manifest.networking;
  if (!networking) throw new Error('Product module ' + manifest.id + ' missing networking');
  if (!networking.supports || !networking.supports.syncModels || networking.supports.syncModels.length === 0) throw new Error('Product module ' + manifest.id + ' missing networking.supports.syncModels');
  // authority validation moved to runtime policy check
}

function validateInteractionContracts(manifest) {
  var triggers = (manifest.interaction && manifest.interaction.fixedTriggers) || [];
  var configurePatches = (manifest.compiler && manifest.compiler.configurePatches) || {};
  triggers.forEach(function(trigger) {
    if (!trigger.id) throw new Error('Product module ' + manifest.id + ' interaction trigger missing id');
    if (!trigger.labelParam) throw new Error('Product module ' + manifest.id + ' interaction trigger ' + trigger.id + ' missing labelParam');
    if (!trigger.kind) throw new Error('Product module ' + manifest.id + ' interaction trigger ' + trigger.id + ' missing kind');
    if (trigger.kind === 'key' && !trigger.key) {
      throw new Error('Product module ' + manifest.id + ' interaction trigger ' + trigger.id + ' missing key');
    }
    if (trigger.kind === 'mouse_object' && !trigger.object) {
      throw new Error('Product module ' + manifest.id + ' interaction trigger ' + trigger.id + ' missing object');
    }
    if (!configurePatches[trigger.labelParam]) {
      throw new Error('Product module ' + manifest.id + ' interaction trigger ' + trigger.id + ' labelParam is not configurable: ' + trigger.labelParam);
    }
    validateInteractionCopy(manifest.id, trigger.labelParam, manifest.defaults && manifest.defaults[trigger.labelParam], trigger);
  });
}

function buildProductModuleCards(catalog) {
  return catalog.modules.map(function(manifest) {
    return '- ' + manifest.id + ': ' + manifest.llm1Card;
  }).join('\n');
}

function buildModuleDslReference(catalog) {
  var cards = catalog.modules.map(function(manifest) {
    var publicDefaults = clone(manifest.defaults || {});
    Object.keys(getInternalSlots(manifest)).forEach(function(key) {
      delete publicDefaults[key];
    });
    return {
      id: manifest.id,
      name: manifest.name,
      category: manifest.category,
      summary: manifest.summary,
      presets: Object.keys(manifest.presets || {}),
      defaultPreset: manifest.defaultPreset,
      defaults: publicDefaults,
      repositoryPolicy: manifest.repositoryPolicy,
      configurable: Object.keys(getConfigurePatches(manifest)),
      interaction: manifest.interaction || {},
      networking: manifest.networking
    };
  });
  return [
    '=== Product module source of truth ===',
    JSON.stringify(cards, null, 2),
    '',
    '=== Module DSL ===',
    'install module id=<module.id> preset=<preset> sync=<local|lockstep|snapshot|event> authority=<client|host|server> tickRate=<number> seed=<seed>',
    'configure module id=<installed.module.id> key=value ...',
    '',
    'Only output Module DSL lines. Do not output low-level DSL, JSON, Markdown, or project.json.'
  ].join('\n');
}

function normalizeCopy(value) {
  return String(value || '').toLowerCase();
}

function containsCopyTerm(text, term) {
  return normalizeCopy(text).indexOf(normalizeCopy(term)) >= 0;
}

function validateInteractionCopy(moduleId, key, value, trigger) {
  if (value === undefined || value === null) return;
  var rules = trigger.copyRules || {};
  var requiredAny = rules.requiredAny || [];
  var forbiddenTerms = rules.forbiddenTerms || [];
  var text = String(value);
  if (requiredAny.length && !requiredAny.some(function(term) { return containsCopyTerm(text, term); })) {
    throw new Error(
      'Module ' + moduleId + ' configure key ' + key +
      ' must mention one of [' + requiredAny.join(', ') +
      '] because fixed interaction ' + trigger.id + ' uses ' + describeTrigger(trigger)
    );
  }
  forbiddenTerms.forEach(function(term) {
    if (containsCopyTerm(text, term)) {
      throw new Error(
        'Module ' + moduleId + ' configure key ' + key +
        ' mentions unsupported interaction term "' + term +
        '"; fixed interaction ' + trigger.id + ' uses ' + describeTrigger(trigger)
      );
    }
  });
}

function describeTrigger(trigger) {
  if (trigger.kind === 'key') return 'key ' + trigger.key;
  if (trigger.kind === 'mouse_object') return 'mouse click on ' + trigger.object;
  return trigger.kind;
}

function validateInteractionParams(manifest, params) {
  var triggers = (manifest.interaction && manifest.interaction.fixedTriggers) || [];
  triggers.forEach(function(trigger) {
    if (Object.prototype.hasOwnProperty.call(params, trigger.labelParam)) {
      validateInteractionCopy(manifest.id, trigger.labelParam, params[trigger.labelParam], trigger);
    }
  });
}

function indexCatalog(catalog) {
  var byId = {};
  catalog.modules.forEach(function(manifest) {
    byId[manifest.id] = manifest;
  });
  return byId;
}

function validatePolicy(moduleId, manifest, policy) {
  if (SYNC_MODES.indexOf(policy.sync) < 0) throw new Error('Invalid sync mode for ' + moduleId + ': ' + policy.sync);
  if (AUTHORITIES.indexOf(policy.authority) < 0) throw new Error('Invalid authority for ' + moduleId + ': ' + policy.authority);
  var supported = (manifest.networking && manifest.networking.supports) || {};
  if ((supported.syncModels || []).indexOf(policy.sync) < 0) {
    throw new Error('Module ' + moduleId + ' does not support sync=' + policy.sync);
  }
  if ((supported.authority || []).indexOf(policy.authority) < 0) {
    throw new Error('Module ' + moduleId + ' does not support authority=' + policy.authority);
  }
  if (policy.tickRate !== 0 && (!isFinite(Number(policy.tickRate)) || Number(policy.tickRate) < 0)) {
    throw new Error('Invalid tickRate for ' + moduleId + ': ' + policy.tickRate);
  }
}

function isModuleCommandKey(key) {
  return MODULE_COMMAND_KEYS.indexOf(key) >= 0;
}

function getConfigurePatches(manifest) {
  return (manifest.compiler && manifest.compiler.configurePatches) || {};
}

function getInternalSlots(manifest) {
  return (manifest.compiler && manifest.compiler.slots) || {};
}

function validateInstallParams(manifest, params) {
  var defaults = manifest.defaults || {};
  var slots = getInternalSlots(manifest);
  Object.keys(params || {}).forEach(function(key) {
    if (isModuleCommandKey(key)) return;
    if (slots[key] !== undefined) {
      throw new Error('Module ' + manifest.id + ' install key ' + key + ' is an internal compiler slot');
    }
    if (defaults[key] === undefined) {
      throw new Error('Module ' + manifest.id + ' does not support install key: ' + key);
    }
  });
}

function validateConfigureParams(manifest, params) {
  var configurePatches = getConfigurePatches(manifest);
  var slots = getInternalSlots(manifest);
  Object.keys(params || {}).forEach(function(key) {
    if (isModuleCommandKey(key)) return;
    if (slots[key] !== undefined) {
      throw new Error('Module ' + manifest.id + ' configure key ' + key + ' is an internal compiler slot');
    }
    if (!configurePatches[key]) {
      throw new Error('Module ' + manifest.id + ' does not support configure key: ' + key);
    }
  });
}

function makeInstall(command, manifest, options) {
  options = options || {};
  if (!options.isBase) validateInstallParams(manifest, command.params);
  var params = clone(manifest.defaults || {});
  if (options.baseParams) {
    Object.keys(options.baseParams).forEach(function(key) {
      params[key] = options.baseParams[key];
    });
  }
  Object.keys(command.params).forEach(function(key) {
    if (key !== 'id') params[key] = command.params[key];
  });
  validateInteractionParams(manifest, params);
  var preset = params.preset || manifest.defaultPreset;
  if (!manifest.presets[preset]) throw new Error('Module ' + manifest.id + ' does not define preset=' + preset);
  params.preset = preset;

  var defaultPolicy = clone((manifest.networking && manifest.networking.default) || {});
  var policy = {
    sync: params.sync || defaultPolicy.sync,
    authority: params.authority || defaultPolicy.authority,
    tickRate: params.tickRate !== undefined ? params.tickRate : defaultPolicy.tickRate,
    seed: params.seed !== undefined ? params.seed : defaultPolicy.seed
  };
  validatePolicy(manifest.id, manifest, policy);
  return {
    id: manifest.id,
    sourceLine: command.lineNumber,
    params: params,
    syncPolicy: policy,
    manifest: manifest,
    isBase: !!options.isBase
  };
}

function makeBaseInstall(baseModule, manifest) {
  var command = {
    lineNumber: 0,
    params: Object.assign({}, baseModule.params || {}, {
      id: baseModule.id,
      preset: baseModule.preset || (baseModule.params && baseModule.params.preset) || manifest.defaultPreset
    })
  };
  if (baseModule.syncPolicy) {
    command.params.sync = baseModule.syncPolicy.sync;
    command.params.authority = baseModule.syncPolicy.authority;
    command.params.tickRate = baseModule.syncPolicy.tickRate;
    command.params.seed = baseModule.syncPolicy.seed;
  }
  return makeInstall(command, manifest, {
    isBase: true,
    baseParams: baseModule.params || {}
  });
}

function applyCommandParams(install, params) {
  Object.keys(params).forEach(function(key) {
    if (key !== 'id') install.params[key] = params[key];
  });
  validateInteractionParams(install.manifest, install.params);
  var policy = {
    sync: install.params.sync || install.syncPolicy.sync,
    authority: install.params.authority || install.syncPolicy.authority,
    tickRate: install.params.tickRate !== undefined ? install.params.tickRate : install.syncPolicy.tickRate,
    seed: install.params.seed !== undefined ? install.params.seed : install.syncPolicy.seed
  };
  validatePolicy(install.id, install.manifest, policy);
  install.syncPolicy = policy;
}

function resolveInstalls(commands, catalog, options) {
  options = options || {};
  var byId = indexCatalog(catalog);
  var installs = [];
  var installedById = {};
  (options.baseModules || []).forEach(function(baseModule) {
    var manifest = byId[baseModule.id];
    if (!manifest) throw new Error('Installed module is no longer in catalog: ' + baseModule.id);
    var install = makeBaseInstall(baseModule, manifest);
    installedById[install.id] = install;
    installs.push(install);
  });
  commands.forEach(function(command) {
    var manifest = byId[command.id];
    if (!manifest) throw new Error('Unknown product module: ' + command.id);
    if (command.verb === 'install') {
      if (installedById[command.id]) throw new Error('Module already installed: ' + command.id);
      var install = makeInstall(command, manifest);
      installedById[install.id] = install;
      installs.push(install);
    } else if (command.verb === 'configure') {
      var existing = installedById[command.id];
      if (!existing) throw new Error('Cannot configure module before install: ' + command.id);
      validateConfigureParams(existing.manifest, command.params);
      command.previousParams = clone(existing.params);
      existing.configCommands = existing.configCommands || [];
      existing.configCommands.push(command);
      applyCommandParams(existing, command.params);
    }
  });
  validateInstallCompatibility(installs);
  return sortInstallsForCompilation(installs);
}

function sortInstallsForCompilation(installs) {
  var priority = {
    core: 10,
    meta: 20,
    system: 30,
    shell: 40,
    network: 50
  };
  return installs.slice().sort(function(a, b) {
    var ap = priority[a.manifest.category] || 100;
    var bp = priority[b.manifest.category] || 100;
    if (ap !== bp) return ap - bp;
    return a.sourceLine - b.sourceLine;
  });
}

function validateInstallCompatibility(installs) {
  var installed = {};
  installs.forEach(function(install) {
    installed[install.id] = true;
  });
  installs.forEach(function(install) {
    (install.manifest.incompatibleWith || []).forEach(function(otherId) {
      if (installed[otherId]) {
        throw new Error('Module ' + install.id + ' is incompatible with ' + otherId);
      }
    });
  });
}

function addUnique(list, seen, values) {
  (values || []).forEach(function(value) {
    if (!seen[value]) {
      seen[value] = true;
      list.push(value);
    }
  });
}

function makeNetworkPlan(networkModules) {
  var plan = {
    schemaVersion: NETWORK_MANIFEST_SCHEMA_VERSION,
    realtime: null,
    channels: [],
    allInputs: [],
    allState: []
  };
  var seenInputs = {};
  var seenState = {};

  networkModules.forEach(function(mod) {
    addUnique(plan.allInputs, seenInputs, mod.inputs || []);
    addUnique(plan.allState, seenState, mod.state || []);
  });

  networkModules.forEach(function(mod) {
    var policy = mod.syncPolicy || {};
    var sync = policy.sync || 'local';
    if (sync === 'local') return;

    if (BRIDGE_SYNC_MODES[sync]) {
      if (!plan.realtime) {
        plan.realtime = {
          sync: sync,
          authority: policy.authority || 'host',
          tickRate: Number(policy.tickRate) || 20,
          seed: policy.seed,
          deterministic: !!mod.deterministic,
          inputs: [],
          state: [],
          moduleIds: []
        };
      } else {
        if (plan.realtime.sync !== sync) {
          throw new Error('Conflicting realtime network sync modes: ' + plan.realtime.sync + ' and ' + sync);
        }
        if ((policy.authority || 'host') !== plan.realtime.authority) {
          throw new Error('Conflicting realtime network authority for sync=' + sync);
        }
        if (policy.tickRate && Number(policy.tickRate) !== plan.realtime.tickRate) {
          throw new Error('Conflicting realtime network tickRate for sync=' + sync);
        }
        plan.realtime.deterministic = plan.realtime.deterministic && !!mod.deterministic;
      }
      addUnique(plan.realtime.inputs, {}, mod.inputs || []);
      addUnique(plan.realtime.state, {}, mod.state || []);
      plan.realtime.moduleIds.push(mod.id);
      return;
    }

    if (CHANNEL_SYNC_MODES[sync]) {
      plan.channels.push({
        id: mod.id,
        sync: sync,
        category: mod.category,
        authority: policy.authority || 'host',
        tickRate: Number(policy.tickRate) || 0,
        seed: policy.seed,
        deterministic: !!mod.deterministic,
        inputs: clone(mod.inputs || []),
        state: clone(mod.state || [])
      });
      return;
    }

    throw new Error('Unsupported network sync mode in plan: ' + sync);
  });

  if (plan.realtime) {
    plan.realtime.inputs = clone(plan.allInputs);
    plan.realtime.state = clone(plan.allState);
  }

  return plan;
}

function renderTemplate(text, values) {
  return String(text).replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, function(_, key) {
    if (values[key] === undefined || values[key] === null) {
      throw new Error('Missing template value: ' + key);
    }
    return String(values[key]);
  });
}

function buildSlotOverrides(installs) {
  var overrides = {};
  installs.forEach(function(install) {
    var links = (install.manifest.compiler && install.manifest.compiler.links) || [];
    links.forEach(function(link) {
      if (!overrides[link.targetModule]) overrides[link.targetModule] = {};
      overrides[link.targetModule][link.slot] = renderTemplate(link.value, install.params);
    });
  });
  return overrides;
}

function findEventIndex(projectWorld, sceneName, textPrefix) {
  if (!projectWorld) throw new Error('ProjectWorld is required to patch an installed module slot');
  var scenes = projectWorld.scenes || [];
  var scene = scenes.find(function(candidate) { return candidate.name === sceneName; });
  if (!scene) throw new Error('Cannot patch module slot; scene not found in ProjectWorld: ' + sceneName);
  var events = scene.events || [];
  for (var i = 0; i < events.length; i++) {
    if (String(events[i].text || '').indexOf(textPrefix) === 0) return i;
  }
  throw new Error('Cannot patch module slot; event not found in scene ' + sceneName + ': ' + textPrefix);
}

function buildSlotPatchLines(install, overrides, projectWorld) {
  var manifest = install.manifest;
  var slotPatches = (manifest.compiler && manifest.compiler.slotPatches) || {};
  var lines = [];
  Object.keys(overrides || {}).forEach(function(slot) {
    if (install.params && install.params[slot] === overrides[slot]) return;
    var patch = slotPatches[slot];
    if (!patch) throw new Error('Module ' + install.id + ' does not define a patch for slot ' + slot);
    var values = {};
    Object.keys(install.params || {}).forEach(function(key) { values[key] = install.params[key]; });
    values[slot] = overrides[slot];
    if (patch.findEvent) {
      var sceneName = values[patch.findEvent.sceneParam || 'scene'];
      var indexParam = patch.findEvent.indexParam || (slot + 'EventIndex');
      values[indexParam] = findEventIndex(projectWorld, sceneName, patch.findEvent.textPrefix);
    }
    (patch.dsl || []).forEach(function(line) {
      lines.push(renderTemplate(line, values));
    });
  });
  return lines;
}

function buildConfigurePatchLines(install, projectWorld) {
  var manifest = install.manifest;
  var configurePatches = (manifest.compiler && manifest.compiler.configurePatches) || {};
  var patchItems = [];
  var changed = {};
  (install.configCommands || []).forEach(function(command) {
    Object.keys(command.params).forEach(function(key) {
      if (key !== 'id' && key !== 'preset' && key !== 'sync' && key !== 'authority' && key !== 'tickRate' && key !== 'seed') {
        if (!changed[key]) changed[key] = command.previousParams || {};
      }
    });
  });
  Object.keys(changed).forEach(function(key) {
    var patch = configurePatches[key];
    if (!patch) throw new Error('Module ' + install.id + ' does not support configure key: ' + key);
    var values = {};
    Object.keys(install.params || {}).forEach(function(paramKey) { values[paramKey] = install.params[paramKey]; });
    var previousValues = {};
    Object.keys(changed[key] || {}).forEach(function(paramKey) { previousValues[paramKey] = changed[key][paramKey]; });
    if (patch.findEvent) {
      var sceneName = previousValues[patch.findEvent.sceneParam || 'scene'];
      var indexParam = patch.findEvent.indexParam || (key + 'EventIndex');
      values[indexParam] = findEventIndex(projectWorld, sceneName, renderTemplate(patch.findEvent.textPrefix, previousValues));
    }
    patchItems.push({
      eventIndex: patch.findEvent ? values[patch.findEvent.indexParam || (key + 'EventIndex')] : -1,
      lines: (patch.dsl || []).map(function(line) {
        return renderTemplate(line, values);
      })
    });
  });
  patchItems.sort(function(a, b) {
    return b.eventIndex - a.eventIndex;
  });
  return patchItems.reduce(function(all, item) {
    return all.concat(item.lines);
  }, []);
}

function compileModuleDslText(text, catalog, options) {
  return compileModuleCommands(moduleDsl.parseModuleDsl(text), catalog, options);
}

function compileModuleCommands(commands, catalog, options) {
  options = options || {};
  var installs = resolveInstalls(commands, catalog, options);
  var slotOverrides = buildSlotOverrides(installs);
  var lines = [];
  var installedModules = [];
  var networkModules = [];

  installs.forEach(function(install) {
    var manifest = install.manifest;
    var slots = clone((manifest.compiler && manifest.compiler.slots) || {});
    Object.keys(slotOverrides[install.id] || {}).forEach(function(slot) {
      slots[slot] = slotOverrides[install.id][slot];
    });
    var values = {};
    Object.keys(install.params).forEach(function(key) { values[key] = install.params[key]; });
    Object.keys(slots).forEach(function(key) { values[key] = slots[key]; });
    var effectiveParams = clone(install.params);
    Object.keys(slots).forEach(function(key) { effectiveParams[key] = slots[key]; });
    if (install.isBase) {
      lines = lines.concat(buildSlotPatchLines(install, slotOverrides[install.id], options.projectWorld));
      lines = lines.concat(buildConfigurePatchLines(install, options.projectWorld));
    } else {
      (manifest.compiler.dsl || []).forEach(function(line) {
        lines.push(renderTemplate(line, values));
      });
    }
    installedModules.push({
      id: install.id,
      name: manifest.name,
      category: manifest.category,
      preset: install.params.preset,
      params: effectiveParams,
      syncPolicy: clone(install.syncPolicy),
      sourceLine: install.sourceLine
    });
    networkModules.push({
      id: install.id,
      category: manifest.category,
      syncPolicy: clone(install.syncPolicy),
      deterministic: !!(manifest.networking && manifest.networking.determinism && manifest.networking.determinism.supported),
      inputs: clone((manifest.networking && manifest.networking.inputs) || []),
      state: clone((manifest.networking && manifest.networking.state) || [])
    });
  });

  return {
    schemaVersion: 1,
    dslText: lines.join('\n'),
    dslLines: lines,
    installedModules: installedModules,
    networkManifest: {
      schemaVersion: NETWORK_MANIFEST_SCHEMA_VERSION,
      modules: networkModules,
      plan: makeNetworkPlan(networkModules)
    }
  };
}

function saveNetworkManifest(stateDir, manifest) {
  fs.mkdirSync(stateDir, { recursive: true });
  var filePath = path.join(stateDir, 'network-manifest.json');
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2));
  return filePath;
}

module.exports = {
  loadProductModuleCatalog: loadProductModuleCatalog,
  validateProductModules: validateProductModules,
  buildProductModuleCards: buildProductModuleCards,
  buildModuleDslReference: buildModuleDslReference,
  compileModuleDslText: compileModuleDslText,
  compileModuleCommands: compileModuleCommands,
  makeNetworkPlan: makeNetworkPlan,
  saveNetworkManifest: saveNetworkManifest
};
