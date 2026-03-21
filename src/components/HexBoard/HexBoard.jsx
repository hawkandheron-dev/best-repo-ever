import { useRef, useState, useCallback, useLayoutEffect } from 'react';
import { useHexGame } from '../../experiment/hexGameContext';
import { SELECT_PIECE, SELECT_DESTINATION, EXCAVATE_HEX, SCRY_FROM } from '../../experiment/hexGameActions';
import { hexToPixel, hexPolygonPoints, parseKey, buildHexGrid } from '../../experiment/hexMath';
import { getP2VisibleHexes, terrainOf } from '../../experiment/HexGameEngine';
import styles from './HexBoard.module.css';

const HEX_SIZE = 28;
const ALL_HEX_KEYS = [...buildHexGrid()];

// SVG rotation angle (degrees) for each entry in DIRECTIONS [E,NE,NW,W,SW,SE]
const SCRY_DIRECTION_ANGLES = [0, -60, -120, 180, 120, 60];

const PIECE_GLYPHS = {
  1: { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' },
  2: { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' },
};

// ── Terrain styling ──────────────────────────────────────────────────────────

const TERRAIN_FILL = {
  normal:   '#1a1a2c',
  mountain: '#2c261c',
  swamp:    '#121e0c',
  water:    '#091522',
  bridge:   '#0c1e2e',
};

const TERRAIN_STROKE = {
  normal:   '#252538',
  mountain: '#3a3228',
  swamp:    '#1e2e14',
  water:    '#102038',
  bridge:   '#1a3448',
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
        <polygon points={pts1} fill="#3a3228" stroke="#4a4030" strokeWidth={0.5} pointerEvents="none" />
        <polygon points={pts2} fill="#4a3e2a" stroke="none" pointerEvents="none" />
        {/* Snow cap */}
        <polygon
          points={`${x},${y - s * 0.55} ${x - s * 0.12},${y - s * 0.3} ${x + s * 0.12},${y - s * 0.3}`}
          fill="#d0ccc0" pointerEvents="none"
        />
      </>
    );
  }
  if (terrain === 'swamp') {
    // Wavy lines for murky water
    return (
      <>
        <text x={x} y={y - 4} textAnchor="middle" fontSize="9" fill="#2a4018" pointerEvents="none" fontFamily="serif">≋</text>
        <text x={x} y={y + 7} textAnchor="middle" fontSize="9" fill="#1e3010" pointerEvents="none" fontFamily="serif">≋</text>
        {/* Small tussock dots */}
        <circle cx={x - 7} cy={y} r={2.5} fill="#1a2e0a" pointerEvents="none" />
        <circle cx={x + 7} cy={y} r={2} fill="#182808" pointerEvents="none" />
      </>
    );
  }
  if (terrain === 'water') {
    // Wave lines
    return (
      <>
        <text x={x} y={y + 3} textAnchor="middle" fontSize="11" fill="#0e3458" pointerEvents="none" fontFamily="serif">≈</text>
        <text x={x} y={y + 14} textAnchor="middle" fontSize="8" fill="#0a2440" pointerEvents="none" fontFamily="serif">≈</text>
      </>
    );
  }
  if (terrain === 'bridge') {
    // Bridge planks + water underneath
    return (
      <>
        <text x={x} y={y + 3} textAnchor="middle" fontSize="11" fill="#1a4a6a" pointerEvents="none" fontFamily="serif">≈</text>
        {/* Bridge planks */}
        {[-8, -2, 4, 10].map(dy => (
          <rect
            key={dy}
            x={x - s * 0.4} y={y - s * 0.12 + dy * 0.5}
            width={s * 0.8} height={2.5}
            fill="#5a4020" stroke="#4a3018" strokeWidth={0.3}
            pointerEvents="none"
          />
        ))}
      </>
    );
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HexBoard() {
  const { state, dispatch } = useHexGame();
  const {
    board, terrain, excavated, artifacts,
    turn, phase, selectedPiece, legalMoves,
    winner, countdown, handoff, scryResults, gameKey,
  } = state;

  const containerRef = useRef(null);
  const [panOffset, setPanOffset] = useState(null);
  const dragState = useRef(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    // Center view on P1's king so it's always visible regardless of random start position
    let p1KingKey = null;
    for (const [key, entry] of board) {
      if (entry.player === 1 && entry.piece === 'K') { p1KingKey = key; break; }
    }
    if (p1KingKey) {
      const [kq, kr] = parseKey(p1KingKey);
      const { x: kx, y: ky } = hexToPixel(kq, kr, HEX_SIZE);
      // Place P1's king ~70% down the screen so the board extends upward toward P2
      setPanOffset({ x: width / 2 - kx, y: height * 0.7 - ky });
    } else {
      setPanOffset({ x: width / 2, y: height / 2 - 60 });
    }
  }, [gameKey]); // re-center whenever a new game starts

  const fogActive = turn === 2 && !winner;
  const visibleHexes = fogActive ? getP2VisibleHexes(board) : null;
  const legalSet = new Set(legalMoves);

  // ── Pan ──────────────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX, startY: e.clientY,
      moved: false,
      startPan: panOffset ?? { x: 0, y: 0 },
    };
  }, [panOffset]);

  const onPointerMove = useCallback((e) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    if (!dragState.current.moved && Math.hypot(dx, dy) > 6) dragState.current.moved = true;
    if (dragState.current.moved) {
      setPanOffset({ x: dragState.current.startPan.x + dx, y: dragState.current.startPan.y + dy });
    }
  }, []);

  const onPointerUp = useCallback(() => { dragState.current = null; }, []);

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
    if (inFog) return '#080810';
    if (key === selectedPiece) return '#5c500e';
    if (legalSet.has(key)) return '#0e3a0e';
    if (excavated.has(key) && t === 'normal') return artifacts.has(key) ? '#2e1e06' : '#14141e';
    return TERRAIN_FILL[t] ?? TERRAIN_FILL.normal;
  }
  function hexStroke(key, t) {
    if (key === selectedPiece) return '#f0d050';
    if (legalSet.has(key)) return '#40b040';
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
        <g transform={`translate(${panOffset.x},${panOffset.y})`}>
          {ALL_HEX_KEYS.map(key => {
            const [q, r] = parseKey(key);
            const { x, y } = hexToPixel(q, r, HEX_SIZE);
            const inFog = !!(fogActive && visibleHexes && !visibleHexes.has(key));
            const t = terrainOf(key, terrain);
            const piece = board.get(key);
            const isArtifactFound = artifacts.has(key) && excavated.has(key);
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
                  <text x={x} y={y + 5} textAnchor="middle" fontSize="10" fill="#444" pointerEvents="none">○</text>
                )}

                {/* Found artifact */}
                {isArtifactFound && !inFog && (
                  <text x={x} y={y + 7} textAnchor="middle" fontSize="18" fill="#f0a020" pointerEvents="none">★</text>
                )}

                {/* Piece glyph — hide player-1 pieces when fogged */}
                {piece && !(inFog && piece.player === 1) && (
                  <text
                    x={x} y={y + 7}
                    textAnchor="middle"
                    fontSize={piece.isBridge ? 14 : 20}
                    fill={piece.player === 1 ? '#c8c8ff' : '#ff8080'}
                    opacity={piece.justAdded ? 0.55 : piece.isBridge ? 0.8 : 1}
                    pointerEvents="none"
                    fontFamily="serif"
                  >
                    {PIECE_GLYPHS[piece.player][piece.piece]}
                  </text>
                )}

                {/* Legal move dot (empty or bridge-passable hex) */}
                {isLegalEmpty && !inFog && (
                  <circle cx={x} cy={y} r={5} fill="#40b040" opacity={0.5} pointerEvents="none" />
                )}
              </g>
            );
          })}

          {/* Scry result overlays */}
          {scryResults.map(({ fromKey, directionIndex, caretCount }, idx) => {
            const [q, r] = parseKey(fromKey);
            const { x, y } = hexToPixel(q, r, HEX_SIZE);
            const angle = SCRY_DIRECTION_ANGLES[directionIndex];
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
                fill="#a0d0ff"
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
    </div>
  );
}
