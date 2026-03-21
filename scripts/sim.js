/**
 * Hex Game — AI vs AI Simulation
 *
 * Run with:  npm run sim
 *            npm run sim -- --games=500
 *            npm run sim -- --games=100 --verbose
 *
 * Uses vite-node so it can import the same ES-module source files the app uses.
 * No API costs — all AI agents are pure algorithms.
 *
 * Agents implemented:
 *   randomAgent    — picks uniformly at random from all legal actions
 *   p1GreedyAgent  — P1 (Artifact Hunter): always excavate if possible, else move toward nearest artifact
 *   p2GreedyAgent  — P2 (King Hunter): capture king if in range, else close distance to king
 */

import { buildInitialGameState, hexGameReducer } from '../src/experiment/hexGameReducer.js';
import {
  getLegalMoves, getPlacementTargets, getExcavationTargets,
} from '../src/experiment/HexGameEngine.js';
import { parseKey, hexDist } from '../src/experiment/hexMath.js';
import {
  START_ACTION, SELECT_PIECE, SELECT_DESTINATION,
  SELECT_ADD_PIECE, EXCAVATE_HEX, DISMISS_HANDOFF, TICK_COUNTDOWN,
} from '../src/experiment/hexGameActions.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function dispatch(state, action) {
  return hexGameReducer(state, action);
}

/**
 * Advance past the countdown / handoff phases without human interaction.
 * In a real game these are 3-second pauses for pass-and-play; in simulation
 * we skip them instantly.
 */
function advanceHandoff(state) {
  while (state.countdown !== null || state.handoff) {
    if (state.countdown !== null) {
      state = dispatch(state, { type: TICK_COUNTDOWN });
    } else {
      state = dispatch(state, { type: DISMISS_HANDOFF });
    }
  }
  return state;
}

// ── Random agent ──────────────────────────────────────────────────────────────
// Baseline: picks uniformly at random from available action types, then
// picks uniformly at random within that action.

function randomAgent(state) {
  const player = state.turn;
  const opts = [];

  // Move: need at least one piece with legal destinations
  const movable = [...state.board.entries()].filter(
    ([k, e]) => e.player === player && !e.isBridge &&
      getLegalMoves(k, state.board, player, state.terrain).length > 0
  );
  if (movable.length > 0) opts.push('move');

  // Add piece: need at least one free adjacent hex
  if (getPlacementTargets(state.board, player, state.hexGrid, state.terrain).length > 0)
    opts.push('add');

  // Excavate (P1 only)
  if (player === 1) {
    const unexc = getExcavationTargets(state.board, player, state.hexGrid)
      .filter(k => !state.excavated.has(k));
    if (unexc.length > 0) opts.push('excavate');
  }

  if (opts.length === 0) return state; // nothing to do — runner will end turn

  const choice = pick(opts);

  if (choice === 'move') {
    let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
    const [fromKey] = pick(movable);
    s = dispatch(s, { type: SELECT_PIECE, key: fromKey });
    const toKey = pick(s.legalMoves);
    return dispatch(s, { type: SELECT_DESTINATION, key: toKey });
  }

  if (choice === 'add') {
    let s = dispatch(state, { type: START_ACTION, actionType: 'add' });
    const pieceType = pick(['Q', 'R', 'B', 'N', 'P']);
    s = dispatch(s, { type: SELECT_ADD_PIECE, pieceType });
    if (s.legalMoves.length === 0) return state;
    s = dispatch(s, { type: SELECT_DESTINATION, key: pick(s.legalMoves) });
    if (pieceType === 'P' && s.legalMoves.length > 0) {
      s = dispatch(s, { type: SELECT_DESTINATION, key: pick(s.legalMoves) });
    }
    return s;
  }

  if (choice === 'excavate') {
    let s = dispatch(state, { type: START_ACTION, actionType: 'excavate' });
    const unexc = s.legalMoves.filter(k => !state.excavated.has(k));
    if (unexc.length === 0) return state;
    return dispatch(s, { type: EXCAVATE_HEX, key: pick(unexc) });
  }

  return state;
}

