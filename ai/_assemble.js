var fs = require("fs");
var NL = String.fromCharCode(10);
var dir = "C:/Ai/GameCastle/ai/";

var h = [
  "/**",
  " * GameCastle Pipeline v2",
  " */",
  "var fs = require(\"fs\");",
  "var path = require(\"path\");",
  "",
  "var STATE_DIR = path.join(__dirname, \"..\", \"output\");",
  "var LOG_PATH = path.join(STATE_DIR, \"pipeline.log\");",
  "function gc_log(msg) {",
  "  try { fs.appendFileSync(LOG_PATH, new Date().toISOString() + \" \" + msg + String.fromCharCode(10)); } catch(e) {}",
  "}",
  "var BRIEF_PATH = path.join(STATE_DIR, \"design-brief.json\");",
  "var HISTORY_PATH = path.join(STATE_DIR, \"conversation.json\");",
  "",
].join(NL);

var p1 = fs.readFileSync(dir + "_p1_parse.js", "utf8");
var p2r = fs.readFileSync(dir + "event-templates.js", "utf8");
var p2 = p2r.substring(p2r.indexOf("var CONDITIONS = {"));
var p3r = fs.readFileSync(dir + "event-parser.js", "utf8");
var p3 = p3r.substring(p3r.indexOf("function parseEventDSL"));
var p4 = fs.readFileSync(dir + "_p4_exec.js", "utf8");
var p5 = fs.readFileSync(dir + "_p5_genbrief.js", "utf8");
var p6 = fs.readFileSync(dir + "_p6_middle.js", "utf8");
var p7 = fs.readFileSync(dir + "_new_callLLM.js", "utf8");
var p8 = fs.readFileSync(dir + "_tail.js", "utf8");

var out = [h, p1, p2, "", p3, "", p4, "", p5, "", p6, "", p7, p8].join(NL);
fs.writeFileSync(dir + "pipeline.js", out, "utf8");
console.log("pipeline.js: " + out.length + " bytes");
var ck = "parseLine,parseDSL,CONDITIONS,ACTIONS,parseEventDSL,EXEC,execute,emptyProject,generateDesignBrief,LLM2_SYSTEM_PROMPT,diffDesignBriefs,loadState,saveState,callLLM,run".split(",");
ck.forEach(function(f){ var ok=out.indexOf("function "+f)>=0||out.indexOf("var "+f)>=0; console.log((ok?"  OK ":"  MISS ")+f); });