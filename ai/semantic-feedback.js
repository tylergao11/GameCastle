var fs = require('fs');
var path = require('path');
var projectWorld = require('./project-world');
var intentSurfaceGuard = require('./intent-surface-guard');

var SEMANTIC_FEEDBACK_SCHEMA_VERSION = 1;
var DEFAULT_MAPPING_PATH = path.join(__dirname, 'semantic-mapping', 'semantic-feedback.json');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

function normalizeSubject(value) {
  var text = normalizeText(value);
  if (!text) return null;
  var key = text.toLowerCase().replace(/[^a-z0-9]+/g, '');
  var aliases = currentMapping().subjectAliases || {};
  return aliases[key] || aliases[text.toLowerCase()] || text;
}

function normalizeAmount(value) {
  var text = normalizeText(value).toLowerCase();
  if (text === 'far' || text === 'much' || text === 'a lot') return 'far';
  return 'slightly';
}

function normalizeProbeIssue(issue) {
  var kind = normalizeKey(issue.kind || issue.issueKind || issue.type || issue.id);
  var mapping = currentMapping();
  var profile = mapping.issueProfiles[kind];
  var repair = issue.repair && typeof issue.repair === 'object'
    ? issue.repair
    : (issue.semanticRepair && typeof issue.semanticRepair === 'object' ? issue.semanticRepair : (profile && profile.repair));
  var repairVerb = normalizeKey(issue.repairVerb || (repair && repair.repairVerb) || (profile && profile.repairVerb));
  if (repair && repairVerb && mapping.repairVerbs[repairVerb]) {
    var subject = normalizeSubject(repair.subject || issue.subject || issue.target || issue.object);
    var defaults = subjectDefaults(subject);
    var amount = repair.amount || issue.amount || defaults.amount;
    return {
      kind: kind || repairVerb,
      category: normalizeKey(issue.category || repair.category || (profile && profile.category) || 'semantic'),
      dimension: normalizeKey(issue.dimension || repair.dimension || (profile && profile.dimension) || 'content_density'),
      gameplayRole: normalizeKey(issue.gameplayRole || repair.gameplayRole || (profile && profile.gameplayRole) || 'content'),
      repairVerb: repairVerb,
      owner: 'semantic-feedback',
      status: 'actionable',
      subject: subject,
      anchor: normalizeSubject(repair.anchor || issue.anchor || defaults.anchor),
      direction: normalizeText(repair.direction || issue.direction || defaults.direction),
      pattern: normalizeKey(repair.pattern || issue.pattern || defaults.pattern),
      amount: amount ? normalizeAmount(amount) : null,
      delta: Number(repair.delta || issue.delta || 1),
      severity: normalizeText(issue.severity || 'medium'),
      message: normalizeText(issue.message || issue.summary || kind || repairVerb),
      nextAction: 'repair-intent',
      evidence: clone(issue.evidence || null),
    };
  }
  return {
    kind: kind || 'unknown',
    category: 'unknown',
    owner: 'semantic-feedback',
    status: 'unsupported',
    message: normalizeText(issue.message || issue.summary || 'Unsupported semantic feedback issue'),
    nextAction: 'route-to-owner',
    evidence: clone(issue.evidence || null),
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeAliasKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(label + ' must be an object');
  }
}

function assertSafeTemplateText(value, label) {
  intentSurfaceGuard.assertIntentSurfaceAllowed(String(value || '').replace(/\{[a-zA-Z0-9_]+\}/g, 'semantic'));
  if (String(value || '').indexOf('x=') >= 0 || String(value || '').indexOf('y=') >= 0) {
    throw new Error(label + ' must not contain coordinate assignment syntax');
  }
}

function assertSafeMappingText(value, label) {
  var text = normalizeText(value);
  if (!text) return null;
  intentSurfaceGuard.assertIntentSurfaceAllowed(text);
  return text;
}

