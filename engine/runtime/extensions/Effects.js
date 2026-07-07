// Effects/adjustment-pixi-filter.js
var gdjs;(function(i){i.PixiFiltersTools.registerFilterCreator("Adjustment",new class extends i.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(r,t){return new PIXI.filters.AdjustmentFilter}updatePreRender(r,t){}updateDoubleParameter(r,t,e){const n=r;t==="gamma"?n.gamma=e:t==="saturation"?n.saturation=e:t==="contrast"?n.contrast=e:t==="brightness"?n.brightness=e:t==="red"?n.red=e:t==="green"?n.green=e:t==="blue"?n.blue=e:t==="alpha"&&(n.alpha=e)}getDoubleParameter(r,t){const e=r;return t==="gamma"?e.gamma:t==="saturation"?e.saturation:t==="contrast"?e.contrast:t==="brightness"?e.brightness:t==="red"?e.red:t==="green"?e.green:t==="blue"?e.blue:t==="alpha"?e.alpha:0}updateStringParameter(r,t,e){}updateColorParameter(r,t,e){}getColorParameter(r,t){return 0}updateBooleanParameter(r,t,e){}getNetworkSyncData(r){const t=r;return{ga:t.gamma,sa:t.saturation,co:t.contrast,br:t.brightness,r:t.red,g:t.green,b:t.blue,a:t.alpha}}updateFromNetworkSyncData(r,t){const e=r;e.gamma=t.ga,e.saturation=t.sa,e.contrast=t.co,e.brightness=t.br,e.red=t.r,e.green=t.g,e.blue=t.b,e.alpha=t.a}})})(gdjs||(gdjs={}));
//# sourceMappingURL=adjustment-pixi-filter.js.map

// Effects/advanced-bloom-pixi-filter.js
var gdjs;(function(i){i.PixiFiltersTools.registerFilterCreator("AdvancedBloom",new class extends i.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(t,e){return new PIXI.filters.AdvancedBloomFilter}updatePreRender(t,e){}updateDoubleParameter(t,e,r){const l=t;e==="threshold"?l.threshold=r:e==="bloomScale"?l.bloomScale=r:e==="brightness"?l.brightness=r:e==="blur"?l.blur=r:e==="quality"?l.quality=r:e==="padding"&&(l.padding=r)}getDoubleParameter(t,e){const r=t;return e==="threshold"?r.threshold:e==="bloomScale"?r.bloomScale:e==="brightness"?r.brightness:e==="blur"?r.blur:e==="quality"?r.quality:e==="padding"?r.padding:0}updateStringParameter(t,e,r){}updateColorParameter(t,e,r){}getColorParameter(t,e){return 0}updateBooleanParameter(t,e,r){}getNetworkSyncData(t){const e=t;return{th:e.threshold,bs:e.bloomScale,bn:e.brightness,b:e.blur,q:e.quality,p:e.padding}}updateFromNetworkSyncData(t,e){const r=t;r.threshold=e.th,r.bloomScale=e.bs,r.brightness=e.bn,r.blur=e.b,r.quality=e.q,r.padding=e.p}})})(gdjs||(gdjs={}));
//# sourceMappingURL=advanced-bloom-pixi-filter.js.map

// Effects/ascii-pixi-filter.js
var gdjs;(function(i){i.PixiFiltersTools.registerFilterCreator("Ascii",new class extends i.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(e,r){return new PIXI.filters.AsciiFilter}updatePreRender(e,r){}updateDoubleParameter(e,r,t){const a=e;r==="size"&&(a.size=t)}getDoubleParameter(e,r){const t=e;return r==="size"?t.size:0}updateStringParameter(e,r,t){}updateColorParameter(e,r,t){}getColorParameter(e,r){return 0}updateBooleanParameter(e,r,t){}getNetworkSyncData(e){return{size:e.size}}updateFromNetworkSyncData(e,r){const t=e;t.size=r.size}})})(gdjs||(gdjs={}));
//# sourceMappingURL=ascii-pixi-filter.js.map

// Effects/bevel-pixi-filter.js
var gdjs;(function(i){i.PixiFiltersTools.registerFilterCreator("Bevel",new class extends i.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(r,e){return new PIXI.filters.BevelFilter}updatePreRender(r,e){}updateDoubleParameter(r,e,t){const l=r;e==="rotation"?l.rotation=t:e==="thickness"?l.thickness=t:e==="distance"?l.distance=t:e==="lightAlpha"?l.lightAlpha=t:e==="shadowAlpha"&&(l.shadowAlpha=t)}getDoubleParameter(r,e){const t=r;return e==="rotation"?t.rotation:e==="thickness"?t.thickness:e==="distance"?t.distance:e==="lightAlpha"?t.lightAlpha:e==="shadowAlpha"?t.shadowAlpha:0}updateStringParameter(r,e,t){const l=r;e==="lightColor"&&(l.lightColor=i.rgbOrHexStringToNumber(t)),e==="shadowColor"&&(l.shadowColor=i.rgbOrHexStringToNumber(t))}updateColorParameter(r,e,t){const l=r;e==="lightColor"&&(l.lightColor=t),e==="shadowColor"&&(l.shadowColor=t)}getColorParameter(r,e){const t=r;return e==="lightColor"?t.lightColor:e==="shadowColor"?t.shadowColor:0}updateBooleanParameter(r,e,t){}getNetworkSyncData(r){const e=r;return{r:e.rotation,t:e.thickness,d:e.distance,la:e.lightAlpha,sa:e.shadowAlpha,lc:e.lightColor,sc:e.shadowColor}}updateFromNetworkSyncData(r,e){const t=r;t.rotation=e.r,t.thickness=e.t,t.distance=e.d,t.lightAlpha=e.la,t.shadowAlpha=e.sa,t.lightColor=e.lc,t.shadowColor=e.sc}})})(gdjs||(gdjs={}));
//# sourceMappingURL=bevel-pixi-filter.js.map

// Effects/black-and-white-pixi-filter.js
var gdjs;(function(a){a.PixiFiltersTools.registerFilterCreator("BlackAndWhite",new class extends a.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(r,e){const t=new PIXI.ColorMatrixFilter;return t.blackAndWhite(!1),t}updatePreRender(r,e){}updateDoubleParameter(r,e,t){const i=r;e==="opacity"&&(i.alpha=a.PixiFiltersTools.clampValue(t,0,1))}getDoubleParameter(r,e){const t=r;return e==="opacity"?t.alpha:0}updateStringParameter(r,e,t){}updateColorParameter(r,e,t){}getColorParameter(r,e){return 0}updateBooleanParameter(r,e,t){}getNetworkSyncData(r){return{a:r.alpha}}updateFromNetworkSyncData(r,e){const t=r;t.alpha=e.a}})})(gdjs||(gdjs={}));
//# sourceMappingURL=black-and-white-pixi-filter.js.map

// Effects/blending-mode-pixi-filter.js
var gdjs;(function(a){a.PixiFiltersTools.registerFilterCreator("BlendingMode",new class extends a.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(r,e){return new PIXI.AlphaFilter}updatePreRender(r,e){}updateDoubleParameter(r,e,t){const n=r;e==="alpha"?n.alpha=t:e==="blendmode"&&(n.blendMode=t)}getDoubleParameter(r,e){const t=r;return e==="alpha"?t.alpha:e==="blendmode"?t.blendMode:0}updateStringParameter(r,e,t){}updateColorParameter(r,e,t){}getColorParameter(r,e){return 0}updateBooleanParameter(r,e,t){}getNetworkSyncData(r){const e=r;return{a:e.alpha,bm:e.blendMode}}updateFromNetworkSyncData(r,e){const t=r;t.alpha=e.a,t.blendMode=e.bm}})})(gdjs||(gdjs={}));
//# sourceMappingURL=blending-mode-pixi-filter.js.map

// Effects/blur-pixi-filter.js
var gdjs;(function(l){l.PixiFiltersTools.registerFilterCreator("Blur",new class extends l.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(e,r){return new PIXI.BlurFilter}updatePreRender(e,r){}updateDoubleParameter(e,r,t){r!=="blur"&&r!=="quality"&&r!=="kernelSize"&&r!=="resolution"||(r==="kernelSize"&&(t=l.PixiFiltersTools.clampKernelSize(t,5,15)),e[r]=t)}getDoubleParameter(e,r){return e[r]||0}updateStringParameter(e,r,t){}updateColorParameter(e,r,t){}getColorParameter(e,r){return 0}updateBooleanParameter(e,r,t){}getNetworkSyncData(e){return{b:e.blur,q:e.quality,ks:e.kernelSize,res:e.resolution}}updateFromNetworkSyncData(e,r){e.blur=r.b,e.quality=r.q,e.kernelSize=r.ks,e.resolution=r.res}})})(gdjs||(gdjs={}));
//# sourceMappingURL=blur-pixi-filter.js.map

// Effects/brightness-pixi-filter.js
var gdjs;(function(i){i.PixiFiltersTools.registerFilterCreator("Brightness",new class extends i.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(e,r){const t=new PIXI.ColorMatrixFilter;return t.brightness(1,!1),t}updatePreRender(e,r){}updateDoubleParameter(e,r,t){const s=e;if(r!=="brightness")return;const a=i.PixiFiltersTools.clampValue(t,0,1);s.__brightness=a,s.brightness(a,!1)}getDoubleParameter(e,r){const t=e;return r==="brightness"?t.__brightness:0}updateStringParameter(e,r,t){}updateColorParameter(e,r,t){}getColorParameter(e,r){return 0}updateBooleanParameter(e,r,t){}getNetworkSyncData(e){return{b:e.__brightness}}updateFromNetworkSyncData(e,r){const t=e;t.__brightness=r.b,t.brightness(r.b,!1)}})})(gdjs||(gdjs={}));
//# sourceMappingURL=brightness-pixi-filter.js.map

// Effects/bulge-pinch-pixi-filter.js
var gdjs;(function(n){n.PixiFiltersTools.registerFilterCreator("BulgePinch",new class extends n.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(t,e){return new PIXI.filters.BulgePinchFilter}updatePreRender(t,e){}updateDoubleParameter(t,e,r){const i=t;e==="centerX"?i.center[0]=r:e==="centerY"?i.center[1]=r:e==="radius"?i.radius=r:e==="strength"&&(i.strength=n.PixiFiltersTools.clampValue(r,-1,1))}getDoubleParameter(t,e){const r=t;return e==="centerX"?r.center[0]:e==="centerY"?r.center[1]:e==="radius"?r.radius:e==="strength"?r.strength:0}updateStringParameter(t,e,r){}updateColorParameter(t,e,r){}getColorParameter(t,e){return 0}updateBooleanParameter(t,e,r){}getNetworkSyncData(t){const e=t;return{cx:e.center[0],cy:e.center[1],r:e.radius,s:e.strength}}updateFromNetworkSyncData(t,e){const r=t;r.center[0]=e.cx,r.center[1]=e.cy,r.radius=e.r,r.strength=e.s}})})(gdjs||(gdjs={}));
//# sourceMappingURL=bulge-pinch-pixi-filter.js.map

// Effects/color-map-pixi-filter.js
var gdjs;(function(a){a.PixiFiltersTools.registerFilterCreator("ColorMap",new class extends a.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(r,e){const t=r.getRuntimeScene().getGame().getImageManager().getPIXITexture(e.stringParameters.colorMapTexture);return new PIXI.filters.ColorMapFilter(t,e.booleanParameters.nearest,a.PixiFiltersTools.clampValue(e.doubleParameters.mix/100,0,1))}updatePreRender(r,e){}updateDoubleParameter(r,e,t){const o=r;e==="mix"&&(o.mix=a.PixiFiltersTools.clampValue(t/100,0,1))}getDoubleParameter(r,e){const t=r;return e==="mix"?t.mix:0}updateStringParameter(r,e,t){}updateColorParameter(r,e,t){}getColorParameter(r,e){return 0}updateBooleanParameter(r,e,t){const o=r;e==="nearest"&&(o.nearest=t)}getNetworkSyncData(r){const e=r;return{mix:e.mix,near:e.nearest}}updateFromNetworkSyncData(r,e){const t=r;t.mix=e.mix,t.nearest=e.near}})})(gdjs||(gdjs={}));
//# sourceMappingURL=color-map-pixi-filter.js.map

