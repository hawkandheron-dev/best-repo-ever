/**
 * Borrowing a bust's SHAPE and a painting's COLOUR.
 *
 * Some philosophers have no usable painted portrait. Raphael put Pythagoras bent over
 * his writing, so the face is foreshortened, turned away and in shadow; no amount of
 * cropping puts a profile there. The fresco is still the best colour reference we have
 * for him — it is a contemporary reading of what these people wore, and it supplies the
 * accessory ideas too — but the geometry has to come from somewhere else.
 *
 * A Roman bust is the somewhere else. It gives a clean, lit, upright profile and nothing
 * but head. What it does not give is colour: a bronze is one hue from crown to beard,
 * and quantising it against a painted palette maps the whole thing onto whichever
 * material happens to sit nearest that green-black.
 *
 * So the bust is treated as a HEIGHT FIELD rather than a picture. Regions are traced
 * once by hand — this is hair, this is face, this is neck — and inside each region the
 * sculpture's own luminance is stretched to its full range and posterised onto that
 * material's ramp. Deep carving becomes outline, mid-tones become the base, and the
 * ridges the sculptor polished become the light stop. The result reads as the bust's
 * modelling wearing the painting's colours, which is the point.
 *
 * Pure and headless: takes and returns `{ width, height, data }`, so the same code runs
 * in the build script and in the browser.
 */

import { luminance } from './color';

/**
 * Bands are cut by RANK, not by value: `upTo` is the fraction of the region's pixels
 * below the cut, so a band always gets the share of the sprite it asks for.
 *
 * This matters because a photographed sculpture's histogram is heavily bottom-weighted —
 * carved hair is mostly groove — and splitting its luminance range into even slices puts
 * three quarters of the head in the darkest one. Equalising by rank instead spends the
 * whole ramp on every region regardless of how the light happened to fall, which is the
 * behaviour a height field wants.
 */

/**
 * Hair, beards, drapery: surfaces whose drawing IS the carving.
 *
 * The `outline` band is what makes them read. The floors of the grooves are the lines of
 * the drawing; mapping them to the material's own shadow turns a head of hair into a
 * grey smudge, while mapping them to the outline colour keeps the strands separate all
 * the way down to sprite size.
 */
export const CARVED_BANDS = [
  { upTo: 0.12, stop: 'outline' },
  { upTo: 0.40, stop: 'shadow' },
  { upTo: 0.74, stop: 'base' },
  { upTo: Infinity, stop: 'light' },
];

/**
 * Skin: a smooth surface, modelled rather than cut.
 *
 * No outline band. A face has no grooves to draw, and forcing a share of it to the
 * darkest colour available punches holes in the cheek — the eye socket and the shadow
 * under the brow are already the darkest thing there and land in `shadow` anyway.
 */
export const SMOOTH_BANDS = [
  { upTo: 0.26, stop: 'shadow' },
  { upTo: 0.68, stop: 'base' },
  { upTo: Infinity, stop: 'light' },
];

/** Per-material bands, with a fallback for anything unlisted. */
export const DEFAULT_BANDS = { hair: CARVED_BANDS, default: SMOOTH_BANDS };

/** Where each named stop sits in a `[light, base, shadow]` ramp. */
const STOP_INDEX = { light: 0, base: 1, shadow: 2 };

/**
 * Cumulative luminance distribution of one region, as 256 bins.
 *
 * `at(luma)` gives the fraction of the region at or below that luminance, which is the
 * rank the bands are cut on. A histogram rather than a sorted list because it is one
 * pass, fixed size, and free of any dependence on sort stability — the build has to be
 * byte-reproducible and a comparator on equal values is not somewhere to gamble that.
 */
