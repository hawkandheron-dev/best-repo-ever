import { useState } from 'react';
import { useGame } from '../../hooks/useGame';
import { NEW_GAME, RESIGN } from '../../game/gameActions';
import styles from './GameControls.module.css';

export function GameControls() {
  const { state, dispatch } = useGame();
  const { engineState, status } = state;
  const [confirmResign, setConfirmResign] = useState(false);
  const isPlaying = status === 'playing';

  function handleResign() {
    if (!confirmResign) {
      setConfirmResign(true);
      return;
    }
    setConfirmResign(false);
    dispatch({ type: RESIGN, color: engineState.turn });
  }

  function handleNewGame() {
    setConfirmResign(false);
    dispatch({ type: NEW_GAME });
  }

  return (
    <div className={styles.controls}>
      {isPlaying && (
        <button
          className={`${styles.btn} ${confirmResign ? styles.danger : styles.secondary}`}
          onClick={handleResign}
        >
          {confirmResign ? 'Confirm Resign?' : 'Resign'}
        </button>
      )}
      {confirmResign && (
        <button className={`${styles.btn} ${styles.secondary}`} onClick={() => setConfirmResign(false)}>
          Cancel
        </button>
      )}
      <button className={`${styles.btn} ${styles.primary}`} onClick={handleNewGame}>
        New Game
      </button>
    </div>
  );
}
