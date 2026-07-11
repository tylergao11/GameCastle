function pixelIndex(width, x, y) { return (y * width + x) * 4; }

export function alphaBounds(image, threshold = 8) {
  let left = image.width, right = -1, top = image.height, bottom = -1;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (image.data[pixelIndex(image.width, x, y) + 3] > threshold) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  return right < 0 ? null : { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
}

export function cropToAlpha(image, options = {}) {
  const bounds = alphaBounds(image, options.threshold ?? 8);
  if (!bounds) return { image: { width: 1, height: 1, data: new Uint8ClampedArray(4) }, bounds: null };
  const padding = Math.max(0, Math.round(options.padding ?? 0));
  const left = Math.max(0, bounds.left - padding), top = Math.max(0, bounds.top - padding);
  const right = Math.min(image.width - 1, bounds.right + padding), bottom = Math.min(image.height - 1, bounds.bottom + padding);
  const width = right - left + 1, height = bottom - top + 1, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = pixelIndex(image.width, left + x, top + y), to = pixelIndex(width, x, y);
    data[to] = image.data[from]; data[to + 1] = image.data[from + 1]; data[to + 2] = image.data[from + 2]; data[to + 3] = image.data[from + 3];
  }
  return { image: { width, height, data }, bounds: { left, top, right, bottom, width, height } };
}

export function solidifyClosedLineArt(image, options = {}) {
  const threshold = options.threshold ?? 8, width = image.width, height = image.height;
  const data = new Uint8ClampedArray(image.data), outside = new Uint8Array(width * height), queue = [];
  function visit(index) { if (!outside[index] && data[index * 4 + 3] <= threshold) { outside[index] = 1; queue.push(index); } }
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor], x = index % width, y = Math.floor(index / width);
    if (x > 0) visit(index - 1); if (x + 1 < width) visit(index + 1); if (y > 0) visit(index - width); if (y + 1 < height) visit(index + width);
  }
  for (let index = 0; index < width * height; index++) if (!outside[index]) data[index * 4 + 3] = 255;
  return { width, height, data };
}

export function removeLightEdgeBackground(image, options = {}) {
  const threshold = options.threshold ?? 235, width = image.width, height = image.height;
  const data = new Uint8ClampedArray(image.data), visited = new Uint8Array(width * height), queue = [];
  function isLight(index) { const at = index * 4; return data[at + 3] > 0 && data[at] >= threshold && data[at + 1] >= threshold && data[at + 2] >= threshold; }
  function visit(index) { if (!visited[index] && isLight(index)) { visited[index] = 1; queue.push(index); } }
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor], x = index % width, y = Math.floor(index / width);
    if (x > 0) visit(index - 1); if (x + 1 < width) visit(index + 1); if (y > 0) visit(index - width); if (y + 1 < height) visit(index + width);
  }
  queue.forEach((index) => { data[index * 4 + 3] = 0; });
  return { width, height, data, removedPixels: queue.length };
}

export function inspectLocalRaster(image, options = {}) {
  const threshold = options.threshold ?? 8, bounds = alphaBounds(image, threshold), total = image.width * image.height;
  let opaque = 0;
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] > threshold) opaque++;
  return { empty: !bounds, bounds, opaquePixels: opaque, coverage: total ? opaque / total : 0, needsTransparentBackground: opaque === total };
}
