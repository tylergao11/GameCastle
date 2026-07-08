# AI — 模块化生成管线

`ai/` 当前负责把用户意图编译为可运行游戏项目。它不是“模板拷贝器”，而是游戏工厂的生成管线雏形。

## 当前文件

| 文件 | 职责 |
|------|------|
| `pipeline.js` | 当前主路径：LLM1 设计稿、LLM2 DSL 翻译、DSL 解析、事件解析、操作执行、CLI、`output/` 写入 |
| `project-world.js` | 把 GDevelop `project.json` 翻译为稳定的 `ProjectWorld`，并追加 `ExecutionLedger` |
| `schema/operations.ts` | GDevelop 操作定义，后续应成为能力到 JSON 操作的真理源 |
| `schema/json-engine.ts` | TypeScript 版 JSON 操作执行器，待与 `pipeline.js` 统一 |
| `schema/gdevelop-types.ts` | GDevelop `project.json` 类型定义 |

历史拼装脚本和硬编码旧路径已经移除。后续新增脚本必须使用仓库相对路径，并且明确属于测试、构建还是迁移。

## 当前管线

```text
prompt
  -> LLM1 generateDesignBrief
  -> module/design brief
  -> LLM2 translate to DSL
  -> parseDSL
  -> execute operations
  -> output/project.json + output/game.html
  -> output/project-world.json + output/execution-ledger.json
```

## 目标管线

```text
prompt / iteration request
  -> project state summary
  -> lightweight creative context
  -> LLM1 creative design intent
  -> module capability catalog for compiler
  -> LLM2 deterministic DSL patch
  -> typed operation executor
  -> versioned project state
  -> runnable build
```

## LLM 可见信息边界

LLM1 不记忆模板结构，也不负责输出 patch。它看到用户意图、当前游戏体验摘要和少量能力提示，负责提出高层玩法和体验变化。

LLM2 才看到模块能力库、DSL 能力、参数规则、当前项目状态和 LLM1 的创意输出。它负责把意图编译成确定性 patch。

完整模板不应该作为主要上下文展示给任一阶段。LLM1 只需要能力提示；LLM2 需要的是可编译的模块能力和 DSL 规则，而不是整套游戏模板。

`project.json` 是 GDevelop/GDJS 的运行产物，不是 LLM2 的主要上下文。LLM2 的循环上下文应该是翻译后的 `ProjectWorld`、模块能力卡、上一轮 DSL diff 和 `ExecutionLedger`，用来判断当前世界、已完成命令和需要修复的命令。

## 命令

```bash
# 离线 mock 生成
node ai/pipeline.js --mock platformer

# 真实 LLM 生成
node ai/pipeline.js "做一个平台跳跃收集金币的游戏"

# 继续迭代
node ai/pipeline.js --continue "加入一个 Boss，并让金币更密集"

# 语法检查
npm run check:ai
```

## 环境变量

```bash
LLM_ENDPOINT=http://127.0.0.1:18081/v1
DEEPSEEK_API_KEY=your_key
LLM_MODEL=deepseek-v4-flash
```
