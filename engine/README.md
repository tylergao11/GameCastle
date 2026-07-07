# Engine — GDJS 游戏运行时

从 GDevelop 源码提取的浏览器游戏运行时。

## 核心文件

| 文件 | 说明 |
|------|------|
| `gdjs-runtime.js` | GDevelop JS 核心运行时，加载 project.json 创建游戏实例 |
| `pixi.min.js` | PixiJS 2D 渲染引擎 |
| `howler.min.js` | Howler.js 音频引擎 |
| `game.html` | 启动器 HTML：加载所有 JS → 注入 projectData → `new gdjs.RuntimeGame()` → `startGameLoop()` |

## 扩展（14个）

`extensions/` 目录包含 14 个 GDJS 扩展脚本：

| 扩展 | 说明 |
|------|------|
| `Sprite.js` | 精灵渲染 |
| `TextObject.js` | 文本对象 |
| `PlatformBehavior.js` | 平台移动行为 |
| `AnchorBehavior.js` | 锚点行为 |
| `DestroyOutsideBehavior.js` | 出界销毁 |
| `DraggableBehavior.js` | 拖拽行为 |
| `TopDownMovementBehavior.js` | 俯视角移动 |
| `TweenBehavior.js` | 补间动画 |
| `PanelSpriteObject.js` | 九宫格精灵 |
| `ParticleSystem.js` | 粒子系统 |
| `PrimitiveDrawing.js` | 几何图形绘制（ShapePainter） |
| `PrimitiveDrawing-renderer.js` | 几何图形渲染器 |
| `TiledSpriteObject.js` | 平铺精灵 |
| `TextEntryObject.js` | 文本输入 |
| `Effects.js` | 视觉效果 |

## 嵌入方式

平台前端通过 iframe 加载 game.html，project.json 在构建时注入：

```html
<!-- pipeline.js 自动替换 -->
<script>
var projectData = <project.json 内联>;
var game = new gdjs.RuntimeGame(projectData, {});
game.getRenderer().createStandardCanvas(document.body);
game.loadAllAssets(function() { game.startGameLoop(); });
</script>
```

pipeline.js:508-509 自动完成 `PROJECT_DATA_PLACEHOLDER` → project.json 的替换。