// Effects/color-replace-pixi-filter.js
var gdjs;(function(t){t.PixiFiltersTools.registerFilterCreator("ColorReplace",new class extends t.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(l,e){return new PIXI.filters.ColorReplaceFilter}updatePreRender(l,e){}updateDoubleParameter(l,e,r){const o=l;e==="epsilon"&&(o.epsilon=r)}getDoubleParameter(l,e){const r=l;return e==="epsilon"?r.epsilon:0}updateStringParameter(l,e,r){const o=l;e==="originalColor"?o.originalColor=t.rgbOrHexStringToNumber(r):e==="newColor"&&(o.newColor=t.rgbOrHexStringToNumber(r))}updateColorParameter(l,e,r){const o=l;e==="originalColor"?o.originalColor=r:e==="newColor"&&(o.newColor=r)}getColorParameter(l,e){const r=l;return e==="originalColor"?r.originalColor:e==="newColor"?r.newColor:0}updateBooleanParameter(l,e,r){}getNetworkSyncData(l){const e=l;return{e:e.epsilon,oc:e.originalColor,nc:e.newColor}}updateFromNetworkSyncData(l,e){const r=l;r.epsilon=e.e,r.originalColor=e.oc,r.newColor=e.nc}})})(gdjs||(gdjs={}));
//# sourceMappingURL=color-replace-pixi-filter.js.map

// Effects/crt-pixi-filter.js
var gdjs;(function(r){r.PixiFiltersTools.registerFilterCreator("CRT",new class extends r.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(t,i){const e=new PIXI.filters.CRTFilter;return e._animationTimer=0,e}updatePreRender(t,i){const n=t;n.animationSpeed!==0&&(n.time+=i.getElapsedTime()/1e3*10*n.animationSpeed),n.animationFrequency!==0&&(n._animationTimer+=i.getElapsedTime()/1e3,n._animationTimer>=1/n.animationFrequency&&(n.seed=Math.random(),n._animationTimer=0))}updateDoubleParameter(t,i,n){const e=t;i==="lineWidth"?e.lineWidth=n:i==="lineContrast"?e.lineContrast=n:i==="noise"?e.noise=n:i==="curvature"?e.curvature=n:i==="noiseSize"?e.noiseSize=n:i==="vignetting"?e.vignetting=n:i==="vignettingAlpha"?e.vignettingAlpha=n:i==="vignettingBlur"?e.vignettingBlur=n:i==="animationSpeed"?e.animationSpeed=n:i==="animationFrequency"?e.animationFrequency=n:i==="padding"&&(e.padding=n)}getDoubleParameter(t,i){const n=t;return i==="lineWidth"?n.lineWidth:i==="lineContrast"?n.lineContrast:i==="noise"?n.noise:i==="curvature"?n.curvature:i==="noiseSize"?n.noiseSize:i==="vignetting"?n.vignetting:i==="vignettingAlpha"?n.vignettingAlpha:i==="vignettingBlur"?n.vignettingBlur:i==="animationSpeed"?n.animationSpeed:i==="animationFrequency"?n.animationFrequency:i==="padding"?n.padding:0}updateStringParameter(t,i,n){}updateColorParameter(t,i,n){}getColorParameter(t,i){return 0}updateBooleanParameter(t,i,n){const e=t;i==="verticalLine"&&(e.verticalLine=n)}getNetworkSyncData(t){const i=t;return{lw:i.lineWidth,lc:i.lineContrast,n:i.noise,c:i.curvature,ns:i.noiseSize,v:i.vignetting,va:i.vignettingAlpha,vb:i.vignettingBlur,as:i.animationSpeed,af:i.animationFrequency,p:i.padding,vl:i.verticalLine}}updateFromNetworkSyncData(t,i){const n=t;n.lineWidth=i.lw,n.lineContrast=i.lc,n.noise=i.n,n.curvature=i.c,n.noiseSize=i.ns,n.vignetting=i.v,n.vignettingAlpha=i.va,n.vignettingBlur=i.vb,n.animationSpeed=i.as,n.animationFrequency=i.af,n.padding=i.p,n.verticalLine=i.vl}})})(gdjs||(gdjs={}));
//# sourceMappingURL=crt-pixi-filter.js.map

// Effects/displacement-pixi-filter.js
var gdjs;(function(i){i.PixiFiltersTools.registerFilterCreator("Displacement",new class extends i.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(t,e){const r=t.getRuntimeScene().getGame().getImageManager().getPIXITexture(e.stringParameters.displacementMapTexture);r.baseTexture.wrapMode=PIXI.WRAP_MODES.REPEAT;const a=new PIXI.Sprite(r);return new PIXI.DisplacementFilter(a)}updatePreRender(t,e){}updateDoubleParameter(t,e,r){const a=t;e==="scaleX"&&(a.scale.x=r),e==="scaleY"&&(a.scale.y=r)}getDoubleParameter(t,e){const r=t;return e==="scaleX"?r.scale.x:e==="scaleY"?r.scale.y:0}updateStringParameter(t,e,r){}updateColorParameter(t,e,r){}getColorParameter(t,e){return 0}updateBooleanParameter(t,e,r){}getNetworkSyncData(t){const e=t;return{sx:e.scale.x,sy:e.scale.y}}updateFromNetworkSyncData(t,e){const r=t;r.scale.x=e.sx,r.scale.y=e.sy}})})(gdjs||(gdjs={}));
//# sourceMappingURL=displacement-pixi-filter.js.map

// Effects/dot-pixi-filter.js
var gdjs;(function(a){a.PixiFiltersTools.registerFilterCreator("Dot",new class extends a.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(t,e){return new PIXI.filters.DotFilter}updatePreRender(t,e){}updateDoubleParameter(t,e,r){const l=t;e==="scale"?l.scale=r:e==="angle"&&(l.angle=r)}getDoubleParameter(t,e){const r=t;return e==="scale"?r.scale:e==="angle"?r.angle:0}updateStringParameter(t,e,r){}updateColorParameter(t,e,r){}getColorParameter(t,e){return 0}updateBooleanParameter(t,e,r){}getNetworkSyncData(t){const e=t;return{s:e.scale,a:e.angle}}updateFromNetworkSyncData(t,e){const r=t;r.scale=e.s,r.angle=e.a}})})(gdjs||(gdjs={}));
//# sourceMappingURL=dot-pixi-filter.js.map

// Effects/drop-shadow-pixi-filter.js
var gdjs;(function(i){i.PixiFiltersTools.registerFilterCreator("DropShadow",new class extends i.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(t,r){return new PIXI.filters.DropShadowFilter}updatePreRender(t,r){}updateDoubleParameter(t,r,o){const e=t;r==="blur"?e.blur=o:r==="quality"?e.quality=o:r==="alpha"?e.alpha=o:r==="distance"?e.distance=o:r==="rotation"?e.rotation=o:r==="padding"&&(e.padding=o)}getDoubleParameter(t,r){const o=t;return r==="blur"?o.blur:r==="quality"?o.quality:r==="alpha"?o.alpha:r==="distance"?o.distance:r==="rotation"?o.rotation:r==="padding"?o.padding:0}updateStringParameter(t,r,o){const e=t;r==="color"&&(e.color=i.rgbOrHexStringToNumber(o))}updateColorParameter(t,r,o){const e=t;r==="color"&&(e.color=o)}getColorParameter(t,r){const o=t;return r==="color"?o.color:0}updateBooleanParameter(t,r,o){const e=t;r==="shadowOnly"&&(e.shadowOnly=o)}getNetworkSyncData(t){const r=t;return{b:r.blur,q:r.quality,a:r.alpha,d:r.distance,r:r.rotation,p:r.padding,c:r.color,so:r.shadowOnly}}updateFromNetworkSyncData(t,r){const o=t;o.blur=r.b,o.quality=r.q,o.alpha=r.a,o.distance=r.d,o.rotation=r.r,o.padding=r.p,o.color=r.c,o.shadowOnly=r.so}})})(gdjs||(gdjs={}));
//# sourceMappingURL=drop-shadow-pixi-filter.js.map

// Effects/glitch-pixi-filter.js
var gdjs;(function(t){t.PixiFiltersTools.registerFilterCreator("Glitch",new class extends t.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(n,e){const r=new PIXI.filters.GlitchFilter;return r._animationTimer=0,r}updatePreRender(n,e){const i=n;i.animationFrequency!==0&&(i._animationTimer+=e.getElapsedTime()/1e3,i._animationTimer>=1/i.animationFrequency&&(i.seed=Math.random(),i._animationTimer=0))}updateDoubleParameter(n,e,i){const r=n;e==="slices"?r.slices=i:e==="offset"?r.offset=i:e==="direction"?r.direction=i:e==="fillMode"?r.fillMode=i:e==="minSize"?r.minSize=i:e==="sampleSize"?r.sampleSize=i:e==="redX"?r.red.x=i:e==="redY"?r.red.y=i:e==="greenX"?r.green.x=i:e==="greenY"?r.green.y=i:e==="blueX"?r.blue.x=i:e==="blueY"?r.blue.y=i:e==="animationFrequency"&&(r.animationFrequency=i)}getDoubleParameter(n,e){const i=n;return e==="slices"?i.slices:e==="offset"?i.offset:e==="direction"?i.direction:e==="fillMode"?i.fillMode:e==="minSize"?i.minSize:e==="sampleSize"?i.sampleSize:e==="redX"?i.red.x:e==="redY"?i.red.y:e==="greenX"?i.green.x:e==="greenY"?i.green.y:e==="blueX"?i.blue.x:e==="blueY"?i.blue.y:e==="animationFrequency"?i.animationFrequency:0}updateStringParameter(n,e,i){}updateColorParameter(n,e,i){}getColorParameter(n,e){return 0}updateBooleanParameter(n,e,i){const r=n;e==="average"&&(r.average=i)}getNetworkSyncData(n){const e=n;return{s:e.slices,o:e.offset,d:e.direction,fm:e.fillMode,ms:e.minSize,ss:e.sampleSize,rx:e.red.x,ry:e.red.y,gx:e.green.x,gy:e.green.y,bx:e.blue.x,by:e.blue.y,af:e.animationFrequency,a:e.average}}updateFromNetworkSyncData(n,e){const i=n;i.slices=e.s,i.offset=e.o,i.direction=e.d,i.fillMode=e.fm,i.minSize=e.ms,i.sampleSize=e.ss,i.red.x=e.rx,i.red.y=e.ry,i.green.x=e.gx,i.green.y=e.gy,i.blue.x=e.bx,i.blue.y=e.by,i.animationFrequency=e.af,i.average=e.a}})})(gdjs||(gdjs={}));
//# sourceMappingURL=glitch-pixi-filter.js.map

// Effects/glow-pixi-filter.js
var gdjs;(function(l){l.PixiFiltersTools.registerFilterCreator("Glow",new class extends l.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(e,r){return new PIXI.filters.GlowFilter}updatePreRender(e,r){}updateDoubleParameter(e,r,t){const n=e;r==="innerStrength"?n.innerStrength=t:r==="outerStrength"?n.outerStrength=t:r==="distance"&&(n.distance=t)}getDoubleParameter(e,r){const t=e;return r==="innerStrength"?t.innerStrength:r==="outerStrength"?t.outerStrength:r==="distance"?t.distance:0}updateStringParameter(e,r,t){const n=e;r==="color"&&(n.color=l.rgbOrHexStringToNumber(t))}updateColorParameter(e,r,t){const n=e;r==="color"&&(n.color=t)}getColorParameter(e,r){const t=e;return r==="color"?t.color:0}updateBooleanParameter(e,r,t){}getNetworkSyncData(e){const r=e;return{is:r.innerStrength,os:r.outerStrength,d:r.distance,c:r.color}}updateFromNetworkSyncData(e,r){const t=e;t.innerStrength=r.is,t.outerStrength=r.os,t.distance=r.d,t.color=r.c}})})(gdjs||(gdjs={}));
//# sourceMappingURL=glow-pixi-filter.js.map

