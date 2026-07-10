/**
 * GameCastle Pipeline v2
 */
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var capabilities = require("./capabilities");
var projectWorld = require("./project-world");
var placementContext = require("./placement-context");
var pipelineState = require("./pipeline-state");
var moduleCompiler = require("./module-compiler");
var runtimeCodegen = require("./runtime-codegen");
var htmlExporter = require("./html-exporter");
var tickRuntimeCodegen = require("./network-runtime/codegen");
var intentRuntimeCodegen = require("./intent-runtime-codegen");
var textureProvider = require("./texture-provider");
var gdevelopTruth = require("./gdevelop-truth");
var agentWorkflow = require("./agent-workflow");
var agentContracts = require("./agent-contracts");
var requirementAgent = require("./requirement-agent");
var dslAgent = require("./dsl-agent");
var llmProvider = require("./llm-provider");
var intentCompiler = require("./intent-compiler");
var intentPipelineGraph = require("./intent-pipeline-graph");
var semanticPlaytestAgent = require("./semantic-playtest-agent");
var diagnosticRouter = require("./intent-diagnostic-router");

var STATE_DIR = path.join(__dirname, "..", "output");
var LOG_PATH = path.join(STATE_DIR, "pipeline.log");
function gc_log(msg) {
  try { fs.appendFileSync(LOG_PATH, new Date().toISOString() + " " + msg + String.fromCharCode(10)); } catch(e) {}
}
function callModel(prompt, systemPrompt, opts) {
  return llmProvider.callTextModel(prompt, systemPrompt, opts, gc_log);
}
var BRIEF_PATH = path.join(STATE_DIR, "design-brief.json");
var HISTORY_PATH = path.join(STATE_DIR, "conversation.json");
var PRODUCT_MODULES_DIR = path.join(__dirname, "product-modules");
var INTENT_FIXTURES_DIR = path.join(__dirname, "fixtures");
var GDEVELOP_RUNTIME_DIR = process.env.GAMECASTLE_GDJS_RUNTIME_DIR || path.join(__dirname, '..', 'engine', 'gdevelop-runtime');
var PROJECT_PATH = path.join(STATE_DIR, "project.json");
var HTML_EXPORT_MANIFEST_PATH = path.join(STATE_DIR, "html-export-manifest.json");
var TICK_RUNTIME_MANIFEST_PATH = path.join(STATE_DIR, "tick-runtime-manifest.json");
var INTENT_RUNTIME_REQUIREMENTS_PATH = path.join(STATE_DIR, "intent-runtime-requirements.json");
var SEMANTIC_PLAYTEST_REPORT_PATH = path.join(STATE_DIR, "semantic-playtest-report.json");
var SEMANTIC_PLAYTEST_POLICY_PATH = path.join(STATE_DIR, "semantic-playtest-policy.json");
var SEMANTIC_PLAYTEST_LLM_REPORT_PATH = path.join(STATE_DIR, "semantic-playtest-llm-report.json");
var SEMANTIC_PLAYTEST_USER_REPORT_PATH = path.join(STATE_DIR, "semantic-playtest-user-report.json");
var SEMANTIC_PLAYTEST_REPAIR_INTENT_PATH = path.join(STATE_DIR, "semantic-playtest-repair.intent.dsl");
var INTENT_WORLD_VIEW_PATH = path.join(STATE_DIR, "intent-world-view.json");
var PENDING_APPROVAL_PATH = path.join(STATE_DIR, "pending-approval.json");
var PIPELINE_STATE_PATH = path.join(STATE_DIR, "pipeline-state.json");
var MAX_LLM2_REPAIR_ROUNDS = 2;
var MAX_LLM2_INTENT_COMPILE_REPAIR_ROUNDS = 2;

function hasArg(name) {
  return args.indexOf(name) >= 0;
}

function getArgValue(name) {
  var index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) return null;
  return args[index + 1];
}

function getPromptFromArgs() {
  var valueFlags = {
    '--intent-fixture-file': true,
    '--batch-label': true,
  };
  var promptParts = [];
  for (var i = 0; i < args.length; i++) {
    var arg = args[i];
    if (valueFlags[arg]) {
      i++;
      continue;
    }
    if (arg.indexOf('--') === 0) continue;
    promptParts.push(arg);
  }
  return promptParts.join(' ');
}

function resolveIntentArtifactFile(fileName) {
  var resolved = path.resolve(fileName || '');
  var fixtureRoot = path.resolve(INTENT_FIXTURES_DIR) + path.sep;
  var outputRoot = path.resolve(STATE_DIR) + path.sep;
  var isNamedFixture = resolved.indexOf(fixtureRoot) === 0 && path.basename(resolved).indexOf('intent-') === 0;
  var isGeneratedArtifact = resolved.indexOf(outputRoot) === 0 && path.basename(resolved).lastIndexOf('.intent.dsl') === path.basename(resolved).length - '.intent.dsl'.length;
  if (!isNamedFixture && !isGeneratedArtifact) {
    throw new Error('Intent fixture file must be under ' + INTENT_FIXTURES_DIR + ' as intent-*.dsl or under ' + STATE_DIR + ' as *.intent.dsl');
  }
  if (path.extname(resolved) !== '.dsl') {
    throw new Error('Intent fixture file must use .dsl extension');
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error('Intent fixture file must exist');
  }
  return resolved;
}

function loadJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch(e) {
    return fallback;
  }
}

function saveJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeSemanticPlaytestOutputs(world, executionReport) {
  var report = semanticPlaytestAgent.runSemanticPlaytest({
    projectWorld: world,
    executionReport: executionReport,
  });
  saveJsonFile(SEMANTIC_PLAYTEST_REPORT_PATH, report);
  saveJsonFile(SEMANTIC_PLAYTEST_POLICY_PATH, report.playPolicy);
  saveJsonFile(SEMANTIC_PLAYTEST_LLM_REPORT_PATH, report.llmReport);
  saveJsonFile(SEMANTIC_PLAYTEST_USER_REPORT_PATH, report.userReport);
  saveJsonFile(INTENT_WORLD_VIEW_PATH, report.intentWorldView);
  fs.writeFileSync(SEMANTIC_PLAYTEST_REPAIR_INTENT_PATH, report.repairIntentDslText || '');
  console.log('[SemanticPlaytest] ' + report.summary.nextAction + ' issues=' + report.summary.issues + ' repairLines=' + report.summary.repairLines + ' -> ' + SEMANTIC_PLAYTEST_REPORT_PATH);
  return report;
}

function cloneValue(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function makePersistentUuid(parts) {
  return 'gc-' + crypto
    .createHash('sha1')
    .update(parts.map(function(part) { return String(part); }).join('|'))
    .digest('hex')
    .slice(0, 16);
}

function parseHexColor(color, fallback) {
  fallback = fallback || { r: 255, g: 255, b: 255 };
  var hex = String(color || '').replace('#', '');
  function read(start, key) {
    var parsed = parseInt(hex.substring(start, start + 2), 16);
    return isNaN(parsed) ? fallback[key] : parsed;
  }
  return {
    r: read(0, 'r'),
    g: read(2, 'g'),
    b: read(4, 'b'),
  };
}

function makeInstruction(type, parameters) {
  return {
    type: { inverted: false, value: type },
    parameters: parameters.map(function(parameter) { return String(parameter); }),
    subInstructions: [],
  };
}

function makeStandardEvent(conditions, actions) {
  return {
    disabled: false,
    folded: false,
    type: 'BuiltinCommonInstructions::Standard',
    conditions: conditions,
    actions: actions,
    events: [],
  };
}

// ===== DSL PARSER =====
function parseLine(line) {
  line = line.trim();
  if (!line || line[0] === "#") return null;
  if (line.startsWith("on ") || line.startsWith("every ")) {
    var sceneMatch = line.match(/\s+scene=([A-Za-z0-9_.-]+)\s*$/);
    var eventLine = sceneMatch ? line.slice(0, sceneMatch.index).trim() : line;
    var eventParams = { desc: eventLine };
    if (sceneMatch) eventParams.scene = sceneMatch[1];
    return { verb: "add", target: "event", params: eventParams };
  }
  var tokens = [];
  var current = "";
  var inQuote = false;
  var q = "";
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (inQuote) { if (ch === q) inQuote = false; else current += ch; }
    else if (ch === "\"" || ch === "\'") { inQuote = true; q = ch; }
    else if (ch === " ") { if (current) { tokens.push(current); current = ""; } }
    else current += ch;
  }
  if (inQuote) throw new Error('Unclosed quote in internal target DSL line: ' + line);
  if (current) tokens.push(current);
  if (tokens.length < 1) return null;
  var verb = tokens[0];
  var target = "";
  var startIdx = 1;
  if (tokens.length > 1 && tokens[1].indexOf("=") < 0) {
    target = tokens[1]; startIdx = 2;
  }
  var params = {};
  if (tokens.length > startIdx && tokens[startIdx] && tokens[startIdx][0] === "#") {
    params["index"] = parseInt(tokens[startIdx].substring(1))||0;
    startIdx++;
  }
  for (var j = startIdx; j < tokens.length; j++) {
    var eq = tokens[j].indexOf("=");
    if (eq > 0) {
      var k = tokens[j].substring(0, eq);
      var v = tokens[j].substring(eq + 1);
      if (v === "true") v = true;
      else if (v === "false") v = false;
      else if (/^-?\d+(\.\d+)?$/.test(v)) v = parseFloat(v);
      params[k] = v;
    }
  }
  return { verb: verb, target: target, params: params };
}

function getExecutableDslLines(text) {
  return String(text || '').split(/\r?\n/).map(function(line) {
    return line.trim();
  }).filter(function(line) {
    return line && line[0] !== '#';
  });
}

function parseDSL(text) {
  var lines = String(text || '').split(/\r?\n/);
  var ops = [];
  for (var i = 0; i < lines.length; i++) {
    var op = parseLine(lines[i]);
    if (op) ops.push(op);
  }
  return ops;
}

