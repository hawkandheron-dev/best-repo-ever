import { useRef, useState, useCallback, useLayoutEffect, useEffect } from 'react';
import { useHexGame } from '../../experiment/hexGameContext';
import { SELECT_PIECE, SELECT_DESTINATION, EXCAVATE_HEX, SCRY_FROM, CANCEL_ACTION } from '../../experiment/hexGameActions';
import { hexToPixel, parseKey, hexKey, buildHexGrid, gridBounds, isValid } from '../../experiment/hexMath';
import { getP2VisibleHexes, terrainOf } from '../../experiment/HexGameEngine';
import styles from './HexBoard.module.css';

const HEX_SIZE = 28;
const ALL_HEX_KEYS = [...buildHexGrid()];
const ZOOM_STEP = 0.2;

const PIECE_GLYPHS = {
  1: { K: '\u2654', Q: '\u2655', P: '\u2659', R: '\u2656' },
  2: { K: '\u265A', Q: '\u265B', P: '\u265F', R: '\u265C' },
};

// ── Terrain styling ──────────────────────────────────────────────────────────

const TERRAIN_FILL = {
  normal:   '#4c9818',   // bright ALTTP grass green
  mountain: '#8c7040',   // warm mountain brown
};

const TERRAIN_STROKE = {
  normal:   '#386010',   // dark green hex border
  mountain: '#6a5030',   // dark brown hex border
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }

function findKing(board, player) {
  for (const [key, entry] of board) {
    if (entry.player === player && entry.piece === 'K') return parseKey(key);
  }
  return null;
}

/** Inverse of hexToPixel — convert pixel position to nearest axial hex (q, r). */
function pixelToHex(px, py, size) {
  const q = (px * Math.sqrt(3) / 3 - py / 3) / size;
  const r = (py * 2 / 3) / size;
  // Cube coordinate rounding
  const s = -q - r;
  let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return [rq, rr];
}

// ── Canvas drawing helpers ───────────────────────────────────────────────────

function drawHexPath(ctx, x, y, size) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const vx = x + size * Math.cos(angle);
    const vy = y + size * Math.sin(angle);
    if (i === 0) ctx.moveTo(vx, vy);
    else ctx.lineTo(vx, vy);
  }
  ctx.closePath();
}