// ── P1 greedy agent ───────────────────────────────────────────────────────────
// Strategy for the Artifact Hunter:
//   1. If an un-excavated artifact is adjacent to a piece → excavate it immediately
//   2. Otherwise excavate any reachable hex (may reveal artifact)
//   3. Otherwise move the piece that can get closest to a remaining artifact

function p1GreedyAgent(state) {
  const player = 1;
  const remaining = [...state.artifacts].filter(k => !state.excavated.has(k));

  // Excavation targets reachable this turn
  const excavTargets = getExcavationTargets(state.board, player, state.hexGrid)
    .filter(k => !state.excavated.has(k));

  if (excavTargets.length > 0) {
    // Prefer a known artifact location first
    const hit = excavTargets.find(k => state.artifacts.has(k));
    const target = hit ?? pick(excavTargets);
    let s = dispatch(state, { type: START_ACTION, actionType: 'excavate' });
    return dispatch(s, { type: EXCAVATE_HEX, key: target });
  }

  // No excavation available — move toward nearest remaining artifact
  const movable = [...state.board.entries()].filter(
    ([k, e]) => e.player === player && !e.isBridge &&
      getLegalMoves(k, state.board, player, state.terrain).length > 0
  );

  if (movable.length > 0 && remaining.length > 0) {
    let bestMove = null, bestDist = Infinity;

    for (const [fromKey] of movable) {
      const moves = getLegalMoves(fromKey, state.board, player, state.terrain);
      for (const toKey of moves) {
        const [tq, tr] = parseKey(toKey);
        const dist = Math.min(...remaining.map(ak => {
          const [aq, ar] = parseKey(ak);
          return hexDist(tq, tr, aq, ar);
        }));
        if (dist < bestDist) { bestDist = dist; bestMove = { fromKey, toKey }; }
      }
    }

    if (bestMove) {
      let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
      s = dispatch(s, { type: SELECT_PIECE, key: bestMove.fromKey });
      return dispatch(s, { type: SELECT_DESTINATION, key: bestMove.toKey });
    }
  }

  return randomAgent(state); // fall back to random if greedy has nothing better
}

// ── P2 greedy agent ───────────────────────────────────────────────────────────
// Strategy for the King Hunter:
//   1. Capture P1's king immediately if any piece can reach it
//   2. Otherwise move the piece closest to P1's king one step nearer

function p2GreedyAgent(state) {
  const player = 2;

  // Locate P1 king
  let p1KingKey = null;
  for (const [key, e] of state.board) {
    if (e.player === 1 && e.piece === 'K') { p1KingKey = key; break; }
  }
  if (!p1KingKey) return randomAgent(state);
  const [kq, kr] = parseKey(p1KingKey);

  const movable = [...state.board.entries()].filter(
    ([k, e]) => e.player === player && !e.isBridge &&
      getLegalMoves(k, state.board, player, state.terrain).length > 0
  );

  // Can we capture the king right now?
  for (const [fromKey] of movable) {
    const moves = getLegalMoves(fromKey, state.board, player, state.terrain);
    if (moves.includes(p1KingKey)) {
      let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
      s = dispatch(s, { type: SELECT_PIECE, key: fromKey });
      return dispatch(s, { type: SELECT_DESTINATION, key: p1KingKey });
    }
  }

  // Move whichever piece gets closest to P1 king
  if (movable.length > 0) {
    let bestMove = null, bestDist = Infinity;

    for (const [fromKey] of movable) {
      const moves = getLegalMoves(fromKey, state.board, player, state.terrain);
      for (const toKey of moves) {
        const [tq, tr] = parseKey(toKey);
        const dist = hexDist(tq, tr, kq, kr);
        if (dist < bestDist) { bestDist = dist; bestMove = { fromKey, toKey }; }
      }
    }

    if (bestMove) {
      let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
      s = dispatch(s, { type: SELECT_PIECE, key: bestMove.fromKey });
      return dispatch(s, { type: SELECT_DESTINATION, key: bestMove.toKey });
    }
  }

  return randomAgent(state);
}

