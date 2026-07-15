var PROVIDER = 'deepseek';
var MODEL = 'deepseek-v4-flash';

var LLM1 = Object.freeze({
  provider: PROVIDER,
  model: MODEL,
  thinking: Object.freeze({ type: 'enabled' }),
  reasoningEffort: 'medium',
  temperature: 1.5
});

var LLM2 = Object.freeze({
  provider: PROVIDER,
  model: MODEL,
  thinking: Object.freeze({ type: 'enabled' }),
  reasoningEffort: 'medium',
  temperature: 0
});

module.exports = { PROVIDER: PROVIDER, MODEL: MODEL, LLM1: LLM1, LLM2: LLM2 };