function drawMountain(ctx, x, y, size) {
  const s = size;
  // Main peak
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.55);
  ctx.lineTo(x - s * 0.45, y + s * 0.28);
  ctx.lineTo(x + s * 0.45, y + s * 0.28);
  ctx.closePath();
  ctx.fillStyle = '#7a5828';
  ctx.fill();
  ctx.strokeStyle = '#6a4820';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Secondary face
  ctx.beginPath();
  ctx.moveTo(x + s * 0.22, y - s * 0.3);
  ctx.lineTo(x - s * 0.08, y + s * 0.28);
  ctx.lineTo(x + s * 0.52, y + s * 0.28);
  ctx.closePath();
  ctx.fillStyle = '#9a7840';
  ctx.fill();

  // Snow cap
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.55);
  ctx.lineTo(x - s * 0.12, y - s * 0.3);
  ctx.lineTo(x + s * 0.12, y - s * 0.3);
  ctx.closePath();
  ctx.fillStyle = '#f0ece0';
  ctx.fill();
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HexBoard({ showAllArtifacts = false }) {
  const { state, dispatch } = useHexGame();
  const {
    board, terrain, excavated, artifacts,
    turn, phase, selectedPiece, legalMoves,
    winner, countdown, handoff, scryResults, gameKey,
    fogLifted, handoffCount,
  } = state;

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [panOffset, setPanOffset] = useState(null);
  const [scale, setScale] = useState(1.0);
  const [hoveredHex, setHoveredHex] = useState(null);

  // Dynamic scale bounds computed once per new game from actual container size
  const minScaleRef = useRef(0.25);
  const maxScaleRef = useRef(1.6);

  // Track previous gameKey to distinguish new-game vs turn-switch in the layout effect
  const prevGameKey = useRef(gameKey);

  // Pointer tracking for pan + pinch-to-zoom
  const dragState = useRef(null);
  const activePointers = useRef(new Map());
  const pinchStartRef = useRef(null);

  // Refs for tap handler (avoid stale closures in pointer callbacks)
  const panOffsetRef = useRef(panOffset);
  const scaleRef = useRef(scale);
  useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);

  // ── Initial centering + scale bounds ───────────────────────────────────────
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const isNewGame = gameKey !== prevGameKey.current;
    prevGameKey.current = gameKey;

    if (isNewGame) {
      const { width: gw, height: gh } = gridBounds(HEX_SIZE);
      const fit = Math.min(width / gw, height / gh) * 0.88;
      minScaleRef.current = Math.max(0.2, fit);
      const hexWidth = HEX_SIZE * Math.sqrt(3);
      maxScaleRef.current = clamp(width / (5 * hexWidth), 1.2, 2.5);

      const s = 1.0;
      setScale(s);
      const p1King = findKing(board, 1);
      if (p1King) {
        const { x: kx, y: ky } = hexToPixel(p1King[0], p1King[1], HEX_SIZE);
        setPanOffset({ x: width / 2 - kx * s, y: height * 0.7 - ky * s });
      } else {
        setPanOffset({ x: width / 2, y: height / 2 });
      }
    } else {
      const s = maxScaleRef.current;
      setScale(s);
      const king = findKing(board, turn);
      if (king) {
        const { x: kx, y: ky } = hexToPixel(king[0], king[1], HEX_SIZE);
        setPanOffset({ x: width / 2 - kx * s, y: height / 2 - ky * s });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey, handoffCount]);

  // ── Canvas render (runs every frame for smooth pan/zoom) ───────────────────
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const el = containerRef.current;
    if (!canvas || !el || !panOffset) return;

    const dpr = window.devicePixelRatio || 1;
    const { width: dw, height: dh } = el.getBoundingClientRect();
    const cw = Math.round(dw * dpr);
    const ch = Math.round(dh * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(scale, scale);

    const fogActive = turn === 2 && !winner && !fogLifted;
    const visibleHexes = fogActive ? getP2VisibleHexes(board) : null;
    const legalSet = new Set(legalMoves);

    function hexFill(key, t, inFog) {
      if (inFog) return '#1c2c40';
      if (key === selectedPiece) return '#b89010';
      if (legalSet.has(key)) return '#186818';
      if (excavated.has(key) && t === 'normal') return artifacts.has(key) ? '#886808' : '#386010';
      if (key === hoveredHex && !inFog) {
        return t === 'mountain' ? '#9c8050' : '#5cac20';
      }
      return TERRAIN_FILL[t] ?? TERRAIN_FILL.normal;
    }
    function hexStroke(key, t) {
      if (key === selectedPiece) return '#f0d020';
      if (legalSet.has(key)) return '#38d028';
      return TERRAIN_STROKE[t] ?? TERRAIN_STROKE.normal;
    }

    // ── Draw all hexes ─────────────────────────────────────────────────────
    for (const key of ALL_HEX_KEYS) {
      const [q, r] = parseKey(key);
      const { x, y } = hexToPixel(q, r, HEX_SIZE);
      const t = terrainOf(key, terrain);
      const inFog = !!(fogActive && visibleHexes && !visibleHexes.has(key));
      const piece = board.get(key);

      // Hex polygon fill + stroke
      drawHexPath(ctx, x, y, HEX_SIZE);
      ctx.fillStyle = hexFill(key, t, inFog);
      ctx.fill();
      ctx.strokeStyle = hexStroke(key, t);
      ctx.lineWidth = key === selectedPiece ? 3 : 1.5;
      ctx.stroke();

      // Mountain decoration (always show so terrain is always readable)
      if (t === 'mountain') {
        drawMountain(ctx, x, y, HEX_SIZE);
      }

      // Excavated empty ×
      if (excavated.has(key) && !artifacts.has(key) && !inFog) {
        ctx.font = '14px "Press Start 2P", monospace';
        ctx.fillStyle = '#8a6820';
        ctx.globalAlpha = 0.9;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u00d7', x, y);
        ctx.globalAlpha = 1;
      }

      // Found artifact (excavated) ★
      if (artifacts.has(key) && excavated.has(key) && !inFog) {
        ctx.font = '12px "Press Start 2P", monospace';
        ctx.fillStyle = '#f0d020';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u2605', x, y);
      }

      // Revealed artifact (fog lifted, not yet excavated)
      if ((fogLifted || showAllArtifacts) && artifacts.has(key) && !excavated.has(key)) {
        ctx.font = '12px "Press Start 2P", monospace';
        ctx.fillStyle = '#f0d020';
        ctx.globalAlpha = 0.45;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u2605', x, y);
        ctx.globalAlpha = 1;
      }

      // Piece glyph (hide P1 pieces in fog)
      if (piece && !(inFog && piece.player === 1)) {
        ctx.font = '30px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = (piece.frozenTurns ?? 0) > 0 ? 0.55 : 1;
        const glyph = PIECE_GLYPHS[piece.player][piece.piece];
        // Black outline for readability
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.2;
        ctx.strokeText(glyph, x, y);
        ctx.fillStyle = piece.player === 1 ? '#3868c8' : '#c83030';
        ctx.fillText(glyph, x, y);
        ctx.globalAlpha = 1;
      }

      // Legal move indicator (circle)
      if (legalSet.has(key) && !piece && !inFog) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#38e040';
        ctx.globalAlpha = 0.75;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // ── Scry result overlays ───────────────────────────────────────────────
    for (const { fromKey, directionAngle, caretCount } of scryResults) {
      const [q, r] = parseKey(fromKey);
      const { x, y } = hexToPixel(q, r, HEX_SIZE);
      const rad = (directionAngle * Math.PI) / 180;
      const offsetDist = HEX_SIZE * 0.55;
      const tx = x + offsetDist * Math.cos(rad);
      const ty = y + offsetDist * Math.sin(rad);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(rad);
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillStyle = '#50c8f0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u203a'.repeat(caretCount), 0, 0);
      ctx.restore();
    }

    ctx.restore();
  });

  // ── Pan — single pointer ──────────────────────────────────────────────────
  const onPointerDown = useCallback((e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 1) {
      dragState.current = {
        startX: e.clientX, startY: e.clientY,
        moved: false,
        startPan: panOffset ?? { x: 0, y: 0 },
      };
      pinchStartRef.current = null;
    } else if (activePointers.current.size === 2) {
      // Second finger down — start pinch
      dragState.current = null;
      const pts = [...activePointers.current.values()];
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      pinchStartRef.current = { dist, scale, midX, midY, pan: panOffset ?? { x: 0, y: 0 } };
    }
  }, [panOffset, scale]);

  const onPointerMove = useCallback((e) => {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 2 && pinchStartRef.current) {
      // Pinch-to-zoom: keep midpoint stationary, scale by distance ratio
      const pts = [...activePointers.current.values()];
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const ratio = dist / pinchStartRef.current.dist;
      const newScale = clamp(pinchStartRef.current.scale * ratio,
                             minScaleRef.current, maxScaleRef.current);
      const { midX, midY, pan } = pinchStartRef.current;
      const el = containerRef.current;
      const rect = el ? el.getBoundingClientRect() : { left: 0, top: 0 };
      const cx = midX - rect.left;
      const cy = midY - rect.top;
      setPanOffset({
        x: cx - (cx - pan.x) * newScale / pinchStartRef.current.scale,
        y: cy - (cy - pan.y) * newScale / pinchStartRef.current.scale,
      });
      setScale(newScale);
      return;
    }

    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    if (!dragState.current.moved && Math.hypot(dx, dy) > 6) dragState.current.moved = true;
    if (dragState.current.moved) {
      setPanOffset({ x: dragState.current.startPan.x + dx, y: dragState.current.startPan.y + dy });
    }
  }, []);

  // ── Hex tap (replaces per-hex SVG onClick) ────────────────────────────────
  const handleTap = useCallback((e) => {
    if (winner || countdown !== null || handoff) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const pan = panOffsetRef.current ?? { x: 0, y: 0 };
    const s = scaleRef.current;
    const mapX = (screenX - pan.x) / s;
    const mapY = (screenY - pan.y) / s;
    const [q, r] = pixelToHex(mapX, mapY, HEX_SIZE);
    if (!isValid(q, r)) return;
    const key = hexKey(q, r);

    if (phase === 'select-piece')   dispatch({ type: SELECT_PIECE, key });
    if (phase === 'select-destination' || phase === 'select-add-hex')
                                     dispatch({ type: SELECT_DESTINATION, key });
    if (phase === 'select-excavate') dispatch({ type: EXCAVATE_HEX, key });
    if (phase === 'select-scry')     dispatch({ type: SCRY_FROM, key });
  }, [winner, countdown, handoff, phase, dispatch]);

  const onPointerUp = useCallback((e) => {
    const ds = dragState.current;
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) pinchStartRef.current = null;
    if (activePointers.current.size === 0) {
      if (ds && !ds.moved) handleTap(e);
      dragState.current = null;
    }
  }, [handleTap]);

  // ── Wheel zoom (desktop) ──────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      setScale(prevScale => {
        const newScale = clamp(prevScale * (e.deltaY < 0 ? 1.12 : 0.89),
                               minScaleRef.current, maxScaleRef.current);
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        setPanOffset(p => p ? {
          x: cx - (cx - p.x) * newScale / prevScale,
          y: cy - (cy - p.y) * newScale / prevScale,
        } : p);
        return newScale;
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // ── Mouse hover (desktop) ────────────────────────────────────────────────
  const onMouseMove = useCallback((e) => {
    // Only track hover when not dragging
    if (dragState.current?.moved) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const pan = panOffsetRef.current ?? { x: 0, y: 0 };
    const s = scaleRef.current;
    const mapX = (screenX - pan.x) / s;
    const mapY = (screenY - pan.y) / s;
    const [q, r] = pixelToHex(mapX, mapY, HEX_SIZE);
    if (isValid(q, r)) {
      setHoveredHex(hexKey(q, r));
    } else {
      setHoveredHex(null);
    }
  }, []);

  const onMouseLeave = useCallback(() => setHoveredHex(null), []);

  // ── Keyboard shortcuts (desktop) ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') dispatch({ type: CANCEL_ACTION });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch]);

  // ── Zoom button helper ────────────────────────────────────────────────────
  const zoomBy = useCallback((delta) => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const cx = width / 2, cy = height / 2;
    setScale(prevScale => {
      const newScale = clamp(prevScale + delta, minScaleRef.current, maxScaleRef.current);
      setPanOffset(p => p ? {
        x: cx - (cx - p.x) * newScale / prevScale,
        y: cy - (cy - p.y) * newScale / prevScale,
      } : p);
      return newScale;
    });
  }, []);

  if (!panOffset) return <div ref={containerRef} className={styles.container} />;

  return (
    <div
      ref={containerRef}
      className={styles.container}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ touchAction: 'none' }}
    >
      <canvas ref={canvasRef} className={styles.canvas} />

      {/* ── Zoom controls ──────────────────────────────────────────────────── */}
      <div className={styles.zoomControls}>
        <button onClick={() => zoomBy(ZOOM_STEP)} title="Zoom in">+</button>
        <button onClick={() => zoomBy(-ZOOM_STEP)} title="Zoom out">{'\u2212'}</button>
      </div>
    </div>
  );
}
