# GameCastle 路线图

## Phase 1: 当前骨架

- [x] 仓库目录和基础文档
- [x] GDJS Runtime 嵌入
- [x] DSL 解析与执行主路径
- [x] Mock 生成 `output/project.json` + `output/game.html`
- [x] React/Vite 平台壳
- [x] 清理旧路径、临时拼装脚本和旧平台残留
- [x] 生成稳定 `ProjectWorld` 和追加式 `ExecutionLedger`
- [x] 建立 `ai/product-modules/` 唯一真相源（合并 capabilities），接入 LLM1/LLM2 上下文派生
- [x] 接入 LLM2 repair loop：失败报告 -> 追加修复 DSL diff -> 再执行
- [x] 建立 DSL fixture 测试器，覆盖状态边界、repair batch、缓存命中和超时防护
- [x] 建立产品模块 DSL 骨架：product module manifests -> Module DSL -> compiler -> internal DSL -> ProjectWorld/network manifest

## Phase 2: 模块化生成管线

- [x] 清理 `templates/` 游戏原型样例，能力迁移到 product-modules
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
- [x] 用 `ai/gdevelop-truth/runtime-truth.json` 统一 GDevelop runtime 类型、include 和数据字段真相源

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

- [x] 定义六种互动模式（轮流事件、主机照镜子、帧同步对战、服务器裁判、各自为战、异步社交）
- [x] 四种同步模型（event / snapshot / lockstep-input / server-authoritative）+ 两种扩展（peer-event / async-state）
- [x] 所有同步基于 GDJS getNetworkSyncData/updateFromNetworkSyncData，不依赖 GDevelop 云服务
- [x] engine/network/ 骨架代码（transport / session / channel / bridge / index）
- [x] 6 个 network 模板，llm1Card 反向声明互动模式
- [x] server/signaling-server.js 信令服务器（单端口、所有游戏共用）
- [x] game template 和 network template 两轴独立选择
- [ ] llm1Card 接入 LLM1 卡片流（network 模板暂未喂给 LLM1）
- [ ] 联机编译接入 html-exporter
- [ ] 端到端联机测试

## Phase 6: 质量门

- [ ] 生成器单元测试
- [x] DSL fixture 测试
- [ ] `project.json` schema 校验
- [ ] 浏览器运行时冒烟测试
- [ ] 前端 lint/typecheck/build 纳入根命令
