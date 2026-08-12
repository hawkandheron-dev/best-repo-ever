import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Pan, pinch-zoom and wheel-zoom for a canvas, plus screen↔content coordinate
 * conversion.
 *
 * Extracted from the multi-touch handling in `HexBoard.jsx` so the Rig Studio can
 * reuse it.  `HexBoard` itself is deliberately left alone for now — it works, and
 * migrating it is cleanup for later rather than something to risk mid-feature.
 *
 * The caller owns the canvas and the drawing; this hook only tracks the viewport
 * and tells you where a pointer landed in content space.
 */
export function usePanZoom({ minScale = 0.05, maxScale = 12, onTap } = {}) {
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  // Pointer handlers need the current viewport without being rebuilt on every pan
  // frame, so it is mirrored into a ref — synced in an effect rather than during
  // render, which React rightly complains about.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // pointerId → last screen position. A Map, not a count: two fingers need to be
  // told apart to compute a pinch.
  const activePointers = useRef(new Map());
  const pinchStart = useRef(null);
  const dragState = useRef(null);

  /** Screen (client) coordinates → content coordinates. */
  const toContent = useCallback((canvas, clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (clientX - rect.left - v.x) / v.scale,
      y: (clientY - rect.top - v.y) / v.scale,
    };
  }, []);

  /** Content coordinates → canvas-local screen coordinates. */
  const toScreen = useCallback((x, y) => {
    const v = viewRef.current;
    return { x: x * v.scale + v.x, y: y * v.scale + v.y };
  }, []);

  /** Fit a content-sized box into the canvas with a margin. */
  const fit = useCallback((canvas, contentW, contentH, margin = 0.9) => {
    const rect = canvas.getBoundingClientRect();
    if (!contentW || !contentH || !rect.width) return;
    const scale = Math.min(rect.width / contentW, rect.height / contentH) * margin;
    setView({
      scale,
      x: (rect.width - contentW * scale) / 2,
      y: (rect.height - contentH * scale) / 2,
    });
  }, []);

  const zoomAt = useCallback(
    (screenX, screenY, factor) => {
      setView((v) => {
        const scale = Math.min(maxScale, Math.max(minScale, v.scale * factor));
        const k = scale / v.scale;
        return { scale, x: screenX - (screenX - v.x) * k, y: screenY - (screenY - v.y) * k };
      });
    },
    [minScale, maxScale],
  );

  const onPointerDown = useCallback((e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 2) {
      const [a, b] = [...activePointers.current.values()];
      pinchStart.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale: viewRef.current.scale,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
      };
      dragState.current = null;
    } else if (activePointers.current.size === 1) {
      // Treated as a tap until it moves past the threshold, so a click on a joint
      // isn't swallowed by a one-pixel drag.
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: false,
      };
    }
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!activePointers.current.has(e.pointerId)) return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...activePointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart.current.dist > 0) {
        const start = pinchStart.current;
        setView((v) => {
          const scale = Math.min(maxScale, Math.max(minScale, start.scale * (dist / start.dist)));
          const k = scale / v.scale;
          return { scale, x: start.midX - (start.midX - v.x) * k, y: start.midY - (start.midY - v.y) * k };
        });
      }
      return;
    }

    const drag = dragState.current;
    if (!drag) return;
    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 6) {
      drag.moved = true;
    }
    if (drag.moved) {
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  }, [minScale, maxScale]);

  const onPointerUp = useCallback(
    (e) => {
      const drag = dragState.current;
      activePointers.current.delete(e.pointerId);
      if (activePointers.current.size < 2) pinchStart.current = null;
      if (activePointers.current.size === 0) dragState.current = null;

      if (drag && !drag.moved && onTap) onTap(e);
    },
    [onTap],
  );

  /** Attach with a non-passive listener; React's onWheel cannot preventDefault. */
  const attachWheel = useCallback(
    (canvas) => {
      if (!canvas) return undefined;
      const handler = (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
      };
      canvas.addEventListener('wheel', handler, { passive: false });
      return () => canvas.removeEventListener('wheel', handler);
    },
    [zoomAt],
  );

  return {
    view,
    setView,
    toContent,
    toScreen,
    fit,
    zoomAt,
    attachWheel,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      style: { touchAction: 'none' },
    },
  };
}
