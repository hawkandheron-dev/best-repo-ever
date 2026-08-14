/**
 * Generate the pigment card. Run with `npm run buildcard`.
 *
 * Writes `art/editor/pigment-card.html`: a single self-contained page showing every kit
 * in the resource, with its palette editable by eye and an export that goes straight back
 * into `art/recipes.js` as an `overrides` block.
 *
 * GENERATED, NOT HAND-WRITTEN. That is the point of it.
 *
 * The card has to be self-contained — it is published as an artifact, and artifacts run
 * under a CSP that blocks every external fetch, so it cannot import from `src/`. The
 * previous version solved that by hand-copying the ramp maths into the HTML, which meant
 * two implementations of the same derivation drifting apart every time one changed. This
 * script inlines the REAL modules instead: it reads them off disk, strips the module
 * syntax, and concatenates them in dependency order. There is one implementation.
 *
 * The head previews recolour by STOP, not by re-quantising. Every pixel in the shipped
 * sheet is already one of the kit's ramp colours, so each can be matched back to the
 * stop that produced it and repainted with whatever that stop is worth under the edited
 * palette. That is exact for the assignment the build made — but it does not re-run the
 * assignment, so a large edit that would send pixels to a different material shows up
 * only after `npm run buildkit`. The card says so.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'art/editor/pigment-card.html');

/** Dependency order matters: each module may use the ones before it. */
const MODULES = [
  'src/fighter/palette/color.js',
  'src/fighter/palette/paletteSchema.js',
  'src/fighter/palette/ramp.js',
];

/**
 * Turn an ES module into a plain script.
 *
 * Imports go (everything ends up in one scope, so the names are already there) and the
 * `export` keyword goes. Deliberately narrow: it handles the two forms these files
 * actually use and would throw rather than silently mangle anything else.
 */
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
  .map((file) => `/* ── ${file} ─────────────────────────── */\n${stripModuleSyntax(readFileSync(resolve(ROOT, file), 'utf8'), file)}`)
  .join('\n');

const kits = JSON.parse(readFileSync(resolve(ROOT, 'public/philosophers/kits.json'), 'utf8'));
const sheetB64 = readFileSync(resolve(ROOT, 'public/philosophers/heads.sheet.png')).toString('base64');


/**
 * The page.
 *
 * A colour editor has to be judged on a NEUTRAL ground. A tinted page shifts perception
 * of every warm swatch on it, and these palettes are almost entirely warm — ochre,
 * terracotta, mauve, maroon. So the neutrals here carry a faint green bias (the
 * complement of what is on show) and the specimen sits on a switchable reference field:
 * 18% grey to judge colour, the stage blue to judge legibility in play, and a plaster
 * tone to judge it against the wall it was painted on.
 *
 * The vernacular is a printer's ink book and a photographic grey card, not a Renaissance
 * manuscript: flat, hairline-ruled, small letterspaced monospace labels, tabular figures.
 * No webfont — a CSP blocks font CDNs and a silent fallback is worse than a system stack
 * used deliberately.
 */
