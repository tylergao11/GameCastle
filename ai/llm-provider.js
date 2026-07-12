var responsesClient = require('./responses-client');
var governance = require('./ai-provider-governance');

async function callTextModel(prompt, systemPrompt, opts, logger) {
  opts = opts || {};
  logger = logger || function() {};
  var provider = governance.semantic({ model: opts.model });
  var ep = provider.endpoint;
  var ak = provider.apiKey;
  var model = opts.model || provider.textModel;
  var temperature = opts.temperature;
  var reasoningEffort = opts.reasoningEffort || 'xhigh';
  var label = opts.label || 'LLM';
  var agentRole = opts.agentRole || label;
  var maxTokens = opts.maxTokens || 4096;
  logger(
    '[' + label + '] REQ role=' + agentRole +
      ' model=' + model +
      ' reasoning=' + reasoningEffort +
      ' systemPrompt=' + systemPrompt.length + 'chars' +
      ' userPrompt=' + prompt.length + 'chars'
  );

  var t0 = Date.now();
  var body = {
    model: model,
    input: opts.input || [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    max_output_tokens: maxTokens,
    reasoning_effort: reasoningEffort,
    stream: true,
  };
  if (temperature !== undefined && temperature !== null) body.temperature = temperature;

  process.stdout.write('[' + label + '] ' + model + ' ');
  try {
  var thinkingShown = false;
  var contentStarted = false;
    var result = await responsesClient.requestResponses({
      endpoint: ep,
      apiKey: ak,
      body: body,
      onReasoningDelta: function(reasoningDelta) {
        if (!thinkingShown) {
          process.stdout.write(String.fromCharCode(10) + '  [thinking] ');
          thinkingShown = true;
        }
        process.stdout.write(reasoningDelta);
      },
      onOutputDelta: function(outputDelta) {
        if (thinkingShown && !contentStarted) {
          process.stdout.write(String.fromCharCode(10) + '  [output] ');
          contentStarted = true;
        }
        process.stdout.write(outputDelta);
      },
      onCompleted: function(usage) {
        logger('[' + label + '] usage ' + JSON.stringify(usage));
      },
    });
    var text = result.text;
    var reasoningText = result.reasoningText;
  } catch (error) {
    console.error(String.fromCharCode(10) + '[' + label + '] Request failed: ' + (error.message || error));
    return null;
  }

  var elapsedMs = Date.now() - t0;
  if (thinkingShown || contentStarted) process.stdout.write(String.fromCharCode(10));
  var stats = text.length + ' chars';
  if (reasoningText.length > 0) stats += ' | thinking: ' + reasoningText.length + ' chars';
  console.log('[' + label + '] ' + (elapsedMs / 1000).toFixed(1) + 's ' + stats);
  logger('[' + label + '] RES ' + elapsedMs + 'ms output=' + text.length + 'chars reasoning=' + reasoningText.length + 'chars');
  return text;
}

module.exports = {
  callTextModel: callTextModel,
};
