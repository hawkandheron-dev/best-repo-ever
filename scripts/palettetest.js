/**
 * Headless palette / quantisation tests. Run with `npm run palettetest`.
 *
 * DOM-free: the palette modules operate on plain {width, height, data} buffers
 * rather than real ImageData precisely so they can be tested here and reused in the
 * browser without a second implementation.
 */

import {
  hexToRgb, rgbToHex, rgbToHsv, hexToHsv, hsvToHex,
  luminance, towardHue, colorDistance, darken, median,
} from '../src/fighter/palette/color.js';
import {
  createPalette, validatePalette, getRole, setRole,
  PALETTE_ROLES, MATERIALS, DEFAULT_BOOST, NO_BOOST,
} from '../src/fighter/palette/paletteSchema.js';
import {
  buildRamp, buildRamps, depthRamps, quantisationTargets, checkRamps, rampsToHex,
  deepenOutline, SPRITE_MATERIALS, DEPTH_FACTOR,
} from '../src/fighter/palette/ramp.js';
import {
  createKit, createKitsDocument, upsertKit, findKit, validateKits, findSheetOverlaps,
  ACCESSORY_KINDS,
} from '../src/fighter/palette/kitSchema.js';
import { packSheet, placementMap } from '../src/fighter/palette/sheetPack.js';
import { DEFAULT_SKELETON } from '../src/fighter/rig/rigSchema.js';
import { RECIPES } from '../art/recipes.js';
import {
  createImage, cloneImage, maskBackground, quantiseToTargets, despeckle,
  addOutline, opaqueBounds, cropImage, spriteify,
} from '../src/fighter/palette/quantize.js';

let passed = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};
const near = (a, b, eps = 1) => Math.abs(a - b) <= eps;

/* ── Colour ───────────────────────────────────────────────────────────────── */

check('hexToRgb parses six digits', hexToRgb('#3A2E22').join() === '58,46,34');
check('hexToRgb tolerates a missing hash', hexToRgb('3A2E22').join() === '58,46,34');
check('hexToRgb expands shorthand', hexToRgb('#F00').join() === '255,0,0');
check('hexToRgb rejects nonsense', (() => {
  try { hexToRgb('#zzzzzz'); return false; } catch { return true; }
})());
check('rgbToHex round-trips', rgbToHex(hexToRgb('#9FAFC1')) === '#9FAFC1');
check('rgbToHex clamps and rounds', rgbToHex([-5, 300, 127.6]) === '#00FF80');

check('hsv round-trips through rgb', (() => {
  for (const hex of ['#D3A175', '#9FAFC1', '#000000', '#FFFFFF', '#FF0000', '#00FF7F']) {
    if (hsvToHex(hexToHsv(hex)) !== hex.toUpperCase()) return false;
  }
  return true;
})());
check('grey has zero saturation', rgbToHsv([128, 128, 128])[1] === 0);
check('pure red sits at hue 0', near(rgbToHsv([255, 0, 0])[0], 0));
check('pure green sits at hue 120', near(rgbToHsv([0, 255, 0])[0], 120));
check('pure blue sits at hue 240', near(rgbToHsv([0, 0, 255])[0], 240));

check('luminance weights green heaviest', luminance([0, 255, 0]) > luminance([255, 0, 0]) && luminance([255, 0, 0]) > luminance([0, 0, 255]));

// Hue rotation must take the short way round the wheel, including across 0/360.
check('towardHue moves toward the target', near(towardHue(10, 40, 8), 18));
check('towardHue stops at the target', near(towardHue(36, 40, 8), 40));
check('towardHue wraps the short way', near(towardHue(350, 40, 8), 358));
check('towardHue goes down when the target is below', near(towardHue(300, 225, 10), 290));
check('towardHue crosses 0 downward', near(towardHue(5, 350, 10), 355));

check('colorDistance is zero for identical colours', colorDistance([1, 2, 3], [1, 2, 3]) === 0);
check('colorDistance punishes green most', colorDistance([0, 0, 0], [0, 10, 0]) > colorDistance([0, 0, 0], [10, 0, 0]));
check('darken lowers luminance', luminance(darken(hexToRgb('#9FAFC1'), 0.78)) < luminance(hexToRgb('#9FAFC1')));
check('median picks the middle', median([5, 1, 9, 3, 7]) === 5);
check('median of an empty array is zero', median([]) === 0);

