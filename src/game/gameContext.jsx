import { createContext, useReducer } from 'react';
import { gameReducer, buildInitialState } from './gameReducer';

export const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, undefined, buildInitialState);
  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}