function validateSemanticMapping(mapping) {
  assertObject(mapping, 'Semantic mapping');
  if (mapping.schemaVersion !== 1) throw new Error('Semantic mapping schemaVersion mismatch');
  assertObject(mapping.subjectAliases, 'Semantic mapping subjectAliases');
  assertObject(mapping.experienceDimensions, 'Semantic mapping experienceDimensions');
  assertObject(mapping.gameplayRoles, 'Semantic mapping gameplayRoles');
  assertObject(mapping.repairVerbs, 'Semantic mapping repairVerbs');
  assertObject(mapping.measurements, 'Semantic mapping measurements');
  assertObject(mapping.requestSemantics, 'Semantic mapping requestSemantics');
  assertObject(mapping.intentLineStrategies, 'Semantic mapping intentLineStrategies');
  assertObject(mapping.issueProfiles, 'Semantic mapping issueProfiles');
  assertObject(mapping.subjectDefaults, 'Semantic mapping subjectDefaults');
  assertObject(mapping.playGoals, 'Semantic mapping playGoals');
  assertObject(mapping.playIntents, 'Semantic mapping playIntents');
  assertObject(mapping.eventMeanings, 'Semantic mapping eventMeanings');
  assertObject(mapping.tickFeedbackIssues, 'Semantic mapping tickFeedbackIssues');
  Object.keys(mapping.subjectAliases).forEach(function(alias) {
    if (!mapping.subjectAliases[alias]) throw new Error('Semantic mapping empty alias target: ' + alias);
    intentSurfaceGuard.assertIntentSurfaceAllowed(alias + ' ' + mapping.subjectAliases[alias]);
  });
  Object.keys(mapping.intentLineStrategies).forEach(function(strategyId) {
    var strategy = mapping.intentLineStrategies[strategyId];
    assertObject(strategy, 'Semantic mapping intent line strategy ' + strategyId);
    if (['count', 'placement', 'template-route'].indexOf(strategy.kind) < 0) {
      throw new Error('Semantic mapping intent line strategy has unsupported kind: ' + strategyId);
    }
    assertSafeMappingText(strategy.summary, 'Semantic mapping intent line strategy summary ' + strategyId);
    if (strategy.template) assertSafeTemplateText(strategy.template, 'Semantic mapping intent line strategy template ' + strategyId);
  });
  Object.keys(mapping.gameplayRoles).forEach(function(roleId) {
    var role = mapping.gameplayRoles[roleId];
    assertObject(role, 'Semantic mapping gameplay role ' + roleId);
    assertSafeMappingText(roleId, 'Semantic mapping gameplay role id ' + roleId);
    assertSafeMappingText(role.meaning, 'Semantic mapping gameplay role meaning ' + roleId);
    if (role.extends && !mapping.gameplayRoles[role.extends]) {
      throw new Error('Semantic mapping gameplay role extends unknown role: ' + roleId + ' -> ' + role.extends);
    }
    if (!Array.isArray(role.fallbackSubjects)) {
      throw new Error('Semantic mapping gameplay role fallbackSubjects required: ' + roleId);
    }
    role.fallbackSubjects.forEach(function(subject) {
      assertSafeMappingText(subject, 'Semantic mapping gameplay role fallback ' + roleId);
    });
  });
  Object.keys(mapping.gameplayRoles).forEach(function(roleId) {
    var role = mapping.gameplayRoles[roleId];
    if (role.abstract === true) return;
    if (!role.extends) {
      throw new Error('Semantic mapping concrete gameplay role must extend an abstract role: ' + roleId);
    }
    if (!mapping.gameplayRoles[role.extends] || mapping.gameplayRoles[role.extends].abstract !== true) {
      throw new Error('Semantic mapping concrete gameplay role must extend an abstract role: ' + roleId + ' -> ' + role.extends);
    }
  });
  Object.keys(mapping.measurements).forEach(function(measurementId) {
    var measurement = mapping.measurements[measurementId];
    assertSafeMappingText(measurementId, 'Semantic mapping measurement id ' + measurementId);
    assertSafeMappingText(measurement.meaning, 'Semantic mapping measurement meaning ' + measurementId);
    if (measurement.summaryField) {
      assertSafeMappingText(measurement.summaryField, 'Semantic mapping measurement summaryField ' + measurementId);
    }
    if (measurement.improvement && ['increase', 'decrease', 'later-or-none', 'truthy', 'contextual'].indexOf(measurement.improvement) < 0) {
      throw new Error('Semantic mapping measurement has unsupported improvement direction: ' + measurementId + ' -> ' + measurement.improvement);
    }
  });
  Object.keys(mapping.repairVerbs).forEach(function(verbId) {
    var verb = mapping.repairVerbs[verbId];
    assertSafeMappingText(verbId, 'Semantic mapping repair verb id ' + verbId);
    assertSafeMappingText(verb.meaning, 'Semantic mapping repair verb meaning ' + verbId);
    if (!mapping.intentLineStrategies[normalizeKey(verb.intentStrategy)]) {
      throw new Error('Semantic mapping repair verb references unknown intent strategy: ' + verbId + ' -> ' + verb.intentStrategy);
    }
  });
  Object.keys(mapping.experienceDimensions).forEach(function(dimensionId) {
    var dimension = mapping.experienceDimensions[dimensionId];
    assertSafeMappingText(dimensionId, 'Semantic mapping experience dimension id ' + dimensionId);
    assertSafeMappingText(dimension.meaning, 'Semantic mapping experience dimension meaning ' + dimensionId);
    ['roles', 'measurements', 'repairVerbs'].forEach(function(field) {
      if (!Array.isArray(dimension[field]) || !dimension[field].length) {
        throw new Error('Semantic mapping experience dimension field required: ' + dimensionId + '.' + field);
      }
    });
    dimension.roles.forEach(function(roleId) {
      if (!mapping.gameplayRoles[roleId]) throw new Error('Semantic mapping dimension references unknown role: ' + dimensionId + ' -> ' + roleId);
      if (mapping.gameplayRoles[roleId].abstract === true) throw new Error('Semantic mapping dimension must reference concrete role: ' + dimensionId + ' -> ' + roleId);
    });
    dimension.measurements.forEach(function(measurementId) {
      if (!mapping.measurements[measurementId]) throw new Error('Semantic mapping dimension references unknown measurement: ' + dimensionId + ' -> ' + measurementId);
    });
    dimension.repairVerbs.forEach(function(verbId) {
      if (!mapping.repairVerbs[verbId]) throw new Error('Semantic mapping dimension references unknown repair verb: ' + dimensionId + ' -> ' + verbId);
    });
  });
  assertObject(mapping.requestSemantics.slots, 'Semantic mapping requestSemantics slots');
  if (!Array.isArray(mapping.requestSemantics.signals)) {
    throw new Error('Semantic mapping requestSemantics signals must be an array');
  }
  var controlHints = {
    needs_tick_evidence: true,
    stable_current_state: true,
  };
  function assertKnownRequestHint(hint, label) {
    assertSafeMappingText(hint, label);
    if (
      mapping.experienceDimensions[hint] ||
      mapping.gameplayRoles[hint] ||
      mapping.repairVerbs[hint] ||
      mapping.measurements[hint] ||
      controlHints[hint]
    ) {
      return;
    }
    throw new Error(label + ' references unknown semantic hint: ' + hint);
  }
  Object.keys(mapping.requestSemantics.slots).forEach(function(slotId) {
    var slot = mapping.requestSemantics.slots[slotId];
    assertSafeMappingText(slotId, 'Semantic mapping request slot ' + slotId);
    if (!Array.isArray(slot.hints) || !slot.hints.length) {
      throw new Error('Semantic mapping request slot hints required: ' + slotId);
    }
    slot.hints.forEach(function(hint) {
      assertKnownRequestHint(hint, 'Semantic mapping request slot hint ' + slotId);
    });
  });
  mapping.requestSemantics.signals.forEach(function(signal, index) {
    if (!Array.isArray(signal.hints) || !signal.hints.length) {
      throw new Error('Semantic mapping request signal hints required: ' + index);
    }
    if (!Array.isArray(signal.terms) || !signal.terms.length) {
      throw new Error('Semantic mapping request signal terms required: ' + index);
    }
    signal.hints.forEach(function(hint) {
      assertKnownRequestHint(hint, 'Semantic mapping request signal hint ' + index);
    });
    signal.terms.forEach(function(term) {
      assertSafeMappingText(term, 'Semantic mapping request signal term ' + index);
    });
  });
  Object.keys(mapping.issueProfiles).forEach(function(profileId) {
    var profile = mapping.issueProfiles[profileId];
    assertObject(profile.repair, 'Semantic mapping issue profile repair ' + profileId);
    assertSafeMappingText(profile.category, 'Semantic mapping issue profile category ' + profileId);
    if (!mapping.experienceDimensions[profile.dimension]) {
      throw new Error('Semantic mapping issue profile references unknown dimension: ' + profileId + ' -> ' + profile.dimension);
    }
    if (!mapping.gameplayRoles[profile.gameplayRole]) {
      throw new Error('Semantic mapping issue profile references unknown gameplay role: ' + profileId + ' -> ' + profile.gameplayRole);
    }
    if (mapping.gameplayRoles[profile.gameplayRole].abstract === true) {
      throw new Error('Semantic mapping issue profile must reference concrete gameplay role: ' + profileId + ' -> ' + profile.gameplayRole);
    }
    if (!mapping.repairVerbs[profile.repairVerb]) {
      throw new Error('Semantic mapping issue profile references unknown repair verb: ' + profileId + ' -> ' + profile.repairVerb);
    }
    assertSafeMappingText(profile.meaning, 'Semantic mapping issue profile meaning ' + profileId);
  });
  Object.keys(mapping.playGoals).forEach(function(goalId) {
    assertSafeMappingText(goalId, 'Semantic mapping play goal ' + goalId);
    assertSafeMappingText(mapping.playGoals[goalId].meaning, 'Semantic mapping play goal meaning ' + goalId);
  });
  Object.keys(mapping.playIntents).forEach(function(intentId) {
    assertSafeMappingText(intentId, 'Semantic mapping play intent ' + intentId);
    assertSafeMappingText(mapping.playIntents[intentId].meaning, 'Semantic mapping play intent meaning ' + intentId);
  });
  Object.keys(mapping.eventMeanings).forEach(function(eventName) {
    assertSafeMappingText(eventName, 'Semantic mapping event name ' + eventName);
    assertSafeMappingText(mapping.eventMeanings[eventName], 'Semantic mapping event meaning ' + eventName);
  });
  Object.keys(mapping.tickFeedbackIssues).forEach(function(issueId) {
    var issue = mapping.tickFeedbackIssues[issueId];
    assertObject(issue, 'Semantic mapping tick feedback issue ' + issueId);
    if (!mapping.issueProfiles[issue.issueProfile]) {
      throw new Error('Semantic mapping tick feedback issue references unknown profile: ' + issueId + ' -> ' + issue.issueProfile);
    }
    assertSafeMappingText(issueId, 'Semantic mapping tick feedback issue id ' + issueId);
    assertSafeMappingText(issue.meaning, 'Semantic mapping tick feedback issue meaning ' + issueId);
    (issue.evidenceEvents || []).forEach(function(eventName) {
      if (!mapping.eventMeanings[eventName]) {
        throw new Error('Semantic mapping tick feedback issue references unknown event: ' + issueId + ' -> ' + eventName);
      }
    });
  });
  return mapping;
}

