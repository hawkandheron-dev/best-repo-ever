/**
 * Turning stored base colours into three-stop shading ramps.
 *
 * One global light direction for every part on every character. Inconsistent light
 * across parts is the fastest way to make a rigged figure look like assembled clip
 * art rather than one drawing.
 */

import {
  hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, towardHue, darken, luminance,
} from './color';
import { MATERIALS, getRole, DEFAULT_BOOST } from './paletteSchema';

/** Light comes from upper-front: screen upper-right when the fighter faces right. */
export const LIGHT_DIRECTION = { x: 0.55, y: 0.83 };

/** Hues that light and shadow drift toward — warm sunlight, cool ambient fill. */
const WARM_HUE = 40;
const COOL_HUE = 225;

/** Far-side limbs sit back by this much, so depth needs no extra stored colours. */
export const DEPTH_FACTOR = 0.78;

/**
 * How far apart skin and hair have to sit before they stop blending at sprite size.
 *
 * Exported because two things need to agree about it: the check that reports a head as
 * mush, and the rule that decides how hard to push the two apart in the first place.
 */
export const MIN_SKIN_HAIR_GAP = 40;

/**
 * How much separation a palette needs, given how much it already has.
 *
 * `separate` drops hair by up to a third of its value, which rescues a faded fresco
 * where skin and hair were painted almost the same tone — Aristotle's differ by 16 luma
 * — and ruins anything that arrived with real contrast. A bust-derived head is mostly
 * hair, so darkening it unconditionally turns three quarters of the sprite black.
 *
 * So: apply exactly as much as the gap is short by, and none at all once it is met.
 * Rounded, because the build has to be reproducible to the byte.
 */
export function separationFor(skinHex, hairHex, target = MIN_SKIN_HAIR_GAP) {
  const gap = Math.abs(luminance(hexToRgb(skinHex)) - luminance(hexToRgb(hairHex)));
  return Math.round(Math.max(0, Math.min(1, (target - gap) / target)) * 100) / 100;
}

/**
 * Build a [light, base, shadow] ramp from one base colour.
 *
 * `boost.spread` widens the ramp around its base. `boost.separate` biases the base
 * itself — positive lifts, negative drops — which is how skin and hair get pulled
 * apart when a faded painting leaves them nearly the same value.
 *
 * A measured `shadowHex` is used verbatim when there is no boost, because a real
 * sampled shadow beats an invented one. Once boosting is on, the shadow is derived
 * so it stays consistent with the widened base.
 */
export function buildRamp(baseHex, shadowHex, { spread = 1, valueBias = 0 } = {}) {
  const [h, s, v] = rgbToHsv(hexToRgb(baseHex));
  const baseV = Math.max(0.05, Math.min(1, v * (1 + valueBias)));
  const base = hsvToRgb([h, s, baseV]);

  const light = hsvToRgb([
    towardHue(h, WARM_HUE, 8),
    Math.max(0, s * (1 - 0.12 * spread)),
    Math.min(1, baseV * (1 + 0.18 * spread)),
  ]);

  const shadow = shadowHex && spread === 1 && valueBias === 0
    ? hexToRgb(shadowHex)
    : hsvToRgb([
      towardHue(h, COOL_HUE, 10),
      Math.min(1, s * (1 + 0.10 * spread)),
      baseV * (1 - 0.22 * spread),
    ]);

  return [light, base, shadow];
}

/**
 * The darkest a material's base may be and still show three distinct stops.
 *
 * Below this the ramp has no room to descend. The stops are multiplicative on value, so
 * a base at v=0.24 puts its shadow at v=0.15 and its light at v=0.31 — a span the eye
 * cannot resolve at 49 px, and one the outline then has to fit underneath as well. The
 * material stops being three colours and becomes one dark smear.
 *
 * This bites hardest exactly where the roster lives. Raphael painted Heraclitus with
 * near-black hair, and a bust-derived head is mostly hair: measured faithfully and left
 * alone, four fifths of the sprite came out as a single black mass. Renaissance frescoes
 * and Roman busts are full of dark-haired Mediterranean men, so this recurs.
 *
 * Lifting is the same kind of adjustment as `spread` and `separate` — an accommodation
 * to sprite size, not a claim about the painting. `measured` keeps the truth.
 */
