/**
 * Look at what the kit build produced. Run with `npm run kitpreview`.
 *
 * Writes `art/preview/kits.png`: every head at 8x nearest-neighbour, on a stage-coloured
 * ground, with its palette below it and its pivot marked. Reads only the shipped
 * resource — `kits.json` and `heads.sheet.png` — so what you see here is exactly what the
 * app will get when kit import is built.
 *
 * This exists because the build's warnings cannot tell you the one thing that matters.
 * A kit can measure clean, validate clean, pack clean and still not look like a person.
 * The only test for that is looking at it.
 */

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'art/preview/kits.png');
const SCALE = Number(process.argv.find((a) => a.startsWith('--scale='))?.split('=')[1] ?? 8);

const kits = JSON.parse(readFileSync(resolve(ROOT, 'public/philosophers/kits.json'), 'utf8'));
const sheet = `data:image/png;base64,${readFileSync(resolve(ROOT, 'public/philosophers/heads.sheet.png')).toString('base64')}`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();

const dataUrl = await page.evaluate(async ({ sheet, kits, SCALE }) => {
  const bmp = await createImageBitmap(await (await fetch(sheet)).blob());

  const PAD = 20;
  const HEAD_ROOM = Math.max(...kits.characters.map((k) => k.head?.region?.[3] ?? 0)) * SCALE;
  const SWATCH = 16;
  const cols = kits.characters.map((kit) => ({
    kit,
    width: Math.max(200, (kit.head?.region?.[2] ?? 0) * SCALE),
  }));

  const W = cols.reduce((s, c) => s + c.width + PAD, PAD);
  const H = PAD + 34 + HEAD_ROOM + 18 + SWATCH * 3 + 8 + 44 + PAD;

  const c = new OffscreenCanvas(W, H);
  const ctx = c.getContext('2d');
  // The stage colour, not white: a sprite that reads on white can still dissolve into
  // the background it will actually be drawn against.
  ctx.fillStyle = '#2a3a4a';
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;

  let x = PAD;
  for (const { kit, width } of cols) {
    const provisional = /PROVISIONAL/i.test(kit.notes ?? '');

    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(kit.name, x, PAD + 12);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = provisional ? '#ffb03a' : '#9fb4c8';
    ctx.fillText(provisional ? 'palette PROVISIONAL' : kit.epithet, x, PAD + 28);

    const top = PAD + 34;
    if (kit.head?.region) {
      const [rx, ry, rw, rh] = kit.head.region;
      ctx.drawImage(bmp, rx, ry, rw, rh, x, top, rw * SCALE, rh * SCALE);
      // The pivot is the neck joint — the sprite hangs off it, so a pivot in the wrong
      // place shows up as a head floating above the shoulders rather than sitting on them.
      ctx.fillStyle = '#ff3060';
      ctx.beginPath();
      ctx.arc(x + kit.head.pivot[0] * SCALE, top + kit.head.pivot[1] * SCALE, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // The palette as it is actually used: three stops per material, plus the outline.
    let sy = top + HEAD_ROOM + 18;
    ctx.font = '10px monospace';
    for (const id of ['skin', 'hair', 'outfitP']) {
      const ramp = kit.ramps?.[id];
      if (!ramp) continue;
      let sx = x;
      for (const stop of ['light', 'base', 'shadow']) {
        ctx.fillStyle = ramp[stop];
        ctx.fillRect(sx, sy, SWATCH * 2, SWATCH);
        sx += SWATCH * 2;
      }
      ctx.fillStyle = '#9fb4c8';
      ctx.fillText(id, sx + 6, sy + 12);
      sy += SWATCH;
    }
    ctx.fillStyle = kit.palette.outline;
    ctx.fillRect(x, sy + 4, SWATCH * 6, 8);

    ctx.fillStyle = '#7f93a6';
    ctx.font = '10px monospace';
    ctx.fillText(`${kit.head?.region?.[2]}x${kit.head?.region?.[3]}px  ${kit.element}`, x, sy + 32);
    ctx.fillText(kit.source?.title?.slice(0, 34) ?? '', x, sy + 44);

    x += width + PAD;
  }

  const blob = await c.convertToBlob({ type: 'image/png' });
  return new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
}, { sheet, kits, SCALE });

mkdirSync(resolve(ROOT, 'art/preview'), { recursive: true });
writeFileSync(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
await browser.close();

console.log(`sheet ${kits.sheetSize.join('x')}, ${kits.characters.length} characters`);
for (const kit of kits.characters) {
  const flag = /PROVISIONAL/i.test(kit.notes ?? '') ? '  [PROVISIONAL palette]' : '';
  console.log(`  ${kit.id.padEnd(12)} head ${String(kit.head?.region?.[2]).padStart(3)}x${kit.head?.region?.[3]}  ${kit.source?.title ?? ''}${flag}`);
  if (kit.paletteSource) console.log(`  ${' '.repeat(12)} colour from ${kit.paletteSource.title}`);
}
console.log(`\nwrote ${OUT}`);
