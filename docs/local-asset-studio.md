# 本地资产工作台

`/assets` 是可选的本地创作入口，不是产品唯一入口，也不是创建游戏的前置步骤。它不调用云端、
识图或生图；所有创作都在浏览器 Canvas 与 `localStorage` 中完成。跳过它的用户可直接使用意象、
模板或云端库进入同一条 Asset Weave 主链。

## 能力

- 上传 PNG/JPEG/WebP；
- 对白色/近白色、且与画布边缘连通的纸张底，提供本地去底；不把它宣称为通用抠图；
- 简笔画笔刷与透明擦除；
- 基于 alpha 的自动裁切：保留与资产尺寸相关的安全边距，避免描边和投影被切断；
- 本地改色、缩放与 Canvas 图层合成；
- `STYLE 1` 本地意象美化：仅填充闭合线稿，固定粗描边、色板、投影、高光与简化表情，并在输出后自动裁切；
- 不可变 revision 列表、撤销与重做；
- 刷新后恢复本地 revision；
- 将当前 revision 写入明确的本地 `AssetBinding` 槽位；Play 容器会读取该绑定并按选择的低成本 motion 显示透明 PNG；
- UI 模板与可写槽位从共享资源词典读取；工作台只允许当前模板拥有的槽位；
- 绑定时写入浏览器本地库，记录 `localExplicit`、来源、授权、`styleId` 与 AssetSpec；
- 本地 Runtime 可用时，绑定会同步为内容哈希 PNG、`asset-runtime-bindings.json` 与导出 overlay；它们随 immutable playable release 一起发布；
- 同步 API 只接收带 alpha 的 PNG data URL、限制体积/像素并验证 PNG 签名；服务器先通过 Asset Weave 本地验收后才写入 binding manifest；
- 云端复用是可选入口：用户输入标签后，只搜索/材料化已批准资源；无命中会明确提示且不会自动生图；
- 导出透明 PNG。

## 边界

`STYLE 1` 只处理用户已经画出的 alpha 轮廓；开放轮廓不会被虚构填满，闭合轮廓才会成为
实心剪影。它不推断“这是什么”，也不新增物体语义。
工作台只产生 `localExplicit` 资产输入、revision 和 binding。浏览器本地库的 `repositoryStatus`
固定为 `local`，不会被当作云端已审核资源，也不会自动上传。它不调用模型、不写云端、
不直接变更玩法语义。后端 Asset Weave 仍是唯一的 Resolver/Validation/Acceptance
所有者。

## 验收

```text
npm --prefix platform run build
npm run check:visual-assets
```

手动路径：上传或绘制 -> `STYLE 1` 本地美化 -> 擦除/清空 -> 自动裁切 -> 撤销/重做 ->
导出 PNG -> 绑定槽位 -> 刷新页面，确认 revision 与本地库记录仍在。另从主页直接开始创建，
确认不访问工作台也不会阻塞 Asset Weave。
