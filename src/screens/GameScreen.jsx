import { TurnBanner } from '../components/TurnBanner/TurnBanner';
import { BoardWrapper } from '../components/Board/BoardWrapper';
import { PromotionDialog } from '../components/PromotionDialog/PromotionDialog';
import { MoveHistory } from '../components/MoveHistory/MoveHistory';
import { GameControls } from '../components/GameControls/GameControls';
import styles from './GameScreen.module.css';

export function GameScreen({ onBack }) {
  return (
    <div className={styles.screen}>
      {onBack && (
        <button onClick={onBack} style={{ alignSelf: 'flex-start', margin: '0.5rem 0', padding: '0.25rem 0.75rem', background: 'none', border: '1px solid #444', borderRadius: 8, color: '#aaa', cursor: 'pointer', fontSize: '0.85rem' }}>
          ← Menu
        </button>
      )}
      <TurnBanner />
      <BoardWrapper />
      <MoveHistory />
      <GameControls />
      <PromotionDialog />
    </div>
  );
}