const html = `<title>Pigment Card</title>
<style>
  :root {
    --paper: #E8E9E6; --panel: #F2F3F0; --rule: #C7CAC4;
    --ink: #191C1A; --muted: #676B67; --signal: #1F5A66; --alarm: #8C3A1B;
    --shim: rgba(25, 28, 26, 0.06);
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper: #141614; --panel: #1C1F1D; --rule: #2F332F;
      --ink: #E5E7E3; --muted: #8D928D; --signal: #74B4C0; --alarm: #D98A5F;
      --shim: rgba(229, 231, 227, 0.07);
    }
  }
  :root[data-theme="dark"] {
    --paper: #141614; --panel: #1C1F1D; --rule: #2F332F;
    --ink: #E5E7E3; --muted: #8D928D; --signal: #74B4C0; --alarm: #D98A5F;
    --shim: rgba(229, 231, 227, 0.07);
  }

  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--paper); color: var(--ink);
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .sheet { max-width: 1140px; margin: 0 auto; padding: 40px 28px 96px; }

  .masthead { border-bottom: 2px solid var(--ink); padding-bottom: 14px; margin-bottom: 0; }
  h1 { margin: 0; font-size: 30px; font-weight: 620; letter-spacing: -0.022em; }
  .standfirst { margin: 8px 0 0; color: var(--muted); max-width: 64ch; font-size: 14px; }

  .lbl {
    font: 500 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted);
  }

  .specimens { display: flex; gap: 0; border-bottom: 1px solid var(--rule); }
  .spec {
    appearance: none; background: none; border: 0; border-bottom: 2px solid transparent;
    margin-bottom: -1px; padding: 13px 18px; cursor: pointer; color: var(--muted);
    font: 500 13px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: 0.01em;
  }
  .spec[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--signal); }
  .spec:focus-visible { outline: 2px solid var(--signal); outline-offset: -2px; }

  .cols { display: grid; grid-template-columns: 392px 1fr; gap: 40px; padding-top: 26px; }
  @media (max-width: 940px) { .cols { grid-template-columns: 1fr; gap: 28px; } .plate { order: -1; } }

  /* ── The ink book ── */
  .book { border-top: 1px solid var(--rule); }
  .ink {
    display: grid; grid-template-columns: 46px 1fr 88px; gap: 10px;
    align-items: center; padding: 7px 0; border-bottom: 1px solid var(--rule);
  }
  /* Measured beside current, so a deviation reads as a step in the colour itself and
     not only as a highlighted label. */
  .pair { display: flex; height: 26px; border: 1px solid var(--rule); }
  .pair span { flex: 1; display: block; }
  .pair.same span:first-child { display: none; }
  .ink .name { font-size: 13px; line-height: 1.25; }
  .ink .name em { display: block; font-style: normal; color: var(--alarm); font-size: 10.5px;
    letter-spacing: 0.08em; text-transform: uppercase; font-family: ui-monospace, Menlo, monospace; }
  .ink input[type="text"] {
    width: 100%; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace;
    font-variant-numeric: tabular-nums; padding: 6px 7px;
    border: 1px solid var(--rule); background: var(--panel); color: var(--ink);
  }
  .ink input[type="text"]:focus-visible { outline: 2px solid var(--signal); outline-offset: -1px; }
  .swatchbtn { position: relative; height: 26px; padding: 0; border: 0; background: none; cursor: pointer; }
  .swatchbtn input[type="color"] { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }

  .dials { display: grid; gap: 12px; padding: 20px 0 0; }
  .dial { display: grid; grid-template-columns: 92px 1fr 40px; gap: 10px; align-items: center; }
  .dial output { font: 12px ui-monospace, Menlo, monospace; font-variant-numeric: tabular-nums; text-align: right; }
  input[type="range"] { width: 100%; accent-color: var(--signal); }

  .acts { display: flex; gap: 8px; padding-top: 18px; }
  .acts button {
    font: 500 13px ui-sans-serif, system-ui, sans-serif; padding: 9px 15px; cursor: pointer;
    border: 1px solid var(--rule); background: var(--panel); color: var(--ink);
  }
  .acts button.go { background: var(--signal); border-color: var(--signal); color: var(--paper); }
  .acts button:focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }

  /* ── The plate ── */
  .field {
    display: flex; align-items: flex-end; justify-content: center; gap: 34px;
    padding: 30px 24px; min-height: 260px; border: 1px solid var(--rule);
  }
  canvas { image-rendering: pixelated; display: block; }
  .grounds { display: flex; gap: 0; margin-top: -1px; }
  .grounds button {
    flex: 1; padding: 8px 6px; cursor: pointer; border: 1px solid var(--rule);
    margin-left: -1px; background: var(--panel); color: var(--muted);
    font: 500 10px/1 ui-monospace, Menlo, monospace; letter-spacing: 0.12em; text-transform: uppercase;
  }
  .grounds button:first-child { margin-left: 0; }
  .grounds button[aria-pressed="true"] { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .grounds button:focus-visible { outline: 2px solid var(--signal); outline-offset: -2px; }

  .band { display: grid; gap: 3px; margin-top: 22px; }
  .bandrow { display: grid; grid-template-columns: 62px 1fr; gap: 10px; align-items: center; }
  .strip { display: flex; height: 26px; }
  .strip span { flex: 1; }
  .strip span:nth-child(2) { flex: 1.25; }

  .facts { margin-top: 22px; border-top: 1px solid var(--rule); padding-top: 14px;
    display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px 22px; }
  .fact dt { margin: 0 0 3px; }
  .fact dd { margin: 0; font-size: 13px; line-height: 1.4; }
  .fact dd.mono { font-family: ui-monospace, Menlo, monospace; font-size: 12px; font-variant-numeric: tabular-nums; }

  .flags { margin: 18px 0 0; padding: 0; list-style: none; display: grid; gap: 7px; }
  .flags li { font-size: 13px; padding-left: 14px; border-left: 2px solid var(--alarm); color: var(--ink); }
  .flags li.calm { border-left-color: var(--rule); color: var(--muted); }

  pre {
    margin: 22px 0 0; padding: 14px; background: var(--panel); border: 1px solid var(--rule);
    font: 12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;
    overflow-x: auto; white-space: pre; color: var(--ink);
  }
  code { font: 12px ui-monospace, Menlo, monospace; background: var(--shim); padding: 1px 4px; }
</style>

<div class="sheet">
  <header class="masthead">
    <h1>Pigment Card</h1>
    <p class="standfirst">
      Every philosopher in the kit resource, with the ten stored colours open for editing.
      Change one and the head repaints. When it reads right, copy the block and paste it
      into that character&rsquo;s recipe.
    </p>
  </header>

  <div class="specimens" id="specimens" role="tablist"></div>

  <div class="cols">
    <section>
      <div class="book" id="book"></div>
      <div class="dials" id="dials"></div>
      <div class="acts">
        <button type="button" id="reset">Reset to measured</button>
        <button type="button" class="go" id="copy">Copy overrides</button>
      </div>
      <ul class="flags" id="flags"></ul>
    </section>

    <section class="plate">
      <div class="field" id="field">
        <canvas id="big"></canvas>
        <canvas id="mid"></canvas>
        <canvas id="one"></canvas>
      </div>
      <div class="grounds" id="grounds"></div>
      <div class="band" id="band"></div>
      <dl class="facts" id="facts"></dl>
      <pre id="out"></pre>
    </section>
  </div>
</div>

<script>
${inlined}

/* ── Baked in at generation time ───────────────────────────────────────────── */

const KITS = ${JSON.stringify(kits)};
const SHEET_SRC = 'data:image/png;base64,${sheetB64}';

/* Reference fields. Constant across themes, because they are calibration references
   rather than decoration: 18% grey is the neutral to judge hue against, the stage blue
   is what the sprite will actually be drawn on, and plaster is the wall it came off. */
const GROUNDS = [
  ['neutral', '18% grey', '#767674'],
  ['stage', 'stage', '#2A3A4A'],
  ['plaster', 'plaster', '#D9D5C9'],
];

let current = KITS.characters[0].id;
let ground = 'neutral';
const edits = {};

const kitById = (id) => KITS.characters.find((k) => k.id === id);
const el = (id) => document.getElementById(id);

function stateFor(id) {
  if (!edits[id]) {
    const kit = kitById(id);
    edits[id] = { palette: structuredClone(kit.measured), boost: { ...kit.boost } };
  }
  return edits[id];
}

/* The stored palette differs from the measured one in exactly one place: the outline,
   which the build deepens until the silhouette reads. Redoing that here rather than
   copying the stored value keeps an edited palette's outline consistent with it. */
function workingPalette(id) {
  const { palette, boost } = stateFor(id);
  const out = structuredClone(palette);
  out.outline = deepenOutline(palette.outline, buildRamps(palette, boost));
  return out;
}

/* ── Repainting by stop ────────────────────────────────────────────────────── */

const sheet = new Image();
let sheetReady = false;

/* Every opaque pixel in the shipped sheet is one of the kit's own ramp colours, so this
   is a lookup rather than a nearest-match: exact, and an unmapped pixel is left alone
   rather than quietly guessed at. */
function stopLookup(kit) {
  const map = new Map();
  for (const entry of Object.entries(kit.ramps || {})) {
    for (const stop of Object.entries(entry[1])) map.set(stop[1].toUpperCase(), { id: entry[0], stop: stop[0] });
  }
  map.set(kit.palette.outline.toUpperCase(), { id: 'outline', stop: null });
  map.set(kit.palette.accent.toUpperCase(), { id: 'accent', stop: null });
  return map;
}

const STOP_AT = { light: 0, base: 1, shadow: 2 };

function repaint(canvas, kit, scale) {
  if (!sheetReady) return;
  const region = kit.head.region;
  const rw = region[2];
  const rh = region[3];
  canvas.width = rw * scale;
  canvas.height = rh * scale;
  canvas.setAttribute('aria-label', kit.name + ' head sprite, ' + scale + ' times actual size');

  const src = document.createElement('canvas');
  src.width = rw; src.height = rh;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(sheet, region[0], region[1], rw, rh, 0, 0, rw, rh);
  const img = sctx.getImageData(0, 0, rw, rh);

  const lookup = stopLookup(kit);
  const palette = workingPalette(kit.id);
  const ramps = buildRamps(palette, stateFor(kit.id).boost);
  const outline = hexToRgb(palette.outline);
  const accent = hexToRgb(palette.accent);

  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    const hit = lookup.get(rgbToHex([img.data[i], img.data[i + 1], img.data[i + 2]]));
    if (!hit) continue;
    const rgb = hit.id === 'outline' ? outline
      : hit.id === 'accent' ? accent
        : (ramps[hit.id] || [])[STOP_AT[hit.stop]];
    if (!rgb) continue;
    img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2];
  }

  const tmp = document.createElement('canvas');
  tmp.width = rw; tmp.height = rh;
  tmp.getContext('2d').putImageData(img, 0, 0);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
}

/* ── Rendering ─────────────────────────────────────────────────────────────── */

function renderSpecimens() {
  const host = el('specimens');
  host.textContent = '';
  for (const kit of KITS.characters) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'spec';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(kit.id === current));
    b.textContent = kit.name;
    b.onclick = () => { current = kit.id; renderAll(); };
    host.appendChild(b);
  }
}

function renderBook() {
  const kit = kitById(current);
  const state = stateFor(current);
  const host = el('book');
  host.textContent = '';

  for (const role of PALETTE_ROLES) {
    const value = String(getRole(state.palette, role.path));
    const measured = String(getRole(kit.measured, role.path));
    const changed = value.toUpperCase() !== measured.toUpperCase();

    const row = document.createElement('div');
    row.className = 'ink';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatchbtn';
    btn.title = changed ? 'measured ' + measured + ', now ' + value : measured;
    const pair = document.createElement('span');
    pair.className = 'pair' + (changed ? '' : ' same');
    const was = document.createElement('span');
    was.style.background = measured;
    const now = document.createElement('span');
    now.style.background = value;
    pair.append(was, now);
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = value;
    picker.setAttribute('aria-label', role.label);
    btn.append(pair, picker);

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = role.label;
    if (changed) {
      const tag = document.createElement('em');
      tag.textContent = 'was ' + measured;
      name.appendChild(tag);
    }

    const text = document.createElement('input');
    text.type = 'text';
    text.value = value;
    text.spellcheck = false;
    text.setAttribute('aria-label', role.label + ' hex value');

    const set = (hex) => {
      if (!/^#[0-9a-f]{6}$/i.test(hex)) { renderAll(); return; }
      edits[current].palette = setRole(edits[current].palette, role.path, hex.toUpperCase());
      renderAll();
    };
    picker.oninput = (e) => set(e.target.value);
    text.onchange = (e) => set(e.target.value.trim());

    row.append(btn, name, text);
    host.appendChild(row);
  }
}

function renderDials() {
  const state = stateFor(current);
  const host = el('dials');
  host.textContent = '';
  const defs = [
    ['spread', 'Contrast', 1, 2.4, 0.05],
    ['separate', 'Skin \\u00F7 hair', 0, 1.6, 0.05],
  ];
  for (const def of defs) {
    const row = document.createElement('div');
    row.className = 'dial';
    const label = document.createElement('label');
    label.className = 'lbl';
    label.textContent = def[1];
    label.htmlFor = 'd-' + def[0];
    const input = document.createElement('input');
    input.type = 'range';
    input.id = 'd-' + def[0];
    input.min = def[2]; input.max = def[3]; input.step = def[4];
    input.value = state.boost[def[0]] || 0;
    const out = document.createElement('output');
    out.textContent = Number(state.boost[def[0]] || 0).toFixed(2);
    input.oninput = (e) => {
      edits[current].boost = Object.assign({}, edits[current].boost, { [def[0]]: Number(e.target.value) });
      renderAll();
    };
    row.append(label, input, out);
    host.appendChild(row);
  }
}

function renderGrounds() {
  const host = el('grounds');
  host.textContent = '';
  for (const g of GROUNDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = g[1];
    b.setAttribute('aria-pressed', String(g[0] === ground));
    b.onclick = () => { ground = g[0]; renderAll(); };
    host.appendChild(b);
  }
  const chosen = GROUNDS.find((g) => g[0] === ground);
  el('field').style.background = chosen[2];
}

function renderPlate() {
  const kit = kitById(current);
  repaint(el('big'), kit, 7);
  repaint(el('mid'), kit, 3);
  repaint(el('one'), kit, 1);

  const palette = workingPalette(current);
  const ramps = buildRamps(palette, stateFor(current).boost);
  const hex = rampsToHex(ramps);

  const band = el('band');
  band.textContent = '';
  for (const id of Object.keys(hex)) {
    const row = document.createElement('div');
    row.className = 'bandrow';
    const name = document.createElement('span');
    name.className = 'lbl';
    name.textContent = id;
    const strip = document.createElement('div');
    strip.className = 'strip';
    for (const stop of ['light', 'base', 'shadow']) {
      const s = document.createElement('span');
      s.style.background = hex[id][stop];
      s.title = id + '.' + stop + '  ' + hex[id][stop];
      strip.appendChild(s);
    }
    row.append(name, strip);
    band.appendChild(row);
  }

  const facts = el('facts');
  facts.textContent = '';
  const entries = [
    ['Doctrine', kit.doctrine, false],
    ['Element', kit.element, false],
    ['Sprite', kit.head.region[2] + ' \\u00D7 ' + kit.head.region[3] + ' px', true],
    ['Shape from', kit.source.title, false],
    ['Colour from', kit.paletteSource ? kit.paletteSource.title : kit.source.title, false],
    ['Outline', kit.measured.outline + ' \\u2192 ' + palette.outline, true],
  ];
  for (const entry of entries) {
    const wrap = document.createElement('div');
    wrap.className = 'fact';
    const dt = document.createElement('dt');
    dt.className = 'lbl';
    dt.textContent = entry[0];
    const dd = document.createElement('dd');
    dd.textContent = entry[1];
    if (entry[2]) dd.className = 'mono';
    wrap.append(dt, dd);
    facts.appendChild(wrap);
  }

  const flags = el('flags');
  flags.textContent = '';
  const push = (text, calm) => {
    const li = document.createElement('li');
    li.textContent = text;
    if (calm) li.className = 'calm';
    flags.appendChild(li);
  };
  for (const p of validatePalette(palette)) push(p, false);
  for (const p of checkRamps(ramps, { outline: hexToRgb(palette.outline) })) push(p, false);
  const lifted = liftedMaterials(palette, stateFor(current).boost);
  if (lifted.length) {
    push(lifted.map((m) => m.id).join(', ') + ' lifted onto the value floor \\u2014 too dark to show three distinct stops.', true);
  }
  if (kit.notes) push(kit.notes, true);
  push('Previews repaint the build\\u2019s existing colour assignment. An edit large enough to send pixels to a different material only shows after a rebuild.', true);
}

function overridesFor(id) {
  const kit = kitById(id);
  const { palette } = stateFor(id);
  const out = {};
  for (const role of PALETTE_ROLES) {
    const value = String(getRole(palette, role.path));
    if (value.toUpperCase() !== String(getRole(kit.measured, role.path)).toUpperCase()) {
      out[role.path] = value.toUpperCase();
    }
  }
  return out;
}

function renderExport() {
  const kit = kitById(current);
  const overrides = overridesFor(current);
  const boost = stateFor(current).boost;
  const boostChanged = boost.spread !== kit.boost.spread || boost.separate !== kit.boost.separate;
  const q = String.fromCharCode(39);

  if (Object.keys(overrides).length === 0 && !boostChanged) {
    el('out').textContent = kit.name + ' is unchanged from measured.\\n'
      + 'Edit a colour and the block to paste into art/recipes.js appears here.';
    return;
  }

  const lines = ['// art/recipes.js, inside the ' + q + kit.id + q + ' recipe:'];
  if (Object.keys(overrides).length > 0) {
    lines.push('overrides: {');
    for (const path of Object.keys(overrides)) {
      lines.push('  ' + q + path + q + ': ' + q + overrides[path] + q + ',');
    }
    lines.push('},');
  }
  if (boostChanged) {
    lines.push('boost: { spread: ' + boost.spread + ', separate: ' + boost.separate + ' },');
  }
  lines.push('');
  lines.push('// then: npm run buildkit && npm run kitpreview');
  el('out').textContent = lines.join('\\n');
}

function renderAll() {
  renderSpecimens();
  renderBook();
  renderDials();
  renderGrounds();
  renderPlate();
  renderExport();
}

el('reset').onclick = () => { delete edits[current]; renderAll(); };
el('copy').onclick = async () => {
  const btn = el('copy');
  const label = btn.textContent;
  try {
    await navigator.clipboard.writeText(el('out').textContent);
    btn.textContent = 'Copied';
  } catch (err) {
    btn.textContent = 'Select the block below';
  }
  setTimeout(() => { btn.textContent = label; }, 1600);
};

sheet.onload = () => { sheetReady = true; renderAll(); };
sheet.src = SHEET_SRC;
renderAll();
</script>
`;

mkdirSync(resolve(ROOT, 'art/editor'), { recursive: true });
writeFileSync(OUT, html);
console.log(
  `wrote ${OUT}`,
  `\n  ${(html.length / 1024).toFixed(0)} KB, ${kits.characters.length} kits,`,
  `${MODULES.length} palette modules inlined from source`,
);