export function regionCdf(image, regionMap, regionId) {
  const bins = new Float64Array(256);
  let pixels = 0;
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < regionMap.length; i++) {
    if (regionMap[i] !== regionId) continue;
    const p = i * 4;
    if (image.data[p + 3] < 8) continue;
    const l = Math.max(0, Math.min(255, Math.round(luminance([image.data[p], image.data[p + 1], image.data[p + 2]]))));
    bins[l]++;
    pixels++;
    if (l < lo) lo = l;
    if (l > hi) hi = l;
  }
  if (pixels === 0) return null;

  // Midpoint accumulation: a bin's rank is the middle of the span it occupies, not its
  // top. Using the top would push a region of one flat luminance to rank 1.0 and paint
  // the whole thing with the lightest stop.
  const cdf = new Float64Array(256);
  let below = 0;
  for (let l = 0; l < 256; l++) {
    cdf[l] = (below + bins[l] / 2) / pixels;
    below += bins[l];
  }
  return { cdf, pixels, lo, hi };
}

/** Which band a rank falls in, for a given band list. */
export function bandFor(rank, bands) {
  return (bands.find((b) => rank < b.upTo) ?? bands[bands.length - 1]).stop;
}

/** The band list for a material, from a per-material table. */
export function bandsFor(material, table = DEFAULT_BANDS) {
  return table[material] ?? table.default;
}

/**
 * Repaint a monochrome cutout in palette colours, region by region.
 *
 * `regionMap` is one byte per pixel, parallel to `image`, holding the region id that
 * pixel was traced into; `regions` maps those ids to material names. Ids with no entry
 * are left untouched, which is how an unmapped background survives to be flood-filled
 * away later.
 *
 * Returns the repainted image plus per-region diagnostics, because a region that came
 * out with almost no pixels means a polygon was traced in the wrong place and that is
 * far easier to see in a number than in a 49-pixel sprite.
 */
export function remapByRegion(image, regionMap, { regions, ramps, outline, bands = DEFAULT_BANDS }) {
  const out = {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data),
  };
  const stats = [];

  for (const [rawId, material] of Object.entries(regions)) {
    const id = Number(rawId);
    const ramp = ramps[material];
    if (!ramp) {
      stats.push({ id, material, pixels: 0, error: `no ramp for material "${material}"` });
      continue;
    }
    const dist = regionCdf(image, regionMap, id);
    if (!dist) {
      stats.push({ id, material, pixels: 0, error: 'region is empty — check the polygon' });
      continue;
    }

    const table = bandsFor(material, bands);
    const counts = { outline: 0, shadow: 0, base: 0, light: 0 };
    for (let i = 0; i < regionMap.length; i++) {
      if (regionMap[i] !== id) continue;
      const p = i * 4;
      if (out.data[p + 3] < 8) continue;
      const l = Math.max(0, Math.min(255, Math.round(luminance([out.data[p], out.data[p + 1], out.data[p + 2]]))));
      const stop = bandFor(dist.cdf[l], table);
      counts[stop]++;
      const rgb = stop === 'outline' ? outline : ramp[STOP_INDEX[stop]];
      out.data[p] = rgb[0];
      out.data[p + 1] = rgb[1];
      out.data[p + 2] = rgb[2];
    }
    stats.push({ id, material, pixels: dist.pixels, range: [dist.lo, dist.hi], counts });
  }

  return { image: out, stats };
}

/**
 * Assign a region id to every material named in a recipe's `regions` block.
 *
 * The base material takes id 1 and each traced material takes the next id in sorted key
 * order, so the same recipe always produces the same map — the build has to be
 * reproducible byte for byte, and an id that depends on object iteration order is
 * exactly the kind of thing that quietly stops being reproducible.
 */
export function assignRegionIds(regions) {
  const ids = { 1: regions.base };
  const polygons = [];
  let next = 2;
  for (const material of Object.keys(regions).filter((k) => k !== 'base').sort()) {
    ids[next] = material;
    for (const polygon of regions[material]) polygons.push({ id: next, polygon });
    next++;
  }
  return { ids, polygons };
}
