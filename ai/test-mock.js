/**
 * 离线模拟测试：LLM1 创意稿 → (模拟 LLM2) → DSL → project.json → game.html
 * node ai/test-mock.js
 */
var fs = require('fs');
var path = require('path');

// ===== 内联 pipeline 核心函数（测试用，避免 eval） =====
var CONDITIONS = {
  'start': function() { return { type: {inverted:false, value:'DepartScene'}, parameters:[''] }; },
  'collision': function(a, b) { return { type: {inverted:false, value:'CollisionNP'}, parameters:[a, b, ''] }; },
  'key': function(key) {
    var map = { up:'Up', down:'Down', left:'Left', right:'Right', space:'Space', enter:'Return', esc:'Escape' };
    return { type: {inverted:false, value:'KeyPressed'}, parameters:['', map[key.toLowerCase()] || key] };
  },
};
var ACTIONS = {
  'destroy': function(obj) { return { type: {inverted:false, value:'Delete'}, parameters:[obj, ''] }; },
  'spawn': function(obj, x, y) { return { type: {inverted:false, value:'CreateObject'}, parameters:[obj, String(x), String(y)] }; },
  'move_to': function(obj, x, y) { return { type: {inverted:false, value:'MettreXY'}, parameters:[obj, '=', String(x), '=', String(y)] }; },
  'jump': function(obj, strength) { return { type: {inverted:false, value:'AddForce'}, parameters:[obj, 'Up', String(strength||500)] }; },
  'score': function(op, n) { return { type: {inverted:false, value:'SetVariable'}, parameters:['Score', op||'+', String(n)] }; },
  'restart': function() { return { type: {inverted:false, value:'ResetGame'}, parameters:[] }; },
  'set_var': function(name, op, value) { return { type: {inverted:false, value:'SetVariable'}, parameters:[name, op||'=', String(value)] }; },
  'set_text': function(obj, text) { return { type: {inverted:false, value:'TextObject::String'}, parameters:[obj, '=', text] }; },
};

function parseDSL(text) {
  var lines = text.split('\n');
  var ops = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line[0] === '#') continue;
    if (line.startsWith('on ') || line.startsWith('every ')) {
      ops.push({ verb: 'add', target: 'event', params: { desc: line } });
      continue;
    }
    var tokens = []; var current = ''; var inQuote = false; var q = '';
    for (var j = 0; j < line.length; j++) {
      var ch = line[j];
      if (inQuote) { if (ch === q) inQuote = false; else current += ch; }
      else if (ch === '"' || ch === "'") { inQuote = true; q = ch; }
      else if (ch === ' ') { if (current) { tokens.push(current); current = ''; } }
      else current += ch;
    }
    if (current) tokens.push(current);
    if (tokens.length < 1) continue;
    var verb = tokens[0];
    var target = '';
    var startIdx = 1;
    if (tokens.length > 1 && tokens[1].indexOf('=') < 0) { target = tokens[1]; startIdx = 2; }
    var params = {};
    for (var k = startIdx; k < tokens.length; k++) {
      var eq = tokens[k].indexOf('=');
      if (eq > 0) {
        var key = tokens[k].substring(0, eq);
        var val = tokens[k].substring(eq + 1);
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (/^-?\d+(\.\d+)?$/.test(val)) val = parseFloat(val);
        params[key] = val;
      }
    }
    ops.push({ verb: verb, target: target, params: params });
  }
  return ops;
}

function parseEventDSL(line, project) {
  line = line.trim();
  if (!line) return null;
  var parts = line.split(/\s*->\s*/);
  if (parts.length < 2) return null;
  var trigger = parts[0].trim();
  var actionsText = parts.slice(1).join(' -> ').trim();
  var words = trigger.split(/\s+/).filter(Boolean);
  var conditions = null;
  if (trigger === 'on start' || trigger === 'at start') conditions = [CONDITIONS.start()];
  else if (words[1] === 'collision' && words.length >= 4) conditions = [CONDITIONS.collision(words[2], words[3])];
  else if (words[1] === 'key' && words.length >= 3) conditions = [CONDITIONS.key(words[2])];
  else if ((words[1] === 'every' || words[0] === 'every') && words.length >= 2) {
    var sec = parseFloat(words[1]) || 2;
    var actionList = actionsText.split(/, /).filter(Boolean);
    var actions = [];
    for (var i = 0; i < actionList.length; i++) {
      var a = parseAction(actionList[i]); if (a) actions.push(a);
    }
    return { disabled:false, folded:false, type:'BuiltinCommonInstructions::Repeat', repeatExpression:String(sec), conditions:[], actions:[], events:[{ disabled:false, folded:false, type:'BuiltinCommonInstructions::Standard', conditions:[], actions:actions, events:[] }] };
  }
  if (!conditions) return null;
  var actionList = actionsText.split(/, /).filter(Boolean);
  var actions = [];
  for (var i2 = 0; i2 < actionList.length; i2++) {
    var a2 = parseAction(actionList[i2]); if (a2) actions.push(a2);
  }
  return { disabled:false, folded:false, type:'BuiltinCommonInstructions::Standard', conditions:conditions, actions:actions, events:[] };
}

