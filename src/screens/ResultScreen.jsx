import { useGame } from '../hooks/useGame';
import { NEW_GAME } from '../game/gameActions';
import styles from './ResultScreen.module.css';

const MESSAGES = {
  checkmate: (orientation) => {
    const winner = orientation === 'white' ? 'Black' : 'White';
    return `Checkmate — ${winner} wins!`;
  },
  stalemate: () => 'Stalemate — It\'s a draw!',
  draw: () => 'Draw by repetition / insufficient material',
  resigned: (orientation) => {
    const winner = orientation === 'white' ? 'Black' : 'White';
    return `${winner} wins by resignation`;
  },
};

export function ResultScreen() {
  const { state, dispatch } = useGame();
  const { status, orientation } = state;
  const getMessage = MESSAGES[status];
  const message = getMessage ? getMessage(orientation) : 'Game over';

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.trophy}>♚</div>
        <p className={styles.message}>{message}</p>
        <button className={styles.btn} onClick={() => dispatch({ type: NEW_GAME })}>
          Play Again
        </button>
      </div>
    </div>
  );
}
