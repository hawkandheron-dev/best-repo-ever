import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { restChannels, composePose } from '../../fighter/rig/pose';
import { apply, invert, rigToScreen } from '../../fighter/rig/mat2d';
import { drawPose } from '../../fighter/render/rigRenderer';
import { boneMap } from '../../fighter/rig/rigSchema';
import { FAR_JOINT } from '../../rigStudio/partTargets';
import styles from './RigStudio.module.css';

const HIT_RADIUS = 14;

/**
 * The rigging surface: the source painting underneath, the cut parts on top, and
 * draggable joints to line the skeleton up with the figure.
 *
 * Joint positions are stored in rig units, so dragging one converts the drop point
 * out of screen space, then out of the parent bone's space — `bone.pos` is by
 * definition the bone's origin expressed in its parent's frame, which is exactly
 * `invert(parentWorld) · dropPoint`.
 */
export function RigCanvas({
  rig,
  images,
  sourceCanvas,
  anchor,
  selectedBone,
  onSelectBone,
  onMoveBone,
  onPanView,
  onFitView,
  showSource = true,
  showParts = true,
  showJointGuides = true,
}) {
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const stateRef = useRef({});

  // The placement that maps rig space onto the source image, given the anchor the
  // user set by marking the figure's feet and height.
  const placement = useMemo(
    () => ({
      x: anchor.footX * anchor.viewScale + anchor.viewX,
      y: anchor.footY * anchor.viewScale + anchor.viewY,
      facing: 1,
      scale: anchor.pxPerUnit * anchor.viewScale,
    }),
    [anchor],
  );

  // Mirrored for the pointer handlers, synced in an effect so the ref is never
  // written during render.
  useEffect(() => {
    stateRef.current = { rig, placement, selectedBone };
  }, [rig, placement, selectedBone]);

  const worldOf = useCallback(() => {
    return composePose(rig, restChannels(rig).bones);
  }, [rig]);

  const screenForBone = useCallback((world, boneId, place) => {
    const m = world.get(boneId);
    if (!m) return null;
    const [wx, wy] = apply(m, 0, 0);
    const toScreen = rigToScreen(place.x, place.y, place.facing, place.scale);
    const [sx, sy] = apply(toScreen, wx, wy);
    return { x: sx, y: sy };
  }, []);

  const pickBone = useCallback(
    (clientX, clientY) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const world = worldOf();
      const { placement: place } = stateRef.current;

      let best = null;
      let bestDist = HIT_RADIUS;
      for (const bone of rig.bones) {
        const s = screenForBone(world, bone.id, place);
        if (!s) continue;
        const d = Math.hypot(s.x - px, s.y - py);
        if (d < bestDist) {
          bestDist = d;
          best = bone.id;
        }
      }
      return best;
    },
    [rig, worldOf, screenForBone],
  );

  const onPointerDown = useCallback(
    (e) => {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      const hit = pickBone(e.clientX, e.clientY);
      if (hit) {
        dragRef.current = { boneId: hit, pointerId: e.pointerId };
        onSelectBone?.(hit);
      } else {
        // Missing a joint pans the view instead. Without this the tool is unusable
        // the moment the figure is bigger than the viewport.
        dragRef.current = { pan: true, pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
      }
    },
    [pickBone, onSelectBone],
  );

  const onPointerMove = useCallback(
    (e) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const { placement: place } = stateRef.current;

      if (drag.pan) {
        onPanView?.(e.clientX - drag.lastX, e.clientY - drag.lastY);
        drag.lastX = e.clientX;
        drag.lastY = e.clientY;
        return;
      }

      // Screen → rig space.
      const toScreen = rigToScreen(place.x, place.y, place.facing, place.scale);
      const inv = invert(toScreen);
      if (!inv) return;
      const [rx, ry] = apply(inv, e.clientX - rect.left, e.clientY - rect.top);

      // Rig space → the bone's parent's space, which is what `bone.pos` stores.
      const bone = boneMap(rig).get(drag.boneId);
      if (!bone) return;
      if (bone.parent === null) {
        onMoveBone?.(drag.boneId, [rx, ry]);
        return;
      }
      const world = worldOf();
      const parentInv = invert(world.get(bone.parent));
      if (!parentInv) return;
      const [lx, ly] = apply(parentInv, rx, ry);
      onMoveBone?.(drag.boneId, [Math.round(lx * 10) / 10, Math.round(ly * 10) / 10]);
    },
    [rig, worldOf, onMoveBone, onPanView],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#14121c';
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (showSource && sourceCanvas) {
      ctx.save();
      ctx.globalAlpha = showParts ? 0.28 : 0.75;
      ctx.translate(anchor.viewX, anchor.viewY);
      ctx.scale(anchor.viewScale, anchor.viewScale);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(sourceCanvas, 0, 0);
      ctx.restore();
    }

    const world = worldOf();

    if (showParts && images.size > 0) {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const scaled = { ...placement, x: placement.x * dpr, y: placement.y * dpr, scale: placement.scale * dpr };
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawPose(ctx, rig, images, restChannels(rig), world, scaled);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Bones.
    ctx.lineWidth = 1.5;
    for (const bone of rig.bones) {
      const here = screenForBone(world, bone.id, placement);
      if (!here) continue;
      const isSelected = bone.id === selectedBone;

      if (bone.parent) {
        const there = screenForBone(world, bone.parent, placement);
        if (there) {
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = '#40e0ff';
          ctx.beginPath();
          ctx.moveTo(there.x, there.y);
          ctx.lineTo(here.x, here.y);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // Cut-coverage guide: a rigid part has to cover BOTH of its joints or it
      // opens a gap the moment either one bends.
      if (showJointGuides && FAR_JOINT[bone.id]) {
        ctx.strokeStyle = 'rgba(255, 96, 96, 0.5)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(here.x, here.y, 11 * placement.scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.arc(here.x, here.y, isSelected ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#ffd040' : '#40e0ff';
      ctx.fill();
      ctx.strokeStyle = '#14121c';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Ground line, so the feet can be checked against it.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, placement.y);
    ctx.lineTo(rect.width, placement.y);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // Fit the source into the viewport when one arrives. Landing zoomed in on the
  // top-left corner of a painting with no way out is not a usable starting point.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceCanvas || !onFitView) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = Math.min(rect.width / sourceCanvas.width, rect.height / sourceCanvas.height) * 0.92;
    onFitView({
      viewScale: scale,
      viewX: (rect.width - sourceCanvas.width * scale) / 2,
      viewY: (rect.height - sourceCanvas.height * scale) / 2,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onWheel = (e) => e.preventDefault();
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      style={{ touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  );
}
