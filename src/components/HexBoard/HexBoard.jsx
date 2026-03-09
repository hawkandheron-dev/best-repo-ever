import { useRef, useState, useCallback, useLayoutEffect } from 'react';
import { useHexGame } from '../../experiment/hexGameContext';
import { SELECT_PIECE, SELECT_DESTINATION, EXCAVATE_HEX } from '../../experiment/hexGameActions';
import { hexToPixel, hexPolygonPoints, parseKey, buildHexGrid } from '../../experiment/hexMath';
import { getP2VisibleHexes } from '../../experiment/HexGameEngine';
import styles from './HexBoard.module.css';

const HEX_SIZE = 28;
const ALL_HEX_KEYS = [...buildHexGrid()];

const PIECE_GLYPHS = {
  1: { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' },
  2: { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' },
};

export function HexBoard() {
  const { state, dispatch } = useHexGame();
  const {
    board, excavated, artifacts,
    turn, phase, selectedPiece, legalMoves,
    winner, countdown, handoff,
  } = state;

  const containerRef = useRef(null);
  const [panOffset, setPanOffset] = useState(null);
  const dragState = useRef(null);

  // Center the board on mount
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    // Hex(0,0) is center of grid; offset slightly north to show middle of board
    setPanOffset({ x: width / 2, y: height / 2 - 60 });
  }, []);

  // Fog
  const fogActive = turn === 2 && !winner;
  const visibleHexes = fogActive ? getP2VisibleHexes(board) : null;
  const legalSet = new Set(legalMoves);

  // ── Pan ──────────────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
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
    if (dragState.current?.moved) return; // was a pan, not a tap
    if (phase === 'select-piece')   dispatch({ type: SELECT_PIECE, key });
    if (phase === 'select-destination' || phase === 'select-add-hex')
                                     dispatch({ type: SELECT_DESTINATION, key });
    if (phase === 'select-excavate') dispatch({ type: EXCAVATE_HEX, key });
  }, [winner, countdown, handoff, phase, dispatch]);

  // ── Colors ───────────────────────────────────────────────────────────────
  function hexFill(key, inFog) {
    if (inFog) return '#0a0a14';
    if (key === selectedPiece) return '#5c500e';
    if (legalSet.has(key)) return '#0e3a0e';
    if (excavated.has(key)) return artifacts.has(key) ? '#2e1e06' : '#14141e';
    return '#1a1a2c';
  }
  function hexStroke(key) {
    if (key === selectedPiece) return '#f0d050';
    if (legalSet.has(key)) return '#40b040';
    return '#252538';
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
            const piece = board.get(key);
            const isArtifactFound = artifacts.has(key) && excavated.has(key);
            const isExcavatedEmpty = excavated.has(key) && !artifacts.has(key);
            const isLegalEmpty = legalSet.has(key) && !piece;

            return (
              <g
                key={key}
                onClick={() => onHexClick(key)}
                style={{ cursor: 'pointer' }}
              >
                <polygon
                  points={hexPolygonPoints(x, y, HEX_SIZE)}
                  fill={hexFill(key, inFog)}
                  stroke={hexStroke(key)}
                  strokeWidth={key === selectedPiece ? 2 : 1}
                />
                {isExcavatedEmpty && !inFog && (
                  <text x={x} y={y + 5} textAnchor="middle" fontSize="10" fill="#555" pointerEvents="none">○</text>
                )}
                {isArtifactFound && !inFog && (
                  <text x={x} y={y + 7} textAnchor="middle" fontSize="18" fill="#f0a020" pointerEvents="none">★</text>
                )}
                {piece && !(inFog && piece.player === 1) && (
                  <text
                    x={x} y={y + 7}
                    textAnchor="middle"
                    fontSize="20"
                    fill={piece.player === 1 ? '#c8c8ff' : '#ff8080'}
                    opacity={piece.justAdded ? 0.55 : 1}
                    pointerEvents="none"
                    fontFamily="serif"
                  >
                    {PIECE_GLYPHS[piece.player][piece.piece]}
                  </text>
                )}
                {isLegalEmpty && !inFog && (
                  <circle cx={x} cy={y} r={5} fill="#40b040" opacity={0.5} pointerEvents="none" />
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