var CONDITIONS = {
  // Scene lifecycle
  'start': function() { return { type: {inverted:false, value:'DepartScene'}, parameters:[''] }; },
  'every': function(seconds) { return null; }, // handled by timer sub-event

  // Collision
  'collision': function(a, b) { return { type: {inverted:false, value:'CollisionNP'}, parameters:[a, b, ''] }; },

  // Input
  'key': function(key) {
    var map = { up:'Up', down:'Down', left:'Left', right:'Right', space:'Space', enter:'Return', esc:'Escape' };
    var k = map[key.toLowerCase()] || key;
    return { type: {inverted:false, value:'KeyPressed'}, parameters:['', k] };
  },
  'mouse': function(obj) { return { type: {inverted:false, value:'SourisSurObjet'}, parameters:['LeftButton', '', obj] }; },

  // Variables
  'variable': function(name, op, value) { return { type: {inverted:false, value:'Variable'}, parameters:[name, op, String(value)] }; },
  'objvar': function(obj, name, op, value) { return { type: {inverted:false, value:'VarObjet'}, parameters:[obj, name, op, String(value)] }; },

  // Platform behavior states
  'is_jumping': function(obj) { return { type: {inverted:false, value:'PlatformBehavior::IsJumping'}, parameters:[obj, 'PlatformerObject'] }; },
  'is_falling': function(obj) { return { type: {inverted:false, value:'PlatformBehavior::IsFalling'}, parameters:[obj, 'PlatformerObject'] }; },
  'is_on_floor': function(obj) { return { type: {inverted:false, value:'PlatformBehavior::IsOnFloor'}, parameters:[obj, 'PlatformerObject'] }; },
};

// ---- ACTION TEMPLATES ----
var ACTIONS = {
  // Object manipulation
  'destroy': function(obj) { return { type: {inverted:false, value:'Delete'}, parameters:[obj, ''] }; },
  'spawn': function(obj, x, y) { return { type: {inverted:false, value:'CreateObject'}, parameters:[obj, String(x), String(y)] }; },
  'move_to': function(obj, x, y) { return { type: {inverted:false, value:'MettreXY'}, parameters:[obj, '=', String(x), '=', String(y)] }; },
  'move_rel': function(obj, dx, dy) {
    var opX = dx === 0 ? '' : (dx > 0 ? '+' : '-');
    var opY = dy === 0 ? '' : (dy > 0 ? '+' : '-');
    return { type: {inverted:false, value:'MettreXY'}, parameters:[obj, opX, String(Math.abs(dx)), opY, String(Math.abs(dy))] };
  },
  'jump': function(obj, strength) { return { type: {inverted:false, value:'AddForce'}, parameters:[obj, 'Up', String(strength||500)] }; },
  'flip': function(obj, dir) { return { type: {inverted:false, value:'FlipX'}, parameters:[obj, dir==='left'?'yes':'no'] }; },

  // Variables
  'set_var': function(name, op, value) { return { type: {inverted:false, value:'SetVariable'}, parameters:[name, op||'=', String(value)] }; },
  'score': function(op, n) { return { type: {inverted:false, value:'SetVariable'}, parameters:['Score', op||'+', String(n)] }; },

  // Animation
  'animate': function(obj, animName) { return { type: {inverted:false, value:'ChangeAnimation'}, parameters:[obj, '=', animName] }; },

  // Camera
  'camera_follow': function(obj) { return { type: {inverted:false, value:'CameraX'}, parameters:['', '=', obj+'.X()'] }; },

  // Text
  'set_text': function(obj, text) { return { type: {inverted:false, value:'TextObject::String'}, parameters:[obj, '=', text] }; },

  // Scene
  'change_scene': function(name) { return { type: {inverted:false, value:'ChangeScene'}, parameters:[name] }; },
  'restart': function() { return { type: {inverted:false, value:'ResetGame'}, parameters:[] }; },

  // Platformer input simulation
  'sim_left': function(obj) { return { type: {inverted:false, value:'PlatformBehavior::SimulateLeftKey'}, parameters:[obj, 'PlatformerObject'] }; },
  'sim_right': function(obj) { return { type: {inverted:false, value:'PlatformBehavior::SimulateRightKey'}, parameters:[obj, 'PlatformerObject'] }; },
  'sim_jump': function(obj) { return { type: {inverted:false, value:'PlatformBehavior::SimulateJumpKey'}, parameters:[obj, 'PlatformerObject'] }; },

  // Official GDevelop PrimitiveDrawing actions.
  'drawer_clear': function(obj) { return makeInstruction('PrimitiveDrawing::Drawer::ClearShapes', [obj]); },
  'drawer_rectangle': function(obj, x1, y1, x2, y2) { return makeInstruction('PrimitiveDrawing::Rectangle', [obj, x1, y1, x2, y2]); },
  'drawer_circle': function(obj, x, y, radius) { return makeInstruction('PrimitiveDrawing::Circle', [obj, x, y, radius]); },
  'drawer_rect_mask': function(obj, x1, y1, x2, y2) { return makeInstruction('PrimitiveDrawing::SetRectangularCollisionMask', [obj, x1, y1, x2, y2]); },
};


function parseEventDSL(line, project) {
  line = line.trim();
  if (!line) throw new Error('event line is empty');

  var parts = line.split(/\s*->\s*/);
  if (parts.length < 2) throw new Error('event line must include trigger -> action');

  var trigger = parts[0].trim();
  var actionsText = parts.slice(1).join(' -> ').trim();

  var conditions = parseTrigger(trigger);
  if (!conditions) throw new Error('unsupported event trigger: ' + trigger);

  var actionList = actionsText.split(/\s*,\s*/).filter(Boolean);
  if (!actionList.length) throw new Error('event must include at least one action: ' + line);
  var actions = [];
  for (var i = 0; i < actionList.length; i++) {
    var a = parseAction(actionList[i]);
    if (!a) throw new Error('unsupported event action: ' + actionList[i]);
    actions.push(a);
  }

  // Timer events: wrap in repeat structure
  if (conditions.length === 1 && conditions[0].type.value === '__TIMER__') {
    var sec = parseFloat(conditions[0].parameters[0]) || 2;
    return {
      disabled: false, folded: false,
      type: 'BuiltinCommonInstructions::Repeat',
      repeatExpression: String(sec),
      conditions: [],
      actions: [],
      events: [{
        disabled: false, folded: false,
        type: 'BuiltinCommonInstructions::Standard',
        conditions: [],
        actions: actions,
        events: []
      }]
    };
  }

  return {
    disabled: false, folded: false,
    type: 'BuiltinCommonInstructions::Standard',
    conditions: conditions,
    actions: actions,
    events: []
  };
}

function parseTrigger(text) {
  var words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;

  if (text === 'on start' || text === 'at start') {
    return [CONDITIONS.start()];
  }

  // "every Ns" timer (without "on" prefix)
  if (words[0] === 'every' && words.length >= 2) {
    return [{ type: {inverted:false, value:'__TIMER__'}, parameters:[String(parseFloat(words[1])||2)] }];
  }

  if (words[1] === 'collision' && words.length >= 4) {
    return [CONDITIONS.collision(words[2], words[3])];
  }

  if (words[1] === 'key' && words.length >= 3) {
    var cond = CONDITIONS.key(words[2]);
    // "on key Space held" -> continuous-fire trigger, maps to same KeyPressed condition
    // which fires every frame while the key is down in GDevelop
    if (words.length >= 4 && words[3] === 'held') cond._held = true;
    return [cond];
  }

  if (words[1] === 'mouse' && words.length >= 3) {
    return [CONDITIONS.mouse(words[2])];
  }

  if (words[1] === 'var' && words.length >= 5) {
    return [CONDITIONS.variable(words[2], words[3], words[4])];
  }

  if (words[1] === 'every' && words.length >= 3) {
    return [{ type: {inverted:false, value:'__TIMER__'}, parameters:[String(parseFloat(words[2])||2)] }];
  }

  if (words[1] in CONDITIONS && words.length >= 3) {
    return [CONDITIONS[words[1]](words[2])];
  }

  return null;
}

function parseAction(text) {
  text = text.trim();
  if (!text) return null;

  // Normalize: "score+1" -> "score +1"
  text = text.replace(/^(score|jump|flip)([+-]?\d+)$/, '$1 $2');

  // "name=value" -> set variable
  if (text.indexOf('=') > 0 && text.indexOf(' ') < 0) {
    var eqIdx = text.indexOf('=');
    return ACTIONS.set_var(text.substring(0, eqIdx).trim(), '=', text.substring(eqIdx+1).trim());
  }

  var words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  if (words[0] === 'destroy' && words.length >= 2) return ACTIONS.destroy(words[1]);
  if (words[0] === 'spawn' && words.length >= 2) {
    var atIdx = words.indexOf('at');
    var x = 400, y = 0;
    if (atIdx >= 0 && words.length > atIdx + 1) {
      var coordWord = words[atIdx + 1];
      // Handle "780,100" (comma-separated) or two separate tokens "780" "100"
      if (coordWord.indexOf(',') >= 0) {
        var parts = coordWord.split(',');
        x = parseFloat(parts[0]) || 400;
        y = parseFloat(parts[1]) || 0;
      } else {
        x = parseFloat(coordWord) || 400;
        if (words.length > atIdx + 2) { y = parseFloat(words[atIdx + 2]) || 0; }
      }
    }
    return ACTIONS.spawn(words[1], x, y);
  }
  if (words[0] === 'jump' && words.length >= 2) return ACTIONS.jump(words[1], words[2] ? parseFloat(words[2]) : 500);
  if (words[0] === 'flip' && words.length >= 2) return ACTIONS.flip(words[1], words[2] || 'right');
  if (words[0] === 'score' && words.length >= 2) {
    var v = words[1].replace(/[()+]/g,'');
    return ACTIONS.score(v.startsWith('-') ? '-' : '+', Math.abs(parseFloat(v)||1));
  }
  if (words[0] === 'variable' && words.length >= 3) return ACTIONS.set_var(words[1], words[2], words[3] || '0');
  if (words[0] === 'move' && words.length >= 3) {
    // move Player y=-4         -> relative Y
    // move Player x=+4         -> relative X
    var dx = 0, dy = 0, relX = false, relY = false, hasMoveAxis = false;
    for (var mi = 2; mi < words.length; mi++) {
      var kv = words[mi].split('=');
      if (kv.length < 2) continue;
      var val = parseFloat(kv[1]) || 0;
      if (kv[0] === 'x') { dx = val; relX = (kv[1][0] === '+' || kv[1][0] === '-'); hasMoveAxis = true; }
      if (kv[0] === 'y') { dy = val; relY = (kv[1][0] === '+' || kv[1][0] === '-'); hasMoveAxis = true; }
    }
    if (relX || relY) return ACTIONS.move_rel(words[1], dx, dy);
    if (hasMoveAxis) throw new Error('move action requires signed relative x/y values');
  }
  if (words[0] === 'animate' && words.length >= 3) return ACTIONS.animate(words[1], words[2]);
  if (words[0] === 'camera' && words.length >= 2) return ACTIONS.camera_follow(words[1]);
  if (words[0] === 'text' && words.length >= 3) {
    var t = words.slice(2).join(' ').replace(/^=s*/,'').replace(/^"|"$/g,'');
    return ACTIONS.set_text(words[1], t);
  }
  if (words[0] === 'scene' && words.length >= 2) return ACTIONS.change_scene(words[1]);
  if (words[0] === 'restart') return ACTIONS.restart();

  return null;
}