// Effects/godray-pixi-filter.js
var gdjs;(function(n){n.PixiFiltersTools.registerFilterCreator("Godray",new class extends n.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(i,r){return new PIXI.filters.GodrayFilter}updatePreRender(i,r){const e=i;e.animationSpeed!==0&&(e.time+=r.getElapsedTime()/1e3*e.animationSpeed)}updateDoubleParameter(i,r,e){const t=i;r==="lacunarity"?t.lacunarity=e:r==="angle"?t.angle=e:r==="gain"?t.gain=e:r==="light"?t.light=e:r==="x"?t.x=e:r==="y"?t.y=e:r==="animationSpeed"?t.animationSpeed=e:r==="padding"&&(t.padding=e)}getDoubleParameter(i,r){const e=i;return r==="lacunarity"?e.lacunarity:r==="angle"?e.angle:r==="gain"?e.gain:r==="light"?e.light:r==="x"?e.x:r==="y"?e.y:r==="animationSpeed"?e.animationSpeed:r==="padding"?e.padding:0}updateStringParameter(i,r,e){}updateColorParameter(i,r,e){}getColorParameter(i,r){return 0}updateBooleanParameter(i,r,e){const t=i;r==="parallel"&&(t.parallel=e)}getNetworkSyncData(i){const r=i;return{la:r.lacunarity,a:r.angle,g:r.gain,li:r.light,x:r.x,y:r.y,as:r.animationSpeed,p:r.padding,pa:r.parallel}}updateFromNetworkSyncData(i,r){const e=i;e.lacunarity=r.la,e.angle=r.a,e.gain=r.g,e.light=r.li,e.x=r.x,e.y=r.y,e.animationSpeed=r.as,e.padding=r.p,e.parallel=r.pa}})})(gdjs||(gdjs={}));
//# sourceMappingURL=godray-pixi-filter.js.map

// Effects/hsl-adjustment-pixi-filter.js
var gdjs;(function(l){l.PixiFiltersTools.registerFilterCreator("HslAdjustment",new class extends l.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(r,t){return new PIXI.filters.HslAdjustmentFilter}updatePreRender(r,t){}updateDoubleParameter(r,t,e){const s=r;t==="hue"?s.hue=e:t==="saturation"?s.saturation=e:t==="lightness"?s.lightness=e:t==="alpha"&&(s.alpha=e)}getDoubleParameter(r,t){const e=r;return t==="hue"?e.hue:t==="saturation"?e.saturation:t==="lightness"?e.lightness:t==="alpha"?e.alpha:0}updateStringParameter(r,t,e){}updateColorParameter(r,t,e){}getColorParameter(r,t){return 0}updateBooleanParameter(r,t,e){const s=r;t==="colorize"&&(s.colorize=e)}getNetworkSyncData(r){const t=r;return{h:t.hue,s:t.saturation,l:t.lightness,a:t.alpha,c:t.colorize}}updateFromNetworkSyncData(r,t){const e=r;e.hue=t.h,e.saturation=t.s,e.lightness=t.l,e.alpha=t.a,e.colorize=t.c}})})(gdjs||(gdjs={}));
//# sourceMappingURL=hsl-adjustment-pixi-filter.js.map

// Effects/JsExtension.js
//@ts-check
/// <reference path="../JsExtensionTypes.d.ts" />
/**
 * This is a declaration of an extension for GDevelop 5.
 *
 * ℹ️ Changes in this file are watched and automatically imported if the editor
 * is running. You can also manually run `node import-GDJS-Runtime.js` (in newIDE/app/scripts).
 *
 * The file must be named "JsExtension.js", otherwise GDevelop won't load it.
 * ⚠️ If you make a change and the extension is not loaded, open the developer console
 * and search for any errors.
 *
 * More information on https://github.com/4ian/GDevelop/blob/master/newIDE/README-extensions.md
 */

