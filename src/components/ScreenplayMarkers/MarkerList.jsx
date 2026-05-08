import { useScreenplay } from '../../screenplay/screenwplayContext';
import { REMOVE_MARKER } from '../../screenplay/screenwplayActions';
import { formatElapsed } from '../../screenplay/syncEngine';
import styles from './MarkerList.module.css';

export function MarkerList() {
  const { state, dispatch } = useScreenplay();
  const { markers } = state;

  if (!markers.length) return null;

  return (
    <details className={styles.details}>
      <summary className={styles.summary}>
        Correction Anchors ({markers.length})
      </summary>
      <ul className={styles.list}>
        {markers.map((m, i) => (
          <li key={i} className={styles.item}>
            <span className={styles.label}>
              Anchor {i + 1} — Page {m.pageNum} @ {formatElapsed(m.elapsedMs)}
            </span>
            <button
              className={styles.remove}
              onClick={() => dispatch({ type: REMOVE_MARKER, index: i })}
              title="Remove this anchor"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
