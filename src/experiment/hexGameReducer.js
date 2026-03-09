import {
  START_ACTION, SELECT_PIECE, SELECT_DESTINATION, SELECT_ADD_PIECE,
  EXCAVATE_HEX, CANCEL_ACTION, END_TURN, TICK_COUNTDOWN, DISMISS_HANDOFF, NEW_GAME,
} from './hexGameActions';
import { getLegalMoves, getPlacementTargets, checkWin, buildInitialState, getP2VisibleHexes } from './HexGameEngine';
import { hexKey } from './hexMath';

export function buildInitialGameState() {
  const { hexGrid, board, artifacts } = buildInitialState();
  return {
    hexGrid,
    board,
    artifacts,
    excavated: new Set(),
    foundArtifacts: 0,
    turn: 1,
    actionsLeft: 2,
    phase: 'select-action',  // 'select-action'|'select-piece'|'select-destination'|'select-add-hex'|'select-excavate'|'game-over'
    selectedPiece: null,
    legalMoves: [],
    pendingAction: null,
    pendingAddPiece: null,
    pendingPawnCount: 0,      // 0 = done, 1 = placing first pawn, 2 = placing second pawn
    winner: null,
    winReason: null,
    countdown: null,
    handoff: false,
  };
}

export function hexGameReducer(state, action) {
  switch (action.type) {
    case NEW_GAME:
      return buildInitialGameState();

    case START_ACTION: {
      if (state.phase !== 'select-action' || state.actionsLeft <= 0) return state;
      const { actionType } = action;
      if (actionType === 'move') {
        return { ...state, phase: 'select-piece', pendingAction: 'move' };
      }
      if (actionType === 'excavate') {
        return { ...state, phase: 'select-excavate', pendingAction: 'excavate' };
      }
      if (actionType === 'add') {
        return { ...state, phase: 'select-add-piece', pendingAction: 'add' };
      }
      return state;
    }

    case SELECT_PIECE: {
      if (state.phase !== 'select-piece') return state;
      const { key } = action;
      const moves = getLegalMoves(key, state.board, state.turn);
      if (moves.length === 0) return state; // no legal moves, stay in select-piece
      return { ...state, phase: 'select-destination', selectedPiece: key, legalMoves: moves };
    }

    case SELECT_DESTINATION: {
      if (state.phase === 'select-destination') {
        const { key } = action;
        if (!state.legalMoves.includes(key)) {
          // Clicked own piece — re-select
          const newMoves = getLegalMoves(key, state.board, state.turn);
          if (newMoves.length > 0) {
            return { ...state, selectedPiece: key, legalMoves: newMoves };
          }
          return state;
        }
        // Execute move
        const newBoard = new Map(state.board);
        const pieceEntry = { ...newBoard.get(state.selectedPiece) };
        // Clear justAdded on move
        delete pieceEntry.justAdded;
        newBoard.delete(state.selectedPiece);
        newBoard.set(key, pieceEntry);

        const nextActionsLeft = state.actionsLeft - 1;
        // Clear justAdded from all pieces at turn end if actions used up
        const nextState = {
          ...state,
          board: newBoard,
          selectedPiece: null,
          legalMoves: [],
          pendingAction: null,
          actionsLeft: nextActionsLeft,
          phase: nextActionsLeft > 0 ? 'select-action' : 'select-action',
        };

        const win = checkWin(newBoard, nextState.foundArtifacts);
        if (win) return { ...nextState, phase: 'game-over', winner: win.winner, winReason: win.reason };
        if (nextActionsLeft <= 0) return startEndTurn(nextState);
        return nextState;
      }

      if (state.phase === 'select-add-hex') {
        const { key } = action;
        const targets = getPlacementTargets(state.board, state.turn, state.hexGrid);
        if (!targets.includes(key)) return state;

        const newBoard = new Map(state.board);
        const isPawn = state.pendingAddPiece === 'P';
        const isQueen = state.pendingAddPiece === 'Q';

        if (isPawn && state.pendingPawnCount === 2) {
          // Placing first of two pawns
          newBoard.set(key, { piece: 'P', player: state.turn });
          return {
            ...state,
            board: newBoard,
            pendingPawnCount: 1,
            legalMoves: getPlacementTargets(newBoard, state.turn, state.hexGrid),
          };
        }

        if (isPawn && state.pendingPawnCount === 1) {
          // Placing second pawn — action completes
          newBoard.set(key, { piece: 'P', player: state.turn });
          const nextActionsLeft = state.actionsLeft - 1;
          const nextState = {
            ...state,
            board: newBoard,
            selectedPiece: null,
            legalMoves: [],
            pendingAction: null,
            pendingAddPiece: null,
            pendingPawnCount: 0,
            actionsLeft: nextActionsLeft,
            phase: 'select-action',
          };
          if (nextActionsLeft <= 0) return startEndTurn(nextState);
          return nextState;
        }

        // Non-pawn placement
        const entry = { piece: state.pendingAddPiece, player: state.turn };
        if (isQueen) entry.justAdded = true;
        newBoard.set(key, entry);
        const nextActionsLeft = state.actionsLeft - 1;
        const nextState = {
          ...state,
          board: newBoard,
          selectedPiece: null,
          legalMoves: [],
          pendingAction: null,
          pendingAddPiece: null,
          pendingPawnCount: 0,
          actionsLeft: nextActionsLeft,
          phase: 'select-action',
        };
        if (nextActionsLeft <= 0) return startEndTurn(nextState);
        return nextState;
      }

      return state;
    }

    case SELECT_ADD_PIECE: {
      if (state.phase !== 'select-add-piece') return state;
      const { pieceType } = action;
      const targets = getPlacementTargets(state.board, state.turn, state.hexGrid);
      const isPawn = pieceType === 'P';
      return {
        ...state,
        phase: 'select-add-hex',
        pendingAddPiece: pieceType,
        pendingPawnCount: isPawn ? 2 : 0,
        legalMoves: targets,
      };
    }

    case EXCAVATE_HEX: {
      if (state.phase !== 'select-excavate') return state;
      const { key } = action;
      if (state.excavated.has(key)) return state; // already excavated

      const newExcavated = new Set(state.excavated);
      newExcavated.add(key);

      const foundArtifact = state.artifacts.has(key);
      const newFoundArtifacts = state.foundArtifacts + (foundArtifact ? 1 : 0);

      const nextActionsLeft = state.actionsLeft - 1;
      const nextState = {
        ...state,
        excavated: newExcavated,
        foundArtifacts: newFoundArtifacts,
        pendingAction: null,
        actionsLeft: nextActionsLeft,
        phase: 'select-action',
      };

      const win = checkWin(state.board, newFoundArtifacts);
      if (win) return { ...nextState, phase: 'game-over', winner: win.winner, winReason: win.reason };
      if (nextActionsLeft <= 0) return startEndTurn(nextState);
      return nextState;
    }

    case CANCEL_ACTION:
      return {
        ...state,
        phase: 'select-action',
        selectedPiece: null,
        legalMoves: [],
        pendingAction: null,
        pendingAddPiece: null,
        pendingPawnCount: 0,
      };

    case END_TURN:
      if (state.phase === 'game-over') return state;
      return startEndTurn(state);

    case TICK_COUNTDOWN: {
      if (state.countdown === null) return state;
      const next = state.countdown - 1;
      if (next <= 0) {
        // Countdown done → switch to handoff
        return { ...state, countdown: null, handoff: true };
      }
      return { ...state, countdown: next };
    }

    case DISMISS_HANDOFF: {
      if (!state.handoff) return state;
      const nextTurn = state.turn === 1 ? 2 : 1;
      // Clear justAdded flags at start of new turn
      const newBoard = new Map();
      for (const [k, v] of state.board) {
        const entry = { ...v };
        delete entry.justAdded;
        newBoard.set(k, entry);
      }
      return {
        ...state,
        board: newBoard,
        handoff: false,
        turn: nextTurn,
        actionsLeft: 2,
        phase: 'select-action',
        selectedPiece: null,
        legalMoves: [],
        pendingAction: null,
        pendingAddPiece: null,
        pendingPawnCount: 0,
      };
    }

    default:
      return state;
  }
}

function startEndTurn(state) {
  return {
    ...state,
    phase: 'select-action',
    selectedPiece: null,
    legalMoves: [],
    pendingAction: null,
    pendingAddPiece: null,
    pendingPawnCount: 0,
    countdown: 3,
  };
}
