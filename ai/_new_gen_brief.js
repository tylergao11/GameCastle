  var text = await callLLM(userContent, sp, {
    model: "deepseek-v4-pro",
    temperature: 0.7,
    reasoningEffort: "xhigh",
    label: "LLM1",
    maxTokens: 8192,
    input: messages
  });
  if (!text) return null;
  try {
    return JSON.parse(text.trim());
  } catch(e) {
    console.error("[LLM1] Failed to parse JSON: " + text.substring(0,100));
    return null;
  }