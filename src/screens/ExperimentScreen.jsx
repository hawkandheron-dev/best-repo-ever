import { useHexGame } from '../experiment/hexGameContext';
import { NEW_GAME, DISMISS_HANDOFF } from '../experiment/hexGameActions';
import { HexBoard } from '../components/HexBoard/HexBoard';
import { ActionPanel } from '../components/ActionPanel/ActionPanel';
import styles from './ExperimentScreen.module.css';

export function ExperimentScreen({ onBack }) {
  const { state, dispatch } = useHexGame();
  const { turn, foundArtifacts, winner, winReason, countdown, handoff, phase } = state;

  return (
    <div className={styles.screen}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>← Menu</button>
        <div className={styles.headerInfo}>
          <span className={styles.turnLabel}>Player {turn}'s turn</span>
          <span className={styles.artifactCount}>
            ★ {foundArtifacts}/3 artifacts
          </span>
        </div>
        <button className={styles.newGameBtn} onClick={() => dispatch({ type: NEW_GAME })}>
          New
        </button>
      </div>

      {/* ── Hex Board ───────────────────────────────────────────────────── */}
      <HexBoard />

      {/* ── Action Panel ────────────────────────────────────────────────── */}
      {phase !== 'game-over' && <ActionPanel />}

      {/* ── How to Play ─────────────────────────────────────────────────── */}
      <details className={styles.howToPlay}>
        <summary className={styles.howToSummary}>? How to Play</summary>
        <div className={styles.howToBody}>
          <div className={styles.howToSection}>
            <strong>Player 1</strong>
            <ul>
              <li>You see the whole board. Player 2 is hidden in fog.</li>
              <li>Up to 2 actions per turn: Move, Add a piece, or Excavate.</li>
              <li>Excavate any hex to flip it — find all 3 ★ artifacts to win.</li>
              <li>Adding Pawns places 2 for 1 action. Queens can't move the turn they're added.</li>
            </ul>
          </div>
          <div className={styles.howToSection}>
            <strong>Player 2</strong>
            <ul>
              <li>You only see hexes adjacent to your pieces — the rest is fog.</li>
              <li>Up to 2 actions: Move or Add a piece.</li>
              <li>Capture Player 1's King to win.</li>
            </ul>
          </div>
        </div>
      </details>

      {/* ── Countdown overlay ───────────────────────────────────────────── */}
      {countdown !== null && (
        <div className={styles.overlay}>
          <div className={styles.countdown}>{countdown}</div>
          <p className={styles.countdownLabel}>Handing off…</p>
        </div>
      )}

      {/* ── Handoff overlay ─────────────────────────────────────────────── */}
      {handoff && (
        <div className={styles.overlay} onClick={() => dispatch({ type: DISMISS_HANDOFF })}>
          <div className={styles.handoffTitle}>
            Player {turn === 1 ? 2 : 1} — hand the phone to
          </div>
          <div className={styles.handoffPlayer}>Player {turn}</div>
          <p className={styles.handoffHint}>Tap anywhere to continue</p>
        </div>
      )}

      {/* ── Game over overlay ───────────────────────────────────────────── */}
      {winner && (
        <div className={styles.overlay}>
          <div className={styles.winnerIcon}>{winner === 1 ? '★' : '♚'}</div>
          <div className={styles.winnerTitle}>Player {winner} wins!</div>
          <p className={styles.winReason}>{winReason}</p>
          <div className={styles.overlayBtns}>
            <button className={styles.overlayBtn} onClick={() => dispatch({ type: NEW_GAME })}>
              Play Again
            </button>
            <button className={`${styles.overlayBtn} ${styles.overlayBtnSecondary}`} onClick={onBack}>
              Main Menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
