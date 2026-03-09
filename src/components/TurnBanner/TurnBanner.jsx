import { useEffect, useState } from 'react';
import { useGame } from '../../hooks/useGame';
import styles from './TurnBanner.module.css';

const COLOR_NAME = { white: 'White', black: 'Black' };
const OPPONENT = { white: 'black', black: 'white' };

export function TurnBanner() {
  const { state } = useGame();
  const { engineState, status, orientation } = state;
  const [handoff, setHandoff] = useState(false);
  const [prevOrientation, setPrevOrientation] = useState(orientation);

  // Show "Hand to [player]" overlay whenever orientation changes (after a move).
  useEffect(() => {
    if (orientation !== prevOrientation) {
      setHandoff(true);
      setPrevOrientation(orientation);
      const t = setTimeout(() => setHandoff(false), 1500);
      return () => clearTimeout(t);
    }
  }, [orientation, prevOrientation]);

  if (handoff) {
    return (
      <div className={`${styles.banner} ${styles.handoff}`}>
        <span>Hand to {COLOR_NAME[orientation]} ♟</span>
      </div>
    );
  }

  if (status === 'checkmate') {
    const winner = COLOR_NAME[OPPONENT[orientation]];
    return <div className={`${styles.banner} ${styles.terminal}`}>Checkmate — {winner} wins!</div>;
  }
  if (status === 'stalemate') {
    return <div className={`${styles.banner} ${styles.terminal}`}>Stalemate — Draw</div>;
  }
  if (status === 'draw') {
    return <div className={`${styles.banner} ${styles.terminal}`}>Draw</div>;
  }
  if (status === 'resigned') {
    const winner = COLOR_NAME[OPPONENT[orientation]];
    return <div className={`${styles.banner} ${styles.terminal}`}>{winner} wins by resignation</div>;
  }

  const turnName = engineState.turn === 'w' ? 'White' : 'Black';
  const checkWarning = engineState.inCheck ? ' — Check!' : '';

  return (
    <div className={`${styles.banner} ${engineState.turn === 'w' ? styles.white : styles.black}`}>
      {turnName}&apos;s turn{checkWarning}
    </div>
  );
}
