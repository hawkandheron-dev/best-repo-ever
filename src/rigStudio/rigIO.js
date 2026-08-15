/**
 * Saving and loading rigs.
 *
 * Two export shapes, for two different moments:
 *
 *  - **Embedded** — one `.rig.json` with every part inlined as a data URL. One
 *    file to move around, drop back into the studio, or hand to someone. This is
 *    what you want while iterating.
 *  - **Bundle** — `rig.json` plus loose part PNGs. What ships, what a human can
 *    open and repaint, and what `scripts/` can read without a browser.
 */

import { validateRig, SCHEMA_VERSION } from '../fighter/rig/rigSchema';

/** Trigger a browser download for a blob or data URL. */
export function downloadBlob(data, filename) {
  const url = typeof data === 'string' ? data : URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof data !== 'string') setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/**
 * Serialise a rig with its part images inlined.
 *
 * The clips are dropped when they are unchanged from the standard set — they are
 * the same few hundred lines for every character, and re-emitting them per rig
 * makes the file unreadable and the diffs useless. `loadRigDocument` puts them
 * back.
 */
export function serializeEmbedded(rig, images, { includeClips = false } = {}) {
  const doc = {
    ...rig,
    version: SCHEMA_VERSION,
    clips: includeClips ? rig.clips : undefined,
    usesStandardClips: !includeClips,
    parts: rig.parts.map((part) => {
      const canvas = images.get(part.id);
      return {
        ...part,
        src: null,
        dataUrl: canvas ? canvas.toDataURL('image/png') : null,
      };
    }),
  };
  if (!includeClips) delete doc.clips;
  return JSON.stringify(doc, null, 2);
}

/** Export as a JSON document plus one PNG per part. */
export async function exportBundle(rig, images) {
  const doc = {
    ...rig,
    version: SCHEMA_VERSION,
    usesStandardClips: true,
    parts: rig.parts.map((part) => ({ ...part, src: `parts/${part.id}.png`, dataUrl: undefined })),
  };
  delete doc.clips;

  downloadBlob(
    new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }),
    `${rig.id}.rig.json`,
  );

  for (const part of rig.parts) {
    const canvas = images.get(part.id);
    if (!canvas) continue;
    const blob = await canvasToBlob(canvas);
    if (blob) downloadBlob(blob, `${part.id}.png`);
  }
}

/** Load an image element from a data URL, resolved to a canvas the renderer can draw. */
function dataUrlToCanvas(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error('Could not decode an embedded part image'));
    img.src = dataUrl;
  });
}

/**
 * Parse a `.rig.json` back into a rig plus its images.
 * Reports validation problems rather than throwing on a merely imperfect file —
 * a rig with one bad part is still worth opening so it can be fixed.
 */
export async function loadRigDocument(text, { installClips }) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON');
  }
  if (doc.format !== 'mews.rig') throw new Error('That file is not a mews.rig document');

  const images = new Map();
  for (const part of doc.parts ?? []) {
    if (part.dataUrl) {
      images.set(part.id, await dataUrlToCanvas(part.dataUrl));
    }
  }

  let rig = {
    ...doc,
    // Drop the inlined image data; it has already been decoded into `images`.
    parts: (doc.parts ?? []).map((part) => {
      const stripped = { ...part };
      delete stripped.dataUrl;
      return { ...stripped, src: part.src ?? null };
    }),
    clips: doc.clips ?? {},
  };
  if (doc.usesStandardClips !== false && installClips) rig = installClips(rig);

  return { rig, images, problems: validateRig(rig) };
}
