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
  buildRamp, buildRamps, depthRamps, quantisationTargets, checkRamps, rampsToHex, DEPTH_FACTOR,
} from '../src/fighter/palette/ramp.js';
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

/* ── Report ───────────────────────────────────────────────────────────────── */

const total = passed + failures.length;
if (failures.length > 0) {
  console.error(`\npalettetest: ${passed}/${total} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`\npalettetest: ${passed}/${total} passed\n`);
