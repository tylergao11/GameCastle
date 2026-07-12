var fs = require('fs');
var path = require('path');
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
    if (!manifest.compiler || !Array.isArray(manifest.compiler.targetPlan)) {
      throw new Error('Product module ' + manifest.id + ' must define compiler.targetPlan');
    }
    (manifest.capabilities || []).forEach(function(capability) {
      if (capability.targetPlan !== undefined) {
        throw new Error('Product module ' + manifest.id + ' capability ' + capability.id + ' must not expose internal target instructions');
      }
    });
    validateUpdateTemplateMap(manifest, 'slotUpdateTemplates');
    validateUpdateTemplateMap(manifest, 'configureUpdateTemplates');
    validateNetworking(manifest);
    validateRepositoryPolicy(manifest);
    validateInteractionContracts(manifest);
    validateIntentFacingModuleFields(manifest);
    validateWp2Contracts(manifest);
  });
}

function validateWp2Contracts(manifest) {
  ['semanticContract', 'spatialContract', 'declarationContract', 'lifecycleContract', 'ownershipContract', 'acceptanceContract'].forEach(function(field) {
    if (!manifest[field] || typeof manifest[field] !== 'object') throw new Error('Product module ' + manifest.id + ' missing ' + field);
  });
  if (!manifest.revision || typeof manifest.revision !== 'string') throw new Error('Product module ' + manifest.id + ' missing immutable revision');
  ['provides', 'requires', 'goals', 'roles', 'pressures', 'rewards'].forEach(function(field) { if (!Array.isArray(manifest.semanticContract[field])) throw new Error('Product module ' + manifest.id + ' semanticContract.' + field + ' must be array'); });
  ['supportedTopologies', 'requiredRoles', 'optionalRoles', 'constraints', 'variationParameters'].forEach(function(field) { if (!Array.isArray(manifest.spatialContract[field])) throw new Error('Product module ' + manifest.id + ' spatialContract.' + field + ' must be array'); });
  ['spatialSubjects', 'sharedArtifacts'].forEach(function(field) { if (!Array.isArray(manifest.declarationContract[field])) throw new Error('Product module ' + manifest.id + ' declarationContract.' + field + ' must be array'); });
  ['start', 'pause', 'failure', 'restart', 'continue'].forEach(function(field) { if (!manifest.lifecycleContract[field]) throw new Error('Product module ' + manifest.id + ' lifecycleContract.' + field + ' required'); });
  ['artifacts', 'cleanupOrder'].forEach(function(field) { if (!Array.isArray(manifest.ownershipContract[field])) throw new Error('Product module ' + manifest.id + ' ownershipContract.' + field + ' must be array'); });
  if (!manifest.ownershipContract.stateMigrationPolicy) throw new Error('Product module ' + manifest.id + ' ownershipContract.stateMigrationPolicy required');
  ['createFixture', 'continueFixture', 'failureFixtures', 'supportedLayoutFixtures', 'playGoals'].forEach(function(field) { if (manifest.acceptanceContract[field] === undefined) throw new Error('Product module ' + manifest.id + ' acceptanceContract.' + field + ' required'); });
}

