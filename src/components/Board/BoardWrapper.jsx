import { Chessboard } from 'react-chessboard';
import { useGame } from '../../hooks/useGame';
import { ATTEMPT_MOVE, SELECT_SQUARE } from '../../game/gameActions';
import styles from './BoardWrapper.module.css';

const SELECTED_COLOR = 'rgba(255, 255, 0, 0.5)';
const TARGET_COLOR = 'rgba(0, 200, 0, 0.35)';
const CHECK_COLOR = 'rgba(220, 0, 0, 0.5)';

function getKingSquare(fen, color) {
  // Parse FEN to find king square for check highlighting.
  const board = fen.split(' ')[0];
  const rows = board.split('/');
  const king = color === 'w' ? 'K' : 'k';
  for (let r = 0; r < 8; r++) {
    let col = 0;
    for (const ch of rows[r]) {
      if (ch >= '1' && ch <= '8') {
        col += parseInt(ch, 10);
      } else {
        if (ch === king) {
          return String.fromCharCode(97 + col) + (8 - r);
        }
        col++;
      }
    }
  }
  return null;
}

export function BoardWrapper() {
  const { state, dispatch } = useGame();
  const { engineState, selectedSquare, legalTargets, orientation, status } = state;
  const isTerminal = status !== 'playing';

  function handleSquareClick(square) {
    if (isTerminal) return;
    dispatch({ type: SELECT_SQUARE, square });
  }

  function handlePieceDrop(from, to) {
    if (isTerminal) return false;
    dispatch({ type: ATTEMPT_MOVE, from, to });
    return true; // react-chessboard needs this to commit the visual move
  }

  // Build square highlight styles.
  const customSquareStyles = {};
  if (selectedSquare) {
    customSquareStyles[selectedSquare] = { backgroundColor: SELECTED_COLOR };
  }
  for (const sq of legalTargets) {
    customSquareStyles[sq] = { backgroundColor: TARGET_COLOR };
  }
  if (engineState.inCheck && !isTerminal) {
    const kingSq = getKingSquare(engineState.fen, engineState.turn);
    if (kingSq) customSquareStyles[kingSq] = { backgroundColor: CHECK_COLOR };
  }

  return (
    <div className={styles.boardContainer}>
      <Chessboard
        position={engineState.fen}
        boardOrientation={orientation}
        onPieceDrop={handlePieceDrop}
        onSquareClick={handleSquareClick}
        customSquareStyles={customSquareStyles}
        arePiecesDraggable={!isTerminal}
        animationDuration={150}
      />
    </div>
  );
}