export const MIN_MATERIAL_VALUE = 0.34;

/**
 * All five material ramps for a palette.
 *
 * Skin lifts and hair drops under `separate`, since those two are the pair that
 * actually collide on a faded fresco — a garment sitting close to skin in value is
 * usually fine, because the silhouette separates them anyway.
 *
 * Whatever `separate` decides, no material is allowed to end up below the floor.
 */
export function buildRamps(palette, boost = DEFAULT_BOOST) {
  const { spread = 1, separate = 0, floor = MIN_MATERIAL_VALUE } = boost;
  const bias = { skin: +0.06 * separate, hair: -0.30 * separate };

  const ramps = {};
  for (const { id, base, shadow } of MATERIALS) {
    const baseHex = getRole(palette, base);
    const v = rgbToHsv(hexToRgb(baseHex))[2];
    const wanted = Math.max(v * (1 + (bias[id] ?? 0)), floor);
    ramps[id] = buildRamp(
      baseHex,
      shadow ? getRole(palette, shadow) : null,
      // A pure black base has no hue or value to scale, so leave it where it is rather
      // than dividing by zero on the way to somewhere arbitrary.
      { spread, valueBias: v > 0 ? wanted / v - 1 : 0 },
    );
  }
  return ramps;
}

/** How far a material had to be lifted off the floor, for the build to report. */
export function liftedMaterials(palette, boost = DEFAULT_BOOST) {
  const { separate = 0, floor = MIN_MATERIAL_VALUE } = boost;
  const bias = { skin: +0.06 * separate, hair: -0.30 * separate };
  return MATERIALS
    .map(({ id, base }) => {
      const v = rgbToHsv(hexToRgb(getRole(palette, base)))[2];
      const after = v * (1 + (bias[id] ?? 0));
      return { id, from: after, to: floor };
    })
    .filter((m) => m.from < floor && m.from > 0);
}

/** The same ramps pushed back for far-side limbs. */
export function depthRamps(ramps, factor = DEPTH_FACTOR) {
  const out = {};
  for (const [id, stops] of Object.entries(ramps)) {
    out[id] = stops.map((rgb) => darken(rgb, factor));
  }
  return out;
}

/**
 * Which materials each kind of sprite is allowed to be made of.
 *
 * This matters more than it looks. Offering every material as a quantisation target
 * lets colours from one steal pixels from another whenever they are close — on
 * Aristotle, whose skin, hair, chiton and gold trim all sit in the same warm-brown
 * band, the unrestricted palette mapped a quarter of his FACE to chiton tones. A head
 * contains skin, hair, an outline and a collar; it contains no hem and no sandal.
 */
export const SPRITE_MATERIALS = {
  head: ['skin', 'hair', 'outfitP'],
  garment: ['outfitP', 'outfitS', 'outfitT'],
  accessory: ['outfitT', 'accent'],
  limb: ['skin'],
  robe: ['outfitP', 'outfitS', 'outfitT'],
};

/**
 * Flatten ramps into the target list a quantiser matches against.
 *
 * `materials` restricts which ramps are offered; omit it for all five. The outline is
 * always included, since every sprite has an edge. `accent` is included only when it
 * is not already a listed material, so leather and props stay available without
 * competing for skin.
 */
export function quantisationTargets(palette, boost = DEFAULT_BOOST, { materials = null } = {}) {
  const ramps = buildRamps(palette, boost);
  const stopNames = ['light', 'base', 'shadow'];
  const allowed = materials ? new Set(materials) : null;
  const targets = [];

  for (const [id, stops] of Object.entries(ramps)) {
    if (allowed && !allowed.has(id)) continue;
    stops.forEach((rgb, i) => targets.push({ name: `${id}.${stopNames[i]}`, rgb }));
  }
  targets.push({ name: 'outline', rgb: hexToRgb(palette.outline) });
  if (!allowed || allowed.has('accent')) {
    targets.push({ name: 'accent', rgb: hexToRgb(palette.accent) });
  }
  return targets;
}

