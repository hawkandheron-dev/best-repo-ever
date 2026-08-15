/**
 * The `mews.parts` format — body and garment sprites drawn once, coloured per character.
 *
 * A part is NOT a picture. It is a grid of INK indices: every pixel names a material and
 * a stop on that material's ramp — `skin.base`, `outfitP.shadow`, `outline` — and never
 * an actual colour. A kit's palette turns the same drawing into Aristotle's blue himation
 * or Heraclitus's mauve tunic without either being redrawn.
 *
 * That indirection is the whole point of the roster. A dozen philosophers wearing
 * variations on the same draped rectangle is a dozen palettes over a handful of shapes,
 * not a dozen sprite sheets. It also means a palette edit in the pigment card reaches
 * the whole figure, not just the head cut from a painting.
 *
 * Stored as one character per pixel, so a part is legible and diffable in the source
 * tree. A reviewer can see a sleeve change in a pull request; they could not see it in
 * base64.
 *
 * Authoring convention, inherited from the rig and easy to get backwards: parts are drawn
 * in REST ORIENTATION — an upper arm hangs down, so you draw a vertical arm. The renderer
 * counter-rotates by the bone's accumulated rest angle. Drawing along the bone's local
 * axis instead would be tidier for the maths and much harder for a person.
 */

import { DEFAULT_SKELETON, Z, PX_PER_UNIT } from '../rig/rigSchema';

export const PARTS_FORMAT = 'mews.parts';
export const PARTS_VERSION = 1;

/**
 * The ink legend.
 *
 * Three stops per material, plus the three colours that are not ramps. Chosen so a part
 * reads as a picture in a monospace editor: digits climb through the body materials,
 * letters through the garments, and the punctuation is what you would expect it to be.
 */
export const INKS = {
  '.': null,
  '#': { role: 'outline' },
  1: { material: 'skin', stop: 'shadow' },
  2: { material: 'skin', stop: 'base' },
  3: { material: 'skin', stop: 'light' },
  4: { material: 'hair', stop: 'shadow' },
  5: { material: 'hair', stop: 'base' },
  6: { material: 'hair', stop: 'light' },
  7: { material: 'outfitP', stop: 'shadow' },
  8: { material: 'outfitP', stop: 'base' },
  9: { material: 'outfitP', stop: 'light' },
  a: { material: 'outfitS', stop: 'shadow' },
  b: { material: 'outfitS', stop: 'base' },
  c: { material: 'outfitS', stop: 'light' },
  d: { material: 'outfitT', stop: 'shadow' },
  e: { material: 'outfitT', stop: 'base' },
  f: { material: 'outfitT', stop: 'light' },
  x: { role: 'accent' },
  z: { role: 'element' },
};

export const TRANSPARENT = '.';

/**
 * Display order, stated rather than derived.
 *
 * `Object.keys` puts the digit keys first whatever order they were written in — they are
 * integer-like — which scatters the transparency and outline chips into the middle of the
 * garment ramps. An ink palette has to read as ramps.
 */
export const INK_CHARS = [
  '.', '#', 'x', 'z',
  '1', '2', '3',
  '4', '5', '6',
  '7', '8', '9',
  'a', 'b', 'c',
  'd', 'e', 'f',
];

/** Human labels, for a palette strip that has to be picked from rather than memorised. */
export const INK_LABELS = {
  '.': 'erase', '#': 'outline', x: 'accent', z: 'element',
  1: 'skin shadow', 2: 'skin', 3: 'skin light',
  4: 'hair shadow', 5: 'hair', 6: 'hair light',
  7: 'garment shadow', 8: 'garment', 9: 'garment light',
  a: 'under shadow', b: 'under', c: 'under light',
  d: 'trim shadow', e: 'trim', f: 'trim light',
};

/** A bone's first drawable child — the joint its part has to reach. */
export function firstChild(boneId) {
  return DEFAULT_SKELETON.find(
    (b) => b.parent === boneId && !b.id.startsWith('fx.') && b.id !== 'prop',
  ) ?? null;
}

/** Bone length in rig units: the distance to its first drawable child. */
export function boneLength(boneId) {
  const child = firstChild(boneId);
  return child ? Math.hypot(child.pos[0], child.pos[1]) : null;
}

