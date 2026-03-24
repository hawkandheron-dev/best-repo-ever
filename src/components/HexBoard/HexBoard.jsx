import { useRef, useState, useCallback, useLayoutEffect, useEffect } from 'react';
import { useHexGame } from '../../experiment/hexGameContext';
import { SELECT_PIECE, SELECT_DESTINATION, EXCAVATE_HEX, SCRY_FROM } from '../../experiment/hexGameActions';
import { hexToPixel, hexPolygonPoints, parseKey, buildHexGrid, gridBounds } from '../../experiment/hexMath';
import { getP2VisibleHexes, terrainOf } from '../../experiment/HexGameEngine';
import styles from './HexBoard.module.css';

const HEX_SIZE = 28;
const ALL_HEX_KEYS = [...buildHexGrid()];
const ZOOM_STEP = 0.2;

const PIECE_GLYPHS = {
  1: { K: '♔', Q: '♕', P: '♙', R: '♖' },
  2: { K: '♚', Q: '♛', P: '♟', R: '♜' },
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

// SVG decoration rendered inside each terrain hex
function TerrainDecoration({ x, y, terrain }) {
  const s = HEX_SIZE;
  if (terrain === 'mountain') {
    // Two overlapping triangles — mountain silhouette
    const pts1 = `${x},${y - s * 0.55} ${x - s * 0.45},${y + s * 0.28} ${x + s * 0.45},${y + s * 0.28}`;
    const pts2 = `${x + s * 0.22},${y - s * 0.3} ${x - s * 0.08},${y + s * 0.28} ${x + s * 0.52},${y + s * 0.28}`;
    return (
      <>
        <polygon points={pts1} fill="#7a5828" stroke="#6a4820" strokeWidth={0.5} pointerEvents="none" />
        <polygon points={pts2} fill="#9a7840" stroke="none" pointerEvents="none" />
        {/* Snow cap */}
        <polygon
          points={`${x},${y - s * 0.55} ${x - s * 0.12},${y - s * 0.3} ${x + s * 0.12},${y - s * 0.3}`}
          fill="#f0ece0" pointerEvents="none"
        />
      </>
    );
  }
  return null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }

/** Returns [q, r] of a player's King piece, or null. */
function findKing(board, player) {
  for (const [key, entry] of board) {
    if (entry.player === player && entry.piece === 'K') return parseKey(key);
  }
  return null;
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
  const [panOffset, setPanOffset] = useState(null);
  const [scale, setScale] = useState(1.0);

  // Dynamic scale bounds computed once per new game from actual container size
  const minScaleRef = useRef(0.25);
  const maxScaleRef = useRef(1.6);

  // Track previous gameKey to distinguish new-game vs turn-switch in the layout effect
  const prevGameKey = useRef(gameKey);

  // Pointer tracking for pan + pinch-to-zoom
  const dragState = useRef(null);
  const activePointers = useRef(new Map()); // pointerId → { x, y }
  const pinchStartRef = useRef(null);       // { dist, scale, midX, midY, pan }

  // ── Initial centering + scale bounds ───────────────────────────────────────
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const isNewGame = gameKey !== prevGameKey.current;
    prevGameKey.current = gameKey;

    if (isNewGame) {
      // Compute scale range from actual container dimensions
      const { width: gw, height: gh } = gridBounds(HEX_SIZE);
      const fit = Math.min(width / gw, height / gh) * 0.88;
      minScaleRef.current = Math.max(0.2, fit);
      // Max zoom = ~5 hexes across
      const hexWidth = HEX_SIZE * Math.sqrt(3);
      maxScaleRef.current = clamp(width / (5 * hexWidth), 1.2, 2.5);

      const s = 1.0;
      setScale(s);
      const p1King = findKing(board, 1);
      if (p1King) {
        const { x: kx, y: ky } = hexToPixel(p1King[0], p1King[1], HEX_SIZE);
        // Place P1's king ~70% down the screen so the board extends upward toward P2
        setPanOffset({ x: width / 2 - kx * s, y: height * 0.7 - ky * s });
      } else {
        setPanOffset({ x: width / 2, y: height / 2 });
      }
    } else {
      // Post-handoff: snap to current player's king at max zoom
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

  // ── Fog / artifact visibility ─────────────────────────────────────────────
  const fogActive = turn === 2 && !winner && !fogLifted;
  const visibleHexes = fogActive ? getP2VisibleHexes(board) : null;
  const legalSet = new Set(legalMoves);

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
      // Adjust pan so the midpoint stays fixed on the map
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

  const onPointerUp = useCallback((e) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) pinchStartRef.current = null;
    if (activePointers.current.size === 0) dragState.current = null;
  }, []);

  // ── Wheel zoom (desktop) ──────────────────────────────────────────────────
  // Attach via addEventListener so we can pass { passive: false } for preventDefault
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
  }, []); // runs once; uses functional setScale/setPanOffset so stale-closure safe

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

  // ── Hex tap ──────────────────────────────────────────────────────────────
  const onHexClick = useCallback((key) => {
    if (winner || countdown !== null || handoff) return;
    if (dragState.current?.moved) return;
    if (phase === 'select-piece')   dispatch({ type: SELECT_PIECE, key });
    if (phase === 'select-destination' || phase === 'select-add-hex')
                                     dispatch({ type: SELECT_DESTINATION, key });
    if (phase === 'select-excavate') dispatch({ type: EXCAVATE_HEX, key });
    if (phase === 'select-scry')     dispatch({ type: SCRY_FROM, key });
  }, [winner, countdown, handoff, phase, dispatch]);

  // ── Hex fill / stroke ────────────────────────────────────────────────────
  function hexFill(key, t, inFog) {
    if (inFog) return '#1c2c40';
    if (key === selectedPiece) return '#b89010';
    if (legalSet.has(key)) return '#186818';
    if (excavated.has(key) && t === 'normal') return artifacts.has(key) ? '#886808' : '#386010';
    return TERRAIN_FILL[t] ?? TERRAIN_FILL.normal;
  }
  function hexStroke(key, t) {
    if (key === selectedPiece) return '#f0d020';
    if (legalSet.has(key)) return '#38d028';
    return TERRAIN_STROKE[t] ?? TERRAIN_STROKE.normal;
  }

  if (!panOffset) return <div ref={containerRef} className={styles.container} />;

  return (
    <div ref={containerRef} className={styles.container}>
      <svg
        className={styles.svg}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ touchAction: 'none' }}
      >
        <g transform={`translate(${panOffset.x},${panOffset.y}) scale(${scale})`}>
          {ALL_HEX_KEYS.map(key => {
            const [q, r] = parseKey(key);
            const { x, y } = hexToPixel(q, r, HEX_SIZE);
            const inFog = !!(fogActive && visibleHexes && !visibleHexes.has(key));
            const t = terrainOf(key, terrain);
            const piece = board.get(key);
            const isArtifactFound = artifacts.has(key) && excavated.has(key);
            const isArtifactRevealed = (fogLifted || showAllArtifacts) && artifacts.has(key) && !excavated.has(key);
            const isExcavatedEmpty = excavated.has(key) && !artifacts.has(key);
            const isLegalEmpty = legalSet.has(key) && !piece;
            const isMountain = t === 'mountain';

            return (
              <g
                key={key}
                onClick={() => onHexClick(key)}
                style={{ cursor: 'pointer' }}
              >
                {/* Base hex */}
                <polygon
                  points={hexPolygonPoints(x, y, HEX_SIZE)}
                  fill={hexFill(key, t, inFog)}
                  stroke={hexStroke(key, t)}
                  strokeWidth={key === selectedPiece ? 2.5 : 1}
                />

                {/* Terrain decoration (skip in deep fog for performance, but terrain is always visible) */}
                {!inFog && !isMountain && key !== selectedPiece && !legalSet.has(key) && (
                  <TerrainDecoration x={x} y={y} terrain={t} />
                )}
                {/* Mountains always show decoration so terrain is always readable */}
                {isMountain && (
                  <TerrainDecoration x={x} y={y} terrain={t} />
                )}

                {/* Excavated empty */}
                {isExcavatedEmpty && !inFog && (
                  <text x={x} y={y + 5} textAnchor="middle" fontSize="14" fill="#8a6820" opacity={0.9} pointerEvents="none">×</text>
                )}

                {/* Found artifact (excavated) */}
                {isArtifactFound && !inFog && (
                  <text x={x} y={y + 7} textAnchor="middle" fontSize="18" fill="#f0d020" pointerEvents="none">★</text>
                )}

                {/* Revealed artifact (fog lifted, not yet excavated) */}
                {isArtifactRevealed && (
                  <text x={x} y={y + 7} textAnchor="middle" fontSize="18" fill="#f0d020" opacity={0.45} pointerEvents="none">★</text>
                )}

                {/* Piece glyph — hide player-1 pieces when fogged */}
                {piece && !(inFog && piece.player === 1) && (
                  <text
                    x={x} y={y + 7}
                    textAnchor="middle"
                    fontSize={20}
                    fill={piece.player === 1 ? '#3868c8' : '#c83030'}
                    opacity={(piece.frozenTurns ?? 0) > 0 ? 0.55 : 1}
                    pointerEvents="none"
                    fontFamily="serif"
                  >
                    {PIECE_GLYPHS[piece.player][piece.piece]}
                  </text>
                )}

                {/* Legal move dot (empty or bridge-passable hex) */}
                {isLegalEmpty && !inFog && (
                  <circle cx={x} cy={y} r={5} fill="#38e040" opacity={0.75} pointerEvents="none" />
                )}
              </g>
            );
          })}

          {/* Scry result overlays */}
          {scryResults.map(({ fromKey, directionAngle, caretCount }, idx) => {
            const [q, r] = parseKey(fromKey);
            const { x, y } = hexToPixel(q, r, HEX_SIZE);
            const angle = directionAngle;
            const rad = (angle * Math.PI) / 180;
            const offsetDist = HEX_SIZE * 0.55;
            const tx = x + offsetDist * Math.cos(rad);
            const ty = y + offsetDist * Math.sin(rad);
            return (
              <text
                key={idx}
                x={tx} y={ty + 5}
                textAnchor="middle"
                fontSize={12}
                fill="#50c8f0"
                pointerEvents="none"
                fontFamily="monospace"
                transform={`rotate(${angle}, ${tx}, ${ty})`}
              >
                {'›'.repeat(caretCount)}
              </text>
            );
          })}
        </g>
      </svg>

      {/* ── Zoom controls ──────────────────────────────────────────────────── */}
      <div className={styles.zoomControls}>
        <button onClick={() => zoomBy(ZOOM_STEP)} title="Zoom in">+</button>
        <button onClick={() => zoomBy(-ZOOM_STEP)} title="Zoom out">−</button>
      </div>
    </div>
  );
}
