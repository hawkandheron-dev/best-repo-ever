import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { evaluateClip, composePose } from '../../fighter/rig/pose';
import { drawPose, drawSkeleton } from '../../fighter/render/rigRenderer';
import { STANDARD_CLIPS, CLIP_GROUPS } from '../../fighter/rig/standardClips';
import styles from './RigStudio.module.css';

const FRAME_MS = 1000 / 60;
const MAX_STEPS_PER_TICK = 5;

/**
 * Watch the rig you have just cut perform the standard moveset.
 *
 * This is the studio's real verification step: a pivot that is a few pixels out is
 * invisible in the rest pose and glaring the moment an arm swings. Half speed and
 * the bone overlay exist for exactly that.
 */
export function RigPreview({ rig, images }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);
  const accRef = useRef(0);
  const lastRef = useRef(0);
  const labelRef = useRef(null);

  const [clipId, setClipId] = useState('idle');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showBones, setShowBones] = useState(false);

  const view = useRef({ clipId, playing, speed, showBones });
  useEffect(() => {
    view.current = { clipId, playing, speed, showBones };
  }, [clipId, playing, speed, showBones]);

  useEffect(() => {
    frameRef.current = 0;
    accRef.current = 0;
  }, [clipId]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let disposed = false;

    const tick = (now) => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);

      const v = view.current;
      const clip = STANDARD_CLIPS[v.clipId];
      if (!clip) return;

      if (v.playing) {
        accRef.current += Math.min(now - lastRef.current, 100) * v.speed;
        let steps = 0;
        while (accRef.current >= FRAME_MS && steps < MAX_STEPS_PER_TICK) {
          accRef.current -= FRAME_MS;
          steps++;
          const next = frameRef.current + 1;
          frameRef.current = clip.loop ? next % clip.frames : Math.min(next, clip.frames - 1);
        }
      }
      lastRef.current = now;

      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#1c1828';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const scale = (rect.height * 0.6) / rig.space.height;
      const placement = {
        x: rect.width * 0.45 * dpr,
        y: rect.height * 0.88 * dpr,
        facing: 1,
        scale: scale * dpr,
      };

      const evaluated = evaluateClip(rig, v.clipId, frameRef.current);
      const world = composePose(rig, evaluated.bones);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(0, placement.y);
      ctx.lineTo(canvas.width, placement.y);
      ctx.stroke();

      if (images.size > 0) drawPose(ctx, rig, images, evaluated, world, placement);
      if (v.showBones) drawSkeleton(ctx, rig, world, placement);

      if (labelRef.current) {
        labelRef.current.textContent = `${frameRef.current} / ${clip.frames - 1}`;
      }
    };

    lastRef.current = performance.now();
    raf = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
    };
  }, [rig, images]);

  return (
    <div className={styles.previewWrap}>
      <select className={styles.select} value={clipId} onChange={(e) => setClipId(e.target.value)}>
        {CLIP_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.clips.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </optgroup>
        ))}
      </select>

      <canvas ref={canvasRef} className={styles.previewCanvas} />

      <div className={styles.toolbar}>
        <button className={styles.secondary} onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          className={styles.secondary}
          onClick={() => {
            setPlaying(false);
            const clip = STANDARD_CLIPS[clipId];
            frameRef.current = (frameRef.current + 1) % clip.frames;
          }}
        >
          Step
        </button>
        {[1, 0.5, 0.25].map((s) => (
          <button
            key={s}
            className={`${styles.secondary} ${speed === s ? styles.partActive : ''}`}
            onClick={() => setSpeed(s)}
          >
            {s === 1 ? '1×' : s === 0.5 ? '½×' : '¼×'}
          </button>
        ))}
        <button
          className={`${styles.secondary} ${showBones ? styles.partActive : ''}`}
          onClick={() => setShowBones((v) => !v)}
        >
          Bones
        </button>
        <span ref={labelRef} className={styles.frameLabel}>0 / 0</span>
      </div>

      {images.size === 0 && (
        <p className={styles.hint}>Nothing cut yet — the skeleton will move, but there is no art on it.</p>
      )}
    </div>
  );
}
