function normalizeEndpoint(endpoint) { return String(endpoint || 'https://api.deepseek.com/v1').replace(/\/$/, ''); }
function ollamaRoot(endpoint) {
  return String(endpoint || 'http://127.0.0.1:11434/v1').replace(/\/$/, '').replace(/\/v1$/i, '');
}
function makeHttpError(response, body) { var error = new Error('Chat Completions API HTTP ' + response.status + ': ' + String(body || '').slice(0, 300)); error.name = 'ChatCompletionsHttpError'; error.status = response.status; error.body = body || ''; return error; }

function toOllamaMessages(messages) {
  return (messages || []).map(function(message) {
    if (typeof message.content === 'string' || message.content == null) {
      return { role: message.role, content: message.content == null ? '' : String(message.content) };
    }
    if (!Array.isArray(message.content)) {
      return { role: message.role, content: String(message.content) };
    }
    var text = '';
    var images = [];
    message.content.forEach(function(part) {
      if (!part || typeof part !== 'object') return;
      if (part.type === 'text') text += part.text || '';
      if (part.type === 'image_url') {
        var url = part.image_url && (typeof part.image_url === 'string' ? part.image_url : part.image_url.url) || '';
        var match = String(url).match(/^data:[^;]+;base64,(.+)$/);
        if (match) images.push(match[1]);
      }
    });
    var out = { role: message.role, content: text };
    if (images.length) out.images = images;
    return out;
  });
}