/** @type {ExtensionModule} */
module.exports = {
  createExtension: function (_, gd) {
    const extension = new gd.PlatformExtension();
    extension
      .setExtensionInformation(
        'Effects',
        'Effects',
        'Lots of different effects to be used in your game.',
        'Various contributors from PixiJS, PixiJS filters and GDevelop',
        'MIT'
      )
      .setDimension('2D')
      .setShortDescription(
        'Visual effects: blur, glow, color adjust, outline, shadow, pixelate, CRT, reflection, displacement, and more.'
      )
      .setCategory('Visual effect')
      .setExtensionHelpPath('/interface/scene-editor/layer-effects');

    // ℹ️ You can declare an effect here. Please order the effects by alphabetical order.
    // This file is for common effects that are well-known/"battle-tested". If you have an
    // experimental effect, create an extension for it (copy this folder, rename "Effects" to something else,
    // and remove all the files and declaration of effects, or take a look at ExampleJsExtension).

    const adjustmentEffect = extension
      .addEffect('Adjustment')
      .setFullName(_('Adjustment'))
      .setDescription(
        _(
          'Adjust gamma, contrast, saturation, brightness, alpha or color-channel shift.'
        )
      )
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-adjustment.js')
      .addIncludeFile('Extensions/Effects/adjustment-pixi-filter.js');
    const adjustmentProperties = adjustmentEffect.getProperties();
    adjustmentProperties
      .getOrCreate('gamma')
      .setValue('1')
      .setLabel(_('Gamma (between 0 and 5)'))
      .setType('number');
    adjustmentProperties
      .getOrCreate('saturation')
      .setValue('1')
      .setLabel(_('Saturation (between 0 and 5)'))
      .setType('number');
    adjustmentProperties
      .getOrCreate('contrast')
      .setValue('1')
      .setLabel(_('Contrast (between 0 and 5)'))
      .setType('number');
    adjustmentProperties
      .getOrCreate('brightness')
      .setValue('1')
      .setLabel(_('Brightness (between 0 and 5)'))
      .setType('number');
    adjustmentProperties
      .getOrCreate('red')
      .setValue('1')
      .setLabel(_('Red (between 0 and 5)'))
      .setType('number');
    adjustmentProperties
      .getOrCreate('green')
      .setValue('1')
      .setLabel(_('Green (between 0 and 5)'))
      .setType('number');
    adjustmentProperties
      .getOrCreate('blue')
      .setValue('1')
      .setLabel(_('Blue (between 0 and 5)'))
      .setType('number');
    adjustmentProperties
      .getOrCreate('alpha')
      .setValue('1')
      .setLabel(_('Alpha (between 0 and 1, 0 is transparent)'))
      .setType('number');

    const advancedBloomEffect = extension
      .addEffect('AdvancedBloom')
      .setFullName(_('Advanced bloom'))
      .setDescription(_('Applies a bloom effect.'))
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-kawase-blur.js')
      .addIncludeFile(
        'Extensions/Effects/pixi-filters/filter-advanced-bloom.js'
      )
      .addIncludeFile('Extensions/Effects/advanced-bloom-pixi-filter.js');
    const advancedBloomProperties = advancedBloomEffect.getProperties();
    advancedBloomProperties
      .getOrCreate('threshold')
      .setValue('0.5')
      .setLabel(_('Threshold (between 0 and 1)'))
      .setType('number');
    advancedBloomProperties
      .getOrCreate('bloomScale')
      .setValue('0.7')
      .setLabel(_('Bloom Scale (between 0 and 2)'))
      .setType('number');
    advancedBloomProperties
      .getOrCreate('brightness')
      .setValue('0.7')
      .setLabel(_('Brightness (between 0 and 2)'))
      .setType('number');
    advancedBloomProperties
      .getOrCreate('blur')
      .setValue('4')
      .setLabel(_('Blur (between 0 and 20)'))
      .setType('number');
    advancedBloomProperties
      .getOrCreate('quality')
      .setValue('7')
      .setLabel(_('Quality (between 0 and 20)'))
      .setType('number');
    advancedBloomProperties
      .getOrCreate('padding')
      .setValue('0')
      .setLabel(_('Padding'))
      .setType('number')
      .setDescription(_('Padding for the visual effect area'));

    const asciiEffect = extension
      .addEffect('Ascii')
      .setFullName(_('ASCII'))
      .setDescription(_('Render the image with ASCII characters only.'))
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-ascii.js')
      .addIncludeFile('Extensions/Effects/ascii-pixi-filter.js');
    const asciiProperties = asciiEffect.getProperties();
    asciiProperties
      .getOrCreate('size')
      .setValue('8')
      .setLabel(_('Size (between 2 and 20)'))
      .setType('number');

    const bevelEffect = extension
      .addEffect('Bevel')
      .setFullName(_('Beveled edges'))
      .setDescription(_('Add beveled edges around the rendered image.'))
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-bevel.js')
      .addIncludeFile('Extensions/Effects/bevel-pixi-filter.js');
    const bevelProperties = bevelEffect.getProperties();
    bevelProperties
      .getOrCreate('rotation')
      .setValue('1')
      .setLabel(_('Rotation (between 0 and 360)'))
      .setType('number');
    bevelProperties
      .getOrCreate('thickness')
      .setValue('2')
      .setLabel(_('Outer strength (between 0 and 5)'))
      .setType('number');
    bevelProperties
      .getOrCreate('distance')
      .setValue('15')
      .setLabel(_('Distance (between 10 and 20)'))
      .setType('number');
    bevelProperties
      .getOrCreate('lightAlpha')
      .setValue('1')
      .setLabel(_('Light alpha (between 0 and 1)'))
      .setType('number');
    bevelProperties
      .getOrCreate('lightColor')
      .setValue('255;255;255')
      .setLabel(_('Light color (color of the outline)'))
      .setType('color');
    bevelProperties
      .getOrCreate('shadowColor')
      .setValue('0;0;0')
      .setLabel(_('Shadow color (color of the outline)'))
      .setType('color');
    bevelProperties
      .getOrCreate('shadowAlpha')
      .setValue('1')
      .setLabel(_('Shadow alpha (between 0 and 1)'))
      .setType('number');

    const blackAndWhiteEffect = extension
      .addEffect('BlackAndWhite')
      .setFullName(_('Black and White'))
      .setDescription(_('Alter the colors to make the image black and white'))
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/black-and-white-pixi-filter.js');
    const blackAndWhiteProperties = blackAndWhiteEffect.getProperties();
    blackAndWhiteProperties
      .getOrCreate('opacity')
      .setValue('1')
      .setLabel(_('Opacity (between 0 and 1)'))
      .setType('number');

    const blendingModeEffect = extension
      .addEffect('BlendingMode')
      .setFullName(_('Blending mode'))
      .setDescription(
        _('Alter the rendered image with the specified blend mode.')
      )
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/blending-mode-pixi-filter.js');
    const blendingModeProperties = blendingModeEffect.getProperties();
    blendingModeProperties
      .getOrCreate('blendmode')
      .setValue('0')
      .setLabel(_('Mode (0: Normal, 1: Add, 2: Multiply, 3: Screen)'))
      .setType('number');
    blendingModeProperties
      .getOrCreate('opacity')
      .setValue('1')
      .setLabel(_('Opacity (between 0 and 1)'))
      .setType('number');

    const blurEffect = extension
      .addEffect('Blur')
      .setFullName(_('Blur (Gaussian, slow - prefer to use Kawase blur)'))
      .setDescription(
        _(
          'Blur the rendered image. This is slow, so prefer to use Kawase blur in most cases.'
        )
      )
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/blur-pixi-filter.js');
    const blurProperties = blurEffect.getProperties();
    blurProperties
      .getOrCreate('blur')
      .setValue('8')
      .setLabel(_('Blur intensity'))
      .setType('number');
    blurProperties
      .getOrCreate('quality')
      .setValue('1')
      .setLabel(
        _(
          'Number of render passes. An high value will cause lags/poor performance.'
        )
      )
      .setType('number');
    blurProperties
      .getOrCreate('resolution')
      .setValue('2')
      .setLabel(_('Resolution'))
      .setType('number');
    blurProperties
      .getOrCreate('kernelSize')
      .setValue('5')
      .setLabel(_('Kernel size (one of these values: 5, 7, 9, 11, 13, 15)'))
      .setType('number');

    const brightnessEffect = extension
      .addEffect('Brightness')
      .setFullName(_('Brightness'))
      .setDescription(_('Make the image brighter.'))
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/brightness-pixi-filter.js');
    const brightnessProperties = brightnessEffect.getProperties();
    brightnessProperties
      .getOrCreate('brightness')
      .setValue('0.8')
      .setLabel(_('Brightness (between 0 and 1)'))
      .setType('number');

    const bulgePinchEffect = extension
      .addEffect('BulgePinch')
      .setFullName(_('Bulge Pinch'))
      .setDescription(_('Bulges or pinches the image in a circle.'))
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-bulge-pinch.js')
      .addIncludeFile('Extensions/Effects/bulge-pinch-pixi-filter.js');
    const bulgePinchProperties = bulgePinchEffect.getProperties();
    bulgePinchProperties
      .getOrCreate('centerX')
      .setValue('0')
      .setLabel(_('Center X (between 0 and 1, 0.5 is image middle)'))
      .setType('number');
    bulgePinchProperties
      .getOrCreate('centerY')
      .setValue('0')
      .setLabel(_('Center Y (between 0 and 1, 0.5 is image middle)'))
      .setType('number');
    bulgePinchProperties
      .getOrCreate('radius')
      .setValue('100')
      .setLabel(_('Radius'))
      .setType('number');
    bulgePinchProperties
      .getOrCreate('strength')
      .setValue('1')
      .setLabel(_('strength (between -1 and 1)'))
      .setType('number')
      .setDescription(
        _('-1 is strong pinch, 0 is no effect, 1 is strong bulge')
      );

    const colorMapEffect = extension
      .addEffect('ColorMap')
      .setFullName(_('Color Map'))
      .setDescription(_('Change the color rendered on screen.'))
      .markAsOnlyWorkingFor2D()
      .setHelpPath('/all-features/effects/color-map')
      .addIncludeFile('Extensions/Effects/color-map-pixi-filter.js')
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-color-map.js');
    const colorMapProperties = colorMapEffect.getProperties();
    colorMapProperties
      .getOrCreate('colorMapTexture')
      .setType('resource')
      .addExtraInfo('image')
      .setLabel(_('Color map texture for the effect'))
      .setDescription(
        _(
          'You can change colors of pixels by modifying a reference color image, containing each colors, called the *Color Map Texture*. To get started, **download** [a default color map texture here](https://wiki.gdevelop.io/gdevelop5/interface/scene-editor/layer-effects).'
        )
      );
    colorMapProperties
      .getOrCreate('nearest')
      .setValue('false')
      .setLabel(_('Disable anti-aliasing ("nearest" pixel rounding)'))
      .setType('boolean');
    colorMapProperties
      .getOrCreate('mix')
      .setValue('100')
      .setLabel(_('Mix'))
      .setType('number')
      .setDescription(_('Mix value of the effect on the layer (in percent)'));

    const colorReplaceEffect = extension
      .addEffect('ColorReplace')
      .setFullName(_('Color Replace'))
      .setDescription(_('Effect replacing a color (or similar) by another.'))
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-color-replace.js')
      .addIncludeFile('Extensions/Effects/color-replace-pixi-filter.js');
    const colorReplaceProperties = colorReplaceEffect.getProperties();
    colorReplaceProperties
      .getOrCreate('originalColor')
      .setValue('252;3;65')
      .setLabel(_('Original Color'))
      .setType('color')
      .setDescription('The color that will be changed');
    colorReplaceProperties
      .getOrCreate('newColor')
      .setValue('255;255;255')
      .setLabel(_('New Color'))
      .setType('color')
      .setDescription('The new color');
    colorReplaceProperties
      .getOrCreate('epsilon')
      .setValue('0.4')
      .setLabel(_('Epsilon (between 0 and 1)'))
      .setType('number')
      .setDescription(
        _(
          'Tolerance/sensitivity of the floating-point comparison between colors (lower = more exact, higher = more inclusive)'
        )
      );

    const crtEffect = extension
      .addEffect('CRT')
      .setFullName(_('CRT'))
      .setDescription(_('Apply an effect resembling old CRT monitors.'))
      .markAsOnlyWorkingFor2D()
      .setHelpPath('/all-features/effects/crt')
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-crt.js')
      .addIncludeFile('Extensions/Effects/crt-pixi-filter.js');
    const crtProperties = crtEffect.getProperties();
    crtProperties
      .getOrCreate('lineWidth')
      .setValue('1')
      .setLabel(_('Line width (between 0 and 5)'))
      .setType('number');
    crtProperties
      .getOrCreate('lineContrast')
      .setValue('0.25')
      .setLabel(_('Line contrast (between 0 and 1)'))
      .setType('number');
    crtProperties
      .getOrCreate('noise')
      .setValue('0.3')
      .setLabel(_('Noise (between 0 and 1)'))
      .setType('number');
    crtProperties
      .getOrCreate('curvature')
      .setValue('1')
      .setLabel(_('Curvature (between 0 and 10)'))
      .setType('number');
    crtProperties
      .getOrCreate('verticalLine')
      .setValue('false')
      .setLabel(_('Show vertical lines'))
      .setType('boolean');
    crtProperties
      .getOrCreate('noiseSize')
      .setValue('1')
      .setLabel(_('Noise size (between 0 and 10)'))
      .setType('number');
    crtProperties
      .getOrCreate('vignetting')
      .setValue('0.3')
      .setLabel(_('Vignetting (between 0 and 1)'))
      .setType('number');
    crtProperties
      .getOrCreate('vignettingAlpha')
      .setValue('1')
      .setLabel(_('Vignetting alpha (between 0 and 1)'))
      .setType('number');
    crtProperties
      .getOrCreate('vignettingBlur')
      .setValue('0.3')
      .setLabel(_('Vignetting blur (between 0 and 1)'))
      .setType('number');
    crtProperties
      .getOrCreate('animationSpeed')
      .setValue('1')
      .setLabel(_('Interlaced Lines Speed'))
      .setType('number')
      .setDescription(
        _('0: Pause, 0.5: Half speed, 1: Normal speed, 2: Double speed, etc...')
      );
    crtProperties
      .getOrCreate('animationFrequency')
      .setValue('60')
      .setLabel(_('Noise Frequency'))
      .setType('number')
      .setDescription('Number of updates per second (0: no updates)');
    crtProperties
      .getOrCreate('padding')
      .setValue('0')
      .setLabel(_('Padding'))
      .setType('number')
      .setDescription(_('Padding for the visual effect area'));

    const displacementEffect = extension
      .addEffect('Displacement')
      .setFullName(_('Displacement'))
      .setDescription(
        _(
          'Uses the pixel values from the specified texture (called the displacement map) to perform a displacement of an object.'
        )
      )
      .markAsOnlyWorkingFor2D()
      .setHelpPath('/all-features/effects/displacement')
      .addIncludeFile('Extensions/Effects/displacement-pixi-filter.js');
    const displacementProperties = displacementEffect.getProperties();
    displacementProperties
      .getOrCreate('displacementMapTexture')
      .setType('resource')
      .addExtraInfo('image')
      .setLabel(_('Displacement map texture'))
      .setDescription(
        _(
          'Displacement map texture for the effect. To get started, **download** [a default displacement map texture here](https://wiki.gdevelop.io/gdevelop5/interface/scene-editor/layer-effects).'
        )
      );
    displacementProperties
      .getOrCreate('scaleX')
      .setValue('20')
      .setLabel(_('Scale on X axis'))
      .setType('number');
    displacementProperties
      .getOrCreate('scaleY')
      .setValue('20')
      .setLabel(_('Scale on Y axis'))
      .setType('number');

    const dotEffect = extension
      .addEffect('Dot')
      .setFullName(_('Dot'))
      .setDescription(
        _(
          'Applies a dotscreen effect making objects appear to be made out of black and white halftone dots like an old printer.'
        )
      )
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-dot.js')
      .addIncludeFile('Extensions/Effects/dot-pixi-filter.js');
    const dotProperties = dotEffect.getProperties();
    dotProperties
      .getOrCreate('scale')
      .setValue('1')
      .setLabel(_('Scale (between 0.3 and 1)'))
      .setType('number')
      .setDescription('The scale of the effect');
    dotProperties
      .getOrCreate('angle')
      .setValue('5')
      .setLabel(_('Angle (between 0 and 5)'))
      .setType('number')
      .setDescription('The radius of the effect');

    const dropShadowEffect = extension
      .addEffect('DropShadow')
      .setFullName(_('Drop shadow'))
      .setDescription(_('Add a shadow around the rendered image.'))
      .markAsOnlyWorkingFor2D()
      .setHelpPath('/all-features/effects/drop-shadow')
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-kawase-blur.js')
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-drop-shadow.js')
      .addIncludeFile('Extensions/Effects/drop-shadow-pixi-filter.js');
    const dropShadowProperties = dropShadowEffect.getProperties();
    dropShadowProperties
      .getOrCreate('blur')
      .setValue('2')
      .setLabel(_('Blur (between 0 and 20)'))
      .setType('number');
    dropShadowProperties
      .getOrCreate('quality')
      .setValue('3')
      .setLabel(_('Quality (between 1 and 20)'))
      .setType('number');
    dropShadowProperties
      .getOrCreate('alpha')
      .setValue('1')
      .setLabel(_('Alpha (between 0 and 1)'))
      .setType('number');
    dropShadowProperties
      .getOrCreate('distance')
      .setValue('1')
      .setLabel(_('Distance (between 0 and 50)'))
      .setType('number');
    dropShadowProperties
      .getOrCreate('rotation')
      .setValue('0')
      .setLabel(_('Rotation (between 0 and 360)'))
      .setType('number');
    dropShadowProperties
      .getOrCreate('color')
      .setValue('255;255;255')
      .setLabel(_('Color of the shadow'))
      .setType('color');
    dropShadowProperties
      .getOrCreate('shadowOnly')
      .setValue('false')
      .setLabel(_('Shadow only (shows only the shadow when enabled)'))
      .setType('boolean');
    dropShadowProperties
      .getOrCreate('padding')
      .setValue('0')
      .setLabel(_('Padding'))
      .setType('number')
      .setDescription(_('Padding for the visual effect area'));

    const glitchEffect = extension
      .addEffect('Glitch')
      .setFullName(_('Glitch'))
      .setDescription(_('Applies a glitch effect to an object.'))
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-glitch.js')
      .addIncludeFile('Extensions/Effects/glitch-pixi-filter.js');
    const glitchProperties = glitchEffect.getProperties();
    glitchProperties
      .getOrCreate('slices')
      .setValue('5')
      .setLabel(_('Slices (between 2 and infinite)'))
      .setType('number')
      .setDescription('The maximum number of slices');
    glitchProperties
      .getOrCreate('offset')
      .setValue('100')
      .setLabel(_('Offset (between -400 and 400)'))
      .setType('number')
      .setDescription('The maximum offset amount of slices');
    glitchProperties
      .getOrCreate('direction')
      .setValue('0')
      .setLabel(_('Direction (between -180 and 180)'))
      .setType('number')
      .setDescription('The angle in degree of the offset of slices');
    glitchProperties
      .getOrCreate('fillMode')
      .setValue('0')
      .setLabel(_('Fill Mode (between 0 and 4)'))
      .setType('number')
      .setDescription(
        _(
          'The fill mode of the space after the offset.(0: TRANSPARENT, 1: ORIGINAL, 2: LOOP, 3: CLAMP, 4: MIRROR)'
        )
      );
    glitchProperties
      .getOrCreate('average')
      .setValue('false')
      .setLabel(_('Average'))
      .setType('boolean')
      .setDescription('Divide the bands roughly based on equal amounts');
    glitchProperties
      .getOrCreate('minSize')
      .setValue('8')
      .setLabel(_('Min Size'))
      .setType('number')
      .setDescription('Minimum size of individual slice');
    glitchProperties
      .getOrCreate('sampleSize')
      .setValue('512')
      .setLabel(_('Sample Size'))
      .setType('number')
      .setDescription('The resolution of the displacement image');
    glitchProperties
      .getOrCreate('animationFrequency')
      .setValue('60')
      .setLabel(_('Animation Frequency'))
      .setType('number')
      .setDescription('Number of updates per second (0: no updates)');
    glitchProperties
      .getOrCreate('redX')
      .setValue('2')
      .setLabel(_('Red X offset (between -50 and 50)'))
      .setType('number');
    glitchProperties
      .getOrCreate('redY')
      .setValue('2')
      .setLabel(_('Red Y offset (between -50 and 50)'))
      .setType('number');
    glitchProperties
      .getOrCreate('greenX')
      .setValue('10')
      .setLabel(_('Green X offset (between -50 and 50)'))
      .setType('number');
    glitchProperties
      .getOrCreate('greenY')
      .setValue('-4')
      .setLabel(_('Green Y offset (between -50 and 50)'))
      .setType('number');
    glitchProperties
      .getOrCreate('blueX')
      .setValue('10')
      .setLabel(_('Blue X offset (between -50 and 50)'))
      .setType('number');
    glitchProperties
      .getOrCreate('blueY')
      .setValue('-4')
      .setLabel(_('Blue Y offset (between -50 and 50)'))
      .setType('number');

    const glowEffect = extension
      .addEffect('Glow')
      .setFullName(_('Glow'))
      .setDescription(_('Add a glow effect around the rendered image.'))
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-glow.js')
      .addIncludeFile('Extensions/Effects/glow-pixi-filter.js');
    const glowProperties = glowEffect.getProperties();
    glowProperties
      .getOrCreate('innerStrength')
      .setValue('1')
      .setLabel(_('Inner strength (between 0 and 20)'))
      .setType('number');
    glowProperties
      .getOrCreate('outerStrength')
      .setValue('2')
      .setLabel(_('Outer strength (between 0 and 20)'))
      .setType('number');
    glowProperties
      .getOrCreate('distance')
      .setValue('15')
      .setLabel(_('Distance (between 10 and 20)'))
      .setType('number');
    glowProperties
      .getOrCreate('color')
      .setValue('255;255;255')
      .setLabel(_('Color (color of the outline)'))
      .setType('color');

    const godrayEffect = extension
      .addEffect('Godray')
      .setFullName(_('Godray'))
      .setDescription(_('Apply and animate atmospheric light rays.'))
      .markAsOnlyWorkingFor2D()
      .setHelpPath('/all-features/effects/god-rays')
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-godray.js')
      .addIncludeFile('Extensions/Effects/godray-pixi-filter.js');
    const godrayProperties = godrayEffect.getProperties();
    godrayProperties
      .getOrCreate('parallel')
      .setValue('true')
      .setLabel(_('Parallel (parallel rays)'))
      .setType('boolean');
    godrayProperties
      .getOrCreate('animationSpeed')
      .setValue('1')
      .setLabel(_('Animation Speed'))
      .setType('number')
      .setDescription(
        _('0: Pause, 0.5: Half speed, 1: Normal speed, 2: Double speed, etc...')
      );
    godrayProperties
      .getOrCreate('lacunarity')
      .setValue('2.75')
      .setLabel(_('Lacunarity (between 0 and 5)'))
      .setType('number');
    godrayProperties
      .getOrCreate('angle')
      .setValue('30')
      .setLabel(_('Angle (between -60 and 60)'))
      .setType('number');
    godrayProperties
      .getOrCreate('gain')
      .setValue('0.6')
      .setLabel(_('Gain (between 0 and 1)'))
      .setType('number');
    godrayProperties
      .getOrCreate('light')
      .setValue('30')
      .setLabel(_('Light (between 0 and 60)'))
      .setType('number');
    godrayProperties
      .getOrCreate('x')
      .setValue('100')
      .setLabel(_('Center X (between 100 and 1000)'))
      .setType('number');
    godrayProperties
      .getOrCreate('y')
      .setValue('100')
      .setLabel(_('Center Y (between -1000 and 100)'))
      .setType('number');
    godrayProperties
      .getOrCreate('padding')
      .setValue('0')
      .setLabel(_('Padding'))
      .setType('number')
      .setDescription(_('Padding for the visual effect area'));

    const hslAdjustmentEffect = extension
      .addEffect('HslAdjustment')
      .setFullName(_('HSL Adjustment'))
      .setDescription(_('Adjust hue, saturation and lightness.'))
      .markAsOnlyWorkingFor2D()
      .addIncludeFile(
        'Extensions/Effects/pixi-filters/filter-hsl-adjustment.js'
      )
      .addIncludeFile('Extensions/Effects/hsl-adjustment-pixi-filter.js');
    const hslAdjustmentProperties = hslAdjustmentEffect.getProperties();
    hslAdjustmentProperties
      .getOrCreate('hue')
      .setValue('0')
      .setLabel(_('Hue in degrees (between -180 and 180)'))
      .setType('number');
    hslAdjustmentProperties
      .getOrCreate('saturation')
      .setValue('0')
      .setLabel(_('Saturation (between -1 and 1)'))
      .setType('number');
    hslAdjustmentProperties
      .getOrCreate('lightness')
      .setValue('0')
      .setLabel(_('Lightness (between -1 and 1)'))
      .setType('number');
    hslAdjustmentProperties
      .getOrCreate('colorize')
      .setValue('false')
      .setLabel(_('Colorize from the grayscale image'))
      .setType('boolean');
    hslAdjustmentProperties
      .getOrCreate('alpha')
      .setValue('1')
      .setLabel(_('Alpha (between 0 and 1, 0 is transparent)'))
      .setType('number');

    const kawaseBlurEffect = extension
      .addEffect('KawaseBlur')
      .setFullName(_('Blur (Kawase, fast)'))
      .setDescription(
        _(
          'Blur the rendered image, with much better performance than Gaussian blur.'
        )
      )
      .markAsOnlyWorkingFor2D()
      .setHelpPath('/all-features/effects/kawase-blur')
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-kawase-blur.js')
      .addIncludeFile('Extensions/Effects/kawase-blur-pixi-filter.js');
    const kawaseBlurProperties = kawaseBlurEffect.getProperties();
    kawaseBlurProperties
      .getOrCreate('pixelizeX')
      .setValue('1')
      .setLabel(_('Pixelize X (between 0 and 10)'))
      .setType('number');
    kawaseBlurProperties
      .getOrCreate('pixelizeY')
      .setValue('1')
      .setLabel(_('Pixelize Y (between 0 and 10)'))
      .setType('number');
    kawaseBlurProperties
      .getOrCreate('blur')
      .setValue('0.5')
      .setLabel(_('Blur (between 0 and 20)'))
      .setType('number');
    kawaseBlurProperties
      .getOrCreate('quality')
      .setValue('3')
      .setLabel(_('Quality (between 1 and 20)'))
      .setType('number');
    kawaseBlurProperties
      .getOrCreate('padding')
      .setValue('0')
      .setLabel(_('Padding'))
      .setType('number')
      .setDescription(_('Padding for the visual effect area'));

    const lightNightEffect = extension
      .addEffect('LightNight')
      .setFullName(_('Light Night'))
      .setDescription(_('Alter the colors to simulate night.'))
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/light-night-pixi-filter.js');
    const lightNightProperties = lightNightEffect.getProperties();
    lightNightProperties
      .getOrCreate('opacity')
      .setValue('1')
      .setLabel(_('Opacity (between 0 and 1)'))
      .setType('number');

    const motionBlurEffect = extension
      .addEffect('MotionBlur')
      .setFullName(_('Motion Blur'))
      .setDescription(_('Blur the rendered image to give a feeling of speed.'))
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-motion-blur.js')
      .addIncludeFile('Extensions/Effects/motion-blur-pixi-filter.js');
    const motionBlurProperties = motionBlurEffect.getProperties();
    motionBlurProperties
      .getOrCreate('velocityX')
      .setValue('0')
      .setLabel(_('Velocity on X axis'))
      .setType('number');
    motionBlurProperties
      .getOrCreate('velocityY')
      .setValue('0')
      .setLabel(_('Velocity on Y axis'))
      .setType('number');
    motionBlurProperties
      .getOrCreate('kernelSize')
      .setValue('5')
      .setLabel(_('Kernel size (odd number between 3 and 25)'))
      .setType('number')
      .setDescription(_('Quality of the blur.'));
    motionBlurProperties
      .getOrCreate('offset')
      .setValue('0')
      .setLabel(_('Offset'))
      .setType('number');

    const nightEffect = extension
      .addEffect('Night')
      .setFullName(_('Dark Night'))
      .setDescription(_('Alter the colors to simulate a dark night.'))
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/night-pixi-filter.js');
    const nightProperties = nightEffect.getProperties();
    nightProperties
      .getOrCreate('intensity')
      .setValue('0.5')
      .setLabel(_('Intensity (between 0 and 1)'))
      .setType('number');
    nightProperties
      .getOrCreate('opacity')
      .setValue('0.5')
      .setLabel(_('Opacity (between 0 and 1)'))
      .setType('number');

    const noiseEffect = extension
      .addEffect('Noise')
      .setFullName(_('Noise'))
      .setDescription(_('Add some noise on the rendered image.'))
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/noise-pixi-filter.js');
    const noiseProperties = noiseEffect.getProperties();
    noiseProperties
      .getOrCreate('noise')
      .setValue('0.5')
      .setLabel(_('Noise intensity (between 0 and 1)'))
      .setType('number');

    const oldFilmEffect = extension
      .addEffect('OldFilm')
      .setFullName(_('Old Film'))
      .setDescription(_('Add a Old film effect around the rendered image.'))
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-old-film.js')
      .addIncludeFile('Extensions/Effects/old-film-pixi-filter.js');
    const oldFilmProperties = oldFilmEffect.getProperties();
    oldFilmProperties
      .getOrCreate('sepia')
      .setValue('0.3')
      .setLabel(_('Sepia (between 0 and 1)'))
      .setType('number')
      .setDescription(
        _(
          'The amount of saturation of sepia effect, a value of 1 is more saturation and closer to 0 is less, and a value of 0 produces no sepia effect'
        )
      );
    oldFilmProperties
      .getOrCreate('noise')
      .setValue('0.3')
      .setLabel(_('Noise (between 0 and 1)'))
      .setType('number')
      .setDescription('Opacity/intensity of the noise effect');
    oldFilmProperties
      .getOrCreate('noiseSize')
      .setValue('1')
      .setLabel(_('Noise Size (between 0 and 10)'))
      .setType('number')
      .setDescription('The size of the noise particles');
    oldFilmProperties
      .getOrCreate('scratch')
      .setValue('0.5')
      .setLabel(_('Scratch (between -1 and 1)'))
      .setType('number')
      .setDescription('How often scratches appear');
    oldFilmProperties
      .getOrCreate('scratchDensity')
      .setValue('0.3')
      .setLabel(_('Scratch Density (between 0 and 1)'))
      .setType('number')
      .setDescription('The density of the number of scratches');
    oldFilmProperties
      .getOrCreate('scratchWidth')
      .setValue('1.0')
      .setLabel(_('Scratch Width (between 1 and 20)'))
      .setType('number')
      .setDescription('The width of the scratches');
    oldFilmProperties
      .getOrCreate('vignetting')
      .setValue('0.3')
      .setLabel(_('Vignetting (between 0 and 1)'))
      .setType('number')
      .setDescription('The radius of the vignette effect');
    oldFilmProperties
      .getOrCreate('vignettingAlpha')
      .setValue('1.0')
      .setLabel(_('Vignetting Alpha (between 0 and 1)'))
      .setType('number');
    oldFilmProperties
      .getOrCreate('vignettingBlur')
      .setValue('0.3')
      .setLabel(_('Vignetting Blur (between 0 and 1)'))
      .setType('number');
    oldFilmProperties
      .getOrCreate('animationFrequency')
      .setValue('60')
      .setLabel(_('Animation Frequency'))
      .setType('number')
      .setDescription('Number of updates per second (0: no updates)');

    const outlineEffect = extension
      .addEffect('Outline')
      .setFullName(_('Outline'))
      .setDescription(_('Draws an outline around the rendered image.'))
      .markAsOnlyWorkingFor2D()
      .setHelpPath('/all-features/effects/outline')
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-outline.js')
      .addIncludeFile('Extensions/Effects/outline-pixi-filter.js');
    const outlineProperties = outlineEffect.getProperties();
    outlineProperties
      .getOrCreate('thickness')
      .setValue('2')
      .setLabel(_('Thickness (between 0 and 20)'))
      .setType('number');
    outlineProperties
      .getOrCreate('color')
      .setValue('255;255;255')
      .setLabel(_('Color of the outline'))
      .setType('color');
    outlineProperties
      .getOrCreate('padding')
      .setValue('0')
      .setLabel(_('Padding'))
      .setType('number')
      .setDescription(_('Padding for the visual effect area'));

    const pixelateEffect = extension
      .addEffect('Pixelate')
      .setFullName(_('Pixelate'))
      .setDescription(
        _("Applies a pixelate effect, making display objects appear 'blocky'.")
      )
      .markAsOnlyWorkingFor2D()
      .setHelpPath('/all-features/effects/pixelate')
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-pixelate.js')
      .addIncludeFile('Extensions/Effects/pixelate-pixi-filter.js');
    const pixelateProperties = pixelateEffect.getProperties();
    pixelateProperties
      .getOrCreate('size')
      .setValue('10')
      .setLabel(_('Size'))
      .setType('number')
      .setDescription(_('Size of the pixels (10 pixels by default)'));

    const radialBlurEffect = extension
      .addEffect('RadialBlur')
      .setFullName(_('Radial Blur'))
      .setDescription(_('Applies a Motion blur to an object.'))
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-radial-blur.js')
      .addIncludeFile('Extensions/Effects/radial-blur-pixi-filter.js')
      .markAsNotWorkingForObjects(); // See https://github.com/pixijs/filters/issues/304
    const radialBlurProperties = radialBlurEffect.getProperties();
    radialBlurProperties
      .getOrCreate('radius')
      .setValue('-1')
      .setLabel(_('Radius'))
      .setType('number')
      .setDescription(_('The maximum size of the blur radius, -1 is infinite'));
    radialBlurProperties
      .getOrCreate('angle')
      .setValue('0')
      .setLabel(_('Angle (between -180 and 180)'))
      .setType('number')
      .setDescription(_('The angle in degree of the motion for blur effect'));
    radialBlurProperties
      .getOrCreate('kernelSize')
      .setValue('5')
      .setLabel(_('Kernel Size (between 3 and 25)'))
      .setType('number')
      .setDescription(_('The kernel size of the blur filter (Odd number)'));
    radialBlurProperties
      .getOrCreate('centerX')
      .setValue('0.5')
      .setLabel(_('Center X (between 0 and 1, 0.5 is image middle)'))
      .setType('number');
    radialBlurProperties
      .getOrCreate('centerY')
      .setValue('0.5')
      .setLabel(_('Center Y (between 0 and 1, 0.5 is image middle)'))
      .setType('number');
    radialBlurProperties
      .getOrCreate('padding')
      .setValue('0')
      .setLabel(_('Padding'))
      .setType('number')
      .setDescription(_('Padding for the visual effect area'));

    const reflectionEffect = extension
      .addEffect('Reflection')
      .setFullName(_('Reflection'))
      .setDescription(
        _(
          'Applies a reflection effect to simulate the reflection on water with waves.'
        )
      )
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-reflection.js')
      .addIncludeFile('Extensions/Effects/reflection-pixi-filter.js');
    const reflectionProperties = reflectionEffect.getProperties();
    reflectionProperties
      .getOrCreate('mirror')
      .setValue('true')
      .setLabel(_('Reflect the image on the waves'))
      .setType('boolean');
    reflectionProperties
      .getOrCreate('boundary')
      .setValue('0.5')
      .setLabel(_('Vertical position of the reflection point'))
      .setType('number')
      .setDescription(
        _(
          'Default is 50% (middle). Smaller numbers produce a larger reflection, larger numbers produce a smaller reflection.'
        )
      );
    reflectionProperties
      .getOrCreate('amplitudeStart')
      .setValue('0')
      .setLabel(_('Amplitude start'))
      .setType('number')
      .setDescription(_('Starting amplitude of waves (0 by default)'));
    reflectionProperties
      .getOrCreate('amplitudeEnding')
      .setValue('20')
      .setLabel(_('Amplitude ending'))
      .setType('number')
      .setDescription(_('Ending amplitude of waves (20 by default)'));
    reflectionProperties
      .getOrCreate('waveLengthStart')
      .setValue('30')
      .setLabel(_('Wave length start'))
      .setType('number')
      .setDescription(_('Starting wave length (30 by default)'));
    reflectionProperties
      .getOrCreate('waveLengthEnding')
      .setValue('100')
      .setLabel(_('Wave length ending'))
      .setType('number')
      .setDescription(_('Ending wave length (100 by default)'));
    reflectionProperties
      .getOrCreate('alphaStart')
      .setValue('1')
      .setLabel(_('Alpha start'))
      .setType('number')
      .setDescription(_('Starting alpha (1 by default)'));
    reflectionProperties
      .getOrCreate('alphaEnding')
      .setValue('1')
      .setLabel(_('Alpha ending'))
      .setType('number')
      .setDescription(_('Ending alpha (1 by default)'));
    reflectionProperties
      .getOrCreate('animationSpeed')
      .setValue('1')
      .setLabel(_('Animation Speed'))
      .setType('number')
      .setDescription(
        _('0: Pause, 0.5: Half speed, 1: Normal speed, 2: Double speed, etc...')
      );

    const rgbSplitEffect = extension
      .addEffect('RGBSplit')
      .setFullName(_('RGB split (chromatic aberration)'))
      .setDescription(
        _('Applies a RGB split effect also known as chromatic aberration.')
      )
      .markAsOnlyWorkingFor2D()
      .setHelpPath('/all-features/effects/rgb-split')
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-rgb-split.js')
      .addIncludeFile('Extensions/Effects/rgb-split-pixi-filter.js');
    const rgbSplitProperties = rgbSplitEffect.getProperties();
    rgbSplitProperties
      .getOrCreate('redX')
      .setValue('-10')
      .setLabel(_('Red X offset (between -20 and 20)'))
      .setType('number');
    rgbSplitProperties
      .getOrCreate('redY')
      .setValue('1')
      .setLabel(_('Red Y offset (between -20 and 20)'))
      .setType('number');
    rgbSplitProperties
      .getOrCreate('greenX')
      .setValue('0')
      .setLabel(_('Green X offset (between -20 and 20)'))
      .setType('number');
    rgbSplitProperties
      .getOrCreate('greenY')
      .setValue('0')
      .setLabel(_('Green Y offset (between -20 and 20)'))
      .setType('number');
    rgbSplitProperties
      .getOrCreate('blueX')
      .setValue('0')
      .setLabel(_('Blue X offset (between -20 and 20)'))
      .setType('number');
    rgbSplitProperties
      .getOrCreate('blueY')
      .setValue('10')
      .setLabel(_('Blue Y offset (between -20 and 20)'))
      .setType('number');

    const sepiaEffect = extension
      .addEffect('Sepia')
      .setFullName(_('Sepia'))
      .setDescription(_('Alter the colors to sepia.'))
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/sepia-pixi-filter.js');
    const sepiaProperties = sepiaEffect.getProperties();
    sepiaProperties
      .getOrCreate('opacity')
      .setValue('1')
      .setLabel(_('Opacity (between 0 and 1)'))
      .setType('number');

    const shockwaveEffect = extension
      .addEffect('Shockwave')
      .setFullName(_('Shockwave'))
      .setDescription(
        _('Deform the image the way a drop deforms a water surface.')
      )
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-shockwave.js')
      .addIncludeFile('Extensions/Effects/shockwave-pixi-filter.js');
    const shockwaveEffectProperties = shockwaveEffect.getProperties();
    shockwaveEffectProperties
      .getOrCreate('time')
      .setValue('0')
      .setLabel(_('Elapsed time'))
      .setType('number')
      .setDescription(
        'It can be set back to 0 to play the shockwave animation again.'
      );
    shockwaveEffectProperties
      .getOrCreate('speed')
      .setValue('500')
      .setLabel(_('Spreading speed (in pixels per second)'))
      .setType('number');
    shockwaveEffectProperties
      .getOrCreate('amplitude')
      .setValue('50')
      .setLabel(_('Amplitude'))
      .setType('number');
    shockwaveEffectProperties
      .getOrCreate('wavelength')
      .setValue('200')
      .setLabel(_('Wavelength'))
      .setType('number');
    shockwaveEffectProperties
      .getOrCreate('brightness')
      .setValue('1')
      .setLabel(_('Brightness'))
      .setType('number');
    shockwaveEffectProperties
      .getOrCreate('radius')
      .setValue('0')
      .setLabel(_('Maximum radius (0 for infinity)'))
      .setType('number');
    shockwaveEffectProperties
      .getOrCreate('centerX')
      .setValue('0.5')
      .setLabel(_('Center on X axis'))
      .setType('number');
    shockwaveEffectProperties
      .getOrCreate('centerY')
      .setValue('0.5')
      .setLabel(_('Center on Y axis'))
      .setType('number')
      .setDescription('(0,0) is the top-left and (1,1) is the bottom right.');

    const tiltShiftEffect = extension
      .addEffect('TiltShift')
      .setFullName(_('Tilt shift'))
      .setDescription(_('Render a tilt-shift-like camera effect.'))
      .markAsOnlyWorkingFor2D()
      .setHelpPath('/all-features/effects/tilt-split')
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-tilt-shift.js')
      .addIncludeFile('Extensions/Effects/tilt-shift-pixi-filter.js');
    const tiltShiftProperties = tiltShiftEffect.getProperties();
    tiltShiftProperties
      .getOrCreate('blur')
      .setValue('30')
      .setLabel(_('Blur (between 0 and 200)'))
      .setType('number');
    tiltShiftProperties
      .getOrCreate('gradientBlur')
      .setValue('1000')
      .setLabel(_('Gradient blur (between 0 and 2000)'))
      .setType('number');

    const twistEffect = extension
      .addEffect('Twist')
      .setFullName(_('Twist'))
      .setDescription(
        _(
          'Applies a twist effect making objects appear twisted in the given direction.'
        )
      )
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-twist.js')
      .addIncludeFile('Extensions/Effects/twist-pixi-filter.js')
      .markAsNotWorkingForObjects(); // See https://github.com/pixijs/filters/issues/304
    const twistProperties = twistEffect.getProperties();
    twistProperties
      .getOrCreate('radius')
      .setValue('200')
      .setLabel(_('Radius'))
      .setType('number')
      .setDescription(_('The radius of the twist'));
    twistProperties
      .getOrCreate('angle')
      .setValue('4')
      .setLabel(_('Angle (between -10 and 10)'))
      .setType('number')
      .setDescription(_('The angle in degree of the twist'));
    twistProperties
      .getOrCreate('padding')
      .setValue('20')
      .setLabel(_('Padding'))
      .setType('number')
      .setDescription(_('Padding for the visual effect area'));
    twistProperties
      .getOrCreate('offsetX')
      .setValue('0.5')
      .setLabel(_('Offset X (between 0 and 1, 0.5 is image middle)'))
      .setType('number');
    twistProperties
      .getOrCreate('offsetY')
      .setValue('0.5')
      .setLabel(_('Offset Y (between 0 and 1, 0.5 is image middle)'))
      .setType('number');

    const zoomBlurEffect = extension
      .addEffect('ZoomBlur')
      .setFullName(_('Zoom blur'))
      .setDescription(_('Applies a Zoom blur.'))
      .markAsOnlyWorkingFor2D()
      .addIncludeFile('Extensions/Effects/pixi-filters/filter-zoom-blur.js')
      .addIncludeFile('Extensions/Effects/zoom-blur-pixi-filter.js')
      .markAsNotWorkingForObjects(); // See https://github.com/pixijs/filters/issues/304
    const zoomBlurProperties = zoomBlurEffect.getProperties();
    zoomBlurProperties
      .getOrCreate('centerX')
      .setValue('0.5')
      .setLabel(_('Center X (between 0 and 1, 0.5 is image middle)'))
      .setType('number');
    zoomBlurProperties
      .getOrCreate('centerY')
      .setValue('0.5')
      .setLabel(_('Center Y (between 0 and 1, 0.5 is image middle)'))
      .setType('number');
    zoomBlurProperties
      .getOrCreate('innerRadius')
      .setValue('200')
      .setLabel(_('Inner radius'))
      .setType('number');
    zoomBlurProperties
      .getOrCreate('strength')
      .setValue('0.3')
      .setLabel(_('strength (between 0 and 5)'))
      .setType('number');
    zoomBlurProperties
      .getOrCreate('padding')
      .setValue('0')
      .setLabel(_('Padding'))
      .setType('number')
      .setDescription(_('Padding for the visual effect area'));

    return extension;
  },
  runExtensionSanityTests: function (gd, extension) {
    return [];
  },
};

