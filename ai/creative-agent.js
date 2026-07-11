var agentWorkflow = require('./agent-workflow');
var intentSurfaceGuard = require('./intent-surface-guard');

var DIRECTOR_ORDER_FIELDS = [
  'template_selection',
  'game_definition',
  'play_plan',
  'placement_plan',
  'control_plan',
  'win_condition',
];

function cleanJsonOutput(text) {
  text = String(text || '').trim();
  var fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fence ? fence[1].trim() : text;
}

function templatePalette(productModuleCatalog) {
  return ((productModuleCatalog || {}).modules || []).filter(function(module) {
    return module.category === 'core';
  }).map(function(module) {
    var semanticId = String(module.id || '').replace(/^core\./, 'mobile_').replace(/[^a-z0-9_]/gi, '_');
    return {
      selection: semanticId,
      game_mode: semanticId.replace(/_/g, ' '),
      purpose: module.llm1Card || module.summary || module.name,
    };
  });
}

function parseDirectorOrder(text, productModuleCatalog) {
  var order;
  try {
    order = JSON.parse(cleanJsonOutput(text));
  } catch (error) {
    throw new Error('Director order must be valid JSON: ' + error.message);
  }
  if (!order || typeof order !== 'object' || Array.isArray(order)) {
    throw new Error('Director order must be a JSON object.');
  }
  Object.keys(order).forEach(function(key) {
    if (DIRECTOR_ORDER_FIELDS.indexOf(key) < 0) throw new Error('Director order contains an undeclared slot: ' + key);
  });
  var normalized = {};
  DIRECTOR_ORDER_FIELDS.forEach(function(key) {
    var value = order[key];
    if (typeof value !== 'string' || !value.trim()) throw new Error('Director order slot requires natural language content: ' + key);
    if (value.trim().length > 1200) throw new Error('Director order slot is too long: ' + key);
    normalized[key] = value.trim();
  });
  var allowedTemplates = templatePalette(productModuleCatalog).map(function(item) { return item.selection; });
  if (allowedTemplates.length && allowedTemplates.indexOf(normalized.template_selection) < 0) {
    throw new Error('Director order selected an unavailable template: ' + normalized.template_selection);
  }
  return normalized;
}

function buildCreativeSystemPrompt(productModuleCatalog) {
  return [
    'You are GameCastle Creative Imagination.',
    'Select the game template and state the game plan concisely from the user request.',
    'Return one JSON object with these natural-language director slots:',
    '- template_selection carries one selection from the template palette.',
    '- game_definition carries what game the player is entering.',
    '- play_plan carries how the player will play through the experience.',
    '- placement_plan carries which gameplay things belong in which meaningful areas.',
    '- control_plan carries how the player operates the game.',
    '- win_condition carries how the player completes or wins the experience.',
    'Each slot carries a concise, decisive natural-language game direction.',
    'A semantic mapper will translate the director order into gameplay contracts.',
    '',
    'Template palette:',
    JSON.stringify(templatePalette(productModuleCatalog), null, 2),
  ].join('\n');
}

function buildCreativeUserPrompt(userPrompt, previousVision) {
  var safeUserPrompt = sanitizeCreativeUserText(userPrompt);
  if (!previousVision) return 'User request:\n' + safeUserPrompt;
  return [
    'Current director order:',
    String(previousVision),
    '',
    'User iteration request:',
    safeUserPrompt,
    '',
    'Evolve the director order in response to the request.',
  ].join('\n');
}

function sanitizeCreativeUserText(text) {
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
  return omitted ? '[creative request retained at the natural gameplay layer]' : '';
}

function sanitizeCreativeHistory(history) {
  return (history || []).map(function(message) {
    if (!message) return message;
    if (message.role === 'user') {
      return {
        role: message.role,
        content: sanitizeCreativeUserText(message.content)
      };
    }
    return message;
  });
}

async function generateDirectorOrder(options) {
  var systemPrompt = buildCreativeSystemPrompt(options.productModuleCatalog);
  var userContent = buildCreativeUserPrompt(options.userPrompt, options.previousVision);
  var messages = [{ role: 'system', content: systemPrompt }];
  sanitizeCreativeHistory(options.history).forEach(function(message) { messages.push(message); });
  messages.push({ role: 'user', content: userContent });

  var text = await options.callModel(
    userContent,
    systemPrompt,
    agentWorkflow.buildTextCallOptions('creative', {
      label: 'LLM1-Creative',
      input: messages,
    })
  );
  if (!text) return null;
  return JSON.stringify(parseDirectorOrder(text, options.productModuleCatalog));
}

module.exports = {
  buildCreativeSystemPrompt: buildCreativeSystemPrompt,
  buildCreativeUserPrompt: buildCreativeUserPrompt,
  sanitizeCreativeUserText: sanitizeCreativeUserText,
  sanitizeCreativeHistory: sanitizeCreativeHistory,
  DIRECTOR_ORDER_FIELDS: DIRECTOR_ORDER_FIELDS.slice(),
  templatePalette: templatePalette,
  parseDirectorOrder: parseDirectorOrder,
  generateDirectorOrder: generateDirectorOrder,
};
