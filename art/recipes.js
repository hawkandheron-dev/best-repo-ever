/**
 * Kit recipes: what to sample and what to cut, per philosopher.
 *
 * This file is the hand-authored half of the pipeline — the part that needs someone
 * (or something) to look at a painting and say "the himation is here, the beard is
 * there, crop the head like this". Everything downstream of it is mechanical.
 *
 * All coordinates are pixels in the source image. `scripts/buildkit.js` turns a
 * recipe into a palette, a quantised head sprite and a kit entry.
 *
 * Sampling notes that matter:
 *  - Patches take a MEDIAN, so a single specular highlight cannot skew a role.
 *  - Keep patches well inside the figure. A crop of a crowded fresco contains the
 *    neighbours, and a box that strays picks up someone else's robe. The build
 *    reports each patch's spread; anything above ~90 straddled an edge and should be
 *    moved rather than trusted.
 */

export const RECIPES = [
  {
    id: 'aristotle',
    name: 'Aristotle',
    epithet: 'The Philosopher',
    school: 'classical',
    doctrine: 'The soul never thinks without an image',
    element: 'aether',
    source: {
      file: 'art/sources/aristotle-school-of-athens.webp',
      title: 'The School of Athens (detail)',
      artist: 'Raphael',
      year: 1511,
      url: 'https://commons.wikimedia.org/wiki/File:Sanzio_01.jpg',
      license: 'public-domain',
      note: 'Central figure holding the Ethics, gesturing toward the earth.',
    },

    /**
     * Each role takes the median of one or more patches. Where a material spans a
     * wide range — the himation runs from #A8BDD4 in the light to #63809F in the deep
     * folds — several patches across that range average to something representative
     * rather than accidentally sampling only the brightest fold.
     */
    samples: {
      'skin.primary': [[193, 108, 16, 14], [206, 92, 16, 12]],
      'skin.secondary': [[186, 140, 16, 14]],
      'hair.primary': [[204, 40, 26, 18], [196, 148, 24, 22]],
      'hair.secondary': [[180, 166, 16, 14]],
      'outfit.primary': [[150, 250, 34, 30], [96, 566, 26, 26], [180, 640, 34, 30]],
      'outfit.secondary': [[246, 762, 32, 28], [198, 842, 26, 24]],
      'outfit.tertiary': [[230, 214, 16, 18]],
      accent: [[204, 938, 20, 14]],
    },

    /** Outline comes from the darkest 2% inside this box, never from pure black. */
    outlineFrom: [60, 20, 332, 980],

    /** Aristotle's aether: a luminous pale gold, not a measured colour but a choice. */
    element_color: '#E0CE8A',

    /** Hair through beard, plus a little neck so the head seats on the shoulders. */
    head: { crop: [148, 18, 132, 174] },

    /**
     * No accessory cut from the source.
     *
     * The Ethics was tried and abandoned. Background masking cannot help an object
     * sitting against a dark robe rather than a pale wall, so the crop stayed a
     * rectangular slab of brown and gold that read as nothing at 30 px. The
     * conclusion generalises: accessories should be DRAWN in the palette, exactly as
     * the limbs are, not cut from paintings. A book, a sundial or Archimedes' screw
     * is a handful of shapes at sprite size, and most of the roster — Anaximander's
     * gnomon, Thales' water — has no source painting to cut from at all.
     *
     * A head is the one thing worth cutting, because a face is irreducibly specific.
     */
    accessory: null,
  },
];

export function findRecipe(id) {
  return RECIPES.find((r) => r.id === id) ?? null;
}