/**
 * Where a bone's child joint sits relative to its origin, in SCREEN pixels — x right,
 * y down — with the bone at its rest angle.
 *
 * Not simply "length along local +x". That holds for limbs, whose children sit at
 * [46, 0], and is flatly wrong for the spine, whose children sit at [2, 56]: assuming it
 * drew the torso guide pointing sideways out of the hip. The child offset is expressed in
 * the bone's own frame, so rotating it by the bone's accumulated rest angle gives the
 * real direction for both.
 */
export function childOffsetPx(boneId) {
  const child = firstChild(boneId);
  if (!child) return null;
  const r = (restAngle(boneId) * Math.PI) / 180;
  const [ox, oy] = child.pos;
  return [
    (ox * Math.cos(r) - oy * Math.sin(r)) * PX_PER_UNIT,
    -(ox * Math.sin(r) + oy * Math.cos(r)) * PX_PER_UNIT,
  ];
}

/** A bone's accumulated rest angle, walking up the parent chain. */
export function restAngle(boneId) {
  let angle = 0;
  let id = boneId;
  while (id) {
    const bone = DEFAULT_SKELETON.find((b) => b.id === id);
    if (!bone) break;
    angle += bone.rest;
    id = bone.parent;
  }
  return angle;
}

const px = (units) => Math.round(units * PX_PER_UNIT);

/**
 * The canonical slots: one drawable part per visible bone, plus the swap-in fist and the
 * two garment panels.
 *
 * `span` is the bone's own length in pixels — the distance the drawing has to cover to
 * reach its child joint — and `w`/`h` are the canvas, deliberately larger. A garment
 * flares past its bone, a fist is wider than its wrist, and a canvas cropped to the
 * skeleton would make every silhouette a capsule again, which is exactly the problem
 * these parts exist to solve.
 *
 * `pivot` is where the bone origin sits on the canvas, in pixels from the top-left. Every
 * part hangs from that point, so it is the one coordinate that has to be right.
 */
function slot(id, bone, z, { w, h, pivotX, pivotY, group, label }) {
  const length = boneLength(bone);
  const reach = childOffsetPx(bone);
  return {
    id,
    bone,
    z,
    group,
    label,
    w,
    h,
    pivot: [pivotX, pivotY],
    span: length === null ? null : px(length),
    /** Screen-space vector from the pivot to the child joint; null for an extremity. */
    reach: reach === null ? null : [Math.round(reach[0]), Math.round(reach[1])],
    rest: restAngle(bone),
  };
}

export const PART_SLOTS = [
  // Far side first: the draw order is the z order, and seeing it listed that way is
  // what stops a near forearm being drawn behind a far one.
  slot('armB.up', 'armB.up', Z.ARM_B, { w: 22, h: 40, pivotX: 11, pivotY: 5, group: 'Far arm', label: 'Upper arm' }),
  slot('armB.fore', 'armB.fore', Z.ARM_B + 1, { w: 20, h: 34, pivotX: 10, pivotY: 4, group: 'Far arm', label: 'Forearm' }),
  slot('handB', 'handB', Z.ARM_B + 2, { w: 20, h: 22, pivotX: 10, pivotY: 4, group: 'Far arm', label: 'Hand' }),

  slot('legB.thigh', 'legB.thigh', Z.LEG_B, { w: 28, h: 58, pivotX: 14, pivotY: 6, group: 'Far leg', label: 'Thigh' }),
  slot('legB.shin', 'legB.shin', Z.LEG_B + 1, { w: 24, h: 54, pivotX: 12, pivotY: 4, group: 'Far leg', label: 'Shin' }),
  slot('footB', 'footB', Z.LEG_B + 2, { w: 30, h: 18, pivotX: 8, pivotY: 9, group: 'Far leg', label: 'Foot' }),

  slot('robeB', 'robeB', Z.ROBE_B, { w: 44, h: 44, pivotX: 22, pivotY: 4, group: 'Garment', label: 'Back panel' }),
  slot('torso', 'torso', Z.TORSO, { w: 52, h: 56, pivotX: 26, pivotY: 44, group: 'Body', label: 'Torso' }),

  slot('legF.thigh', 'legF.thigh', Z.LEG_F, { w: 30, h: 58, pivotX: 15, pivotY: 6, group: 'Near leg', label: 'Thigh' }),
  slot('legF.shin', 'legF.shin', Z.LEG_F + 1, { w: 26, h: 54, pivotX: 13, pivotY: 4, group: 'Near leg', label: 'Shin' }),
  slot('footF', 'footF', Z.LEG_F + 2, { w: 32, h: 18, pivotX: 9, pivotY: 9, group: 'Near leg', label: 'Foot' }),

  slot('robeA', 'robeA', Z.ROBE_F, { w: 52, h: 60, pivotX: 26, pivotY: 5, group: 'Garment', label: 'Front panel' }),

  slot('armF.up', 'armF.up', Z.ARM_F, { w: 24, h: 40, pivotX: 12, pivotY: 5, group: 'Near arm', label: 'Upper arm' }),
  slot('armF.fore', 'armF.fore', Z.ARM_F + 1, { w: 22, h: 34, pivotX: 11, pivotY: 4, group: 'Near arm', label: 'Forearm' }),
  slot('handF', 'handF', Z.HAND_F, { w: 22, h: 24, pivotX: 11, pivotY: 4, group: 'Near arm', label: 'Hand' }),
  // The fist shares the hand's bone: the punch clips swap one for the other.
  slot('fistF', 'handF', Z.HAND_F, { w: 24, h: 24, pivotX: 12, pivotY: 4, group: 'Near arm', label: 'Fist' }),
];

