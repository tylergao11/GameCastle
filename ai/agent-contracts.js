// agent-contracts.js — unified agent contracts, schemas, and validators
// Single source of truth for agent I/O boundaries.

var CONTRACT_VERSION = 1;
var intentSurfaceGuard = require('./intent-surface-guard');

var DESIGN_BRIEF_SCHEMA = {
  schemaVersion: CONTRACT_VERSION,
  description: "LLM1 creative design brief. Contract between RequirementAgent (LLM1) and IntentAgent (LLM2).",
  requiredFields: ["theme", "objects", "rules", "layout", "difficulty", "controls"],
  fieldNotes: {
    theme: "Short game theme string.",
    objects: "Array of {name, kind, note}. kind is an abstract gameplay role (player/enemy/platform/coin/ground/ui/text/decoration). Runtime manifests own sizes, colors, shapes, and defaults.",
    rules: "Array of specific short rule strings.",
    layout: "{placements: [{object, anchor, direction, pattern?}]}. Use natural anchors and directions, never coordinates.",
    behaviors: "Optional. Array of {object, behavior}. behavior is an abstract capability (platformer/platform/jumper).",
    variables: "Optional. Array of {name}. Runtime/compiler layers own initial values.",
    difficulty: "easy | medium | hard.",
    controls: "Short player controls description.",
  },
};

function semanticPlacementFromBriefPlacement(placement) {
  if (!placement) return null;
  var result = {
    object: sanitizeCreativeTextField(placement.object || placement.name)
  };
  if (placement.anchor || placement.near) result.anchor = sanitizeCreativeTextField(placement.anchor || placement.near);
  if (placement.direction) result.direction = sanitizeCreativeTextField(placement.direction);
  if (placement.pattern) result.pattern = sanitizeCreativeTextField(placement.pattern);
  if (result.anchor || result.direction || result.pattern) return result;

  var x = Number(placement.x);
  var y = Number(placement.y);
  if (!isFinite(x) && !isFinite(y)) return result.object ? result : null;
  var horizontal = !isFinite(x) ? null : (x < 267 ? "left" : (x > 533 ? "right" : "center"));
  var vertical = !isFinite(y) ? null : (y < 200 ? "top" : (y > 400 ? "bottom" : "middle"));
  var parts = [];
  if (vertical && vertical !== "middle") parts.push(vertical);
  if (horizontal && horizontal !== "center") parts.push(horizontal);
  result.anchor = "screen";
  result.direction = parts.length ? parts.join("-") : "center";
  return result;
}

function sanitizeCreativeTextField(value) {
  if (value === undefined || value === null) return null;
  var text = String(value).trim();
  if (!text) return null;
  if (intentSurfaceGuard.detectProhibitedSurface(text).length) return null;
  return text;
}

function sanitizeCreativeTextList(list) {
  return (list || []).map(sanitizeCreativeTextField).filter(Boolean);
}

function sanitizeDesignBriefForCreativeContext(brief) {
  if (!brief || typeof brief !== "object") return brief || null;
  return {
    theme: sanitizeCreativeTextField(brief.theme),
    objects: (brief.objects || []).map(function(object) {
      var name = sanitizeCreativeTextField(object.name);
      if (!name) return null;
      return {
        name: name,
        kind: sanitizeCreativeTextField(object.kind),
        note: sanitizeCreativeTextField(object.note)
      };
    }).filter(Boolean),
    rules: sanitizeCreativeTextList(brief.rules),
    layout: {
      placements: (brief.layout && brief.layout.placements || []).map(semanticPlacementFromBriefPlacement).filter(Boolean)
    },
    behaviors: (brief.behaviors || []).map(function(behavior) {
      var object = sanitizeCreativeTextField(behavior.object);
      if (!object) return null;
      return {
        object: object,
        behavior: sanitizeCreativeTextField(behavior.behavior || behavior.type)
      };
    }).filter(Boolean),
    variables: (brief.variables || []).map(function(variable) {
      var name = sanitizeCreativeTextField(variable.name);
      return name ? { name: name } : null;
    }).filter(Boolean),
    difficulty: sanitizeCreativeTextField(brief.difficulty),
    controls: sanitizeCreativeTextField(brief.controls)
  };
}

function validateDesignBrief(brief) {
  if (!brief || typeof brief !== "object") {
    return { valid: false, error: "DesignBrief is not an object" };
  }
  var required = DESIGN_BRIEF_SCHEMA.requiredFields;
  for (var i = 0; i < required.length; i++) {
    if (brief[required[i]] === undefined || brief[required[i]] === null) {
      return { valid: false, error: "DesignBrief missing required field: " + required[i] };
    }
  }
  if (!Array.isArray(brief.objects)) {
    return { valid: false, error: "DesignBrief.objects must be an array" };
  }
  if (!Array.isArray(brief.rules)) {
    return { valid: false, error: "DesignBrief.rules must be an array" };
  }
  if (!brief.layout || !Array.isArray(brief.layout.placements)) {
    return { valid: false, error: "DesignBrief.layout.placements must be an array" };
  }
  for (var o = 0; o < brief.objects.length; o++) {
    var object = brief.objects[o] || {};
    if (object.width !== undefined || object.height !== undefined || object.color !== undefined || object.shape !== undefined) {
      return { valid: false, error: "DesignBrief.objects must not contain runtime visual defaults: " + (object.name || o) };
    }
  }
  for (var p = 0; p < brief.layout.placements.length; p++) {
    var placement = brief.layout.placements[p] || {};
    if (placement.x !== undefined || placement.y !== undefined) {
      return { valid: false, error: "DesignBrief.layout.placements must use natural anchor/direction, not x/y: " + (placement.object || p) };
    }
    if (!placement.object) {
      return { valid: false, error: "DesignBrief.layout.placements item missing object" };
    }
    if (!placement.anchor && !placement.direction) {
      return { valid: false, error: "DesignBrief.layout.placements item must include anchor or direction: " + placement.object };
    }
  }
  var variables = brief.variables || [];
  for (var v = 0; v < variables.length; v++) {
    var variable = variables[v] || {};
    if (variable.value !== undefined || variable.initialValue !== undefined) {
      return { valid: false, error: "DesignBrief.variables must not contain runtime initial values: " + (variable.name || v) };
    }
  }
  return { valid: true };
}

function buildCreativeFeedbackContext(designBrief, executionReport, projectWorld) {
  if (!executionReport) return null;
  return {
    previousBrief: designBrief,
    executionSummary: {
      total: (executionReport.summary && executionReport.summary.total) || 0,
      completed: (executionReport.summary && executionReport.summary.completed) || 0,
      failed: (executionReport.summary && executionReport.summary.failed) || 0,
      nextAction: (executionReport.summary && executionReport.summary.nextAction) || "done",
    },
    worldState: projectWorld ? {
      sceneCount: (projectWorld.scenes || []).length,
      installedModules: (projectWorld.modules || []).map(function(m) { return m.id; }),
    } : null,
  };
}

module.exports = {
  CONTRACT_VERSION: CONTRACT_VERSION,
  DESIGN_BRIEF_SCHEMA: DESIGN_BRIEF_SCHEMA,
  sanitizeDesignBriefForCreativeContext: sanitizeDesignBriefForCreativeContext,
  validateDesignBrief: validateDesignBrief,
  buildCreativeFeedbackContext: buildCreativeFeedbackContext,
};
