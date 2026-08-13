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
 * All five material ramps for a palette.
 *
 * Skin lifts and hair drops under `separate`, since those two are the pair that
 * actually collide on a faded fresco — a garment sitting close to skin in value is
 * usually fine, because the silhouette separates them anyway.
 */
export function buildRamps(palette, boost = DEFAULT_BOOST) {
  const { spread = 1, separate = 0 } = boost;
  const bias = { skin: +0.06 * separate, hair: -0.30 * separate };

  const ramps = {};
  for (const { id, base, shadow } of MATERIALS) {
    ramps[id] = buildRamp(
      getRole(palette, base),
      shadow ? getRole(palette, shadow) : null,
      { spread, valueBias: bias[id] ?? 0 },
    );
  }
  return ramps;
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
 * Darken a measured outline until it sits clear of the darkest material shadow.
 *
 * Sampling the darkest pixels of a painting gives an honest colour that does not
 * work as an outline. Rather than substituting black — which no fresco contains and
 * which makes a sprite look like a cartoon pasted on the stage — keep the sampled hue
 * and push its value down until the silhouette reads.
 */
export function deepenOutline(outlineHex, ramps, { minOutlineGap = 28, margin = 3 } = {}) {
  const darkestShadow = Math.min(...Object.values(ramps).map((stops) => luminance(stops[2])));
  let rgb = hexToRgb(outlineHex);
  let guard = 0;
  // Aim a little past the threshold: the return value is a rounded hex, and rounding
  // down can otherwise land just under the gap this loop was trying to clear.
  while (darkestShadow - luminance(rgb) < minOutlineGap + margin && guard < 40) {
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
    const darkestShadow = Math.min(...Object.values(ramps).map((stops) => luminance(stops[2])));
    const gap = darkestShadow - luminance(outline);
    if (gap < minOutlineGap) {
      problems.push(
        `Outline is only ${gap.toFixed(0)} luma below the darkest shadow (want ${minOutlineGap}+) — the silhouette will not read`,
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
