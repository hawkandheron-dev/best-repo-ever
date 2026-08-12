/**
 * Clip evaluation and skeleton posing.
 *
 * SHARED, DELIBERATELY.  The Rig Studio preview, the bake step and the game
 * runtime all pose skeletons through this module.  If any of them grows its own
 * evaluator, studio preview and shipped animation will drift and you will lose
 * days to "but it looked right in the editor".
 *
 * Everything here is a pure function of (rig, clipId, integer frame).  No time,
 * no accumulated state, no randomness — scrubbing a timeline backwards must
 * produce byte-identical poses to scrubbing it forwards.
 */

import { fromChannels, multiply, identity } from './mat2d';
import { boneOrder, BONE_CHANNELS } from './rigSchema';

/* ── Track evaluation ─────────────────────────────────────────────────────── */

/** Interpolate between two keys. A key marked 'step' holds its value until the next. */
function interpolate(a, b, t, clipInterp) {
  if (clipInterp === 'step' || a[2] === 'step') return a[1];
  return a[1] + (b[1] - a[1]) * t;
}

/**
 * Sample one channel track at `frame`.
 *
 * Keys are `[frame, value]` or `[frame, value, 'step']`, sorted, all within
 * `0 .. clipFrames - 1`.  Looping clips wrap: the segment after the last key
 * interpolates around the end of the clip back to the first key, so an idle
 * cycle needs no duplicated closing keyframe.
 */
export function evaluateTrack(keys, frame, clipFrames, loop, clipInterp) {
  const n = keys.length;
  if (n === 0) return null;
  if (n === 1) return keys[0][1];

  // Last key at or before `frame`.
  let i = -1;
  for (let k = 0; k < n; k++) {
    if (keys[k][0] <= frame) i = k;
    else break;
  }

  const wrapSpan = () => keys[0][0] + clipFrames - keys[n - 1][0];

  if (i === -1) {
    // Before the first key.
    if (!loop) return keys[0][1];
    const span = wrapSpan();
    if (span <= 0) return keys[0][1];
    const t = (frame + clipFrames - keys[n - 1][0]) / span;
    return interpolate(keys[n - 1], keys[0], t, clipInterp);
  }

  if (i === n - 1) {
    // At or after the last key.
    if (!loop) return keys[i][1];
    const span = wrapSpan();
    if (span <= 0) return keys[i][1];
    const t = (frame - keys[i][0]) / span;
    return interpolate(keys[i], keys[0], t, clipInterp);
  }

  const a = keys[i];
  const b = keys[i + 1];
  return interpolate(a, b, (frame - a[0]) / (b[0] - a[0]), clipInterp);
}

/** Step-sample a track whose values are not numbers (e.g. part-swap ids). */
function evaluateStepTrack(keys, frame) {
  let value = keys.length > 0 ? keys[0][1] : null;
  for (const [keyFrame, keyValue] of keys) {
    if (keyFrame > frame) break;
    value = keyValue;
  }
  return value;
}

/* ── Clip evaluation ──────────────────────────────────────────────────────── */

/**
 * Resolve a clip at one frame into per-bone channel values and per-part state.
 *
 * Unkeyed channels fall back to the bone's rest values, so a clip only has to
 * mention the bones it actually moves.  Returns plain objects rather than Maps so
 * the studio can shallow-patch a single bone while dragging it, then hand the
 * result straight to `composePose`.
 */