export const findSlot = (id) => PART_SLOTS.find((s) => s.id === id) ?? null;

/* ── Grids ─────────────────────────────────────────────────────────────────── */

/** An empty part: every pixel transparent. */
export function createPart(slotId) {
  const s = findSlot(slotId);
  if (!s) throw new Error(`Unknown part slot "${slotId}"`);
  return {
    id: slotId,
    bone: s.bone,
    z: s.z,
    pivot: [...s.pivot],
    w: s.w,
    h: s.h,
    rows: Array.from({ length: s.h }, () => TRANSPARENT.repeat(s.w)),
  };
}

export function createPartsDocument(overrides = {}) {
  return { format: PARTS_FORMAT, version: PARTS_VERSION, set: 'standard', parts: [], ...overrides };
}

/** Read one pixel's ink, or `.` when the coordinate is off the grid. */
export function inkAt(part, x, y) {
  if (x < 0 || y < 0 || x >= part.w || y >= part.h) return TRANSPARENT;
  return part.rows[y][x];
}

/** A copy of `part` with one pixel set. Pure, so an editor can keep an undo stack. */
export function setInk(part, x, y, ink) {
  if (x < 0 || y < 0 || x >= part.w || y >= part.h) return part;
  if (!(ink in INKS)) throw new Error(`Unknown ink "${ink}"`);
  if (part.rows[y][x] === ink) return part;
  const rows = [...part.rows];
  rows[y] = rows[y].slice(0, x) + ink + rows[y].slice(x + 1);
  return { ...part, rows };
}

/** Flood-fill from one pixel across every orthogonally connected pixel of its ink. */
export function fillInk(part, x, y, ink) {
  const from = inkAt(part, x, y);
  if (from === ink) return part;
  const rows = part.rows.map((r) => r.split(''));
  const stack = [[x, y]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= part.w || cy >= part.h) continue;
    if (rows[cy][cx] !== from) continue;
    rows[cy][cx] = ink;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return { ...part, rows: rows.map((r) => r.join('')) };
}

/**
 * Paint the outline ink onto every filled pixel that touches transparency or the canvas
 * edge — the same rule the head sprites use, so a drawn limb and a cut face carry the
 * same weight of line.
 */
export function autoOutline(part) {
  const rows = part.rows.map((r) => r.split(''));
  for (let y = 0; y < part.h; y++) {
    for (let x = 0; x < part.w; x++) {
      if (rows[y][x] === TRANSPARENT) continue;
      const exposed = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx < 0 || ny < 0 || nx >= part.w || ny >= part.h || part.rows[ny][nx] === TRANSPARENT;
      });
      if (exposed) rows[y][x] = '#';
    }
  }
  return { ...part, rows: rows.map((r) => r.join('')) };
}

