import { TurnBanner } from '../components/TurnBanner/TurnBanner';
import { BoardWrapper } from '../components/Board/BoardWrapper';
import { PromotionDialog } from '../components/PromotionDialog/PromotionDialog';
import { MoveHistory } from '../components/MoveHistory/MoveHistory';
import { GameControls } from '../components/GameControls/GameControls';
import styles from './GameScreen.module.css';

export function GameScreen() {
  return (
    <div className={styles.screen}>
      <TurnBanner />
      <BoardWrapper />
      <MoveHistory />
      <GameControls />
      <PromotionDialog />
    </div>
  );
}
