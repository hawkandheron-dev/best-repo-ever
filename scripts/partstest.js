/**
 * Headless tests for the drawn-part format. Run with `npm run partstest`.
 *
 * Parts are hand-drawn data with geometry the rig has to agree with, which is exactly the
 * combination that rots quietly: a pivot a few pixels out puts a forearm through an elbow
 * and nothing throws.
 */

import {
  INKS, INK_CHARS, INK_LABELS, TRANSPARENT, PART_SLOTS, findSlot,
  createPart, createPartsDocument, inkAt, setInk, fillInk, autoOutline, mirrorPart,
  inkUsage, isEmpty, renderPart, validateParts, boneLength, restAngle, childOffsetPx, firstChild,
} from '../src/fighter/parts/partSchema.js';
import { DEFAULT_SKELETON } from '../src/fighter/rig/rigSchema.js';
import { createPalette, DEFAULT_BOOST } from '../src/fighter/palette/paletteSchema.js';
import { buildRamps } from '../src/fighter/palette/ramp.js';
import { rgbToHex } from '../src/fighter/palette/color.js';

let passed = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

/* ── Inks ─────────────────────────────────────────────────────────────────── */

check('every ink is displayable and every displayed ink is real',
  INK_CHARS.length === Object.keys(INKS).length && INK_CHARS.every((c) => c in INKS));
check('every ink has a label', INK_CHARS.every((c) => INK_LABELS[c]));
check('the display order is not the object key order', INK_CHARS[0] === TRANSPARENT);
check('every material ink names a real stop',
  Object.values(INKS).every((v) => !v || v.role || ['light', 'base', 'shadow'].includes(v.stop)));
check('every material ink names a material with a ramp', (() => {
  const ramps = buildRamps(createPalette(), DEFAULT_BOOST);
  return Object.values(INKS).every((v) => !v || v.role || v.material in ramps);
})());
check('the three non-ramp inks are the palette roles that are not materials', (() => {
  const roles = Object.values(INKS).filter((v) => v?.role).map((v) => v.role).sort();
  return roles.join() === 'accent,element,outline';
})());

/* ── Slot geometry ────────────────────────────────────────────────────────── */

check('slot ids are unique', new Set(PART_SLOTS.map((s) => s.id)).size === PART_SLOTS.length);
check('every slot names a bone in the skeleton',
  PART_SLOTS.every((s) => DEFAULT_SKELETON.some((b) => b.id === s.bone)));
check('every canvas is positive', PART_SLOTS.every((s) => s.w > 0 && s.h > 0));
check('every pivot is inside its canvas', PART_SLOTS.every(
  (s) => s.pivot[0] >= 0 && s.pivot[1] >= 0 && s.pivot[0] < s.w && s.pivot[1] < s.h,
));

// The constraint that actually matters: if the child joint falls off the canvas, the part
// physically cannot be drawn long enough to meet the next limb and the figure comes apart.
check('every child joint falls inside its canvas', PART_SLOTS.every((s) => {
  if (!s.reach) return true;
  const jx = s.pivot[0] + s.reach[0];
  const jy = s.pivot[1] + s.reach[1];
  return jx >= 0 && jy >= 0 && jx < s.w && jy < s.h;
}), PART_SLOTS.filter((s) => s.reach && (s.pivot[1] + s.reach[1] >= s.h || s.pivot[0] + s.reach[0] >= s.w)).map((s) => s.id).join(', '));

check('slots are listed in draw order', PART_SLOTS.every(
  (s, i) => i === 0 || s.z >= PART_SLOTS[i - 1].z,
));
check('the fist shares the hand bone, since the punch clips swap them',
  findSlot('fistF').bone === findSlot('handF').bone);

/* ── Bone direction ───────────────────────────────────────────────────────── */

