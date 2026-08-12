/**
 * The `mews.kits` format — a philosopher reduced to a palette plus a face.
 *
 * A kit is deliberately small. Limbs, hands, fists and feet are shared sprites
 * coloured from the palette, so the only art a character owns is its head, an
 * optional garment override, and an optional accessory. That is what makes a roster
 * of Presocratics tractable: most of them survive only as Roman busts, and a bust is
 * a head and nothing else.
 *
 * Both palettes are kept. `measured` is what the painting actually said; `adjusted`
 * is what survives being shrunk to sprite size. Frescoes are low-contrast and
 * downsampling flattens them further, so the honest record and the usable colours are
 * different things and both are worth having.
 */

import { validatePalette } from './paletteSchema';

export const KITS_FORMAT = 'mews.kits';
export const KITS_VERSION = 1;

/** Where an accessory attaches, and what it does there. */
export const ACCESSORY_KINDS = {
  /** Gripped in a hand — a scroll, a book, Archimedes' screw. Rides the `prop` bone. */
  held: { bone: 'prop' },
  /** Orbiting the chest — a sundial, an armillary, a drifting element. On `fx.core`. */
  floating: { bone: 'fx.core' },
};

export function createKit(id, overrides = {}) {
  return {
    id,
    name: id,
    epithet: '',
    school: 'presocratic',
    doctrine: '',
    element: 'aether',
    palette: null,
    measured: null,
    boost: null,
    head: null,
    garment: null,
    accessory: null,
    source: { title: '', artist: '', year: null, url: '', license: '', note: '' },
    notes: '',
    ...overrides,
  };
}

export function createKitsDocument(overrides = {}) {
  return {
    format: KITS_FORMAT,
    version: KITS_VERSION,
    sheet: 'heads.sheet.png',
    sheetSize: [0, 0],
    characters: [],
    ...overrides,
  };
}

/** Find a character by id. */
export function findKit(doc, id) {
  return doc.characters.find((c) => c.id === id) ?? null;
}

/**
 * Add or replace one character, leaving the rest untouched.
 * Append-only in spirit: adding a philosopher must never rewrite an existing entry,
 * so a kit file stays reviewable in a diff.
 */
export function upsertKit(doc, kit) {
  const index = doc.characters.findIndex((c) => c.id === kit.id);
  const characters = [...doc.characters];
  if (index >= 0) characters[index] = kit;
  else characters.push(kit);
  return { ...doc, characters };
}

function validateRegion(region, label, problems) {
  if (!Array.isArray(region) || region.length !== 4) {
    problems.push(`${label} region must be [x, y, w, h]`);
    return;
  }
  if (region.some((n) => !Number.isFinite(n))) problems.push(`${label} region has non-numeric values`);
  if (region[2] <= 0 || region[3] <= 0) problems.push(`${label} region has zero or negative size`);
}

/**
 * Validate a kits document. Reports problems rather than throwing, because the
 * palette editor calls this on every keystroke.
 */
export function validateKits(doc) {
  const problems = [];
  if (!doc || typeof doc !== 'object') return ['Kits document is not an object'];
  if (doc.format !== KITS_FORMAT) problems.push(`Unexpected format "${doc.format}"`);
  if (doc.version !== KITS_VERSION) problems.push(`Version ${doc.version} (expected ${KITS_VERSION})`);
  if (!Array.isArray(doc.characters)) return [...problems, 'characters is not an array'];

  const seen = new Set();
  for (const kit of doc.characters) {
    const who = kit.id || '(unnamed)';
    if (!kit.id) problems.push('A character has no id');
    if (seen.has(kit.id)) problems.push(`Duplicate character id "${kit.id}"`);
    seen.add(kit.id);

    if (!kit.palette) {
      problems.push(`${who} has no palette`);
    } else {
      for (const p of validatePalette(kit.palette)) problems.push(`${who}: ${p}`);
    }

    // A kit with no head is a palette with nothing to quantise, which defeats the
    // point — the head is the only thing that makes the character recognisable.
    if (!kit.head) {
      problems.push(`${who} has no head`);
    } else {
      validateRegion(kit.head.region, `${who} head`, problems);
      if (!Array.isArray(kit.head.pivot) || kit.head.pivot.length !== 2) {
        problems.push(`${who} head pivot must be [x, y]`);
      }
    }

    if (kit.garment) validateRegion(kit.garment.region, `${who} garment`, problems);

    if (kit.accessory) {
      const kind = kit.accessory.kind;
      if (!ACCESSORY_KINDS[kind]) {
        problems.push(`${who} accessory kind "${kind}" is not one of ${Object.keys(ACCESSORY_KINDS).join(', ')}`);
      }
      validateRegion(kit.accessory.region, `${who} accessory`, problems);
    }

    if (!kit.source?.license) problems.push(`${who} has no licence recorded`);
  }

  // Every region has to sit inside the sheet, or the renderer samples garbage.
  const [sw, sh] = doc.sheetSize ?? [0, 0];
  if (sw > 0 && sh > 0) {
    for (const kit of doc.characters) {
      for (const [label, entry] of [['head', kit.head], ['garment', kit.garment], ['accessory', kit.accessory]]) {
        if (!entry?.region) continue;
        const [x, y, w, h] = entry.region;
        if (x < 0 || y < 0 || x + w > sw || y + h > sh) {
          problems.push(`${kit.id} ${label} region ${JSON.stringify(entry.region)} falls outside the ${sw}x${sh} sheet`);
        }
      }
    }
  }

  return problems;
}

/** Regions in a kits document must not overlap, or two heads share pixels. */
export function findSheetOverlaps(doc) {
  const boxes = [];
  for (const kit of doc.characters) {
    for (const [label, entry] of [['head', kit.head], ['garment', kit.garment], ['accessory', kit.accessory]]) {
      if (entry?.region) boxes.push({ name: `${kit.id}.${label}`, r: entry.region });
    }
  }
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [ax, ay, aw, ah] = boxes[i].r;
      const [bx, by, bw, bh] = boxes[j].r;
      if (ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah) {
        overlaps.push(`${boxes[i].name} overlaps ${boxes[j].name}`);
      }
    }
  }
  return overlaps;
}