var EXEC = {};

function addStaticDrawerBootstrapEvent(scene, objectName, shape, width, height) {
  var drawActions = [
    ACTIONS.drawer_clear(objectName),
  ];
  if (shape === 'circle') {
    drawActions.push(ACTIONS.drawer_circle(objectName, width / 2, height / 2, Math.min(width, height) / 2));
  } else {
    drawActions.push(ACTIONS.drawer_rectangle(objectName, 0, 0, width, height));
  }
  drawActions.push(ACTIONS.drawer_rect_mask(objectName, 0, 0, width, height));
  scene.events.push(makeStandardEvent([CONDITIONS.start()], drawActions));
}

EXEC["create scene"] = function(p, ps) {
  var n = ps.name;
  if (p.layouts.find(function(l){return l.name===n;})) return {ok:false,msg:"exists: "+n};
  p.layouts.push(createEmptyLayout(n));
  if (ps.first) p.firstLayout = n;
  return {ok:true,msg:"scene: "+n};
};

EXEC["delete scene"] = function(p, ps) {
  var idx = p.layouts.findIndex(function(l){return l.name===ps.name;});
  if (idx<0) return {ok:false,msg:"not found: "+ps.name};
  p.layouts.splice(idx,1);
  if (p.firstLayout===ps.name) p.firstLayout = p.layouts[0]?p.layouts[0].name:"";
  return {ok:true,msg:"deleted: "+ps.name};
};

EXEC["create object"] = async function(p, ps) {
  var scene = ps.scene ? p.layouts.find(function(l){return l.name===ps.scene;}) : null;
  var tgt = ps.scene ? (scene||{}).objects : p.objects;
  if (!tgt) return {ok:false,msg:"scene not found: "+ps.scene};
  var sType = ps.shape || "rectangle";

  // Resolve texture for Sprite objects before creating object data
  if (ps.type === "Sprite") {
    try {
      var resolved = await textureProvider.resolveTexture(ps);
      if (resolved.texturePath && !ps.texture) {
        ps.texture = resolved.texturePath;
      }
    } catch (e) {
      return {ok:false,msg:"texture resolution failed: " + e.message};
    }
  }

  var obj = gdevelopTruth.createObjectData(ps);
  tgt.push(obj);
  if (ps.type === "ShapePainter" && scene) {
    addStaticDrawerBootstrapEvent(scene, ps.name, sType, Number(ps.width) || 32, Number(ps.height) || 32);
  }
  return {ok:true,msg:"object: "+ps.name+" ("+obj.type+")"};
};

EXEC["delete object"] = function(p, ps) {
  var tgt = ps.scene ? (p.layouts.find(function(l){return l.name===ps.scene;})||{}).objects : p.objects;
  if (!tgt) return {ok:false,msg:"scene not found"};
  var idx = tgt.findIndex(function(o){return o.name===ps.name;});
  if (idx<0) return {ok:false,msg:"not found: "+ps.name};
  tgt.splice(idx,1);
  p.layouts.forEach(function(l){l.instances=l.instances.filter(function(i){return i.name!==ps.name;});});
  return {ok:true,msg:"deleted: "+ps.name};
};

EXEC["add behavior"] = function(p, ps) {
  var tgtName = ps.to || ps.object;
  var container = ps.scene ? (p.layouts.find(function(l){return l.name===ps.scene;})||{}).objects : p.objects;
  if (!container) return {ok:false,msg:"scene not found"};
  var obj = container.find(function(o){return o.name===tgtName;});
  if (!obj) return {ok:false,msg:"object not found: "+tgtName};
  if (!obj.behaviors) obj.behaviors=[];
  var behavior = gdevelopTruth.createBehaviorData(ps);
  obj.behaviors.push(behavior);
  return {ok:true,msg:"behavior: "+behavior.name};
};

EXEC["remove behavior"] = function(p, ps) {
  var tgtName = ps.from || ps.object;
  var container = ps.scene ? (p.layouts.find(function(l){return l.name===ps.scene;})||{}).objects : p.objects;
  if (!container) return {ok:false,msg:"scene not found"};
  var obj = container.find(function(o){return o.name===tgtName;});
  if (!obj||!obj.behaviors) return {ok:false,msg:"object/behavior not found"};
  var idx = obj.behaviors.findIndex(function(b){return b.type===ps.type||b.name===ps.type;});
  if (idx<0) return {ok:false,msg:"behavior not found: "+ps.type};
  obj.behaviors.splice(idx,1);
  return {ok:true,msg:"removed behavior: "+ps.type+" from "+tgtName};
};
EXEC["place"] = function(p, ps) {
  var scene = p.layouts.find(function(l){return l.name===ps.scene;});
  if (!scene) return {ok:false,msg:"scene not found"};
  var objName = ps.object;
  var pos = (ps.at||"400,300").split(",").map(Number);
  var count = ps.count||1;
  var z = ps.z||1;
  for (var i=0;i<count;i++) {
    var occurrence = scene.instances.filter(function(inst) {
      return inst.name === objName
        && inst.x === pos[0]
        && inst.y === pos[1]
        && inst.layer === (ps.layer || '');
    }).length + 1;
    scene.instances.push({
      angle:ps.angle||0, customSize:false, height:ps.height||0, width:ps.width||0,
      layer:ps.layer||"", locked:false, name:objName, x:pos[0], y:pos[1], zOrder:z++,
      numberProperties:[], stringProperties:[], initialVariables:[],
      persistentUuid: makePersistentUuid([scene.name, objName, pos[0], pos[1], ps.width || 0, ps.height || 0, ps.layer || '', occurrence])
    });
  }
  return {ok:true,msg:"placed "+objName+" x"+count};
};

EXEC["remove placement"] = function(p, ps) {
  var scene = p.layouts.find(function(l){return l.name===ps.scene;});
  if (!scene) return {ok:false,msg:"scene not found"};
  var objName = ps.object;
  var before = scene.instances.length;
  scene.instances = scene.instances.filter(function(i){return i.name!==objName;});
  var removed = before - scene.instances.length;
  return {ok:true,msg:"removed "+removed+" placement(s) of "+objName};
};

EXEC["set variable"] = function(p, ps) {
  var vt = ps.type==="Number"?3:ps.type==="Boolean"?4:2;
  var ex = p.variables.find(function(v){return v.name===ps.name;});
  if (ex) { ex.value=String(ps.value); ex.type=vt; }
  else p.variables.push({name:ps.name,type:vt,value:String(ps.value)});
  return {ok:true,msg:"var: "+ps.name+"="+ps.value};
};

EXEC["delete variable"] = function(p, ps) {
  var idx = p.variables.findIndex(function(v){return v.name===ps.name;});
  if (idx<0) return {ok:false,msg:"variable not found: "+ps.name};
  p.variables.splice(idx,1);
  return {ok:true,msg:"deleted variable: "+ps.name};
};

EXEC["add event"] = function(p, ps) {
  var sceneName = ps.scene || (p.layouts[0] ? p.layouts[0].name : "");
  var scene = p.layouts.find(function(l){return l.name===sceneName;});
  if (!scene) return {ok:false,msg:"no scene"};
  if (ps.desc) {
    var evt = parseEventDSL(ps.desc, p);
    scene.events.push(evt);
    return {ok:true,msg:"event: "+ps.desc.substring(0,50)};
  }
  return {ok:false,msg:"event requires a parsed desc"};
};

EXEC["remove event"] = function(p, ps) {
  var sceneName = ps.scene || (p.layouts[0] ? p.layouts[0].name : "");
  var scene = p.layouts.find(function(l){return l.name===sceneName;});
  if (!scene) return {ok:false,msg:"scene not found"};
  var idx = parseInt(ps.index)||0;
  if (idx<0||idx>=scene.events.length) return {ok:false,msg:"event index out of range: "+idx};
  scene.events.splice(idx,1);
  return {ok:true,msg:"removed event #"+idx};
};

EXEC["add layer"] = function(p, ps) {
  var scene = p.layouts.find(function(l){return l.name===ps.scene;});
  if (!scene) return {ok:false,msg:"scene not found"};
  scene.layers.push({name:ps.name,visibility:ps.visible!==false,cameras:[{defaultSize:true,defaultViewport:true,height:0,width:0,viewportBottom:1,viewportLeft:0,viewportRight:1,viewportTop:0}],effects:[]});
  return {ok:true,msg:"layer: "+ps.name};
};

