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
