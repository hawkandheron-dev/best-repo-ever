import { useHexGame } from '../../experiment/hexGameContext';
import { START_ACTION, CANCEL_ACTION, END_TURN } from '../../experiment/hexGameActions';
import { AddPiecePanel } from '../AddPiecePanel/AddPiecePanel';
import styles from './ActionPanel.module.css';

const PHASE_PROMPTS = {
  'select-action':      null,
  'select-piece':       'Tap a piece to move',
  'select-destination': 'Tap a destination',
  'select-add-piece':   null, // handled by AddPiecePanel
  'select-add-hex':     'Tap a hex to place the piece',
  'select-excavate':    'Tap a hex to excavate',
  'select-scry':        'Tap one of your pieces to scry',
};

export function ActionPanel() {
  const { state, dispatch } = useHexGame();
  const { turn, actionsLeft, phase, pendingPawnCount, winner } = state;

  if (winner || phase === 'game-over') return null;

  const prompt = PHASE_PROMPTS[phase];
  const showCancel = phase !== 'select-action';
  const showAddPieceSelector = phase === 'select-add-piece';
  const showPawnProgress = phase === 'select-add-hex' && pendingPawnCount > 0;

  return (
    <div className={styles.panel}>
      {/* Turn + actions left */}
      <div className={styles.status}>
        <span className={styles.playerLabel}>Player {turn}</span>
        <span className={styles.dots}>
          {[1, 2, 3].map(i => (
            turn === 1 || i <= 2
              ? <span key={i} className={i <= actionsLeft ? styles.dotFull : styles.dotEmpty} />
              : null
          ))}
        </span>
        <span className={styles.actionsLeft}>{actionsLeft} action{actionsLeft !== 1 ? 's' : ''} left</span>
      </div>

      {/* Prompt */}
      {prompt && <p className={styles.prompt}>{prompt}</p>}
      {showPawnProgress && (
        <p className={styles.prompt}>
          Placing pawn {pendingPawnCount === 2 ? '1' : '2'} of 2 — tap a hex
        </p>
      )}

      {/* Add piece selector */}
      {showAddPieceSelector && <AddPiecePanel />}

      {/* Action buttons */}
      {phase === 'select-action' && (
        <div className={styles.actions}>
          <button
            className={styles.actionBtn}
            disabled={actionsLeft <= 0}
            onClick={() => dispatch({ type: START_ACTION, actionType: 'move' })}
          >
            Move
          </button>
          <button
            className={styles.actionBtn}
            disabled={actionsLeft <= 0}
            onClick={() => dispatch({ type: START_ACTION, actionType: 'add' })}
          >
            Add Piece
          </button>
          {turn === 1 && (
            <button
              className={styles.actionBtn}
              disabled={actionsLeft <= 0}
              onClick={() => dispatch({ type: START_ACTION, actionType: 'excavate' })}
            >
              Excavate
            </button>
          )}
          <button
            className={styles.actionBtn}
            disabled={actionsLeft <= 0}
            onClick={() => dispatch({ type: START_ACTION, actionType: 'scry' })}
          >
            Scry
          </button>
        </div>
      )}

      {/* Cancel + End Turn row */}
      <div className={styles.bottomRow}>
        {showCancel && (
          <button className={styles.cancelBtn} onClick={() => dispatch({ type: CANCEL_ACTION })}>
            ← Back
          </button>
        )}
        <button className={styles.endTurnBtn} onClick={() => dispatch({ type: END_TURN })}>
          End Turn
        </button>
      </div>
    </div>
  );
}
