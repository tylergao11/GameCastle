import { useEffect, useRef, useState } from 'react'
import styleDictionary from '../../../shared/asset-style-dictionary.json'
import { alphaBounds, cropToAlpha, removeLightEdgeBackground, solidifyClosedLineArt } from '../../../shared/local-asset-ops.mjs'
import { upsertLocalAsset } from '../localAssetLibrary'
import { generateSimulatedRuntimeSheet, resolveRuntimeCloudAsset, saveRuntimeAssetBinding, searchRuntimeCloudAssets } from '../runtime/client'

type Revision = { id: string; label: string; png: string; createdAt: number }
const STYLE_ID = styleDictionary.defaultStyleId as keyof typeof styleDictionary.styles
const STYLE = styleDictionary.styles[STYLE_ID]
const UI_TEMPLATES = styleDictionary.uiTemplates

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }
function canvasPng(canvas: HTMLCanvasElement) { return canvas.toDataURL('image/png') }
function loadImage(src: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src }) }
function canvasRaster(canvas: HTMLCanvasElement) { const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height); return { width: canvas.width, height: canvas.height, data: image.data } }
function browserImageData(raster: { width: number; height: number; data: Uint8ClampedArray }) { const pixels = new Uint8ClampedArray(raster.data.length); pixels.set(raster.data); return new ImageData(pixels, raster.width, raster.height) }
function canvasFromRaster(raster: { width: number; height: number; data: Uint8ClampedArray }) { const result = document.createElement('canvas'); result.width = raster.width; result.height = raster.height; result.getContext('2d')!.putImageData(browserImageData(raster), 0, 0); return result }
function drawAlphaLayer(target: CanvasRenderingContext2D, source: HTMLCanvasElement, color: string, dx = 0, dy = 0) {
  const layer = document.createElement('canvas'); layer.width = source.width; layer.height = source.height
  const layerContext = layer.getContext('2d')!; layerContext.drawImage(source, 0, 0); layerContext.globalCompositeOperation = 'source-in'; layerContext.fillStyle = color; layerContext.fillRect(0, 0, layer.width, layer.height)
  target.drawImage(layer, dx, dy)
}

