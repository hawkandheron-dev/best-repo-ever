/**
 * Generate the pixel studio. Run with `npm run buildstudio`.
 *
 * Writes `art/editor/pixel-studio.html`: a self-contained page for drawing the body and
 * garment parts that the shared limbs are made of.
 *
 * GENERATED, NOT HAND-WRITTEN — same rule as the pigment card, and for the same reason.
 * The page cannot import from `src/` (artifacts run under a CSP that blocks every
 * external fetch), so the generator inlines the real modules instead of letting a second
 * copy of the geometry and the ramp maths drift away from the build.
 *
 * What makes this a studio rather than a paint program: you never pick a colour. You pick
 * an INK — a material and a stop, `garment shadow`, `skin light` — and the swatches show
 * you what that ink is worth for whichever philosopher is currently loaded. Switch
 * character and the same drawing repaints in his palette. That is the only way a roster
 * of draped Greeks is tractable: a dozen palettes over a handful of shapes.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'art/editor/pixel-studio.html');
const PARTS_FILE = resolve(ROOT, 'art/parts/standard.json');

/** Dependency order matters: each module may use the ones before it. */
const MODULES = [
  'src/fighter/palette/color.js',
  'src/fighter/palette/paletteSchema.js',
  'src/fighter/palette/ramp.js',
  'src/fighter/rig/rigSchema.js',
  'src/fighter/parts/partSchema.js',
];

function stripModuleSyntax(source, file) {
  const withoutImports = source.replace(/^import[\s\S]*?from\s+'[^']+';\n/gm, '');
  if (/^\s*import\s/m.test(withoutImports)) {
    throw new Error(`${file}: an import survived stripping — the regex needs widening`);
  }
  const plain = withoutImports.replace(/^export\s+(?=(function|const|let|class)\s)/gm, '');
  if (/^\s*export\s/m.test(plain)) {
    throw new Error(`${file}: an export survived stripping — probably an "export {…}" list`);
  }
  return plain;
}

const inlined = MODULES
  .map((file) => `/* ── ${file} ── */\n${stripModuleSyntax(readFileSync(resolve(ROOT, file), 'utf8'), file)}`)
  .join('\n');

