/**
 * Build the philosopher kit resource. Run with `npm run buildkit`.
 *
 * Reads the hand-authored recipes in `art/recipes.js`, measures each source painting,
 * cuts and quantises the sprites, packs them into one sheet, and writes:
 *
 *   public/philosophers/kits.json        the resource — palettes and sheet regions
 *   public/philosophers/heads.sheet.png  the packed sprites
 *
 * Chromium does the decoding and the resampling, because nothing else installed here
 * reads WebP and canvas gives high-quality downscaling for free. Everything between
 * decode and encode runs through the same pure modules the app uses, so what this
 * script produces is exactly what the game would produce from the same palette.
 *
 * Deterministic by construction: same inputs, byte-identical outputs. Run it twice and
 * diff if you doubt that.
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

import { RECIPES, resolveRecipe } from '../art/recipes.js';
import { rgbToHex, hexToRgb, luminance } from '../src/fighter/palette/color.js';
import { createPalette, validatePalette, DEFAULT_BOOST, NO_BOOST } from '../src/fighter/palette/paletteSchema.js';
import { quantisationTargets, buildRamps, checkRamps, rampsToHex, deepenOutline, separationFor, liftedMaterials, SPRITE_MATERIALS } from '../src/fighter/palette/ramp.js';
import { spriteify, opaqueBounds, cropImage } from '../src/fighter/palette/quantize.js';
import { remapByRegion, assignRegionIds } from '../src/fighter/palette/shapeMap.js';
import { createKit, createKitsDocument, upsertKit, validateKits, findSheetOverlaps } from '../src/fighter/palette/kitSchema.js';
import { packSheet, placementMap } from '../src/fighter/palette/sheetPack.js';
import { HEAD_PX } from '../src/fighter/rig/rigSchema.js';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = resolve(ROOT, 'public/philosophers');
const SPREAD_WARN = 90;

const verbose = process.argv.includes('--verbose');
const log = (...a) => console.log(...a);

/* ── Chromium-side helpers, injected as source ────────────────────────────── */

/**
 * Decode a source image, measure the requested patches, and return the requested
 * crops resampled to their target heights. One page evaluation per recipe.
 */
