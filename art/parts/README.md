# Drawn parts

The body and garment sprites, drawn once and coloured per character.

`standard.json` is written by hand-drawing in the **pixel studio** and pasting the export
back here. `npm run buildstudio` reads it, so reopening the studio resumes where you left
off rather than starting from a blank canvas.

## Why it is not a PNG

A part stores INK, not colour. Every pixel names a material and a stop on that material's
ramp — `skin.base`, `outfitP.shadow`, `outline` — so the same drawing is Aristotle's blue
himation and Heraclitus's mauve tunic without either being redrawn. A dozen philosophers
in variations on a draped rectangle is a dozen palettes over a handful of shapes.

One character per pixel means a sleeve change is legible in a pull request diff. It would
not be in base64.

## The loop

```
npm run buildstudio   # -> art/editor/pixel-studio.html
```

Draw, then **Copy all parts** and save the JSON as `art/parts/standard.json`.

The canvas shows the bone in pink: the dot is where the part hangs and the ring is the
joint it has to reach. Draw past the ring and the limb overlaps the next one; stop short
and the figure comes apart at the knee.

Parts are authored in **rest orientation** — an upper arm hangs down, so you draw a
vertical arm. The renderer counter-rotates by the bone's accumulated rest angle.

## Still to come

Nothing consumes `standard.json` yet. Packing drawn parts into `heads.sheet.png` beside
the cut faces, so a kit ships as one image, is the next piece of work.
