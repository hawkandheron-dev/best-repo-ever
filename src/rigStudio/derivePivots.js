/**
 * Deriving part pivots from where the skeleton sits on the source image.
 *
 * A part's pivot is not a number anyone should type. The pivot *is* the joint: the
 * pixel of the cut piece that sits on the bone's origin. So once the skeleton is
 * lined up with the figure, every pivot follows, and nudging a joint silently
 * re-pivots every part bound to it. That is what makes rigging feel like tracing
 * rather than data entry.
 *
 * Kept out of the React component so it can be tested without a browser.
 */

import { apply } from '../fighter/rig/mat2d';
import { restChannels, composePose } from '../fighter/rig/pose';

/**
 * Convert a point in rig space to source-image pixels.
 *
 * Rig space is +y UP with its origin at the fighter's feet; image space is +y DOWN
 * from the top-left. The vertical term is therefore subtracted, and getting that
 * sign wrong mirrors the whole figure vertically — which looks like a rigging
 * mistake rather than a maths one, so it is worth stating plainly.
 */
export function rigToSourcePx(anchor, worldX, worldY) {
  return [
    anchor.footX + worldX * anchor.pxPerUnit,
    anchor.footY - worldY * anchor.pxPerUnit,
  ];
}

/** Where a bone's origin falls in source-image pixels. */
export function boneOriginInSourcePx(world, boneId, anchor) {
  const m = world.get(boneId);
  if (!m) return null;
  const [wx, wy] = apply(m, 0, 0);
  return rigToSourcePx(anchor, wx, wy);
}

/**
 * Build the `parts` array for a rig from the cut pieces.
 *
 * @param rig      a rig whose bones are positioned (parts are ignored)
 * @param targets  the conventional part list — id, bone, z
 * @param cut      Map or object of partId → true/canvas for pieces that exist
 * @param offsets  partId → [x, y], where in the source the piece was cut from
 * @param anchor   { footX, footY, pxPerUnit }
 */
export function buildParts(rig, targets, cut, offsets, anchor) {
  const world = composePose(rig, restChannels(rig).bones);
  const has = (id) => (cut instanceof Map ? cut.has(id) : Boolean(cut?.[id]));

  const parts = [];
  for (const target of targets) {
    if (!has(target.id)) continue;
    const offset = offsets[target.id] ?? [0, 0];
    const origin = boneOriginInSourcePx(world, target.bone, anchor);
    const pivot = origin ? [origin[0] - offset[0], origin[1] - offset[1]] : [0, 0];
    parts.push({
      id: target.id,
      bone: target.bone,
      src: null,
      pivot,
      z: target.z,
      mesh: null,
    });
  }
  return parts;
}

/**
 * Parts whose joint falls outside the piece that was cut.
 *
 * A pivot outside its own image means the skeleton and the figure are not lined up,
 * and the limb will rotate about a point in mid-air. Invisible in the rest pose and
 * glaring the moment anything swings, so it is worth naming the offenders rather
 * than leaving it to be discovered in the preview.
 *
 * @param sizes partId → { width, height }
 */
export function findMisalignedParts(parts, sizes, slack = 8) {
  const out = [];
  for (const part of parts) {
    const size = sizes instanceof Map ? sizes.get(part.id) : sizes?.[part.id];
    if (!size) continue;
    const [px, py] = part.pivot;
    if (px < -slack || py < -slack || px > size.width + slack || py > size.height + slack) {
      out.push(part.id);
    }
  }
  return out;
}

/**
 * A starting anchor for a freshly loaded image.
 *
 * Assumes the figure roughly fills the frame and stands near its bottom edge, which
 * is true of a cropped detail and wrong for a wide shot — hence the sliders. Note
 * `NOMINAL_HEIGHT` is the top of the head *art*, above the head bone's origin, so
 * this deliberately runs a little small rather than overshooting.
 */
export function initialAnchor(width, height, nominalHeight) {
  return {
    footX: width / 2,
    footY: height * 0.96,
    pxPerUnit: (height * 0.86) / nominalHeight,
    viewX: 0,
    viewY: 0,
    viewScale: 1,
  };
}
