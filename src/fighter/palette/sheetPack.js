/**
 * A shelf bin packer for the head sheet.
 *
 * Heads are all roughly the same size and there are at most a few dozen, so a shelf
 * packer — fill a row, start a new one when it's full — wastes a little space and is
 * trivially deterministic. Determinism matters more than tightness here: the build
 * must produce a byte-identical sheet from the same inputs, or every rebuild churns
 * the diff.
 */

/** Round up to the next power of two, so the sheet is GPU-friendly if it ever matters. */
function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Pack boxes into a sheet.
 *
 * Sorted by descending height then by id, which gives tidy shelves and — because the
 * id breaks every tie — a total order, so the same inputs always pack identically.
 *
 * @param items  [{ id, width, height }]
 * @returns { width, height, placements: [{ id, x, y, width, height }] }
 */
export function packSheet(items, { maxWidth = 512, padding = 1 } = {}) {
  if (items.length === 0) return { width: 0, height: 0, placements: [] };

  const sorted = [...items].sort((a, b) => b.height - a.height || (a.id < b.id ? -1 : 1));
  const widest = Math.max(...sorted.map((i) => i.width + padding * 2));
  const sheetWidth = Math.max(nextPowerOfTwo(widest), Math.min(maxWidth, nextPowerOfTwo(widest * 4)));

  const placements = [];
  let shelfY = padding;
  let shelfHeight = 0;
  let cursorX = padding;

  for (const item of sorted) {
    const w = item.width + padding;
    const h = item.height + padding;
    if (cursorX + w > sheetWidth - padding) {
      shelfY += shelfHeight;
      shelfHeight = 0;
      cursorX = padding;
    }
    placements.push({ id: item.id, x: cursorX, y: shelfY, width: item.width, height: item.height });
    cursorX += w;
    if (h > shelfHeight) shelfHeight = h;
  }

  return {
    width: sheetWidth,
    height: nextPowerOfTwo(shelfY + shelfHeight + padding),
    placements,
  };
}

/** Placement lookup by id. */
export function placementMap(packed) {
  return new Map(packed.placements.map((p) => [p.id, p]));
}
