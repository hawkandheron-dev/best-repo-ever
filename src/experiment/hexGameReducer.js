import {
  START_ACTION, SELECT_PIECE, SELECT_DESTINATION, SELECT_ADD_PIECE,
  EXCAVATE_HEX, SCRY_FROM, CANCEL_ACTION, END_TURN, TICK_COUNTDOWN, DISMISS_HANDOFF, DISMISS_CAPTURE, DISMISS_FOG_NOTIFICATION, NEW_GAME,
} from './hexGameActions';
import {
  getLegalMoves, getPlacementTargets, getExcavationTargets, getScryTargets, computeScryResult,
  checkWin, buildInitialState, moveCost, terrainOf,
} from './HexGameEngine';

export function buildInitialGameState() {
  const { hexGrid, board, artifacts, terrain } = buildInitialState();
  return {
    hexGrid,
    board,
    terrain,       // Map<hexKey, 'mountain'|'water'|'swamp'|'bridge'>
    artifacts,
    excavated: new Set(),
    foundArtifacts: 0,
    turn: 1,
    actionsLeft: 2,
    phase: 'select-action',
    selectedPiece: null,
    legalMoves: [],
    pendingAction: null,
    pendingAddPiece: null,
    pendingPawnCount: 0,
    winner: null,
    winReason: null,
    countdown: null,
    handoff: false,
    scryResults: [],
    pendingCaptures: [],
    captureNotification: null,
    turnCount: 0,
    fogLifted: false,
    fogLiftPending: false,
    handoffCount: 0,
    gameKey: 0,
  };
}

