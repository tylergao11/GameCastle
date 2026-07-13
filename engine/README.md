# GDJS Runtime

`engine/gdevelop-runtime/` 是官方 GDJS 浏览器运行时的本地缓存，不维护自制 runtime shim。

```powershell
npm run runtime:prepare
# 或：node scripts/prepare-gdjs-runtime.js --source <path-to-GDevelop-master>
```

准备脚本也支持 `GDEVELOP_SOURCE_DIR`。导出的 `output/index.html`、`output/game.html` 与 `output/html-export-manifest.json` 共同记录可运行 HTML 产物。

- [运行时准备脚本](../scripts/prepare-gdjs-runtime.js)
- [GDevelop 官方仓库](https://github.com/GDevelopApp/GDevelop)
