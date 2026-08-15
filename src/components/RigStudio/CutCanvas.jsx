import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { usePanZoom } from '../../hooks/usePanZoom';
import styles from './RigStudio.module.css';

/**
 * The cutting surface: the source painting, with a polygon being traced over it.
 *
 * Tap to drop a vertex, drag to pan, pinch or wheel to zoom.  The tap-versus-drag
 * threshold in `usePanZoom` is what makes both work on the same pointer without a
 * modal tool switch.
 */
export function CutCanvas({
  sourceCanvas,
  polygon,
  committed,
  activePartId,
  onAddPoint,
  onFitReady,
}) {
  const canvasRef = useRef(null);
  const stateRef = useRef({});
  stateRef.current = { polygon, committed, activePartId };

  const handleTap = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      if (!canvas || !onAddPoint) return;
      const p = panZoom.toContent(canvas, e.clientX, e.clientY);
      onAddPoint(p);
    },
    // panZoom is created below; referencing it here is safe because the callback
    // only ever runs after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onAddPoint],
  );

  const panZoom = usePanZoom({ onTap: handleTap });

  // Fit the source into view the first time one arrives.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceCanvas) return;
    panZoom.fit(canvas, sourceCanvas.width, sourceCanvas.height);
    onFitReady?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceCanvas]);

  useEffect(() => panZoom.attachWheel(canvasRef.current), [panZoom]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#14121c';
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (!sourceCanvas) {
      ctx.fillStyle = '#5a5266';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Load a source image on the Source tab', rect.width / 2, rect.height / 2);
      return;
    }

    const { x, y, scale } = panZoom.view;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.restore();

    const toS = (p) => ({ x: p.x * scale + x, y: p.y * scale + y });

    // Already-cut parts, so you can see what is claimed and avoid double-cutting.
    ctx.lineWidth = 1;
    for (const [partId, poly] of Object.entries(committed ?? {})) {
      if (!poly?.length || partId === activePartId) continue;
      ctx.beginPath();
      const first = toS(poly[0]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < poly.length; i++) {
        const p = toS(poly[i]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(64, 224, 255, 0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(64, 224, 255, 0.45)';
      ctx.stroke();
    }

    // The polygon under construction.
    if (polygon?.length) {
      ctx.beginPath();
      const first = toS(polygon[0]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < polygon.length; i++) {
        const p = toS(polygon[i]);
        ctx.lineTo(p.x, p.y);
      }
      if (polygon.length > 2) {
        ctx.fillStyle = 'rgba(240, 192, 64, 0.18)';
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = '#f0c040';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      polygon.forEach((point, i) => {
        const p = toS(point);
        ctx.beginPath();
        ctx.arc(p.x, p.y, i === 0 ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#ff8040' : '#f0c040';
        ctx.fill();
        ctx.strokeStyle = '#14121c';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }
  }, [sourceCanvas, polygon, committed, activePartId, panZoom.view]);

  return <canvas ref={canvasRef} className={styles.canvas} {...panZoom.handlers} />;
}
