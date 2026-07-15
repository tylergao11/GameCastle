function normalizeEndpoint(endpoint) { return String(endpoint || 'https://api.deepseek.com/v1').replace(/\/$/, ''); }
function makeHttpError(response, body) { var error = new Error('Chat Completions API HTTP ' + response.status + ': ' + String(body || '').slice(0, 300)); error.name = 'ChatCompletionsHttpError'; error.status = response.status; error.body = body || ''; return error; }
async function readChatStream(response) {
  var reader = response.body && response.body.getReader ? response.body.getReader() : null;
  if (!reader) { var json = await response.json(), choice = (json.choices || [])[0] || {}, message = choice.message || {}; return { text: message.content || '', reasoningText: message.reasoning_content || '', usage: json.usage || {}, events: [], streamed: false }; }
  var decoder = new TextDecoder(), buffer = '', text = '', reasoningText = '', usage = {}, events = [];
  function line(raw) { raw = raw.trim(); if (!raw || raw.indexOf('data: ') !== 0) return; raw = raw.slice(6); if (raw === '[DONE]') return; var item; try { item = JSON.parse(raw); } catch (_error) { return; } events.push(item.object || 'chat.completion.chunk'); if (item.usage) usage = item.usage; var delta = ((item.choices || [])[0] || {}).delta || {}; text += delta.content || ''; reasoningText += delta.reasoning_content || ''; }
  while (true) { var chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true }); var lines = buffer.split('\n'); buffer = lines.pop() || ''; lines.forEach(line); }
  buffer += decoder.decode(); if (buffer) line(buffer); return { text: text, reasoningText: reasoningText, usage: usage, events: events, streamed: true };
}
async function requestChatCompletions(options) {
  options = options || {};
  var timeoutSignal = Number(options.timeoutMs) > 0 ? AbortSignal.timeout(Number(options.timeoutMs)) : null;
  var signal = timeoutSignal && options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal || options.signal;
  try {
    var response = await (options.fetchImpl || fetch)(normalizeEndpoint(options.endpoint) + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (options.apiKey || '') }, body: JSON.stringify(options.body || {}), signal: signal });
    if (!response.ok) { var body = ''; try { body = await response.text(); } catch (_error) {} throw makeHttpError(response, body); }
    return await readChatStream(response);
  } catch (error) {
    if (timeoutSignal && timeoutSignal.aborted && !(options.signal && options.signal.aborted)) { error = new Error('Chat Completions request exhausted the time budget.'); error.code = 'CHAT_COMPLETIONS_TIMEOUT'; error.owner = 'ChatCompletionsClient'; }
    throw error;
  }
}
module.exports = { normalizeEndpoint: normalizeEndpoint, readChatStream: readChatStream, requestChatCompletions: requestChatCompletions };