function declareModuleSubjects(compositionPlan, catalog) {
  catalog = catalog || loadProductModuleCatalog(path.join(__dirname, 'product-modules'));
  var byId = indexCatalog(catalog);
  var subjects = [], sharedArtifacts = [];
  (compositionPlan.operations || []).forEach(function(operation) {
    if (operation.op === 'remove') return;
    var ref = operation.toModule || operation.fromModule;
    var manifest = ref && byId[ref.moduleId];
    if (!manifest) throw new Error('Module declaration references unknown module');
    (manifest.declarationContract.spatialSubjects || []).forEach(function(subject) {
      subjects.push(Object.assign({}, clone(subject), { moduleId: manifest.id, moduleRevision: manifest.revision }));
    });
    (manifest.declarationContract.sharedArtifacts || []).forEach(function(artifact) { sharedArtifacts.push(clone(artifact)); });
  });
  var declaration = { schemaVersion: 1, declarationPlanId: compositionPlan.planId + ':declaration', compositionPlanId: compositionPlan.planId, catalogFingerprint: compositionPlan.catalogFingerprint, subjects: subjects, sharedArtifacts: sharedArtifacts, declarationHash: '' };
  declaration.declarationHash = require('crypto').createHash('sha256').update(JSON.stringify(declaration)).digest('hex').slice(0, 16);
  return declaration;
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

function validateUpdateTemplateMap(manifest, fieldName) {
  var templates = (manifest.compiler && manifest.compiler[fieldName]) || {};
  Object.keys(templates).forEach(function(key) {
    var template = templates[key];
    if (!Array.isArray(template.targetPlan)) {
      throw new Error('Product module ' + manifest.id + ' ' + fieldName + '.' + key + ' must define targetPlan');
    }
    if (template.findEvent && !template.findEvent.textPrefix) {
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
  var configureUpdateTemplates = (manifest.compiler && manifest.compiler.configureUpdateTemplates) || {};
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
    if (!configureUpdateTemplates[trigger.labelParam]) {
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

function getConfigureUpdateTemplates(manifest) {
  return (manifest.compiler && manifest.compiler.configureUpdateTemplates) || {};
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
  var configureUpdateTemplates = getConfigureUpdateTemplates(manifest);
  var slots = getInternalSlots(manifest);
  Object.keys(params || {}).forEach(function(key) {
    if (isModuleCommandKey(key)) return;
    if (slots[key] !== undefined) {
      throw new Error('Module ' + manifest.id + ' configure key ' + key + ' is an internal compiler slot');
    }
    if (!configureUpdateTemplates[key]) {
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
    if (!manifest) throw new Error('Installed module is missing from catalog: ' + baseModule.id);
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
  validateInstallConflicts(installs);
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

function validateInstallConflicts(installs) {
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
  if (!projectWorld) throw new Error('ProjectWorld is required to update an installed module slot');
  var scenes = projectWorld.scenes || [];
  var scene = scenes.find(function(candidate) { return candidate.name === sceneName; });
  if (!scene) throw new Error('Cannot update module slot; scene not found in ProjectWorld: ' + sceneName);
  var events = scene.events || [];
  for (var i = 0; i < events.length; i++) {
    if (String(events[i].text || '').indexOf(textPrefix) === 0) return i;
  }
  throw new Error('Cannot update module slot; event not found in scene ' + sceneName + ': ' + textPrefix);
}

function buildSlotUpdateLines(install, overrides, projectWorld) {
  var manifest = install.manifest;
  var slotUpdateTemplates = (manifest.compiler && manifest.compiler.slotUpdateTemplates) || {};
  var lines = [];
  Object.keys(overrides || {}).forEach(function(slot) {
    if (install.params && install.params[slot] === overrides[slot]) return;
    var template = slotUpdateTemplates[slot];
    if (!template) throw new Error('Module ' + install.id + ' does not define an update template for slot ' + slot);
    var values = {};
    Object.keys(install.params || {}).forEach(function(key) { values[key] = install.params[key]; });
    values[slot] = overrides[slot];
    if (template.findEvent) {
      var sceneName = values[template.findEvent.sceneParam || 'scene'];
      var indexParam = template.findEvent.indexParam || (slot + 'EventIndex');
      values[indexParam] = findEventIndex(projectWorld, sceneName, template.findEvent.textPrefix);
    }
    (template.targetPlan || []).forEach(function(line) {
      lines.push(renderTemplate(line, values));
    });
  });
  return lines;
}

function buildConfigureUpdateLines(install, projectWorld) {
  var manifest = install.manifest;
  var configureUpdateTemplates = (manifest.compiler && manifest.compiler.configureUpdateTemplates) || {};
  var updateItems = [];
  var changed = {};
  (install.configCommands || []).forEach(function(command) {
    Object.keys(command.params).forEach(function(key) {
      if (key !== 'id' && key !== 'preset' && key !== 'sync' && key !== 'authority' && key !== 'tickRate' && key !== 'seed') {
        if (!changed[key]) changed[key] = command.previousParams || {};
      }
    });
  });
  Object.keys(changed).forEach(function(key) {
    var template = configureUpdateTemplates[key];
    if (!template) throw new Error('Module ' + install.id + ' does not support configure key: ' + key);
    var values = {};
    Object.keys(install.params || {}).forEach(function(paramKey) { values[paramKey] = install.params[paramKey]; });
    var previousValues = {};
    Object.keys(changed[key] || {}).forEach(function(paramKey) { previousValues[paramKey] = changed[key][paramKey]; });
    if (template.findEvent) {
      var sceneName = previousValues[template.findEvent.sceneParam || 'scene'];
      var indexParam = template.findEvent.indexParam || (key + 'EventIndex');
      values[indexParam] = findEventIndex(projectWorld, sceneName, renderTemplate(template.findEvent.textPrefix, previousValues));
    }
    updateItems.push({
      eventIndex: template.findEvent ? values[template.findEvent.indexParam || (key + 'EventIndex')] : -1,
      lines: (template.targetPlan || []).map(function(line) {
        return renderTemplate(line, values);
      })
    });
  });
  updateItems.sort(function(a, b) {
    return b.eventIndex - a.eventIndex;
  });
  return updateItems.reduce(function(all, item) {
    return all.concat(item.lines);
  }, []);
}

function compileModuleCommands(commands, catalog, options) {
  options = options || {};
  var installs = resolveInstalls(commands, catalog, options);
  var slotOverrides = buildSlotOverrides(installs);
  var lines = [];
  var installedModules = [];
  var networkModules = [];

  function pauseGate(line, manifest) {
    if (manifest.category !== 'core' || !/^((on\s+(key|collision|mouse|var)\s+)|every\s+)/.test(line)) return line;
    if (line.indexOf('GameCastlePaused') >= 0) return line;
    return 'on var GameCastlePaused = 0 and ' + (line.indexOf('on ') === 0 ? line.slice(3) : line);
  }

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
      lines = lines.concat(buildSlotUpdateLines(install, slotOverrides[install.id], options.projectWorld));
      lines = lines.concat(buildConfigureUpdateLines(install, options.projectWorld));
    } else {
      if (manifest.category === 'core') lines.push('set variable name=GameCastlePaused value=0 type=Number scope=global');
      (manifest.compiler.targetPlan || []).forEach(function(line) {
        lines.push(pauseGate(renderTemplate(line, values), manifest));
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
    targetPlanText: lines.join('\n'),
    targetPlanLines: lines,
    installedModules: installedModules,
    tickRuntimeManifest: {
      schemaVersion: NETWORK_MANIFEST_SCHEMA_VERSION,
      modules: networkModules,
      plan: makeNetworkPlan(networkModules)
    }
  };
}

function compileCompositionPlan(compositionPlan, catalog, options) {
  options = options || {};
  catalog = catalog || loadProductModuleCatalog(path.join(__dirname, 'product-modules'));
  var baseModules = options.baseModules || (options.previousWorld && options.previousWorld.modules) || [];
  (compositionPlan.operations || []).filter(function(operation) { return operation.op === 'remove' || operation.op === 'replace'; }).forEach(function(operation) {
    if (!operation.expectedOwnershipHash || !operation.cleanupPlan || !operation.sharedArtifactPolicy) throw new Error('Guarded ' + operation.op + ' requires ownership proof and cleanup policy');
  });
  var commands = (compositionPlan.operations || []).filter(function(operation) { return operation.op === 'install' || operation.op === 'configure' || operation.op === 'replace'; }).map(function(operation, index) {
    var ref = operation.toModule || operation.fromModule;
    return { verb: operation.op === 'replace' ? 'install' : operation.op, id: ref.moduleId, params: Object.assign({ id: ref.moduleId }, operation.parameters || {}), lineNumber: index + 1 };
  });
  var compiled = compileModuleCommands(commands, catalog, Object.assign({}, options, { baseModules: baseModules }));
  function placementLines(moduleId) {
    return ((options.placementPlan && options.placementPlan.placements) || []).filter(function(placement) { return placement.moduleId === moduleId; }).reduce(function(lines, placement) {
      var point = placement.resolved || (placement.points || [])[0];
      if (point) lines.push('set placement object=' + placement.subject + ' x=' + point.x + ' y=' + point.y + ' scene=' + (placement.scene || 'Game'));
      return lines;
    }, []);
  }
  var allPlacementLines = (compositionPlan.operations || []).filter(function(operation) { return operation.op === 'install' || operation.op === 'replace'; }).reduce(function(lines, operation) { return lines.concat(placementLines(operation.toModule.moduleId)); }, []);
  compiled.targetPlanLines = compiled.targetPlanLines.concat(allPlacementLines);
  compiled.targetPlanText = compiled.targetPlanLines.join('\n');
  compiled.installedModules = (compiled.installedModules || []).map(function(module) {
    var ownedArtifactIds = ['module:' + module.id];
    var selectedRef = (compositionPlan.operations || []).map(function(item) { return item.toModule || item.fromModule; }).filter(Boolean).find(function(ref) { return ref.moduleId === module.id; });
    return Object.assign({}, module, { revision: (selectedRef && selectedRef.revision) || module.revision || 'local-v1', ownershipHash: require('crypto').createHash('sha256').update(JSON.stringify({ id: module.id, params: module.params, ownedArtifactIds: ownedArtifactIds })).digest('hex').slice(0, 16), ownedArtifactIds: ownedArtifactIds });
  });
  var runtimeOperations = (compositionPlan.operations || []).map(function(operation, index) {
    var command;
    var emittedLines = [];
    if (operation.op === 'install' || operation.op === 'replace') {
      command = { verb: 'install', id: operation.toModule.moduleId, params: Object.assign({ id: operation.toModule.moduleId }, operation.parameters || {}), lineNumber: index + 1 };
      emittedLines = compileModuleCommands([command], catalog, options).targetPlanLines.concat(placementLines(operation.toModule.moduleId));
    } else if (operation.op === 'configure') {
      command = { verb: 'configure', id: operation.fromModule.moduleId, params: Object.assign({ id: operation.fromModule.moduleId }, operation.parameters || {}), lineNumber: index + 1 };
      var existing = baseModules.filter(function(module) { return (module.id || module.moduleId) === operation.fromModule.moduleId; });
      if (!existing.length) throw new Error('Cannot configure module without ProjectWorld base module: ' + operation.fromModule.moduleId);
      emittedLines = compileModuleCommands([command], catalog, Object.assign({}, options, { baseModules: existing })).targetPlanLines;
    }
    return {
      operationId: operation.operationId,
      op: operation.op,
      atomicGroupId: operation.atomicGroupId,
      fromModule: clone(operation.fromModule),
      toModule: clone(operation.toModule),
      expectedOwnershipHash: operation.expectedOwnershipHash || null,
      cleanupPlan: clone(operation.cleanupPlan),
      sharedArtifactPolicy: clone(operation.sharedArtifactPolicy),
      stateMigration: clone(operation.stateMigration),
      targetPlanLines: emittedLines
    };
  });
  return {
    schemaVersion: 1,
    compositionPlanId: compositionPlan.planId,
    targetPlanText: compiled.targetPlanText,
    targetPlanLines: compiled.targetPlanLines,
    installedModules: compiled.installedModules,
    removedModules: (compositionPlan.operations || []).filter(function(operation) { return operation.op === 'remove' || operation.op === 'replace'; }).map(function(operation) { return operation.fromModule.moduleId; }),
    tickRuntimeManifest: compiled.tickRuntimeManifest,
    runtimeOperations: runtimeOperations,
    ownershipReceipt: { created: compiled.installedModules.map(function(module) { return module.id; }), updated: [], removed: (compositionPlan.operations || []).filter(function(item) { return item.op === 'remove' || item.op === 'replace'; }).map(function(item) { return item.fromModule.moduleId; }), retained: (compositionPlan.operations || []).filter(function(item) { return item.op === 'retain'; }).map(function(item) { return item.fromModule.moduleId; }) },
    provenance: { owner: 'ProductModuleCompiler', compositionPlanHash: compositionPlan.determinism.outputHash }
  };
}

/*
 * Runtime ownership is deliberately structural rather than name-heuristic.
 * An installation records the exact project fragments it created; a later
 * remove/replace can therefore delete only those fragments, verify ownership,
 * and allow the caller to restore a transaction snapshot on failure.
 */
function stable(value) { return JSON.stringify(value); }
function same(value, other) { return stable(value) === stable(other); }
function artifactKey(kind, sceneName, value) { return kind + ':' + (sceneName || 'global') + ':' + require('crypto').createHash('sha256').update(stable(value)).digest('hex').slice(0, 16); }
function listProjectArtifacts(project) {
  var artifacts = [];
  (project.objects || []).forEach(function(item) { artifacts.push({ artifactId: artifactKey('object', '', item), kind: 'object', scene: null, value: clone(item) }); });
  (project.variables || []).forEach(function(item) { artifacts.push({ artifactId: artifactKey('variable', '', item), kind: 'variable', scene: null, value: clone(item) }); });
  (project.layouts || []).forEach(function(scene) {
    artifacts.push({ artifactId: artifactKey('scene', scene.name, { name: scene.name }), kind: 'scene', scene: scene.name, value: { name: scene.name } });
    ['objects', 'instances', 'events', 'variables'].forEach(function(kind) {
      (scene[kind] || []).forEach(function(item) { artifacts.push({ artifactId: artifactKey(kind, scene.name, item), kind: kind, scene: scene.name, value: clone(item) }); });
    });
  });
  return artifacts;
}
function captureOwnedArtifacts(beforeProject, afterProject) {
  var before = listProjectArtifacts(beforeProject);
  var after = listProjectArtifacts(afterProject);
  var beforeIds = {};
  before.forEach(function(item) { beforeIds[item.artifactId] = true; });
  return after.filter(function(item) { return !beforeIds[item.artifactId]; });
}
function removeOwnedArtifacts(project, module, operation, installedModules) {
  if (!module || !module.ownershipHash || module.ownershipHash !== operation.expectedOwnershipHash) throw new Error('MODULE_REMOVE_UNSAFE: ownership hash does not match');
  var owned = module.ownedArtifacts || [];
  var expected = (operation.cleanupPlan && operation.cleanupPlan.orderedArtifactIds) || [];
  if (expected.length && expected.some(function(id) { return !owned.some(function(item) { return item.artifactId === id; }); })) throw new Error('MODULE_REMOVE_UNSAFE: cleanup plan references unowned artifact');
  var policy = operation.sharedArtifactPolicy || {};
  var shared = policy.artifactIds || [];
  if (shared.some(function(id) { return !owned.some(function(item) { return item.artifactId === id; }); })) throw new Error('MODULE_REMOVE_UNSAFE: shared policy references unowned artifact');
  if (shared.length && (!Array.isArray(policy.remainingOwnerIds) || !policy.remainingOwnerIds.length || !policy.referenceRule)) throw new Error('MODULE_REMOVE_UNSAFE: shared artifact requires remaining owner and reference rule');
  if (shared.length) {
    var installedIds = (installedModules || []).filter(function(candidate) { return candidate && candidate.id !== module.id; }).map(function(candidate) { return candidate.id || candidate.moduleId; });
    if (policy.remainingOwnerIds.some(function(id) { return installedIds.indexOf(id) < 0; })) throw new Error('MODULE_REMOVE_UNSAFE: shared policy remaining owner is not installed');
  }
  var checks = (operation.cleanupPlan && operation.cleanupPlan.dependentChecks) || [];
  if (checks.some(function(check) { return check && check.blocking === true; })) throw new Error('MODULE_REMOVE_UNSAFE: blocking dependent check prevents cleanup');
  var byId = {}; owned.forEach(function(item) { byId[item.artifactId] = item; });
  var ordered = expected.length ? expected.map(function(id) { return byId[id]; }) : owned.slice();
  var targets = ordered.filter(function(item) { return shared.indexOf(item.artifactId) < 0; });
  targets.forEach(function(artifact) {
    if (artifact.kind === 'scene') {
      var sceneForDelete = (project.layouts || []).find(function(scene) { return scene.name === artifact.scene; });
      var foreignArtifactExists = sceneForDelete && ['objects', 'instances', 'events', 'variables'].some(function(kind) {
        return (sceneForDelete[kind] || []).some(function(value) {
          return !owned.some(function(candidate) { return candidate.scene === artifact.scene && candidate.kind === kind && same(candidate.value, value); });
        });
      });
      if (foreignArtifactExists) return;
      project.layouts = (project.layouts || []).filter(function(scene) { return scene.name !== artifact.scene; });
      if (project.firstLayout === artifact.scene) project.firstLayout = (project.layouts[0] && project.layouts[0].name) || '';
      return;
    }
    if (!artifact.scene) {
      var globalBucket = artifact.kind === 'object' ? 'objects' : artifact.kind === 'variable' ? 'variables' : null;
      if (globalBucket) project[globalBucket] = (project[globalBucket] || []).filter(function(item) { return !same(item, artifact.value); });
      return;
    }
    var scene = (project.layouts || []).find(function(item) { return item.name === artifact.scene; });
    if (scene && scene[artifact.kind]) scene[artifact.kind] = scene[artifact.kind].filter(function(item) { return !same(item, artifact.value); });
  });
  return targets.map(function(item) { return item.artifactId; });
}
function migrateState(project, migration, sourceProject) {
  if (!migration || migration.strategy === 'none') return [];
  var copied = [];
  (migration.sourceStateIds || []).forEach(function(sourceId, index) {
    var source = ((sourceProject || project).variables || []).find(function(item) { return item.name === sourceId; });
    var targetId = (migration.targetStateIds || [])[index];
    if (source && targetId) { project.variables = (project.variables || []).filter(function(item) { return item.name !== targetId; }); project.variables.push(Object.assign({}, clone(source), { name: targetId })); copied.push({ from: sourceId, to: targetId }); }
  });
  return copied;
}

function saveTickRuntimeManifest(stateDir, manifest) {
  fs.mkdirSync(stateDir, { recursive: true });
  var filePath = path.join(stateDir, 'tick-runtime-manifest.json');
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2));
  return filePath;
}

module.exports = {
  loadProductModuleCatalog: loadProductModuleCatalog,
  validateProductModules: validateProductModules,
  buildProductModuleCards: buildProductModuleCards,
  compileModuleCommands: compileModuleCommands,
  compileCompositionPlan: compileCompositionPlan,
  listProjectArtifacts: listProjectArtifacts,
  captureOwnedArtifacts: captureOwnedArtifacts,
  removeOwnedArtifacts: removeOwnedArtifacts,
  migrateState: migrateState,
  makeNetworkPlan: makeNetworkPlan,
  declareModuleSubjects: declareModuleSubjects,
  saveTickRuntimeManifest: saveTickRuntimeManifest
};