export default function AssetStudio({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [index, setIndex] = useState(-1)
  const selectedIndex = useRef(-1)
  const [restoring, setRestoring] = useState(false)
  const [brush, setBrush] = useState(18)
  const [mode, setMode] = useState<'draw' | 'erase'>('draw')
  const [binding, setBinding] = useState('asset.ui.custom')
  const [templateId, setTemplateId] = useState(UI_TEMPLATES[0].id)
  const [tint, setTint] = useState('#ee493a')
  const [scale, setScale] = useState(100)
  const [motion, setMotion] = useState('float')
  const [cloudTags, setCloudTags] = useState('')
  const [imagery, setImagery] = useState('')
  const current = revisions[index]

  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem('gamecastle:local-asset-revisions') || '[]') as Revision[]; if (saved.length) { selectedIndex.current = saved.length - 1; setRevisions(saved); setIndex(saved.length - 1) } } catch { localStorage.removeItem('gamecastle:local-asset-revisions') } }, [])
  useEffect(() => { if (revisions.length) localStorage.setItem('gamecastle:local-asset-revisions', JSON.stringify(revisions)) }, [revisions])

  function selectRevision(nextIndex: number) { selectedIndex.current = nextIndex; setIndex(nextIndex) }
  function commit(label: string) {
    const canvas = canvasRef.current
    if (!canvas) return
    const revision = { id: uid(), label, png: canvasPng(canvas), createdAt: Date.now() }
    setRevisions((items) => { const next = [...items.slice(0, selectedIndex.current + 1), revision]; selectedIndex.current = next.length - 1; return next })
    setIndex(selectedIndex.current + 1)
  }
  function restore(revision: Revision) { setRestoring(true); void loadImage(revision.png).then((image) => { const canvas = canvasRef.current; if (!canvas) return; canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.getContext('2d')!.drawImage(image, 0, 0) }).finally(() => setRestoring(false)) }
  useEffect(() => { if (current) restore(current) }, [current])
  function point(event: React.PointerEvent<HTMLCanvasElement>) { const rect = event.currentTarget.getBoundingClientRect(); const scaleX = event.currentTarget.width / rect.width; const scaleY = event.currentTarget.height / rect.height; return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY } }
  function paint(event: React.PointerEvent<HTMLCanvasElement>) { if (restoring || !drawing.current) return; const canvas = canvasRef.current!; const ctx = canvas.getContext('2d')!; const p = point(event); ctx.save(); ctx.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over'; ctx.fillStyle = '#17253e'; ctx.beginPath(); ctx.arc(p.x, p.y, brush, 0, Math.PI * 2); ctx.fill(); if (lastPoint.current) { ctx.strokeStyle = '#17253e'; ctx.lineWidth = brush * 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(lastPoint.current.x, lastPoint.current.y); ctx.lineTo(p.x, p.y); ctx.stroke() } ctx.restore(); lastPoint.current = p }
  function cropCanvas(canvas: HTMLCanvasElement, padding: number) { const cropped = cropToAlpha(canvasRaster(canvas), { padding }); if (!cropped.bounds) return false; canvas.width = cropped.image.width; canvas.height = cropped.image.height; canvas.getContext('2d')!.putImageData(browserImageData(cropped.image), 0, 0); return true }
  function cropTransparent() { const canvas = canvasRef.current!; const padding = Math.max(8, Math.round(Math.min(canvas.width, canvas.height) * .04)); if (cropCanvas(canvas, padding)) commit(`自动裁切透明边缘 + ${padding}px 安全边距`) }
  function removeWhiteBackground() { const canvas = canvasRef.current!; const result = removeLightEdgeBackground(canvasRaster(canvas)); if (!result.removedPixels) return; canvas.getContext('2d')!.putImageData(browserImageData(result), 0, 0); commit(`本地去白底 ${result.removedPixels}px`) }
  function clearCanvas() { const canvas = canvasRef.current!; canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height); commit('清空画布') }
  function recolor() { const canvas = canvasRef.current!; const ctx = canvas.getContext('2d')!; const image = ctx.getImageData(0, 0, canvas.width, canvas.height); const hex = tint.slice(1); const red = parseInt(hex.slice(0, 2), 16), green = parseInt(hex.slice(2, 4), 16), blue = parseInt(hex.slice(4, 6), 16); const ink = STYLE.palette.ink.slice(1), inkRed = parseInt(ink.slice(0, 2), 16), inkGreen = parseInt(ink.slice(2, 4), 16), inkBlue = parseInt(ink.slice(4, 6), 16); for (let i = 0; i < image.data.length; i += 4) if (image.data[i + 3]) { const isInk = Math.abs(image.data[i] - inkRed) < 14 && Math.abs(image.data[i + 1] - inkGreen) < 14 && Math.abs(image.data[i + 2] - inkBlue) < 14; if (!isInk) { image.data[i] = red; image.data[i + 1] = green; image.data[i + 2] = blue } } ctx.putImageData(image, 0, 0); commit(`改色 ${tint}（保留描边）`) }
  function beautifyStyleOne() {
    if (restoring) return
    const canvas = canvasRef.current!; const bounds = alphaBounds(canvasRaster(canvas)); if (!bounds) return
    const source = document.createElement('canvas'); source.width = canvas.width; source.height = canvas.height; source.getContext('2d')!.drawImage(canvas, 0, 0)
    const silhouette = canvasFromRaster(solidifyClosedLineArt(canvasRaster(source))); const silhouetteBounds = alphaBounds(canvasRaster(silhouette)); if (!silhouetteBounds) return
    const ctx = canvas.getContext('2d')!; const outline = Math.max(STYLE.renderRecipe.outline.minimumPx, Math.round(Math.min(canvas.width, canvas.height) * STYLE.renderRecipe.outline.widthRatio)); const shadow = Math.max(5, outline * STYLE.renderRecipe.shadow.offsetOutlineMultipler)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawAlphaLayer(ctx, silhouette, `rgba(20,25,35,${STYLE.renderRecipe.shadow.opacity})`, shadow, shadow)
    for (let y = -outline; y <= outline; y += outline) for (let x = -outline; x <= outline; x += outline) if (x || y) drawAlphaLayer(ctx, silhouette, STYLE.palette.ink, x, y)
    drawAlphaLayer(ctx, silhouette, tint)
    ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = `rgba(255,247,229,${STYLE.renderRecipe.highlight.opacity})`; ctx.beginPath(); ctx.ellipse(silhouetteBounds.left + silhouetteBounds.width * .34, silhouetteBounds.top + silhouetteBounds.height * .27, Math.max(3, silhouetteBounds.width * .16), Math.max(3, silhouetteBounds.height * .09), -.45, 0, Math.PI * 2); ctx.fill(); ctx.restore()
    const eyeY = silhouetteBounds.top + silhouetteBounds.height * .55, eyeGap = Math.max(5, silhouetteBounds.width * .12), eyeX = silhouetteBounds.left + silhouetteBounds.width * .5
    ctx.fillStyle = STYLE.palette.ink; ctx.beginPath(); ctx.arc(eyeX - eyeGap, eyeY, Math.max(2, outline * .34), 0, Math.PI * 2); ctx.arc(eyeX + eyeGap, eyeY, Math.max(2, outline * .34), 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = Math.max(2, outline * .34); ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(eyeX, eyeY + Math.max(4, outline), Math.max(4, silhouetteBounds.width * .075), 0, Math.PI); ctx.stroke()
    cropCanvas(canvas, Math.max(8, shadow + outline)); commit('STYLE 1 · 本地意象美化 + 自动裁切')
  }
  function resize() { const canvas = canvasRef.current!; const factor = Math.max(0.1, scale / 100); const width = Math.max(1, Math.round(canvas.width * factor)), height = Math.max(1, Math.round(canvas.height * factor)); const temp = document.createElement('canvas'); temp.width = canvas.width; temp.height = canvas.height; temp.getContext('2d')!.drawImage(canvas, 0, 0); canvas.width = width; canvas.height = height; canvas.getContext('2d')!.drawImage(temp, 0, 0, width, height); commit(`缩放 ${scale}%`) }
  async function upload(file?: File) { if (!file) return; const url = URL.createObjectURL(file); const image = await loadImage(url); const canvas = canvasRef.current!; canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.getContext('2d')!.drawImage(image, 0, 0); URL.revokeObjectURL(url); commit(`上传 ${file.name}`) }
  function download() { const canvas = canvasRef.current!; const a = document.createElement('a'); a.href = canvasPng(canvas); a.download = `${binding.replace(/[^a-z0-9]+/gi, '-')}.png`; a.click() }
  async function bind() {
    if (!current || restoring) return
    const asset = upsertLocalAsset({ revisionId: current.id, png: current.png, slotId: binding })
    const record = { binding, revisionId: current.id, asset, assetSpec: { slotId: binding, kind: 'sprite', semanticTags: [binding], styleId: asset.styleId, styleTags: [asset.styleId], constraints: { transparent: true } }, visualIntent: { subject: binding, motion: motion as 'float' | 'bounce' | 'shake', anchor: 'bottom-center', states: ['idle', 'move', 'hit', 'death'] } }
    try { await saveRuntimeAssetBinding(record); window.alert(`已存入项目本地库、Runtime manifest 与导出资产，并绑定到 ${binding}`) } catch { window.alert('本地 Runtime 未连接；没有创建半完成 binding，请连接后重试') }
  }
  async function reuseCloudAsset() {
    const tags = cloudTags.split(',').map((value) => value.trim()).filter(Boolean)
    if (!tags.length) return
    try {
      const matches = await searchRuntimeCloudAssets(tags)
      if (!matches.length) { window.alert('云端没有已批准的匹配资产；保持本地优先，不会自动生图'); return }
      await resolveRuntimeCloudAsset({ binding, assetSpec: { slotId: binding, kind: 'sprite', semanticTags: tags, styleId: STYLE_ID, styleTags: [STYLE_ID], constraints: { transparent: true } }, visualIntent: { subject: binding, motion, anchor: 'bottom-center', states: ['idle', 'move', 'hit', 'death'] } })
      window.alert(`已复用云端已批准资产并绑定到 ${binding}`)
    } catch (error) { window.alert(error instanceof Error ? error.message : '云端资产复用失败') }
  }
  async function generateThreeIcons() {
    const words = imagery.trim().split(/[^\p{L}\p{N}_-]+/u).filter(Boolean).slice(0, 3)
    const subjects = words.length ? words : ['sun', 'moon', 'key']
    try {
      const icons = subjects.map((subject, iconIndex) => {
        const slotId = `${binding}.simulated.${iconIndex + 1}`
        return { binding: slotId, assetSpec: { slotId, kind: 'sprite', semanticTags: [subject], styleId: STYLE_ID, styleTags: [STYLE_ID], constraints: { transparent: true } } }
      })
      await generateSimulatedRuntimeSheet({ icons, visualIntent: { subject: imagery || 'three icons', motion, anchor: 'bottom-center', states: ['idle', 'move', 'hit', 'death'] } })
      window.alert('已生成 1 张 simulated-local sprite sheet，并由 Runtime 裁切为 3 张 STYLE 1 透明图标')
    } catch (error) { window.alert(error instanceof Error ? error.message : '离线意象生成失败') }
  }

  return <main className="asset-studio">
    <header><button onClick={onClose}>← 返回城堡</button><strong>本地资产工作台</strong><span>LOCAL · SIMULATED MODEL</span></header>
    <section className="asset-toolbar"><label className="upload">上传图片<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void upload(e.target.files?.[0])} /></label><label>意象 <input value={imagery} placeholder="太阳 月亮 钥匙" onChange={(e) => setImagery(e.target.value)} /></label><button onClick={() => void generateThreeIcons()}>离线生成 3 图标</button><button onClick={() => setMode('draw')} className={mode === 'draw' ? 'active' : ''}>画笔</button><button onClick={() => setMode('erase')} className={mode === 'erase' ? 'active' : ''}>擦除</button><label>笔刷 <input type="range" min="2" max="80" value={brush} onChange={(e) => setBrush(Number(e.target.value))} /></label><button disabled={restoring} onClick={clearCanvas}>清空</button><button disabled={restoring} onClick={removeWhiteBackground}>去白底</button><button disabled={restoring} onClick={cropTransparent}>自动裁切 PNG</button><label>改色 <input type="color" value={tint} onChange={(e) => setTint(e.target.value)} /></label><button disabled={restoring} onClick={recolor}>应用色板</button><button disabled={restoring} className="style-one" onClick={beautifyStyleOne}>STYLE 1 · 本地美化</button><label>缩放 <input type="number" min="10" max="400" value={scale} onChange={(e) => setScale(Number(e.target.value))} /></label><button disabled={restoring} onClick={resize}>缩放画布</button><button disabled={restoring || index <= 0} onClick={() => selectRevision(index - 1)}>撤销</button><button disabled={restoring || index >= revisions.length - 1} onClick={() => selectRevision(index + 1)}>重做</button></section>
    <section className="asset-workbench"><div className="canvas-wrap"><canvas ref={canvasRef} width="640" height="480" onPointerDown={(e) => { if (restoring) return; lastPoint.current = null; drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); paint(e) }} onPointerMove={paint} onPointerUp={() => { if (drawing.current) { drawing.current = false; lastPoint.current = null; commit(mode === 'draw' ? '简笔画笔划' : '透明擦除') } }} /></div><aside><p>REVISION {Math.max(index + 1, 0)} / {revisions.length}{restoring ? ' · 恢复中' : ''}</p><div className="revision-list">{revisions.map((revision, itemIndex) => <button key={revision.id} disabled={restoring} className={itemIndex === index ? 'selected' : ''} onClick={() => selectRevision(itemIndex)}>{itemIndex + 1}. {revision.label}</button>)}</div><label htmlFor="asset-template">UI 模板</label><select id="asset-template" value={templateId} onChange={(e) => { const next = UI_TEMPLATES.find((template) => template.id === e.target.value)!; setTemplateId(next.id); setBinding(next.slots[0]) }}>{UI_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select><label htmlFor="asset-slot">绑定槽位</label><select id="asset-slot" value={binding} onChange={(e) => setBinding(e.target.value)}>{(UI_TEMPLATES.find((template) => template.id === templateId)?.slots || ['asset.ui.custom']).map((slot) => <option key={slot} value={slot}>{slot}</option>)}</select><label htmlFor="asset-motion">动态意象</label><select id="asset-motion" value={motion} onChange={(e) => setMotion(e.target.value)}><option value="float">漂浮</option><option value="bounce">弹跳</option><option value="shake">抖动</option></select><button disabled={!current || restoring} onClick={() => void bind()}>绑定到游戏 / UI</button><label htmlFor="asset-cloud-tags">云端标签（可选）</label><input id="asset-cloud-tags" value={cloudTags} placeholder="hero, arcade" onChange={(e) => setCloudTags(e.target.value)} /><button disabled={restoring || !cloudTags.trim()} onClick={() => void reuseCloudAsset()}>复用云端已批准资产</button><button disabled={!current || restoring} onClick={download}>导出透明 PNG</button></aside></section>
  </main>
}
