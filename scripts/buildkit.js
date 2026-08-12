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

import { RECIPES } from '../art/recipes.js';
import { rgbToHex, hexToRgb, luminance } from '../src/fighter/palette/color.js';
import { createPalette, validatePalette, DEFAULT_BOOST, NO_BOOST } from '../src/fighter/palette/paletteSchema.js';
import { quantisationTargets, buildRamps, checkRamps, rampsToHex, deepenOutline, SPRITE_MATERIALS } from '../src/fighter/palette/ramp.js';
import { spriteify, opaqueBounds, cropImage } from '../src/fighter/palette/quantize.js';
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

    const cut = {};
    for (const [name, { crop, targetHeight }] of Object.entries(crops)) {
      const [cx, cy, cw, ch] = crop;
      const scale = targetHeight / ch;
      const tw = Math.max(1, Math.round(cw * scale));
      const th = Math.max(1, Math.round(targetHeight));
      const small = new OffscreenCanvas(tw, th);
      const sctx = small.getContext('2d', { willReadFrequently: true });
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(bmp, cx, cy, cw, ch, 0, 0, tw, th);
      const img = sctx.getImageData(0, 0, tw, th);
      cut[name] = { width: tw, height: th, data: Array.from(img.data) };
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

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();

  let doc = createKitsDocument();
  const sprites = {};
  const warnings = [];

  for (const recipe of RECIPES) {
    log(`\n── ${recipe.name} ──`);
    const bytes = readFileSync(resolve(ROOT, recipe.source.file));
    const ext = recipe.source.file.split('.').pop();
    const dataUrl = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${bytes.toString('base64')}`;

    const crops = { head: { crop: recipe.head.crop, targetHeight: HEAD_PX } };
    if (recipe.garment) crops.garment = { crop: recipe.garment.crop, targetHeight: recipe.garment.targetHeight ?? HEAD_PX * 2 };
    if (recipe.accessory) {
      // Accessories are sized relative to the head so they stay in proportion.
      crops.accessory = { crop: recipe.accessory.crop, targetHeight: recipe.accessory.targetHeight ?? Math.round(HEAD_PX * 0.62) };
    }

    const result = await measureAndCut(page, dataUrl, {
      patches: recipe.samples,
      outlineBox: recipe.outlineFrom,
      crops,
    });
    log(`  source ${result.sourceSize.join('x')}`);

    // ── Palette ──
    const measured = createPalette();
    for (const [role, patches] of Object.entries(result.measured)) {
      const hex = combine(patches);
      if (!hex) { warnings.push(`${recipe.id}: no pixels sampled for ${role}`); continue; }
      const worst = Math.max(...patches.map((p) => p.spread));
      if (worst > SPREAD_WARN) {
        warnings.push(`${recipe.id}: ${role} patch spread ${worst} — may straddle an edge; check the box`);
      }
      const keys = role.split('.');
      if (keys.length === 1) measured[keys[0]] = hex;
      else measured[keys[0]] = { ...measured[keys[0]], [keys[1]]: hex };
      if (verbose) log(`  ${role.padEnd(18)} ${hex}  spread ${worst}`);
    }
    if (result.outline) measured.outline = rgbToHex(result.outline);
    if (recipe.element_color) measured.element = recipe.element_color;

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

    const measuredRamps = buildRamps(measuredSnapshot, NO_BOOST);
    const boostedRamps = buildRamps(working, DEFAULT_BOOST);

    // The sampled outline is honest but usually too light to function. Keep its hue,
    // deepen its value until the silhouette reads.
    working.outline = deepenOutline(measuredSnapshot.outline, boostedRamps);
    if (working.outline !== measuredSnapshot.outline) {
      log(`  outline ${measuredSnapshot.outline} sampled -> ${working.outline} deepened`);
    }
    const gapBefore = Math.abs(luminance(measuredRamps.skin[1]) - luminance(measuredRamps.hair[1]));
    const gapAfter = Math.abs(luminance(boostedRamps.skin[1]) - luminance(boostedRamps.hair[1]));
    log(`  skin/hair luma gap ${gapBefore.toFixed(0)} measured -> ${gapAfter.toFixed(0)} boosted`);
    for (const p of checkRamps(boostedRamps, { outline: hexToRgb(working.outline) })) {
      warnings.push(`${recipe.id} ramps: ${p}`);
    }

    // ── Sprites ──
    for (const [name, raw] of Object.entries(result.cut)) {
      const img = { width: raw.width, height: raw.height, data: new Uint8ClampedArray(raw.data) };
      const targets = quantisationTargets(working, DEFAULT_BOOST, {
        materials: SPRITE_MATERIALS[name] ?? null,
      });
      const { image, usage } = spriteify(img, targets, working.outline);
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
      boost: DEFAULT_BOOST,
      ramps: rampsToHex(boostedRamps),
      head: { region: null, pivot: null },
      garment: recipe.garment ? { region: null } : null,
      accessory: recipe.accessory
        ? { kind: recipe.accessory.kind, label: recipe.accessory.label, region: null, grip: recipe.accessory.grip }
        : null,
      source: { ...recipe.source, file: undefined },
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
