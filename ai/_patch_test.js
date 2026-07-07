var fs = require("fs");
var file = "C:/Ai/GameCastle/ai/pipeline.js";
var code = fs.readFileSync(file, "utf8");

var newCallLLM = [
"// ===== LLM PROVIDER (streaming SSE with thinking visibility) =====",
"async function callLLM(prompt, systemPrompt, opts) {",
"  opts = opts || {};",
"  var ep = process.env.LLM_ENDPOINT || "http://127.0.0.1:18081/v1";",
"  var ak = process.env.DEEPSEEK_API_KEY || "";",
"  var model = opts.model || process.env.LLM_MODEL || "deepseek-v4-flash";",
"  var temperature = opts.temperature;",
"  var reasoningEffort = opts.reasoningEffort || "xhigh";",
"  var label = opts.label || "LLM";",
"  var maxTokens = opts.maxTokens || 4096;",
].join("
");
console.log("test");