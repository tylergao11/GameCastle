# simulated-local 资产闭环

当前没有 API key，因此 `simulated-local` 是可测试的离线模型适配器，不是 OpenAI、也不宣称
具备真实识图或生图能力。它只能生成固定 `STYLE 1` 低细节图标，并且所有 candidate 与 binding
都会带 `simulated: true`、`provenance: simulated-local-*`、`license: simulation-only`；禁止自动
晋升云库。

## 真实执行链

```text
用户意象（可跳过手绘）
  -> 一张 288 x 96 simulated sprite sheet PNG
  -> Runtime cropSpriteSheet（3 x 96 x 96 透明 PNG）
  -> 每帧 localExplicit -> simulated Vision -> AssetSpec validation
  -> AssetManifest / Runtime binding
  -> HTML export manifest
  -> asset-runtime.js 在 GDevelop 构造前注册 image resource、Sprite object 与 UI instance
```

`/api/runtime/assets/simulated/sheet` 必须精确接收 3 个 icon；它保留母图路径、格子 index、
frame 宽高、母图/帧 hash。后续裁切、绑定、导出测试应复用同一份母图与三个裁切 PNG，不得为
掩盖 Runtime 问题而每次重新生成。

## P0 不变量

1. 生成 sheet、裁切帧和 Vision 都经过 Runtime owner；前端不直写 manifest。
2. 前端 Play 页面不再用 iframe 外 DOM 图片覆盖游戏。导出脚本同步修改 `gdjs.projectData`，
   resource `name` 与项目内 PNG `file` 分离，并把 resource 写入 `layout.usedResources`；
   GDevelop 先预加载 image resource，再实例化 Sprite。
3. 云端 near 命中必须由 deterministic variant 写出不同字节的 PNG，binding source 为
   `deterministicVariant`；禁止只改状态。
4. `asset-runtime-bindings.json` 是预览、导出和 GDevelop 注入的唯一 binding 真相源。
5. 每次 binding 保存同步投影 `output/asset-world.json`；AssetWorld 不反向修改 binding manifest。

## 验收

- `npm run check:visual-assets`：像素、sheet、Vision、Graph、HTTP、GDevelop 注入与导出。
- `npm --prefix platform run build`：用户可跳过手绘并请求一张 sheet 的前端入口。
- `node ai/pipeline.js --intent-fixture-file ai/fixtures/intent-mobile-platformer.dsl`：导出清单包含
  母图/裁切 PNG 和 `asset-runtime.js`。
