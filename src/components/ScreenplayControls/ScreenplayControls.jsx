import { useState } from 'react';
import { useScreenplay } from '../../screenplay/screenwplayContext';
import {
  START_SYNC, PAUSE_SYNC, RESUME_SYNC, RESET_SYNC,
  ADD_MARKER, ADJUST_OFFSET, RESET_PDF,
} from '../../screenplay/screenwplayActions';
import { totalDurationMs, formatElapsed } from '../../screenplay/syncEngine';
import styles from './ScreenplayControls.module.css';

function formatMins(ms) {
  return `~${Math.round(ms / 60_000)} min`;
}

function getElapsed(state) {
  if (state.syncStatus === 'running') {
    return Date.now() - state.startWallTime + state.pausedElapsedMs + state.offsetMs;
  }
  return state.pausedElapsedMs + state.offsetMs;
}

export function ScreenplayControls() {
  const { state, dispatch } = useScreenplay();
  const [anchorMode, setAnchorMode] = useState(false);
  const [anchorPage, setAnchorPage] = useState(1);

  const { syncStatus, numPages, pageData, currentPageNum } = state;

  const estimatedDuration = pageData.length ? totalDurationMs(pageData) : 0;
  const elapsed = getElapsed(state);

  const onToggle = () => {
    if (syncStatus === 'idle') dispatch({ type: START_SYNC });
    else if (syncStatus === 'running') dispatch({ type: PAUSE_SYNC });
    else dispatch({ type: RESUME_SYNC });
  };

  const onReset = () => {
    setAnchorMode(false);
    dispatch({ type: RESET_SYNC });
  };

  const onAnchorConfirm = () => {
    dispatch({ type: ADD_MARKER, pageNum: anchorPage });
    setAnchorMode(false);
  };

  return (
    <div className={styles.bar}>
      {/* Position display */}
      <div className={styles.position}>
        {syncStatus !== 'idle' ? (
          <>
            <span className={styles.page}>Pg {currentPageNum}/{numPages}</span>
            <span className={styles.sep}>·</span>
            <span className={styles.time}>{formatElapsed(elapsed)}</span>
          </>
        ) : (
          <span className={styles.page}>
            {numPages} pages · {formatMins(estimatedDuration)}
          </span>
        )}
      </div>

      {/* Main controls */}
      <div className={styles.controls}>
        <button
          className={`${styles.btn} ${styles.primary}`}
          onClick={onToggle}
          title={syncStatus === 'running' ? 'Pause (Space)' : syncStatus === 'paused' ? 'Resume (Space)' : 'Start (Space)'}
        >
          {syncStatus === 'running' ? '⏸ Pause' : syncStatus === 'paused' ? '▶ Resume' : '▶ Start'}
        </button>

        {syncStatus !== 'idle' && (
          <>
            <button
              className={styles.btn}
              onClick={() => dispatch({ type: ADJUST_OFFSET, deltaMs: -15_000 })}
              title="Shift back 15s (←)"
            >
              −15s
            </button>
            <button
              className={styles.btn}
              onClick={() => dispatch({ type: ADJUST_OFFSET, deltaMs: 15_000 })}
              title="Shift forward 15s (→)"
            >
              +15s
            </button>
            <button
              className={`${styles.btn} ${styles.anchor}`}
              onClick={() => { setAnchorPage(currentPageNum); setAnchorMode(true); }}
              title="Add correction anchor (A)"
            >
              ⚓ Anchor
            </button>
            <button className={`${styles.btn} ${styles.reset}`} onClick={onReset} title="Reset (Esc)">
              ↺ Reset
            </button>
          </>
        )}

        <button
          className={`${styles.btn} ${styles.ghost}`}
          onClick={() => dispatch({ type: RESET_PDF })}
          title="Load a different PDF"
        >
          Load PDF
        </button>
      </div>

      {/* Inline anchor prompt */}
      {anchorMode && (
        <div className={styles.anchorPrompt}>
          <span>I am on page</span>
          <button className={styles.pageAdj} onClick={() => setAnchorPage(p => Math.max(1, p - 1))}>−</button>
          <span className={styles.pageNum}>{anchorPage}</span>
          <button className={styles.pageAdj} onClick={() => setAnchorPage(p => Math.min(numPages, p + 1))}>+</button>
          <button className={`${styles.btn} ${styles.primary}`} onClick={onAnchorConfirm}>Confirm</button>
          <button className={styles.btn} onClick={() => setAnchorMode(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
