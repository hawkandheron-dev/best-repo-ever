/**
 * Draws a posed rig to a 2-D canvas context.
 *
 * Used by the Rig Studio preview, the Move Viewer, the bake step and the game —
 * all of them pose through `src/fighter/rig/pose.js` and draw through here, so
 * what you see in the editor is what ships.
 *
 * The transform stack per part, right to left:
 *
 *   rigToScreen · boneWorld · rotate(-restAngle) · flipY · translate(-pivot)
 *
 * `translate(-pivot)` puts the part's pivot pixel at the origin; `flipY` converts
 * image space (+y down) into rig space (+y up); `rotate(-restAngle)` cancels the
 * bone's accumulated rest rotation so a part appears exactly as it was cut when
 * the skeleton is at rest; `boneWorld` carries it wherever the pose has moved;
 * and `rigToScreen` handles the facing flip, the Y flip and the scale.
 */

import { multiply, fromChannels, rigToScreen, apply } from '../rig/mat2d';
import { restWorldAngles, drawablePartsAtFrame } from '../rig/pose';

/** Cache the per-rig rest angles; they depend only on the skeleton. */
const restAngleCache = new WeakMap();

function anglesFor(rig) {
  let angles = restAngleCache.get(rig);
  if (!angles) {
    angles = restWorldAngles(rig);
    restAngleCache.set(rig, angles);
  }
  return angles;
}

/** Image-space (+y down) → bone-local (+y up). */
const FLIP_Y = [1, 0, 0, -1, 0, 0];

/**
 * Resolve a part to a drawable source rectangle.
 *
 * Handles both authoring shapes: loose per-part images (what the studio produces
 * while you iterate) and a packed atlas region (what ships). Returns null when the
 * image has not loaded yet, which callers should treat as "skip this part".
 */
export function resolvePartImage(part, images) {
  const entry = images.get(part.id);
  if (!entry) return null;
  const image = entry.image ?? entry;
  if (!image) return null;

  if (part.region) {
    const [sx, sy, sw, sh] = part.region;
    return { image, sx, sy, sw, sh };
  }
  const sw = image.width ?? entry.width;
  const sh = image.height ?? entry.height;
  if (!sw || !sh) return null;
  return { image, sx: 0, sy: 0, sw, sh };
}

/**
 * Draw one posed frame.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} rig
 * @param {Map<string, object>} images   partId → ImageBitmap / HTMLImageElement / {image}
 * @param {object} evaluated             from `evaluateClip`
 * @param {Map<string, number[]>} world  from `composePose`
 * @param {object} placement             { x, y, facing, scale } — feet position on screen
 */
export function drawPose(ctx, rig, images, evaluated, world, placement) {
  const { x, y, facing = 1, scale = 1 } = placement;
  const toScreen = rigToScreen(x, y, facing, scale);
  const angles = anglesFor(rig);

  for (const { part } of drawablePartsAtFrame(rig, evaluated)) {
    const boneWorld = world.get(part.bone);
    if (!boneWorld) continue;

    const src = resolvePartImage(part, images);
    if (!src) continue;

    const [pivotX, pivotY] = part.pivot ?? [0, 0];
    const unrest = fromChannels(0, 0, -(angles.get(part.bone) ?? 0));

    let m = multiply(toScreen, boneWorld);
    m = multiply(m, unrest);
    m = multiply(m, FLIP_Y);
    m = multiply(m, [1, 0, 0, 1, -pivotX, -pivotY]);

    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.drawImage(src.image, src.sx, src.sy, src.sw, src.sh, 0, 0, src.sw, src.sh);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/* ── Debug overlays ───────────────────────────────────────────────────────── */

const JOINT_RADIUS = 3;

/**
 * Draw the skeleton over the art: a line from each bone to its parent, a dot at
 * every joint, and a tick showing each bone's local +x so you can see which way a
 * limb "points" when setting rest angles.
 */
export function drawSkeleton(ctx, rig, world, placement, options = {}) {
  const { x, y, facing = 1, scale = 1 } = placement;
  const { selected = null, boneColor = '#40e0ff', selectedColor = '#ffd040' } = options;
  const toScreen = rigToScreen(x, y, facing, scale);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineWidth = 1.5;

  const screenOf = (boneId) => {
    const m = world.get(boneId);
    if (!m) return null;
    const [wx, wy] = apply(m, 0, 0);
    return apply(toScreen, wx, wy);
  };

  for (const bone of rig.bones) {
    const here = screenOf(bone.id);
    if (!here) continue;
    const isSelected = bone.id === selected;
    ctx.strokeStyle = isSelected ? selectedColor : boneColor;
    ctx.fillStyle = ctx.strokeStyle;

    if (bone.parent) {
      const there = screenOf(bone.parent);
      if (there) {
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(there[0], there[1]);
        ctx.lineTo(here[0], here[1]);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Local +x tick — shows the direction the bone considers "along itself".
    const m = world.get(bone.id);
    const [ax, ay] = apply(m, 14, 0);
    const tip = apply(toScreen, ax, ay);
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(here[0], here[1]);
    ctx.lineTo(tip[0], tip[1]);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.arc(here[0], here[1], isSelected ? JOINT_RADIUS + 2 : JOINT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Draw the joint-overlap guides.
 *
 * Rigid cut-out parts must extend past their joint or rotation opens a visible gap
 * at the elbow. These circles are the authoring guide that prevents the single most
 * common cut-out artifact — cut each part so it covers the circle at both ends.
 */
export function drawJointGuides(ctx, rig, world, placement, radius = 12) {
  const { x, y, facing = 1, scale = 1 } = placement;
  const toScreen = rigToScreen(x, y, facing, scale);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = 'rgba(255, 96, 96, 0.75)';
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;

  for (const bone of rig.bones) {
    if (bone.id.startsWith('fx.') || bone.id === 'prop') continue;
    const m = world.get(bone.id);
    if (!m) continue;
    const [wx, wy] = apply(m, 0, 0);
    const [sx, sy] = apply(toScreen, wx, wy);
    ctx.beginPath();
    ctx.arc(sx, sy, radius * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.setLineDash([]);
}

/** Ground line and the character's centre axis, for eyeballing footing. */
export function drawGroundGuides(ctx, placement, width) {
  const { x, y } = placement;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.setLineDash([]);
}