// Effects/kawase-blur-pixi-filter.js
var gdjs;(function(l){l.PixiFiltersTools.registerFilterCreator("KawaseBlur",new class extends l.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(t,e){return new PIXI.filters.KawaseBlurFilter}updatePreRender(t,e){}updateDoubleParameter(t,e,r){const i=t;e==="pixelizeX"?i.pixelSize[0]=r:e==="pixelizeY"?i.pixelSize[1]=r:e==="blur"?i.blur=r:e==="quality"&&(i.quality=r)}getDoubleParameter(t,e){const r=t;return e==="pixelizeX"?r.pixelSize[0]:e==="pixelizeY"?r.pixelSize[1]:e==="blur"?r.blur:e==="quality"?r.quality:0}updateStringParameter(t,e,r){}updateColorParameter(t,e,r){}getColorParameter(t,e){return 0}updateBooleanParameter(t,e,r){}getNetworkSyncData(t){const e=t;return{px:e.pixelSize[0],py:e.pixelSize[1],b:e.blur,q:e.quality}}updateFromNetworkSyncData(t,e){const r=t;r.pixelSize[0]=e.px,r.pixelSize[1]=e.py,r.blur=e.b,r.quality=e.q}})})(gdjs||(gdjs={}));
//# sourceMappingURL=kawase-blur-pixi-filter.js.map