function loadSemanticMapping(filePath) {
  return validateSemanticMapping(readJson(filePath || DEFAULT_MAPPING_PATH));
}

var mappingCache = null;

function currentMapping() {
  if (!mappingCache) mappingCache = loadSemanticMapping();
  return mappingCache;
}

function subjectDefaults(subject) {
  var mapping = currentMapping();
  return clone(mapping.subjectDefaults[normalizeSubject(subject)] || {}) || {};
}

function fallbackSubjectForRole(roleId) {
  var mapping = currentMapping();
  var role = mapping.gameplayRoles[roleId];
  if (role && Array.isArray(role.fallbackSubjects) && role.fallbackSubjects.length) {
    return normalizeSubject(role.fallbackSubjects[0]);
  }
  return null;
}

function fallbackSubjectForIssue(issue, fallbackRole) {
  return normalizeSubject(issue.subject) ||
    fallbackSubjectForRole(issue.gameplayRole) ||
    fallbackSubjectForRole(fallbackRole);
}

function fallbackAnchorForIssue(issue) {
  return normalizeSubject(issue.anchor) || fallbackSubjectForRole('actor');
}

function collectIntentPlacements(world) {
  return ((((world || {}).intent || {}).intentGraph || {}).placements || []).filter(Boolean);
}