export function evaluateClip(rig, clipId, frame) {
  const clip = rig.clips?.[clipId];
  const bones = {};
  const parts = {};

  for (const bone of rig.bones) {
    bones[bone.id] = {
      rot: bone.rest ?? 0,
      x: bone.pos[0],
      y: bone.pos[1],
      sx: 1,
      sy: 1,
      skx: 0,
    };
  }

  if (!clip) return { bones, parts, missing: true };

  const total = clip.frames;
  const local = clip.loop ? ((frame % total) + total) % total : Math.min(Math.max(frame, 0), total - 1);

  for (const [boneId, tracks] of Object.entries(clip.tracks ?? {})) {
    const target = bones[boneId];
    if (!target) continue; // validateRig reports this; don't crash the renderer over it
    for (const [channel, keys] of Object.entries(tracks)) {
      if (!(channel in BONE_CHANNELS)) continue;
      const value = evaluateTrack(keys, local, total, clip.loop, clip.interp);
      if (value !== null) target[channel] = value;
    }
  }

  for (const [partId, tracks] of Object.entries(clip.parts ?? {})) {
    const state = {};
    if (tracks.swap) state.swap = evaluateStepTrack(tracks.swap, local);
    if (tracks.visible) state.visible = evaluateStepTrack(tracks.visible, local) !== 0;
    if (tracks.z) state.z = evaluateTrack(tracks.z, local, total, clip.loop, 'step');
    parts[partId] = state;
  }

  return { bones, parts, frame: local };
}

/* ── Skeleton posing ──────────────────────────────────────────────────────── */

/**
 * Compose per-bone world transforms from evaluated channel values.
 *
 * Single pass, parents before children — `boneOrder` guarantees that ordering and
 * throws on a cycle.  Returns a Map of boneId → 6-element affine matrix in rig
 * space.
 */
export function composePose(rig, channels) {
  const world = new Map();
  for (const bone of boneOrder(rig)) {
    const ch = channels[bone.id];
    const local = ch
      ? fromChannels(ch.x, ch.y, ch.rot, ch.sx, ch.sy, ch.skx)
      : fromChannels(bone.pos[0], bone.pos[1], bone.rest ?? 0);
    const parent = bone.parent === null ? identity() : world.get(bone.parent);
    world.set(bone.id, multiply(parent, local));
  }
  return world;
}

/**
 * Accumulated rest angle per bone, in degrees.
 *
 * Parts are cut from source art in whatever orientation the artist found them, so
 * a part must appear exactly as cut when the skeleton is in its rest pose.  The
 * renderer counter-rotates each part by its bone's accumulated rest angle to make
 * that true; without this, every limb would appear rotated by its own rest angle.
 *
 * Depends only on the skeleton, so callers should compute it once per rig and
 * cache it, not per frame.
 */
export function restWorldAngles(rig) {
  const angles = new Map();
  for (const bone of boneOrder(rig)) {
    const parent = bone.parent === null ? 0 : angles.get(bone.parent);
    angles.set(bone.id, parent + (bone.rest ?? 0));
  }
  return angles;
}

/**
 * Convenience: evaluate and pose in one call.
 * Prefer the two-step form in the studio, where a bone being dragged needs its
 * channels patched between the two.
 */
export function poseAtFrame(rig, clipId, frame) {
  const evaluated = evaluateClip(rig, clipId, frame);
  return { ...evaluated, world: composePose(rig, evaluated.bones) };
}

/**
 * Parts in draw order for one frame, with their swaps and visibility resolved.
 *
 * Draw order is stable across a facing flip: parts are named `.f` / `.b` for
 * camera-near / camera-far, and in a side view the near limb stays near when the
 * fighter turns around.  Ties break on part id so the order is total and
 * therefore deterministic.
 */
export function drawablePartsAtFrame(rig, evaluated) {
  const byId = new Map(rig.parts.map((p) => [p.id, p]));
  const out = [];

  for (const part of rig.parts) {
    const state = evaluated.parts[part.id];
    if (state?.visible === false) continue;

    // A `swap` redirects this slot to a sibling part sharing the same bone —
    // how a hand becomes a fist without a second bone or a deformer.
    const drawn = state?.swap ? byId.get(state.swap) ?? part : part;
    out.push({ part: drawn, slot: part, z: state?.z ?? part.z ?? 0 });
  }

  out.sort((a, b) => a.z - b.z || (a.slot.id < b.slot.id ? -1 : 1));
  return out;
}