/* ── Palette schema ───────────────────────────────────────────────────────── */

const palette = createPalette();
check('the default palette has ten roles', PALETTE_ROLES.length === 10, `got ${PALETTE_ROLES.length}`);
check('the default palette validates clean', validatePalette(palette).length === 0, validatePalette(palette).join('; '));
check('getRole reads a nested path', getRole(palette, 'outfit.tertiary') === '#C6A46A');
check('getRole reads a flat path', getRole(palette, 'outline') === '#3A2E22');

check('setRole does not mutate the original', (() => {
  const next = setRole(palette, 'skin.primary', '#123456');
  return getRole(next, 'skin.primary') === '#123456'
    && getRole(palette, 'skin.primary') === '#D3A175'
    && getRole(next, 'skin.secondary') === getRole(palette, 'skin.secondary');
})());
check('setRole handles a flat path', getRole(setRole(palette, 'accent', '#ABCDEF'), 'accent') === '#ABCDEF');

check('a missing role is reported', validatePalette({ ...palette, outline: undefined }).some((p) => p.includes('Outline')));
check('a bad hex is reported', validatePalette({ ...palette, accent: 'not-a-colour' }).some((p) => p.includes('not a hex')));

// The outline has to be the darkest thing or it reads as a stripe across the sprite.
check(
  'an outline lighter than a material is reported',
  validatePalette({ ...palette, outline: '#FFFFFF' }).some((p) => p.includes('not darker')),
);

// Two roles on the same colour silently merges two materials.
check(
  'duplicate roles are reported',
  validatePalette(setRole(palette, 'accent', palette.outfit.tertiary)).some((p) => p.includes('same colour')),
);
check(
  'a duplicate element colour is tolerated, since it is FX-only',
  validatePalette(setRole(palette, 'element', palette.accent)).length === 0,
);

/* ── Ramps ────────────────────────────────────────────────────────────────── */

check('a ramp has three stops', buildRamp('#D3A175', null).length === 3);
check(
  'a ramp descends from light to shadow',
  (() => {
    const [l, b, s] = buildRamp('#D3A175', null).map(luminance);
    return l > b && b > s;
  })(),
);
check(
  'an unboosted ramp uses the measured shadow verbatim',
  rgbToHex(buildRamp('#D3A175', '#A87F58')[2]) === '#A87F58',
);
check(
  'a boosted ramp derives its own shadow instead',
  rgbToHex(buildRamp('#D3A175', '#A87F58', { spread: 1.7 })[2]) !== '#A87F58',
);
check(
  'more spread widens the ramp',
  (() => {
    const narrow = buildRamp('#9FAFC1', null, { spread: 1 });
    const wide = buildRamp('#9FAFC1', null, { spread: 2 });
    return (luminance(wide[0]) - luminance(wide[2])) > (luminance(narrow[0]) - luminance(narrow[2]));
  })(),
);
check(
  'light drifts warm and shadow drifts cool',
  (() => {
    const [light, base, shadow] = buildRamp('#9FAFC1', null, { spread: 1.7 });
    const hb = rgbToHsv(base)[0];
    const hl = rgbToHsv(light)[0];
    const hs = rgbToHsv(shadow)[0];
    // Base is a blue around 210; light should move toward 40, shadow toward 225.
    return hl < hb && hs > hb;
  })(),
);

const ramps = buildRamps(palette, DEFAULT_BOOST);
check('every material gets a ramp', Object.keys(ramps).length === MATERIALS.length);
check('boosted default ramps are healthy', checkRamps(ramps).length === 0, checkRamps(ramps).join('; '));
check('rampsToHex names its stops', (() => {
  const hex = rampsToHex(ramps);
  return hex.skin.light && hex.skin.base && hex.skin.shadow;
})());