function normalizeSubjectGroup(value) {
  var text = normalizeText(value).replace(/\s*group$/i, '');
  return normalizeSubject(text);
}

function subjectsMatch(left, right) {
  var normalizedLeft = normalizeSubject(left);
  var normalizedRight = normalizeSubject(right);
  return normalizedLeft === normalizedRight ||
    normalizeSubjectGroup(left) === normalizedRight ||
    normalizedLeft === normalizeSubjectGroup(right);
}

function singularizeSubject(value) {
  var subject = normalizeSubjectGroup(value);
  if (!subject) return subject;
  if (subject.length > 3 && subject.slice(-3) === 'ies') return subject.slice(0, -3) + 'y';
  if (subject.length > 1 && subject.slice(-1) === 's') return subject.slice(0, -1);
  return subject;
}

function worldInstances(world) {
  var scenes = (world || {}).scenes || [];
  var instances = [];
  scenes.forEach(function(scene) {
    instances = instances.concat((scene || {}).instances || []);
  });
  return instances;
}

function countWorldInstances(world, subject) {
  var normalizedSubject = normalizeSubjectGroup(subject);
  var singularSubject = singularizeSubject(subject);
  return worldInstances(world).filter(function(instance) {
    var objectName = instance.object || instance.name;
    var normalizedObject = normalizeSubjectGroup(objectName);
    var singularObject = singularizeSubject(objectName);
    return normalizedObject === normalizedSubject ||
      normalizedObject === singularSubject ||
      singularObject === normalizedSubject ||
      singularObject === singularSubject;
  }).length;
}

function findPlacementCount(world, subject) {
  var instanceCount = countWorldInstances(world, subject);
  var placements = collectIntentPlacements(world);
  var placementCount = null;
  for (var i = 0; i < placements.length; i++) {
    var placement = placements[i];
    if (subjectsMatch(placement.subject, subject) && typeof placement.count === 'number') {
      placementCount = Math.max(placementCount || 0, placement.count);
    }
  }
  if (instanceCount > 0 || placementCount !== null) {
    return Math.max(instanceCount, placementCount || 0);
  }
  return null;
}

function getDefaultCount(subject) {
  var defaults = subjectDefaults(subject);
  return typeof defaults.count === 'number' ? defaults.count : 3;
}

function renderTemplate(template, values) {
  return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, function(_match, key) {
    return values[key] === undefined || values[key] === null ? '' : String(values[key]);
  }).replace(/\s+/g, ' ').trim();
}

function exampleCountForRepair(repair, strategy, subject) {
  var defaults = subjectDefaults(subject);
  var base = typeof defaults.count === 'number' ? defaults.count : 3;
  var delta = Math.max(1, Number(repair.delta || strategy.defaultDelta || 1));
  if (strategy.direction === 'decrease') return Math.max(strategy.minCount || 1, base - delta);
  return base + delta;
}

