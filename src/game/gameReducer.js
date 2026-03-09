import { engine } from '../engine/ChessEngine';
import {
  SELECT_SQUARE,
  ATTEMPT_MOVE,
  CONFIRM_PROMOTION,
  CANCEL_PROMOTION,
  NEW_GAME,
  RESIGN,
} from './gameActions';

export function buildInitialState() {
  engine.reset();
  const engineState = engine.getBoardState();
  return {
    engineState,
    status: engine.getStatus(),
    history: engine.getHistory(),
    selectedSquare: null,
    legalTargets: [],
    promotionPending: null,
    orientation: 'white',
  };
}

export function gameReducer(state, action) {
  switch (action.type) {
    case SELECT_SQUARE: {
      const { square } = action;

      // Clicking the already-selected square deselects it.
      if (state.selectedSquare === square) {
        return { ...state, selectedSquare: null, legalTargets: [] };
      }

      // If a square with legal targets is selected and the click is on a target,
      // treat it as a move attempt.
      if (state.legalTargets.includes(square)) {
        return gameReducer(state, { type: ATTEMPT_MOVE, from: state.selectedSquare, to: square });
      }

      // Otherwise select the new square and compute legal targets.
      const legalTargets = engine.getLegalMoves(square);
      if (legalTargets.length === 0) {
        return { ...state, selectedSquare: null, legalTargets: [] };
      }
      return { ...state, selectedSquare: square, legalTargets };
    }

    case ATTEMPT_MOVE: {
      const { from, to } = action;
      const result = engine.applyMove(from, to);

      if (result.promotionRequired) {
        return {
          ...state,
          promotionPending: { from, to },
          selectedSquare: null,
          legalTargets: [],
        };
      }

      if (!result.success) {
        return { ...state, selectedSquare: null, legalTargets: [] };
      }

      const engineState = engine.getBoardState();
      const status = engine.getStatus();
      const history = engine.getHistory();
      const nextOrientation = state.orientation === 'white' ? 'black' : 'white';

      return {
        ...state,
        engineState,
        status,
        history,
        selectedSquare: null,
        legalTargets: [],
        promotionPending: null,
        orientation: nextOrientation,
      };
    }

    case CONFIRM_PROMOTION: {
      const { piece } = action; // 'q' | 'r' | 'b' | 'n'
      const { from, to } = state.promotionPending;
      const result = engine.applyMove(from, to, piece);

      if (!result.success) {
        return { ...state, promotionPending: null, selectedSquare: null, legalTargets: [] };
      }

      const engineState = engine.getBoardState();
      const status = engine.getStatus();
      const history = engine.getHistory();
      const nextOrientation = state.orientation === 'white' ? 'black' : 'white';

      return {
        ...state,
        engineState,
        status,
        history,
        selectedSquare: null,
        legalTargets: [],
        promotionPending: null,
        orientation: nextOrientation,
      };
    }

    case CANCEL_PROMOTION: {
      return { ...state, promotionPending: null, selectedSquare: null, legalTargets: [] };
    }

    case RESIGN: {
      engine.resign(action.color);
      return {
        ...state,
        status: engine.getStatus(),
        selectedSquare: null,
        legalTargets: [],
      };
    }

    case NEW_GAME: {
      return buildInitialState();
    }

    default:
      return state;
  }
}
