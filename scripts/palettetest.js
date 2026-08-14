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
  deepenOutline, separationFor, outlineGapTarget, SPRITE_MATERIALS, DEPTH_FACTOR,
  MIN_SKIN_HAIR_GAP, OUTLINE_HEADROOM, MIN_MATERIAL_VALUE, liftedMaterials,
} from '../src/fighter/palette/ramp.js';
import {
  regionCdf, bandFor, bandsFor, remapByRegion, assignRegionIds,
  CARVED_BANDS, SMOOTH_BANDS, DEFAULT_BANDS,
} from '../src/fighter/palette/shapeMap.js';
import {
  createKit, createKitsDocument, upsertKit, findKit, validateKits, findSheetOverlaps,
  ACCESSORY_KINDS,
} from '../src/fighter/palette/kitSchema.js';
import { packSheet, placementMap } from '../src/fighter/palette/sheetPack.js';
import { DEFAULT_SKELETON } from '../src/fighter/rig/rigSchema.js';
import { RECIPES, resolveRecipe } from '../art/recipes.js';
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

/* ── Adaptive separation ──────────────────────────────────────────────────── */

// `separate` rescues a palette whose skin and hair collide and ruins one whose do not,
// so how much to apply is a property of the palette rather than a constant.
check('a collided palette asks for full separation', separationFor('#807060', '#7E6E5E') > 0.9);
check('a palette that already clears the gap asks for none',
  separationFor('#E8C8A8', '#2A2018') === 0);
check('separation falls as the measured gap widens', (() => {
  const tight = separationFor('#CEA074', '#B4946E');
  const loose = separationFor('#CEA074', '#6A5038');
  return tight > loose && loose >= 0;
})());
check('separation is quantised, so the build stays reproducible',
  Number.isInteger(Math.round(separationFor('#CEA074', '#B4946E') * 100)));
check('separation is symmetric in its arguments',
  separationFor('#CEA074', '#B4946E') === separationFor('#B4946E', '#CEA074'));
check('a palette separated by the prescribed amount passes the gap check', (() => {
  const p = createPalette({ skin: { primary: '#CEA074', secondary: '#B1926D' }, hair: { primary: '#B4946E', secondary: '#A38869' } });
  const boosted = buildRamps(p, { ...DEFAULT_BOOST, separate: separationFor(p.skin.primary, p.hair.primary) });
  return Math.abs(luminance(boosted.skin[1]) - luminance(boosted.hair[1])) >= MIN_SKIN_HAIR_GAP;
})());

/* ── The material value floor ─────────────────────────────────────────────── */

// Ramp stops are multiplicative on value, so a very dark base has no room to descend:
// its three stops collapse into one smear and the outline still has to fit underneath.
// Raphael's Heraclitus has near-black hair, and a bust-derived head is mostly hair.
const NEAR_BLACK_HAIR = createPalette({ hair: { primary: '#3E2B2F', secondary: '#241A1C' } });

check('a dark material is reported as lifted',
  liftedMaterials(NEAR_BLACK_HAIR, DEFAULT_BOOST).some((m) => m.id === 'hair'));
check('a material already above the floor is left where it is',
  !liftedMaterials(createPalette(), { ...DEFAULT_BOOST, separate: 0 }).some((m) => m.id === 'skin'));
check('lifting widens the ramp enough for three stops to separate', (() => {
  const withFloor = buildRamps(NEAR_BLACK_HAIR, { ...DEFAULT_BOOST, separate: 0 });
  const without = buildRamps(NEAR_BLACK_HAIR, { ...DEFAULT_BOOST, separate: 0, floor: 0 });
  const span = (r) => luminance(r.hair[0]) - luminance(r.hair[2]);
  return span(withFloor) > span(without) && span(withFloor) > 30;
})());
check('lifting preserves hue and the ramp stays monotonic', (() => {
  const r = buildRamps(NEAR_BLACK_HAIR, { ...DEFAULT_BOOST, separate: 0 });
  const wanted = rgbToHsv(hexToRgb('#3E2B2F'))[0];
  return near(rgbToHsv(r.hair[1])[0], wanted, 2) && checkRamps(r).length === 0;
})());
check('the floor overrides a separate bias that would push below it', (() => {
  // `separate` drops hair by up to 30%; on an already-dark palette that must not win.
  const r = buildRamps(NEAR_BLACK_HAIR, { ...DEFAULT_BOOST, separate: 1 });
  return rgbToHsv(r.hair[1])[2] >= MIN_MATERIAL_VALUE - 1e-6;
})());
check('a black base is left alone rather than divided by zero', (() => {
  const r = buildRamps(createPalette({ hair: { primary: '#000000', secondary: '#000000' } }), DEFAULT_BOOST);
  return r.hair.every((stop) => stop.every(Number.isFinite));
})());

