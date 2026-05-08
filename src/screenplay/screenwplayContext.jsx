import { createContext, useContext, useReducer } from 'react';
import { screenwplayReducer, buildInitialState } from './screenwplayReducer';

const ScreenplayContext = createContext(null);

export function ScreenplayProvider({ children }) {
  const [state, dispatch] = useReducer(screenwplayReducer, undefined, buildInitialState);
  return (
    <ScreenplayContext.Provider value={{ state, dispatch }}>
      {children}
    </ScreenplayContext.Provider>
  );
}

export function useScreenplay() {
  const ctx = useContext(ScreenplayContext);
  if (!ctx) throw new Error('useScreenplay must be used inside ScreenplayProvider');
  return ctx;
}
