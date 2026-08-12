/**
 * A procedurally drawn stand-in rig: flat capsules and ellipses, no artwork.
 *
 * This exists so the skeleton, the moveset and the runtime can be built and
 * watched before a single figure has been cut out of a painting — and afterwards,
 * so a broken pose can be told apart from a badly cut part.  Every shape here is
 * drawn from primitives at load time; nothing is loaded from disk and nothing is
 * generated from a model.
 *
 * Replace it by cutting real parts in the Rig Studio: the part ids below are the
 * conventional set, so a real rig using the same ids is a drop-in swap.
 */

import { DEFAULT_SKELETON, createEmptyRig, Z } from './rigSchema';
import { restWorldAngles } from './pose';
import { installStandardClips } from './standardClips';

/** Marble, bronze and terracotta — far limbs sit darker so depth reads. */
const PALETTE = {
  skinF: '#d8c9b0',
  skinB: '#a89a84',
  robeF: '#9c4a3c',
  robeB: '#6e3128',
  torso: '#c9b89c',
  head: '#e0d3bc',
  fist: '#c4b199',
  outline: '#3a3026',
};

/**
 * The conventional part set: one part per visible bone, plus a fist to swap in.
 * `girth` is the capsule thickness in rig units; `len` overrides the bone length
 * derived from the child joint (used for extremities, which have no child).
 */
const PART_SPECS = [
  { id: 'p.armB.up', bone: 'armB.up', girth: 20, fill: PALETTE.skinB, z: Z.ARM_B },
  { id: 'p.armB.fore', bone: 'armB.fore', girth: 17, fill: PALETTE.skinB, z: Z.ARM_B + 1 },
  { id: 'p.handB', bone: 'handB', girth: 18, len: 20, fill: PALETTE.skinB, z: Z.ARM_B + 2 },

  { id: 'p.legB.thigh', bone: 'legB.thigh', girth: 27, fill: PALETTE.skinB, z: Z.LEG_B },
  { id: 'p.legB.shin', bone: 'legB.shin', girth: 21, fill: PALETTE.skinB, z: Z.LEG_B + 1 },
  { id: 'p.footB', bone: 'footB', girth: 15, len: 30, fill: PALETTE.skinB, z: Z.LEG_B + 2 },

  { id: 'p.robeB', bone: 'robeB', girth: 46, len: 46, fill: PALETTE.robeB, z: Z.ROBE_B },

  { id: 'p.torso', bone: 'torso', shape: 'ellipse', rx: 26, ry: 54, fill: PALETTE.torso, z: Z.TORSO },

  { id: 'p.legF.thigh', bone: 'legF.thigh', girth: 29, fill: PALETTE.skinF, z: Z.LEG_F },
  { id: 'p.legF.shin', bone: 'legF.shin', girth: 22, fill: PALETTE.skinF, z: Z.LEG_F + 1 },
  { id: 'p.footF', bone: 'footF', girth: 16, len: 32, fill: PALETTE.skinF, z: Z.LEG_F + 2 },

  { id: 'p.robeA', bone: 'robeA', girth: 52, fill: PALETTE.robeF, z: Z.ROBE_F },

  { id: 'p.head', bone: 'head', shape: 'ellipse', rx: 23, ry: 28, fill: PALETTE.head, z: Z.HEAD, beard: true },

  { id: 'p.armF.up', bone: 'armF.up', girth: 22, fill: PALETTE.skinF, z: Z.ARM_F },
  { id: 'p.armF.fore', bone: 'armF.fore', girth: 18, fill: PALETTE.skinF, z: Z.ARM_F + 1 },
  { id: 'p.handF', bone: 'handF', girth: 19, len: 21, fill: PALETTE.skinF, z: Z.HAND_F },
  // The fist is the swap target the punch clips reach for.
  { id: 'p.fistF', bone: 'handF', girth: 25, len: 20, fill: PALETTE.fist, z: Z.HAND_F },
];

/** Bone length = distance to its first child, so capsules span their joint. */
function boneLength(boneId) {
  const child = DEFAULT_SKELETON.find(
    (b) => b.parent === boneId && !b.id.startsWith('fx.') && b.id !== 'prop',
  );
  if (!child) return null;
  return Math.hypot(child.pos[0], child.pos[1]);
}

