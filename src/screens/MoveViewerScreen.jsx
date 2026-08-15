import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildPlaceholderRig } from '../fighter/rig/placeholderRig';
import { STANDARD_CLIPS, CLIP_GROUPS } from '../fighter/rig/standardClips';
import { evaluateClip, composePose } from '../fighter/rig/pose';
import {
  drawPose,
  drawSkeleton,
  drawJointGuides,
  drawGroundGuides,
} from '../fighter/render/rigRenderer';
import styles from './MoveViewerScreen.module.css';

const FRAME_MS = 1000 / 60;
/** Never advance more than this many sim frames per tick, so a stall can't spiral. */
const MAX_STEPS_PER_TICK = 5;
const SPEEDS = [
  { label: '1×', value: 1 },
  { label: '½×', value: 0.5 },
  { label: '¼×', value: 0.25 },
];

export function MoveViewerScreen({ onBack }) {
  const canvasRef = useRef(null);
  const frameLabelRef = useRef(null);
  const scrubRef = useRef(null);

  const [clipId, setClipId] = useState('idle');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [facing, setFacing] = useState(1);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [showJoints, setShowJoints] = useState(false);
  const [showArt, setShowArt] = useState(true);

  // The rig is built once from primitives; rebuilding it every render would throw
  // away the canvases the renderer draws from.
  const { rig, images } = useMemo(() => buildPlaceholderRig('placeholder'), []);
  const clip = STANDARD_CLIPS[clipId];
  const frameCount = clip?.frames ?? 1;

  // Playback position lives in a ref, not state: at 60fps a state update per frame
  // would re-render the whole screen sixty times a second for one integer.
  const frameRef = useRef(0);
  const accRef = useRef(0);
  const lastRef = useRef(0);

  // Mirror the controls into a ref so the draw loop can read them without being
  // torn down and re-subscribed on every toggle. Synced in an effect rather than
  // during render — a one-frame lag on a checkbox is imperceptible.
  const view = useRef({ clipId, playing, speed, facing, showSkeleton, showJoints, showArt, frameCount });
  useEffect(() => {
    view.current = { clipId, playing, speed, facing, showSkeleton, showJoints, showArt, frameCount };
  }, [clipId, playing, speed, facing, showSkeleton, showJoints, showArt, frameCount]);

  const setFrame = useCallback((next) => {
    const total = view.current.frameCount;
    frameRef.current = ((next % total) + total) % total;
  }, []);

  // Restart whenever the clip changes, so a one-shot doesn't open mid-swing.
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

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      return dpr;
    };

    const tick = (now) => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);

      const v = view.current;
      const current = STANDARD_CLIPS[v.clipId];
      if (!current) return;

      // Fixed timestep, decoupled from the display: the same accumulator the match
      // loop uses, so playback here matches playback in game on any refresh rate.
      if (v.playing) {
        const elapsed = Math.min(now - lastRef.current, 100);
        accRef.current += elapsed * v.speed;
        let steps = 0;
        while (accRef.current >= FRAME_MS && steps < MAX_STEPS_PER_TICK) {
          accRef.current -= FRAME_MS;
          steps++;
          const next = frameRef.current + 1;
          frameRef.current = current.loop
            ? next % current.frames
            : Math.min(next, current.frames - 1);
        }
      }
      lastRef.current = now;

      const dpr = resize();
      const cssW = canvas.width / dpr;
      const cssH = canvas.height / dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // Fit the nominal figure height into the viewport with headroom for the
      // uppercut, which travels well above standing height.
      const scale = (cssH * 0.62) / rig.space.height;
      const placement = {
        x: cssW * 0.42 * dpr,
        y: cssH * 0.86 * dpr,
        facing: v.facing,
        scale: scale * dpr,
      };

      const frame = frameRef.current;
      const evaluated = evaluateClip(rig, v.clipId, frame);
      const world = composePose(rig, evaluated.bones);

      drawGroundGuides(ctx, placement, canvas.width);
      if (v.showArt) drawPose(ctx, rig, images, evaluated, world, placement);
      if (v.showJoints) drawJointGuides(ctx, rig, world, placement);
      if (v.showSkeleton) drawSkeleton(ctx, rig, world, placement);

      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // Write playback position straight to the DOM rather than through React.
      if (frameLabelRef.current) {
        frameLabelRef.current.textContent = `${String(frame).padStart(2, '0')} / ${String(current.frames - 1).padStart(2, '0')}`;
      }
      if (scrubRef.current && document.activeElement !== scrubRef.current) {
        scrubRef.current.value = String(frame);
      }
    };

    lastRef.current = performance.now();
    raf = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
    };
  }, [rig, images]);

  const step = useCallback(
    (delta) => {
      setPlaying(false);
      setFrame(frameRef.current + delta);
    },
    [setFrame],
  );

  // Keyboard transport, so a pose can be checked frame by frame without the mouse.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'm' || e.key === 'M') {
        setFacing((f) => -f);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>
          &larr; Menu
        </button>
        <h1 className={styles.title}>Move Viewer</h1>
        <span className={styles.sourceNote}>{rig.name}</span>
      </div>

      <div className={styles.body}>
        <nav className={styles.clipList}>
          {CLIP_GROUPS.map((group) => (
            <div key={group.label} className={styles.group}>
              <span className={styles.groupLabel}>{group.label}</span>
              {group.clips.map((id) => (
                <button
                  key={id}
                  className={`${styles.clipBtn} ${id === clipId ? styles.clipActive : ''}`}
                  onClick={() => setClipId(id)}
                >
                  <span className={styles.clipName}>{id}</span>
                  <span className={styles.clipFrames}>{STANDARD_CLIPS[id].frames}f</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className={styles.stage}>
          <canvas ref={canvasRef} className={styles.canvas} />

          <div className={styles.transport}>
            <button className={styles.ctrl} onClick={() => step(-1)} title="Previous frame (←)">
              ◀|
            </button>
            <button
              className={`${styles.ctrl} ${styles.play}`}
              onClick={() => setPlaying((p) => !p)}
              title="Play / pause (space)"
            >
              {playing ? '❙❙' : '▶'}
            </button>
            <button className={styles.ctrl} onClick={() => step(1)} title="Next frame (→)">
              |▶
            </button>

            <span ref={frameLabelRef} className={styles.frameLabel}>
              00 / 00
            </span>

            <input
              ref={scrubRef}
              className={styles.scrub}
              type="range"
              min={0}
              max={frameCount - 1}
              defaultValue={0}
              onChange={(e) => {
                setPlaying(false);
                setFrame(Number(e.target.value));
              }}
            />
          </div>

          <div className={styles.options}>
            {SPEEDS.map((s) => (
              <button
                key={s.label}
                className={`${styles.opt} ${speed === s.value ? styles.optActive : ''}`}
                onClick={() => setSpeed(s.value)}
              >
                {s.label}
              </button>
            ))}
            <span className={styles.divider} />
            <button className={styles.opt} onClick={() => setFacing((f) => -f)} title="Mirror (M)">
              Mirror
            </button>
            <span className={styles.divider} />
            <button
              className={`${styles.opt} ${showArt ? styles.optActive : ''}`}
              onClick={() => setShowArt((v) => !v)}
            >
              Art
            </button>
            <button
              className={`${styles.opt} ${showSkeleton ? styles.optActive : ''}`}
              onClick={() => setShowSkeleton((v) => !v)}
            >
              Bones
            </button>
            <button
              className={`${styles.opt} ${showJoints ? styles.optActive : ''}`}
              onClick={() => setShowJoints((v) => !v)}
              title="Cut each part to cover these circles, or joints will gap when they rotate"
            >
              Joints
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
