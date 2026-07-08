var agentWorkflow = require('./agent-workflow');

function buildRequirementSystemPrompt(creativeCapabilitySummary) {
  return [
    'You are GameCastle RequirementModel.',
    'Turn the user request into a lightweight creative design brief for a playable, iterative game.',
    'You are not the DSL compiler. Do not output Module DSL, low-level DSL, project.json, or template internals.',
    'Canvas target is 800x600 unless the user explicitly asks otherwise.',
    '',
    'Output strict JSON with exactly these top-level keys:',
    '{',
    '  "theme": "short game theme",',
    '  "objects": [',
    '    {"name":"EnglishName","type":"ShapePainter or Text","shape":"rectangle or circle","color":"#RRGGBB","width":32,"height":32,"role":"player/enemy/platform/coin/bullet/ground/ui"}',
    '  ],',
    '  "rules": ["specific short rule, for example: Player collides Coin -> coin disappears + score increases"],',
    '  "layout": {"placements":[{"object":"ObjectName","x":100,"y":400}]},',
    '  "behaviors": [{"object":"ObjectName","type":"PlatformBehavior::PlatformerObjectBehavior"}],',
    '  "variables": [{"name":"Score","value":0}],',
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
  ].filter(Boolean).join('\n');
}

function buildRequirementUserPrompt(userPrompt, previousBrief) {
  if (!previousBrief) return 'User request: ' + userPrompt;
  return [
    'Current design brief:',
    JSON.stringify(previousBrief, null, 2),
    '',
    'User iteration request:',
    userPrompt,
    '',
    'Return the full updated design brief JSON.',
  ].join('\n');
}

async function generateDesignBrief(options) {
  var systemPrompt = buildRequirementSystemPrompt(options.creativeCapabilitySummary);
  var userContent = buildRequirementUserPrompt(options.userPrompt, options.previousBrief);
  var messages = [{ role: 'system', content: systemPrompt }];
  (options.history || []).forEach(function(message) { messages.push(message); });
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
    return JSON.parse(text.trim());
  } catch(e) {
    console.error('[LLM1] Failed to parse JSON: ' + text.substring(0, 100));
    return null;
  }
}

module.exports = {
  buildRequirementSystemPrompt: buildRequirementSystemPrompt,
  buildRequirementUserPrompt: buildRequirementUserPrompt,
  generateDesignBrief: generateDesignBrief,
};
