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