function strategyForRepair(repairVerb, repairLike) {
  var mapping = currentMapping();
  if (repairLike && repairLike.amount) {
    return mapping.intentLineStrategies.placement_adjust || null;
  }
  var verb = mapping.repairVerbs[normalizeKey(repairVerb)];
  if (!verb) return null;
  return mapping.intentLineStrategies[normalizeKey(verb.intentStrategy)] || null;
}

function renderExampleFromRepair(repair, repairVerb) {
  var strategy = strategyForRepair(repairVerb, repair);
  if (!strategy) return null;
  var subject = normalizeSubject(repair.subject);
  var defaults = subjectDefaults(subject);
  var line = null;
  if (strategy.kind === 'count') {
    line = renderTemplate(strategy.template, {
      subject: subject,
      anchor: normalizeSubject(repair.anchor || defaults.anchor || 'Player'),
      direction: normalizeText(repair.direction || defaults.direction || 'front'),
      pattern: normalizeKey(repair.pattern || defaults.pattern || 'trail'),
      count: exampleCountForRepair(repair, strategy, subject),
    });
  } else if (strategy.kind === 'placement') {
    line = renderTemplate(strategy.template, {
      subject: subject,
      direction: normalizeText(repair.direction || defaults.direction || 'above'),
      amount: normalizeAmount(repair.amount || defaults.amount),
    });
  }
  assertRepairLineSafe(line);
  return line;
}