// This was a real bug: assuming a bone points along its local +x drew the torso guide
// sideways out of the hip, because the spine's children sit along +y instead.
check('the torso reaches upward toward the neck', (() => {
  const [dx, dy] = childOffsetPx('torso');
  return dy < -20 && Math.abs(dx) < 6;
})());
check('the near upper arm reaches down and forward', (() => {
  const [dx, dy] = childOffsetPx('armF.up');
  return dy > 20 && dx > 2;
})());
check('a thigh reaches straight down', (() => {
  const [dx, dy] = childOffsetPx('legF.thigh');
  return dy > 40 && Math.abs(dx) < 8;
})());
check('an extremity has no child joint', childOffsetPx('handF') === null && firstChild('footF') === null);
check('rest angles accumulate through the parent chain', restAngle('armF.fore') === -95);
check('bone length matches the child offset', Math.round(boneLength('armF.up')) === 46);

/* ── Grids ────────────────────────────────────────────────────────────────── */

const blank = createPart('torso');
check('a new part matches its slot', blank.w === findSlot('torso').w && blank.rows.length === blank.h);
check('a new part is empty', isEmpty(blank));
check('every row is the declared width', blank.rows.every((r) => r.length === blank.w));

check('setInk is pure', (() => {
  const next = setInk(blank, 3, 4, '8');
  return inkAt(next, 3, 4) === '8' && inkAt(blank, 3, 4) === TRANSPARENT && next !== blank;
})());
check('setInk off the grid is a no-op', setInk(blank, -1, 0, '8') === blank);
check('setInk to the same ink returns the same object', setInk(blank, 3, 4, TRANSPARENT) === blank);
check('setInk rejects an unknown ink', (() => {
  try { setInk(blank, 0, 0, 'Q'); return false; } catch { return true; }
})());
check('inkAt off the grid reads as transparent', inkAt(blank, 999, 999) === TRANSPARENT);

check('fill covers a connected region and stops at its edge', (() => {
  let p = createPart('handF');
  for (let x = 0; x < p.w; x++) p = setInk(p, x, 3, '#');
  const filled = fillInk(p, 0, 0, '2');
  return inkAt(filled, 0, 0) === '2' && inkAt(filled, 0, 2) === '2'
    && inkAt(filled, 0, 3) === '#' && inkAt(filled, 0, 4) === TRANSPARENT;
})());
check('filling with the ink already there is a no-op', fillInk(blank, 0, 0, TRANSPARENT) === blank);

check('auto-outline rings a filled shape and leaves its middle alone', (() => {
  let p = createPart('handF');
  for (let y = 2; y < 8; y++) for (let x = 2; x < 8; x++) p = setInk(p, x, y, '2');
  const out = autoOutline(p);
  return inkAt(out, 2, 2) === '#' && inkAt(out, 4, 2) === '#' && inkAt(out, 4, 4) === '2';
})());
check('auto-outline treats the canvas edge as exposed', (() => {
  let p = createPart('handF');
  for (let x = 0; x < p.w; x++) p = setInk(p, x, 0, '2');
  return inkAt(autoOutline(p), 5, 0) === '#';
})());

check('mirroring flips the pixels and the pivot with them', (() => {
  const p = setInk(createPart('handF'), 1, 1, '2');
  const m = mirrorPart(p);
  return inkAt(m, p.w - 2, 1) === '2' && m.pivot[0] === p.w - 1 - p.pivot[0];
})());
check('mirroring twice is the identity', (() => {
  const p = setInk(createPart('handF'), 1, 1, '2');
  const back = mirrorPart(mirrorPart(p));
  return back.rows.join() === p.rows.join() && back.pivot[0] === p.pivot[0];
})());

check('ink usage counts every pixel', (() => {
  const p = setInk(createPart('handF'), 0, 0, '8');
  const counts = inkUsage(p);
  return counts.get('8') === 1 && counts.get(TRANSPARENT) === p.w * p.h - 1;
})());

/* ── Colouring ────────────────────────────────────────────────────────────── */

