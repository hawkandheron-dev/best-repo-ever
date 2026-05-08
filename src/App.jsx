import { useState } from 'react';
import { GameProvider } from './game/gameContext';
import { useGame } from './hooks/useGame';
import { GameScreen } from './screens/GameScreen';
import { ResultScreen } from './screens/ResultScreen';
import { MenuScreen } from './screens/MenuScreen';
import { ExperimentScreen } from './screens/ExperimentScreen';
import { SpriteStudioScreen } from './screens/SpriteStudioScreen';
import { ScreenplayScreen } from './screens/ScreenplayScreen';
import { ScreenplayProvider } from './screenplay/screenwplayContext';
import { HexGameProvider } from './experiment/hexGameContext';

function ClassicContent({ onBack }) {
  const { state } = useGame();
  const isTerminal = ['checkmate', 'stalemate', 'draw', 'resigned'].includes(state.status);
  return isTerminal ? <ResultScreen onBack={onBack} /> : <GameScreen onBack={onBack} />;
}

export default function App() {
  const [mode, setMode] = useState('menu');

  if (mode === 'menu') return <MenuScreen onSelect={setMode} />;

  if (mode === 'classic') {
    return (
      <GameProvider>
        <ClassicContent onBack={() => setMode('menu')} />
      </GameProvider>
    );
  }

  if (mode === 'experiment') {
    return (
      <HexGameProvider>
        <ExperimentScreen onBack={() => setMode('menu')} />
      </HexGameProvider>
    );
  }

  if (mode === 'test') {
    return (
      <HexGameProvider>
        <ExperimentScreen onBack={() => setMode('menu')} testMode />
      </HexGameProvider>
    );
  }

  if (mode === 'sprite-studio') {
    return <SpriteStudioScreen onBack={() => setMode('menu')} />;
  }

  if (mode === 'screenplay') {
    return (
      <ScreenplayProvider>
        <ScreenplayScreen onBack={() => setMode('menu')} />
      </ScreenplayProvider>
    );
  }

  return null;
}
