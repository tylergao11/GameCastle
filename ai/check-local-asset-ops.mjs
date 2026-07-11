import assert from 'node:assert';
import { alphaBounds, cropToAlpha, inspectLocalRaster, removeLightEdgeBackground, solidifyClosedLineArt } from '../shared/local-asset-ops.mjs';

function image(width, height, alphaPixels) {
  const data = new Uint8ClampedArray(width * height * 4);
  alphaPixels.forEach(([x, y]) => { data[(y * width + x) * 4 + 3] = 255; });
  return { width, height, data };
}

const sparse = image(8, 8, [[2, 3], [4, 5]]);
assert.deepEqual(alphaBounds(sparse), { left: 2, top: 3, right: 4, bottom: 5, width: 3, height: 3 });
const cropped = cropToAlpha(sparse, { padding: 1 });
assert.equal(cropped.image.width, 5); assert.equal(cropped.image.height, 5);
assert.equal(cropped.image.data[(1 * 5 + 1) * 4 + 3], 255);
const ring = image(5, 5, [[1,1],[2,1],[3,1],[1,2],[3,2],[1,3],[2,3],[3,3]]);
const solid = solidifyClosedLineArt(ring);
assert.equal(solid.data[(2 * 5 + 2) * 4 + 3], 255, 'closed line art must become a solid silhouette');
const open = image(5, 5, [[1,1],[2,1],[3,1],[1,2],[1,3],[2,3],[3,3]]);
assert.equal(solidifyClosedLineArt(open).data[(2 * 5 + 2) * 4 + 3], 0, 'open line art must not invent a filled enclosure');
assert.equal(inspectLocalRaster(image(2, 2, [[0,0],[1,0],[0,1],[1,1]])).needsTransparentBackground, true);
const whitePaper = { width: 3, height: 3, data: new Uint8ClampedArray(3 * 3 * 4) };
for (let i = 0; i < whitePaper.data.length; i += 4) { whitePaper.data[i] = 255; whitePaper.data[i + 1] = 255; whitePaper.data[i + 2] = 255; whitePaper.data[i + 3] = 255; }
whitePaper.data[(1 * 3 + 1) * 4] = 238; whitePaper.data[(1 * 3 + 1) * 4 + 1] = 73; whitePaper.data[(1 * 3 + 1) * 4 + 2] = 58;
const transparentPaper = removeLightEdgeBackground(whitePaper);
assert.equal(transparentPaper.removedPixels, 8); assert.equal(transparentPaper.data[3], 0); assert.equal(transparentPaper.data[(1 * 3 + 1) * 4 + 3], 255);
console.log('[LocalAssetOps] alpha crop, open/closed line handling, and raster inspection passed');
