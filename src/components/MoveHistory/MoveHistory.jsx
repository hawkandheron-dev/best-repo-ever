import { useEffect, useRef } from 'react';
import { useGame } from '../../hooks/useGame';
import styles from './MoveHistory.module.css';

export function MoveHistory() {
  const { state } = useGame();
  const { history } = state;
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  if (history.length === 0) return null;

  // Pair moves into rows: [[w1, b1], [w2, b2], ...]
  const rows = [];
  for (let i = 0; i < history.length; i += 2) {
    rows.push([history[i], history[i + 1]]);
  }

  return (
    <div className={styles.container}>
      <table className={styles.table}>
        <tbody>
          {rows.map(([white, black], idx) => (
            <tr key={idx} className={styles.row}>
              <td className={styles.num}>{idx + 1}.</td>
              <td className={styles.move}>{white}</td>
              <td className={styles.move}>{black ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div ref={bottomRef} />
    </div>
  );
}