function parseAction(text) {
  text = text.trim();
  if (!text) return null;
  text = text.replace(/^(score|jump)([+-]?\d+)$/, '$1 $2');
  if (text.indexOf('=') > 0 && text.indexOf(' ') < 0) {
    var eqIdx = text.indexOf('=');
    return ACTIONS.set_var(text.substring(0, eqIdx).trim(), '=', text.substring(eqIdx+1).trim());
  }
  var words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  if (words[0] === 'destroy' && words.length >= 2) return ACTIONS.destroy(words[1]);
  if (words[0] === 'spawn' && words.length >= 2) {
    var xi = words.indexOf('at');
    var x = xi >= 0 ? (parseFloat(words[xi+1])||400) : 400;
    var y = xi >= 0 && words.length > xi+2 ? (parseFloat(words[xi+2])||0) : 0;
    return ACTIONS.spawn(words[1], x, y);
  }
  if (words[0] === 'jump' && words.length >= 2) return ACTIONS.jump(words[1], words[2] ? parseFloat(words[2]) : 500);
  if (words[0] === 'score' && words.length >= 2) { var v = words[1].replace(/[()+]/g,''); return ACTIONS.score(v.startsWith('-') ? '-' : '+', Math.abs(parseFloat(v)||1)); }
  if (words[0] === 'move' && words.length >= 4) return ACTIONS.move_to(words[1], parseFloat(words[3])||400, words.length>=6 ? parseFloat(words[5])||0 : 0);
  if (words[0] === 'restart') return ACTIONS.restart();
  if (words[0] === 'text' && words.length >= 3) { var t = words.slice(2).join(' ').replace(/^=\s*/,'').replace(/^"|"$/g,''); return ACTIONS.set_text(words[1], t); }
  return null;
}