function buildSemanticMappingLlmView(mapping) {
  mapping = validateSemanticMapping(mapping || currentMapping());
  return {
    schemaVersion: mapping.schemaVersion,
    view: 'llm-safe-semantic-mapping',
    aiFirstTaxonomy: {
      naming: 'experience_dimension -> gameplay_role -> repair_verb -> safe_intent',
      inheritance: 'gameplay roles may extend abstract gameplay roles; concrete subjects are bound by the current world',
    },
    experienceDimensions: Object.keys(mapping.experienceDimensions).sort().map(function(dimensionId) {
      var dimension = mapping.experienceDimensions[dimensionId];
      return {
        dimension: assertSafeMappingText(dimensionId, 'Semantic mapping LLM experience dimension ' + dimensionId),
        meaning: assertSafeMappingText(dimension.meaning, 'Semantic mapping LLM experience dimension meaning ' + dimensionId),
        roles: dimension.roles.map(function(roleId) {
          return assertSafeMappingText(roleId, 'Semantic mapping LLM dimension role ' + dimensionId);
        }),
        measurements: dimension.measurements.map(function(measurementId) {
          return assertSafeMappingText(measurementId, 'Semantic mapping LLM dimension measurement ' + dimensionId);
        }),
        repairVerbs: dimension.repairVerbs.map(function(verbId) {
          return assertSafeMappingText(verbId, 'Semantic mapping LLM dimension repair verb ' + dimensionId);
        }),
      };
    }),
    gameplayRoles: Object.keys(mapping.gameplayRoles).sort().map(function(roleId) {
      var role = mapping.gameplayRoles[roleId];
      return {
        role: assertSafeMappingText(roleId, 'Semantic mapping LLM gameplay role ' + roleId),
        abstract: role.abstract === true,
        extends: role.extends ? assertSafeMappingText(role.extends, 'Semantic mapping LLM gameplay role parent ' + roleId) : null,
        meaning: assertSafeMappingText(role.meaning, 'Semantic mapping LLM gameplay role meaning ' + roleId),
        fallbackSubjects: role.fallbackSubjects.map(function(subject) {
          return assertSafeMappingText(subject, 'Semantic mapping LLM gameplay role fallback ' + roleId);
        }),
      };
    }),
    repairVerbs: Object.keys(mapping.repairVerbs).sort().map(function(verbId) {
      var verb = mapping.repairVerbs[verbId];
      return {
        verb: assertSafeMappingText(verbId, 'Semantic mapping LLM repair verb ' + verbId),
        meaning: assertSafeMappingText(verb.meaning, 'Semantic mapping LLM repair verb meaning ' + verbId),
      };
    }),
    measurements: Object.keys(mapping.measurements).sort().map(function(measurementId) {
      var measurement = mapping.measurements[measurementId];
      return {
        measurement: assertSafeMappingText(measurementId, 'Semantic mapping LLM measurement ' + measurementId),
        meaning: assertSafeMappingText(measurement.meaning, 'Semantic mapping LLM measurement meaning ' + measurementId),
        summaryField: measurement.summaryField ? assertSafeMappingText(measurement.summaryField, 'Semantic mapping LLM measurement summary field ' + measurementId) : null,
        improvement: measurement.improvement ? assertSafeMappingText(measurement.improvement, 'Semantic mapping LLM measurement improvement ' + measurementId) : null,
      };
    }),
    requestSemantics: {
      slots: Object.keys(mapping.requestSemantics.slots).sort().map(function(slotId) {
        var slot = mapping.requestSemantics.slots[slotId];
        return {
          slot: assertSafeMappingText(slotId, 'Semantic mapping LLM request slot ' + slotId),
          hints: slot.hints.map(function(hint) {
            return assertSafeMappingText(hint, 'Semantic mapping LLM request slot hint ' + slotId);
          }),
        };
      }),
      signals: mapping.requestSemantics.signals.map(function(signal, index) {
        return {
          hints: signal.hints.map(function(hint) {
            return assertSafeMappingText(hint, 'Semantic mapping LLM request signal hint ' + index);
          }),
          terms: signal.terms.map(function(term) {
            return assertSafeMappingText(term, 'Semantic mapping LLM request signal term ' + index);
          }),
        };
      }),
    },
    playGoals: Object.keys(mapping.playGoals).sort().map(function(goalId) {
      return {
        goal: assertSafeMappingText(goalId, 'Semantic mapping LLM play goal ' + goalId),
        meaning: assertSafeMappingText(mapping.playGoals[goalId].meaning, 'Semantic mapping LLM play goal meaning ' + goalId),
      };
    }),
    playIntents: Object.keys(mapping.playIntents).sort().map(function(intentId) {
      return {
        intent: assertSafeMappingText(intentId, 'Semantic mapping LLM play intent ' + intentId),
        meaning: assertSafeMappingText(mapping.playIntents[intentId].meaning, 'Semantic mapping LLM play intent meaning ' + intentId),
      };
    }),
    eventMeanings: Object.keys(mapping.eventMeanings).sort().map(function(eventName) {
      return {
        event: assertSafeMappingText(eventName, 'Semantic mapping LLM event ' + eventName),
        meaning: assertSafeMappingText(mapping.eventMeanings[eventName], 'Semantic mapping LLM event meaning ' + eventName),
      };
    }),
    tickFeedbackIssues: Object.keys(mapping.tickFeedbackIssues).sort().map(function(issueId) {
      var issue = mapping.tickFeedbackIssues[issueId];
      return {
        issue: assertSafeMappingText(issueId, 'Semantic mapping LLM tick issue ' + issueId),
        meaning: assertSafeMappingText(issue.meaning, 'Semantic mapping LLM tick issue meaning ' + issueId),
        evidenceEvents: (issue.evidenceEvents || []).map(function(eventName) {
          return assertSafeMappingText(eventName, 'Semantic mapping LLM tick evidence event ' + eventName);
        }),
        feedbackIssue: assertSafeMappingText(issue.issueProfile, 'Semantic mapping LLM tick issue profile ' + issueId),
      };
    }),
    feedbackIssues: Object.keys(mapping.issueProfiles).sort().map(function(profileId) {
      var profile = mapping.issueProfiles[profileId];
      var repair = profile.repair || {};
      return {
        issue: assertSafeMappingText(profileId, 'Semantic mapping LLM issue ' + profileId),
        category: assertSafeMappingText(profile.category, 'Semantic mapping LLM category ' + profileId),
        dimension: assertSafeMappingText(profile.dimension, 'Semantic mapping LLM dimension ' + profileId),
        gameplayRole: assertSafeMappingText(profile.gameplayRole, 'Semantic mapping LLM gameplay role ' + profileId),
        repairVerb: assertSafeMappingText(profile.repairVerb, 'Semantic mapping LLM repair verb ' + profileId),
        meaning: assertSafeMappingText(profile.meaning, 'Semantic mapping LLM meaning ' + profileId),
        safeIntentExample: renderExampleFromRepair(repair, profile.repairVerb),
      };
    }),
    subjectAliases: Object.keys(mapping.subjectAliases).sort().map(function(alias) {
      return {
        alias: assertSafeMappingText(alias, 'Semantic mapping LLM alias ' + alias),
        subject: assertSafeMappingText(mapping.subjectAliases[alias], 'Semantic mapping LLM alias target ' + alias),
      };
    }),
  };
}

function makeCountRepairLine(issue, world, strategy) {
  var current = findPlacementCount(world, issue.subject);
  if (current === null) current = getDefaultCount(issue.subject);
  var delta = Math.max(1, Number(issue.delta || strategy.defaultDelta || 1));
  var minCount = typeof strategy.minCount === 'number' ? strategy.minCount : 1;
  var next = strategy.direction === 'increase' ? current + delta : Math.max(minCount, current - delta);
  var subject = fallbackSubjectForIssue(issue, 'reward');
  var defaults = subjectDefaults(subject);
  return renderTemplate(strategy.template, {
    subject: subject,
    anchor: issue.anchor || defaults.anchor || fallbackAnchorForIssue(issue),
    direction: issue.direction || defaults.direction || 'front',
    pattern: issue.pattern || defaults.pattern || 'trail',
    count: next,
  });
}

