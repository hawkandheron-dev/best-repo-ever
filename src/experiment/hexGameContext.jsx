import { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { hexGameReducer, buildInitialGameState } from './hexGameReducer';
import { TICK_COUNTDOWN } from './hexGameActions';

const HexGameContext = createContext(null);

export function HexGameProvider({ children }) {
  const [state, dispatch] = useReducer(hexGameReducer, null, buildInitialGameState);
  const intervalRef = useRef(null);

  // Drive countdown timer
  useEffect(() => {
    if (state.countdown !== null) {
      intervalRef.current = setInterval(() => dispatch({ type: TICK_COUNTDOWN }), 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [state.countdown]);

  return (
    <HexGameContext.Provider value={{ state, dispatch }}>
      {children}
    </HexGameContext.Provider>
  );
}

export function useHexGame() {
  const ctx = useContext(HexGameContext);
  if (!ctx) throw new Error('useHexGame must be used inside HexGameProvider');
  return ctx;
}
