import { useEffect, useRef } from 'react';
import { useScreenplay } from '../screenplay/screenwplayContext';
import {
  START_SYNC, PAUSE_SYNC, RESUME_SYNC,
  RESET_SYNC, ADD_MARKER, ADJUST_OFFSET,
} from '../screenplay/screenwplayActions';
import { computePosition } from '../screenplay/syncEngine';
import { ScreenplayLoader } from '../components/ScreenplayLoader/ScreenplayLoader';
import { ScreenplayViewer } from '../components/ScreenplayViewer/ScreenplayViewer';
import { ScreenplayControls } from '../components/ScreenplayControls/ScreenplayControls';
import { MarkerList } from '../components/ScreenplayMarkers/MarkerList';
import styles from './ScreenplayScreen.module.css';

// We re-export SET_POSITION from the actions module; syncEngine uses it by value only.
// The actual dispatch uses the string constant directly here.
const SET_POS = 'SET_POSITION';

export function ScreenplayScreen({ onBack }) {
  const { state, dispatch } = useScreenplay();
  const {
    loadStatus, pdfDoc, numPages, pageData,
    syncStatus, startWallTime, pausedElapsedMs, offsetMs, markers,
    currentPageNum, currentLineIndex,
  } = state;

  const viewerRef = useRef(null);
  const rafRef = useRef(null);
  const lastPosRef = useRef({ pageNum: 1, lineIndex: 0 });

  // RAF loop — runs only when sync is active.
  useEffect(() => {
    if (syncStatus !== 'running') {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = () => {
      const elapsedMs = Date.now() - startWallTime + pausedElapsedMs + offsetMs;
      const pos = computePosition(elapsedMs, pageData, markers);

      if (pos.pageNum !== lastPosRef.current.pageNum || pos.lineIndex !== lastPosRef.current.lineIndex) {
        lastPosRef.current = pos;
        dispatch({ type: SET_POS, pageNum: pos.pageNum, lineIndex: pos.lineIndex });
      }

      // Drive scroll directly on the viewer DOM — no React state update each frame.
      if (viewerRef.current) {
        const target = viewerRef.current.getScrollTarget(pos.pageNum);
        if (target !== null) {
          const current = viewerRef.current.scrollTop;
          const delta = target - current;
          if (Math.abs(delta) > 1) {
            viewerRef.current.scrollTop = current + delta * 0.06;
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [syncStatus, startWallTime, pausedElapsedMs, offsetMs, markers, pageData, dispatch]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      if (loadStatus !== 'ready') return;

      if (e.key === ' ') {
        e.preventDefault();
        if (syncStatus === 'idle') dispatch({ type: START_SYNC });
        else if (syncStatus === 'running') dispatch({ type: PAUSE_SYNC });
        else dispatch({ type: RESUME_SYNC });
      } else if (e.key === 'a' || e.key === 'A') {
        dispatch({ type: ADD_MARKER, pageNum: currentPageNum });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        dispatch({ type: ADJUST_OFFSET, deltaMs: -15_000 });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        dispatch({ type: ADJUST_OFFSET, deltaMs: 15_000 });
      } else if (e.key === 'Escape') {
        dispatch({ type: RESET_SYNC });
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loadStatus, syncStatus, currentPageNum, dispatch]);

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <button className={styles.back} onClick={onBack}>← Back</button>
        <span className={styles.title}>Screenplay Sync</span>
        {loadStatus === 'ready' && (
          <span className={styles.hint}>
            Space · A · ←→ · Esc
          </span>
        )}
      </header>

      <div className={styles.body}>
        {loadStatus === 'idle' || loadStatus === 'error' ? (
          <div className={styles.loaderWrap}>
            {loadStatus === 'error' && (
              <p className={styles.error}>{state.error}</p>
            )}
            <ScreenplayLoader />
          </div>
        ) : (
          <ScreenplayViewer
            ref={viewerRef}
            pdfDoc={pdfDoc}
            pageData={pageData}
            numPages={numPages}
            currentPageNum={currentPageNum}
            currentLineIndex={currentLineIndex}
            scale={1.2}
          />
        )}
      </div>

      {loadStatus === 'ready' && (
        <footer className={styles.footer}>
          <MarkerList />
          <ScreenplayControls />
        </footer>
      )}
    </div>
  );
}
