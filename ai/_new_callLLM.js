// ===== LLM PROVIDER (streaming SSE with thinking visibility) =====
async function callLLM(prompt, systemPrompt, opts) {
  opts = opts || {};
  var ep = process.env.LLM_ENDPOINT || "http://127.0.0.1:18081/v1";
  var ak = process.env.DEEPSEEK_API_KEY || "";
  var model = opts.model || process.env.LLM_MODEL || "deepseek-v4-flash";
  var temperature = opts.temperature;
  var reasoningEffort = opts.reasoningEffort || "xhigh";
  var label = opts.label || "LLM";
  var maxTokens = opts.maxTokens || 4096;
  var isStatic = systemPrompt === LLM2_SYSTEM_PROMPT;

  gc_log("[" + label + "] REQ model=" + model + " reasoning=" + reasoningEffort + " staticPrompt=" + isStatic + " systemPrompt=" + systemPrompt.length + "chars userPrompt=" + prompt.length + "chars");

  var t0 = Date.now();
  var body = {
    model: model,
    input: opts.input || [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ],
    max_output_tokens: maxTokens,
    reasoning_effort: reasoningEffort,
    stream: true
  };
  if (temperature !== undefined && temperature !== null) {
    body.temperature = temperature;
  }

  process.stdout.write("[" + label + "] " + model + " ");
  var r;
  try {
    r = await fetch(ep + "/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + ak },
      body: JSON.stringify(body)
    });
  } catch (fetchErr) {
    console.error(String.fromCharCode(10) + "[" + label + "] Fetch failed: " + (fetchErr.message || fetchErr));
    return null;
  }

  if (!r.ok) {
    var errText = "";
    try { errText = await r.text(); } catch(e) {}
    console.error(String.fromCharCode(10) + "[" + label + "] HTTP " + r.status + ": " + errText.substring(0, 200));
    return null;
  }

  // SSE streaming reader
  var text = "";
  var reasoningText = "";
  var reader;
  try { reader = r.body.getReader(); } catch(e) {
    console.error(String.fromCharCode(10) + "[" + label + "] getReader failed, json fallback");
    try {
      var d = await r.json();
      var output = d.output || [];
      for (var i = 0; i < output.length; i++) {
        if (output[i].type === "message" && output[i].content) {
          for (var j = 0; j < output[i].content.length; j++) {
            if (output[i].content[j].type === "output_text") text += output[i].content[j].text;
          }
        }
      }
    } catch(e2) {}
    var dt2 = Date.now() - t0;
    console.log("[" + label + "] " + (dt2/1000).toFixed(1) + "s (fallback) " + text.length + " chars");
    return text || null;
  }

  var decoder = new TextDecoder();
  var buffer = "";
  var thinkingShown = false;
  var contentStarted = false;

  while (true) {
    var result;
    try { result = await reader.read(); } catch(e) { break; }
    if (result.done) break;
    buffer += decoder.decode(result.value, { stream: true });

    var sseLines = buffer.split(String.fromCharCode(10));
    buffer = sseLines.pop() || "";

    for (var i = 0; i < sseLines.length; i++) {
      var line = sseLines[i].trim();
      if (!line || line.indexOf("data: ") !== 0) continue;
      var data = line.substring(6);
      if (data === "[DONE]") continue;

      try {
        var event = JSON.parse(data);
        var etype = event.type || "";

        if (etype === "response.reasoning.summary_text.delta" || etype === "response.reasoning_text.delta") {
          var delta = (event.data && event.data.delta) || event.delta || "";
          if (delta) {
            if (!thinkingShown) { process.stdout.write(String.fromCharCode(10) + "  [thinking] "); thinkingShown = true; }
            process.stdout.write(delta);
            reasoningText += delta;
          }
        } else if (etype === "response.output_text.delta" || etype === "response.text.delta") {
          var d2 = (event.data && event.data.delta) || event.delta || "";
          if (d2) {
            if (thinkingShown && !contentStarted) { process.stdout.write(String.fromCharCode(10) + "  [output] "); contentStarted = true; }
            process.stdout.write(d2);
            text += d2;
          }
        } else if (etype === "response.completed") {
          var usage = (event.data && event.data.response && event.data.response.usage) || event.usage || {};
          gc_log("[" + label + "] usage " + JSON.stringify(usage));
        }
      } catch(e) {}
    }
  }

  var dt = Date.now() - t0;
  if (thinkingShown || contentStarted) process.stdout.write(String.fromCharCode(10));
  var stats = text.length + " chars";
  if (reasoningText.length > 0) stats += " | thinking: " + reasoningText.length + " chars";
  console.log("[" + label + "] " + (dt/1000).toFixed(1) + "s " + stats);
  gc_log("[" + label + "] RES " + dt + "ms output=" + text.length + "chars reasoning=" + reasoningText.length + "chars");
  return text;
}