// The whole point of `separate`: measured fresco skin and hair collide.
const MEASURED_ARISTOTLE = createPalette({
  skin: { primary: '#D3A175', secondary: '#A87F58' },
  hair: { primary: '#B0926A', secondary: '#7E6544' },
  outfit: { primary: '#9FAFC1', secondary: '#856848', tertiary: '#C6A46A' },
  outline: '#695344',
  accent: '#91735A',
  element: '#E0CE8A',
});
const gapOf = (boost) => {
  const r = buildRamps(MEASURED_ARISTOTLE, boost);
  return Math.abs(luminance(r.skin[1]) - luminance(r.hair[1]));
};
check('measured Aristotle skin and hair nearly collide', gapOf(NO_BOOST) < 30, `gap ${gapOf(NO_BOOST).toFixed(0)}`);
check('the boost pulls them apart', gapOf(DEFAULT_BOOST) > 60, `gap ${gapOf(DEFAULT_BOOST).toFixed(0)}`);
check(
  'checkRamps flags the unboosted collision',
  checkRamps(buildRamps(MEASURED_ARISTOTLE, NO_BOOST)).some((p) => p.includes('luma apart')),
);

check(
  'depth ramps sit behind their front counterparts',
  (() => {
    const back = depthRamps(ramps, DEPTH_FACTOR);
    return Object.keys(ramps).every((id) => luminance(back[id][1]) < luminance(ramps[id][1]));
  })(),
);

const targets = quantisationTargets(palette, DEFAULT_BOOST);
check('targets cover every ramp stop plus outline and accent', targets.length === MATERIALS.length * 3 + 2, `got ${targets.length}`);
check('targets are uniquely named', new Set(targets.map((t) => t.name)).size === targets.length);

/* ── Quantisation ─────────────────────────────────────────────────────────── */

/** Build a test image from a row-per-string map of single-character colour keys. */
function imageFrom(rows, key) {
  const h = rows.length;
  const w = rows[0].length;
  const img = createImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = key[rows[y][x]];
      const i = (y * w + x) * 4;
      if (!c) { img.data[i + 3] = 0; continue; }
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  return img;
}
const at = (img, x, y) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
};

check('cloneImage copies rather than aliases', (() => {
  const a = createImage(2, 2);
  const b = cloneImage(a);
  b.data[0] = 99;
  return a.data[0] === 0 && b.data[0] === 99;
})());

// Background masking: reach the pale border, leave a pale interior alone. A bright
// forehead in the middle of a face must never be mistaken for the wall.
const maskTest = imageFrom(
  [
    'WWWWW',
    'WFFFW',
    'WFWFW',
    'WFFFW',
    'WWWWW',
  ],
  { W: [250, 250, 250], F: [120, 90, 60] },
);
const masked = maskBackground(maskTest);
check('masking clears the border', at(masked, 0, 0)[3] === 0 && at(masked, 4, 4)[3] === 0);
check('masking keeps the figure', at(masked, 1, 1)[3] === 255);
check(
  'masking keeps an enclosed pale pixel, not being reachable from the edge',
  at(masked, 2, 2)[3] === 255,
);

const twoTargets = [
  { name: 'dark', rgb: [20, 20, 20] },
  { name: 'light', rgb: [230, 230, 230] },
];
const qIn = imageFrom(['ab'], { a: [40, 30, 35], b: [200, 210, 205] });
const q = quantiseToTargets(qIn, twoTargets);
check('quantisation snaps to the nearest target', at(q.image, 0, 0)[0] === 20 && at(q.image, 1, 0)[0] === 230);
check('quantisation reports usage', q.usage.get('dark') === 1 && q.usage.get('light') === 1);
check('quantisation leaves transparent pixels transparent', (() => {
  const img = imageFrom(['.a'], { a: [40, 30, 35] });
  return at(quantiseToTargets(img, twoTargets).image, 0, 0)[3] === 0;
})());
check('quantisation refuses an empty target list', (() => {
  try { quantiseToTargets(qIn, []); return false; } catch { return true; }
})());

// Despeckle: kill a lone stray, keep a real edge.
const speckle = imageFrom(
  [
    'AAAAA',
    'AABAA',
    'AAAAA',
  ],
  { A: [100, 100, 100], B: [10, 200, 10] },
);
check(
  'despeckle removes an isolated pixel',
  at(despeckle(speckle, { passes: 1 }), 2, 1)[1] === 100,
);
check(
  'despeckle preserves a straight edge',
  (() => {
    const edge = imageFrom(['AAABBB', 'AAABBB', 'AAABBB'], { A: [100, 100, 100], B: [10, 200, 10] });
    const out = despeckle(edge, { passes: 2 });
    return at(out, 2, 1)[0] === 100 && at(out, 3, 1)[1] === 200;
  })(),
);
check(
  'despeckle leaves a two-pixel cluster alone in one pass',
  (() => {
    const pair = imageFrom(['AAAAA', 'ABBAA', 'AAAAA'], { A: [100, 100, 100], B: [10, 200, 10] });
    return at(despeckle(pair, { passes: 1 }), 1, 1)[1] === 200;
  })(),
);

