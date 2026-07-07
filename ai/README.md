# AI — 生成管线

两段式 AI 管线：创意 LLM 生成设计稿 → 确定性 LLM 翻译为 DSL → DSL 解析执行 → project.json。

## 文件

| 文件 | 职责 |
|------|------|
| `pipeline.js` | ★ 主引擎（521行），包含 DSL 解析器 + 事件模板 + 事件解析器 + 操作执行器 + 两段式 LLM + CLI |
| `event-templates.js` | 条件/动作模板定义（9 CONDITIONS + 15 ACTIONS），独立参考模块 |
| `event-parser.js` | 事件 DSL 解析器（`parseEventDSL` / `parseTrigger` / `parseAction`），独立参考模块 |
| `schema/operations.ts` | 29 个 GDevelop 操作的完整 TypeScript 映射（真理之源） |
| `schema/json-engine.ts` | TypeScript 版 JSON 操作引擎（420行，类型安全，待与 pipeline.js 统一） |
| `schema/gdevelop-types.ts` | GDevelop project.json 的完整 TypeScript 类型定义 |


## 管线流程

```
用户一句话
  → generateDesignBrief (temp=0.7)      设计稿 JSON {theme, objects, rules, difficulty}
  → buildDSLPrompt                       构建填空式 DSL prompt
  → callLLM (temp=0)                     输出行式 DSL 操作序列
  → parseDSL                             解析为操作列表
  → execute × N                          逐个执行操作，构建 project.json
  → 注入 game.html → output/
```

## 运行

```bash
# Mock 模式（内置 platformer DSL，无需 LLM）
node ai/pipeline.js --mock "一个平台跳跃游戏"

# 真实 AI 生成
node ai/pipeline.js "一个太空射击游戏"

# 环境变量
export LLM_ENDPOINT=http://127.0.0.1:18081/v1
export DEEPSEEK_API_KEY=your_key
export LLM_MODEL=deepseek-v4-pro
```

## Mock 模式

内置一个完整的 platformer DSL（22 行操作 + 4 个事件），直接跳过 LLM 调用执行。用于测试管线全流程。

## 两段式设计原理

| 阶段 | 温度 | 输入 | 输出 | 用途 |
|------|------|------|------|------|
| Creative | 0.7 | 用户一句话 | 设计稿 JSON | 创意发散，自由设计 |
| Deterministic | 0 | 设计稿 JSON | DSL 操作序列 | 精确翻译，格式保证 |

第一阶段允许 LLM 发挥创意（随机颜色、多样布局），第二阶段严格按模板填空（保证 DSL 语法正确）。