/* ── Outline headroom ─────────────────────────────────────────────────────── */

// A fixed "28 luma below the darkest shadow" is unsatisfiable when the darkest shadow is
// itself below 28. Raphael's Heraclitus has near-black hair and hit exactly that: the
// rule ground a sampled colour down to #010001 over forty iterations and then reported
// failure anyway. The demand is now capped at the room that actually exists.
const PALE_RAMPS = buildRamps(createPalette({ hair: { primary: '#B0926A', secondary: '#7E6544' } }), NO_BOOST);
// `floor: 0` to reach the case deliberately. The material floor normally keeps shadows
// out of this territory, but it cannot for a saturated dark colour — value is floored,
// and a saturated hue at that value still lands near-black in luminance.
const DARK_RAMPS = buildRamps(
  createPalette({ hair: { primary: '#2A1E22', secondary: '#180F12' } }),
  { ...NO_BOOST, floor: 0 },
);
// The two rules have to work together, which is the case that actually shipped broken:
// before the floor, a near-black-haired palette drove the outline to #010001 AND still
// failed the check. With the floor the shadow sits high enough that a real colour clears.
check('a near-black palette now gets an outline that is neither black nor failing', (() => {
  const r = buildRamps(NEAR_BLACK_HAIR, DEFAULT_BOOST);
  const deep = deepenOutline('#10060F', r);
  return luminance(hexToRgb(deep)) > 4
    && !checkRamps(r, { outline: hexToRgb(deep) }).some((x) => x.includes('Outline'));
})());

check('a palette with room to spare keeps the full gap',
  outlineGapTarget(PALE_RAMPS).target === 28);
check('a near-black palette asks for less than the full gap',
  outlineGapTarget(DARK_RAMPS).target < 28);
check('the reduced gap is a share of the room below the darkest shadow', (() => {
  const { darkestShadow, target } = outlineGapTarget(DARK_RAMPS);
  return Math.abs(target - darkestShadow * OUTLINE_HEADROOM) < 1e-9;
})());
check('the target is never negative, however dark the palette',
  outlineGapTarget(buildRamps(createPalette({ hair: { primary: '#010101', secondary: '#000000' } }), NO_BOOST)).target >= 0);

check('deepening always satisfies the check it is trying to satisfy', (() => {
  for (const ramps of [PALE_RAMPS, DARK_RAMPS]) {
    const deep = deepenOutline('#695344', ramps);
    if (checkRamps(ramps, { outline: hexToRgb(deep) }).some((p) => p.includes('Outline'))) return false;
  }
  return true;
})());
// The whole reason for sampling an outline instead of using black is to keep the hue.
// Grinding it to #010001 throws that away, which is what the uncapped rule did.
check('a deepened outline keeps some of its sampled hue', (() => {
  const deep = hexToRgb(deepenOutline('#10060F', DARK_RAMPS));
  return deep.some((c) => c > 3) && luminance(deep) > 0;
})());
// Idempotence is the honest form of "already dark enough is left alone": whatever the
// first pass settled on, a second pass must agree with it.
check('deepening is idempotent', (() => {
  for (const ramps of [PALE_RAMPS, DARK_RAMPS]) {
    const once = deepenOutline('#695344', ramps);
    if (deepenOutline(once, ramps) !== once) return false;
  }
  return true;
})());

/* ── Shape mapping ────────────────────────────────────────────────────────── */

check('carved surfaces get an outline band and smooth ones do not',
  CARVED_BANDS.some((b) => b.stop === 'outline') && !SMOOTH_BANDS.some((b) => b.stop === 'outline'));
check('hair is treated as carved, anything else as smooth',
  bandsFor('hair', DEFAULT_BANDS) === CARVED_BANDS && bandsFor('outfitP', DEFAULT_BANDS) === SMOOTH_BANDS);
check('bands are ordered and cover the whole range', CARVED_BANDS.every(
  (b, i) => i === 0 || b.upTo > CARVED_BANDS[i - 1].upTo,
) && CARVED_BANDS[CARVED_BANDS.length - 1].upTo === Infinity);
check('bandFor picks by rank', bandFor(0, CARVED_BANDS) === 'outline'
  && bandFor(0.5, CARVED_BANDS) === 'base' && bandFor(1, CARVED_BANDS) === 'light');

