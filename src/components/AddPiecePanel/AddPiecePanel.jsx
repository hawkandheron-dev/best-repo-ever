import { useHexGame } from '../../experiment/hexGameContext';
import { SELECT_ADD_PIECE } from '../../experiment/hexGameActions';
import styles from './AddPiecePanel.module.css';

const PIECES = [
  { type: 'Q', glyph: '♕', label: 'Queen', note: 'Frozen 3 half-turns' },
  { type: 'P', glyph: '♙', label: 'Pawn', note: 'Places 2' },
];

export function AddPiecePanel() {
  const { dispatch } = useHexGame();

  return (
    <div className={styles.panel}>
      <p className={styles.prompt}>Choose a piece to add:</p>
      <div className={styles.grid}>
        {PIECES.map(({ type, glyph, label, note }) => (
          <button
            key={type}
            className={styles.pieceBtn}
            onClick={() => dispatch({ type: SELECT_ADD_PIECE, pieceType: type })}
          >
            <span className={styles.glyph}>{glyph}</span>
            <span className={styles.label}>{label}</span>
            {note && <span className={styles.note}>{note}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
