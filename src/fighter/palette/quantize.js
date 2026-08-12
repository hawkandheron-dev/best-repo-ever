/**
 * Reducing a cropped painting to a character's palette.
 *
 * Operates on plain `{ width, height, data }` objects rather than real `ImageData`,
 * so the same code runs in the browser and under vite-node in the kit builder.
 *
 * The order matters: mask the background, quantise, despeckle, then outline.
 * Despeckling before the outline stops the outline chasing noise; outlining before
 * despeckling would let the despeckler eat the outline.
 */

import { colorDistance, hexToRgb } from './color';

/** A blank image buffer of the given size. */
export function createImage(width, height) {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function cloneImage(img) {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

/**
 * Clear a light background by flood-filling inward from the edges.
 *
 * Frescoes and museum photographs put the figure against pale plaster or a light
 * backdrop, and a rectangular crop is mostly that backdrop — on the Aristotle head
 * the wall was the single largest colour in the sprite until it was removed. Flood
 * fill from the border rather than thresholding globally, so a pale forehead in the
 * middle of the face is never mistaken for background.
 */
export function maskBackground(img, { threshold = 214, blueThreshold = 200 } = {}) {
  const out = cloneImage(img);
  const { width, height, data } = out;
  const isBackground = (i) => data[i] > threshold && data[i + 1] > threshold && data[i + 2] > blueThreshold;

  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) stack.push(x, 0, x, height - 1);
  for (let y = 0; y < height; y++) stack.push(0, y, width - 1, y);

  while (stack.length > 0) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const k = y * width + x;
    if (seen[k]) continue;
    const i = k * 4;
    if (!isBackground(i)) continue;
    seen[k] = 1;
    data[i + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return out;
}

/**
 * Map every opaque pixel to its nearest palette target.
 * Returns the quantised image plus how many pixels landed on each target, which is
 * how you notice a role that is doing nothing or swallowing everything.
 */
export function quantiseToTargets(img, targets, { alphaCutoff = 110 } = {}) {
  if (targets.length === 0) throw new Error('quantiseToTargets needs at least one target');
  const out = createImage(img.width, img.height);
  const usage = new Map();

  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] < alphaCutoff) continue;
    const px = [img.data[i], img.data[i + 1], img.data[i + 2]];

    let best = targets[0];
    let bestDist = Infinity;
    for (const target of targets) {
      const d = colorDistance(px, target.rgb);
      if (d < bestDist) {
        bestDist = d;
        best = target;
      }
    }
    usage.set(best.name, (usage.get(best.name) ?? 0) + 1);
    out.data[i] = best.rgb[0];
    out.data[i + 1] = best.rgb[1];
    out.data[i + 2] = best.rgb[2];
    out.data[i + 3] = 255;
  }
  return { image: out, usage };
}

/**
 * Remove isolated pixels by majority vote among their neighbours.
 *
 * Nearest-neighbour quantisation of a smooth painted gradient scatters stray pixels.
 * At very small sizes that reads as texture; by 48px it reads as dirt. Replacing a
 * pixel whose colour no neighbour shares with the most common neighbour colour
 * cleans it up without touching genuine edges, where neighbours agree.
 *
 * Two passes by default: one sweep leaves pairs of adjacent speckles alive.
 */
export function despeckle(img, { passes = 2 } = {}) {
  let current = cloneImage(img);

  for (let pass = 0; pass < passes; pass++) {
    const next = cloneImage(current);
    const { width, height, data } = current;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] === 0) continue;

        const key = (j) => `${data[j]},${data[j + 1]},${data[j + 2]}`;
        const mine = key(i);
        const counts = new Map();
        let sameAsMine = 0;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const j = (ny * width + nx) * 4;
            if (data[j + 3] === 0) continue;
            const k = key(j);
            counts.set(k, (counts.get(k) ?? 0) + 1);
            if (k === mine) sameAsMine++;
          }
        }

        // Only touch pixels no neighbour agrees with — genuine edges are safe.
        if (sameAsMine > 0 || counts.size === 0) continue;
        let winner = null;
        let winnerCount = 0;
        for (const [k, c] of counts) {
          if (c > winnerCount) {
            winnerCount = c;
            winner = k;
          }
        }
        if (winnerCount < 3) continue;
        const [r, g, b] = winner.split(',').map(Number);
        next.data[i] = r;
        next.data[i + 1] = g;
        next.data[i + 2] = b;
      }
    }
    current = next;
  }
  return current;
}

/**
 * Paint a one-pixel outline wherever an opaque pixel meets transparency or the
 * image border. This is what makes a small sprite read against any stage background;
 * without it the silhouette dissolves into whatever is behind it.
 */
export function addOutline(img, outlineHex) {
  const outline = hexToRgb(outlineHex);
  const out = cloneImage(img);
  const { width, height, data } = img;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] === 0) continue;

      let onEdge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) { onEdge = true; break; }
        if (data[(ny * width + nx) * 4 + 3] === 0) { onEdge = true; break; }
      }
      if (!onEdge) continue;
      out.data[i] = outline[0];
      out.data[i + 1] = outline[1];
      out.data[i + 2] = outline[2];
    }
  }
  return out;
}

/** Tight bounding box of opaque pixels, or null when the image is empty. */
export function opaqueBounds(img) {
  const { width, height, data } = img;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Copy a sub-rectangle into a new image. */
export function cropImage(img, { x, y, width, height }) {
  const out = createImage(width, height);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const src = ((y + row) * img.width + (x + col)) * 4;
      const dst = (row * width + col) * 4;
      out.data[dst] = img.data[src];
      out.data[dst + 1] = img.data[src + 1];
      out.data[dst + 2] = img.data[src + 2];
      out.data[dst + 3] = img.data[src + 3];
    }
  }
  return out;
}

/**
 * The whole reduction, in the one order that works.
 * `img` should already be downsampled to the target sprite size.
 */
export function spriteify(img, targets, outlineHex, options = {}) {
  const masked = options.skipMask ? img : maskBackground(img, options.mask);
  const { image, usage } = quantiseToTargets(masked, targets, options);
  const cleaned = despeckle(image, options.despeckle);
  const outlined = addOutline(cleaned, outlineHex);
  return { image: outlined, usage };
}
