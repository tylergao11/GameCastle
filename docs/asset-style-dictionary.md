# GameCastle 资源词典

资源词典是视觉资产、UI 模板和 Runtime 的共同语言，而不是一段仅供模型阅读的风格描述。
当前唯一默认样式为 `gamecastle.style-1`，源文件为
`shared/asset-style-dictionary.json`。

`styleId` 是指向词典的唯一风格主键，必须随 `AssetSpec`、资产 revision、Runtime binding
和 UI 模板传递；`styleTags` 则是可多选的检索/描述标签（例如 `arcade`），不能被当作
`styleId` 推断。缺失 `styleId` 时，才允许取词典的 `defaultStyleId`。

## STYLE 1：GameCastle 意象派

- 深色粗描边；少色扁平填充；透明 PNG；
- 向右下偏移的深色投影，上左小块高光；
- 可选“双点笑脸”组件；
- 角色默认锚点为底部居中；
- `idle / move / hit / death` 默认每状态一张资产，优先由 Runtime 变形实现。

## 词典边界

输入是用户已经画出的 alpha 轮廓。词典负责用固定视觉语法重绘它，使其融入世界；它不
识别物体种类、不补充用户未画出的玩法语义，也不调用云端模型。

## 模板复用

`templateRoles` 约束每一种模板应取用的资源层：

| 模板角色 | 必需资源层 |
| --- | --- |
| `sprite.character` | 描边、填色、投影、高光、表情 |
| `sprite.prop` | 描边、填色、投影、高光 |
| `ui.panel` | 描边、纸张底色、强调色、投影 |
| `ui.button` | 描边、纸张底色、强调色、投影 |

UI 模板注册表与 Runtime 动画绑定都会记录 `styleId`，因此后续增加样式时不需要让每个
模板各自复制色值或帧策略。
