# 视觉资产测试矩阵

本矩阵把视觉资产闭环的测试分为零模型成本的常规门和显式触发的真实模型 smoke。
writer 可运行本地检查，但通过结论必须由独立测试和独立审计复核。

## 命令与门

| 门 | 目标 | 模型/网络 | 状态 |
|---|---|---|---|
| `npm run check:visual-assets` | 风格词典、AssetSpec 确定性验收、本地/云端优先级、LangGraph 条件路由、低帧绑定与持久化 ledger | 禁止 | 已实现 |
| `npm run check:comfyui-local` | `comfyui-local` loopback 授权、health、submit/history、临时候选物化、验收后晋升、provenance、取消、超时、坏输出、预算和幂等 | 禁止，注入 mock | 已实现 |
| `npm run test:visual-assets` | 当前复用上述零模型 fixture 门；浏览器手动路径另列 | 禁止，全部 mock | 已实现，但尚非独立测试套件 |
| `npm run check:comfyui-stage-b` | 受控 parent/mask ImageEdit、mask 外像素保护、private workflow gate 与派生 candidate taint、Florence schema review、child revision persistence、custom-node package hash | mock Comfy transport；禁止真实模型/网络 | 已通过 |
| `npm run check:comfyui-extensions` | LoRA/ControlNet 仅 ID、style/workflow scope、未批准 artifact 拒绝 | 禁止路径、URL、任意节点或权重注入 | 已通过；未批准 artifact 不可执行 |
| `npm run check:comfyui-worker` | 受 governance 的云 Worker health/submit/status/cancel、deployment attestation、固定 output fetch、response body deadline、私有输入拒绝、完整生产集验收、accepted Worker→AssetRevision provenance | 注入 mock Worker；禁止真实 GPU/网络；deployment registry 在测试外保持未批准 | Stage C 启动基线已实现；不是 GPU 生产验证 |
| `npm run check:comfyui-c2` / `check:comfyui-c2-metrics` | C-2 镜像/SBOM/model/workflow/license/GPU/human-review approval 与 live-GPU 指标格式 | fixture 只证明 gate；拒绝 simulated、少于 20 条或无人工决定的 evidence | 已实现；真实 GPU evidence 尚缺 |
| `npm run smoke:comfyui-cpu-e2e` | 串行运行 Stage A 与 Stage B，输出本机端到端 shadow 审计报告 | 仅显式手工调用；要求真实本地 ComfyUI 和固定模型 hash | 验证整体资产链，不是 GPU 性能、质量、并发或 C-2 evidence |
| `npm run check:ai` | 现有 AI 契约与资产基础检查 | 不应调用真实模型 | 现有基础门 |

真实模型 smoke 不得成为常规 CI 前置条件；其结果必须记录 provider、model、请求标识、
成本、时间和人工/审查结论。

## 当前基线与迁移门

旧的两份断裂 smoke 与 `texture-provider` 已删除。`check:visual-assets` 现在运行一组
条件图 fixture，从 `AssetSpec` 到 `AssetManifest/AssetWorld/AssetBinding` 验证完整路径，并
包含 STYLE 1 词典和 PNG/尺寸/透明度/标签的确定性验收。
旧 resolver 的 async 生成分支也已删除；任何新绕过都必须由下列 C 类测试拒绝。

## 契约与边界测试

| 编号 | 场景 | 必须断言 |
|---|---|---|
| C-01 | AssetRecord | 原始文件有内容哈希、来源、许可、scope 和有效尺寸/格式。 |
| C-02 | AssetRevision | 操作产生新 revision，不覆盖父文件；父链无环且可重放。 |
| C-03 | TemplateSpec | 纯模板变更不写 Intent DSL、不改玩法 semantic hash。 |
| C-04 | Graph 状态 | 子图声明严格的 `externalInputs` / `previousTurnInputs` allowlist；其余读必须由入口或前序条件边写入，禁止 `image-generation` 先读后置 resolver 状态。 |
| C-05 | Owner | 前端没有 provider 调用；ImageAgent/VisionAgent 没有 AssetBinding/云端批准写权限。 |
| C-06 | 占位符 | placeholder 不可发布、不可晋升、不可写为 exact cache 成功记录。 |
| C-07 | LLM2 隔离 | LLM2 输入不含原图、提示词、云端路径、Bridge/target plan 或成本明细。 |
| C-08 | 发布门 | `verified=false`、Vision/provider 超时或 provenance/许可缺失的 candidate 不得批准、发布或晋升。 |
| C-09 | 旧路径 | 生产代码不得恢复直接 provider 调用或未审 async generation；任何此类调用都不能绕过 resolver、Validation 与 Acceptance。 |
| C-10 | 云资源 | 云端晋升要求用户同意、scope、license、provenance、Vision/云验证与 Acceptance；近似去重只能建议，不能静默合并用户作品。 |
| C-11 | 文件安全 | 实际图像解码、MIME/签名一致、像素/文件/帧上限、压缩炸弹、EXIF 与 SVG/路径隔离都必须通过。 |
| C-12 | 循环持久化 | `runId + slotId + AssetSpec hash` 重入时恢复 attempt/cost；不能因重启图而重置预算或重复生图。 |

