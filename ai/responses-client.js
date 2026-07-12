function normalizeEndpoint(endpoint) {
  return String(endpoint || 'http://127.0.0.1:18081/v1').replace(/\/$/, '');
}

function getDelta(event) {
  return (event.data && event.data.delta) || event.delta || '';
}

function getUsage(event, fallback) {
  return (event.data && event.data.response && event.data.response.usage) ||
    (event.response && event.response.usage) ||
    event.usage ||
    fallback;
}

function makeHttpError(response, body) {
  var error = new Error('Responses API HTTP ' + response.status + ': ' + String(body || '').slice(0, 300));
  error.name = 'ResponsesHttpError';
  error.status = response.status;
  error.body = body || '';
  return error;
}

async function readResponseStream(response, options) {
  options = options || {};
  var reader = response.body && response.body.getReader ? response.body.getReader() : null;
  if (!reader) {
    var data = await response.json();
    var fallbackText = '';
    (data.output || []).forEach(function(output) {
      if (output.type !== 'message') return;
      (output.content || []).forEach(function(content) {
        if (content.type === 'output_text') fallbackText += content.text || '';
      });
    });
    return { text: fallbackText, reasoningText: '', usage: data.usage || {}, events: [], streamed: false };
  }

  var decoder = new TextDecoder();
  var buffer = '';
  var text = '';
  var reasoningText = '';
  var usage = {};
  var events = [];

  function handleLine(line) {
    line = line.trim();
    if (!line || line.indexOf('data: ') !== 0) return;
    var raw = line.substring(6);
    if (raw === '[DONE]') return;
    var event;
    try { event = JSON.parse(raw); } catch (error) { return; }
    var type = event.type || 'unknown';
    events.push(type);
    if (type === 'response.reasoning.summary_text.delta' || type === 'response.reasoning_text.delta') {
      var reasoningDelta = getDelta(event);
      if (!reasoningDelta) return;
      reasoningText += reasoningDelta;
      if (typeof options.onReasoningDelta === 'function') options.onReasoningDelta(reasoningDelta);
    } else if (type === 'response.output_text.delta' || type === 'response.text.delta') {
      var outputDelta = getDelta(event);
      if (!outputDelta) return;
      text += outputDelta;
      if (typeof options.onOutputDelta === 'function') options.onOutputDelta(outputDelta);
    } else if (type === 'response.completed') {
      usage = getUsage(event, usage);
      if (typeof options.onCompleted === 'function') options.onCompleted(usage, event);
    } else if (type === 'response.failed' || type === 'error') {
      var failure = new Error('Responses stream failed: ' + JSON.stringify(event));
      failure.name = 'ResponsesStreamError';
      throw failure;
    }
  }

  while (true) {
    var chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    var lines = buffer.split('\n');
    buffer = lines.pop() || '';
    lines.forEach(handleLine);
  }
  buffer += decoder.decode();
  if (buffer) handleLine(buffer);
  return { text: text, reasoningText: reasoningText, usage: usage, events: events, streamed: true };
}

async function requestResponses(options) {
  options = options || {};
  var fetchImpl = options.fetchImpl || fetch;
  var timeoutId = null;
  var controller = null;
  var signal = options.signal;
  if (options.timeoutMs) {
    controller = new AbortController();
    signal = signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    timeoutId = setTimeout(function() { controller.abort(); }, options.timeoutMs);
  }
  try {
    var response = await fetchImpl(normalizeEndpoint(options.endpoint) + '/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (options.apiKey || ''),
      },
      body: JSON.stringify(options.body || {}),
      signal: signal,
    });
    if (!response.ok) {
      var errorBody = '';
      try { errorBody = await response.text(); } catch (error) {}
      throw makeHttpError(response, errorBody);
    }
    return await readResponseStream(response, options);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

module.exports = {
  normalizeEndpoint: normalizeEndpoint,
  readResponseStream: readResponseStream,
  requestResponses: requestResponses,
};