async function measureAndCut(page, dataUrl, spec) {
  return page.evaluate(async ({ url, patches, outlineBox, crops }) => {
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const full = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = full.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);

    const med = (arr) => { arr.sort((a, b) => a - b); return arr[arr.length >> 1]; };

    const samplePatch = ([x, y, w, h]) => {
      const rs = [], gs = [], bs = [];
      for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
          if (xx < 0 || yy < 0 || xx >= bmp.width || yy >= bmp.height) continue;
          const i = (yy * bmp.width + xx) * 4;
          rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
        }
      }
      if (rs.length === 0) return null;
      const spread = Math.max(
        Math.max(...rs) - Math.min(...rs),
        Math.max(...gs) - Math.min(...gs),
        Math.max(...bs) - Math.min(...bs),
      );
      return { rgb: [med(rs), med(gs), med(bs)], spread, pixels: rs.length };
    };

    const measured = {};
    for (const [role, boxes] of Object.entries(patches)) {
      measured[role] = boxes.map(samplePatch).filter(Boolean);
    }

    // Outline: the darkest 2nd percentile inside the figure. Pure black never appears
    // in a fresco, and using it makes a sprite look like a cartoon overlay.
    let outline = null;
    if (outlineBox) {
      const [bx, by, bw, bh] = outlineBox;
      const rows = [];
      for (let y = by; y < by + bh; y++) {
        for (let x = bx; x < bx + bw; x++) {
          if (x < 0 || y < 0 || x >= bmp.width || y >= bmp.height) continue;
          const i = (y * bmp.width + x) * 4;
          rows.push([0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2], data[i], data[i + 1], data[i + 2]]);
        }
      }
      rows.sort((a, b) => a[0] - b[0]);
      const cut = rows.slice(0, Math.max(1, Math.floor(rows.length * 0.02)));
      outline = [med(cut.map((r) => r[1])), med(cut.map((r) => r[2])), med(cut.map((r) => r[3]))];
    }

    // Region ids are written into the red channel spaced this far apart, so the
    // antialiasing canvas puts along every polygon edge still rounds to the right id.
    const ID_STEP = 40;

    const cut = {};
    for (const [name, { crop, targetHeight, flip, mask, rotate, regions }] of Object.entries(crops)) {
      const [cx, cy, cw, ch] = crop;
      const scale = targetHeight / ch;
      const tw = Math.max(1, Math.round(cw * scale));
      const th = Math.max(1, Math.round(targetHeight));

      const tracePath = (c2d, points) => {
        c2d.beginPath();
        points.forEach(([mx, my], i) => {
          const px = (mx - cx) * scale;
          const py = (my - cy) * scale;
          if (i === 0) c2d.moveTo(px, py);
          else c2d.lineTo(px, py);
        });
        c2d.closePath();
      };

      /**
       * The pixels and the region map must land on exactly the same geometry, so the
       * transform is applied by one function to both contexts rather than written twice.
       */
      const applyTransform = (c2d) => {
        // Source figures are rarely upright — a philosopher bent over his writing has a
        // foreshortened, shadowed face. Rotating about the crop centre straightens the
        // head so the profile reads. Applied before the mask so the silhouette rotates
        // with the pixels rather than sliding off them.
        if (rotate) {
          c2d.translate(tw / 2, th / 2);
          c2d.rotate((rotate * Math.PI) / 180);
          c2d.translate(-tw / 2, -th / 2);
        }
        // Rig space runs +x FORWARD, and sprites are authored facing forward. A figure
        // painted facing the other way has to be mirrored here or the fighter walks
        // forward while looking over his shoulder.
        if (flip) {
          c2d.translate(tw, 0);
          c2d.scale(-1, 1);
        }
        // An optional silhouette, in source coordinates. Flood-filling the background
        // only works when the figure sits against a pale field reachable from the crop
        // border — true of Aristotle against plaster, false of anyone surrounded by
        // their own robe, a book and the next philosopher along.
        if (mask && mask.length >= 3) {
          tracePath(c2d, mask);
          c2d.clip();
        }
      };

      const small = new OffscreenCanvas(tw, th);
      const sctx = small.getContext('2d', { willReadFrequently: true });
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'high';
      applyTransform(sctx);
      sctx.drawImage(bmp, cx, cy, cw, ch, 0, 0, tw, th);
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      const img = sctx.getImageData(0, 0, tw, th);

      // Hand-traced material regions, rasterised through the identical transform. The
      // base id floods the whole clipped area first; each traced polygon then paints
      // over it, so a recipe only has to trace what differs from the base.
      let regionMap = null;
      if (regions) {
        const rc = new OffscreenCanvas(tw, th);
        const rctx = rc.getContext('2d', { willReadFrequently: true });
        applyTransform(rctx);
        rctx.fillStyle = `rgb(${ID_STEP},0,0)`;
        rctx.fillRect(-tw * 2, -th * 2, tw * 5, th * 5);
        for (const { id, polygon } of regions.polygons) {
          rctx.fillStyle = `rgb(${id * ID_STEP},0,0)`;
          tracePath(rctx, polygon);
          rctx.fill();
        }
        rctx.setTransform(1, 0, 0, 1, 0, 0);
        const rd = rctx.getImageData(0, 0, tw, th).data;
        regionMap = [];
        for (let k = 0; k < tw * th; k++) {
          regionMap.push(rd[k * 4 + 3] < 128 ? 0 : Math.round(rd[k * 4] / ID_STEP));
        }
      }

      cut[name] = {
        width: tw,
        height: th,
        data: Array.from(img.data),
        masked: !!(mask && mask.length >= 3),
        regionMap,
      };
    }

    return { sourceSize: [bmp.width, bmp.height], measured, outline, cut };
  }, { url: dataUrl, patches: spec.patches, outlineBox: spec.outlineBox, crops: spec.crops });
}