export function hexGameReducer(state, action) {
  switch (action.type) {
    case NEW_GAME:
      return { ...buildInitialGameState(), gameKey: state.gameKey + 1 };

    case START_ACTION: {
      if (state.phase !== 'select-action' || state.actionsLeft <= 0) return state;
      const { actionType } = action;
      if (actionType === 'move')     return { ...state, phase: 'select-piece', pendingAction: 'move' };
      if (actionType === 'excavate') {
        const targets = getExcavationTargets(state.board, state.turn, state.hexGrid);
        return { ...state, phase: 'select-excavate', pendingAction: 'excavate', legalMoves: targets };
      }
      if (actionType === 'add')      return { ...state, phase: 'select-add-piece', pendingAction: 'add' };
      if (actionType === 'scry') {
        const targets = getScryTargets(state.board);
        return { ...state, phase: 'select-scry', pendingAction: 'scry', legalMoves: targets };
      }
      return state;
    }

    case SELECT_PIECE: {
      if (state.phase !== 'select-piece') return state;
      const { key } = action;
      const moves = getLegalMoves(key, state.board, state.turn, state.terrain);
      if (moves.length === 0) return state;
      return { ...state, phase: 'select-destination', selectedPiece: key, legalMoves: moves };
    }

    case SELECT_DESTINATION: {
      if (state.phase === 'select-destination') {
        const { key } = action;
        if (!state.legalMoves.includes(key)) {
          // Re-select another piece
          const newMoves = getLegalMoves(key, state.board, state.turn, state.terrain);
          if (newMoves.length > 0) return { ...state, selectedPiece: key, legalMoves: newMoves };
          return state;
        }

        // Execute move — check for capture first
        const capturedEntry = state.board.get(key);
        const newPendingCaptures = capturedEntry
          ? [...state.pendingCaptures, { capturedPiece: capturedEntry.piece, capturedPlayer: capturedEntry.player, byPiece: state.board.get(state.selectedPiece).piece }]
          : state.pendingCaptures;

        const newBoard = new Map(state.board);
        const pieceEntry = { ...newBoard.get(state.selectedPiece) };
        delete pieceEntry.justAdded;
        newBoard.delete(state.selectedPiece);

        // Bridge mechanic: rook landing on water becomes a bridge
        const newTerrain = new Map(state.terrain);
        const destTerrain = terrainOf(key, state.terrain);
        if (pieceEntry.piece === 'R' && destTerrain === 'water') {
          pieceEntry.isBridge = true;
          newTerrain.set(key, 'bridge');
        } else if (pieceEntry.piece === 'R' && destTerrain === 'bridge') {
          // Rook captures enemy bridge: becomes the new bridge
          pieceEntry.isBridge = true;
          newTerrain.set(key, 'bridge');
        } else {
          // Remove isBridge if rook somehow moves off (shouldn't happen, but guard)
          delete pieceEntry.isBridge;
        }
        newBoard.set(key, pieceEntry);

        // Swamp costs 2 actions; otherwise 1
        const cost = moveCost(key, state.terrain);
        const nextActionsLeft = Math.max(0, state.actionsLeft - cost);

        const nextState = {
          ...state,
          board: newBoard,
          terrain: newTerrain,
          selectedPiece: null,
          legalMoves: [],
          pendingAction: null,
          actionsLeft: nextActionsLeft,
          phase: 'select-action',
          pendingCaptures: newPendingCaptures,
        };

        const win = checkWin(newBoard, nextState.foundArtifacts);
        if (win) return { ...nextState, phase: 'game-over', winner: win.winner, winReason: win.reason };
        if (nextActionsLeft <= 0) return startEndTurn(nextState);
        return nextState;
      }

      if (state.phase === 'select-add-hex') {
        const { key } = action;
        const targets = getPlacementTargets(state.board, state.turn, state.hexGrid, state.terrain);
        if (!targets.includes(key)) return state;

        const newBoard = new Map(state.board);
        const isPawn  = state.pendingAddPiece === 'P';
        const isQueen = state.pendingAddPiece === 'Q';

        if (isPawn && state.pendingPawnCount === 2) {
          newBoard.set(key, { piece: 'P', player: state.turn });
          return {
            ...state,
            board: newBoard,
            pendingPawnCount: 1,
            legalMoves: getPlacementTargets(newBoard, state.turn, state.hexGrid, state.terrain),
          };
        }

        if (isPawn && state.pendingPawnCount === 1) {
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
      const targets = getPlacementTargets(state.board, state.turn, state.hexGrid, state.terrain);
      return {
        ...state,
        phase: 'select-add-hex',
        pendingAddPiece: pieceType,
        pendingPawnCount: pieceType === 'P' ? 2 : 0,
        legalMoves: targets,
      };
    }

    case EXCAVATE_HEX: {
      if (state.phase !== 'select-excavate') return state;
      const { key } = action;
      if (!state.legalMoves.includes(key)) return state; // must be on/adjacent to a piece
      if (state.excavated.has(key)) return state;

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

    case SCRY_FROM: {
      if (state.phase !== 'select-scry') return state;
      const { key } = action;
      if (!state.legalMoves.includes(key)) return state;

      const result = computeScryResult(key, state.artifacts, state.excavated);
      const newScryResults = result
        ? [...state.scryResults, result]
        : state.scryResults;

      const nextActionsLeft = state.actionsLeft - 1;
      const nextState = {
        ...state,
        scryResults: newScryResults,
        pendingAction: null,
        actionsLeft: nextActionsLeft,
        legalMoves: [],
        phase: 'select-action',
      };
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
      if (next <= 0) return { ...state, countdown: null, handoff: true };
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
      // Show capture notification to the incoming player about their lost pieces
      const theirCaptures = state.pendingCaptures.filter(c => c.capturedPlayer === nextTurn);
      const captureNotification = theirCaptures.length > 0 ? { captures: theirCaptures } : null;
      // Fog lift: triggers once after 20 total half-turns
      const newTurnCount = state.turnCount + 1;
      const fogJustLifted = !state.fogLifted && newTurnCount >= 20;
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
        scryResults: [],
        pendingCaptures: [],
        captureNotification,
        turnCount: newTurnCount,
        fogLifted: state.fogLifted || fogJustLifted,
        fogLiftPending: fogJustLifted,
        handoffCount: state.handoffCount + 1,
      };
    }

    case DISMISS_CAPTURE:
      return { ...state, captureNotification: null };

    case DISMISS_FOG_NOTIFICATION:
      return { ...state, fogLiftPending: false };

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