## 本地确定性图像测试

| 编号 | 场景 | 必须断言 |
|---|---|---|
| L-01 | 简笔画 | 保存笔划/画布源数据，能派生透明 PNG，刷新后可继续编辑。已通过浏览器手动路径验证。 |
| L-02 | 裁切 | 输出宽高、像素区域和 revision 参数与请求一致。 |
| L-03 | 擦除 | mask 内 alpha 变化，mask 外像素不变；默认不调用网络。 |
| L-04 | 改色 | 只生成 variant；源 revision 和内容哈希不被覆盖。 |
| L-05 | PNG | 导出文件有效、尺寸正确、要求透明时实际带 alpha；重复导出稳定。 |
| L-06 | 撤销/重做 | 版本指针正确，历史 revision 不丢失；恢复图片期间禁止编辑以避免版本错配。 |

## 解析优先级与成本测试

| 编号 | 输入 | 期望路径 | 模型调用 |
|---|---|---|---|
| R-01 | 用户本地简笔画/上传 | `localExplicit -> validation -> acceptance -> finalize` | 0 |
| R-02 | 同一本地 revision/操作 | `localExactCache -> validation -> acceptance(reused) -> finalize` | 0 |
| R-03 | 云端精确命中 | `cloudRepoExact -> materialize -> validation -> acceptance -> finalize` | 0 |
| R-04 | 云端近似命中，改色可满足 | `cloudRepoSemantic -> deterministicVariant -> validation -> acceptance -> finalize` | 0 |
| R-05 | 云端近似命中，须新增像素 | `cloudRepoSemantic -> imageEdit -> review -> validation -> acceptance` | 有界 |
| R-06 | 无候选 | `imageGeneration -> review -> validation -> acceptance` | 有界 |
| R-07 | 无候选且未授权/无预算 | `placeholderDebt` | 0 |
| R-08 | resolver cache 命中 | `cache -> validation -> acceptance(reused) -> finalize`；不访问云端、不产生新 revision | 0 |

所有 R 类测试都要以 mock provider 的实际调用计数为断言，而非仅检查最终状态。

## 模型循环测试

| 编号 | 场景 | 必须断言 |
|---|---|---|
| M-01 | 生图候选通过 Vision | 接受 candidate，写入完整 provenance 和 AssetReview。 |
| M-02 | Vision 返回可修复缺陷 | 只根据结构化 repairPlan 重试，attemptCount 加一。 |
| M-03 | 连续可修复失败 | 达到每 slot 上限后退出为 debt，图执行结束。 |
| M-04 | 预算/超时/取消 | 立刻停止循环，父 revision 和现有绑定不受影响。 |
| M-05 | Vision 拒绝 | 不可发布、不可晋升；不得自动改写图片。 |
| M-06 | 本地上传识图失败 | 本地使用仍可继续，只有标签状态为未验证。 |
| M-07 | 未验证生成候选 | `verified=false`、Vision 超时或 provenance 缺失时，AcceptanceGate 拒绝批准和云端晋升。 |
| M-08 | 重入与幂等 | 相同 run/slot/spec 重入不重新请求模型；不同 spec 才建立新的有限预算记录。 |
| M-09 | ComfyUI transit | Comfy 输出先成为 `AssetBlobRef` 临时候选；review/validation/acceptance 后才复制到 project-local；不得暴露 Comfy output 绝对路径。 |

## 端到端验收

端到端测试应在真实平台 UI 上至少覆盖：

1. 简笔画 -> 擦除 -> 裁切 -> 透明 PNG -> 游戏对象绑定 -> 重载后继续编辑。
2. 上传 -> 本地编辑 -> 绑定 UI 模板槽位 -> 更换模板；玩法语义 hash 不变。
3. 云端精确资源 -> 拉取本地副本 -> 离线试玩/导出可用。
4. 云端近似资源 -> 本地改色；网络与模型调用计数为零。
5. 无资源 -> mock 生图 -> mock 识图通过 -> manifest/AssetWorld/RuntimeLinker 正确串联。
6. mock 识图连续拒绝 -> 有界退出 -> placeholder debt 显示给用户。

## 独立交付证据

最终交付必须附带：

- writer 的变更清单和本地 smoke 结果；
- Tester 复跑的命令、日志和失败路径结果；
- Auditor 的 owner/成本/循环/隐私审计结论；
- 尚未接入的 provider 与 UI 功能清单，明确标为预留而非已实现。