// Effects/light-night-pixi-filter.js
var gdjs;(function(i){class a extends PIXI.Filter{constructor(){const t=void 0,e=["precision mediump float;","","varying vec2 vTextureCoord;","uniform sampler2D uSampler;","uniform float opacity;","","void main(void)","{","   mat3 nightMatrix = mat3(0.6, 0, 0, 0, 0.7, 0, 0, 0, 1.3);","   gl_FragColor = texture2D(uSampler, vTextureCoord);","   gl_FragColor.rgb = mix(gl_FragColor.rgb, nightMatrix * gl_FragColor.rgb, opacity);","}"].join(`
`),o={opacity:{type:"1f",value:1}};super(t,e,o)}}i.LightNightPixiFilter=a,a.prototype.constructor=i.LightNightPixiFilter,i.PixiFiltersTools.registerFilterCreator("LightNight",new class extends i.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(r,t){return new i.LightNightPixiFilter}updatePreRender(r,t){}updateDoubleParameter(r,t,e){t==="opacity"&&(r.uniforms.opacity=i.PixiFiltersTools.clampValue(e,0,1))}getDoubleParameter(r,t){return t==="opacity"?r.uniforms.opacity:0}updateStringParameter(r,t,e){}updateColorParameter(r,t,e){}getColorParameter(r,t){return 0}updateBooleanParameter(r,t,e){}getNetworkSyncData(r){return{o:r.uniforms.opacity}}updateFromNetworkSyncData(r,t){r.uniforms.opacity=t.o}})})(gdjs||(gdjs={}));
//# sourceMappingURL=light-night-pixi-filter.js.map

