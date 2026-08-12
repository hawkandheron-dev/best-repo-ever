/**
 * Source-image loading and part extraction for the Rig Studio.
 *
 * Deliberately NOT built on `src/spriteEditor/spriteUtils.js`: that module models a
 * sprite as a 32×32 grid of CSS colour strings, which is right for the pixel
 * editor and wrong here on three counts — it downscales any input to 32 px, a
 * 1024² part would become a million strings, and its FileReader → data-URL → Image
 * path decodes on the main thread. `createImageBitmap` decodes off-thread and
 * hands back something directly drawable.
 */

/** Decode a user-selected file into an ImageBitmap. */
export async function loadImageFile(file) {
  if (!file) throw new Error('No file given');
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image`);
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error(`Could not decode ${file.name}`);
  }
}

/** Draw a bitmap into a fresh canvas so it can be read back pixel by pixel. */
export function bitmapToCanvas(bitmap) {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return canvas;
}

/**
 * Cut a polygon out of the source image into its own tightly-cropped canvas.
 *
 * `polygon` is a flat list of {x, y} in source-image pixels.  Returns the cropped
 * canvas plus the offset it was taken from, which the caller needs in order to
 * convert a pivot picked on the source into a pivot inside the part.
 *
 * `feather` softens the cut edge by a pixel or two. Fresco and marble have no hard
 * outlines, so a razor-sharp polygon edge reads as cut-out paper; a slight feather
 * lets parts sit against each other without a visible seam.
 */
export function extractPolygon(sourceCanvas, polygon, { feather = 1.5, padding = 2 } = {}) {
  if (!polygon || polygon.length < 3) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polygon) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  minX = Math.max(0, Math.floor(minX) - padding);
  minY = Math.max(0, Math.floor(minY) - padding);
  maxX = Math.min(sourceCanvas.width, Math.ceil(maxX) + padding);
  maxY = Math.min(sourceCanvas.height, Math.ceil(maxY) + padding);

  const w = maxX - minX;
  const h = maxY - minY;
  if (w <= 0 || h <= 0) return null;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');

  // Clip to the polygon, then draw the source through it.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(polygon[0].x - minX, polygon[0].y - minY);
  for (let i = 1; i < polygon.length; i++) {
    ctx.lineTo(polygon[i].x - minX, polygon[i].y - minY);
  }
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(sourceCanvas, -minX, -minY);
  ctx.restore();

  if (feather > 0) applyEdgeFeather(out, feather);

  return { canvas: out, offset: [minX, minY], width: w, height: h };
}

/**
 * Soften a cut edge by fading alpha near the boundary.
 *
 * Uses `destination-in` with a blurred copy of the existing alpha, which is far
 * cheaper than a per-pixel distance transform and good enough at these sizes.
 */
function applyEdgeFeather(canvas, radius) {
  const mask = document.createElement('canvas');
  mask.width = canvas.width;
  mask.height = canvas.height;
  const mctx = mask.getContext('2d');
  mctx.filter = `blur(${radius}px)`;
  mctx.drawImage(canvas, 0, 0);

  const ctx = canvas.getContext('2d');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Extract using an 8-bit mask (what GrabCut produces) rather than a polygon.
 * `mask` is a Uint8Array the size of the source, non-zero meaning foreground.
 */
export function extractMask(sourceCanvas, mask, { feather = 1.5, padding = 2 } = {}) {
  const { width, height } = sourceCanvas;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX === Infinity) return null;

  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  ctx.drawImage(sourceCanvas, -minX, -minY);

  const img = ctx.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[(y + minY) * width + (x + minX)]) {
        img.data[(y * w + x) * 4 + 3] = 0;
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  if (feather > 0) applyEdgeFeather(out, feather);

  return { canvas: out, offset: [minX, minY], width: w, height: h };
}

/** Trim fully transparent margins, returning the canvas and how much came off. */
export function trimAlpha(canvas) {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, width, height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { canvas, offset: [0, 0] };

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  if (w === width && h === height) return { canvas, offset: [0, 0] };

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d').drawImage(canvas, -minX, -minY);
  return { canvas: out, offset: [minX, minY] };
}

/** Is a point inside a polygon? Ray casting; used for hit-testing existing parts. */
export function pointInPolygon(polygon, x, y) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
