// agent-contracts.js — unified agent contracts, schemas, and validators
// Single source of truth for agent I/O boundaries.

var CONTRACT_VERSION = 1;

var DESIGN_BRIEF_SCHEMA = {
  schemaVersion: CONTRACT_VERSION,
  description: "LLM1 creative design brief. Contract between RequirementAgent (LLM1) and DSLAgent (LLM2).",
  requiredFields: ["theme", "objects", "rules", "layout", "difficulty", "controls"],
  fieldNotes: {
    theme: "Short game theme string.",
    objects: "Array of {name, kind, color, width, height, note}. kind is an abstract gameplay role (player/enemy/platform/coin/ground/ui/text/decoration).",
    rules: "Array of specific short rule strings.",
    layout: "{placements: [{object, x, y}]}.",
    behaviors: "Optional. Array of {object, behavior}. behavior is an abstract capability (platformer/platform/jumper).",
    variables: "Optional. Array of {name, value}.",
    difficulty: "easy | medium | hard.",
    controls: "Short player controls description.",
  },
};

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
  validateDesignBrief: validateDesignBrief,
  buildCreativeFeedbackContext: buildCreativeFeedbackContext,
};