// Effects/motion-blur-pixi-filter.js
var gdjs;(function(l){l.PixiFiltersTools.registerFilterCreator("MotionBlur",new class extends l.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(r,e){return new PIXI.filters.MotionBlurFilter([0,0])}updatePreRender(r,e){}updateDoubleParameter(r,e,t){const i=r;e==="velocityX"?i._velocity.x=t:e==="velocityY"?i._velocity.y=t:e==="kernelSize"?i.kernelSize=t:e==="offset"&&(i.offset=t)}getDoubleParameter(r,e){const t=r;return e==="velocityX"?t._velocity.x:e==="velocityY"?t._velocity.y:e==="kernelSize"?t.kernelSize:e==="offset"?t.offset:0}updateStringParameter(r,e,t){}updateColorParameter(r,e,t){}getColorParameter(r,e){return 0}updateBooleanParameter(r,e,t){}getNetworkSyncData(r){const e=r;return{vx:e._velocity.x,vy:e._velocity.y,ks:e.kernelSize,o:e.offset}}updateFromNetworkSyncData(r,e){const t=r;t._velocity.x=e.vx,t._velocity.y=e.vy,t.kernelSize=e.ks,t.offset=e.o}})})(gdjs||(gdjs={}));
//# sourceMappingURL=motion-blur-pixi-filter.js.map

// Effects/night-pixi-filter.js
var gdjs;(function(i){class n extends PIXI.Filter{constructor(){const e=void 0,r=["precision mediump float;","","varying vec2 vTextureCoord;","uniform sampler2D uSampler;","uniform float intensity;","uniform float opacity;","","void main(void)","{","   mat3 nightMatrix = mat3(-2.0 * intensity, -1.0 * intensity, 0, -1.0 * intensity, 0, 1.0 * intensity, 0, 1.0 * intensity, 2.0 * intensity);","   gl_FragColor = texture2D(uSampler, vTextureCoord);","   gl_FragColor.rgb = mix(gl_FragColor.rgb, nightMatrix * gl_FragColor.rgb, opacity);","}"].join(`
`),a={intensity:{type:"1f",value:1},opacity:{type:"1f",value:1}};super(e,r,a)}}i.NightPixiFilter=n,n.prototype.constructor=i.NightPixiFilter,i.PixiFiltersTools.registerFilterCreator("Night",new class extends i.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(t,e){return new i.NightPixiFilter}updatePreRender(t,e){}updateDoubleParameter(t,e,r){e!=="intensity"&&e!=="opacity"||(t.uniforms[e]=i.PixiFiltersTools.clampValue(r,0,1))}getDoubleParameter(t,e){return t.uniforms[e]||0}updateStringParameter(t,e,r){}updateColorParameter(t,e,r){}getColorParameter(t,e){return 0}updateBooleanParameter(t,e,r){}getNetworkSyncData(t){return{i:t.uniforms.intensity,o:t.uniforms.opacity}}updateFromNetworkSyncData(t,e){t.uniforms.intensity=e.i,t.uniforms.opacity=e.o}})})(gdjs||(gdjs={}));
//# sourceMappingURL=night-pixi-filter.js.map

// Effects/noise-pixi-filter.js
var gdjs;(function(i){i.PixiFiltersTools.registerFilterCreator("Noise",new class extends i.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(e,r){return new PIXI.NoiseFilter}updatePreRender(e,r){}updateDoubleParameter(e,r,t){const a=e;r==="noise"&&(a.noise=i.PixiFiltersTools.clampValue(t,0,1))}getDoubleParameter(e,r){const t=e;return r==="noise"?t.noise:0}updateStringParameter(e,r,t){}updateColorParameter(e,r,t){}getColorParameter(e,r){return 0}updateBooleanParameter(e,r,t){}getNetworkSyncData(e){return{n:e.noise}}updateFromNetworkSyncData(e,r){const t=e;t.noise=r.n}})})(gdjs||(gdjs={}));
//# sourceMappingURL=noise-pixi-filter.js.map

// Effects/old-film-pixi-filter.js
var gdjs;(function(r){r.PixiFiltersTools.registerFilterCreator("OldFilm",new class extends r.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(t,i){const n=new PIXI.filters.OldFilmFilter;return n._animationTimer=0,n}updatePreRender(t,i){const e=t;e.animationFrequency!==0&&(e._animationTimer+=i.getElapsedTime()/1e3,e._animationTimer>=1/e.animationFrequency&&(e.seed=Math.random(),e._animationTimer=0))}updateDoubleParameter(t,i,e){const n=t;i==="sepia"?n.sepia=e:i==="noise"?n.noise=e:i==="noiseSize"?n.noiseSize=e:i==="scratch"?n.scratch=e:i==="scratchDensity"?n.scratchDensity=e:i==="scratchWidth"?n.scratchWidth=e:i==="vignetting"?n.vignetting=e:i==="vignettingAlpha"?n.vignettingAlpha=e:i==="vignettingBlur"?n.vignettingBlur=e:i==="animationFrequency"&&(n.animationFrequency=e)}getDoubleParameter(t,i){const e=t;return i==="sepia"?e.sepia:i==="noise"?e.noise:i==="noiseSize"?e.noiseSize:i==="scratch"?e.scratch:i==="scratchDensity"?e.scratchDensity:i==="scratchWidth"?e.scratchWidth:i==="vignetting"?e.vignetting:i==="vignettingAlpha"?e.vignettingAlpha:i==="vignettingBlur"?e.vignettingBlur:i==="animationFrequency"?e.animationFrequency:0}updateStringParameter(t,i,e){}updateColorParameter(t,i,e){}getColorParameter(t,i){return 0}updateBooleanParameter(t,i,e){}getNetworkSyncData(t){const i=t;return{se:i.sepia,n:i.noise,ns:i.noiseSize,s:i.scratch,sd:i.scratchDensity,sw:i.scratchWidth,v:i.vignetting,va:i.vignettingAlpha,vb:i.vignettingBlur,af:i.animationFrequency}}updateFromNetworkSyncData(t,i){const e=t;e.sepia=i.se,e.noise=i.n,e.noiseSize=i.ns,e.scratch=i.s,e.scratchDensity=i.sd,e.scratchWidth=i.sw,e.vignetting=i.v,e.vignettingAlpha=i.va,e.vignettingBlur=i.vb,e.animationFrequency=i.af}})})(gdjs||(gdjs={}));
//# sourceMappingURL=old-film-pixi-filter.js.map

// Effects/outline-pixi-filter.js
var gdjs;(function(n){n.PixiFiltersTools.registerFilterCreator("Outline",new class extends n.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(r,e){return new PIXI.filters.OutlineFilter}updatePreRender(r,e){}updateDoubleParameter(r,e,t){const i=r;e==="thickness"?i.thickness=t:e==="padding"&&(i.padding=t)}getDoubleParameter(r,e){const t=r;return e==="thickness"?t.thickness:e==="padding"?t.padding:0}updateStringParameter(r,e,t){const i=r;e==="color"&&(i.color=n.rgbOrHexStringToNumber(t))}updateColorParameter(r,e,t){const i=r;e==="color"&&(i.color=t)}getColorParameter(r,e){const t=r;return e==="color"?t.color:0}updateBooleanParameter(r,e,t){}getNetworkSyncData(r){const e=r;return{t:e.thickness,p:e.padding,c:e.color}}updateFromNetworkSyncData(r,e){const t=r;t.thickness=e.t,t.padding=e.p,t.color=e.c}})})(gdjs||(gdjs={}));
//# sourceMappingURL=outline-pixi-filter.js.map

// Effects/pixelate-pixi-filter.js
var gdjs;(function(a){a.PixiFiltersTools.registerFilterCreator("Pixelate",new class extends a.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(e,t){return new PIXI.filters.PixelateFilter(t.doubleParameters.size)}updatePreRender(e,t){}updateDoubleParameter(e,t,r){const i=e;t==="size"&&(i.size=r)}getDoubleParameter(e,t){const r=e;return t==="size"?r.size:0}updateStringParameter(e,t,r){}updateColorParameter(e,t,r){}getColorParameter(e,t){return 0}updateBooleanParameter(e,t,r){}getNetworkSyncData(e){return{s:e.size}}updateFromNetworkSyncData(e,t){const r=e;r.size=t.s}})})(gdjs||(gdjs={}));
//# sourceMappingURL=pixelate-pixi-filter.js.map