const palette = createPalette();
const ramps = buildRamps(palette, DEFAULT_BOOST);

check('a transparent pixel stays transparent', (() => {
  const img = renderPart(createPart('handF'), ramps, palette);
  return img.data.every((v) => v === 0);
})());
check('an ink renders as its material stop', (() => {
  const p = setInk(createPart('handF'), 0, 0, '8');
  const img = renderPart(p, ramps, palette);
  return rgbToHex([img.data[0], img.data[1], img.data[2]]) === rgbToHex(ramps.outfitP[1]) && img.data[3] === 255;
})());
check('the outline ink renders as the palette outline', (() => {
  const p = setInk(createPart('handF'), 0, 0, '#');
  const img = renderPart(p, ramps, palette);
  return rgbToHex([img.data[0], img.data[1], img.data[2]]) === palette.outline.toUpperCase();
})());
// The whole point: one drawing, many characters.
check('the same drawing renders differently for a different palette', (() => {
  const p = setInk(createPart('handF'), 0, 0, '8');
  const other = createPalette({ outfit: { primary: '#7A2E55', secondary: '#333333', tertiary: '#AA8844' } });
  const a = renderPart(p, ramps, palette);
  const b = renderPart(p, buildRamps(other, DEFAULT_BOOST), other);
  return a.data[0] !== b.data[0] || a.data[2] !== b.data[2];
})());
check('a rendered part is the size of its canvas', (() => {
  const img = renderPart(createPart('torso'), ramps, palette);
  return img.width === findSlot('torso').w && img.height === findSlot('torso').h;
})());

/* ── Validation ───────────────────────────────────────────────────────────── */

const doc = createPartsDocument({ parts: [setInk(createPart('torso'), 1, 1, '8')] });
check('a well-formed document validates clean', validateParts(doc).length === 0, validateParts(doc).join('; '));
check('a bad format is reported', validateParts({ ...doc, format: 'nope' }).some((p) => p.includes('format')));
check('a non-array parts list is reported', validateParts({ ...doc, parts: 'x' }).some((p) => p.includes('not an array')));
check('an unknown slot is reported',
  validateParts({ ...doc, parts: [{ ...doc.parts[0], id: 'elbow' }] }).some((p) => p.includes('not a known part slot')));
check('a bone that disagrees with the slot is reported',
  validateParts({ ...doc, parts: [{ ...doc.parts[0], bone: 'neck' }] }).some((p) => p.includes('names bone')));
check('an unknown ink is reported', (() => {
  const bad = { ...doc.parts[0], rows: [...doc.parts[0].rows] };
  bad.rows[0] = 'Q'.repeat(bad.w);
  return validateParts({ ...doc, parts: [bad] }).some((p) => p.includes('unknown ink'));
})());
check('a short row is reported', (() => {
  const bad = { ...doc.parts[0], rows: [...doc.parts[0].rows] };
  bad.rows[2] = '.';
  return validateParts({ ...doc, parts: [bad] }).some((p) => p.includes('wide'));
})());
check('a wrong row count is reported',
  validateParts({ ...doc, parts: [{ ...doc.parts[0], rows: doc.parts[0].rows.slice(0, 3) }] })
    .some((p) => p.includes('rows but claims')));
// A pivot off the canvas hangs the part from a point it was never drawn around.
check('a pivot outside the canvas is reported',
  validateParts({ ...doc, parts: [{ ...doc.parts[0], pivot: [999, 0] }] }).some((p) => p.includes('outside')));
check('a duplicate part is reported',
  validateParts({ ...doc, parts: [doc.parts[0], doc.parts[0]] }).some((p) => p.includes('Duplicate')));

/* ── Report ───────────────────────────────────────────────────────────────── */

const total = passed + failures.length;
if (failures.length > 0) {
  console.error(`\npartstest: ${passed}/${total} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`\npartstest: ${passed}/${total} passed\n`);
