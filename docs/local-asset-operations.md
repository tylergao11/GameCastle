# 本地资产像素操作

共享脚本为 `shared/local-asset-ops.mjs`。它只接收内存中的 RGBA 栅格，不能读取文件、URL、
模型、云端库或玩法数据；因此可由浏览器工作台、未来桌面导入器和离线测试共同复用。

| 操作 | 输入 | 输出 | 不做什么 |
| --- | --- | --- | --- |
| `alphaBounds` | RGBA 与 alpha 阈值 | 非透明边界 | 不改像素 |
| `cropToAlpha` | RGBA、边距 | 新栅格与原坐标边界 | 不缩放、不丢投影安全边距 |
| `solidifyClosedLineArt` | 线稿 alpha | 闭合区域的实心剪影 | 不填充与画布边缘连通的开放轮廓 |
| `removeLightEdgeBackground` | RGBA、近白阈值 | 去除边缘连通的近白像素 | 不声称处理任意背景或前景洞孔 |
| `inspectLocalRaster` | RGBA | 空画布、覆盖率、边界、全不透明提示 | 不调用网络或模型 |

`ai/check-local-asset-ops.mjs` 对裁切边距、闭合/开放线稿，以及白色边缘背景分别做像素级
断言。工作台只在用户操作后创建新 revision，绝不覆盖原 revision。

文件级的本地派生 owner、OperationSpec、云端边界和后续脚本目录见
`docs/local-derivation-kernel.md`。本文件不把尚未注册的 Runtime handler 表述为已实现能力。