EXEC["set object"] = function(p, ps) {
  var tgt = ps.scene ? (p.layouts.find(function(l){return l.name===ps.scene;})||{}).objects : p.objects;
  if (!tgt) return {ok:false,msg:"scene not found"};
  var obj = tgt.find(function(o){return o.name===ps.name;});
  if (!obj) return {ok:false,msg:"object not found: "+ps.name};
  if (obj.type==="PrimitiveDrawing::Drawer") {
    if (ps.color) obj.fillColor = parseHexColor(ps.color, obj.fillColor || { r: 100, g: 130, b: 240 });
    if (ps.outline!==undefined) obj.outlineSize=parseFloat(ps.outline)||0;
  }
  if (obj.type==="TextObject::Text") {
    if (!obj.content) obj.content = {};
    if (ps.size) obj.content.characterSize=parseFloat(ps.size)||20;
    if (ps.color) obj.content.color = gdevelopTruth.toRgbString(ps.color, { r: 255, g: 255, b: 255 });
  }
  return {ok:true,msg:"object updated: "+ps.name};
};

EXEC["set placement"] = function(p, ps) {
  var scene = p.layouts.find(function(l){return l.name===ps.scene;});
  if (!scene) return {ok:false,msg:"scene not found"};
  var inst = scene.instances.find(function(i){return i.name===ps.object;});
  if (!inst) return {ok:false,msg:"placement not found: "+ps.object};
  if (ps.x!==undefined) inst.x=parseFloat(ps.x);
  if (ps.y!==undefined) inst.y=parseFloat(ps.y);
  if (ps.width!==undefined) inst.width=parseFloat(ps.width);
  if (ps.height!==undefined) inst.height=parseFloat(ps.height);
  return {ok:true,msg:"placement updated: "+ps.object};
};

async function execute(project, op) {
  var key = op.target ? (op.verb + " " + op.target) : op.verb;
  var fn = EXEC[key];
  if (!fn) return {ok:false,msg:"unknown: "+key};
  try { return fn(project, op.params); } catch(e) { return {ok:false,msg:e.message}; }
}

function createDefaultLayer() {
  return {
    ambientLightColorB: 0,
    ambientLightColorG: 8042920,
    ambientLightColorR: 16,
    followBaseLayerCamera: false,
    isLightingLayer: false,
    name: "",
    visibility: true,
    cameras: [{
      defaultSize: true,
      defaultViewport: true,
      height: 0,
      width: 0,
      viewportBottom: 1,
      viewportLeft: 0,
      viewportRight: 1,
      viewportTop: 0
    }],
    effects: []
  };
}

function createDefaultUiSettings() {
  return {
    grid: false,
    gridType: "rectangular",
    gridWidth: 32,
    gridHeight: 32,
    gridOffsetX: 0,
    gridOffsetY: 0,
    gridColor: 10401023,
    gridAlpha: 0.8,
    snap: false,
    zoomFactor: 0.546875,
    windowMask: false
  };
}

function createEmptyLayout(name) {
  return {
    b: 0,
    disableInputWhenNotFocused: true,
    mangledName: name.replace(/[^A-Za-z0-9_]/g, "_"),
    name: name,
    r: 0,
    standardSortMethod: true,
    stopSoundsOnStartup: true,
    title: "",
    v: 0,
    uiSettings: createDefaultUiSettings(),
    instances: [],
    objects: [],
    events: [],
    layers: [createDefaultLayer()],
    variables: [],
    objectsGroups: [],
    behaviorsSharedData: [],
    usedResources: []
  };
}

function emptyProject(name) {
  return {
    firstLayout:"", gdVersion:{build:96,major:4,minor:0,revision:89},
    properties:{
      adaptGameResolutionAtRuntime: true,
      folderProject: false,
      orientation: "landscape",
      packageName: "com.gamecastle.generated",
      projectFile: "",
      scaleMode: "linear",
      pixelsRounding: false,
      sizeOnStartupMode: "",
      antialiasingMode: "MSAA",
      antialisingEnabledOnMobile: false,
      version: "1.0.0",
      name:name,
      author:"GameCastle",
      authorIds: [],
      authorUsernames: [],
      windowWidth:800,
      windowHeight:600,
      latestCompilationDirectory: "",
      maxFPS:60,
      minFPS:10,
      verticalSync:true,
      loadingScreen: {
        showGDevelopSplash: false,
        backgroundImageResourceName: "",
        backgroundColor: 0,
        backgroundFadeInDuration: 0.2,
        minDuration: 0,
        logoAndProgressFadeInDuration: 0.2,
        logoAndProgressLogoFadeInDelay: 0.2,
        showProgressBar: true,
        progressBarMinWidth: 40,
        progressBarMaxWidth: 300,
        progressBarWidthPercent: 40,
        progressBarHeight: 20,
        progressBarColor: 16777215
      },
      watermark: { showWatermark: false, placement: "bottom" },
      extensions:gdevelopTruth.getProjectExtensions(),
      currentPlatform:"GDevelop JS platform",
      extensionProperties: []
    },
    resources:{resources:[],resourceFolders:[]}, objects:[], objectsGroups:[], variables:[], layouts:[],
    usedResources: [],
    externalEvents:[], eventsFunctionsExtensions: [], externalLayouts:[], externalSourceFiles:[]
  };
}


function diffDesignBriefs(oldBrief, newBrief) {
  var diff = {
    added:   { objects: [], placements: [], behaviors: [], variables: [], rules: [] },
    removed: { objects: [], placements: [], behaviors: [], variables: [], rules: [] },
    modified:{ objects: [], placements: [], behaviors: [], variables: [], rules: [] }
  };
  if (!oldBrief) return { added: newBrief, removed: {}, modified: {}, isNew: true };

  var oldNames = (oldBrief.objects||[]).map(function(o){return o.name;});
  var newNames = (newBrief.objects||[]).map(function(o){return o.name;});
  (newBrief.objects||[]).forEach(function(o){ if (oldNames.indexOf(o.name)<0) diff.added.objects.push(o); });
  (oldBrief.objects||[]).forEach(function(o){ if (newNames.indexOf(o.name)<0) diff.removed.objects.push(o); });
  (newBrief.objects||[]).forEach(function(newObj){
    var oldObj = (oldBrief.objects||[]).find(function(o){return o.name===newObj.name;});
    if (oldObj && JSON.stringify(oldObj)!==JSON.stringify(newObj))
      diff.modified.objects.push({name:newObj.name, old:oldObj, new:newObj});
  });

  var isStrRules = (oldBrief.rules||[]).length>0 && typeof (oldBrief.rules||[])[0]==='string';
  if (isStrRules || ((newBrief.rules||[]).length>0 && typeof (newBrief.rules||[])[0]==='string')) {
    var oldRuleStrs = (oldBrief.rules||[]).slice();
    var newRuleStrs = (newBrief.rules||[]).slice();
    (newBrief.rules||[]).forEach(function(r){ if (oldRuleStrs.indexOf(r)<0) diff.added.rules.push(r); });
    (oldBrief.rules||[]).forEach(function(r){ if (newRuleStrs.indexOf(r)<0) diff.removed.rules.push(r); });
  } else {
    var oldRuleKeys = (oldBrief.rules||[]).map(function(r){return JSON.stringify({t:r.trigger,A:r.A,B:r.B,key:r.key,seconds:r.seconds});});
    var newRuleKeys = (newBrief.rules||[]).map(function(r){return JSON.stringify({t:r.trigger,A:r.A,B:r.B,key:r.key,seconds:r.seconds});});
    (newBrief.rules||[]).forEach(function(r,i){ if (oldRuleKeys.indexOf(newRuleKeys[i])<0) diff.added.rules.push(r); });
    (oldBrief.rules||[]).forEach(function(r,i){ if (newRuleKeys.indexOf(oldRuleKeys[i])<0) diff.removed.rules.push(r); });
    (newBrief.rules||[]).forEach(function(newR,i){
      if (newRuleKeys[i] && oldRuleKeys.indexOf(newRuleKeys[i])>=0){
        var oldR = (oldBrief.rules||[]).find(function(r){return JSON.stringify({t:r.trigger,A:r.A,B:r.B,key:r.key,seconds:r.seconds})===newRuleKeys[i];});
        if (oldR && JSON.stringify(oldR.actions)!==JSON.stringify(newR.actions))
          diff.modified.rules.push({trigger:newR.trigger, old:oldR, new:newR});
      }
    });
  }

  function placementKey(p) {
    if (!p) return '';
    return [
      p.object || '',
      p.anchor || p.near || '',
      p.direction || '',
      p.pattern || '',
      p.count || '',
      p.x !== undefined ? 'legacyX:' + p.x : '',
      p.y !== undefined ? 'legacyY:' + p.y : ''
    ].join('|');
  }
  var oldPlaced = (oldBrief.layout&&oldBrief.layout.placements||[]).map(function(p){return p.object;});
  var newPlaced = (newBrief.layout&&newBrief.layout.placements||[]).map(function(p){return p.object;});
  (newBrief.layout&&newBrief.layout.placements||[]).forEach(function(p){ if (oldPlaced.indexOf(p.object)<0) diff.added.placements.push(p); });
  (oldBrief.layout&&oldBrief.layout.placements||[]).forEach(function(p){ if (newPlaced.indexOf(p.object)<0) diff.removed.placements.push(p); });
  (newBrief.layout&&newBrief.layout.placements||[]).forEach(function(newP){
    var oldP = (oldBrief.layout&&oldBrief.layout.placements||[]).find(function(p){return p.object===newP.object;});
    if (oldP && placementKey(oldP) !== placementKey(newP))
      diff.modified.placements.push({object:newP.object, old:oldP, new:newP});
  });

  function behaviorKey(b) { return b.object + (b.type || b.behavior || ''); }
  var oldBeh = (oldBrief.behaviors||[]).map(behaviorKey);
  var newBeh = (newBrief.behaviors||[]).map(behaviorKey);
  (newBrief.behaviors||[]).forEach(function(b,i){ if (oldBeh.indexOf(newBeh[i])<0) diff.added.behaviors.push(b); });
  (oldBrief.behaviors||[]).forEach(function(b,i){ if (newBeh.indexOf(oldBeh[i])<0) diff.removed.behaviors.push(b); });
  (newBrief.behaviors||[]).forEach(function(newB){
    var key = behaviorKey(newB);
    if (oldBeh.indexOf(key)>=0) {
      var oldB = (oldBrief.behaviors||[]).find(function(b){return behaviorKey(b)===key;});
      if (oldB && JSON.stringify(oldB)!==JSON.stringify(newB))
        diff.modified.behaviors.push({object:newB.object, behavior:newB.behavior||newB.type, old:oldB, new:newB});
    }
  });

  var oldVar = (oldBrief.variables||[]).map(function(v){return v.name;});
  var newVar = (newBrief.variables||[]).map(function(v){return v.name;});
  (newBrief.variables||[]).forEach(function(v){ if (oldVar.indexOf(v.name)<0) diff.added.variables.push(v); });
  (oldBrief.variables||[]).forEach(function(v){ if (newVar.indexOf(v.name)<0) diff.removed.variables.push(v); });
  (newBrief.variables||[]).forEach(function(newV){
    var oldV = (oldBrief.variables||[]).find(function(v){return v.name===newV.name;});
    if (oldV && JSON.stringify(oldV)!==JSON.stringify(newV))
      diff.modified.variables.push({name:newV.name, old:oldV, new:newV});
  });

  return diff;
}

