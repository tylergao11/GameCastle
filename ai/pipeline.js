/**
 * GameCastle Pipeline v2
 */
var fs = require("fs");
var path = require("path");

var STATE_DIR = path.join(__dirname, "..", "output");
var LOG_PATH = path.join(STATE_DIR, "pipeline.log");
function gc_log(msg) {
  try { fs.appendFileSync(LOG_PATH, new Date().toISOString() + " " + msg + String.fromCharCode(10)); } catch(e) {}
}
var BRIEF_PATH = path.join(STATE_DIR, "design-brief.json");
var HISTORY_PATH = path.join(STATE_DIR, "conversation.json");

// ===== DSL PARSER =====
function parseLine(line) {
  line = line.trim();
  if (!line || line[0] === "#") return null;
  if (line.startsWith("on ") || line.startsWith("every ")) {
    return { verb: "add", target: "event", params: { desc: line } };
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
      else if (/^-?d+(.d+)?$/.test(v)) v = parseFloat(v);
      params[k] = v;
    }
  }
  return { verb: verb, target: target, params: params };
}

function parseDSL(text) {
  var lines = text.split(String.fromCharCode(10));
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
};


function parseEventDSL(line, project) {
  line = line.trim();
  if (!line) return null;

  var parts = line.split(/\s*->\s*/);
  if (parts.length < 2) return null;

  var trigger = parts[0].trim();
  var actionsText = parts.slice(1).join(' -> ').trim();

  var conditions = parseTrigger(trigger);
  if (!conditions) return null;

  var actionList = actionsText.split(/\s*,\s*/).filter(Boolean);
  var actions = [];
  for (var i = 0; i < actionList.length; i++) {
    var a = parseAction(actionList[i]);
    if (a) actions.push(a);
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

  if (words[1] === 'collision' && words.length >= 4) {
    return [CONDITIONS.collision(words[2], words[3])];
  }

  if (words[1] === 'key' && words.length >= 3) {
    return [CONDITIONS.key(words[2])];
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
  text = text.replace(/^(score|jump|flip)([+-]?d+)$/, '$1 $2');

  // "name=value" -> set variable
  if (text.indexOf('=') > 0 && text.indexOf(' ') < 0) {
    var eqIdx = text.indexOf('=');
    return ACTIONS.set_var(text.substring(0, eqIdx).trim(), '=', text.substring(eqIdx+1).trim());
  }

  var words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  if (words[0] === 'destroy' && words.length >= 2) return ACTIONS.destroy(words[1]);
  if (words[0] === 'spawn' && words.length >= 2) {
    var x = words.indexOf('at') >= 0 ? (parseFloat(words[words.indexOf('at')+1])||400) : 400;
    var y = words.indexOf('at') >= 0 && words.length > words.indexOf('at')+2 ? (parseFloat(words[words.indexOf('at')+2])||0) : 0;
    return ACTIONS.spawn(words[1], x, y);
  }
  if (words[0] === 'jump' && words.length >= 2) return ACTIONS.jump(words[1], words[2] ? parseFloat(words[2]) : 500);
  if (words[0] === 'flip' && words.length >= 2) return ACTIONS.flip(words[1], words[2] || 'right');
  if (words[0] === 'score' && words.length >= 2) {
    var v = words[1].replace(/[()+]/g,'');
    return ACTIONS.score(v.startsWith('-') ? '-' : '+', Math.abs(parseFloat(v)||1));
  }
  if (words[0] === 'variable' && words.length >= 3) return ACTIONS.set_var(words[1], words[2], words[3] || '0');
  if (words[0] === 'move' && words.length >= 4) return ACTIONS.move_to(words[1], parseFloat(words[3])||400, words.length>=6 ? parseFloat(words[5])||0 : 0);
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

EXEC["create scene"] = function(p, ps) {
  var n = ps.name;
  if (p.layouts.find(function(l){return l.name===n;})) return {ok:false,msg:"exists: "+n};
  p.layouts.push({name:n,instances:[],objects:[],events:[],layers:[{name:"",visibility:true,cameras:[{defaultSize:true,defaultViewport:true,height:0,width:0,viewportBottom:1,viewportLeft:0,viewportRight:1,viewportTop:0}],effects:[]}],variables:[],objectsGroups:[],behaviorsSharedData:[]});
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

EXEC["create object"] = function(p, ps) {
  var tgt = ps.scene ? (p.layouts.find(function(l){return l.name===ps.scene;})||{}).objects : p.objects;
  if (!tgt) return {ok:false,msg:"scene not found: "+ps.scene};
  if (ps.type === "ShapePainter") {
    var sType = ps.shape || "rectangle";
    var color = ps.color || "#4488FF";
    var w = ps.width || 32; var h = ps.height || 32;
    var hex = color.replace("#","");
    var r = parseInt(hex.substring(0,2),16)||100;
    var g = parseInt(hex.substring(2,4),16)||130;
    var b = parseInt(hex.substring(4,6),16)||240;
    var obj = {
      name: ps.name, type: "PrimitiveDrawing::ShapePainter", variables: [], behaviors: [],
      absoluteCoordinates: false, coordinatesOrigin: {x:0,y:0},
      fillColor: {r:r,g:g,b:b}, fillOpacity: 255,
      outlineColor: {r:0,g:0,b:0}, outlineOpacity: 255, outlineSize: ps.outline || 0,
      thickness: ps.thickness || 2, useGradient: false, gradientType: "linear",
      gradientColor1: {r:255,g:255,b:255}, gradientColor2: {r:200,g:200,b:200},
      gradientX1:0, gradientY1:0, gradientX2:100, gradientY2:100,
      shapeType: sType,
      points: sType==="circle" ? [] : [{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}],
      centerPosition: {x:w/2,y:h/2}, customCenter: true, automaticCenter: false
    };
    tgt.push(obj);
    return {ok:true,msg:"shape: "+ps.name+" ("+sType+" "+color+")"};
  }
  var obj = {name:ps.name,type:ps.type,variables:[],behaviors:[]};
  if (ps.type==="Text") { obj.string=ps.name; obj.font=""; obj.characterSize=ps.size||20; obj.color={r:255,g:255,b:255}; }
  tgt.push(obj);
  return {ok:true,msg:"object: "+ps.name+" ("+ps.type+")"};
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
  var parts = ps.type.split("::");
  var last = parts[parts.length-1];
  if (last.endsWith("ObjectBehavior")) last=last.replace("ObjectBehavior","");
  if (last.endsWith("Behavior")) last=last.replace("Behavior","");
  var bn = ps.as || last;
  obj.behaviors.push({name:bn,type:ps.type});
  return {ok:true,msg:"behavior: "+bn};
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
    scene.instances.push({
      angle:ps.angle||0, customSize:false, height:ps.height||0, width:ps.width||0,
      layer:ps.layer||"", locked:false, name:objName, x:pos[0], y:pos[1], zOrder:z++,
      numberProperties:[], stringProperties:[], initialVariables:[],
      persistentUuid:'u-'+Math.random().toString(36).slice(2)
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
    if (evt) { scene.events.push(evt); return {ok:true,msg:"event: "+ps.desc.substring(0,50)}; }
  }
  scene.events.push({disabled:false,folded:false,type:"BuiltinCommonInstructions::Standard",conditions:[],actions:[],events:[]});
  return {ok:true,msg:"event (placeholder)"};
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
  if (obj.type==="PrimitiveDrawing::ShapePainter") {
    if (ps.color) { var hex=ps.color.replace("#",""); obj.fillColor={r:parseInt(hex.substring(0,2),16),g:isNaN(parseInt(hex.substring(2,4),16))?130:parseInt(hex.substring(2,4),16),b:isNaN(parseInt(hex.substring(4,6),16))?240:parseInt(hex.substring(4,6),16)}; }
    if (ps.width)  { var w=parseFloat(ps.width); obj.centerPosition={x:w/2,y:obj.centerPosition?obj.centerPosition.y:16}; if (obj.shapeType!=="circle") obj.points=[{x:0,y:0},{x:w,y:0},{x:w,y:obj.points?obj.points[2].y:32},{x:0,y:obj.points?obj.points[3].y:32}]; }
    if (ps.height) { var h=parseFloat(ps.height); obj.centerPosition={x:obj.centerPosition?obj.centerPosition.x:16,y:h/2}; if (obj.shapeType!=="circle") obj.points=[{x:0,y:0},{x:obj.points?obj.points[1].x:32,y:0},{x:obj.points?obj.points[2].x:32,y:h},{x:0,y:h}]; }
    if (ps.shape)  { obj.shapeType=ps.shape; if (ps.shape==="circle") obj.points=[]; }
    if (ps.outline!==undefined) obj.outlineSize=parseFloat(ps.outline)||0;
  }
  if (obj.type==="TextObject::Text") {
    if (ps.size) obj.characterSize=parseFloat(ps.size)||20;
    if (ps.color) { var h2=ps.color.replace("#",""); obj.color={r:isNaN(parseInt(h2.substring(0,2),16))?255:parseInt(h2.substring(0,2),16),g:isNaN(parseInt(h2.substring(2,4),16))?255:parseInt(h2.substring(2,4),16),b:isNaN(parseInt(h2.substring(4,6),16))?255:parseInt(h2.substring(4,6),16)}; }
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

function execute(project, op) {
  var key = op.target ? (op.verb + " " + op.target) : op.verb;
  var fn = EXEC[key];
  if (!fn) return {ok:false,msg:"unknown: "+key};
  try { return fn(project, op.params); } catch(e) { return {ok:false,msg:e.message}; }
}

function emptyProject(name) {
  return {
    firstLayout:"", gdVersion:{build:96,major:4,minor:0,revision:89},
    properties:{name:name,author:"GameCastle",windowWidth:800,windowHeight:600,maxFPS:60,minFPS:10,
      extensions:[{name:"BuiltinObject"},{name:"Sprite"},{name:"BuiltinCommonInstructions"},{name:"TextObject"},
        {name:"PlatformBehavior"},{name:"BuiltinVariables"},{name:"BuiltinTime"},{name:"BuiltinMouse"},
        {name:"BuiltinKeyboard"},{name:"BuiltinCamera"},{name:"BuiltinScene"},{name:"PrimitiveDrawing"}],
      currentPlatform:"GDevelop JS platform"},
    resources:{resources:[],resourceFolders:[]}, objects:[], objectsGroups:[], variables:[], layouts:[],
    externalEvents:[], externalLayouts:[], externalSourceFiles:[]
  };
}


async function generateDesignBrief(userPrompt, history, previousBrief) {
  var sp = [
    "你是一个小游戏创意设计师。画布800x600。",
    "根据用户描述设计或迭代游戏。",
    "",
    "严格输出以下JSON结构（不要自创字段名）：",
    "{",
    "  \"theme\": \"游戏主题\",",
    "  \"objects\": [",
    "    {\"name\":\"英文名\",\"type\":\"ShapePainter或Text\",\"shape\":\"rectangle或circle\",\"color\":\"#RRGGBB\",\"width\":数,\"height\":数,\"role\":\"player/enemy/platform/coin/bullet/ground\"}",
    "  ],",
    "  \"rules\": [\"中文规则短句，如：玩家碰到金币→金币消失+得分\"],",
    "  \"layout\": {\"placements\": [{\"object\":\"对象名\",\"x\":数,\"y\":数}]},",
    "  \"behaviors\": [{\"object\":\"对象名\",\"type\":\"PlatformBehavior::PlatformerObjectBehavior\"}],",
    "  \"variables\": [{\"name\":\"变量名\",\"value\":初始值}],",
    "  \"difficulty\": \"easy\",",
    "  \"controls\": \"操作说明\",",
    "}",
    "",
    "素材能力：仅几何图形（ShapePainter 矩形/圆形 + 填色）+ 文字（Text）。无图片/动画/粒子/音效。",
    "每个对象必须指定 type 为 ShapePainter 或 Text。ShapePainter 必填 shape 和 color。",
    "color 用 #RRGGBB 格式。width/height 为数字。",
    "规则具体化：\"玩家碰到金币→金币消失+得分\" 而非 \"收集金币\"。",
    "所有对象名用英文。player 放左下方。enemy 放右侧或上方。平台 y 分散。",
    "颜色搭配有辨识度，不同角色用不同颜色。",
  ].filter(Boolean).join('\n');

  var messages = [{ role: "system", content: sp }];
  if (history && history.length > 0) {
    for (var i = 0; i < history.length; i++) messages.push(history[i]);
  }
  var userContent = '用户需求: ' + userPrompt;
  if (previousBrief) {
    userContent = '当前设计稿：\n' + JSON.stringify(previousBrief, null, 2) + '\n\n用户修改需求: ' + userPrompt + '\n请基于当前设计稿，输出更新后的完整设计稿。';
  }
  messages.push({ role: "user", content: userContent });

  var text = await callLLM(userContent, sp, {
    model: 'deepseek-v4-pro',
    temperature: 0.7,
    reasoningEffort: 'high',
    label: 'LLM1',
    maxTokens: 8192,
    input: messages
  });
  if (!text) return null;
  try {
    return JSON.parse(text.trim());
  } catch(e) {
    console.error('[LLM1] Failed to parse JSON: ' + text.substring(0,100));
    return null;
  }
}


var LLM2_SYSTEM_PROMPT = '你是游戏DSL引擎。阅读设计师的创意稿，输出精确的DSL操作序列。\n\n画布800x600。x:0-800左右，y:0-600上下。坐标根据游戏类型合理安排。\n\n=== 创建操作 ===\ncreate scene name=<名> first=true\ncreate object name=<名> type=ShapePainter shape=rectangle|circle color=#RRGGBB width=<w> height=<h> scene=<场景>\ncreate object name=<名> type=Text scene=<场景> size=<字号>\nadd behavior type=PlatformBehavior::PlatformerObjectBehavior to=<对象> scene=<场景>\nplace object=<名> at=<x>,<y> scene=<场景>\nplace object=<名> at=<x>,<y> scene=<场景> width=<w> height=<h>\nset variable name=<名> value=<值> type=Number scope=global\nadd layer name=<名> scene=<场景>\n\n=== 删除操作 ===\ndelete scene name=<名>\ndelete object name=<名> scene=<场景>\nremove behavior type=<类型> from=<对象> scene=<场景>\nremove event #<序号> scene=<场景>  (序号从0开始，按事件列表顺序)\n\n=== 修改操作 ===\nset object name=<名> color=#RRGGBB width=<w> height=<h> shape=rectangle|circle scene=<场景>\nset behavior name=<Platformer|TopDown> object=<对象> maxSpeed=<值> jumpSpeed=<值> scene=<场景>\n修改对象属性 = set object（原位修改，不删实例）\n修改事件 = remove event #N + 新的 on ... -> ... 行\n\n=== 事件DSL ===\non start | on collision <A> <B> | on key <键> | every <N>s | on is_jumping <obj> | on is_falling <obj> | on is_on_floor <obj> | on mouse <obj> | on var <name> <op> <value> -> <动作们>\n\n=== 动作 ===\ndestroy <O> | spawn <O> at <x>,<y> | jump <O> <力> | move <O> to <x>,<y>\nscore+<N> | score-<N> | score=<N> | restart | flip <O> left|right\nanimate <O> <动画名> | camera <O> | scene <场景名> | text <O> \"内容\"\nsim_left <O> | sim_right <O> | sim_jump <O> | variable <名> <op> <值>\n\n=== 规则 ===\n对象名英文。ShapePainter必有shape和color。Text对象type=Text。\n每个对象先create再place。场景名Game。坐标填数字。\n创意稿缺的信息用合理默认值。从创意稿提取所有规则。\n迭代时：遇到删除用delete/remove操作，遇到修改用删旧+建新。\n只输出DSL行。';


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

  var oldPlaced = (oldBrief.layout&&oldBrief.layout.placements||[]).map(function(p){return p.object;});
  var newPlaced = (newBrief.layout&&newBrief.layout.placements||[]).map(function(p){return p.object;});
  (newBrief.layout&&newBrief.layout.placements||[]).forEach(function(p){ if (oldPlaced.indexOf(p.object)<0) diff.added.placements.push(p); });
  (oldBrief.layout&&oldBrief.layout.placements||[]).forEach(function(p){ if (newPlaced.indexOf(p.object)<0) diff.removed.placements.push(p); });
  (newBrief.layout&&newBrief.layout.placements||[]).forEach(function(newP){
    var oldP = (oldBrief.layout&&oldBrief.layout.placements||[]).find(function(p){return p.object===newP.object;});
    if (oldP && (oldP.x!==newP.x || oldP.y!==newP.y))
      diff.modified.placements.push({object:newP.object, old:oldP, new:newP});
  });

  var oldBeh = (oldBrief.behaviors||[]).map(function(b){return b.object+b.type;});
  var newBeh = (newBrief.behaviors||[]).map(function(b){return b.object+b.type;});
  (newBrief.behaviors||[]).forEach(function(b,i){ if (oldBeh.indexOf(newBeh[i])<0) diff.added.behaviors.push(b); });
  (oldBrief.behaviors||[]).forEach(function(b,i){ if (newBeh.indexOf(oldBeh[i])<0) diff.removed.behaviors.push(b); });
  (newBrief.behaviors||[]).forEach(function(newB){
    var key = newB.object+newB.type;
    if (oldBeh.indexOf(key)>=0) {
      var oldB = (oldBrief.behaviors||[]).find(function(b){return b.object+b.type===key;});
      if (oldB && JSON.stringify(oldB)!==JSON.stringify(newB))
        diff.modified.behaviors.push({object:newB.object, type:newB.type, old:oldB, new:newB});
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

// ===== MAIN (two-stage: creative -> deterministic) =====
async function run(prompt, useMock) {
  console.log('[Pipeline] ' + prompt);
  var project = emptyProject('GameCastle');
  var dslText;
  var diff = { isNew: false };  // initialized for scope; real value set in iteration path

  if (useMock) {
    dslText = [
      'create scene name=Game first=true',
      'create object name=Player type=ShapePainter shape=rectangle color=#4488FF width=32 height=48 scene=Game',
      'create object name=Ground type=ShapePainter shape=rectangle color=#8B4513 width=800 height=20 scene=Game',
      'create object name=Platform type=ShapePainter shape=rectangle color=#8B4513 width=100 height=16 scene=Game',
      'create object name=Coin type=ShapePainter shape=circle color=#FFD700 width=16 height=16 scene=Game',
      'create object name=Enemy type=ShapePainter shape=rectangle color=#DC3232 width=32 height=32 scene=Game',
      'add behavior type=PlatformBehavior::PlatformerObjectBehavior to=Player scene=Game',
      'set variable name=Score value=0 type=Number scope=global',
      'place object=Player at=100,400 scene=Game',
      'place object=Ground at=400,590 scene=Game width=800 height=20',
      'place object=Platform at=200,460 scene=Game width=100 height=16',
      'place object=Platform at=400,380 scene=Game width=100 height=16',
      'place object=Platform at=600,300 scene=Game width=100 height=16',
      'place object=Coin at=240,430 scene=Game',
      'place object=Coin at=440,350 scene=Game',
      'place object=Coin at=640,270 scene=Game',
      'place object=Enemy at=550,400 scene=Game',
      'on start -> Score=0',
      'on collision Player Coin -> destroy Coin, score+1',
      'on collision Player Enemy -> restart',
      'on key Space -> jump Player 500',
    ].join(String.fromCharCode(10));
    console.log('[Mock] ' + dslText.split(String.fromCharCode(10)).length + ' lines');
  } else {
    var isContinue = args.indexOf('--continue') >= 0;
    var prev = isContinue ? loadState() : { brief: null, history: [] };
    var previousBrief = prev.brief;
    var history = prev.history;

    // Stage 1: Creative LLM (context-aware: history + previous brief)
    console.log('[Stage1] Creative LLM ' + (isContinue ? 'iterating...' : 'designing...'));
    if (isContinue && previousBrief) {
      console.log('[Stage1] Previous brief loaded, ' + history.length + ' history entries');
    }
    var designBrief = await generateDesignBrief(prompt, history, previousBrief);
    if (!designBrief) { console.error('Failed to generate design brief'); process.exit(1); }
    console.log('[Stage1] Keys: ' + Object.keys(designBrief).join(', '));
    console.log('[Stage1] Brief: ' + JSON.stringify(designBrief).substring(0, 300));

    // 保存状态（为下次迭代）
    history.push({ role: 'user', content: prompt });
    history.push({ role: 'assistant', content: JSON.stringify(designBrief) });
    saveState(designBrief, history);

    // Stage 2: 只把变更部分发给 LLM2
    console.log('[Stage2] DSL LLM translating...');
    var sp = LLM2_SYSTEM_PROMPT;
    var diff = diffDesignBriefs(previousBrief, designBrief);
    var um;
    if (diff.isNew || !previousBrief) {
      um = '新游戏设计稿：\n' + JSON.stringify(designBrief, null, 2) + '\n\n把它变成DSL。';
    } else {
      var hasChanges = diff.added.objects.length + diff.added.rules.length + diff.added.placements.length + diff.added.behaviors.length + diff.added.variables.length + diff.removed.objects.length + diff.removed.rules.length + diff.removed.placements.length + diff.removed.behaviors.length + diff.removed.variables.length + diff.modified.objects.length + diff.modified.rules.length + diff.modified.placements.length + diff.modified.behaviors.length + diff.modified.variables.length;
      if (hasChanges === 0) {
        console.log('[Stage2] No changes detected, skipping LLM2');
        dslText = '';
      } else {
                                                                                um = '当前游戏已有完整DSL。只输出以下变更的DSL：\n\n'
          + '【DSL 映射规则】\n'
          + '  新增对象 → create object name=<name> type=ShapePainter shape=<shape> color=<color> width=<width> height=<height> scene=Game\n'
          + '  新增放置 → place object=<object> at=<x>,<y> scene=Game\n'
          + '  新增行为 → add behavior type=<type> to=<object> scene=Game\n'
          + '  新增变量 → set variable name=<name> value=<value> type=Number scope=global\n'
          + '  新增规则 → on <trigger> -> <actions>（中文转英文）\n'
          + '  删除对象 → delete object name=<name> scene=Game\n'
          + '  删除放置 → remove placement object=<object> scene=Game\n'
          + '  删除行为 → remove behavior type=<type> from=<object> scene=Game\n'
          + '  删除变量 → delete variable name=<name>\n'
          + '  删除规则 → remove event #<序号> scene=Game（按描述匹配已有事件序号）\n'
          + '  修改对象属性 → set object name=<name> <属性>=<新值> scene=Game（原位修改，不删实例）\n'
          + '  修改放置 → set placement object=<object> x=<x> y=<y> scene=Game\n'
          + '  修改行为参数 → set behavior name=<行为名> object=<对象> <参数>=<新值> scene=Game\n'
          + '  修改变量 → set variable name=<name> value=<新值> type=Number scope=global\n'
          + '\n'
          + '新增对象：\n' + JSON.stringify(diff.added.objects, null, 2) + '\n\n'
          + '新增放置：\n' + JSON.stringify(diff.added.placements, null, 2) + '\n\n'
          + '新增行为：\n' + JSON.stringify(diff.added.behaviors, null, 2) + '\n\n'
          + '新增变量：\n' + JSON.stringify(diff.added.variables, null, 2) + '\n\n'
          + '新增规则：\n' + JSON.stringify(diff.added.rules, null, 2) + '\n\n'
          + '删除对象：\n' + JSON.stringify(diff.removed.objects, null, 2) + '\n\n'
          + '删除放置：\n' + JSON.stringify(diff.removed.placements, null, 2) + '\n\n'
          + '删除规则：\n' + JSON.stringify(diff.removed.rules, null, 2) + '\n\n'
          + '删除行为：\n' + JSON.stringify(diff.removed.behaviors, null, 2) + '\n\n'
          + '删除变量：\n' + JSON.stringify(diff.removed.variables, null, 2) + '\n\n'
          + '修改对象（旧→新）：\n' + JSON.stringify(diff.modified.objects, null, 2) + '\n\n'
          + '修改放置（旧→新）：\n' + JSON.stringify(diff.modified.placements, null, 2) + '\n\n'
          + '修改行为（旧→新）：\n' + JSON.stringify(diff.modified.behaviors, null, 2) + '\n\n'
          + '修改变量（旧→新）：\n' + JSON.stringify(diff.modified.variables, null, 2) + '\n\n'
          + '修改规则（旧→新）：\n' + JSON.stringify(diff.modified.rules, null, 2) + '\n\n'
          + '只输出变更部分DSL，不要重复已有内容。按【DSL 映射规则】翻译。\n'
          + '\n'
          + '=== 规则全量重建 ===\n'
          + '以下为当前全部规则。请全部翻译为事件DSL（旧事件已清空，所有规则都要输出）：\n'
          + '\n' + JSON.stringify(designBrief.rules, null, 2) + '\n\n'
          + '每条规则翻译为 on ... -> ... 格式。全部输出，不遗漏。';
      }
    }

if (dslText !== '') {
      dslText = await callLLM(um, sp);
      // 迭代时清空场景事件，从当前规则全量重建
      project.layouts.forEach(function(l){ l.events = []; });
      console.log('[Events] Cleared for full regeneration from current rules');
      if (!dslText) { console.error('DSL generation failed'); process.exit(1); }
      console.log('[Stage2] DSL (' + dslText.split('\n').length + ' lines):');
      console.log(dslText);
    }
  }

  var ops = parseDSL(dslText);
  if (!ops.length) { console.error('No ops parsed'); process.exit(1); }
  console.log('[Parse] ' + ops.length + ' ops');

  var ok = 0;
  for (var i = 0; i < ops.length; i++) {
    var r = execute(project, ops[i]);
    var label = ops[i].verb + (ops[i].target?' '+ops[i].target:'');
    console.log('  ' + (r.ok?'OK':'FAIL') + ' ' + label + ': ' + r.msg);
    if (r.ok) ok++;
  }
  console.log('[Done] ' + ok + '/' + ops.length + ' succeeded');

  var outDir = path.join(__dirname, '..', 'output');
  fs.mkdirSync(outDir, {recursive:true});
  var outPath = path.join(outDir, 'project.json');
  fs.writeFileSync(outPath, JSON.stringify(project, null, 2));
  console.log('[Output] ' + outPath + ' (' + JSON.stringify(project).length + ' bytes)');
  var s0 = project.layouts[0];
  console.log('  Scenes:'+project.layouts.length+' Objects:'+project.objects.length+' SceneObjects:'+(s0?s0.objects.length:0)+' Instances:'+(s0?s0.instances.length:0)+' Events:'+(s0?s0.events.length:0)+' Vars:'+project.variables.length);

  try {
    var engDir = path.join(__dirname, '..', 'engine', 'runtime');
    if (fs.existsSync(engDir + '/game.html')) {
      var html = fs.readFileSync(engDir + '/game.html', 'utf8');
      html = html.replace('var projectData = PROJECT_DATA_PLACEHOLDER;', 'var projectData = ' + JSON.stringify(project) + ';');
      fs.writeFileSync(outDir + '/game.html', html);
      console.log('[GameHTML] ' + outDir + '/game.html');
    }
  } catch(e) {}
}

// ===== CLI =====
var args = process.argv.slice(2);
var useMock = args.indexOf('--mock') >= 0;
var prompt = args.filter(function(a){return !a.startsWith('--');}).join(' ');
if (!prompt) { console.log('Usage: node ai/pipeline.js [--mock] [--continue] "game description"'); process.exit(1); }
run(prompt, useMock).catch(function(e){console.error(e);process.exit(1);});
