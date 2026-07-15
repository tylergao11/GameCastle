function normalizeEndpoint(endpoint) { return String(endpoint || 'https://api.deepseek.com/v1').replace(/\/$/, ''); }
function makeHttpError(response, body) { var error = new Error('Chat Completions API HTTP ' + response.status + ': ' + String(body || '').slice(0, 300)); error.name = 'ChatCompletionsHttpError'; error.status = response.status; error.body = body || ''; return error; }
async function readChatStream(response) {
  var reader = response.body && response.body.getReader ? response.body.getReader() : null;
  var startedAt = Date.now();
  if (!reader) { var json = await response.json(), choice = (json.choices || [])[0] || {}, message = choice.message || {}, plainText = message.content || '', plainReasoning = message.reasoning_content || ''; return { text: plainText, reasoningText: plainReasoning, finishReason: choice.finish_reason || null, usage: json.usage || {}, events: [], diagnostics: { chunkCount: 0, reasoningChars: plainReasoning.length, contentChars: plainText.length, firstReasoningMs: plainReasoning ? 0 : null, firstContentMs: plainText ? 0 : null, lastChunkMs: 0, elapsedMs: Date.now() - startedAt }, streamed: false }; }
  var decoder = new TextDecoder(), buffer = '', text = '', reasoningText = '', usage = {}, events = [], finishReason = null, chunkCount = 0, firstReasoningMs = null, firstContentMs = null, lastChunkMs = null;
  function diagnostics() { return { chunkCount: chunkCount, reasoningChars: reasoningText.length, contentChars: text.length, firstReasoningMs: firstReasoningMs, firstContentMs: firstContentMs, lastChunkMs: lastChunkMs, elapsedMs: Date.now() - startedAt }; }
  function line(raw) { raw = raw.trim(); if (!raw || raw.indexOf('data:') !== 0) return; raw = raw.slice(5).trimStart(); if (raw === '[DONE]') return; var item; try { item = JSON.parse(raw); } catch (_error) { return; } chunkCount++; lastChunkMs = Date.now() - startedAt; events.push(item.object || 'chat.completion.chunk'); if (item.usage) usage = item.usage; var choice = (item.choices || [])[0] || {}, delta = choice.delta || {}; if (choice.finish_reason) finishReason = choice.finish_reason; if (delta.reasoning_content) { if (firstReasoningMs === null) firstReasoningMs = lastChunkMs; reasoningText += delta.reasoning_content; } if (delta.content) { if (firstContentMs === null) firstContentMs = lastChunkMs; text += delta.content; } }
  try {
    while (true) { var chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true }); var lines = buffer.split('\n'); buffer = lines.pop() || ''; lines.forEach(line); }
    buffer += decoder.decode(); if (buffer) line(buffer);
  } catch (error) {
    error.streamDiagnostics = diagnostics();
    error.partialContent = text;
    throw error;
  }
  return { text: text, reasoningText: reasoningText, finishReason: finishReason, usage: usage, events: events, diagnostics: diagnostics(), streamed: true };
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
    if (timeoutSignal && timeoutSignal.aborted && !(options.signal && options.signal.aborted)) { var timeout = new Error('Chat Completions request exhausted the time budget.'); timeout.code = 'CHAT_COMPLETIONS_TIMEOUT'; timeout.owner = 'ChatCompletionsClient'; timeout.streamDiagnostics = error.streamDiagnostics || null; timeout.partialContent = error.partialContent || ''; error = timeout; }
    throw error;
  }
}
module.exports = { normalizeEndpoint: normalizeEndpoint, readChatStream: readChatStream, requestChatCompletions: requestChatCompletions };