function loadState() {
  try { return { brief: JSON.parse(fs.readFileSync(BRIEF_PATH,'utf8')), history: JSON.parse(fs.readFileSync(HISTORY_PATH,'utf8')) }; }
  catch(e) { return { brief: null, history: [] }; }
}
function saveState(brief, history) {
  fs.mkdirSync(STATE_DIR, {recursive:true});
  fs.writeFileSync(BRIEF_PATH, JSON.stringify(brief,null,2));
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history,null,2));
}

function loadOutputProject(stateDir) {
  var projectPath = path.join(stateDir || STATE_DIR, 'project.json');
  try {
    return JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  } catch(e) {
    return null;
  }
}

function loadExistingIntentIterationState(stateDir) {
  var dir = stateDir || STATE_DIR;
  var projectPath = path.join(dir, 'project.json');
  var worldPath = projectWorld.getWorldPath(dir);
  var ledgerPath = projectWorld.getLedgerPath(dir);
  var project = loadOutputProject(dir);
  var world = projectWorld.loadProjectWorld(dir);
  var ledgerExists = fs.existsSync(ledgerPath);
  var ledger = ledgerExists ? projectWorld.loadExecutionLedger(dir) : null;
  var errors = [];
  if (!project) errors.push('engine project file: ' + projectPath);
  if (!world) errors.push('ProjectWorld: ' + worldPath);
  if (!ledgerExists || !ledger || !Array.isArray(ledger.runs) || ledger.runs.length === 0) {
    errors.push('ExecutionLedger with at least one run: ' + ledgerPath);
  }
  return {
    ok: errors.length === 0,
    errors: errors,
    project: project,
    world: world,
    ledger: ledger,
    paths: {
      project: projectPath,
      world: worldPath,
      ledger: ledgerPath,
    },
  };
}

function resetGeneratedStateForNewProject(options) {
  options = options || {};
  [
    PROJECT_PATH,
    path.join(STATE_DIR, 'data.js'),
    path.join(STATE_DIR, 'game.html'),
    path.join(STATE_DIR, 'index.html'),
    HTML_EXPORT_MANIFEST_PATH,
    TICK_RUNTIME_MANIFEST_PATH,
    INTENT_RUNTIME_REQUIREMENTS_PATH,
    SEMANTIC_PLAYTEST_REPORT_PATH,
    SEMANTIC_PLAYTEST_POLICY_PATH,
    SEMANTIC_PLAYTEST_LLM_REPORT_PATH,
    SEMANTIC_PLAYTEST_USER_REPORT_PATH,
    SEMANTIC_PLAYTEST_REPAIR_INTENT_PATH,
    INTENT_WORLD_VIEW_PATH,
    PENDING_APPROVAL_PATH,
    projectWorld.getWorldPath(STATE_DIR),
    projectWorld.getLedgerPath(STATE_DIR),
  ].forEach(function(filePath) {
    if (options.keepPendingApproval && filePath === PENDING_APPROVAL_PATH) return;
    safeUnlinkGeneratedFile(filePath, 'reset generated state');
  });
  removeGeneratedRuntimeCodeFiles();
}

function waitForFileRetry(ms) {
  if (typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined' && Atomics.wait) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    return;
  }
  var end = Date.now() + ms;
  while (Date.now() < end) {}
}

function safeUnlinkGeneratedFile(filePath, label) {
  var attempts = 4;
  for (var i = 0; i < attempts; i++) {
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch(e) {
      if (e && e.code === 'ENOENT') return false;
      if (e && (e.code === 'EPERM' || e.code === 'EBUSY') && i < attempts - 1) {
        waitForFileRetry(25 * (i + 1));
        continue;
      }
      throw new Error('Failed to ' + (label || 'remove generated file') + ': ' + filePath + ' ' + e.message);
    }
  }
  return false;
}

function clearPendingApproval() {
  safeUnlinkGeneratedFile(PENDING_APPROVAL_PATH, 'clear pending approval');
}

function removeGeneratedRuntimeCodeFiles() {
  if (!fs.existsSync(STATE_DIR)) return;
  fs.readdirSync(STATE_DIR).forEach(function(file) {
    if (/^code\d+\.js$/.test(file)) safeUnlinkGeneratedFile(path.join(STATE_DIR, file), 'remove generated runtime code');
  });
}

function writeRuntimeExecutionFiles(project) {
  removeGeneratedRuntimeCodeFiles();
  fs.writeFileSync(
    path.join(STATE_DIR, 'data.js'),
    'gdjs.projectData = ' + JSON.stringify(project) + ';\n' +
      'gdjs.runtimeGameOptions = {};\n'
  );
  var codeFiles = runtimeCodegen.generateProjectCodeFiles(project);
  codeFiles.forEach(function(file) {
    fs.writeFileSync(path.join(STATE_DIR, file.fileName), file.code);
  });
  console.log('[RuntimeCode] ' + codeFiles.map(function(file) { return file.fileName + ':' + file.sceneName; }).join(', '));
  return codeFiles;
}

function writeProjectOutputs(project, options) {
  options = options || {};
  fs.mkdirSync(STATE_DIR, {recursive:true});
  gdevelopTruth.syncProjectExtensions(project);
  gdevelopTruth.validateProject(project);
  fs.writeFileSync(PROJECT_PATH, JSON.stringify(project, null, 2));
  var codeFiles = writeRuntimeExecutionFiles(project);
  // Regenerate tick runtime from cached manifest
  var tickRuntimeManifestPath = path.join(STATE_DIR, 'tick-runtime-manifest.json');
  if (fs.existsSync(tickRuntimeManifestPath)) {
    var cachedManifest = JSON.parse(fs.readFileSync(tickRuntimeManifestPath, 'utf8'));
    var tickRuntimeJs = tickRuntimeCodegen.generate(cachedManifest, { signalingUrl: options.signalingUrl });
    fs.writeFileSync(path.join(STATE_DIR, 'tick-runtime.js'), tickRuntimeJs);
    console.log('[TickRuntime] regenerated (' + tickRuntimeJs.length + ' bytes)');
  }
  var intentRuntimeRequirements = options.runtimeAdapterRequirements || null;
  if ((!intentRuntimeRequirements || !intentRuntimeRequirements.length) && fs.existsSync(INTENT_RUNTIME_REQUIREMENTS_PATH)) {
    intentRuntimeRequirements = JSON.parse(fs.readFileSync(INTENT_RUNTIME_REQUIREMENTS_PATH, 'utf8')).requirements || [];
  }
  if (intentRuntimeRequirements && intentRuntimeRequirements.length) {
    var intentRuntimeJs = intentRuntimeCodegen.generate(intentRuntimeRequirements);
    fs.writeFileSync(path.join(STATE_DIR, 'intent-runtime.js'), intentRuntimeJs);
    fs.writeFileSync(INTENT_RUNTIME_REQUIREMENTS_PATH, JSON.stringify({
      schemaVersion: 1,
      requirements: intentRuntimeRequirements
    }, null, 2));
    console.log('[IntentRuntime] ' + path.join(STATE_DIR, 'intent-runtime.js') + ' (' + intentRuntimeJs.length + ' bytes)');
  }
  var htmlManifest = htmlExporter.buildHtmlExportManifest(project, {
    codeFiles: codeFiles,
    modules: options.modules,
    hasIntentRuntime: !!(intentRuntimeRequirements && intentRuntimeRequirements.length),
  });
  fs.writeFileSync(HTML_EXPORT_MANIFEST_PATH, JSON.stringify(htmlManifest, null, 2));
  try {
    htmlExporter.syncHtmlRuntime(GDEVELOP_RUNTIME_DIR, STATE_DIR, htmlManifest);
    var hasTickRuntime = fs.existsSync(TICK_RUNTIME_MANIFEST_PATH);
    htmlExporter.writeHtmlExport(STATE_DIR, htmlManifest, { hasTickRuntime: hasTickRuntime });
    console.log('[HtmlExport] ' + htmlManifest.scriptFiles.length + ' scripts, ' + (htmlManifest.assetFiles || []).length + ' assets -> ' + HTML_EXPORT_MANIFEST_PATH);
  } catch (e) {
    console.warn('[HtmlExport] Skipped: GDJS runtime not available: ' + e.message);
  }
  console.log('[Output] ' + PROJECT_PATH + ' (' + JSON.stringify(project).length + ' bytes)');
  var s0 = project.layouts[0];
  console.log('  Scenes:'+project.layouts.length+' Objects:'+project.objects.length+' SceneObjects:'+(s0?s0.objects.length:0)+' Instances:'+(s0?s0.instances.length:0)+' Events:'+(s0?s0.events.length:0)+' Vars:'+project.variables.length);
}