/** Mirror left-to-right. Useful for a symmetrical garment panel; wrong for a hand. */
export function mirrorPart(part) {
  return {
    ...part,
    pivot: [part.w - 1 - part.pivot[0], part.pivot[1]],
    rows: part.rows.map((r) => r.split('').reverse().join('')),
  };
}

/** How many pixels of each ink a part uses — the fastest way to spot an unused stop. */
export function inkUsage(part) {
  const counts = new Map();
  for (const row of part.rows) {
    for (const ch of row) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  return counts;
}

export const isEmpty = (part) => part.rows.every((r) => r === TRANSPARENT.repeat(part.w));

/* ── Colouring ─────────────────────────────────────────────────────────────── */

const STOP_AT = { light: 0, base: 1, shadow: 2 };

/**
 * Turn a part into pixels, given one character's ramps and palette.
 *
 * This is the payoff: the drawing is authored once and every kit renders it in its own
 * colours. Returns the plain `{ width, height, data }` the rest of the palette pipeline
 * uses, so a drawn part and a quantised head can be packed into the same sheet.
 */
export function renderPart(part, ramps, palette) {
  const data = new Uint8ClampedArray(part.w * part.h * 4);
  for (let y = 0; y < part.h; y++) {
    for (let x = 0; x < part.w; x++) {
      const ink = part.rows[y][x];
      const spec = INKS[ink];
      if (!spec) continue;
      const rgb = spec.role
        ? hexToRgbLocal(palette[spec.role])
        : ramps[spec.material]?.[STOP_AT[spec.stop]];
      if (!rgb) continue;
      const i = (y * part.w + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
  return { width: part.w, height: part.h, data };
}

// Local rather than imported: this module is inlined into the studio page, where a
// second copy of the colour helpers would be one more thing able to drift.
function hexToRgbLocal(hex) {
  const s = String(hex).replace(/^#/, '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

/* ── Validation ────────────────────────────────────────────────────────────── */

/**
 * Check a parts document. Reports rather than throws, because the studio calls this on
 * every stroke.
 */
export function validateParts(doc) {
  const problems = [];
  if (!doc || typeof doc !== 'object') return ['Parts document is not an object'];
  if (doc.format !== PARTS_FORMAT) problems.push(`Unexpected format "${doc.format}"`);
  if (doc.version !== PARTS_VERSION) problems.push(`Version ${doc.version} (expected ${PARTS_VERSION})`);
  if (!Array.isArray(doc.parts)) return [...problems, 'parts is not an array'];

  const seen = new Set();
  for (const part of doc.parts) {
    const who = part.id || '(unnamed)';
    if (seen.has(part.id)) problems.push(`Duplicate part "${part.id}"`);
    seen.add(part.id);

    const s = findSlot(part.id);
    if (!s) { problems.push(`${who} is not a known part slot`); continue; }
    if (part.bone !== s.bone) problems.push(`${who} names bone "${part.bone}" but its slot is on "${s.bone}"`);
    if (!DEFAULT_SKELETON.some((b) => b.id === part.bone)) problems.push(`${who} names a bone not in the skeleton`);

    if (!Array.isArray(part.rows) || part.rows.length !== part.h) {
      problems.push(`${who} has ${part.rows?.length ?? 0} rows but claims a height of ${part.h}`);
      continue;
    }
    const wrong = part.rows.findIndex((r) => r.length !== part.w);
    if (wrong >= 0) problems.push(`${who} row ${wrong} is ${part.rows[wrong].length} wide, expected ${part.w}`);

    for (let y = 0; y < part.rows.length; y++) {
      for (const ch of part.rows[y]) {
        if (!(ch in INKS)) { problems.push(`${who} row ${y} uses unknown ink "${ch}"`); break; }
      }
    }

    // A pivot off the canvas puts the bone origin outside the drawing, and the part
    // hangs somewhere it was never drawn to be.
    const [pvx, pvy] = part.pivot ?? [];
    if (!Number.isFinite(pvx) || !Number.isFinite(pvy) || pvx < 0 || pvy < 0 || pvx >= part.w || pvy >= part.h) {
      problems.push(`${who} pivot ${JSON.stringify(part.pivot)} is outside its ${part.w}x${part.h} canvas`);
    }
  }
  return problems;
}