/** A gradient strip: one row, luminance climbing left to right. */
const gradient = (n) => {
  const img = createImage(n, 1);
  for (let i = 0; i < n; i++) {
    const v = Math.round((i / (n - 1)) * 255);
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  return img;
};

check('a region cdf spans zero to one', (() => {
  const img = gradient(64);
  const d = regionCdf(img, new Array(64).fill(1), 1);
  return d.pixels === 64 && d.cdf[d.lo] < 0.05 && d.cdf[d.hi] > 0.95;
})());
check('an empty region reports nothing rather than dividing by zero',
  regionCdf(gradient(8), new Array(8).fill(1), 7) === null);
check('transparent pixels stay out of the distribution', (() => {
  const img = gradient(64);
  for (let i = 0; i < 32; i++) img.data[i * 4 + 3] = 0;
  return regionCdf(img, new Array(64).fill(1), 1).pixels === 32;
})());
// The whole reason for equalising by rank: a bottom-heavy histogram must still spend
// the full ramp, which a fixed luminance split cannot do.
check('a bottom-heavy region still reaches the light stop', (() => {
  const img = createImage(100, 1);
  for (let i = 0; i < 100; i++) {
    const v = i < 90 ? 10 + i : 200; // ninety dark pixels, ten bright
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  const { stats } = remapByRegion(img, new Array(100).fill(1), {
    regions: { 1: 'hair' }, ramps, outline: [0, 0, 0],
  });
  return stats[0].counts.light > 15 && stats[0].counts.outline > 5;
})());
check('a region of one flat luminance does not all become the lightest stop', (() => {
  const img = createImage(40, 1);
  for (let i = 0; i < 40; i++) {
    img.data[i * 4] = 90; img.data[i * 4 + 1] = 90; img.data[i * 4 + 2] = 90; img.data[i * 4 + 3] = 255;
  }
  const { stats } = remapByRegion(img, new Array(40).fill(1), {
    regions: { 1: 'skin' }, ramps, outline: [0, 0, 0],
  });
  return stats[0].counts.base === 40;
})());

check('remapping repaints only its own region', (() => {
  const img = gradient(8);
  const map = [1, 1, 1, 1, 0, 0, 0, 0];
  const { image } = remapByRegion(img, map, { regions: { 1: 'skin' }, ramps, outline: [0, 0, 0] });
  const untouched = [4, 5, 6, 7].every((i) => image.data[i * 4] === img.data[i * 4]);
  const stops = new Set(ramps.skin.map((s) => Math.round(s[0])));
  const repainted = [0, 1, 2, 3].every((i) => stops.has(image.data[i * 4]));
  return untouched && repainted;
})());
check('remapping leaves the source image alone', (() => {
  const img = gradient(8);
  const before = [...img.data];
  remapByRegion(img, new Array(8).fill(1), { regions: { 1: 'skin' }, ramps, outline: [0, 0, 0] });
  return before.every((v, i) => v === img.data[i]);
})());
check('every remapped pixel lands on a ramp stop or the outline', (() => {
  const img = gradient(64);
  const { image } = remapByRegion(img, new Array(64).fill(1), {
    regions: { 1: 'hair' }, ramps, outline: [7, 7, 7],
  });
  const allowed = new Set([...ramps.hair.map((s) => s.map(Math.round).join()), '7,7,7']);
  for (let i = 0; i < 64; i++) {
    if (!allowed.has([image.data[i * 4], image.data[i * 4 + 1], image.data[i * 4 + 2]].join())) return false;
  }
  return true;
})());
check('a material with no ramp is reported rather than silently skipped', (() => {
  const { stats } = remapByRegion(gradient(8), new Array(8).fill(1), {
    regions: { 1: 'lapis' }, ramps, outline: [0, 0, 0],
  });
  return stats[0].error?.includes('lapis');
})());
check('a region traced where the figure is not is reported', (() => {
  const { stats } = remapByRegion(gradient(8), new Array(8).fill(1), {
    regions: { 2: 'skin' }, ramps, outline: [0, 0, 0],
  });
  return stats[0].error?.includes('empty');
})());

check('the base material takes id 1', assignRegionIds({ base: 'hair', skin: [[[0, 0]]] }).ids[1] === 'hair');
check('traced materials take ids above the base', (() => {
  const { ids, polygons } = assignRegionIds({ base: 'hair', skin: [[[0, 0]]], outfitP: [[[1, 1]]] });
  return ids[2] === 'outfitP' && ids[3] === 'skin' && polygons.length === 2;
})());
// Ids that depend on object iteration order are exactly how a reproducible build stops
// being reproducible, so they are assigned in sorted key order.
check('region ids do not depend on key order', (() => {
  const a = assignRegionIds({ base: 'hair', skin: [[[0, 0]]], outfitP: [[[1, 1]]] });
  const b = assignRegionIds({ outfitP: [[[1, 1]]], base: 'hair', skin: [[[0, 0]]] });
  return JSON.stringify(a.ids) === JSON.stringify(b.ids);
})());
check('every polygon carries the id of its material', (() => {
  const { ids, polygons } = assignRegionIds({ base: 'hair', skin: [[[0, 0]], [[2, 2]]] });
  return polygons.length === 2 && polygons.every((p) => ids[p.id] === 'skin');
})());

/* ── Background removal against a named colour ────────────────────────────── */

/** A dark blob on a warm-cream field, the shape of a museum photograph. */
const onCream = () => {
  const img = createImage(9, 9);
  for (let i = 0; i < 81; i++) {
    const x = i % 9, y = (i / 9) | 0;
    const inside = x >= 3 && x <= 5 && y >= 3 && y <= 5;
    const rgb = inside ? [48, 52, 50] : [205, 202, 182];
    img.data[i * 4] = rgb[0]; img.data[i * 4 + 1] = rgb[1]; img.data[i * 4 + 2] = rgb[2]; img.data[i * 4 + 3] = 255;
  }
  return img;
};

// A gallery cream sits below any brightness threshold a lit forehead would survive.
check('the brightness test misses a warm-cream backdrop',
  maskBackground(onCream()).data[3] === 255);
check('a named backdrop colour clears it', (() => {
  const out = maskBackground(onCream(), { near: { rgb: '#CDCAB6', tolerance: 55 } });
  return out.data[3] === 0 && out.data[(4 * 9 + 4) * 4 + 3] === 255;
})());
check('a named backdrop colour spares the figure', (() => {
  const out = maskBackground(onCream(), { near: { rgb: '#CDCAB6', tolerance: 55 } });
  let opaque = 0;
  for (let i = 0; i < 81; i++) if (out.data[i * 4 + 3] === 255) opaque++;
  return opaque === 9;
})());
// A traced silhouette and the flood fill have to compose: the polygon clears the outside,
// and the fill must reach through that to the backdrop the polygon left loose.
check('the fill reaches through already-transparent pixels', (() => {
  const img = onCream();
  // Stand in for the polygon clip: clear the border ring the way a traced mask would.
  for (let i = 0; i < 81; i++) {
    const x = i % 9, y = (i / 9) | 0;
    if (x === 0 || y === 0 || x === 8 || y === 8) img.data[i * 4 + 3] = 0;
  }
  const out = maskBackground(img, { near: { rgb: '#CDCAB6', tolerance: 55 } });
  return out.data[(2 * 9 + 2) * 4 + 3] === 0 && out.data[(4 * 9 + 4) * 4 + 3] === 255;
})());

check('preQuantise runs between masking and quantisation', (() => {
  const img = onCream();
  let sawMaskedInput = false;
  spriteify(img, quantisationTargets(palette, DEFAULT_BOOST), palette.outline, {
    mask: { near: { rgb: '#CDCAB6', tolerance: 55 } },
    preQuantise: (masked) => { sawMaskedInput = masked.data[3] === 0; return masked; },
  });
  return sawMaskedInput;
})());

/* ── Recipes ──────────────────────────────────────────────────────────────── */

// The recipes are hand-authored coordinates, which is exactly the kind of data that
// rots silently. These checks are cheap and catch a fat-fingered box before a build.
// They run against the RESOLVED form, so a one-source and a two-source recipe are held
// to the same contract without the tests having to know which is which.
const RESOLVED = RECIPES.map((r) => ({ recipe: r, ...resolveRecipe(r) }));

const MEASURABLE_ROLES = ['skin.primary', 'skin.secondary', 'hair.primary', 'hair.secondary',
  'outfit.primary', 'outfit.secondary', 'outfit.tertiary', 'accent'];

check('every recipe has an id and a name', RECIPES.every((r) => r.id && r.name));
check('recipe ids are unique', new Set(RECIPES.map((r) => r.id)).size === RECIPES.length);
// The licence obligation follows the pixels that ship, which are the shape source's.
check('every shape source names a file and a licence', RESOLVED.every(
  ({ shape }) => shape.file && shape.provenance?.license,
));
check('every head crop is [x, y, w, h] with positive size', RESOLVED.every(
  ({ shape }) => Array.isArray(shape.crop) && shape.crop.length === 4
    && shape.crop.every(Number.isFinite) && shape.crop[2] > 0 && shape.crop[3] > 0,
));
check('every measured recipe samples all eight roles, in well-formed boxes', RESOLVED.every(
  ({ colour }) => !colour.measured || MEASURABLE_ROLES.every(
    (k) => colour.samples[k]?.length
      && colour.samples[k].every((b) => b.length === 4 && b.every(Number.isFinite) && b[2] > 0 && b[3] > 0),
  ),
));
check('every measured recipe has a well-formed outline box', RESOLVED.every(
  ({ colour }) => !colour.measured
    || (Array.isArray(colour.outlineFrom) && colour.outlineFrom.length === 4 && colour.outlineFrom[2] > 0),
));
// A provisional palette has to stand in for a measured one everywhere, outline included —
// there is no darkest-2% pass to fall back on when nothing was sampled.
check('every provisional palette sets all eight roles plus an outline', RESOLVED.every(
  ({ colour }) => colour.measured
    || [...MEASURABLE_ROLES, 'outline'].every((k) => {
      try { hexToRgb(colour.values[k]); return true; } catch { return false; }
    }),
));
check('every provisional palette records what to measure it from', RESOLVED.every(
  ({ colour }) => colour.measured || (typeof colour.after === 'string' && colour.after.length > 0),
));
check('every traced silhouette is a real polygon', RESOLVED.every(
  ({ shape }) => !shape.mask
    || (shape.mask.length >= 3 && shape.mask.every((pt) => pt.length === 2 && pt.every(Number.isFinite))),
));
// A mask outside its crop clips to nothing and yields an empty sprite.
check('every silhouette lies inside its crop', RESOLVED.every(({ shape }) => {
  if (!shape.mask) return true;
  const [cx, cy, cw, ch] = shape.crop;
  return shape.mask.some(([x, y]) => x >= cx && x <= cx + cw && y >= cy && y <= cy + ch);
}));
// Overrides are how an edit made by eye in the pigment card gets back into the build.
// A typo here silently ships a wrong colour, since there is nothing to compare it to.
check('every override names a real role and a real colour', RECIPES.every(
  (r) => Object.entries(r.overrides ?? {}).every(([path, hex]) => {
    if (!PALETTE_ROLES.some((role) => role.path === path)) return false;
    try { hexToRgb(hex); return true; } catch { return false; }
  }),
));
check('every pinned boost is a sane pair of numbers', RECIPES.every((r) => {
  if (!r.boost) return true;
  const keys = Object.keys(r.boost);
  return keys.length > 0
    && keys.every((k) => ['spread', 'separate', 'floor'].includes(k))
    && Object.values(r.boost).every((v) => Number.isFinite(v) && v >= 0);
}));
check('every element colour is a hex value', RECIPES.every((r) => {
  if (!r.element_color) return true;
  try { hexToRgb(r.element_color); return true; } catch { return false; }
}));

// Traced regions are the part of a two-source recipe with no visual feedback until the
// build runs, so the structural mistakes are worth catching here.
check('every region block names a base material and only known materials', RESOLVED.every(
  ({ shape }) => !shape.regions || (
    MATERIALS.some((m) => m.id === shape.regions.base)
    && Object.keys(shape.regions).filter((k) => k !== 'base')
      .every((k) => MATERIALS.some((m) => m.id === k))
  ),
));
check('every traced region is a list of real polygons', RESOLVED.every(
  ({ shape }) => !shape.regions || Object.entries(shape.regions)
    .filter(([k]) => k !== 'base')
    .every(([, polys]) => Array.isArray(polys) && polys.length > 0 && polys.every(
      (p) => p.length >= 3 && p.every((pt) => pt.length === 2 && pt.every(Number.isFinite)),
    )),
));
// A region traced outside the crop paints nothing, and the material it stood for
// silently disappears into the base.
check('every traced region overlaps its crop', RESOLVED.every(({ shape }) => {
  if (!shape.regions) return true;
  const [cx, cy, cw, ch] = shape.crop;
  return Object.entries(shape.regions).filter(([k]) => k !== 'base').every(([, polys]) => polys.every(
    (p) => p.some(([x, y]) => x >= cx && x <= cx + cw && y >= cy && y <= cy + ch),
  ));
}));
check('a recipe that traces regions also names its backdrop colour', RESOLVED.every(({ shape }) => {
  if (!shape.regions) return true;
  try { hexToRgb(shape.background.rgb); return shape.background.tolerance > 0; } catch { return false; }
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