async function executeDslBatch(project, dslText, batchLabel, options) {
  options = options || {};
  var intentArtifacts = options.intent ? Object.assign({}, options.intent, {
    runtimeAdapterRequirements: options.intent.runtimeAdapterRequirements || options.runtimeAdapterRequirements,
  }) : null;
  var dslLines = getExecutableDslLines(dslText);
  var ops = parseDSL(dslText);
  if (dslLines.length !== ops.length) {
    throw new Error('Internal target DSL parse mismatch for ' + batchLabel + ': ' + dslLines.length + ' executable line(s), ' + ops.length + ' parsed op(s)');
  }
  if (!ops.length && !options.allowEmpty) throw new Error('No ops parsed for ' + batchLabel);
  console.log('[Parse:' + batchLabel + '] ' + ops.length + ' ops');

  var previousWorld = projectWorld.loadProjectWorld(STATE_DIR);
  var ok = 0;
  var commandResults = [];
  for (var i = 0; i < ops.length; i++) {
    var r = await execute(project, ops[i]);
    var label = ops[i].verb + (ops[i].target?' '+ops[i].target:'');
    console.log('  ' + (r.ok?'OK':'FAIL') + ' ' + label + ': ' + r.msg);
    if (r.ok) ok++;
    commandResults.push({
      index: i,
      commandId: batchLabel + '_line_' + String(i + 1).padStart(3, '0'),
      ok: !!r.ok,
      command: dslLines[i],
      label: label,
      message: r.msg,
    });
  }
  console.log('[Done:' + batchLabel + '] ' + ok + '/' + ops.length + ' succeeded');

  // Save tick runtime manifest BEFORE writeProjectOutputs so HTML can detect it
  if (options.tickRuntimeManifest) {
    var networkPath = moduleCompiler.saveTickRuntimeManifest(STATE_DIR, options.tickRuntimeManifest);
    console.log('[TickRuntimeManifest] ' + networkPath);
    var tickRuntimeJs = tickRuntimeCodegen.generate(options.tickRuntimeManifest, { signalingUrl: options.signalingUrl });
    fs.writeFileSync(path.join(STATE_DIR, "tick-runtime.js"), tickRuntimeJs);
    console.log("[TickRuntime] " + path.join(STATE_DIR, "tick-runtime.js") + " (" + tickRuntimeJs.length + " bytes)");
  }

  writeProjectOutputs(project, {
    modules: options.modules,
    runtimeAdapterRequirements: options.runtimeAdapterRequirements,
  });

  var world = projectWorld.buildProjectWorld(project, previousWorld, {
    modules: options.modules,
    intent: intentArtifacts,
  });
  projectWorld.saveProjectWorld(STATE_DIR, world);
  var ledger = projectWorld.loadExecutionLedger(STATE_DIR);
  var report = projectWorld.makeExecutionReport({
    previousWorld: previousWorld,
    world: world,
    dslLines: dslLines,
    commandResults: commandResults,
    runIndex: ledger.runs.length + 1,
    batchLabel: batchLabel,
    intent: intentArtifacts,
  });
  projectWorld.appendExecutionReport(STATE_DIR, report);
  console.log('[ProjectWorld] v' + world.worldVersion + ' ' + world.semanticHash + ' -> ' + projectWorld.getWorldPath(STATE_DIR));
  console.log('[ExecutionReport] ' + report.summary.nextAction + ' ' + report.summary.completed + '/' + report.summary.total + ' -> ' + projectWorld.getLedgerPath(STATE_DIR));
  var semanticPlaytestReport = writeSemanticPlaytestOutputs(world, report);
  var state = null;
  if (options.intent) {
    state = await makeIntentPipelineStateFromGraph({
      mode: options.projectMode,
      batchLabel: batchLabel,
      artifactKind: options.intent.artifactKind || 'intent',
      userRequest: options.userRequest,
      designBrief: options.designBrief,
      diff: options.diff,
      intentDslText: options.intent.intentDslText,
      intentGraph: options.intent.intentGraph,
      placementPlan: options.intent.placementPlan,
      bridgePlan: options.intent.bridgePlan,
      intentContracts: options.intent.intentContracts,
      compileResultCard: options.intent.compileResultCard,
      internalDslText: dslText,
      executionReport: report,
      projectWorld: world,
      semanticPlaytestReport: semanticPlaytestReport,
    });
    var statePath = savePipelineState(state);
    console.log('[PipelineState] ' + state.stateKind + ' graphTrace=' + state.graphTrace.length + ' -> ' + statePath);
  }

  return {
    dslText: dslText,
    dslLines: dslLines,
    report: report,
    world: world,
    pipelineState: state,
  };
}

function makeIntentPipelineState(options) {
  var state = pipelineState.createPipelineState(options || {});
  pipelineState.validatePipelineState(state);
  return state;
}

async function makeIntentPipelineStateFromGraph(options) {
  return intentPipelineGraph.makePipelineStateFromArtifacts(options || {});
}

function savePipelineState(state) {
  saveJsonFile(PIPELINE_STATE_PATH, state);
  return PIPELINE_STATE_PATH;
}

function makeApprovalSummary(options) {
  var dslLines = String(options.dslText || '').split(/\r?\n/).filter(function(line) {
    return line.trim() && line.trim()[0] !== '#';
  });
  var intentDslLines = String(options.intentDslText || '').split(/\r?\n/).filter(function(line) {
    return line.trim() && line.trim()[0] !== '#';
  });
  return {
    mode: options.projectMode,
    batchLabel: options.batchLabel,
    prompt: options.prompt,
    intentDslLineCount: intentDslLines.length,
    internalDslLineCount: dslLines.length,
    intentGraph: options.intentGraph ? {
      things: (options.intentGraph.things || []).length,
      components: (options.intentGraph.components || []).length,
      relations: (options.intentGraph.relations || []).length,
      placements: (options.intentGraph.placements || []).length,
      diagnostics: (options.intentGraph.diagnostics || []).length,
    } : null,
    placementPlan: options.placementPlan ? {
      placements: (options.placementPlan.placements || []).length,
      diagnostics: (options.placementPlan.diagnostics || []).length,
    } : null,
    bridgePlan: options.bridgePlan ? {
      internalDslLines: (options.bridgePlan.dslLines || []).length,
      runtimeAdapterRequirements: (options.bridgePlan.runtimeAdapterRequirements || []).length,
      diagnostics: (options.bridgePlan.diagnostics || []).length,
    } : null,
    intentContracts: options.intentContracts || null,
    compileResultCard: options.compileResultCard ? {
      resolved: (options.compileResultCard.resolved || []).length,
      rewrites: (options.compileResultCard.rewrites || []).length,
      overrides: (options.compileResultCard.overrides || []).length,
      autoAdded: (options.compileResultCard.autoAdded || []).length,
      diagnostics: (options.compileResultCard.diagnostics || []).length,
      warnings: (options.compileResultCard.warnings || []).length,
      ownerTrace: options.compileResultCard.ownerTrace || [],
    } : null,
    bridgeRuntimeAdapterCount: options.bridgePlan ? (options.bridgePlan.runtimeAdapterRequirements || []).length : 0,
    modules: (options.modules || []).map(function(module) {
      return {
        id: module.id,
        preset: module.preset,
        syncPolicy: module.syncPolicy,
      };
    }),
    baseWorldVersion: options.baseWorld ? options.baseWorld.worldVersion : null,
    baseSemanticHash: options.baseWorld ? options.baseWorld.semanticHash : null,
    preview: options.preview || null,
  };
}

function makeApprovalAiVisibleProjection(state, options) {
  options = options || {};
  var projection = {
    surface: 'llm2-intent',
    note: 'AI-visible approval projection. Use this for LLM2 or agent review; do not pass the full pending approval packet.',
    nodeInput: state && state.llm2 ? state.llm2.nodeInput : null,
    review: {
      artifactKind: options.artifactKind || null,
      mode: options.projectMode || null,
      batchLabel: options.batchLabel || null,
      intentDslLineCount: String(options.intentDslText || '').split(/\r?\n/).filter(function(line) {
        return line.trim() && line.trim()[0] !== '#';
      }).length,
      intentGraph: options.intentGraph ? {
        things: (options.intentGraph.things || []).length,
        components: (options.intentGraph.components || []).length,
        relations: (options.intentGraph.relations || []).length,
        placements: (options.intentGraph.placements || []).length,
        edits: (options.intentGraph.edits || []).length,
        diagnostics: (options.intentGraph.diagnostics || []).length,
      } : null,
      placement: options.placementPlan ? {
        placements: (options.placementPlan.placements || []).length,
        edits: (((options.placementPlan.editPlan || {}).edits) || []).length,
        diagnostics: (options.placementPlan.diagnostics || []).length,
      } : null,
      executionPreview: options.preview ? {
        total: options.preview.total,
        completed: options.preview.completed,
        failed: options.preview.failed,
        nextAction: options.preview.nextAction,
        cacheHit: !!options.preview.cacheHit,
      } : null,
    },
  };
  pipelineState.assertNoProhibitedAiVisibleSurface(projection, 'approval.aiVisibleForLlm2');
  return projection;
}

