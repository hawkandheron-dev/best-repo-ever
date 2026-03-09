import { useGame } from '../../hooks/useGame';
import { CONFIRM_PROMOTION, CANCEL_PROMOTION } from '../../game/gameActions';
import styles from './PromotionDialog.module.css';

const PIECES = [
  { type: 'q', label: '♛', name: 'Queen' },
  { type: 'r', label: '♜', name: 'Rook' },
  { type: 'b', label: '♝', name: 'Bishop' },
  { type: 'n', label: '♞', name: 'Knight' },
];

export function PromotionDialog() {
  const { state, dispatch } = useGame();
  const { promotionPending, engineState } = state;
  if (!promotionPending) return null;

  // Use black pieces if it's black's turn.
  const isBlack = engineState.turn === 'b';
  const whitePieces = { q: '♛', r: '♜', b: '♝', n: '♞' };
  const blackPieces = { q: '♛', r: '♜', b: '♝', n: '♞' };
  const glyphs = isBlack ? blackPieces : whitePieces;

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <p className={styles.title}>Promote pawn to:</p>
        <div className={styles.options}>
          {PIECES.map(({ type, name }) => (
            <button
              key={type}
              className={styles.pieceButton}
              onClick={() => dispatch({ type: CONFIRM_PROMOTION, piece: type })}
              aria-label={name}
            >
              <span className={styles.glyph}>{glyphs[type]}</span>
              <span className={styles.pieceName}>{name}</span>
            </button>
          ))}
        </div>
        <button
          className={styles.cancelButton}
          onClick={() => dispatch({ type: CANCEL_PROMOTION })}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