// Outline: every silhouette pixel touching transparency or the border.
const solid = imageFrom(['.....', '.AAA.', '.AAA.', '.AAA.', '.....'], { A: [200, 180, 160] });
const outlined = addOutline(solid, '#000000');
check('outline paints the silhouette edge', at(outlined, 1, 1)[0] === 0);
check('outline leaves the interior alone', at(outlined, 2, 2)[0] === 200);
check('outline leaves transparency alone', at(outlined, 0, 0)[3] === 0);
check(
  'outline treats the image border as an edge',
  (() => {
    const flush = imageFrom(['AA', 'AA'], { A: [200, 180, 160] });
    return at(addOutline(flush, '#000000'), 0, 0)[0] === 0;
  })(),
);

check('opaqueBounds finds the tight box', (() => {
  const b = opaqueBounds(solid);
  return b.x === 1 && b.y === 1 && b.width === 3 && b.height === 3;
})());
check('opaqueBounds returns null for an empty image', opaqueBounds(createImage(3, 3)) === null);
check('cropImage extracts the region', (() => {
  const c = cropImage(solid, opaqueBounds(solid));
  return c.width === 3 && c.height === 3 && at(c, 0, 0)[3] === 255;
})());

// The full pipeline in the one order that works: mask, quantise, despeckle, outline.
check(
  'spriteify masks, quantises, despeckles and outlines',
  (() => {
    const img = imageFrom(
      [
        'WWWWWW',
        'WFFFFW',
        'WFFSFW',
        'WFFFFW',
        'WWWWWW',
      ],
      { W: [250, 250, 250], F: [200, 160, 120], S: [40, 220, 40] },
    );
    const { image } = spriteify(img, [
      { name: 'skin', rgb: [200, 160, 120] },
      { name: 'green', rgb: [40, 220, 40] },
    ], '#101010');
    // Background gone, speckle absorbed, edge outlined, interior kept.
    return at(image, 0, 0)[3] === 0
      && at(image, 3, 2)[1] === 160
      && at(image, 1, 1)[0] === 16
      && at(image, 2, 2)[0] === 200;
  })(),
);

/* ── Outline depth ────────────────────────────────────────────────────────── */

// A fresco's darkest pixels are a mid-brown. Honest, and useless as an outline.
const FRESCO_DARK = '#695344';
check(
  'a sampled fresco outline is too light to read',
  checkRamps(buildRamps(MEASURED_ARISTOTLE, DEFAULT_BOOST), { outline: hexToRgb(FRESCO_DARK) })
    .some((p) => p.includes('silhouette will not read')),
);
check(
  'deepenOutline fixes it while keeping the sampled hue',
  (() => {
    const r = buildRamps(MEASURED_ARISTOTLE, DEFAULT_BOOST);
    const deep = deepenOutline(FRESCO_DARK, r);
    const before = rgbToHsv(hexToRgb(FRESCO_DARK))[0];
    const after = rgbToHsv(hexToRgb(deep))[0];
    return checkRamps(r, { outline: hexToRgb(deep) }).length === 0
      && Math.abs(before - after) < 12
      && luminance(hexToRgb(deep)) < luminance(hexToRgb(FRESCO_DARK));
  })(),
);
check(
  'deepenOutline leaves an already-dark outline alone',
  deepenOutline('#0A0806', buildRamps(MEASURED_ARISTOTLE, DEFAULT_BOOST)) === '#0A0806',
);

/* ── Per-sprite target subsets ────────────────────────────────────────────── */