var EXEC = {};
EXEC['create scene'] = function(p, ps) {
  var n = ps.name;
  if (p.layouts.find(function(l){return l.name===n;})) return {ok:false,msg:'exists'};
  p.layouts.push({name:n,instances:[],objects:[],events:[],layers:[{name:'',visibility:true,cameras:[{defaultSize:true,defaultViewport:true,height:0,width:0,viewportBottom:1,viewportLeft:0,viewportRight:1,viewportTop:0}],effects:[]}],variables:[],objectsGroups:[],behaviorsSharedData:[]});
  if (ps.first) p.firstLayout = n;
  return {ok:true,msg:'scene: '+n};
};
EXEC['create object'] = function(p, ps) {
  var tgt = ps.scene ? (p.layouts.find(function(l){return l.name===ps.scene;})||{}).objects : p.objects;
  if (!tgt) return {ok:false,msg:'scene not found'};
  if (ps.type === 'ShapePainter') {
    var color = ps.color || '#4488FF'; var w = ps.width || 32; var h = ps.height || 32;
    var hex = color.replace('#',''); var r = parseInt(hex.substring(0,2),16)||100; var g = parseInt(hex.substring(2,4),16)||130; var b = parseInt(hex.substring(4,6),16)||240;
    tgt.push({ name: ps.name, type: 'PrimitiveDrawing::ShapePainter', variables: [], behaviors:[],
      absoluteCoordinates: false, coordinatesOrigin: {x:0,y:0},
      fillColor: {r:r,g:g,b:b}, fillOpacity: 255, outlineColor: {r:0,g:0,b:0}, outlineOpacity: 255, outlineSize: ps.outline || 0,
      thickness: ps.thickness || 2, useGradient: false, gradientType: 'linear',
      gradientColor1: {r:255,g:255,b:255}, gradientColor2: {r:200,g:200,b:200},
      gradientX1:0, gradientY1:0, gradientX2:100, gradientY2:100,
      shapeType: ps.shape || 'rectangle',
      points: ps.shape==='circle' ? [] : [{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}],
      centerPosition: {x:w/2,y:h/2}, customCenter: true, automaticCenter: false
    });
    return {ok:true,msg:'shape: '+ps.name};
  }
  var obj = {name:ps.name,type:ps.type,variables:[],behaviors:[]};
  if (ps.type==='Text') { obj.string=ps.name; obj.font=''; obj.characterSize=ps.size||20; obj.color={r:255,g:255,b:255}; }
  tgt.push(obj);
  return {ok:true,msg:'object: '+ps.name};
};
EXEC['place'] = function(p, ps) {
  var scene = p.layouts.find(function(l){return l.name===ps.scene;});
  if (!scene) return {ok:false,msg:'scene not found'};
  var pos = (ps.at||'400,300').split(',').map(Number); var count = ps.count||1; var z = ps.z||1;
  for (var i=0;i<count;i++) scene.instances.push({ angle:ps.angle||0, customSize:false, height:ps.height||0, width:ps.width||0, layer:ps.layer||'', locked:false, name:ps.object, x:pos[0], y:pos[1], zOrder:z++, numberProperties:[], stringProperties:[], initialVariables:[], persistentUuid:'u-'+Math.random().toString(36).slice(2) });
  return {ok:true,msg:'placed '+ps.object};
};
EXEC['set variable'] = function(p, ps) {
  var vt = ps.type==='Number'?3:ps.type==='Boolean'?4:2;
  var ex = p.variables.find(function(v){return v.name===ps.name;});
  if (ex) { ex.value=String(ps.value); ex.type=vt; }
  else p.variables.push({name:ps.name,type:vt,value:String(ps.value)});
  return {ok:true,msg:'var: '+ps.name+'='+ps.value};
};
EXEC['add event'] = function(p, ps) {
  var sceneName = ps.scene || (p.layouts[0] ? p.layouts[0].name : '');
  var scene = p.layouts.find(function(l){return l.name===sceneName;});
  if (!scene) return {ok:false,msg:'no scene'};
  if (ps.desc) { var evt = parseEventDSL(ps.desc, p); if (evt) { scene.events.push(evt); return {ok:true,msg:'event: '+ps.desc.substring(0,50)}; } }
  return {ok:false,msg:'bad event'};
};
function execute(project, op) {
  var key = op.target ? (op.verb + ' ' + op.target) : op.verb;
  var fn = EXEC[key];
  if (!fn) return {ok:false,msg:'unknown: '+key};
  try { return fn(project, op.params); } catch(e) { return {ok:false,msg:e.message}; }
}

function emptyProject(name) {
  return { firstLayout:'', gdVersion:{build:96,major:4,minor:0,revision:89},
    properties:{name:name,author:'GameCastle',windowWidth:800,windowHeight:600,maxFPS:60,minFPS:10,
      extensions:[{name:'BuiltinObject'},{name:'Sprite'},{name:'BuiltinCommonInstructions'},{name:'TextObject'},
        {name:'PlatformBehavior'},{name:'BuiltinVariables'},{name:'BuiltinTime'},{name:'BuiltinMouse'},
        {name:'BuiltinKeyboard'},{name:'BuiltinCamera'},{name:'BuiltinScene'},{name:'PrimitiveDrawing'}],
      currentPlatform:'GDevelop JS platform'},
    resources:{resources:[],resourceFolders:[]}, objects:[], objectsGroups:[], variables:[], layouts:[],
    externalEvents:[], externalLayouts:[], externalSourceFiles:[] };
}

// ===== 测试：太空射击 =====
console.log('╔══════════════════════════════════════╗');
console.log('║  GameCastle 离线链路测试             ║');
console.log('║  LLM1(模拟) → LLM2(模拟) → DSL → 游戏 ║');
console.log('╚══════════════════════════════════════╝');
console.log('');

// Step 1: LLM1 创意稿
var creativeBrief = {
  theme: '星际求生',
  gameplay: '飞船在底部移动，射击上方俯冲的外星敌人。吃到金色能量球加分。',
  objects: [
    { name:'Ship', look:'蓝色矩形', size:'48x32' },
    { name:'Bullet', look:'黄色小圆', size:'8x8' },
    { name:'Enemy', look:'红色圆', size:'28x28' },
    { name:'Orb', look:'金色圆', size:'16x16' },
    { name:'ScoreText', look:'白色文字' }
  ],
  difficulty: 'normal',
  controls: '左右移动，空格射击'
};

