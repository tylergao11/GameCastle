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