// Offering every material lets close ones steal each other's pixels. On Aristotle,
// whose skin, hair, chiton and trim share a warm-brown band, the unrestricted palette
// mapped a quarter of his face to chiton tones.
check(
  'a head is offered only skin, hair, collar, outline and accent',
  (() => {
    const names = quantisationTargets(palette, DEFAULT_BOOST, { materials: SPRITE_MATERIALS.head })
      .map((t) => t.name);
    return names.some((n) => n.startsWith('skin.'))
      && names.some((n) => n.startsWith('hair.'))
      && names.includes('outline')
      && !names.some((n) => n.startsWith('outfitS.'))
      && !names.some((n) => n.startsWith('outfitT.'));
  })(),
);
check(
  'every sprite kind always gets an outline target',
  Object.values(SPRITE_MATERIALS).every(
    (materials) => quantisationTargets(palette, DEFAULT_BOOST, { materials }).some((t) => t.name === 'outline'),
  ),
);
check(
  'an unrestricted target list still offers everything',
  quantisationTargets(palette, DEFAULT_BOOST).length === MATERIALS.length * 3 + 2,
);

/* ── Kit documents ────────────────────────────────────────────────────────── */

const goodKit = createKit('aristotle', {
  name: 'Aristotle',
  palette,
  head: { region: [1, 1, 37, 46], pivot: [19, 46] },
  source: { title: 'x', artist: 'y', year: 1511, url: '', license: 'public-domain', note: '' },
});
let doc = upsertKit(createKitsDocument({ sheetSize: [256, 64] }), goodKit);

check('a well-formed kits document validates clean', validateKits(doc).length === 0, validateKits(doc).join('; '));
check('findKit locates a character', findKit(doc, 'aristotle')?.name === 'Aristotle');
check('findKit returns null for a stranger', findKit(doc, 'plato') === null);

check('upsert replaces rather than duplicating', (() => {
  const again = upsertKit(doc, { ...goodKit, name: 'Aristoteles' });
  return again.characters.length === 1 && again.characters[0].name === 'Aristoteles';
})());
check('upsert appends a new character', (() => {
  const two = upsertKit(doc, createKit('plato', {
    palette,
    head: { region: [40, 1, 30, 40], pivot: [15, 40] },
    source: { license: 'public-domain' },
  }));
  return two.characters.length === 2 && validateKits(two).length === 0;
})());
check('upsert does not mutate the original document', doc.characters.length === 1);

check('a kit with no head is reported', validateKits(upsertKit(doc, createKit('nohead', {
  palette, source: { license: 'public-domain' },
}))).some((p) => p.includes('no head')));
check('a kit with no palette is reported', validateKits(upsertKit(doc, createKit('nopal', {
  head: { region: [0, 0, 1, 1], pivot: [0, 0] }, source: { license: 'public-domain' },
}))).some((p) => p.includes('no palette')));
check('a missing licence is reported', validateKits(upsertKit(doc, createKit('nolic', {
  palette, head: { region: [0, 0, 1, 1], pivot: [0, 0] },
}))).some((p) => p.includes('no licence')));

// A region outside the sheet makes the renderer sample garbage.
check(
  'a region outside the sheet is reported',
  validateKits(upsertKit(doc, createKit('offsheet', {
    palette,
    head: { region: [250, 60, 40, 40], pivot: [0, 0] },
    source: { license: 'public-domain' },
  }))).some((p) => p.includes('outside the')),
);
check('a zero-size region is reported', validateKits(upsertKit(doc, createKit('zero', {
  palette, head: { region: [0, 0, 0, 10], pivot: [0, 0] }, source: { license: 'public-domain' },
}))).some((p) => p.includes('zero or negative')));

check(
  'an unknown accessory kind is reported',
  validateKits(upsertKit(doc, createKit('acc', {
    palette,
    head: { region: [1, 1, 10, 10], pivot: [0, 0] },
    accessory: { kind: 'worn', region: [40, 1, 10, 10] },
    source: { license: 'public-domain' },
  }))).some((p) => p.includes('accessory kind')),
);
check('the known accessory kinds attach to real bones', (() => {
  const bones = Object.values(ACCESSORY_KINDS).map((a) => a.bone);
  return bones.includes('prop') && bones.includes('fx.core')
    && bones.every((b) => DEFAULT_SKELETON.some((s) => s.id === b));
})());

