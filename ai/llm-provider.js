async function callTextModel(prompt, systemPrompt, opts, logger) {
  opts = opts || {};
  logger = logger || function() {};
  var ep = process.env.LLM_ENDPOINT || 'http://127.0.0.1:18081/v1';
  var ak = process.env.DEEPSEEK_API_KEY || '';
  var model = opts.model || process.env.LLM_MODEL || 'deepseek-v4-flash';
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
  var response;
  try {
    response = await fetch(ep + '/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ak },
      body: JSON.stringify(body),
    });
  } catch (fetchErr) {
    console.error(String.fromCharCode(10) + '[' + label + '] Fetch failed: ' + (fetchErr.message || fetchErr));
    return null;
  }

  if (!response.ok) {
    var errText = '';
    try { errText = await response.text(); } catch(e) {}
    console.error(String.fromCharCode(10) + '[' + label + '] HTTP ' + response.status + ': ' + errText.substring(0, 200));
    return null;
  }

  var text = '';
  var reasoningText = '';
  var reader;
  try {
    reader = response.body.getReader();
  } catch(e) {
    console.error(String.fromCharCode(10) + '[' + label + '] getReader failed, json fallback');
    try {
      var data = await response.json();
      var output = data.output || [];
      for (var i = 0; i < output.length; i++) {
        if (output[i].type === 'message' && output[i].content) {
          for (var j = 0; j < output[i].content.length; j++) {
            if (output[i].content[j].type === 'output_text') text += output[i].content[j].text;
          }
        }
      }
    } catch(e2) {}
    var fallbackMs = Date.now() - t0;
    console.log('[' + label + '] ' + (fallbackMs / 1000).toFixed(1) + 's (fallback) ' + text.length + ' chars');
    return text || null;
  }

  var decoder = new TextDecoder();
  var buffer = '';
  var thinkingShown = false;
  var contentStarted = false;

  while (true) {
    var result;
    try { result = await reader.read(); } catch(e) { break; }
    if (result.done) break;
    buffer += decoder.decode(result.value, { stream: true });

    var sseLines = buffer.split(String.fromCharCode(10));
    buffer = sseLines.pop() || '';

    for (var lineIndex = 0; lineIndex < sseLines.length; lineIndex++) {
      var line = sseLines[lineIndex].trim();
      if (!line || line.indexOf('data: ') !== 0) continue;
      var rawData = line.substring(6);
      if (rawData === '[DONE]') continue;

      try {
        var event = JSON.parse(rawData);
        var eventType = event.type || '';

        if (eventType === 'response.reasoning.summary_text.delta' || eventType === 'response.reasoning_text.delta') {
          var reasoningDelta = (event.data && event.data.delta) || event.delta || '';
          if (reasoningDelta) {
            if (!thinkingShown) {
              process.stdout.write(String.fromCharCode(10) + '  [thinking] ');
              thinkingShown = true;
            }
            process.stdout.write(reasoningDelta);
            reasoningText += reasoningDelta;
          }
        } else if (eventType === 'response.output_text.delta' || eventType === 'response.text.delta') {
          var outputDelta = (event.data && event.data.delta) || event.delta || '';
          if (outputDelta) {
            if (thinkingShown && !contentStarted) {
              process.stdout.write(String.fromCharCode(10) + '  [output] ');
              contentStarted = true;
            }
            process.stdout.write(outputDelta);
            text += outputDelta;
          }
        } else if (eventType === 'response.completed') {
          var usage = (event.data && event.data.response && event.data.response.usage) || event.usage || {};
          logger('[' + label + '] usage ' + JSON.stringify(usage));
        }
      } catch(e3) {}
    }
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
