# Kit build inputs

Everything here is a build input, not shipped code. `npm run buildkit` reads it and
writes the resource the app consumes:

```
public/philosophers/kits.json        palettes, sheet regions, provenance
public/philosophers/heads.sheet.png  packed quantised head sprites
```

## The split, and why it is where it is

| Stage | Where | Why there |
|---|---|---|
| Deciding "this patch is the himation" | the Claude conversation → `recipes.js` | Needs someone to look at a painting |
| Measuring, cutting, quantising, packing | `npm run buildkit` | Mechanical and must be deterministic |
| Adjusting the palette by eye | `editor/pigment-card.html` | Needs a human eye and instant feedback |
| Playing the character | the app | Deferred: kit import is not built yet |

## Two sources: bust for the shape, painting for the colour

The roster's binding constraint is not "is he in the painting" but **"is his face
upright, in profile, and lit"**. Aristotle passes. Pythagoras does not — Raphael painted
him bent over his writing, so the face is foreshortened, turned away and in shadow, and
no crop, rotation or mask puts a profile there.

So a recipe may take its geometry from one image and its colour from another:

| | comes from | because |
|---|---|---|
| **Shape** — silhouette, profile, the carving | a Roman or Hellenistic **bust** | Sculpture gives a clean lit profile and nothing but head, which is all a kit needs |
| **Colour** — ten palette roles, accessory ideas | the **painting** | A bust is one hue from crown to beard. The painting is a reading of what these people wore |

A bronze quantised straight against a painted palette maps the whole head onto whichever
material happens to sit nearest that green-black. So the bust is treated as a **height
field** instead: regions are traced by hand — this is hair, this is face — and inside
each one the sculpture's own luminance is posterised onto that material's ramp, by rank
rather than by value. Deep carving becomes outline, mid-tones the base, polished ridges
the light stop. See `src/fighter/palette/shapeMap.js`.

The painting keeps earning its place even when none of its pixels ship. Heraclitus wears
**orange boots** in the School of Athens when everyone around him is barefoot — a bust
could never tell you that, and on a roster of near-identical draped Greeks it is exactly
the sort of detail that tells two of them apart. They take `outfit.tertiary` outright
rather than being filed away as a detail.

The kit records both: `source` is the shape provenance, because the licence obligation
follows the pixels that ship, and `paletteSource` is the painting.

## Adding a philosopher

1. Put the cropped source in `sources/`. Crop tightly — a crop of a crowded fresco
   contains the neighbours, and a sample box that strays picks up someone else's robe.
2. Add a recipe to `recipes.js`: sample patches per role, an outline box, a head crop.
   If the face is not usable, add a `shape` block pointing at a bust instead, with a
   traced silhouette, its backdrop colour, and the material regions.
3. `npm run buildkit -- --verbose` and read the warnings. A patch spread above ~90
   straddled an edge; move the box rather than trusting the value.
4. Open `editor/pigment-card.html` to adjust by eye, then export.

### Tracing a bust

The polygons are read off the source by eye, which is fiddly but only has to happen once
per character. What actually matters:

- The **silhouette** can be loose wherever it runs through the backdrop — the flood fill
  clears that. It has to be tight in exactly the places where the head meets more bronze:
  the back of the neck and, on a long-bearded figure, the beard against the chest. No
  colour test can find those junctions.
- **Cut the neck short.** A generous neck is a large pale slab next to a small face, and
  at 49 px it competes with the head instead of supporting it.
- The **backdrop colour** has to be named, not thresholded. A gallery cream sits well
  below any brightness cutoff that a lit forehead would survive.

Two things the build will tell you and you should believe:

- **A colour swallowing over half a sprite** means the crop or the background mask is
  wrong, not that the painting is unusual.
- **Skin and hair within 40 luma** means the face will read as mush at sprite size.
  Frescoes are faded; that is what the boost is for. How hard it pushes is prescribed by
  the palette rather than fixed — a character who arrived with contrast keeps it, because
  darkening hair unconditionally turns a bust-derived head, which is mostly hair, black.
- **A PROVISIONAL palette** means nothing was measured and every role is a guess. It is
  reported on every build until a colour source is supplied.
- **`lifted off the floor`** means a material was too dark to show three distinct stops
  and was raised until it could. Ramp stops are multiplicative on value, so a base at
  v=0.24 puts its shadow at 0.15 and its light at 0.31 — one smear, not three colours,
  with an outline still to fit underneath. Renaissance frescoes are full of near-black
  hair and a bust-derived head is mostly hair, so this fires often. `measured` keeps the
  untouched values.

## What gets cut, and what does not

Only the **head**, and optionally a garment. Limbs, hands, fists and feet are shared
sprites coloured from the palette. Accessories should be **drawn** in the palette too —
a cut accessory was tried and abandoned (see the note in `recipes.js`), and most of the
roster has no source painting to cut one from anyway.

A face is the one thing worth cutting, because a face is irreducibly specific.

## The editor is a copy

`editor/pigment-card.html` is a self-contained snapshot published as an artifact, with
the head inlined as a data URI and the palette maths ported inline — artifacts run under
a CSP that blocks every external fetch. It is kept here so the tool is in version
control, but it does **not** import from `src/`. If the ramp maths in
`src/fighter/palette/ramp.js` changes, this file needs the same change.
