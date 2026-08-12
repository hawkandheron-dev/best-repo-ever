/**
 * Colour-space conversions and small colour utilities.
 *
 * Pure and DOM-free so the headless kit builder and the browser both use the same
 * maths. Previously `hexToHsv`/`hsvToHex` lived privately inside
 * `src/components/SpriteCanvas/GradientColorPicker.jsx` — the only colour maths in
 * the repo. They belong here, with one implementation rather than two.
 */

/** '#rrggbb' → [r, g, b], each 0-255. Tolerates a missing '#' and 3-digit shorthand. */
export function hexToRgb(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Not a hex colour: ${hex}`);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** [r, g, b] → '#RRGGBB', clamped and rounded. */
export function rgbToHex(rgb) {
  return `#${rgb
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

/** [r, g, b] 0-255 → [h 0-360, s 0-1, v 0-1]. */
export function rgbToHsv([r, g, b]) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

/** [h, s, v] → [r, g, b] 0-255. */
export function hsvToRgb([h, s, v]) {
  const c = v * s;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const seg = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][Math.floor(hh) % 6];
  const m = v - c;
  return seg.map((n) => (n + m) * 255);
}

export const hexToHsv = (hex) => rgbToHsv(hexToRgb(hex));
export const hsvToHex = (hsv) => rgbToHex(hsvToRgb(hsv));

/** Rec. 601 luma, 0-255. Green dominates because the eye weights it most. */
export function luminance([r, g, b]) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Rotate a hue toward `target` by at most `amount` degrees, taking the short way
 * around the wheel.
 *
 * Warming a colour as it lightens and cooling it as it darkens is what separates a
 * hand-authored pixel ramp from a flat lightness multiply — real pigment shifts hue
 * under light, and ramps that don't look plastic.
 */
export function towardHue(h, target, amount) {
  const delta = (((target - h + 540) % 360) - 180);
  const moved = h + Math.sign(delta) * Math.min(Math.abs(delta), amount);
  // Normalised to [0, 360). `hsvToRgb` would cope with -5, but callers that compare
  // hues to decide whether a stop drifted warm or cool would not.
  return ((moved % 360) + 360) % 360;
}

/**
 * Perceptually weighted squared distance between two RGB triples.
 *
 * Cheap stand-in for a Lab metric: weights green heaviest, then blue, then red,
 * which tracks perceived difference far better than plain Euclidean RGB and costs
 * three multiplies. Squared, so it is only ever compared, never reported.
 */
export function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
}

/** Multiply a colour's value channel — used to push far-side limbs back. */
export function darken(rgb, factor) {
  const [h, s, v] = rgbToHsv(rgb);
  return hsvToRgb([h, s, Math.max(0, Math.min(1, v * factor))]);
}

/** Median of a numeric array. Mutates a copy, not the input. */
export function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}