console.log('── [LLM1 创意稿] ──');
console.log(JSON.stringify(creativeBrief, null, 2));

// Step 2: LLM2 根据创意稿翻译 DSL
var dsl = [
  'create scene name=Game first=true',
  'create object name=Ship type=ShapePainter shape=rectangle color=#2288FF width=48 height=32 scene=Game',
  'create object name=Bullet type=ShapePainter shape=circle color=#FFDD00 width=8 height=8 scene=Game',
  'create object name=Enemy type=ShapePainter shape=circle color=#DC3232 width=28 height=28 scene=Game',
  'create object name=Orb type=ShapePainter shape=circle color=#FFD700 width=16 height=16 scene=Game',
  'create object name=ScoreText type=Text scene=Game size=24',
  'set variable name=Score value=0 type=Number scope=global',
  'place object=Ship at=400,550 scene=Game',
  'place object=ScoreText at=650,30 scene=Game',
  'on start -> Score=0',
  'on key Left -> move Ship to 200,550',
  'on key Right -> move Ship to 600,550',
  'on key Space -> spawn Bullet at 400,520',
  'every 2s -> spawn Enemy at 400,0',
  'every 5s -> spawn Orb at 400,0',
  'on collision Bullet Enemy -> destroy Bullet, destroy Enemy, score+10',
  'on collision Ship Orb -> destroy Orb, score+20',
  'on collision Ship Enemy -> restart',
].join('\n');

console.log('');
console.log('── [LLM2 翻译 → DSL] ──');
console.log(dsl);

// Step 3: 解析 + 执行
var project = emptyProject('Test-Shooter');
var ops = parseDSL(dsl);
console.log('');
console.log('── [执行 ' + ops.length + ' ops] ──');
var ok = 0;
for (var i = 0; i < ops.length; i++) {
  var r = execute(project, ops[i]);
  var label = ops[i].verb + (ops[i].target?' '+ops[i].target:'');
  console.log('  ' + (r.ok?'✓':'✗') + ' ' + label + ': ' + r.msg);
  if (r.ok) ok++;
}

// Step 4: 统计
var s0 = project.layouts[0];
console.log('');
console.log('── [结果] ──');
console.log('  执行: ' + ok + '/' + ops.length);
console.log('  Scenes:' + project.layouts.length + ' Objects:' + project.objects.length + ' SceneObjects:' + (s0?s0.objects.length:0) + ' Instances:' + (s0?s0.instances.length:0) + ' Events:' + (s0?s0.events.length:0) + ' Vars:' + project.variables.length);

if (s0 && s0.events.length > 0) {
  console.log('');
  console.log('  事件详情:');
  for (var ei = 0; ei < s0.events.length; ei++) {
    var e = s0.events[ei];
    if (e.type === 'BuiltinCommonInstructions::Repeat') {
      console.log('    [Repeat ' + e.repeatExpression + 's] → ' + e.events[0].actions.length + ' actions');
    } else {
      console.log('    [Standard] ' + e.conditions.length + ' conditions → ' + e.actions.length + ' actions');
    }
  }
}

// Step 5: 写入 output
var outDir = path.join(__dirname, '..', 'output');
fs.mkdirSync(outDir, {recursive:true});
fs.writeFileSync(path.join(outDir, 'project.json'), JSON.stringify(project, null, 2));
console.log('');
console.log('── [文件] ──');
console.log('  output/project.json (' + JSON.stringify(project).length + ' bytes)');

try {
  var engDir = path.join(__dirname, '..', 'engine', 'runtime');
  if (fs.existsSync(engDir + '/game.html')) {
    var html = fs.readFileSync(engDir + '/game.html', 'utf8');
    html = html.replace('var projectData = PROJECT_DATA_PLACEHOLDER;', 'var projectData = ' + JSON.stringify(project) + ';');
    fs.writeFileSync(outDir + '/game.html', html);
    console.log('  output/game.html ← 浏览器打开即玩');
  }
} catch(e) {}

console.log('');
console.log(ok === ops.length ? '✅ 全链路通过' : '❌ 有失败');