async function previewApprovalArtifact(project, dslText, options) {
  options = options || {};
  var intentArtifacts = options.intent ? Object.assign({}, options.intent, {
    runtimeAdapterRequirements: options.intent.runtimeAdapterRequirements || options.runtimeAdapterRequirements,
  }) : null;
  var previewProject = cloneValue(project);
  var dslLines = getExecutableDslLines(dslText);
  var ops = parseDSL(dslText || '');
  if (dslLines.length !== ops.length) {
    throw new Error('Internal target DSL preview parse mismatch: ' + dslLines.length + ' executable line(s), ' + ops.length + ' parsed op(s)');
  }
  var previewBatchLabel = options.batchLabel || 'approval_preview';
  var commandResults = [];
  var ok = 0;
  for (var i = 0; i < ops.length; i++) {
    var result = await execute(previewProject, ops[i]);
    if (result.ok) ok++;
    commandResults.push({
      index: i,
      commandId: previewBatchLabel + '_preview_line_' + String(i + 1).padStart(3, '0'),
      ok: !!result.ok,
      command: dslLines[i] || (ops[i].verb + (ops[i].target ? ' ' + ops[i].target : '')),
      message: result.msg,
    });
  }
  var previewWorld = projectWorld.buildProjectWorld(previewProject, options.baseWorld, {
    modules: options.modules,
    intent: intentArtifacts,
  });
  var failed = commandResults.filter(function(result) { return !result.ok; });
  var failedDiagnostics = failed.map(function(result) {
    return diagnosticRouter.routeDiagnostic('internal-target-execution', {
      category: 'runtime-execution-preview',
      commandId: result.commandId,
      command: result.command,
      message: result.message || 'internal target command failed during approval preview',
    });
  });
  return {
    total: commandResults.length,
    completed: ok,
    failed: failed.length,
    nextAction: failed.length ? 'route-to-owner' : 'done',
    predictedWorldVersion: previewWorld.worldVersion,
    predictedSemanticHash: previewWorld.semanticHash,
    projectWorld: previewWorld,
    baseSemanticHash: options.baseWorld ? options.baseWorld.semanticHash : null,
    cacheHit: !!(options.baseWorld && options.baseWorld.semanticHash === previewWorld.semanticHash),
    commandResults: commandResults,
    failedCommands: failed,
    failedDiagnostics: failedDiagnostics,
  };
}

async function makePendingApprovalPacket(options) {
  if (options && Object.prototype.hasOwnProperty.call(options, 'patchKind')) {
    throw new Error('Pending approval no longer accepts patchKind; use artifactKind');
  }
  if (options && Object.prototype.hasOwnProperty.call(options, 'requiresExistingProject')) {
    throw new Error('Pending approval no longer accepts requiresExistingProject; use requiresIntentIterationState');
  }
  if (!options || options.artifactKind !== 'intent') {
    throw new Error('Pending approval only accepts compiled Intent artifacts');
  }
  if (!options.intentDslText || !options.intentGraph || !options.placementPlan || !options.bridgePlan) {
    throw new Error('Pending approval requires Intent DSL, Intent Graph, Placement Plan, and Bridge Plan');
  }
  var preview = await previewApprovalArtifact(options.project, options.dslText || '', {
    batchLabel: options.batchLabel,
    baseWorld: options.baseWorld,
    modules: options.modules,
    runtimeAdapterRequirements: options.runtimeAdapterRequirements,
    intent: {
      artifactKind: options.artifactKind,
      intentDslText: options.intentDslText,
      intentGraph: options.intentGraph,
      placementPlan: options.placementPlan,
      bridgePlan: options.bridgePlan,
      intentContracts: options.intentContracts,
      compileResultCard: options.compileResultCard,
      runtimeAdapterRequirements: options.runtimeAdapterRequirements,
    },
  });
  var stateOptions = {
    mode: options.projectMode,
    batchLabel: options.batchLabel,
    artifactKind: options.artifactKind,
    userRequest: options.prompt,
    designBrief: options.designBrief,
    diff: options.diff,
    intentDslText: options.intentDslText,
    intentGraph: options.intentGraph,
    placementPlan: options.placementPlan,
    bridgePlan: options.bridgePlan,
    intentContracts: options.intentContracts,
    compileResultCard: options.compileResultCard,
    internalDslText: options.dslText,
    projectWorld: preview.projectWorld,
  };
  var state = await makeIntentPipelineStateFromGraph(stateOptions);
  var aiVisibleForLlm2 = makeApprovalAiVisibleProjection(state, Object.assign({}, options, { preview: preview }));
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    prompt: options.prompt,
    projectMode: options.projectMode,
    batchLabel: options.batchLabel,
    isNewProject: !!options.isNewProject,
    requiresIntentIterationState: !!options.requiresIntentIterationState,
    artifactKind: options.artifactKind,
    baseWorldVersion: options.baseWorld ? options.baseWorld.worldVersion : null,
    baseSemanticHash: options.baseWorld ? options.baseWorld.semanticHash : null,
    intentDslText: options.intentDslText || null,
    intentGraph: options.intentGraph || null,
    placementPlan: options.placementPlan || null,
    bridgePlan: options.bridgePlan || null,
    intentContracts: options.intentContracts || null,
    compileResultCard: options.compileResultCard || null,
    dslText: options.dslText || '',
    dslLines: String(options.dslText || '').split(/\r?\n/).filter(function(line) {
      return line.trim() && line.trim()[0] !== '#';
    }),
    modules: options.modules || null,
    tickRuntimeManifest: options.tickRuntimeManifest || null,
    runtimeAdapterRequirements: options.runtimeAdapterRequirements || null,
    designBrief: options.designBrief || null,
    diff: options.diff || null,
    preview: preview,
    pipelineState: state,
    aiVisibleForLlm2: aiVisibleForLlm2,
    summary: makeApprovalSummary(Object.assign({}, options, { preview: preview })),
  };
}

async function savePendingApproval(options) {
  var pending = await makePendingApprovalPacket(options);
  saveJsonFile(PENDING_APPROVAL_PATH, pending);
  console.log('[Approval] Pending Intent artifact written: ' + PENDING_APPROVAL_PATH);
  console.log('[Approval] Review summary: ' + JSON.stringify(pending.summary, null, 2));
  console.log('[Approval] Execute after review with: node ai/pipeline.js --approve-pending');
  return pending;
}

async function approvePendingArtifact() {
  var pending = loadJsonFile(PENDING_APPROVAL_PATH, null);
  if (!pending) {
    console.error('[Approval] No pending approval found: ' + PENDING_APPROVAL_PATH);
    process.exit(1);
  }
  if (pending.schemaVersion !== 1) {
    console.error('[Approval] Unsupported pending approval schemaVersion: ' + pending.schemaVersion);
    process.exit(1);
  }
  if (pending.artifactKind !== 'intent') {
    console.error('[Approval] Pending approval only accepts Intent artifacts.');
    process.exit(1);
  }
  if (Object.prototype.hasOwnProperty.call(pending, 'requiresExistingProject')) {
    console.error('[Approval] Pending approval uses removed requiresExistingProject field; regenerate the Intent approval packet.');
    process.exit(1);
  }

  var project;
  if (pending.requiresIntentIterationState) {
    var pendingIterationState = loadExistingIntentIterationState(STATE_DIR);
    if (!pendingIterationState.ok) {
      console.error('[Approval] Pending Intent artifact requires existing Intent iteration state: ' + pendingIterationState.errors.join('; '));
      process.exit(1);
    }
    project = pendingIterationState.project;
  } else {
    resetGeneratedStateForNewProject({ keepPendingApproval: true });
    project = emptyProject('GameCastle');
    console.log('[Approval] Starting approved new Intent artifact');
  }

  var batch = await executeDslBatch(project, pending.dslText || '', pending.batchLabel || 'apply', {
    projectMode: pending.projectMode,
    userRequest: pending.prompt,
    designBrief: pending.designBrief,
    diff: pending.diff,
    modules: pending.modules,
    tickRuntimeManifest: pending.tickRuntimeManifest,
    runtimeAdapterRequirements: pending.runtimeAdapterRequirements,
    allowEmpty: true,
    intent: {
      artifactKind: pending.artifactKind,
      intentDslText: pending.intentDslText,
      intentGraph: pending.intentGraph,
      placementPlan: pending.placementPlan,
      bridgePlan: pending.bridgePlan,
      intentContracts: pending.intentContracts,
      compileResultCard: pending.compileResultCard,
      runtimeAdapterRequirements: pending.runtimeAdapterRequirements,
    },
  });
  fs.unlinkSync(PENDING_APPROVAL_PATH);
  console.log('[Approval] Executed pending Intent artifact. nextAction=' + batch.report.summary.nextAction);
  if (batch.report.summary.nextAction !== 'done') {
    process.exitCode = 1;
  }
}


