/**
 * The `mews.rig` format — skeleton, cut-out parts, and animation clips.
 *
 * This module is art-only by design: it contains NO gameplay numbers.  Hitboxes,
 * damage and stun live in `src/fighter/data/` instead, so that the simulation and
 * its headless tests never need to load an image.  (A rig implies an atlas PNG,
 * and `createImageBitmap` does not exist in Node.)
 *
 * Two naming rules that are easy to get wrong and expensive to fix later:
 *
 *  1. Limbs are `.f` / `.b` for camera-NEAR / camera-FAR, never left/right.
 *     In a side view the near arm stays near when the fighter turns around, so
 *     z-order is stable across a facing flip and mirroring is purely x → -x.
 *  2. Positions are rig space: origin at the feet, +x FORWARD, +y UP.
 */

export const SCHEMA_VERSION = 1;

/** Nominal standing height in rig units, used to normalise scale across characters. */
export const NOMINAL_HEIGHT = 340;

/**
 * The standard humanoid skeleton for a side-view fighter: 23 bones.
 *
 * `pos` is the bone's origin relative to its parent; `rest` is its rest angle in
 * degrees.  A limb bone points along its own local +x, so an arm hanging down
 * rests near -90°.  Child offsets double as bone lengths — `armF.fore` sitting at
 * [46, 0] means the upper arm is 46 units long.
 */
export const DEFAULT_SKELETON = [
  { id: 'root', parent: null, pos: [0, 0], rest: 0 },
  { id: 'pelvis', parent: 'root', pos: [0, 108], rest: 0 },
  { id: 'torso', parent: 'pelvis', pos: [0, 8], rest: 0 },
  { id: 'chest', parent: 'torso', pos: [2, 56], rest: 0 },
  { id: 'neck', parent: 'chest', pos: [4, 40], rest: 0 },
  { id: 'head', parent: 'neck', pos: [2, 14], rest: 0 },

  // Near arm (camera-side) — the one that throws most punches.
  { id: 'armF.up', parent: 'chest', pos: [10, 34], rest: -75 },
  { id: 'armF.fore', parent: 'armF.up', pos: [46, 0], rest: -20 },
  { id: 'handF', parent: 'armF.fore', pos: [40, 0], rest: 0 },

  // Far arm.
  { id: 'armB.up', parent: 'chest', pos: [-6, 32], rest: -95 },
  { id: 'armB.fore', parent: 'armB.up', pos: [46, 0], rest: -15 },
  { id: 'handB', parent: 'armB.fore', pos: [40, 0], rest: 0 },

  // Near leg.  The chain thigh→shin→foot lands the foot at y ≈ 0.
  { id: 'legF.thigh', parent: 'pelvis', pos: [8, -4], rest: -88 },
  { id: 'legF.shin', parent: 'legF.thigh', pos: [54, 0], rest: -4 },
  { id: 'footF', parent: 'legF.shin', pos: [50, 0], rest: 88 },

  // Far leg.
  { id: 'legB.thigh', parent: 'pelvis', pos: [-10, -4], rest: -92 },
  { id: 'legB.shin', parent: 'legB.thigh', pos: [54, 0], rest: -6 },
  { id: 'footB', parent: 'legB.shin', pos: [50, 0], rest: 92 },

  // Drapery: a two-link chain so robes can swing independently of the legs.
  { id: 'robeA', parent: 'pelvis', pos: [0, 4], rest: -90 },
  { id: 'robeB', parent: 'robeA', pos: [40, 0], rest: 0 },

  // Attachment points. These carry no art — FX and props anchor to them.
  { id: 'fx.hand', parent: 'handF', pos: [18, 0], rest: 0 },
  { id: 'fx.core', parent: 'chest', pos: [0, 20], rest: 0 },
  { id: 'prop', parent: 'handB', pos: [12, 0], rest: 0 },
];

/** Animatable bone channels, with the value each falls back to when unkeyed. */
export const BONE_CHANNELS = {
  rot: null, // null → fall back to the bone's `rest`
  x: null, //  null → fall back to the bone's `pos[0]`
  y: null, //  null → fall back to the bone's `pos[1]`
  sx: 1,
  sy: 1,
  skx: 0,
};

/** Draw-order bands, so new parts can be slotted in without renumbering. */
export const Z = {
  ARM_B: 10,
  LEG_B: 12,
  ROBE_B: 16,
  TORSO: 20,
  LEG_F: 24,
  HEAD: 30,
  ROBE_F: 34,
  ARM_F: 40,
  HAND_F: 42,
  PROP: 46,
  FX: 50,
};