// ── Game runner ───────────────────────────────────────────────────────────────

const MAX_ACTIONS = 600; // safety cap — prevents truly infinite games

function runGame(p1Agent, p2Agent) {
  let state = buildInitialGameState();
  let actionCount = 0;

  while (state.phase !== 'game-over' && actionCount < MAX_ACTIONS) {
    state = advanceHandoff(state);
    if (state.phase === 'game-over') break;

    const agent = state.turn === 1 ? p1Agent : p2Agent;
    const prevActions = state.actionsLeft;
    state = agent(state);

    // If the agent couldn't make progress, force-end the turn to prevent loops
    if (state.actionsLeft >= prevActions && state.phase === 'select-action') {
      state = advanceHandoff({ ...state, countdown: 0 });
    }

    actionCount++;
  }

  return {
    winner: state.winner ?? 0,
    winReason: state.winReason ?? 'timeout',
    actionCount,
    foundArtifacts: state.foundArtifacts,
    timedOut: actionCount >= MAX_ACTIONS,
  };
}

// ── Batch runner ──────────────────────────────────────────────────────────────

function runBatch(n, p1Agent, p2Agent, label, verbose = false) {
  let p1Wins = 0, p2Wins = 0, timeouts = 0;
  let totalActions = 0;
  const reasons = {};
  const start = Date.now();

  for (let i = 0; i < n; i++) {
    const r = runGame(p1Agent, p2Agent);
    totalActions += r.actionCount;
    if (r.timedOut)       timeouts++;
    else if (r.winner === 1) p1Wins++;
    else if (r.winner === 2) p2Wins++;
    reasons[r.winReason] = (reasons[r.winReason] ?? 0) + 1;

    if (verbose && (i + 1) % 50 === 0) process.stdout.write('.');
  }
  if (verbose) process.stdout.write('\n');

  const ms = Date.now() - start;
  const rate = ((p1Wins + p2Wins + timeouts) / (ms / 1000)).toFixed(0);

  console.log(`\n── ${label} ──`);
  console.log(`   ${n} games  |  ${ms}ms  |  ~${rate} games/sec`);
  console.log(`   P1 wins : ${p1Wins.toString().padStart(4)} (${(p1Wins / n * 100).toFixed(1)}%)`);
  console.log(`   P2 wins : ${p2Wins.toString().padStart(4)} (${(p2Wins / n * 100).toFixed(1)}%)`);
  console.log(`   Timeouts: ${timeouts.toString().padStart(4)}`);
  console.log(`   Avg actions/game: ${(totalActions / n).toFixed(1)}`);
  console.log(`   Win reasons:`, reasons);
}

// ── Entry point ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const N = parseInt(args.find(a => a.startsWith('--games='))?.split('=')[1] ?? '200');
const verbose = args.includes('--verbose');

console.log(`\nHex Game AI Simulation`);
console.log(`Games per matchup: ${N}`);
console.log(`\nAgents:`);
console.log(`  random     — uniform random action selection`);
console.log(`  p1-greedy  — P1 always excavates, then moves toward artifacts`);
console.log(`  p2-greedy  — P2 captures king if reachable, else closes distance`);

runBatch(N, randomAgent,    randomAgent,    'random vs random',         verbose);
runBatch(N, p1GreedyAgent,  randomAgent,    'p1-greedy vs p2-random',   verbose);
runBatch(N, randomAgent,    p2GreedyAgent,  'p1-random vs p2-greedy',   verbose);
runBatch(N, p1GreedyAgent,  p2GreedyAgent,  'p1-greedy vs p2-greedy',   verbose);