// ===== MAIN (two-stage: creative -> deterministic) =====
async function run(prompt) {
  console.log('[Pipeline] ' + prompt);
  if (hasArg('--approve-pending')) {
    await approvePendingArtifact();
    return;
  }
  var capabilityCatalog = capabilities.loadCapabilityCatalog(PRODUCT_MODULES_DIR);
  var productModuleCatalog = moduleCompiler.loadProductModuleCatalog(PRODUCT_MODULES_DIR);
  var creativeCapabilitySummary = capabilities.buildCreativeCapabilitySummary(capabilityCatalog);
  var isContinue = hasArg('--continue');
  var intentFixtureFile = getArgValue('--intent-fixture-file');
  var batchLabel = getArgValue('--batch-label') || 'apply';
  var approvalGate = hasArg('--approval-gate');
  if (approvalGate) clearPendingApproval();
  var projectMode = intentFixtureFile ? (isContinue ? 'fixture-continue' : 'fixture-new') : (isContinue ? 'continue' : 'new');
  var isNewProject = projectMode !== 'continue';
  if (projectMode === 'fixture-continue') isNewProject = false;
  if (isNewProject && !approvalGate) {
    resetGeneratedStateForNewProject();
    console.log('[State] Starting new project mode: ' + projectMode);
  } else if (isNewProject && approvalGate) {
    console.log('[State] Approval gate new project mode: ' + projectMode + ' (no output reset before approval)');
  }
  var existingIterationState = (projectMode === 'continue' || projectMode === 'fixture-continue')
    ? loadExistingIntentIterationState(STATE_DIR)
    : null;
  if (existingIterationState && !existingIterationState.ok) {
    console.error('[State] --continue requires an existing Intent iteration state: ' + existingIterationState.errors.join('; '));
    process.exit(1);
  }
  var project = existingIterationState ? existingIterationState.project : emptyProject('GameCastle');
  if (existingIterationState && existingIterationState.ok) {
    console.log('[State] Loaded existing Intent iteration state: ' + existingIterationState.paths.world + ' + ' + existingIterationState.paths.ledger);
  }
  var compileBaseWorld = existingIterationState ? existingIterationState.world : null;
  var compileBaseModules = (compileBaseWorld && compileBaseWorld.modules) || [];
  var dslText;
  var intentDslText = null;
  var compiledIntentArtifact = null;
  var diff = { isNew: false };  // initialized for scope; real value set in iteration path
  var designBrief = null;
  var llm2SystemPrompt = null;

  if (intentFixtureFile) {
    var resolvedIntentFixtureFile = resolveIntentArtifactFile(intentFixtureFile);
    intentDslText = fs.readFileSync(resolvedIntentFixtureFile, 'utf8');
    compiledIntentArtifact = intentCompiler.compileIntentDsl(intentDslText, {
      productModuleCatalog: productModuleCatalog,
      placementContext: placementContext.contextFromProjectWorld(compileBaseWorld),
      baseWorld: compileBaseWorld
    });
    dslText = compiledIntentArtifact.bridgePlan.dslText;
    console.log('[IntentFixture] ' + resolvedIntentFixtureFile + ' (' + intentDslText.split(/\r?\n/).filter(Boolean).length + ' lines)');
    console.log('[IntentCompiler] ' + compiledIntentArtifact.graph.components.length + ' components -> ' + compiledIntentArtifact.bridgePlan.dslLines.length + ' low-level DSL lines, ' + compiledIntentArtifact.bridgePlan.runtimeAdapterRequirements.length + ' runtime adapter requirement(s)');
  } else {
    var prev = isContinue ? loadState() : { brief: null, history: [] };
    var previousBrief = prev.brief;
    var history = prev.history;

    // Stage 1: Creative LLM (context-aware: history + previous brief)
    console.log('[Stage1] Creative LLM ' + (isContinue ? 'iterating...' : 'designing...'));
    if (isContinue && previousBrief) {
      console.log('[Stage1] Previous brief loaded, ' + history.length + ' history entries');
    }
    designBrief = await requirementAgent.generateDesignBrief({
      userPrompt: prompt,
      history: history,
      previousBrief: previousBrief,
      creativeCapabilitySummary: creativeCapabilitySummary,
      callModel: callModel,
    });
    if (!designBrief) { console.error('Failed to generate design brief'); process.exit(1); }
    console.log('[Stage1] Keys: ' + Object.keys(designBrief).join(', '));
    console.log('[Stage1] Brief: ' + JSON.stringify(designBrief).substring(0, 300));

    // 保存状态（为下次迭代）
    history.push({ role: 'user', content: prompt });
    history.push({ role: 'assistant', content: JSON.stringify(designBrief) });
    saveState(designBrief, history);

    // Stage 2: only send the change boundary to LLM2 as natural Intent DSL.
    console.log('[Stage2] Intent Commander translating...');
    llm2SystemPrompt = dslAgent.buildIntentCommanderSystemPrompt(productModuleCatalog);
    var diff = diffDesignBriefs(previousBrief, designBrief);
    var currentWorld = compileBaseWorld;
    var currentLedger = existingIterationState ? existingIterationState.ledger : { runs: [] };
    var lastReport = currentLedger.runs.length ? currentLedger.runs[currentLedger.runs.length - 1] : null;
    var worldContext = {
      projectWorld: currentWorld,
      lastExecutionReport: lastReport,
    };
    if (!diff.isNew && previousBrief) {
      var hasChanges = diff.added.objects.length + diff.added.rules.length + diff.added.placements.length + diff.added.behaviors.length + diff.added.variables.length + diff.removed.objects.length + diff.removed.rules.length + diff.removed.placements.length + diff.removed.behaviors.length + diff.removed.variables.length + diff.modified.objects.length + diff.modified.rules.length + diff.modified.placements.length + diff.modified.behaviors.length + diff.modified.variables.length;
      if (hasChanges === 0) {
        console.log('[Stage2] No changes detected, skipping LLM2');
        dslText = '';
      }
    }

    if (dslText !== '') {
      var um = dslAgent.buildIntentUserPrompt({
        userPrompt: prompt,
        worldContext: worldContext,
        designBrief: designBrief,
        diff: diff,
        isNew: diff.isNew || !previousBrief,
      });
      intentDslText = await callModel(
        um,
        llm2SystemPrompt,
        agentWorkflow.buildTextCallOptions('dsl', { label: 'LLM2-DSL' })
      );
      if (!intentDslText) { console.error('Intent DSL generation failed'); process.exit(1); }
      console.log('[Stage2] Intent DSL (' + intentDslText.split('\n').length + ' lines):');
      console.log(intentDslText);
      var intentCompileResult = await dslAgent.compileIntentDslWithRepair({
        intentDslText: intentDslText,
        intentCompiler: intentCompiler,
        productModuleCatalog: productModuleCatalog,
        baseModules: compileBaseModules,
        projectWorld: compileBaseWorld,
        placementContext: placementContext.contextFromProjectWorld(compileBaseWorld),
        maxRepairRounds: MAX_LLM2_INTENT_COMPILE_REPAIR_ROUNDS,
        allowLlmRepair: true,
        llm2SystemPrompt: llm2SystemPrompt,
        userPrompt: prompt,
        designBrief: designBrief,
        worldContext: worldContext,
        callModel: callModel,
      });
      intentDslText = intentCompileResult.intentDslText;
      compiledIntentArtifact = intentCompileResult.compiled;
      dslText = compiledIntentArtifact.bridgePlan.dslText;
      console.log('[IntentCompiler] ' + compiledIntentArtifact.graph.components.length + ' components -> ' + compiledIntentArtifact.bridgePlan.dslLines.length + ' low-level DSL lines, ' + compiledIntentArtifact.bridgePlan.runtimeAdapterRequirements.length + ' runtime adapter requirement(s)');
    }
  }

  if (dslText === '' && !compiledIntentArtifact) {
    console.log('[Done] No DSL changes to apply');
    return;
  }

  if (approvalGate) {
    if (!compiledIntentArtifact) {
      console.error('[Approval] Approval gate only accepts compiled Intent artifacts.');
      process.exit(1);
    }
    await savePendingApproval({
      prompt: prompt,
      projectMode: projectMode,
      batchLabel: batchLabel,
      isNewProject: isNewProject,
      requiresIntentIterationState: projectMode === 'continue' || projectMode === 'fixture-continue',
      artifactKind: 'intent',
      project: project,
      baseWorld: compileBaseWorld,
      intentDslText: intentDslText,
      intentGraph: compiledIntentArtifact && compiledIntentArtifact.graph,
      placementPlan: compiledIntentArtifact && compiledIntentArtifact.placementPlan,
      bridgePlan: compiledIntentArtifact && compiledIntentArtifact.bridgePlan,
      intentContracts: compiledIntentArtifact && compiledIntentArtifact.contracts,
      compileResultCard: compiledIntentArtifact && compiledIntentArtifact.resultCard,
      dslText: dslText,
      modules: compiledIntentArtifact ? compiledIntentArtifact.bridgePlan.installedModules : null,
      tickRuntimeManifest: compiledIntentArtifact ? compiledIntentArtifact.bridgePlan.tickRuntimeManifest : null,
      runtimeAdapterRequirements: compiledIntentArtifact ? compiledIntentArtifact.bridgePlan.runtimeAdapterRequirements : null,
      designBrief: designBrief,
      diff: diff,
    });
    return;
  }

  var batch = await executeDslBatch(project, dslText, batchLabel, {
    projectMode: projectMode,
    userRequest: prompt,
    designBrief: designBrief,
    diff: diff,
    modules: compiledIntentArtifact ? compiledIntentArtifact.bridgePlan.installedModules : null,
    tickRuntimeManifest: compiledIntentArtifact ? compiledIntentArtifact.bridgePlan.tickRuntimeManifest : null,
    runtimeAdapterRequirements: compiledIntentArtifact ? compiledIntentArtifact.bridgePlan.runtimeAdapterRequirements : null,
    intent: compiledIntentArtifact ? {
      artifactKind: 'intent',
      intentDslText: intentDslText,
      intentGraph: compiledIntentArtifact.graph,
      placementPlan: compiledIntentArtifact.placementPlan,
      bridgePlan: compiledIntentArtifact.bridgePlan,
      intentContracts: compiledIntentArtifact.contracts,
      compileResultCard: compiledIntentArtifact.resultCard,
      runtimeAdapterRequirements: compiledIntentArtifact.bridgePlan.runtimeAdapterRequirements,
    } : null,
    allowEmpty: !!compiledIntentArtifact,
  });

  if (compiledIntentArtifact && batch.report.summary.nextAction !== 'done') {
    console.error('[Repair] Intent execution failed in the runtime/bridge layer; route to the owning runtime/bridge diagnostic instead of LLM repair. See ' + projectWorld.getLedgerPath(STATE_DIR));
    process.exitCode = 1;
  } else if (batch.report.summary.nextAction !== 'done') {
    console.error('[Repair] Internal execution failed; route to the owning runtime/executor diagnostic instead of LLM repair. See ' + projectWorld.getLedgerPath(STATE_DIR));
    process.exitCode = 1;
  }
}

// ===== CLI =====
var args = process.argv.slice(2);
var prompt = getPromptFromArgs();
if (require.main === module) {
  if (!prompt && !hasArg('--approve-pending') && !getArgValue('--intent-fixture-file')) {
    console.log('Usage: node ai/pipeline.js [--continue] [--approval-gate] "game description"');
    console.log('       node ai/pipeline.js --intent-fixture-file ai/fixtures/<intent-name>.dsl');
    console.log('       node ai/pipeline.js --approve-pending');
    process.exit(1);
  }
  run(prompt).catch(function(e){console.error(e);process.exit(1);});
}

module.exports = {
  parseDSL: parseDSL,
  execute: execute,
  executeDslBatch: executeDslBatch,
  emptyProject: emptyProject,
  loadExistingIntentIterationState: loadExistingIntentIterationState,
  previewApprovalArtifact: previewApprovalArtifact,
  makeApprovalSummary: makeApprovalSummary,
  makePendingApprovalPacket: makePendingApprovalPacket,
  diffDesignBriefs: diffDesignBriefs,
  safeUnlinkGeneratedFile: safeUnlinkGeneratedFile,
  resolveIntentArtifactFile: resolveIntentArtifactFile
};