/** Composite the packed sprites into one sheet and return it as PNG bytes. */
async function encodeSheet(page, packed, sprites) {
  const dataUrl = await page.evaluate(async ({ width, height, placements, images }) => {
    const c = new OffscreenCanvas(width, height);
    const ctx = c.getContext('2d');
    for (const p of placements) {
      const img = images[p.id];
      const src = new OffscreenCanvas(img.width, img.height);
      src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
      ctx.drawImage(src, p.x, p.y);
    }
    const blob = await c.convertToBlob({ type: 'image/png' });
    return new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  }, {
    width: packed.width,
    height: packed.height,
    placements: packed.placements,
    images: Object.fromEntries(Object.entries(sprites).map(([k, v]) => [k, { width: v.width, height: v.height, data: Array.from(v.data) }])),
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/* ── Build ────────────────────────────────────────────────────────────────── */

/**
 * Blend several measured patches into one colour, weighted by pixel count.
 *
 * A mean, not a median: each patch has already been median-filtered internally to
 * shrug off specular flecks, and taking a median *across* patches would just return
 * whichever patch happened to be largest rather than blending a material's range.
 */
function combine(patches) {
  if (!patches || patches.length === 0) return null;
  const total = patches.reduce((sum, p) => sum + p.pixels, 0);
  const channels = [0, 1, 2].map(
    (ch) => patches.reduce((sum, p) => sum + p.rgb[ch] * p.pixels, 0) / total,
  );
  return rgbToHex(channels);
}

/** Write `skin.primary`-style dotted role names into a palette object. */
function setRole(palette, role, hex) {
  const keys = role.split('.');
  if (keys.length === 1) palette[keys[0]] = hex;
  else palette[keys[0]] = { ...palette[keys[0]], [keys[1]]: hex };
}

const dataUrlFor = (file) => {
  const ext = file.split('.').pop();
  return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${readFileSync(resolve(ROOT, file)).toString('base64')}`;
};

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();

  let doc = createKitsDocument();
  const sprites = {};
  const warnings = [];

  for (const recipe of RECIPES) {
    log(`\n── ${recipe.name} ──`);
    const { shape, colour } = resolveRecipe(recipe);

    // ── Palette, from the painting (or from hand-set values when there is no painting) ──
    const measured = createPalette();
    if (colour.measured) {
      const sampled = await measureAndCut(page, dataUrlFor(colour.file), {
        patches: colour.samples,
        outlineBox: colour.outlineFrom,
        crops: {},
      });
      log(`  colour   ${colour.file.split('/').pop()} ${sampled.sourceSize.join('x')}`);
      for (const [role, patches] of Object.entries(sampled.measured)) {
        const hex = combine(patches);
        if (!hex) { warnings.push(`${recipe.id}: no pixels sampled for ${role}`); continue; }
        const worst = Math.max(...patches.map((p) => p.spread));
        if (worst > SPREAD_WARN) {
          warnings.push(`${recipe.id}: ${role} patch spread ${worst} — may straddle an edge; check the box`);
        }
        setRole(measured, role, hex);
        if (verbose) log(`  ${role.padEnd(18)} ${hex}  spread ${worst}`);
      }
      if (sampled.outline) measured.outline = rgbToHex(sampled.outline);
    } else {
      // Nothing was measured. Say so at the top of the build and again in the warning
      // list, because a hand-set palette that looks plausible is the easiest kind of
      // wrong value to forget about.
      log('  colour   PROVISIONAL — hand-set, nothing measured');
      for (const [role, hex] of Object.entries(colour.values)) setRole(measured, role, hex);
      warnings.push(
        `${recipe.id}: palette is PROVISIONAL — no colour source has been supplied, so every role is a guess`
        + (colour.after ? `. Measure it from ${colour.after}` : ''),
      );
    }
    if (recipe.element_color) measured.element = recipe.element_color;

    // ── Sprite geometry, from the bust or from the same painting ──
    const regions = shape.regions ? assignRegionIds(shape.regions) : null;
    const crops = {
      head: {
        crop: shape.crop,
        targetHeight: HEAD_PX,
        flip: !!shape.flip,
        mask: shape.mask,
        rotate: shape.rotate,
        regions,
      },
    };
    if (recipe.garment) crops.garment = { crop: recipe.garment.crop, targetHeight: recipe.garment.targetHeight ?? HEAD_PX * 2, flip: !!shape.flip };
    if (recipe.accessory) {
      // Accessories are sized relative to the head so they stay in proportion.
      crops.accessory = { crop: recipe.accessory.crop, targetHeight: recipe.accessory.targetHeight ?? Math.round(HEAD_PX * 0.62) };
    }

    const result = await measureAndCut(page, dataUrlFor(shape.file), { patches: {}, outlineBox: null, crops });
    log(`  shape    ${shape.file.split('/').pop()} ${result.sourceSize.join('x')}${shape.flip ? '  (mirrored to face forward)' : ''}`);

    const paletteProblems = validatePalette(measured);
    if (paletteProblems.length > 0) {
      for (const p of paletteProblems) warnings.push(`${recipe.id} measured palette: ${p}`);
    }

    // Snapshot the measured palette BEFORE anything adjusts it. `measured` is the
    // record of what the painting actually said; `working` is what the sprites get
    // built from. Sharing one object between them — which an in-place mutation quietly
    // does — throws away the only reason for keeping both.
    const measuredSnapshot = structuredClone(measured);
    const working = structuredClone(measured);

    // Separation is prescribed by the palette rather than fixed, so a character who
    // arrived with contrast keeps it. See `separationFor`.
    const boost = {
      ...DEFAULT_BOOST,
      separate: separationFor(measuredSnapshot.skin.primary, measuredSnapshot.hair.primary),
    };
    const measuredRamps = buildRamps(measuredSnapshot, NO_BOOST);
    const boostedRamps = buildRamps(working, boost);

    // The sampled outline is honest but usually too light to function. Keep its hue,
    // deepen its value until the silhouette reads.
    working.outline = deepenOutline(measuredSnapshot.outline, boostedRamps);
    if (working.outline !== measuredSnapshot.outline) {
      log(`  outline ${measuredSnapshot.outline} sampled -> ${working.outline} deepened`);
    }
    const gapBefore = Math.abs(luminance(measuredRamps.skin[1]) - luminance(measuredRamps.hair[1]));
    const gapAfter = Math.abs(luminance(boostedRamps.skin[1]) - luminance(boostedRamps.hair[1]));
    log(`  skin/hair luma gap ${gapBefore.toFixed(0)} measured -> ${gapAfter.toFixed(0)} boosted (separate ${boost.separate})`);
    for (const m of liftedMaterials(working, boost)) {
      log(`  ${m.id} lifted off the floor: value ${m.from.toFixed(2)} -> ${m.to.toFixed(2)} (too dark to show three stops)`);
    }
    for (const p of checkRamps(boostedRamps, { outline: hexToRgb(working.outline) })) {
      warnings.push(`${recipe.id} ramps: ${p}`);
    }

    // ── Sprites ──
    for (const [name, raw] of Object.entries(result.cut)) {
      const img = { width: raw.width, height: raw.height, data: new Uint8ClampedArray(raw.data) };
      const targets = quantisationTargets(working, boost, {
        materials: SPRITE_MATERIALS[name] ?? null,
      });

      // A traced silhouette normally means the background cannot be flood-filled, so it
      // is skipped. A named backdrop colour says otherwise: the polygon is there to cut
      // the head off the shoulders, and the fill still has a gallery wall to remove.
      const backdrop = shape.background && name === 'head'
        ? { skipMask: false, mask: { near: shape.background } }
        : { skipMask: !!raw.masked };

      // Monochrome shape sources get repainted region by region before quantisation.
      let mapStats = null;
      const preQuantise = raw.regionMap
        ? (masked) => {
          const { image: repainted, stats } = remapByRegion(masked, raw.regionMap, {
            regions: regions.ids,
            ramps: boostedRamps,
            outline: hexToRgb(working.outline),
          });
          mapStats = stats;
          return repainted;
        }
        : null;

      const { image, usage } = spriteify(img, targets, working.outline, { ...backdrop, preQuantise });
      for (const s of mapStats ?? []) {
        if (s.error) { warnings.push(`${recipe.id}: region ${s.id} (${s.material}) — ${s.error}`); continue; }
        if (verbose) {
          const bands = Object.entries(s.counts).map(([k, v]) => `${k} ${v}`).join(', ');
          log(`    region ${s.material.padEnd(8)} ${String(s.pixels).padStart(5)} px  luma ${s.range.join('–').padEnd(8)}  [${bands}]`);
        }
        // A region that all but vanished means its polygon was traced somewhere the
        // figure is not, and the material it stands for will be missing from the sprite.
        if (s.pixels < 0.02 * raw.width * raw.height) {
          warnings.push(`${recipe.id}: region "${s.material}" covers only ${s.pixels} px — check the polygon`);
        }
      }
      const bounds = opaqueBounds(image);
      if (!bounds) { warnings.push(`${recipe.id}: ${name} came out empty after masking`); continue; }
      const tight = cropImage(image, bounds);
      sprites[`${recipe.id}.${name}`] = tight;

      const top = [...usage].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n} ${((c / (raw.width * raw.height)) * 100).toFixed(0)}%`);
      log(`  ${name.padEnd(10)} ${raw.width}x${raw.height} -> ${tight.width}x${tight.height}  [${top.join(', ')}]`);

      // If one colour swallows the sprite, the crop or the mask is wrong.
      const [, dominantCount] = [...usage].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
      if (dominantCount / (raw.width * raw.height) > 0.55) {
        warnings.push(`${recipe.id}: one colour covers over half of ${name} — check the crop and the background mask`);
      }
    }

    doc = upsertKit(doc, createKit(recipe.id, {
      name: recipe.name,
      epithet: recipe.epithet,
      school: recipe.school,
      doctrine: recipe.doctrine,
      element: recipe.element,
      palette: working,
      measured: measuredSnapshot,
      boost,
      ramps: rampsToHex(boostedRamps),
      head: { region: null, pivot: null },
      garment: recipe.garment ? { region: null } : null,
      accessory: recipe.accessory
        ? { kind: recipe.accessory.kind, label: recipe.accessory.label, region: null, grip: recipe.accessory.grip }
        : null,
      source: { ...shape.provenance, file: undefined },
      paletteSource: colour.provenance && colour.file !== shape.file
        ? { ...colour.provenance, file: undefined }
        : null,
      notes: recipe.notes ?? '',
    }));
  }

  // ── Pack ──
  const packed = packSheet(Object.entries(sprites).map(([id, img]) => ({ id, width: img.width, height: img.height })));
  const where = placementMap(packed);
  log(`\nsheet ${packed.width}x${packed.height}, ${packed.placements.length} sprites`);

  doc = {
    ...doc,
    sheetSize: [packed.width, packed.height],
    characters: doc.characters.map((kit) => {
      const next = { ...kit };
      const head = where.get(`${kit.id}.head`);
      if (head) {
        next.head = {
          region: [head.x, head.y, head.width, head.height],
          // The neck joint: horizontal centre, bottom edge. The head bone sits there,
          // so the sprite hangs off the neck rather than floating.
          pivot: [Math.round(head.width / 2), head.height],
        };
      }
      const garment = where.get(`${kit.id}.garment`);
      if (garment) next.garment = { region: [garment.x, garment.y, garment.width, garment.height] };
      const acc = where.get(`${kit.id}.accessory`);
      if (acc && next.accessory) {
        next.accessory = {
          ...next.accessory,
          region: [acc.x, acc.y, acc.width, acc.height],
          pivot: [
            Math.round(acc.width * (next.accessory.grip?.[0] ?? 0.5)),
            Math.round(acc.height * (next.accessory.grip?.[1] ?? 0.5)),
          ],
        };
        delete next.accessory.grip;
      }
      return next;
    }),
  };

  // ── Verify before writing ──
  const problems = [...validateKits(doc), ...findSheetOverlaps(doc)];
  if (problems.length > 0) {
    console.error('\nkits.json is invalid:');
    for (const p of problems) console.error(`  ✗ ${p}`);
    await browser.close();
    process.exit(1);
  }

  const sheetPng = await encodeSheet(page, packed, sprites);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, 'heads.sheet.png'), sheetPng);
  writeFileSync(resolve(OUT_DIR, 'kits.json'), `${JSON.stringify(doc, null, 2)}\n`);
  log(`\nwrote ${resolve(OUT_DIR, 'kits.json')}`);
  log(`wrote ${resolve(OUT_DIR, 'heads.sheet.png')} (${sheetPng.length} bytes)`);

  if (warnings.length > 0) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  ! ${w}`);
  } else {
    console.log('\nno warnings');
  }

  await browser.close();
}

void dirname;
await main();
