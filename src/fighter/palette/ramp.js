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
 * Flatten ramps into the target list a quantiser matches against.
 * Includes the outline and accent, which are single colours rather than ramps.
 */
export function quantisationTargets(palette, boost = DEFAULT_BOOST) {
  const ramps = buildRamps(palette, boost);
  const stopNames = ['light', 'base', 'shadow'];
  const targets = [];

  for (const [id, stops] of Object.entries(ramps)) {
    stops.forEach((rgb, i) => targets.push({ name: `${id}.${stopNames[i]}`, rgb }));
  }
  targets.push({ name: 'outline', rgb: hexToRgb(palette.outline) });
  targets.push({ name: 'accent', rgb: hexToRgb(palette.accent) });
  return targets;
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
export function checkRamps(ramps, { minSkinHairGap = 40 } = {}) {
  const problems = [];

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