function makePlacementRepairLine(issue, strategy) {
  var subject = fallbackSubjectForIssue(issue, 'action_entry');
  var defaults = subjectDefaults(subject);
  return renderTemplate(strategy.template, {
    subject: subject,
    direction: issue.direction || defaults.direction || 'above',
    amount: issue.amount || defaults.amount || 'slightly',
  });
}

function issueToRepairLine(issue, world) {
  if (issue.status !== 'actionable') return null;
  var strategy = strategyForRepair(issue.repairVerb, issue);
  if (!strategy) return null;
  if (strategy.kind === 'placement') return makePlacementRepairLine(issue, strategy);
  if (strategy.kind === 'count') return makeCountRepairLine(issue, world, strategy);
  return null;
}

function assertRepairLineSafe(line) {
  if (!line) return;
  var hits = intentSurfaceGuard.detectProhibitedSurface(line);
  if (hits.length) {
    throw new Error('Semantic feedback generated prohibited repair Intent surface: ' + hits.join(', '));
  }
}

function analyzeSemanticFeedback(options) {
  options = options || {};
  var world = options.projectWorld || null;
  var safeWorld = projectWorld.sanitizeProjectWorldForIntentPrompt(world);
  var safeReport = projectWorld.sanitizeExecutionReportForIntentPrompt(options.executionReport);
  var issues = (options.probeReport && options.probeReport.issues) || options.issues || [];
  var normalizedIssues = issues.map(normalizeProbeIssue);
  var repairLines = [];
  var seen = {};
  normalizedIssues.forEach(function(issue) {
    var line = issueToRepairLine(issue, world);
    if (!line) return;
    assertRepairLineSafe(line);
    if (seen[line]) return;
    seen[line] = true;
    repairLines.push(line);
  });
  return {
    schemaVersion: SEMANTIC_FEEDBACK_SCHEMA_VERSION,
    owner: 'SemanticFeedback',
    input: {
      worldContext: safeWorld,
      executionReport: safeReport,
      semanticMapping: buildSemanticMappingLlmView(),
      probeSummary: options.probeReport ? clone(options.probeReport.summary || null) : null,
    },
    issues: normalizedIssues,
    repairIntentDslText: repairLines.join('\n') + (repairLines.length ? '\n' : ''),
    repairIntentDslLines: repairLines,
    summary: {
      issues: normalizedIssues.length,
      actionable: normalizedIssues.filter(function(issue) { return issue.status === 'actionable'; }).length,
      repairLines: repairLines.length,
      nextAction: repairLines.length ? 'repair-intent' : 'done',
    },
  };
}