/**
 * Draw one part into its own canvas, oriented as it appears at rest.
 *
 * Parts are counter-rotated by their bone's accumulated rest angle when drawn, so
 * the image must be authored in REST orientation — an upper arm hanging down is
 * drawn hanging down.  Returns the canvas plus the pivot pixel that sits on the
 * bone origin.
 */
function drawPart(spec, restAngle) {
  const canvas = document.createElement('canvas');

  // Rig +y is up, image +y is down, so a rest angle of A points at -A on canvas.
  const theta = (-restAngle * Math.PI) / 180;

  let width;
  let height;
  let pivot;

  if (spec.shape === 'ellipse') {
    const pad = 3;
    width = Math.ceil(spec.rx * 2 + pad * 2);
    height = Math.ceil(spec.ry * 2 + pad * 2 + (spec.beard ? 22 : 0));
    // Torso and head both grow upward from their joint, so the pivot sits low.
    pivot = [width / 2, height - pad - (spec.beard ? 22 : 0)];
  } else {
    const len = spec.len ?? boneLength(spec.bone) ?? 40;
    // Extend a little past the joint at each end: rigid parts that stop exactly at
    // the joint open a visible gap the moment the limb rotates.
    const overlap = spec.girth * 0.45;
    const ex = Math.cos(theta) * (len + overlap);
    const ey = Math.sin(theta) * (len + overlap);
    const sx = -Math.cos(theta) * overlap;
    const sy = -Math.sin(theta) * overlap;
    const pad = spec.girth / 2 + 2;

    const minX = Math.min(sx, ex) - pad;
    const maxX = Math.max(sx, ex) + pad;
    const minY = Math.min(sy, ey) - pad;
    const maxY = Math.max(sy, ey) + pad;

    width = Math.ceil(maxX - minX);
    height = Math.ceil(maxY - minY);
    pivot = [-minX, -minY];
    spec._draw = { sx, sy, ex, ey };
  }

  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d');

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (spec.shape === 'ellipse') {
    ctx.translate(pivot[0], pivot[1]);
    ctx.beginPath();
    ctx.ellipse(0, -spec.ry, spec.rx, spec.ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = spec.fill;
    ctx.fill();
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (spec.beard) {
      // A beard, so the head has an unmistakable front. Without a facing cue it is
      // impossible to tell whether a pose is turned around.
      ctx.beginPath();
      ctx.moveTo(-spec.rx * 0.55, -spec.ry * 0.55);
      ctx.quadraticCurveTo(0, spec.ry * 0.75, spec.rx * 0.62, -spec.ry * 0.5);
      ctx.quadraticCurveTo(spec.rx * 0.2, -spec.ry * 0.1, -spec.rx * 0.55, -spec.ry * 0.55);
      ctx.fillStyle = '#8d8375';
      ctx.fill();
      ctx.strokeStyle = PALETTE.outline;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(spec.rx * 0.34, -spec.ry * 1.15, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.outline;
      ctx.fill();
    }
  } else {
    const { sx, sy, ex, ey } = spec._draw;
    ctx.translate(pivot[0], pivot[1]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.strokeStyle = PALETTE.outline;
    ctx.lineWidth = spec.girth + 3;
    ctx.stroke();
    ctx.strokeStyle = spec.fill;
    ctx.lineWidth = spec.girth;
    ctx.stroke();
  }

  return { canvas, pivot: [pivot[0], pivot[1]] };
}

/**
 * Build the placeholder rig and its images.
 *
 * @returns {{ rig: object, images: Map<string, HTMLCanvasElement> }}
 */
export function buildPlaceholderRig(id = 'placeholder') {
  const base = createEmptyRig(id);
  base.name = 'Unrigged Philosopher';
  base.source = {
    title: 'Procedural placeholder',
    artist: '—',
    year: null,
    url: '',
    license: 'n/a',
    note: 'Flat primitives, drawn at load time. Replace by cutting real parts in the Rig Studio.',
  };

  const angles = restWorldAngles(base);
  const images = new Map();
  const parts = [];

  for (const spec of PART_SPECS) {
    const { canvas, pivot } = drawPart({ ...spec }, angles.get(spec.bone) ?? 0);
    images.set(spec.id, canvas);
    parts.push({ id: spec.id, bone: spec.bone, src: null, pivot, z: spec.z, mesh: null });
  }

  base.parts = parts;
  return { rig: installStandardClips(base), images };
}
