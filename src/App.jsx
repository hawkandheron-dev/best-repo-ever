import { GameProvider } from './game/gameContext';
import { useGame } from './hooks/useGame';
import { GameScreen } from './screens/GameScreen';
import { ResultScreen } from './screens/ResultScreen';

function AppContent() {
  const { state } = useGame();
  const isTerminal = ['checkmate', 'stalemate', 'draw', 'resigned'].includes(state.status);
  return isTerminal ? <ResultScreen /> : <GameScreen />;
}

export default function App() {
  return (
    <GameProvider>
      <AppContent />
    </GameProvider>
  );
}
