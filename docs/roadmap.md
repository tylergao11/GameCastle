# GameCastle 路线图

## Phase 1: 当前骨架

- [x] 仓库目录和基础文档
- [x] GDJS Runtime 嵌入
- [x] DSL 解析与执行主路径
- [x] Mock 生成 `output/project.json` + `output/game.html`
- [x] React/Vite 平台壳
- [x] 清理旧路径、临时拼装脚本和旧平台残留
- [x] 生成稳定 `ProjectWorld` 和追加式 `ExecutionLedger`
- [x] 建立 `ai/capabilities/` 能力真相源并接入 LLM1/LLM2 上下文派生
- [x] 接入 LLM2 repair loop：失败报告 -> 追加修复 DSL diff -> 再执行
- [x] 建立 DSL fixture 测试器，覆盖状态边界、repair batch、缓存命中和超时防护
- [x] 建立产品模块 DSL 骨架：product module manifests -> Module DSL -> compiler -> internal DSL -> ProjectWorld/network manifest

## Phase 2: 模块化生成管线

- [ ] 继续把 `templates/` 从完整原型样例升级为模块能力库
- [x] 定义 AI-facing 产品模块 schema，保持 `core.*`、`shell.*`、`system.*`、`meta.*` 等粗颗粒模块边界
- [x] 为产品模块预留 sync/authority/tickRate/seed，同步策略写入 `output/network-manifest.json`
- [x] 将在线 LLM2 主路径切到 Module Patch Commander：Module DSL -> compiler -> internal DSL -> executor
- [x] 支持 `--continue` 基于 `ProjectWorld.modules` 追加模块，并拒绝重复安装已有模块
- [x] 闭合 `configure module`：支持已安装模块参数 patch、sync-only metadata patch、非法配置 fail-fast
- [x] 增加测试审批闸门：`--approval-gate` 生成 pending approval，人工审查后 `--approve-pending` 执行
- [x] 定义模块能力 schema：对象、变量、事件、依赖、兼容关系、运行时限制
- [x] 明确 LLM1 只看轻量能力提示和当前体验摘要，不看模板结构
- [x] 明确 LLM2 读取模块能力库、DSL 能力、参数约束和项目状态
- [x] 明确只有 LLM2 输出确定性 patch
- [ ] 把 `pipeline.js` 拆成设计、编译、执行、状态、provider 五个边界
- [ ] 用 `ai/schema/` 统一 JavaScript 执行器和 TypeScript 操作定义

## Phase 3: 可反复迭代的项目状态

- [ ] 完整建立项目状态模型，区分 design brief、module graph、DSL patch、ProjectWorld、project.json
- [ ] 支持用户连续修改，例如“再难一点”“加入 Boss”“改成双人”
- [ ] 让 LLM2 生成 DSL/operation patch，而不是每次重建全量项目
- [ ] 保留版本历史和回滚点
- [ ] 在平台端展示当前模块、生成步骤和可试玩版本

## Phase 4: 平台接入

- [ ] 前端创建页真正调用生成管线
- [ ] iframe 试玩 `output/game.html`
- [ ] postMessage 上报加载、分数、错误和游戏结束
- [ ] 发布到发现流
- [ ] 分享和作品管理

## Phase 5: 联机能力

- [ ] 设计联机模块能力：房间、输入流、状态同步、帧同步、断线恢复
- [ ] 标注模块的同步约束和确定性要求
- [ ] 给可同步对象引入稳定网络 ID
- [ ] 区分本地表现状态和权威游戏状态
- [ ] 在 DSL/执行器中支持同步变量和同步事件

## Phase 6: 质量门

- [ ] 生成器单元测试
- [x] DSL fixture 测试
- [ ] `project.json` schema 校验
- [ ] 浏览器运行时冒烟测试
- [ ] 前端 lint/typecheck/build 纳入根命令
