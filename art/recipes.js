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

    /**
     * Hair through beard, plus a little neck so the head seats on the shoulders.
     *
     * `flip` because Raphael painted him facing left and rig space runs +x forward.
     * Without it the fighter walks forward while looking over his shoulder — which is
     * exactly what shipped before anyone checked.
     */
    head: { crop: [148, 18, 132, 174], flip: true },

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

  {
    id: 'pythagoras',
    name: 'Pythagoras',
    epithet: 'Of Samos',
    school: 'presocratic',
    doctrine: 'All is number',
    element: 'number',
    source: {
      file: 'art/sources/pythagoras-school-of-athens.webp',
      title: 'The School of Athens (detail)',
      artist: 'Raphael',
      year: 1511,
      url: 'https://commons.wikimedia.org/wiki/File:Sanzio_01.jpg',
      license: 'public-domain',
      note: 'Figure 6 in the standard identification key. Seated, writing, with a slate held for him.',
    },

    samples: {
      // His head is bowed, so the LIT skin is the bald pate, not the cheek — the
      // face itself sits in shadow and sampling it drags the base far too dark.
      'skin.primary': [[410, 25, 60, 50], [452, 172, 32, 26]],
      'skin.secondary': [[512, 425, 28, 24]],
      'hair.primary': [[312, 100, 52, 48], [416, 212, 48, 42]],
      'hair.secondary': [[440, 262, 30, 26]],
      // The salmon tunic: a lit fold and a mid one.
      'outfit.primary': [[205, 380, 55, 50], [215, 300, 55, 48]],
      // The white himation, sampled where it is genuinely lit rather than in the
      // shadowed hollow on the left, which reads grey.
      'outfit.secondary': [[405, 660, 70, 60], [310, 755, 66, 56]],
      // The deeper terracotta beneath the sleeve.
      'outfit.tertiary': [[195, 465, 50, 50]],
      // The wooden edge of the slate.
      accent: [[540, 520, 52, 26]],
    },

    outlineFrom: [110, 20, 600, 1040],

    /** Number: a clear teal, chosen to sit apart from every other element on the roster. */
    element_color: '#3FA9A0',

    /**
     * He already faces forward in the fresco, so no mirror — but he needs a traced
     * silhouette. His head is bounded by his own robe below, the slate to the right
     * and another figure beyond it, so nothing pale connects to the crop border and
     * flood-fill masking has nothing to bite on.
     */
    head: {
      crop: [296, 10, 240, 310],
      flip: false,
      /** He is bent over his writing; straighten him so the profile reads upright. */
      rotate: 30,
      mask: [
        [402, 18], [452, 26], [492, 78], [512, 138], [524, 186], [508, 248],
        [472, 300], [430, 310], [392, 288], [356, 250], [316, 190], [306, 128],
        [330, 58], [366, 26],
      ],
    },

    accessory: null,

    /**
     * KNOWN LIMITATION: this head does not read as a face.
     *
     * The palette is sound and worth keeping — salmon tunic, white himation,
     * terracotta under-sleeve is a genuinely distinct roster entry. The head is not.
     * Raphael painted Pythagoras bent forward over his writing, so the face is
     * foreshortened, turned away and in deep shadow, and what is actually lit is the
     * bald pate. Masking, straightening and re-cropping were all tried; none of them
     * put a face there, because there is no legible face in the source at this scale.
     *
     * The constraint on the roster is therefore not "is he in the fresco" but "is his
     * face upright, in profile, and lit". Aristotle passes; this figure does not.
     * Replace with a Roman bust portrait when one is to hand.
     */
    notes: 'Head unusable — figure is bowed over his writing. Palette is good; wants a bust for the face.',
  },
];

export function findRecipe(id) {
  return RECIPES.find((r) => r.id === id) ?? null;
}
