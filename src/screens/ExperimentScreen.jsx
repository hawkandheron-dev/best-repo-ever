import { useHexGame } from '../experiment/hexGameContext';
import { NEW_GAME, DISMISS_HANDOFF, DISMISS_CAPTURE, DISMISS_FOG_NOTIFICATION } from '../experiment/hexGameActions';
import { HexBoard } from '../components/HexBoard/HexBoard';
import { ActionPanel } from '../components/ActionPanel/ActionPanel';
import styles from './ExperimentScreen.module.css';

const PIECE_NAMES = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' };

export function ExperimentScreen({ onBack }) {
  const { state, dispatch } = useHexGame();
  const { turn, foundArtifacts, winner, winReason, countdown, handoff, phase, captureNotification, fogLiftPending } = state;

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
              <li>You see the whole board. Player 2 is in fog.</li>
              <li>Up to 2 actions: Move, Add a piece, or Excavate.</li>
              <li>Excavate any hex to flip it — find all 3 ★ artifacts to win.</li>
              <li>Pawns: add 2 for 1 action. Queens can't move the turn added.</li>
            </ul>
          </div>
          <div className={styles.howToSection}>
            <strong>Player 2</strong>
            <ul>
              <li>You only see hexes adjacent to your pieces — rest is fog.</li>
              <li>Up to 2 actions: Move or Add a piece.</li>
              <li>Capture Player 1's King to win.</li>
            </ul>
          </div>
          <div className={styles.howToSection}>
            <strong>Terrain</strong>
            <ul>
              <li>▲ Mountains — impassable for all pieces.</li>
              <li>≋ Swamp — passable but costs both actions to enter.</li>
              <li>≈ Water — blocked; move a Rook there to build a bridge.</li>
              <li>Bridge — sliding pieces (Rook, Bishop, Queen) can cross.</li>
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
            Player {turn} — hand the phone to
          </div>
          <div className={styles.handoffPlayer}>Player {turn === 1 ? 2 : 1}</div>
          <p className={styles.handoffHint}>Tap anywhere to continue</p>
        </div>
      )}

      {/* ── Capture notification overlay ────────────────────────────────── */}
      {captureNotification && !handoff && (
        <div className={styles.overlay} onClick={() => dispatch({ type: DISMISS_CAPTURE })}>
          <div className={styles.handoffTitle}>Pieces lost</div>
          {captureNotification.captures.map((c, i) => (
            <p key={i} className={styles.handoffHint}>
              {PIECE_NAMES[c.capturedPiece]} captured by enemy {PIECE_NAMES[c.byPiece]}
            </p>
          ))}
          <p className={styles.handoffHint} style={{ marginTop: '1rem', opacity: 0.5 }}>Tap to continue</p>
        </div>
      )}

      {/* ── Fog-lift notification overlay ───────────────────────────────── */}
      {fogLiftPending && !captureNotification && !handoff && (
        <div className={styles.overlay} onClick={() => dispatch({ type: DISMISS_FOG_NOTIFICATION })}>
          <div className={styles.winnerIcon}>👁</div>
          <div className={styles.winnerTitle}>All is revealed!</div>
          <p className={styles.winReason}>
            Fog of war now removed and artifact coordinates identified. Happy hunting!
          </p>
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
