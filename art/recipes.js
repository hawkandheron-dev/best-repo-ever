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
 *
 * A recipe comes in one of two forms.
 *
 *  - ONE SOURCE. `source` + `samples` + `head`: the painting supplies both the colours
 *    and the face. This is the good case and it needs the figure to be painted upright,
 *    in profile and lit. Aristotle is the only one so far who is.
 *
 *  - TWO SOURCES. `shape` points at a bust for the geometry; `source` + `samples` (or,
 *    failing that, hand-set `colour.values`) supply the palette. Sculpture gives a clean
 *    profile and no colour at all, so the bust is treated as a height field: regions are
 *    traced by hand and each one's luminance is posterised onto its material's ramp. See
 *    `src/fighter/palette/shapeMap.js`.
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

  {
    id: 'heraclitus',
    name: 'Heraclitus',
    epithet: 'The Obscure',
    school: 'presocratic',
    doctrine: 'Everything flows',
    element: 'fire',

    /**
     * SHAPE from a bust. The first two-source recipe, and the reason the format exists.
     *
     * The bust is the bronze "pseudo-Seneca" from the Villa dei Papiri at Herculaneum —
     * a Hellenistic poet-philosopher type, most often argued to be Hesiod. It is NOT a
     * portrait of Heraclitus, and nothing here claims it is; no securely identified
     * likeness of Heraclitus survives, as is true of nearly every Presocratic. What it
     * is, is the right FACE for him: an intense, deeply carved, downturned profile,
     * upright and evenly lit, which is precisely what the fresco could not give.
     */
    shape: {
      file: 'art/sources/bust-bronze-philosopher.webp',
      source: {
        title: 'Bronze bust of a bearded philosopher ("pseudo-Seneca" type)',
        artist: 'Unknown, after a Hellenistic original',
        year: -50,
        url: 'https://commons.wikimedia.org/wiki/Category:Pseudo-Seneca',
        license: 'public-domain',
        note: 'Villa dei Papiri, Herculaneum. Used for geometry only — not a portrait of Heraclitus.',
      },

      /** Crown of the hair down through the beard, with the neck behind it. */
      crop: [0, 0, 1206, 1560],

      /** He faces left in the photograph; rig space runs +x forward. */
      flip: true,

      /**
       * The silhouette. Loose everywhere it runs through the backdrop — the flood fill
       * clears that — and tight in exactly two places: down the back of the neck, where
       * the head has to be cut off the shoulder, and along the left of the beard, where
       * it has to be cut off the chest. Both junctions are the same bronze on both
       * sides, so no colour test can find them and a hand-traced line is the only way.
       */
      mask: [
        [0, 0], [1206, 0], [1206, 470], [1186, 556], [1136, 612], [1046, 662],
        [952, 706], [884, 766], [858, 880], [852, 1000], [800, 1120], [762, 1240],
        [716, 1340], [688, 1444], [664, 1548], [552, 1508], [478, 1462], [428, 1408],
        [392, 1322], [352, 1240], [330, 1155], [292, 1078], [240, 1002], [0, 648],
      ],

      /**
       * The backdrop, so the fill has something to match. A gallery cream sits well
       * below any brightness threshold that a lit forehead would survive, which is why
       * this is a colour rather than a cutoff.
       */
      background: { rgb: '#D2D2C2', tolerance: 55 },

      /**
       * Which material each part of the bronze stands for.
       *
       * Hair is the base because it is most of the head — cranium, the roll at the nape,
       * and that enormous beard — and because anything mistakenly left to the base ends
       * up dark, which reads as shadow rather than as a mistake. One patch of skin is
       * carved out of it: the face, bounded by the hairline above, the profile in front
       * and the moustache below.
       *
       * The ear and the sliver of neck below the nape roll are deliberately left as
       * hair. Both sit in shadow, and at 49 px each is two or three pixels across.
       */
      regions: {
        base: 'hair',
        skin: [
          [
            [14, 590], [120, 596], [230, 616], [320, 660], [400, 706], [460, 790],
            [490, 875], [470, 930], [420, 975], [350, 1002], [290, 1002], [245, 988],
            [203, 932], [158, 858], [113, 778], [68, 698], [36, 634],
          ],
        ],
      },
    },

    /**
     * COLOUR, provisional.
     *
     * The formula calls for the School of Athens here — Heraclitus is figure 13, the
     * brooding figure on the steps that Raphael modelled on Michelangelo, in a violet
     * tunic with a pale undershirt and orange-brown boots. That crop has not reached
     * this repository, so every value below is a guess and the build says so on every
     * run. Replace `colour` with `source` + `samples` the moment the image is to hand;
     * nothing else in the recipe has to change.
     *
     * The boots are the point of keeping the fresco in the loop at all. A bust gives a
     * head; only the painting says this man wore boots when everyone around him is
     * barefoot, and that is the sort of detail a roster of near-identical draped Greeks
     * needs in order to be told apart.
     */
    colour: {
      after: 'the School of Athens, figure 13 (violet tunic, pale undershirt, orange boots)',
      values: {
        'skin.primary': '#C08A62',
        'skin.secondary': '#9A6B4C',
        'hair.primary': '#5A4536',
        'hair.secondary': '#3D2E24',
        'outfit.primary': '#6B4E7A',
        'outfit.secondary': '#C9C2B4',
        'outfit.tertiary': '#A85B2E',
        accent: '#8A6A44',
        outline: '#241C18',
      },
    },

    /** Fire: the one element that is also a doctrine about change. */
    element_color: '#E8622A',

    accessory: null,

    notes: 'Shape from the pseudo-Seneca bronze; palette PROVISIONAL until the School of Athens crop arrives.',
  },
];

export function findRecipe(id) {
  return RECIPES.find((r) => r.id === id) ?? null;
}

/**
 * Split a recipe into the two things a kit actually needs: something to take the SHAPE
 * from, and something to take the COLOUR from.
 *
 * Both forms above collapse to the same pair here, so the builder and the tests never
 * have to ask which form a recipe was written in — and never disagree about the answer.
 */
export function resolveRecipe(recipe) {
  const shape = recipe.shape
    ? { ...recipe.shape, provenance: recipe.shape.source }
    : { ...recipe.head, file: recipe.source.file, provenance: recipe.source };

  const colour = recipe.samples
    ? {
      measured: true,
      file: recipe.source.file,
      samples: recipe.samples,
      outlineFrom: recipe.outlineFrom,
      provenance: recipe.source,
      after: null,
    }
    : {
      measured: false,
      values: recipe.colour.values,
      provenance: null,
      after: recipe.colour.after ?? null,
    };

  return { shape, colour };
}
