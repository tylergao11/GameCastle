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