async function readChatStream(response) {
  var reader = response.body && response.body.getReader ? response.body.getReader() : null;
  var startedAt = Date.now();
  if (!reader) {
    var json = await response.json(), choice = (json.choices || [])[0] || {}, message = choice.message || {};
    // DeepSeek uses reasoning_content; Ollama OpenAI-compat uses reasoning.
    var plainText = typeof message.content === 'string' ? message.content : '';
    var plainReasoning = message.reasoning_content || message.reasoning || '';
    return { text: plainText, reasoningText: plainReasoning, finishReason: choice.finish_reason || null, usage: json.usage || {}, events: [], diagnostics: { chunkCount: 0, reasoningChars: plainReasoning.length, contentChars: plainText.length, firstReasoningMs: plainReasoning ? 0 : null, firstContentMs: plainText ? 0 : null, lastChunkMs: 0, elapsedMs: Date.now() - startedAt }, streamed: false };
  }
  var decoder = new TextDecoder(), buffer = '', text = '', reasoningText = '', usage = {}, events = [], finishReason = null, chunkCount = 0, firstReasoningMs = null, firstContentMs = null, lastChunkMs = null;
  function diagnostics() { return { chunkCount: chunkCount, reasoningChars: reasoningText.length, contentChars: text.length, firstReasoningMs: firstReasoningMs, firstContentMs: firstContentMs, lastChunkMs: lastChunkMs, elapsedMs: Date.now() - startedAt }; }
  function line(raw) {
    raw = raw.trim(); if (!raw || raw.indexOf('data:') !== 0) return; raw = raw.slice(5).trimStart(); if (raw === '[DONE]') return;
    var item; try { item = JSON.parse(raw); } catch (_error) { return; }
    chunkCount++; lastChunkMs = Date.now() - startedAt; events.push(item.object || 'chat.completion.chunk'); if (item.usage) usage = item.usage;
    var choice = (item.choices || [])[0] || {}, delta = choice.delta || {};
    if (choice.finish_reason) finishReason = choice.finish_reason;
    var deltaReasoning = delta.reasoning_content || delta.reasoning;
    if (typeof deltaReasoning === 'string' && deltaReasoning) { if (firstReasoningMs === null) firstReasoningMs = lastChunkMs; reasoningText += deltaReasoning; }
    if (typeof delta.content === 'string' && delta.content) { if (firstContentMs === null) firstContentMs = lastChunkMs; text += delta.content; }
  }
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

// Ollama native /api/chat: think:false is honored here; OpenAI-compat /v1 often ignores it for Qwen3.
async function readOllamaNativeStream(response) {
  var reader = response.body && response.body.getReader ? response.body.getReader() : null;
  var startedAt = Date.now();
  if (!reader) {
    var json = await response.json();
    var message = json.message || {};
    var plainText = typeof message.content === 'string' ? message.content : '';
    var plainThinking = message.thinking || message.reasoning || '';
    return {
      text: plainText,
      reasoningText: plainThinking,
      finishReason: json.done_reason || (json.done ? 'stop' : null),
      usage: {
        prompt_tokens: json.prompt_eval_count || 0,
        completion_tokens: json.eval_count || 0,
        total_tokens: (json.prompt_eval_count || 0) + (json.eval_count || 0)
      },
      events: [],
      diagnostics: { chunkCount: 0, reasoningChars: plainThinking.length, contentChars: plainText.length, firstReasoningMs: plainThinking ? 0 : null, firstContentMs: plainText ? 0 : null, lastChunkMs: 0, elapsedMs: Date.now() - startedAt },
      streamed: false
    };
  }
  var decoder = new TextDecoder(), buffer = '', text = '', reasoningText = '', usage = {}, events = [], finishReason = null, chunkCount = 0, firstReasoningMs = null, firstContentMs = null, lastChunkMs = null;
  function diagnostics() { return { chunkCount: chunkCount, reasoningChars: reasoningText.length, contentChars: text.length, firstReasoningMs: firstReasoningMs, firstContentMs: firstContentMs, lastChunkMs: lastChunkMs, elapsedMs: Date.now() - startedAt }; }
  function line(raw) {
    raw = raw.trim(); if (!raw) return;
    var item; try { item = JSON.parse(raw); } catch (_error) { return; }
    chunkCount++; lastChunkMs = Date.now() - startedAt; events.push(item.done ? 'ollama.chat.done' : 'ollama.chat.chunk');
    var message = item.message || {};
    if (typeof message.thinking === 'string' && message.thinking) {
      if (firstReasoningMs === null) firstReasoningMs = lastChunkMs;
      reasoningText += message.thinking;
    }
    if (typeof message.content === 'string' && message.content) {
      if (firstContentMs === null) firstContentMs = lastChunkMs;
      text += message.content;
    }
    if (item.done) {
      finishReason = item.done_reason || 'stop';
      usage = {
        prompt_tokens: item.prompt_eval_count || 0,
        completion_tokens: item.eval_count || 0,
        total_tokens: (item.prompt_eval_count || 0) + (item.eval_count || 0)
      };
    }
  }
  try {
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      var lines = buffer.split('\n');
      buffer = lines.pop() || '';
      lines.forEach(line);
    }
    buffer += decoder.decode();
    if (buffer) line(buffer);
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

async function requestOllamaChat(options) {
  options = options || {};
  var input = options.body || {};
  var timeoutSignal = Number(options.timeoutMs) > 0 ? AbortSignal.timeout(Number(options.timeoutMs)) : null;
  var signal = timeoutSignal && options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal || options.signal;
  var think = options.think;
  if (think === undefined) think = false;
  var nativeBody = {
    model: input.model,
    messages: toOllamaMessages(input.messages || []),
    stream: input.stream !== false,
    think: think === true || think === 'true' || think === 'low' || think === 'medium' || think === 'high' || think === 'max' ? think : false,
    options: {}
  };
  if (input.temperature !== undefined) nativeBody.options.temperature = input.temperature;
  if (input.max_tokens !== undefined) nativeBody.options.num_predict = input.max_tokens;
  try {
    var response = await (options.fetchImpl || fetch)(ollamaRoot(options.endpoint) + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nativeBody),
      signal: signal
    });
    if (!response.ok) {
      var errBody = '';
      try { errBody = await response.text(); } catch (_error) {}
      throw makeHttpError(response, errBody);
    }
    if (nativeBody.stream) return await readOllamaNativeStream(response);
    return await readOllamaNativeStream(new Response(JSON.stringify(await response.json()), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    if (timeoutSignal && timeoutSignal.aborted && !(options.signal && options.signal.aborted)) {
      var timeout = new Error('Ollama chat request exhausted the time budget.');
      timeout.code = 'CHAT_COMPLETIONS_TIMEOUT';
      timeout.owner = 'ChatCompletionsClient';
      timeout.streamDiagnostics = error.streamDiagnostics || null;
      timeout.partialContent = error.partialContent || '';
      error = timeout;
    }
    throw error;
  }
}

module.exports = {
  normalizeEndpoint: normalizeEndpoint,
  ollamaRoot: ollamaRoot,
  toOllamaMessages: toOllamaMessages,
  readChatStream: readChatStream,
  readOllamaNativeStream: readOllamaNativeStream,
  requestChatCompletions: requestChatCompletions,
  requestOllamaChat: requestOllamaChat
};