function unique(values) {
  var seen = {};
  return (values || []).filter(function(value) {
    var key = String(value || '').trim();
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function requestSemanticHints(userRequest, mapping) {
  var text = String(userRequest || '').trim().toLowerCase();
  var requestSemantics = (mapping || currentMapping()).requestSemantics || {};
  var hints = [];
  var matchedSlots = [];
  var matchedSignals = [];
  Object.keys(requestSemantics.slots || {}).sort().forEach(function(slotId) {
    var slotToken = 'request_slot:' + slotId.toLowerCase();
    if (text.indexOf(slotToken) >= 0) {
      matchedSlots.push(slotId);
      hints = hints.concat(requestSemantics.slots[slotId].hints || []);
    }
  });
  (requestSemantics.signals || []).forEach(function(signal, index) {
    var terms = signal.terms || [];
    var matchedTerm = terms.find(function(term) {
      return text.indexOf(String(term || '').toLowerCase()) >= 0;
    });
    if (matchedTerm) {
      matchedSignals.push({ index: index, term: matchedTerm });
      hints = hints.concat(signal.hints || []);
    }
  });
  return {
    hints: unique(hints),
    matchedSlots: matchedSlots,
    matchedSignals: matchedSignals,
  };
}

function compareMetric(beforeValue, afterValue, direction) {
  var beforeMissing = beforeValue === undefined || beforeValue === null;
  var afterMissing = afterValue === undefined || afterValue === null;
  if (direction === 'truthy') {
    var beforeBool = !!beforeValue;
    var afterBool = !!afterValue;
    return {
      before: beforeValue,
      after: afterValue,
      delta: Number(afterBool) - Number(beforeBool),
      status: afterBool === beforeBool ? 'unchanged' : (afterBool ? 'improved' : 'worsened'),
    };
  }
  if (direction === 'later-or-none') {
    if (beforeMissing && afterMissing) return { before: beforeValue, after: afterValue, delta: 0, status: 'unchanged' };
    if (!beforeMissing && afterMissing) return { before: beforeValue, after: afterValue, delta: null, status: 'improved' };
    if (beforeMissing && !afterMissing) return { before: beforeValue, after: afterValue, delta: null, status: 'worsened' };
    return {
      before: beforeValue,
      after: afterValue,
      delta: Number(afterValue) - Number(beforeValue),
      status: Number(afterValue) === Number(beforeValue) ? 'unchanged' : (Number(afterValue) > Number(beforeValue) ? 'improved' : 'worsened'),
    };
  }
  if (direction === 'contextual') {
    return {
      before: beforeValue,
      after: afterValue,
      delta: beforeMissing || afterMissing ? null : Number(afterValue) - Number(beforeValue),
      status: 'observed',
    };
  }
  if (beforeMissing || afterMissing) {
    return { before: beforeValue, after: afterValue, delta: null, status: 'missing' };
  }
  var delta = Number(afterValue) - Number(beforeValue);
  if (!Number.isFinite(delta)) return { before: beforeValue, after: afterValue, delta: null, status: 'missing' };
  var improved = direction === 'decrease' ? delta < 0 : delta > 0;
  var worsened = direction === 'decrease' ? delta > 0 : delta < 0;
  return {
    before: beforeValue,
    after: afterValue,
    delta: Number(delta.toFixed(4)),
    status: improved ? 'improved' : (worsened ? 'worsened' : 'unchanged'),
  };
}

function measurementIdsForIssues(mapping, issues) {
  var ids = {};
  (issues || []).forEach(function(issue) {
    var dimensionId = issue.dimension || ((mapping.issueProfiles || {})[issue.kind] || {}).dimension;
    var dimension = (mapping.experienceDimensions || {})[dimensionId];
    (dimension && dimension.measurements || []).forEach(function(measurementId) {
      ids[measurementId] = true;
    });
    var metric = issue.evidence && issue.evidence.metric;
    if (metric) {
      Object.keys(mapping.measurements || {}).forEach(function(measurementId) {
        if (mapping.measurements[measurementId].summaryField === metric) ids[measurementId] = true;
      });
    }
  });
  return Object.keys(ids).sort();
}

function uniqueSorted(values) {
  var seen = {};
  (values || []).forEach(function(value) {
    var key = String(value || '').trim();
    if (key) seen[key] = true;
  });
  return Object.keys(seen).sort();
}

function measurementIdsForComparison(mapping, options) {
  var relevantIds = options.measurements || measurementIdsForIssues(mapping, options.issues || options.tickIssues || []);
  if (options.includeGuardMeasurements !== false) {
    relevantIds = uniqueSorted(relevantIds.concat(mapping.semanticImprovementGuardMeasurements || []));
  }
  if (!relevantIds.length) {
    relevantIds = Object.keys(mapping.measurements).filter(function(measurementId) {
      return mapping.measurements[measurementId].summaryField && mapping.measurements[measurementId].improvement !== 'contextual';
    }).sort();
  }
  return relevantIds;
}

function compareSemanticTickSummaries(options) {
  options = options || {};
  var mapping = validateSemanticMapping(options.semanticMapping || currentMapping());
  var beforeSummary = options.beforeSummary || {};
  var afterSummary = options.afterSummary || {};
  var relevantIds = measurementIdsForComparison(mapping, options);
  var comparisons = relevantIds.map(function(measurementId) {
    var measurement = mapping.measurements[measurementId];
    if (!measurement || !measurement.summaryField) return null;
    var result = compareMetric(beforeSummary[measurement.summaryField], afterSummary[measurement.summaryField], measurement.improvement || 'increase');
    return {
      measurement: measurementId,
      summaryField: measurement.summaryField,
      improvement: measurement.improvement || 'increase',
      before: result.before,
      after: result.after,
      delta: result.delta,
      status: result.status,
    };
  }).filter(Boolean);
  var scored = comparisons.filter(function(item) {
    return ['improved', 'worsened', 'unchanged'].indexOf(item.status) >= 0;
  });
  var improvedCount = scored.filter(function(item) { return item.status === 'improved'; }).length;
  var worsenedCount = scored.filter(function(item) { return item.status === 'worsened'; }).length;
  return {
    owner: 'SemanticFeedback',
    view: 'semantic-tick-improvement-comparison',
    measurements: comparisons,
    improved: improvedCount > 0 && worsenedCount === 0,
    regressed: worsenedCount > 0,
    summary: {
      compared: comparisons.length,
      improved: improvedCount,
      worsened: worsenedCount,
      unchanged: scored.filter(function(item) { return item.status === 'unchanged'; }).length,
      missing: comparisons.filter(function(item) { return item.status === 'missing'; }).length,
    },
  };
}

module.exports = {
  SEMANTIC_FEEDBACK_SCHEMA_VERSION: SEMANTIC_FEEDBACK_SCHEMA_VERSION,
  DEFAULT_MAPPING_PATH: DEFAULT_MAPPING_PATH,
  loadSemanticMapping: loadSemanticMapping,
  validateSemanticMapping: validateSemanticMapping,
  buildSemanticMappingLlmView: buildSemanticMappingLlmView,
  requestSemanticHints: requestSemanticHints,
  compareSemanticTickSummaries: compareSemanticTickSummaries,
  analyzeSemanticFeedback: analyzeSemanticFeedback,
  normalizeProbeIssue: normalizeProbeIssue,
};
