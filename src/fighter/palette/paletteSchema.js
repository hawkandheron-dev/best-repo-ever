/**
 * The character palette — ten colour roles that drive everything a fighter is made of.
 *
 * Shared limb sprites are drawn in these colours, and the head cut from the source
 * painting is *quantised* to them. That second use is the one that makes the hybrid
 * work: a fresco head reduced to the same ten colours as the body reads as part of
 * the same sprite instead of a photograph pasted onto a cartoon.
 *
 * Only base colours are stored. Light and shadow stops are derived in `ramp.js`,
 * because storing three tones for each of three garment materials plus skin plus
 * hair would be fifteen numbers to hand-edit whose relationships are mechanical.
 */

import { hexToRgb, luminance } from './color';

export const PALETTE_VERSION = 1;

/** Every role, in the order the editor should present them. */
export const PALETTE_ROLES = [
  { path: 'skin.primary', label: 'Skin base', group: 'Skin' },
  { path: 'skin.secondary', label: 'Skin shadow', group: 'Skin' },
  { path: 'hair.primary', label: 'Hair base', group: 'Hair' },
  { path: 'hair.secondary', label: 'Hair shadow', group: 'Hair' },
  { path: 'outfit.primary', label: 'Outer garment', group: 'Outfit' },
  { path: 'outfit.secondary', label: 'Under garment', group: 'Outfit' },
  { path: 'outfit.tertiary', label: 'Trim & hems', group: 'Outfit' },
  { path: 'outline', label: 'Outline', group: 'Other' },
  { path: 'accent', label: 'Leather & props', group: 'Other' },
  { path: 'element', label: 'Elemental', group: 'Other' },
];

/**
 * Materials that get a three-stop ramp, and where each takes its base and shadow.
 *
 * Skin and hair store two colours, so their shadow is measured rather than derived
 * and only the light stop is invented. Garment materials store one colour each and
 * derive both stops.
 */
export const MATERIALS = [
  { id: 'skin', base: 'skin.primary', shadow: 'skin.secondary' },
  { id: 'hair', base: 'hair.primary', shadow: 'hair.secondary' },
  { id: 'outfitP', base: 'outfit.primary', shadow: null },
  { id: 'outfitS', base: 'outfit.secondary', shadow: null },
  { id: 'outfitT', base: 'outfit.tertiary', shadow: null },
];

/**
 * How far the legibility pass pushes measured colours around.
 *
 * Frescoes are low-contrast to begin with and downsampling averages them flatter
 * still, so faithfully measured colours quantise to mush — on the Aristotle crop,
 * measured skin and hair were 21 luma apart and indistinguishable at sprite size.
 * `spread` widens each ramp around its base; `separate` pulls whole materials apart,
 * lifting skin and dropping hair. Defaults are the values that made that head read.
 */
export const DEFAULT_BOOST = { spread: 1.7, separate: 1 };

/** No boost at all — the measured palette, used as-is. */
export const NO_BOOST = { spread: 1, separate: 0 };

export function createPalette(overrides = {}) {
  return {
    skin: { primary: '#D3A175', secondary: '#A87F58' },
    hair: { primary: '#8A6E4A', secondary: '#5E4A32' },
    outfit: { primary: '#9FAFC1', secondary: '#856848', tertiary: '#C6A46A' },
    outline: '#3A2E22',
    accent: '#8C7259',
    element: '#C0552C',
    ...overrides,
  };
}

/** Read a dotted role path out of a palette. */
export function getRole(palette, path) {
  return path.split('.').reduce((node, key) => node?.[key], palette);
}

/** Return a copy of `palette` with one dotted role path replaced. */
export function setRole(palette, path, value) {
  const keys = path.split('.');
  if (keys.length === 1) return { ...palette, [keys[0]]: value };
  const [head, ...rest] = keys;
  return { ...palette, [head]: setRole(palette[head] ?? {}, rest.join('.'), value) };
}

/**
 * Check a palette is usable. Returns human-readable problems, never throws — the
 * editor calls this on every keystroke.
 */
export function validatePalette(palette) {
  const problems = [];
  if (!palette || typeof palette !== 'object') return ['Palette is not an object'];

  for (const { path, label } of PALETTE_ROLES) {
    const value = getRole(palette, path);
    if (typeof value !== 'string') {
      problems.push(`${label} (${path}) is missing`);
      continue;
    }
    try {
      hexToRgb(value);
    } catch {
      problems.push(`${label} (${path}) is not a hex colour: ${value}`);
    }
  }
  if (problems.length > 0) return problems;

  // The outline has to be the darkest thing on the sprite or it stops reading as an
  // edge and starts reading as a stripe.
  const outlineLuma = luminance(hexToRgb(palette.outline));
  for (const { id, base } of MATERIALS) {
    const baseLuma = luminance(hexToRgb(getRole(palette, base)));
    if (outlineLuma >= baseLuma) {
      problems.push(`Outline is not darker than ${id} base — it will read as a stripe, not an edge`);
    }
  }

  // Two roles landing on the same colour silently merges two materials.
  const seen = new Map();
  for (const { path, label } of PALETTE_ROLES) {
    if (path === 'element') continue; // element is FX-only; collisions there are harmless
    const value = getRole(palette, path).toUpperCase();
    if (seen.has(value)) problems.push(`${label} and ${seen.get(value)} are the same colour (${value})`);
    else seen.set(value, label);
  }

  return problems;
}