/** A blank rig with the standard skeleton and no parts. */
export function createEmptyRig(id = 'untitled') {
  return {
    format: 'mews.rig',
    version: SCHEMA_VERSION,
    id,
    name: '',
    source: { title: '', artist: '', year: null, url: '', license: '', note: '' },
    atlas: null,
    space: { unitScale: 1, height: NOMINAL_HEIGHT },
    bones: DEFAULT_SKELETON.map((b) => ({ ...b, pos: [...b.pos] })),
    parts: [],
    clips: {},
  };
}

/** Index bones by id. */
export function boneMap(rig) {
  const map = new Map();
  for (const bone of rig.bones) map.set(bone.id, bone);
  return map;
}

/**
 * Bones ordered so that every bone appears after its parent.
 * `composePose` relies on this to build world transforms in a single pass.
 * Throws if the hierarchy contains a cycle or a missing parent.
 */
export function boneOrder(rig) {
  const map = boneMap(rig);
  const order = [];
  const state = new Map(); // id → 'visiting' | 'done'

  const visit = (bone) => {
    const seen = state.get(bone.id);
    if (seen === 'done') return;
    if (seen === 'visiting') throw new Error(`Bone hierarchy has a cycle at "${bone.id}"`);
    state.set(bone.id, 'visiting');
    if (bone.parent !== null) {
      const parent = map.get(bone.parent);
      if (!parent) throw new Error(`Bone "${bone.id}" has unknown parent "${bone.parent}"`);
      visit(parent);
    }
    state.set(bone.id, 'done');
    order.push(bone);
  };

  for (const bone of rig.bones) visit(bone);
  return order;
}

/**
 * Structural validation. Returns an array of human-readable problems, empty when
 * the rig is sound.  Called by the studio on every export and by
 * `scripts/framedata.js` in CI, so it must never throw on malformed input —
 * report instead.
 */
export function validateRig(rig) {
  const problems = [];

  if (!rig || typeof rig !== 'object') return ['Rig is not an object'];
  if (rig.format !== 'mews.rig') problems.push(`Unexpected format "${rig.format}"`);
  if (rig.version !== SCHEMA_VERSION) {
    problems.push(`Schema version ${rig.version} (expected ${SCHEMA_VERSION})`);
  }
  if (!rig.id) problems.push('Rig has no id');

  const bones = Array.isArray(rig.bones) ? rig.bones : [];
  if (bones.length === 0) problems.push('Rig has no bones');

  const seenBones = new Set();
  for (const bone of bones) {
    if (seenBones.has(bone.id)) problems.push(`Duplicate bone id "${bone.id}"`);
    seenBones.add(bone.id);
  }

  // Hierarchy integrity: cycles and orphans both surface here.
  try {
    boneOrder(rig);
  } catch (err) {
    problems.push(err.message);
  }

  const seenParts = new Set();
  for (const part of rig.parts ?? []) {
    if (seenParts.has(part.id)) problems.push(`Duplicate part id "${part.id}"`);
    seenParts.add(part.id);
    if (!seenBones.has(part.bone)) {
      problems.push(`Part "${part.id}" is bound to unknown bone "${part.bone}"`);
    }
    if (!part.region && !part.src) {
      problems.push(`Part "${part.id}" has neither an atlas region nor a src`);
    }
    if (part.region && part.region.length !== 4) {
      problems.push(`Part "${part.id}" region must be [x, y, w, h]`);
    }
  }

  for (const [clipId, clip] of Object.entries(rig.clips ?? {})) {
    if (!Number.isInteger(clip.frames) || clip.frames < 1) {
      problems.push(`Clip "${clipId}" has invalid frame count ${clip.frames}`);
      continue;
    }
    for (const [boneId, tracks] of Object.entries(clip.tracks ?? {})) {
      if (!seenBones.has(boneId)) {
        problems.push(`Clip "${clipId}" animates unknown bone "${boneId}"`);
      }
      for (const [channel, keys] of Object.entries(tracks)) {
        if (!(channel in BONE_CHANNELS)) {
          problems.push(`Clip "${clipId}" bone "${boneId}" has unknown channel "${channel}"`);
        }
        let prev = -1;
        for (const key of keys) {
          const [frame] = key;
          if (frame < 0 || frame >= clip.frames) {
            problems.push(
              `Clip "${clipId}" ${boneId}.${channel} keys frame ${frame}, outside 0..${clip.frames - 1}`,
            );
          }
          if (frame <= prev) {
            problems.push(`Clip "${clipId}" ${boneId}.${channel} keys are not in frame order`);
          }
          prev = frame;
        }
      }
    }
    for (const partId of Object.keys(clip.parts ?? {})) {
      if (!seenParts.has(partId)) {
        problems.push(`Clip "${clipId}" animates unknown part "${partId}"`);
      }
    }
  }

  return problems;
}
