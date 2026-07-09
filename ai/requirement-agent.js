var agentWorkflow = require('./agent-workflow');
var agentContracts = require('./agent-contracts');
var intentSurfaceGuard = require('./intent-surface-guard');

function buildRequirementSystemPrompt(creativeCapabilitySummary) {
  return [
    'You are GameCastle RequirementModel.',
    'Turn the user request into a lightweight creative design brief for a playable, iterative game.',
    'You are not the compiler. Do not output engine target code, backend commands, engine files, or template internals.',
    'Describe placement in natural game-world terms. Do not output coordinates, object sizes, colors as implementation defaults, engine ids, or runtime fields.',
    '',
    'Output strict JSON with exactly these top-level keys:',
    '{',
    '  "theme": "short game theme",',
    '  "objects": [',
    '    {"name":"EnglishName","kind":"player/enemy/platform/coin/ground/ui/text/decoration","note":"brief game role of this object"}',
    '  ],',
    '  "rules": ["specific short rule, for example: Player collides Coin -> coin disappears + score increases"],',
    '  "layout": {"placements":[{"object":"ObjectName","anchor":"screen/Player/ObjectName","direction":"top-left/top-right/bottom-left/bottom-right/front/behind/left/right/above/below/center","pattern":"single/trail/line/guard"}]},',
    '  "behaviors": [{"object":"ObjectName","behavior":"platformer/platform/jumper"}],',
    '  "variables": [{"name":"Score"}],',
    '  "difficulty": "easy",',
    '  "controls": "short player controls"',
    '}',
    '',
    'Capability hints for creative boundaries only. Do not restate them as template structure:',
    creativeCapabilitySummary,
    '',
    'Rules:',
    '- Keep object names in English.',
    '- Make rules concrete, not vague.',
    '- Prefer a small playable first version over a sprawling design.',
    '- Preserve existing experience when iterating unless the user asks to replace it.',
    '- Use layout placements like screen bottom-left or Player front; never x/y.',
    '- Use object roles and notes for visual intent; runtime manifests own sizes, colors, shapes, and defaults.',
  ].filter(Boolean).join('\n');
}

function buildRequirementUserPrompt(userPrompt, previousBrief) {
  var safeUserPrompt = sanitizeRequirementUserText(userPrompt);
  if (!previousBrief) return 'User request: ' + safeUserPrompt;
  var safePreviousBrief = agentContracts.sanitizeDesignBriefForCreativeContext(previousBrief);
  return [
    'Current design brief:',
    JSON.stringify(safePreviousBrief, null, 2),
    '',
    'User iteration request:',
    safeUserPrompt,
    '',
    'Return the full updated design brief JSON.',
  ].join('\n');
}

function sanitizeRequirementUserText(text) {
  var omitted = 0;
  var lines = String(text || '').split(/\r?\n/).map(function(line) {
    line = String(line || '').trim();
    if (!line) return null;
    if (intentSurfaceGuard.detectProhibitedSurface(line).length) {
      omitted++;
      return null;
    }
    return line;
  }).filter(Boolean);
  if (lines.length) return lines.join('\n');
  return omitted ? '[user request omitted because it contained prohibited machine syntax]' : '';
}

function sanitizeRequirementHistory(history) {
  return (history || []).map(function(message) {
    if (!message) return message;
    if (message.role === 'user') {
      return {
        role: message.role,
        content: sanitizeRequirementUserText(message.content)
      };
    }
    if (message.role !== 'assistant') return message;
    try {
      var parsed = JSON.parse(message.content);
      return {
        role: message.role,
        content: JSON.stringify(agentContracts.sanitizeDesignBriefForCreativeContext(parsed))
      };
    } catch (e) {
      return message;
    }
  });
}

async function generateDesignBrief(options) {
  var systemPrompt = buildRequirementSystemPrompt(options.creativeCapabilitySummary);
  var userContent = buildRequirementUserPrompt(options.userPrompt, options.previousBrief);
  var messages = [{ role: 'system', content: systemPrompt }];
  sanitizeRequirementHistory(options.history).forEach(function(message) { messages.push(message); });
  messages.push({ role: 'user', content: userContent });

  var text = await options.callModel(
    userContent,
    systemPrompt,
    agentWorkflow.buildTextCallOptions('requirement', {
      label: 'LLM1-Requirement',
      input: messages,
    })
  );
  if (!text) return null;
  try {
    var brief = JSON.parse(text.trim());
  var validation = agentContracts.validateDesignBrief(brief);
  if (!validation.valid) {
    console.error("[LLM1] DesignBrief validation failed: " + validation.error);
    console.error("[LLM1] Received: " + JSON.stringify(brief).substring(0, 200));
    return null;
  }
  return brief;
  } catch(e) {
    console.error('[LLM1] Failed to parse JSON: ' + text.substring(0, 100));
    return null;
  }
}

module.exports = {
  buildRequirementSystemPrompt: buildRequirementSystemPrompt,
  buildRequirementUserPrompt: buildRequirementUserPrompt,
  sanitizeRequirementUserText: sanitizeRequirementUserText,
  sanitizeRequirementHistory: sanitizeRequirementHistory,
  generateDesignBrief: generateDesignBrief,
};