// Two sprites sharing pixels is silent corruption, so it gets its own check.
check('overlapping sheet regions are detected', (() => {
  const clash = upsertKit(doc, createKit('clash', {
    palette,
    head: { region: [10, 10, 40, 40], pivot: [0, 0] },
    source: { license: 'public-domain' },
  }));
  return findSheetOverlaps(clash).length > 0;
})());
check('non-overlapping regions are not flagged', findSheetOverlaps(doc).length === 0);

/* ── Sheet packing ────────────────────────────────────────────────────────── */

const items = [
  { id: 'b.head', width: 30, height: 40 },
  { id: 'a.head', width: 37, height: 46 },
  { id: 'c.head', width: 20, height: 46 },
];
const packed = packSheet(items);
check('packing places every item', packed.placements.length === items.length);
check('packing reports a non-zero sheet', packed.width > 0 && packed.height > 0);
check('packed sizes match the inputs', items.every(
  (i) => placementMap(packed).get(i.id).width === i.width,
));
check('every item fits inside the sheet', packed.placements.every(
  (p) => p.x >= 0 && p.y >= 0 && p.x + p.width <= packed.width && p.y + p.height <= packed.height,
));
check('packed items do not overlap', (() => {
  const ps = packed.placements;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i]; const b = ps[j];
      if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) return false;
    }
  }
  return true;
})());
// Determinism matters more than tightness: a churning sheet churns every diff.
check('packing is deterministic regardless of input order', (() => {
  const a = JSON.stringify(packSheet(items).placements);
  const b = JSON.stringify(packSheet([...items].reverse()).placements);
  return a === b;
})());
check('packing an empty list is not an error', packSheet([]).placements.length === 0);
check('sheet dimensions are powers of two', (() => {
  const isPow2 = (n) => (n & (n - 1)) === 0;
  return isPow2(packed.width) && isPow2(packed.height);
})());

/* ── Recipes ──────────────────────────────────────────────────────────────── */

// The recipes are hand-authored coordinates, which is exactly the kind of data that
// rots silently. These checks are cheap and catch a fat-fingered box before a build.
check('every recipe has an id, a name and a source file', RECIPES.every(
  (r) => r.id && r.name && r.source?.file && r.source?.license,
));
check('recipe ids are unique', new Set(RECIPES.map((r) => r.id)).size === RECIPES.length);
check('every head crop is [x, y, w, h] with positive size', RECIPES.every(
  (r) => Array.isArray(r.head?.crop) && r.head.crop.length === 4
    && r.head.crop.every(Number.isFinite) && r.head.crop[2] > 0 && r.head.crop[3] > 0,
));
check('every sample box is [x, y, w, h] with positive size', RECIPES.every(
  (r) => Object.values(r.samples).every(
    (boxes) => boxes.every((b) => b.length === 4 && b.every(Number.isFinite) && b[2] > 0 && b[3] > 0),
  ),
));
check('every recipe samples all eight measurable roles', RECIPES.every(
  (r) => ['skin.primary', 'skin.secondary', 'hair.primary', 'hair.secondary',
    'outfit.primary', 'outfit.secondary', 'outfit.tertiary', 'accent'].every((k) => r.samples[k]?.length),
));
check('every traced silhouette is a real polygon', RECIPES.every(
  (r) => !r.head.mask || (r.head.mask.length >= 3 && r.head.mask.every((pt) => pt.length === 2 && pt.every(Number.isFinite))),
));
// A mask outside its crop clips to nothing and yields an empty sprite.
check('every silhouette lies inside its crop', RECIPES.every((r) => {
  if (!r.head.mask) return true;
  const [cx, cy, cw, ch] = r.head.crop;
  return r.head.mask.some(([x, y]) => x >= cx && x <= cx + cw && y >= cy && y <= cy + ch);
}));
check('every outline box is well formed', RECIPES.every(
  (r) => Array.isArray(r.outlineFrom) && r.outlineFrom.length === 4 && r.outlineFrom[2] > 0,
));
check('every element colour is a hex value', RECIPES.every((r) => {
  if (!r.element_color) return true;
  try { hexToRgb(r.element_color); return true; } catch { return false; }
}));

/* ── Report ───────────────────────────────────────────────────────────────── */

const total = passed + failures.length;
if (failures.length > 0) {
  console.error(`\npalettetest: ${passed}/${total} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`\npalettetest: ${passed}/${total} passed\n`);