/**
 * How much darker than the darkest material shadow the outline has to sit.
 *
 * A fixed 28 luma is the right answer for a faded fresco, whose shadows sit in the
 * mid-tones. It is an impossible answer for a figure painted with near-black hair:
 * Raphael's Heraclitus has a darkest shadow at luma 26, so "28 below" is asking for a
 * negative luminance, and the naive rule spent forty iterations grinding a sampled
 * colour down to #010001 — pure black, the one thing the sampling exists to avoid — and
 * then reported failure anyway.
 *
 * So the demand is capped at a share of the room that actually exists below the darkest
 * shadow. Sixty per cent of the way to black is a separation the eye reads, and it
 * leaves enough of the sampled colour intact to still have a hue.
 */
export const OUTLINE_HEADROOM = 0.6;

export function outlineGapTarget(ramps, minOutlineGap = 28) {
  const darkestShadow = Math.min(...Object.values(ramps).map((stops) => luminance(stops[2])));
  return { darkestShadow, target: Math.min(minOutlineGap, darkestShadow * OUTLINE_HEADROOM) };
}

/**
 * Darken a measured outline until it sits clear of the darkest material shadow.
 *
 * Sampling the darkest pixels of a painting gives an honest colour that does not
 * work as an outline. Rather than substituting black — which no fresco contains and
 * which makes a sprite look like a cartoon pasted on the stage — keep the sampled hue
 * and push its value down until the silhouette reads.
 */
export function deepenOutline(outlineHex, ramps, { minOutlineGap = 28, margin = 3 } = {}) {
  const { darkestShadow, target } = outlineGapTarget(ramps, minOutlineGap);
  let rgb = hexToRgb(outlineHex);
  let guard = 0;
  // Aim a little past the threshold: the return value is a rounded hex, and rounding
  // down can otherwise land just under the gap this loop was trying to clear.
  while (darkestShadow - luminance(rgb) < target + margin && guard < 40) {
    rgb = darken(rgb, 0.92);
    guard++;
  }
  return rgbToHex(rgb);
}

/** Hex view of the ramps, for display and for writing into a kit file. */
export function rampsToHex(ramps) {
  const out = {};
  for (const [id, stops] of Object.entries(ramps)) {
    out[id] = { light: rgbToHex(stops[0]), base: rgbToHex(stops[1]), shadow: rgbToHex(stops[2]) };
  }
  return out;
}

/**
 * Sanity checks on derived ramps: each must descend in luminance from light to
 * shadow, and skin must stay clear of hair or the head turns to mush at sprite size.
 */
export function checkRamps(ramps, { minSkinHairGap = MIN_SKIN_HAIR_GAP, outline = null, minOutlineGap = 28 } = {}) {
  const problems = [];

  // "Darker than the bases" is not the same as "dark enough to read as an edge". A
  // fresco's darkest pixels are a mid-brown, and an outline that close to the hair
  // shadow makes the silhouette dissolve into the stage behind it.
  if (outline) {
    const { darkestShadow, target } = outlineGapTarget(ramps, minOutlineGap);
    const gap = darkestShadow - luminance(outline);
    if (gap < target) {
      problems.push(
        `Outline is only ${gap.toFixed(0)} luma below the darkest shadow (want ${target.toFixed(0)}+) — the silhouette will not read`,
      );
    }
  }

  for (const [id, stops] of Object.entries(ramps)) {
    const [light, base, shadow] = stops.map(luminance);
    if (!(light > base && base > shadow)) {
      problems.push(
        `${id} ramp is not monotonic: light ${light.toFixed(0)}, base ${base.toFixed(0)}, shadow ${shadow.toFixed(0)}`,
      );
    }
  }

  if (ramps.skin && ramps.hair) {
    const gap = Math.abs(luminance(ramps.skin[1]) - luminance(ramps.hair[1]));
    if (gap < minSkinHairGap) {
      problems.push(
        `Skin and hair bases are only ${gap.toFixed(0)} luma apart (want ${minSkinHairGap}+) — they will blend at sprite size`,
      );
    }
  }

  return problems;
}
