export type LocalRaster = { width: number; height: number; data: Uint8ClampedArray }
export function alphaBounds(image: LocalRaster, threshold?: number): { left: number; top: number; right: number; bottom: number; width: number; height: number } | null
export function cropToAlpha(image: LocalRaster, options?: { threshold?: number; padding?: number }): { image: LocalRaster; bounds: { left: number; top: number; right: number; bottom: number; width: number; height: number } | null }
export function solidifyClosedLineArt(image: LocalRaster, options?: { threshold?: number }): LocalRaster
export function removeLightEdgeBackground(image: LocalRaster, options?: { threshold?: number }): LocalRaster & { removedPixels: number }
export function inspectLocalRaster(image: LocalRaster, options?: { threshold?: number }): { empty: boolean; bounds: ReturnType<typeof alphaBounds>; opaquePixels: number; coverage: number; needsTransparentBackground: boolean }
