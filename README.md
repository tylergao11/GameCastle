# GameCastle

AI 内容平台 — 一句话生成小游戏，浏览器直接玩。

## 架构

```
用户一句话 → Creative LLM (设计稿) → Deterministic LLM (DSL翻译) → DSL解析 → 操作执行 → project.json → GDJS Runtime → 浏览器
```

**两段式 AI 管线**：第一阶段创意 LLM（temp=0.7）生成游戏设计稿 JSON，第二阶段确定性 LLM（temp=0）将设计稿翻译为行式 DSL，DSL 解析器 + 操作执行器直接构建 GDevelop project.json。

## 目录

| 目录 | 职责 |
|------|------|
| `engine/` | GDJS 游戏运行时（PixiJS + Howler + 14 扩展） |
| `templates/` | 游戏原型模板（DSL 格式，4 个类型） |
| `ai/` | AI 生成管线（pipeline.js 主引擎 + 事件模板/解析器） |
| `dsl/` | DSL 语法文档 |
| `platform/` | 平台前端（游戏广场 + 一句话输入 + iframe 展示） |
| `output/` | 生成产物（project.json + game.html） |

## 技术栈

- **游戏引擎**: GDevelop GDJS Runtime (PixiJS + Howler)
- **AI 管线**: 两段式 LLM（DeepSeek via HTTP API）
- **DSL**: 行式 key=value 操作指令 + 自然语言事件 DSL
- **平台前端**: HTML5 + Vanilla JS
- **模板**: JSON 内嵌 DSL 数组，纯几何图形（ShapePainter）

## 快速开始

```bash
# Mock 模式（不调 AI，使用内置 platformer 示例）
node ai/pipeline.js --mock "一个平台跳跃游戏"

# 真实 AI 生成（需要 LLM 端点）
node ai/pipeline.js "一个太空射击游戏"
```

输出：`output/project.json` + `output/game.html`（浏览器打开即玩）

## 核心原则

- **模板骨架保证合法性，AI 只生成参数** — DSL 操作限定在安全范围内
- **两段式 LLM** — 创意发散（temp=0.7）+ 精确翻译（temp=0）
- **ShapePainter 几何图形** — 零素材依赖，纯代码生成
- **平台内 iframe + GDJS 直接渲染** — 无构建步骤