// Effects/radial-blur-pixi-filter.js
var gdjs;(function(l){l.PixiFiltersTools.registerFilterCreator("RadialBlur",new class extends l.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(i,e){return new PIXI.filters.RadialBlurFilter}updatePreRender(i,e){const r=i;r.center[0]=Math.round(r._centerX*e.getWidth()),r.center[1]=Math.round(r._centerY*e.getHeight())}updateDoubleParameter(i,e,r){const t=i;e==="radius"?t.radius=r<0?-1:r:e==="angle"?t.angle=r:e==="kernelSize"?t.kernelSize=l.PixiFiltersTools.clampKernelSize(r,3,25):e==="centerX"?t._centerX=r:e==="centerY"?t._centerY=r:e==="padding"&&(t.padding=r)}getDoubleParameter(i,e){const r=i;return e==="radius"&&r.radius,e==="angle"&&r.angle,e==="kernelSize"&&r.kernelSize,e==="centerX"&&r._centerX,e==="centerY"&&r._centerY,e==="padding"&&r.padding,0}updateStringParameter(i,e,r){}updateColorParameter(i,e,r){}getColorParameter(i,e){return 0}updateBooleanParameter(i,e,r){}getNetworkSyncData(i){const e=i;return{r:e.radius,a:e.angle,ks:e.kernelSize,cx:e._centerX,cy:e._centerY,p:e.padding}}updateFromNetworkSyncData(i,e){const r=i;r.radius=e.r,r.angle=e.a,r.kernelSize=e.ks,r._centerX=e.cx,r._centerY=e.cy,r.padding=e.p}})})(gdjs||(gdjs={}));
//# sourceMappingURL=radial-blur-pixi-filter.js.map

// Effects/reflection-pixi-filter.js
var gdjs;(function(n){n.PixiFiltersTools.registerFilterCreator("Reflection",new class extends n.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(r,e){let t=0;return new PIXI.filters.ReflectionFilter({mirror:e.booleanParameters.mirror,boundary:e.doubleParameters.boundary,amplitude:[e.doubleParameters.amplitudeStart,e.doubleParameters.amplitudeEnding],waveLength:[e.doubleParameters.waveLengthStart,e.doubleParameters.waveLengthEnding],alpha:[e.doubleParameters.alphaStart,e.doubleParameters.alphaEnding],time:t})}updatePreRender(r,e){const t=r;t.animationSpeed!==0&&(t.time+=e.getElapsedTime()/1e3*t.animationSpeed)}updateDoubleParameter(r,e,t){const i=r;e==="boundary"&&(i.boundary=t),e==="amplitudeStart"&&(i.amplitude[0]=t),e==="amplitudeEnding"&&(i.amplitude[1]=t),e==="waveLengthStart"&&(i.waveLength[0]=t),e==="waveLengthEnding"&&(i.waveLength[1]=t),e==="alphaStart"&&(i.alpha[0]=t),e==="alphaEnding"&&(i.alpha[1]=t),e==="animationSpeed"&&(i.animationSpeed=t)}getDoubleParameter(r,e){const t=r;return e==="boundary"?t.boundary:e==="amplitudeStart"?t.amplitude[0]:e==="amplitudeEnding"?t.amplitude[1]:e==="waveLengthStart"?t.waveLength[0]:e==="waveLengthEnding"?t.waveLength[1]:e==="alphaStart"?t.alpha[0]:e==="alphaEnding"?t.alpha[1]:e==="animationSpeed"?t.animationSpeed:0}updateStringParameter(r,e,t){}updateColorParameter(r,e,t){}getColorParameter(r,e){return 0}updateBooleanParameter(r,e,t){const i=r;e==="mirror"&&(i.mirror=t)}getNetworkSyncData(r){const e=r;return{b:e.boundary,ams:e.amplitude[0],ame:e.amplitude[1],wls:e.waveLength[0],wle:e.waveLength[1],als:e.alpha[0],ale:e.alpha[1],as:e.animationSpeed,m:e.mirror}}updateFromNetworkSyncData(r,e){const t=r;t.boundary=e.b,t.amplitude[0]=e.ams,t.amplitude[1]=e.ame,t.waveLength[0]=e.wls,t.waveLength[1]=e.wle,t.alpha[0]=e.als,t.alpha[1]=e.ale,t.animationSpeed=e.as,t.mirror=e.m}})})(gdjs||(gdjs={}));
//# sourceMappingURL=reflection-pixi-filter.js.map

// Effects/rgb-split-pixi-filter.js
var gdjs;(function(l){l.PixiFiltersTools.registerFilterCreator("RGBSplit",new class extends l.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(t,e){return new PIXI.filters.RGBSplitFilter}updatePreRender(t,e){}updateDoubleParameter(t,e,r){const i=t;e==="redX"?i.red.x=r:e==="redY"?i.red.y=r:e==="greenX"?i.green.x=r:e==="greenY"?i.green.y=r:e==="blueX"?i.blue.x=r:e==="blueY"&&(i.blue.y=r)}getDoubleParameter(t,e){const r=t;return e==="redX"?r.red.x:e==="redY"?r.red.y:e==="greenX"?r.green.x:e==="greenY"?r.green.y:e==="blueX"?r.blue.x:e==="blueY"?r.blue.y:0}updateStringParameter(t,e,r){}updateColorParameter(t,e,r){}getColorParameter(t,e){return 0}updateBooleanParameter(t,e,r){}getNetworkSyncData(t){const e=t;return{rX:e.red.x,rY:e.red.y,gX:e.green.x,gY:e.green.y,bX:e.blue.x,bY:e.blue.y}}updateFromNetworkSyncData(t,e){const r=t;r.red.x=e.rX,r.red.y=e.rY,r.green.x=e.gX,r.green.y=e.gY,r.blue.x=e.bX,r.blue.y=e.bY}})})(gdjs||(gdjs={}));
//# sourceMappingURL=rgb-split-pixi-filter.js.map

// Effects/sepia-pixi-filter.js
var gdjs;(function(a){a.PixiFiltersTools.registerFilterCreator("Sepia",new class extends a.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(e,r){const t=new PIXI.ColorMatrixFilter;return t.sepia(!1),t}updatePreRender(e,r){}updateDoubleParameter(e,r,t){const i=e;r==="opacity"&&(i.alpha=a.PixiFiltersTools.clampValue(t,0,1))}getDoubleParameter(e,r){const t=e;return r==="opacity"?t.alpha:0}updateStringParameter(e,r,t){}updateColorParameter(e,r,t){}getColorParameter(e,r){return 0}updateBooleanParameter(e,r,t){}getNetworkSyncData(e){return{a:e.alpha}}updateFromNetworkSyncData(e,r){const t=e;t.alpha=r.a}})})(gdjs||(gdjs={}));
//# sourceMappingURL=sepia-pixi-filter.js.map

// Effects/shockwave-pixi-filter.js
var gdjs;(function(n){n.PixiFiltersTools.registerFilterCreator("Shockwave",new class extends n.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(r,e){return new PIXI.filters.ShockwaveFilter([.5,.5])}updatePreRender(r,e){const t=r;t.speed!==0&&(t.time+=e.getElapsedTime()/1e3),t.center[0]=Math.round(t._centerX*e.getWidth()),t.center[1]=Math.round(t._centerY*e.getHeight())}updateDoubleParameter(r,e,t){const i=r;e==="centerX"?i._centerX=t:e==="centerY"?i._centerY=t:e==="time"?i.time=t:e==="speed"?i.speed=t:e==="amplitude"?i.amplitude=t:e==="wavelength"?i.wavelength=t:e==="brightness"?i.brightness=t:e==="radius"&&(i.radius=t)}getDoubleParameter(r,e){const t=r;return e==="centerX"?t._centerX:e==="centerY"?t._centerY:e==="time"?t.time:e==="speed"?t.speed:e==="amplitude"?t.amplitude:e==="wavelength"?t.wavelength:e==="brightness"?t.brightness:e==="radius"?t.radius:0}updateStringParameter(r,e,t){}updateColorParameter(r,e,t){}getColorParameter(r,e){return 0}updateBooleanParameter(r,e,t){}getNetworkSyncData(r){const e=r;return{cx:e._centerX,cy:e._centerY,t:e.time,s:e.speed,a:e.amplitude,w:e.wavelength,b:e.brightness,r:e.radius}}updateFromNetworkSyncData(r,e){const t=r;t._centerX=e.cx,t._centerY=e.cy,t.time=e.t,t.speed=e.s,t.amplitude=e.a,t.wavelength=e.w,t.brightness=e.b,t.radius=e.r}})})(gdjs||(gdjs={}));
//# sourceMappingURL=shockwave-pixi-filter.js.map

// Effects/tilt-shift-pixi-filter.js
var gdjs;(function(i){i.PixiFiltersTools.registerFilterCreator("TiltShift",new class extends i.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(e,t){return new PIXI.filters.TiltShiftFilter}updatePreRender(e,t){}updateDoubleParameter(e,t,r){const l=e;t==="blur"?l.blur=r:t==="gradientBlur"&&(l.gradientBlur=r)}getDoubleParameter(e,t){const r=e;return t==="blur"?r.blur:t==="gradientBlur"?r.gradientBlur:0}updateStringParameter(e,t,r){}updateColorParameter(e,t,r){}getColorParameter(e,t){return 0}updateBooleanParameter(e,t,r){}getNetworkSyncData(e){const t=e;return{b:t.blur,gb:t.gradientBlur}}updateFromNetworkSyncData(e,t){const r=e;r.blur=t.b,r.gradientBlur=t.gb}})})(gdjs||(gdjs={}));
//# sourceMappingURL=tilt-shift-pixi-filter.js.map

// Effects/twist-pixi-filter.js
var gdjs;(function(s){s.PixiFiltersTools.registerFilterCreator("Twist",new class extends s.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(r,t){const e=new PIXI.filters.TwistFilter;return e.offset=new PIXI.Point(0,0),e}updatePreRender(r,t){const e=r;e.offset.x=Math.round(e._offsetX*t.getWidth()),e.offset.y=Math.round(e._offsetY*t.getHeight())}updateDoubleParameter(r,t,e){const i=r;t==="radius"?i.radius=e:t==="angle"?i.angle=e:t==="padding"?i.padding=e:t==="offsetX"?i._offsetX=e:t==="offsetY"&&(i._offsetY=e)}getDoubleParameter(r,t){const e=r;return t==="radius"?e.radius:t==="angle"?e.angle:t==="padding"?e.padding:t==="offsetX"?e._offsetX:t==="offsetY"?e._offsetY:0}updateStringParameter(r,t,e){}updateColorParameter(r,t,e){}getColorParameter(r,t){return 0}updateBooleanParameter(r,t,e){}getNetworkSyncData(r){const t=r;return{r:t.radius,a:t.angle,p:t.padding,ox:t._offsetX,oy:t._offsetY}}updateFromNetworkSyncData(r,t){const e=r;e.radius=t.r,e.angle=t.a,e.padding=t.p,e._offsetX=t.ox,e._offsetY=t.oy}})})(gdjs||(gdjs={}));
//# sourceMappingURL=twist-pixi-filter.js.map

// Effects/zoom-blur-pixi-filter.js
var gdjs;(function(i){i.PixiFiltersTools.registerFilterCreator("ZoomBlur",new class extends i.PixiFiltersTools.PixiFilterCreator{makePIXIFilter(t,r){return new PIXI.filters.ZoomBlurFilter}updatePreRender(t,r){const e=t;e.center[0]=Math.round(e._centerX*r.getWidth()),e.center[1]=Math.round(e._centerY*r.getHeight())}updateDoubleParameter(t,r,e){const n=t;r==="centerX"?n._centerX=e:r==="centerY"?n._centerY=e:r==="innerRadius"?n.innerRadius=e:r==="strength"?n.strength=i.PixiFiltersTools.clampValue(e/10,0,20):r==="padding"&&(n.padding=e)}getDoubleParameter(t,r){const e=t;return r==="centerX"?e._centerX:r==="centerY"?e._centerY:r==="innerRadius"?e.innerRadius:r==="strength"?e.strength:r==="padding"?e.padding:0}updateStringParameter(t,r,e){}updateColorParameter(t,r,e){}getColorParameter(t,r){return 0}updateBooleanParameter(t,r,e){}getNetworkSyncData(t){const r=t;return{cx:r._centerX,cy:r._centerY,ir:r.innerRadius,s:r.strength,p:r.padding}}updateFromNetworkSyncData(t,r){const e=t;e._centerX=r.cx,e._centerY=r.cy,e.innerRadius=r.ir,e.strength=r.s,e.padding=r.p}})})(gdjs||(gdjs={}));
//# sourceMappingURL=zoom-blur-pixi-filter.js.map