const kits = JSON.parse(readFileSync(resolve(ROOT, 'public/philosophers/kits.json'), 'utf8'));
const slotCount = (inlined.match(/^ {2}slot\(/gm) || []).length;
/** Work in progress is carried back in, so reopening the studio resumes where it stopped. */
const saved = existsSync(PARTS_FILE) ? JSON.parse(readFileSync(PARTS_FILE, 'utf8')) : null;

const html = `<title>Pixel Studio</title>
<style>
  :root {
    --paper: #E8E9E6; --panel: #F2F3F0; --sunk: #DEE0DC; --rule: #C7CAC4;
    --ink: #191C1A; --muted: #676B67; --signal: #1F5A66; --alarm: #8C3A1B;
    --grid: rgba(25, 28, 26, 0.16);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #141614; --panel: #1C1F1D; --sunk: #101210; --rule: #2F332F;
      --ink: #E5E7E3; --muted: #8D928D; --signal: #74B4C0; --alarm: #D98A5F;
      --grid: rgba(229, 231, 227, 0.14);
    }
  }
  :root[data-theme="dark"] {
    --paper: #141614; --panel: #1C1F1D; --sunk: #101210; --rule: #2F332F;
    --ink: #E5E7E3; --muted: #8D928D; --signal: #74B4C0; --alarm: #D98A5F;
    --grid: rgba(229, 231, 227, 0.14);
  }

  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--paper); color: var(--ink);
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .sheet { max-width: 1320px; margin: 0 auto; padding: 34px 26px 90px; }
  .masthead { border-bottom: 2px solid var(--ink); padding-bottom: 13px; }
  h1 { margin: 0; font-size: 29px; font-weight: 620; letter-spacing: -0.022em; }
  .standfirst { margin: 7px 0 0; color: var(--muted); max-width: 68ch; font-size: 14px; }

  .lbl {
    font: 500 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted);
  }

  .who { display: flex; border-bottom: 1px solid var(--rule); }
  .who button {
    appearance: none; background: none; border: 0; border-bottom: 2px solid transparent;
    margin-bottom: -1px; padding: 12px 17px; cursor: pointer; color: var(--muted);
    font: 500 13px ui-sans-serif, system-ui, sans-serif;
  }
  .who button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--signal); }
  .who button:focus-visible { outline: 2px solid var(--signal); outline-offset: -2px; }

  .cols { display: grid; grid-template-columns: 214px minmax(0, 1fr) 250px; gap: 26px; padding-top: 24px; }
  @media (max-width: 1100px) { .cols { grid-template-columns: 1fr; } }

  /* ── Slot list ── */
  .slots { display: grid; gap: 1px; align-content: start; }
  .slotgroup { margin-top: 12px; }
  .slotgroup:first-child { margin-top: 0; }
  .slots button {
    width: 100%; text-align: left; cursor: pointer; padding: 7px 9px;
    border: 1px solid transparent; border-bottom-color: var(--rule); background: none; color: var(--ink);
    font: 13px ui-sans-serif, system-ui, sans-serif;
    display: flex; justify-content: space-between; align-items: center; gap: 8px;
  }
  .slots button[aria-current="true"] { background: var(--signal); border-color: var(--signal); color: var(--paper); }
  .slots button:focus-visible { outline: 2px solid var(--signal); outline-offset: -2px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--rule); flex: none; }
  .dot.on { background: var(--signal); }
  .slots button[aria-current="true"] .dot { background: var(--paper); }
  .slots button[aria-current="true"] .dot:not(.on) { background: rgba(255,255,255,0.35); }

  /* ── Canvas ── */
  .easel {
    display: flex; justify-content: center; align-items: center; padding: 20px;
    border: 1px solid var(--rule); background: var(--sunk); overflow: auto;
  }
  #grid { image-rendering: pixelated; cursor: crosshair; touch-action: none; display: block; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
  .toolbar button {
    font: 500 12px ui-sans-serif, system-ui, sans-serif; padding: 7px 11px; cursor: pointer;
    border: 1px solid var(--rule); background: var(--panel); color: var(--ink);
  }
  .toolbar button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--paper); }
  .toolbar button:focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }
  .toolbar .sep { width: 1px; background: var(--rule); margin: 0 4px; }

  .readout {
    margin-top: 10px; font: 11px ui-monospace, Menlo, monospace;
    color: var(--muted); font-variant-numeric: tabular-nums;
    display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  }

  /* ── Inks ── */
  .inks { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; }
  .inks button {
    position: relative; height: 34px; cursor: pointer; border: 1px solid var(--rule); padding: 0;
    font: 500 9px ui-monospace, Menlo, monospace; color: var(--ink);
  }
  .inks button[aria-pressed="true"] { outline: 2px solid var(--ink); outline-offset: 1px; z-index: 1; }
  .inks button:focus-visible { outline: 2px solid var(--signal); outline-offset: 1px; }
  .inks .key { position: absolute; left: 3px; top: 2px; opacity: 0.65; }
  .inkname { margin-top: 8px; font-size: 12px; color: var(--muted); min-height: 1.3em; }

  .stagebox { margin-top: 20px; border: 1px solid var(--rule); background: #2A3A4A; padding: 14px; display: flex; justify-content: center; }
  #figure { image-rendering: pixelated; display: block; }

  .flags { margin: 14px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  .flags li { font-size: 12.5px; padding-left: 12px; border-left: 2px solid var(--alarm); }
  .flags li.calm { border-left-color: var(--rule); color: var(--muted); }

  .acts { display: flex; gap: 6px; margin-top: 14px; flex-wrap: wrap; }
  .acts button {
    font: 500 12px ui-sans-serif, system-ui, sans-serif; padding: 8px 12px; cursor: pointer;
    border: 1px solid var(--rule); background: var(--panel); color: var(--ink);
  }
  .acts button.go { background: var(--signal); border-color: var(--signal); color: var(--paper); }
  pre {
    margin: 14px 0 0; padding: 12px; background: var(--panel); border: 1px solid var(--rule);
    font: 11px/1.5 ui-monospace, Menlo, monospace; max-height: 260px; overflow: auto; white-space: pre;
  }
</style>

<div class="sheet">
  <header class="masthead">
    <h1>Pixel Studio</h1>
    <p class="standfirst">
      Draw the body and garment parts once. You pick an <strong>ink</strong> &mdash; a material
      and a stop, not a colour &mdash; so the same drawing becomes Aristotle&rsquo;s blue himation
      or Heraclitus&rsquo;s mauve tunic. Switch philosopher above the canvas to see it repaint.
    </p>
  </header>

  <div class="who" id="who" role="tablist"></div>

  <div class="cols">
    <section>
      <span class="lbl">Parts</span>
      <div class="slots" id="slots"></div>
    </section>

    <section>
      <div class="easel"><canvas id="grid"></canvas></div>
      <div class="toolbar" id="toolbar"></div>
      <div class="readout">
        <span id="where">&nbsp;</span>
        <span id="dims">&nbsp;</span>
      </div>
      <ul class="flags" id="flags"></ul>
    </section>

    <section>
      <span class="lbl">Ink</span>
      <div class="inks" id="inks"></div>
      <div class="inkname" id="inkname"></div>

      <span class="lbl">At rest</span>
      <div class="stagebox"><canvas id="figure"></canvas></div>

      <div class="acts">
        <button type="button" id="copy" class="go">Copy all parts</button>
        <button type="button" id="clear">Clear part</button>
      </div>
      <pre id="out"></pre>
    </section>
  </div>
</div>

<script>
${inlined}

const KITS = ${JSON.stringify(kits)};
const SAVED = ${JSON.stringify(saved)};

const el = (id) => document.getElementById(id);
const ZOOM_TARGET = 460;

let who = KITS.characters[0].id;
let slotId = 'torso';
let ink = '8';
let tool = 'pencil';
let painting = false;
const undo = [];

/* Parts live here, one per slot, seeded from whatever the last export saved. */
const parts = {};
for (const s of PART_SLOTS) {
  const found = SAVED && SAVED.parts ? SAVED.parts.find((p) => p.id === s.id) : null;
  parts[s.id] = found ? JSON.parse(JSON.stringify(found)) : createPart(s.id);
}

const kitOf = (id) => KITS.characters.find((k) => k.id === id);

/* The palette an ink is worth right now. The build deepens a sampled outline until the
   silhouette reads, so redo that here rather than trusting a stored value. */
function activePalette() {
  const kit = kitOf(who);
  const p = JSON.parse(JSON.stringify(kit.measured));
  p.outline = deepenOutline(p.outline, buildRamps(p, kit.boost));
  return p;
}
function activeRamps() { return buildRamps(activePalette(), kitOf(who).boost); }

function inkHex(ch) {
  const spec = INKS[ch];
  if (!spec) return null;
  const palette = activePalette();
  if (spec.role) return palette[spec.role];
  const stops = activeRamps()[spec.material];
  return stops ? rgbToHex(stops[{ light: 0, base: 1, shadow: 2 }[spec.stop]]) : null;
}

/* ── The canvas ────────────────────────────────────────────────────────────── */

function zoomFor(part) {
  return Math.max(4, Math.floor(ZOOM_TARGET / Math.max(part.w, part.h)));
}

function drawGrid() {
  const part = parts[slotId];
  const slot = findSlot(slotId);
  const z = zoomFor(part);
  const cv = el('grid');
  cv.width = part.w * z;
  cv.height = part.h * z;
  const ctx = cv.getContext('2d');

  /* A checker under the art, because a transparent pixel and a dark one are the same
     thing on a dark panel and that is how holes get left in a sleeve.

     Mid-grey and constant across themes, not the panel tokens: an outline ink is
     near-black, and on a dark theme's panel it vanished into the checker it was supposed
     to be distinguishable from. Mid-grey is the one ground everything reads against, and
     it shifts colour perception least — the same reason the pigment card judges on 18%. */
  const a = '#8E8E8C';
  const b = '#7E7E7C';
  for (let y = 0; y < part.h; y++) {
    for (let x = 0; x < part.w; x++) {
      ctx.fillStyle = (x + y) % 2 ? a : b;
      ctx.fillRect(x * z, y * z, z, z);
    }
  }

  for (let y = 0; y < part.h; y++) {
    for (let x = 0; x < part.w; x++) {
      const hex = inkHex(part.rows[y][x]);
      if (!hex) continue;
      ctx.fillStyle = hex;
      ctx.fillRect(x * z, y * z, z, z);
    }
  }

  if (z >= 8) {
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid').trim();
    ctx.lineWidth = 1;
    for (let x = 0; x <= part.w; x++) { ctx.beginPath(); ctx.moveTo(x * z + 0.5, 0); ctx.lineTo(x * z + 0.5, cv.height); ctx.stroke(); }
    for (let y = 0; y <= part.h; y++) { ctx.beginPath(); ctx.moveTo(0, y * z + 0.5); ctx.lineTo(cv.width, y * z + 0.5); ctx.stroke(); }
  }

  /* The bone: where the pivot sits and how far the drawing has to reach to meet its
     child joint. Draw past it and the limb overlaps the next one; stop short and the
     figure comes apart at the knee. */
  const px = part.pivot[0] * z + z / 2;
  const py = part.pivot[1] * z + z / 2;
  if (slot.reach) {
    ctx.strokeStyle = 'rgba(255,60,110,0.55)';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + slot.reach[0] * z, py + slot.reach[1] * z);
    ctx.stroke();
    ctx.setLineDash([]);
    /* A ring on the child joint: the part should meet it, not stop short or run past. */
    ctx.beginPath();
    ctx.arc(px + slot.reach[0] * z, py + slot.reach[1] * z, Math.max(3, z / 3), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#FF3C6E';
  ctx.beginPath();
  ctx.arc(px, py, Math.max(3, z / 3), 0, Math.PI * 2);
  ctx.fill();

  el('dims').textContent = part.w + ' \\u00D7 ' + part.h + ' px  \\u00B7  pivot ' + part.pivot.join(',')
    + (slot.span ? '  \\u00B7  bone ' + slot.span + ' px' : '  \\u00B7  extremity');
}

function cellFrom(ev) {
  const part = parts[slotId];
  const z = zoomFor(part);
  const r = el('grid').getBoundingClientRect();
  return [
    Math.floor((ev.clientX - r.left) / (r.width / part.w)),
    Math.floor((ev.clientY - r.top) / (r.height / part.h)),
  ];
}

function pushUndo() {
  undo.push({ slotId, rows: [...parts[slotId].rows] });
  if (undo.length > 120) undo.shift();
}

function apply(x, y, fresh) {
  const part = parts[slotId];
  if (tool === 'dropper') {
    const found = inkAt(part, x, y);
    if (found !== '.') { ink = found; renderInks(); }
    return;
  }
  if (fresh) pushUndo();
  if (tool === 'fill') parts[slotId] = fillInk(part, x, y, ink);
  else parts[slotId] = setInk(part, x, y, tool === 'erase' ? '.' : ink);
  redraw();
}

/* ── The figure at rest ────────────────────────────────────────────────────── */

/* Forward kinematics over the real skeleton: no second copy of the bone table, so the
   preview cannot drift from what the game will assemble. */
function restPose() {
  const pos = {};
  const ang = {};
  for (const bone of DEFAULT_SKELETON) {
    const pa = bone.parent ? ang[bone.parent] : 0;
    const base = bone.parent ? pos[bone.parent] : { x: 0, y: 0 };
    const r = pa * Math.PI / 180;
    pos[bone.id] = {
      x: base.x + bone.pos[0] * Math.cos(r) - bone.pos[1] * Math.sin(r),
      y: base.y + bone.pos[0] * Math.sin(r) + bone.pos[1] * Math.cos(r),
    };
    ang[bone.id] = pa + bone.rest;
  }
  return { pos, ang };
}
const POSE = restPose();

function drawFigure() {
  const cv = el('figure');
  const SCALE = 2;
  cv.width = 150 * SCALE;
  cv.height = 250 * SCALE;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cv.width, cv.height);

  const ramps = activeRamps();
  const palette = activePalette();
  const ox = cv.width / 2;
  const oy = cv.height - 12 * SCALE;

  const ordered = [...PART_SLOTS].sort((p, q) => p.z - q.z);
  for (const slot of ordered) {
    const part = parts[slot.id];
    if (isEmpty(part)) continue;
    if (slot.id === 'fistF') continue;   // the swap target, not part of the rest pose
    const img = renderPart(part, ramps, palette);
    const tmp = document.createElement('canvas');
    tmp.width = img.width; tmp.height = img.height;
    tmp.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);

    const at = POSE.pos[slot.bone];
    const x = ox + at.x * PX_PER_UNIT * SCALE - part.pivot[0] * SCALE;
    const y = oy - at.y * PX_PER_UNIT * SCALE - part.pivot[1] * SCALE;
    ctx.drawImage(tmp, Math.round(x), Math.round(y), img.width * SCALE, img.height * SCALE);
  }

  const kit = kitOf(who);
  if (kit.head && kit.head.region) {
    const at = POSE.pos.head;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    const hw = kit.head.region[2] * SCALE;
    const hh = kit.head.region[3] * SCALE;
    ctx.fillRect(ox + at.x * PX_PER_UNIT * SCALE - hw / 2, oy - at.y * PX_PER_UNIT * SCALE - hh, hw, hh);
  }
}

/* ── Rendering ─────────────────────────────────────────────────────────────── */

function renderWho() {
  const host = el('who');
  host.textContent = '';
  for (const kit of KITS.characters) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(kit.id === who));
    b.textContent = kit.name;
    b.onclick = () => { who = kit.id; redraw(); };
    host.appendChild(b);
  }
}

function renderSlots() {
  const host = el('slots');
  host.textContent = '';
  let group = null;
  for (const slot of PART_SLOTS) {
    if (slot.group !== group) {
      group = slot.group;
      const h = document.createElement('div');
      h.className = 'lbl slotgroup';
      h.textContent = group;
      host.appendChild(h);
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-current', String(slot.id === slotId));
    const name = document.createElement('span');
    name.textContent = slot.label;
    const dot = document.createElement('span');
    dot.className = 'dot' + (isEmpty(parts[slot.id]) ? '' : ' on');
    dot.title = isEmpty(parts[slot.id]) ? 'not drawn yet' : 'drawn';
    b.append(name, dot);
    b.onclick = () => { slotId = slot.id; redraw(); };
    host.appendChild(b);
  }
}

function renderInks() {
  const host = el('inks');
  host.textContent = '';
  for (const ch of INK_CHARS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(ch === ink));
    b.title = INK_LABELS[ch] + '  (' + ch + ')';
    const hex = inkHex(ch);
    b.style.background = hex || 'transparent';
    if (!hex) b.style.backgroundImage = 'repeating-linear-gradient(45deg, var(--rule) 0 4px, transparent 4px 8px)';
    const key = document.createElement('span');
    key.className = 'key';
    key.textContent = ch;
    key.style.color = hex && luminance(hexToRgb(hex)) < 120 ? '#fff' : '#000';
    b.appendChild(key);
    b.onclick = () => { ink = ch; renderInks(); };
    host.appendChild(b);
  }
  el('inkname').textContent = INK_LABELS[ink] + (inkHex(ink) ? '  \\u00B7  ' + inkHex(ink) : '');
}

function renderToolbar() {
  const host = el('toolbar');
  host.textContent = '';
  const tools = [['pencil', 'Pencil'], ['fill', 'Fill'], ['erase', 'Erase'], ['dropper', 'Pick']];
  for (const t of tools) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t[1];
    b.setAttribute('aria-pressed', String(tool === t[0]));
    b.onclick = () => { tool = t[0]; renderToolbar(); };
    host.appendChild(b);
  }
  const sep = document.createElement('span');
  sep.className = 'sep';
  host.appendChild(sep);

  const extras = [
    ['Outline', () => { pushUndo(); parts[slotId] = autoOutline(parts[slotId]); }],
    ['Mirror', () => { pushUndo(); parts[slotId] = mirrorPart(parts[slotId]); }],
    ['Undo', () => {
      const last = undo.pop();
      if (last) { slotId = last.slotId; parts[slotId] = { ...parts[slotId], rows: last.rows }; }
    }],
  ];
  for (const e of extras) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = e[0];
    b.onclick = () => { e[1](); redraw(); };
    host.appendChild(b);
  }
}

function renderFlags() {
  const host = el('flags');
  host.textContent = '';
  const doc = exportDoc();
  const problems = validateParts(doc);
  const push = (text, calm) => {
    const li = document.createElement('li');
    li.textContent = text;
    if (calm) li.className = 'calm';
    host.appendChild(li);
  };
  for (const p of problems) push(p, false);

  const drawn = PART_SLOTS.filter((s) => !isEmpty(parts[s.id])).length;
  push(drawn + ' of ' + PART_SLOTS.length + ' parts drawn.', true);
  push('Pink marks the bone: the dot is where the part hangs, the dashed line is how far it reaches to the next joint.', true);
}

function exportDoc() {
  return createPartsDocument({
    parts: PART_SLOTS.map((s) => parts[s.id]).filter((p) => !isEmpty(p)),
  });
}

function renderExport() {
  const doc = exportDoc();
  el('out').textContent = doc.parts.length === 0
    ? 'Nothing drawn yet.\\nDraw a part and the JSON to save as art/parts/standard.json appears here.'
    : JSON.stringify(doc, null, 1);
}

function redraw() {
  renderWho();
  renderSlots();
  renderInks();
  renderToolbar();
  drawGrid();
  drawFigure();
  renderFlags();
  renderExport();
}

/* ── Input ─────────────────────────────────────────────────────────────────── */

const canvas = el('grid');
canvas.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  canvas.setPointerCapture(ev.pointerId);
  painting = true;
  const c = cellFrom(ev);
  apply(c[0], c[1], true);
});
canvas.addEventListener('pointermove', (ev) => {
  const c = cellFrom(ev);
  const part = parts[slotId];
  el('where').textContent = (c[0] >= 0 && c[1] >= 0 && c[0] < part.w && c[1] < part.h)
    ? 'x ' + c[0] + '  y ' + c[1] + '  ink ' + inkAt(part, c[0], c[1])
    : '\\u00A0';
  if (painting && tool !== 'fill') apply(c[0], c[1], false);
});
const stop = () => { painting = false; };
canvas.addEventListener('pointerup', stop);
canvas.addEventListener('pointercancel', stop);
canvas.addEventListener('pointerleave', () => { el('where').textContent = '\\u00A0'; });

/* Number and letter keys pick an ink directly, which is how anyone actually draws. */
addEventListener('keydown', (ev) => {
  if (ev.target instanceof HTMLInputElement) return;
  const k = ev.key;
  if (INK_CHARS.includes(k)) { ink = k; renderInks(); return; }
  if (k === 'b') { tool = 'pencil'; renderToolbar(); }
  else if (k === 'g') { tool = 'fill'; renderToolbar(); }
  else if (k === 'e') { tool = 'erase'; renderToolbar(); }
  else if (k === 'i') { tool = 'dropper'; renderToolbar(); }
  else if ((ev.metaKey || ev.ctrlKey) && k === 'z') {
    const last = undo.pop();
    if (last) { slotId = last.slotId; parts[slotId] = { ...parts[slotId], rows: last.rows }; redraw(); }
  }
});

el('copy').onclick = async () => {
  const btn = el('copy');
  const was = btn.textContent;
  try {
    await navigator.clipboard.writeText(el('out').textContent);
    btn.textContent = 'Copied';
  } catch (err) {
    btn.textContent = 'Select the block below';
  }
  setTimeout(() => { btn.textContent = was; }, 1600);
};
el('clear').onclick = () => { pushUndo(); parts[slotId] = createPart(slotId); redraw(); };

redraw();
</script>
`;

mkdirSync(resolve(ROOT, 'art/editor'), { recursive: true });
writeFileSync(OUT, html);
console.log(
  `wrote ${OUT}`,
  `\n  ${(html.length / 1024).toFixed(0)} KB, ${slotCount} part slots, ${kits.characters.length} palettes,`,
  `${MODULES.length} modules inlined from source`,
);
