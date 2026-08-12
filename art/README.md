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

## Adding a philosopher

1. Put the cropped source in `sources/`. Crop tightly — a crop of a crowded fresco
   contains the neighbours, and a sample box that strays picks up someone else's robe.
2. Add a recipe to `recipes.js`: sample patches per role, an outline box, a head crop.
3. `npm run buildkit -- --verbose` and read the warnings. A patch spread above ~90
   straddled an edge; move the box rather than trusting the value.
4. Open `editor/pigment-card.html` to adjust by eye, then export.

Two things the build will tell you and you should believe:

- **A colour swallowing over half a sprite** means the crop or the background mask is
  wrong, not that the painting is unusual.
- **Skin and hair within 40 luma** means the face will read as mush at sprite size.
  Frescoes are faded; that is what the boost is for.

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
