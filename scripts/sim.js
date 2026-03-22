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
  getScryTargets, getP2VisibleHexes,
  getP2ScryTargets, computeP2ScryResult,
} from '../src/experiment/HexGameEngine.js';
import { parseKey, hexDist, hexKey } from '../src/experiment/hexMath.js';
import {
  START_ACTION, SELECT_PIECE, SELECT_DESTINATION,
  SELECT_ADD_PIECE, EXCAVATE_HEX, SCRY_FROM, DISMISS_HANDOFF, TICK_COUNTDOWN,
} from '../src/experiment/hexGameActions.js';

// Axial hex neighbour offsets (E, NE, NW, W, SW, SE) — mirrors HexGameEngine DIRECTIONS
const HEX_DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];

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
    ([k, e]) => e.player === player &&
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

  // Scry (both players)
  const scryTargets = player === 1 ? getScryTargets(state.board) : getP2ScryTargets(state.board);
  if (scryTargets.length > 0) opts.push('scry');

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
    const pieceType = pick(['Q', 'P', 'R']);
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

  if (choice === 'scry') {
    let s = dispatch(state, { type: START_ACTION, actionType: 'scry' });
    if (s.legalMoves.length === 0) return state;
    return dispatch(s, { type: SCRY_FROM, key: pick(s.legalMoves) });
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
    ([k, e]) => e.player === player &&
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
    ([k, e]) => e.player === player &&
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

// ── P1 defensive agent ────────────────────────────────────────────────────────
// Like p1Greedy but switches to evasion when any P2 piece is within
// THREAT_DIST hexes of P1's king. In defensive mode it moves the king
// (or any piece) to maximise minimum distance from the nearest P2 piece.

const THREAT_DIST = 5;

function p1DefensiveAgent(state) {
  const player = 1;

  // Find P1 king
  let kingKey = null;
  for (const [key, e] of state.board) {
    if (e.player === 1 && e.piece === 'K') { kingKey = key; break; }
  }

  if (kingKey) {
    const [kq, kr] = parseKey(kingKey);
    let minThreat = Infinity;
    for (const [, e] of state.board) {
      if (e.player !== 2) continue;
      // e has no key here — iterate differently
    }
    // Re-iterate with key
    for (const [key, e] of state.board) {
      if (e.player !== 2) continue;
      const [q, r] = parseKey(key);
      minThreat = Math.min(minThreat, hexDist(kq, kr, q, r));
    }

    if (minThreat <= THREAT_DIST) {
      // Defensive: move any piece to maximise distance from nearest P2 piece
      const movable = [...state.board.entries()].filter(
        ([k, e]) => e.player === player &&
          getLegalMoves(k, state.board, player, state.terrain).length > 0
      );

      let bestMove = null, bestDist = -Infinity;
      for (const [fromKey] of movable) {
        const moves = getLegalMoves(fromKey, state.board, player, state.terrain);
        for (const toKey of moves) {
          const [tq, tr] = parseKey(toKey);
          let minP2 = Infinity;
          for (const [key, e] of state.board) {
            if (e.player !== 2) continue;
            const [q, r] = parseKey(key);
            minP2 = Math.min(minP2, hexDist(tq, tr, q, r));
          }
          if (minP2 > bestDist) { bestDist = minP2; bestMove = { fromKey, toKey }; }
        }
      }

      if (bestMove) {
        let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
        s = dispatch(s, { type: SELECT_PIECE, key: bestMove.fromKey });
        return dispatch(s, { type: SELECT_DESTINATION, key: bestMove.toKey });
      }
    }
  }

  return p1GreedyAgent(state);
}

// ── P2 balanced agent ─────────────────────────────────────────────────────────
// Like p2Greedy but also adds pieces strategically: if P2 has fewer than 5
// pieces and P1's king is still far away, place a Pawn on the hex closest
// to P1's king rather than advancing immediately.

function p2BalancedAgent(state) {
  const player = 2;

  let p1KingKey = null;
  for (const [key, e] of state.board) {
    if (e.player === 1 && e.piece === 'K') { p1KingKey = key; break; }
  }
  if (!p1KingKey) return randomAgent(state);
  const [kq, kr] = parseKey(p1KingKey);

  const pieceCount = [...state.board.values()].filter(e => e.player === 2).length;
  const placements = getPlacementTargets(state.board, player, state.hexGrid, state.terrain);

  if (pieceCount < 5 && placements.length > 0) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'add' });
    s = dispatch(s, { type: SELECT_ADD_PIECE, pieceType: 'P' });
    if (s.legalMoves.length > 0) {
      // Place pawn 1 on hex closest to P1 king
      let bestHex = null, bestDist = Infinity;
      for (const hex of s.legalMoves) {
        const [hq, hr] = parseKey(hex);
        const d = hexDist(hq, hr, kq, kr);
        if (d < bestDist) { bestDist = d; bestHex = hex; }
      }
      s = dispatch(s, { type: SELECT_DESTINATION, key: bestHex });
      // Place pawn 2
      if (s.legalMoves.length > 0) {
        let hex2 = s.legalMoves[0], bestDist2 = Infinity;
        for (const hex of s.legalMoves) {
          const [hq, hr] = parseKey(hex);
          const d = hexDist(hq, hr, kq, kr);
          if (d < bestDist2) { bestDist2 = d; hex2 = hex; }
        }
        s = dispatch(s, { type: SELECT_DESTINATION, key: hex2 });
      }
      return s;
    }
  }

  return p2GreedyAgent(state);
}

// ── P1 Scry Oracle ────────────────────────────────────────────────────────────
// Treats the Scry action as action-1 on every turn, then uses the resulting
// directionIndex to step the King one hex toward the nearest artifact as action-2.
// Breaks the pattern by excavating only when a known artifact is right there.

function p1ScryOracleAgent(state) {
  const player = 1;

  let kingKey = null;
  for (const [key, e] of state.board) {
    if (e.player === 1 && e.piece === 'K') { kingKey = key; break; }
  }
  if (!kingKey) return randomAgent(state);

  // Priority 1: excavate a confirmed artifact in range (never pass this up)
  const excavTargets = getExcavationTargets(state.board, player, state.hexGrid)
    .filter(k => !state.excavated.has(k));
  const knownArtifact = excavTargets.find(k => state.artifacts.has(k));
  if (knownArtifact) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'excavate' });
    return dispatch(s, { type: EXCAVATE_HEX, key: knownArtifact });
  }

  // Priority 2: scry if we have no result yet this turn
  if (state.scryResults.length === 0) {
    const scryTargets = getScryTargets(state.board);
    const from = scryTargets.includes(kingKey) ? kingKey : scryTargets[0];
    if (from) {
      let s = dispatch(state, { type: START_ACTION, actionType: 'scry' });
      return dispatch(s, { type: SCRY_FROM, key: from });
    }
  }

  // Priority 3: move King one step in direction from latest scry result
  const latest = state.scryResults[state.scryResults.length - 1];
  if (latest) {
    const [kq, kr] = parseKey(kingKey);
    // Convert exact angle to nearest hex direction for movement decision
    const rad = latest.directionAngle * Math.PI / 180;
    let bestHexDir = 0, bestDot = -Infinity;
    for (let i = 0; i < HEX_DIRS.length; i++) {
      const [dq, dr] = HEX_DIRS[i];
      const dx = Math.sqrt(3) * dq + (Math.sqrt(3) / 2) * dr;
      const dy = 1.5 * dr;
      const dot = Math.cos(rad) * dx + Math.sin(rad) * dy;
      if (dot > bestDot) { bestDot = dot; bestHexDir = i; }
    }
    const [dq, dr] = HEX_DIRS[bestHexDir];
    const kingMoves = getLegalMoves(kingKey, state.board, player, state.terrain);

    if (kingMoves.length > 0) {
      // Pick the legal move that minimises distance to a far point along the scry direction
      const farQ = kq + dq * 99, farR = kr + dr * 99;
      let target = null, bestDist = Infinity;
      for (const toKey of kingMoves) {
        const [tq, tr] = parseKey(toKey);
        const d = hexDist(tq, tr, farQ, farR);
        if (d < bestDist) { bestDist = d; target = toKey; }
      }
      if (target) {
        let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
        s = dispatch(s, { type: SELECT_PIECE, key: kingKey });
        return dispatch(s, { type: SELECT_DESTINATION, key: target });
      }
    }
  }

  // Fallback: excavate any unexcavated hex
  if (excavTargets.length > 0) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'excavate' });
    return dispatch(s, { type: EXCAVATE_HEX, key: excavTargets[0] });
  }

  return p1GreedyAgent(state);
}

// ── P1 Queen Sweeper ──────────────────────────────────────────────────────────
// Deploys a Queen toward the middle artifact band (|r| ≤ 4) and sweeps it
// through unexcavated hexes. During the 3-half-turn freeze, excavates greedily.
// Once the Queen is mobile it slides to the hex with the best middle-band score.

function p1BishopSweeperAgent(state) {
  const player = 1;
  const MIDDLE_BAND = 4;

  // Locate P1's first unfrozen Queen (if any)
  let queenKey = null;
  for (const [key, e] of state.board) {
    if (e.player === 1 && e.piece === 'Q' && (e.frozenTurns ?? 0) === 0) {
      queenKey = key; break;
    }
  }

  // No Queen at all — add one toward the middle band
  const hasAnyQueen = [...state.board.values()].some(e => e.player === 1 && e.piece === 'Q');
  if (!hasAnyQueen) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'add' });
    s = dispatch(s, { type: SELECT_ADD_PIECE, pieceType: 'Q' });
    if (s.legalMoves.length > 0) {
      let best = s.legalMoves[0], bestAbsR = Infinity;
      for (const k of s.legalMoves) {
        const [, r] = parseKey(k);
        if (Math.abs(r) < bestAbsR) { bestAbsR = Math.abs(r); best = k; }
      }
      return dispatch(s, { type: SELECT_DESTINATION, key: best });
    }
    return p1GreedyAgent(state);
  }

  // Excavate a middle-band or artifact hex in range (works whether queen is frozen or not)
  const excavTargets = getExcavationTargets(state.board, player, state.hexGrid)
    .filter(k => !state.excavated.has(k));

  const artifact = excavTargets.find(k => state.artifacts.has(k));
  if (artifact) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'excavate' });
    return dispatch(s, { type: EXCAVATE_HEX, key: artifact });
  }

  const middleHex = excavTargets.find(k => { const [, r] = parseKey(k); return Math.abs(r) <= MIDDLE_BAND; });
  if (middleHex) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'excavate' });
    return dispatch(s, { type: EXCAVATE_HEX, key: middleHex });
  }

  // No good excavation — slide mobile Queen toward middle band
  if (queenKey) {
    const queenMoves = getLegalMoves(queenKey, state.board, player, state.terrain);
    if (queenMoves.length > 0) {
      let best = queenMoves[0], bestScore = -Infinity;
      for (const toKey of queenMoves) {
        const [, r] = parseKey(toKey);
        const bandScore = MIDDLE_BAND + 1 - Math.abs(r);
        let unexcNeighbours = 0;
        for (const [dq, dr] of HEX_DIRS) {
          const [tq, tr] = parseKey(toKey);
          const nk = hexKey(tq + dq, tr + dr);
          if (state.hexGrid.has(nk) && !state.excavated.has(nk)) unexcNeighbours++;
        }
        const score = bandScore * 2 + unexcNeighbours;
        if (score > bestScore) { bestScore = score; best = toKey; }
      }
      let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
      s = dispatch(s, { type: SELECT_PIECE, key: queenKey });
      return dispatch(s, { type: SELECT_DESTINATION, key: best });
    }
  }

  return p1GreedyAgent(state);
}

// ── P1 Turtle Fortress ────────────────────────────────────────────────────────
// Builds a pawn wall north of the King before advancing, then excavates from
// behind that living barrier. Reinforce the wall if P2 breaks through.

const TURTLE_WALL_SIZE = 3;

function p1TurtleAgent(state) {
  const player = 1;

  let kingKey = null;
  for (const [key, e] of state.board) {
    if (e.player === 1 && e.piece === 'K') { kingKey = key; break; }
  }
  if (!kingKey) return randomAgent(state);
  const [kq, kr] = parseKey(kingKey);

  const wallPawns = [...state.board.values()].filter(
    e => e.player === 1 && e.piece === 'P'
  ).length;

  // Build wall if below target size
  if (wallPawns < TURTLE_WALL_SIZE) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'add' });
    s = dispatch(s, { type: SELECT_ADD_PIECE, pieceType: 'P' });

    if (s.legalMoves.length > 0) {
      // Helper: score a placement hex — prefer north of King (lower r), close to King
      const scoreHex = k => {
        const [q, r] = parseKey(k);
        return hexDist(q, r, kq, kr) + (r < kr ? -2 : 0);
      };

      let hex1 = s.legalMoves[0];
      for (const k of s.legalMoves) { if (scoreHex(k) < scoreHex(hex1)) hex1 = k; }
      s = dispatch(s, { type: SELECT_DESTINATION, key: hex1 }); // places pawn 1

      if (s.legalMoves.length > 0) {
        let hex2 = s.legalMoves[0];
        for (const k of s.legalMoves) { if (scoreHex(k) < scoreHex(hex2)) hex2 = k; }
        s = dispatch(s, { type: SELECT_DESTINATION, key: hex2 }); // places pawn 2
      }
      return s;
    }
  }

  // Wall is up — excavate from current footprint
  const excavTargets = getExcavationTargets(state.board, player, state.hexGrid)
    .filter(k => !state.excavated.has(k));

  const hit = excavTargets.find(k => state.artifacts.has(k));
  if (hit) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'excavate' });
    return dispatch(s, { type: EXCAVATE_HEX, key: hit });
  }
  if (excavTargets.length > 0) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'excavate' });
    return dispatch(s, { type: EXCAVATE_HEX, key: excavTargets[0] });
  }

  return p1GreedyAgent(state);
}

// ── P1 King Hunter ────────────────────────────────────────────────────────────
// P1 acts as aggressor: quickly builds a strike force (King + Queen + Pawns),
// marches it toward P2, and captures enemy pieces before they reach the King.
// Only excavates when a known artifact is right at hand.

function p1KingHunterAgent(state) {
  const player = 1;

  let p2KingKey = null;
  for (const [key, e] of state.board) {
    if (e.player === 2 && e.piece === 'K') { p2KingKey = key; break; }
  }

  // Grab a known artifact if it's already in excavation range
  const excavTargets = getExcavationTargets(state.board, player, state.hexGrid)
    .filter(k => !state.excavated.has(k));
  const knownArtifact = excavTargets.find(k => state.artifacts.has(k));
  if (knownArtifact) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'excavate' });
    return dispatch(s, { type: EXCAVATE_HEX, key: knownArtifact });
  }

  // Capture any P2 piece that is reachable this action
  const movable = [...state.board.entries()].filter(
    ([k, e]) => e.player === player &&
      getLegalMoves(k, state.board, player, state.terrain).length > 0
  );
  for (const [fromKey] of movable) {
    const moves = getLegalMoves(fromKey, state.board, player, state.terrain);
    for (const toKey of moves) {
      const resident = state.board.get(toKey);
      if (resident && resident.player === 2) {
        let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
        s = dispatch(s, { type: SELECT_PIECE, key: fromKey });
        return dispatch(s, { type: SELECT_DESTINATION, key: toKey });
      }
    }
  }

  // Build strike force: King → add Q → add Pawns
  const p1Count = [...state.board.values()].filter(e => e.player === 1).length;
  const hasQueen = [...state.board.values()].some(e => e.player === 1 && e.piece === 'Q');
  if (p1Count < 4) {
    const placements = getPlacementTargets(state.board, player, state.hexGrid, state.terrain);
    if (placements.length > 0) {
      const nextPiece = !hasQueen ? 'Q' : 'P';
      let s = dispatch(state, { type: START_ACTION, actionType: 'add' });
      s = dispatch(s, { type: SELECT_ADD_PIECE, pieceType: nextPiece });
      if (s.legalMoves.length > 0) {
        // Place the new piece toward P2 King
        let best = s.legalMoves[0];
        if (p2KingKey) {
          const [p2q, p2r] = parseKey(p2KingKey);
          for (const k of s.legalMoves) {
            const [kq2, kr2] = parseKey(k);
            const [bq2, br2] = parseKey(best);
            if (hexDist(kq2, kr2, p2q, p2r) < hexDist(bq2, br2, p2q, p2r)) best = k;
          }
        }
        return dispatch(s, { type: SELECT_DESTINATION, key: best });
      }
    }
  }

  // March toward nearest P2 non-King piece (capturing P2's King has no win-condition payoff)
  const p2Targets = [...state.board.entries()].filter(([, e]) => e.player === 2 && e.piece !== 'K');
  const marchTargets = p2Targets.length > 0 ? p2Targets : (p2KingKey ? [[p2KingKey]] : []);
  if (marchTargets.length > 0 && movable.length > 0) {
    let bestMove = null, bestDist = Infinity;
    for (const [fromKey] of movable) {
      const moves = getLegalMoves(fromKey, state.board, player, state.terrain);
      for (const toKey of moves) {
        const [tq, tr] = parseKey(toKey);
        let minD = Infinity;
        for (const [pk] of marchTargets) { const [pq, pr] = parseKey(pk); minD = Math.min(minD, hexDist(tq, tr, pq, pr)); }
        if (minD < bestDist) { bestDist = minD; bestMove = { fromKey, toKey }; }
      }
    }
    if (bestMove) {
      let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
      s = dispatch(s, { type: SELECT_PIECE, key: bestMove.fromKey });
      return dispatch(s, { type: SELECT_DESTINATION, key: bestMove.toKey });
    }
  }

  return p1GreedyAgent(state);
}

// ── P2 Pawn Flood ─────────────────────────────────────────────────────────────
// Every action spawns 2 Pawns (pawn placement costs 1 action but places 2)
// on whichever free hexes sit closest to P1's King. Creates a dense advancing
// wave. Falls back to p2Greedy only when placements are impossible.

function p2PawnFloodAgent(state) {
  const player = 2;

  let p1KingKey = null;
  for (const [key, e] of state.board) {
    if (e.player === 1 && e.piece === 'K') { p1KingKey = key; break; }
  }
  if (!p1KingKey) return randomAgent(state);
  const [kq, kr] = parseKey(p1KingKey);

  const placements = getPlacementTargets(state.board, player, state.hexGrid, state.terrain);
  if (placements.length > 0) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'add' });
    s = dispatch(s, { type: SELECT_ADD_PIECE, pieceType: 'P' });

    if (s.legalMoves.length > 0) {
      // Place pawn 1 on hex closest to P1 King
      let hex1 = s.legalMoves[0];
      for (const k of s.legalMoves) {
        const [q, r] = parseKey(k);
        const [bq, br] = parseKey(hex1);
        if (hexDist(q, r, kq, kr) < hexDist(bq, br, kq, kr)) hex1 = k;
      }
      s = dispatch(s, { type: SELECT_DESTINATION, key: hex1 });

      // Place pawn 2 on hex closest to P1 King from updated placements
      if (s.legalMoves.length > 0) {
        let hex2 = s.legalMoves[0];
        for (const k of s.legalMoves) {
          const [q, r] = parseKey(k);
          const [bq, br] = parseKey(hex2);
          if (hexDist(q, r, kq, kr) < hexDist(bq, br, kq, kr)) hex2 = k;
        }
        s = dispatch(s, { type: SELECT_DESTINATION, key: hex2 });
      }
      return s;
    }
  }

  return p2GreedyAgent(state);
}

// ── P2 Fog Stalker ────────────────────────────────────────────────────────────
// Phase 1 (P1 King not yet in fog-of-war vision): spread pieces to maximise
// newly revealed hexes each action — like a sensor sweep.
// Phase 2 (P1 King visible): switch to p2Greedy to converge instantly.

function p2FogStalkerAgent(state) {
  const player = 2;

  const visibleHexes = getP2VisibleHexes(state.board);

  // Phase 2 check — is P1 King already visible?
  let p1KingKey = null;
  for (const [key, e] of state.board) {
    if (e.player === 1 && e.piece === 'K') { p1KingKey = key; break; }
  }
  if (p1KingKey && visibleHexes.has(p1KingKey)) {
    return p2GreedyAgent(state);
  }

  // Phase 1 — move piece that reveals the most new hexes
  const movable = [...state.board.entries()].filter(
    ([k, e]) => e.player === player &&
      getLegalMoves(k, state.board, player, state.terrain).length > 0
  );

  // Score a hex by how many grid hexes it reveals that aren't already visible
  const revealScore = (toKey) => {
    let score = visibleHexes.has(toKey) ? 0 : 1;
    const [tq, tr] = parseKey(toKey);
    for (const [dq, dr] of HEX_DIRS) {
      const nk = hexKey(tq + dq, tr + dr);
      if (state.hexGrid.has(nk) && !visibleHexes.has(nk)) score++;
    }
    return score;
  };

  let bestMove = null, bestScore = -1;
  for (const [fromKey] of movable) {
    const moves = getLegalMoves(fromKey, state.board, player, state.terrain);
    for (const toKey of moves) {
      const score = revealScore(toKey);
      if (score > bestScore) { bestScore = score; bestMove = { fromKey, toKey }; }
    }
  }

  if (bestMove && bestScore > 0) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
    s = dispatch(s, { type: SELECT_PIECE, key: bestMove.fromKey });
    return dispatch(s, { type: SELECT_DESTINATION, key: bestMove.toKey });
  }

  // Can't improve coverage by moving — add a piece on hex with best reveal score
  const placements = getPlacementTargets(state.board, player, state.hexGrid, state.terrain);
  if (placements.length > 0) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'add' });
    s = dispatch(s, { type: SELECT_ADD_PIECE, pieceType: 'P' });
    if (s.legalMoves.length > 0) {
      let bestHex = s.legalMoves[0], bestRev = -1;
      for (const k of s.legalMoves) {
        const sc = revealScore(k);
        if (sc > bestRev) { bestRev = sc; bestHex = k; }
      }
      s = dispatch(s, { type: SELECT_DESTINATION, key: bestHex });
      // Place pawn 2
      if (s.legalMoves.length > 0) {
        let bestHex2 = s.legalMoves[0], bestRev2 = -1;
        for (const k of s.legalMoves) {
          const sc = revealScore(k);
          if (sc > bestRev2) { bestRev2 = sc; bestHex2 = k; }
        }
        s = dispatch(s, { type: SELECT_DESTINATION, key: bestHex2 });
      }
      return s;
    }
  }

  return p2GreedyAgent(state);
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

// ── P2 Rook Charger ───────────────────────────────────────────────────────────
// Deploys a Rook as soon as possible, then slides it directly toward P1's King.
// The King cannot capture the Rook (Rook capture rule), so the King must flee.
// Falls back to p2Greedy once the Rook is adjacent or if no Rook exists yet.

function p2RookChargerAgent(state) {
  const player = 2;

  let p1KingKey = null;
  for (const [key, e] of state.board) {
    if (e.player === 1 && e.piece === 'K') { p1KingKey = key; break; }
  }
  if (!p1KingKey) return randomAgent(state);
  const [kq, kr] = parseKey(p1KingKey);

  // Deploy a Rook if we don't have one yet
  const rookKey = [...state.board.entries()].find(([, e]) => e.player === 2 && e.piece === 'R')?.[0] ?? null;
  if (!rookKey) {
    const placements = getPlacementTargets(state.board, player, state.hexGrid, state.terrain);
    if (placements.length > 0) {
      let s = dispatch(state, { type: START_ACTION, actionType: 'add' });
      s = dispatch(s, { type: SELECT_ADD_PIECE, pieceType: 'R' });
      if (s.legalMoves.length > 0) {
        // Place Rook on hex closest to P1 King
        let best = s.legalMoves[0];
        for (const k of s.legalMoves) {
          const [q, r] = parseKey(k);
          const [bq, br] = parseKey(best);
          if (hexDist(q, r, kq, kr) < hexDist(bq, br, kq, kr)) best = k;
        }
        return dispatch(s, { type: SELECT_DESTINATION, key: best });
      }
    }
  }

  // Rook exists — slide it toward P1 King
  if (rookKey) {
    const moves = getLegalMoves(rookKey, state.board, player, state.terrain);
    if (moves.length > 0) {
      let best = moves[0], bestDist = Infinity;
      for (const toKey of moves) {
        const [tq, tr] = parseKey(toKey);
        const d = hexDist(tq, tr, kq, kr);
        if (d < bestDist) { bestDist = d; best = toKey; }
      }
      let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
      s = dispatch(s, { type: SELECT_PIECE, key: rookKey });
      return dispatch(s, { type: SELECT_DESTINATION, key: best });
    }
  }

  return p2GreedyAgent(state);
}

// ── P1 Rook Shield ────────────────────────────────────────────────────────────
// Deploys a Rook between the King and the nearest P2 Queen, then excavates.
// Since Queens can't capture Rooks, this blocks the Queen's main attack lane.
// Falls back to p1Greedy once shielded.

function p1RookShieldAgent(state) {
  const player = 1;

  // Find P1 King
  let kingKey = null;
  for (const [key, e] of state.board) {
    if (e.player === 1 && e.piece === 'K') { kingKey = key; break; }
  }
  if (!kingKey) return p1GreedyAgent(state);
  const [kq, kr] = parseKey(kingKey);

  // Is there a P2 Queen threatening us?
  const p2Queens = [...state.board.entries()].filter(([, e]) => e.player === 2 && e.piece === 'Q');
  const p1Rooks  = [...state.board.entries()].filter(([, e]) => e.player === 1 && e.piece === 'R');

  // Deploy a Rook if no P1 Rook yet and a P2 Queen exists
  if (p1Rooks.length === 0 && p2Queens.length > 0) {
    const placements = getPlacementTargets(state.board, player, state.hexGrid, state.terrain);
    if (placements.length > 0) {
      const [p2QKey] = p2Queens[0];
      const [p2qq, p2qr] = parseKey(p2QKey);
      let s = dispatch(state, { type: START_ACTION, actionType: 'add' });
      s = dispatch(s, { type: SELECT_ADD_PIECE, pieceType: 'R' });
      if (s.legalMoves.length > 0) {
        // Place Rook on the hex between King and enemy Queen (minimise dist to Queen while staying close to King)
        let best = s.legalMoves[0], bestScore = -Infinity;
        for (const k of s.legalMoves) {
          const [q, r] = parseKey(k);
          const dKing  = hexDist(q, r, kq, kr);
          const dQueen = hexDist(q, r, p2qq, p2qr);
          // Prefer close to King but also in the direction of the Queen
          const score = -dKing - dQueen * 0.5;
          if (score > bestScore) { bestScore = score; best = k; }
        }
        return dispatch(s, { type: SELECT_DESTINATION, key: best });
      }
    }
  }

  // Rook is deployed — move it toward the nearest P2 Queen to stay in the lane
  if (p1Rooks.length > 0 && p2Queens.length > 0) {
    const [p2QKey] = p2Queens[0];
    const [p2qq, p2qr] = parseKey(p2QKey);
    const [rookKey] = p1Rooks[0];
    const rookMoves = getLegalMoves(rookKey, state.board, player, state.terrain);
    if (rookMoves.length > 0) {
      let best = rookMoves[0], bestDist = Infinity;
      for (const toKey of rookMoves) {
        const [tq, tr] = parseKey(toKey);
        const d = hexDist(tq, tr, p2qq, p2qr);
        if (d < bestDist) { bestDist = d; best = toKey; }
      }
      // Only reposition if it gets meaningfully closer
      const [rq, rr] = parseKey(rookKey);
      if (hexDist(rq, rr, p2qq, p2qr) > bestDist) {
        let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
        s = dispatch(s, { type: SELECT_PIECE, key: rookKey });
        return dispatch(s, { type: SELECT_DESTINATION, key: best });
      }
    }
  }

  return p1GreedyAgent(state);
}

// ── P2 Rook Vanguard ──────────────────────────────────────────────────────────
// Three-phase Rook+Queen coordination:
//   1. Deploy Rook as far forward as possible toward P1 King.
//   2. Deploy Queen adjacent to the Rook (behind it, using it as a screen).
//   3. Rook sweeps ahead — captures any P1 Pawn or Queen it can reach, then
//      advances; Queen follows and delivers the kill (only Queen can take the King).
// The Rook's immunity to the King forces P1 to spend Pawn actions removing it,
// buying time for the Queen to slide through the cleared lane.

function p2RookVanguardAgent(state) {
  const player = 2;

  let p1KingKey = null;
  for (const [key, e] of state.board) {
    if (e.player === 1 && e.piece === 'K') { p1KingKey = key; break; }
  }
  if (!p1KingKey) return randomAgent(state);
  const [kq, kr] = parseKey(p1KingKey);

  let rookKey = null;
  for (const [key, e] of state.board) {
    if (e.player === 2 && e.piece === 'R') { rookKey = key; break; }
  }
  let queenKey = null;
  for (const [key, e] of state.board) {
    if (e.player === 2 && e.piece === 'Q' && (e.frozenTurns ?? 0) === 0) { queenKey = key; break; }
  }
  const hasAnyQueen = [...state.board.values()].some(e => e.player === 2 && e.piece === 'Q');

  // Phase 1: no Rook — deploy it as close to P1 King as possible
  if (!rookKey) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'add' });
    s = dispatch(s, { type: SELECT_ADD_PIECE, pieceType: 'R' });
    if (s.legalMoves.length > 0) {
      let best = s.legalMoves[0], bestDist = Infinity;
      for (const k of s.legalMoves) {
        const [q, r] = parseKey(k);
        const d = hexDist(q, r, kq, kr);
        if (d < bestDist) { bestDist = d; best = k; }
      }
      return dispatch(s, { type: SELECT_DESTINATION, key: best });
    }
    return p2GreedyAgent(state);
  }

  // Phase 2: have Rook but no Queen — deploy Queen closest to Rook (just behind it)
  if (!hasAnyQueen) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'add' });
    s = dispatch(s, { type: SELECT_ADD_PIECE, pieceType: 'Q' });
    if (s.legalMoves.length > 0) {
      const [rq, rr] = parseKey(rookKey);
      let best = s.legalMoves[0], bestDist = Infinity;
      for (const k of s.legalMoves) {
        const [q, r] = parseKey(k);
        const d = hexDist(q, r, rq, rr);
        if (d < bestDist) { bestDist = d; best = k; }
      }
      return dispatch(s, { type: SELECT_DESTINATION, key: best });
    }
  }

  // Phase 3a: Rook captures any P1 Pawn or Queen in its slide range
  if (rookKey) {
    const rookMoves = getLegalMoves(rookKey, state.board, player, state.terrain);
    for (const toKey of rookMoves) {
      const res = state.board.get(toKey);
      if (res && res.player === 1 && (res.piece === 'P' || res.piece === 'Q')) {
        let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
        s = dispatch(s, { type: SELECT_PIECE, key: rookKey });
        return dispatch(s, { type: SELECT_DESTINATION, key: toKey });
      }
    }
    // Phase 3b: advance Rook toward King (King can't capture it — forces King to flee)
    const [rq, rr] = parseKey(rookKey);
    const rookDistToKing = hexDist(rq, rr, kq, kr);
    if (rookDistToKing > 1 && rookMoves.length > 0) {
      let best = rookMoves[0], bestDist = Infinity;
      for (const toKey of rookMoves) {
        const [tq, tr] = parseKey(toKey);
        const d = hexDist(tq, tr, kq, kr);
        if (d < bestDist) { bestDist = d; best = toKey; }
      }
      if (bestDist < rookDistToKing) {
        let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
        s = dispatch(s, { type: SELECT_PIECE, key: rookKey });
        return dispatch(s, { type: SELECT_DESTINATION, key: best });
      }
    }
  }

  // Phase 3c: Queen captures King or advances toward it
  if (queenKey) {
    const queenMoves = getLegalMoves(queenKey, state.board, player, state.terrain);
    if (queenMoves.includes(p1KingKey)) {
      let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
      s = dispatch(s, { type: SELECT_PIECE, key: queenKey });
      return dispatch(s, { type: SELECT_DESTINATION, key: p1KingKey });
    }
    if (queenMoves.length > 0) {
      let best = queenMoves[0], bestDist = Infinity;
      for (const toKey of queenMoves) {
        const [tq, tr] = parseKey(toKey);
        const d = hexDist(tq, tr, kq, kr);
        if (d < bestDist) { bestDist = d; best = toKey; }
      }
      let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
      s = dispatch(s, { type: SELECT_PIECE, key: queenKey });
      return dispatch(s, { type: SELECT_DESTINATION, key: best });
    }
  }

  return p2GreedyAgent(state);
}

// ── P2 Pawn Screen + Rook Finisher ────────────────────────────────────────────
// Phase 1: flood SCREEN_SIZE Pawns toward P1 King, drawing out P1's defenders.
// Phase 2: deploy a Rook once the Pawn wave is committed.
// Phase 3: Rook hunts P1 Pawns specifically — they're the only pieces that can
//          capture the Rook, so eliminating them makes the Rook permanently safe.
// Phase 4: P1 Pawn-free board; all remaining P2 pieces converge on King.

const SCREEN_SIZE = 4;

function p2PawnScreenRookAgent(state) {
  const player = 2;

  let p1KingKey = null;
  for (const [key, e] of state.board) {
    if (e.player === 1 && e.piece === 'K') { p1KingKey = key; break; }
  }
  if (!p1KingKey) return randomAgent(state);
  const [kq, kr] = parseKey(p1KingKey);

  const ownPawns = [...state.board.entries()].filter(([, e]) => e.player === 2 && e.piece === 'P');
  const hasRook  = [...state.board.values()].some(e => e.player === 2 && e.piece === 'R');
  const p1Pawns  = [...state.board.entries()].filter(([, e]) => e.player === 1 && e.piece === 'P');

  // Phase 1: build the Pawn screen
  if (ownPawns.length < SCREEN_SIZE) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'add' });
    s = dispatch(s, { type: SELECT_ADD_PIECE, pieceType: 'P' });
    if (s.legalMoves.length > 0) {
      let hex1 = s.legalMoves[0], bestD1 = Infinity;
      for (const k of s.legalMoves) {
        const [q, r] = parseKey(k);
        const d = hexDist(q, r, kq, kr);
        if (d < bestD1) { bestD1 = d; hex1 = k; }
      }
      s = dispatch(s, { type: SELECT_DESTINATION, key: hex1 });
      if (s.legalMoves.length > 0) {
        let hex2 = s.legalMoves[0], bestD2 = Infinity;
        for (const k of s.legalMoves) {
          const [q, r] = parseKey(k);
          const d = hexDist(q, r, kq, kr);
          if (d < bestD2) { bestD2 = d; hex2 = k; }
        }
        s = dispatch(s, { type: SELECT_DESTINATION, key: hex2 });
      }
      return s;
    }
  }

  // Phase 2: Pawn screen is up — deploy the Rook
  if (!hasRook) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'add' });
    s = dispatch(s, { type: SELECT_ADD_PIECE, pieceType: 'R' });
    if (s.legalMoves.length > 0) {
      let best = s.legalMoves[0], bestDist = Infinity;
      for (const k of s.legalMoves) {
        const [q, r] = parseKey(k);
        const d = hexDist(q, r, kq, kr);
        if (d < bestDist) { bestDist = d; best = k; }
      }
      return dispatch(s, { type: SELECT_DESTINATION, key: best });
    }
  }

  // Phase 3: Rook hunts P1 Pawns
  if (hasRook && p1Pawns.length > 0) {
    let rookKey = null;
    for (const [key, e] of state.board) {
      if (e.player === 2 && e.piece === 'R') { rookKey = key; break; }
    }
    if (rookKey) {
      const rookMoves = getLegalMoves(rookKey, state.board, player, state.terrain);
      // Capture a P1 Pawn in range
      for (const toKey of rookMoves) {
        const res = state.board.get(toKey);
        if (res && res.player === 1 && res.piece === 'P') {
          let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
          s = dispatch(s, { type: SELECT_PIECE, key: rookKey });
          return dispatch(s, { type: SELECT_DESTINATION, key: toKey });
        }
      }
      // Advance Rook toward nearest P1 Pawn
      const [rq, rr] = parseKey(rookKey);
      let nearestPawnKey = p1Pawns[0][0], nearestPawnDist = Infinity;
      for (const [pk] of p1Pawns) {
        const [pq, pr] = parseKey(pk);
        const d = hexDist(rq, rr, pq, pr);
        if (d < nearestPawnDist) { nearestPawnDist = d; nearestPawnKey = pk; }
      }
      const [npq, npr] = parseKey(nearestPawnKey);
      if (rookMoves.length > 0) {
        let best = rookMoves[0], bestDist = Infinity;
        for (const toKey of rookMoves) {
          const [tq, tr] = parseKey(toKey);
          const d = hexDist(tq, tr, npq, npr);
          if (d < bestDist) { bestDist = d; best = toKey; }
        }
        if (bestDist < nearestPawnDist) {
          let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
          s = dispatch(s, { type: SELECT_PIECE, key: rookKey });
          return dispatch(s, { type: SELECT_DESTINATION, key: best });
        }
      }
    }
  }

  // Phase 4: P1 Pawns gone — converge on King
  return p2GreedyAgent(state);
}

// ── P1 Rook Corridor ──────────────────────────────────────────────────────────
// Proactive Rook+Queen pairing:
//   1. Deploy Rook toward the midpoint between P1 King and the nearest P2 piece,
//      creating an intercept position before P2 can close in.
//   2. Deploy a Queen toward the artifact middle band.
//   3. Rook repositions each turn to stay between P2's Queen and P1's King —
//      since P2's Queen can't slide through or capture the P1 Rook, P2 must
//      spend a Pawn action to remove it, giving P1's Queen more excavation time.
//   4. Queen excavates greedily; move it toward the middle band if idle.

function p1RookCorridorAgent(state) {
  const player = 1;

  let kingKey = null;
  for (const [key, e] of state.board) {
    if (e.player === 1 && e.piece === 'K') { kingKey = key; break; }
  }
  if (!kingKey) return p1GreedyAgent(state);
  const [kq, kr] = parseKey(kingKey);

  let p1RookKey = null;
  for (const [key, e] of state.board) {
    if (e.player === 1 && e.piece === 'R') { p1RookKey = key; break; }
  }
  let p1QueenKey = null;
  for (const [key, e] of state.board) {
    if (e.player === 1 && e.piece === 'Q' && (e.frozenTurns ?? 0) === 0) { p1QueenKey = key; break; }
  }
  const hasP1Queen = [...state.board.values()].some(e => e.player === 1 && e.piece === 'Q');

  const p2Queens = [...state.board.entries()].filter(([, e]) => e.player === 2 && e.piece === 'Q');

  // Phase 1: no Rook — deploy it at the midpoint between King and nearest P2 piece
  if (!p1RookKey) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'add' });
    s = dispatch(s, { type: SELECT_ADD_PIECE, pieceType: 'R' });
    if (s.legalMoves.length > 0) {
      let nearestP2Key = null, nearestDist = Infinity;
      for (const [key, e] of state.board) {
        if (e.player !== 2) continue;
        const [q, r] = parseKey(key);
        const d = hexDist(q, r, kq, kr);
        if (d < nearestDist) { nearestDist = d; nearestP2Key = key; }
      }
      let best = s.legalMoves[0];
      if (nearestP2Key) {
        const [p2q, p2r] = parseKey(nearestP2Key);
        const midQ = Math.round((kq + p2q) / 2);
        const midR = Math.round((kr + p2r) / 2);
        let bestDist = Infinity;
        for (const k of s.legalMoves) {
          const [q, r] = parseKey(k);
          const d = hexDist(q, r, midQ, midR);
          if (d < bestDist) { bestDist = d; best = k; }
        }
      }
      return dispatch(s, { type: SELECT_DESTINATION, key: best });
    }
    return p1GreedyAgent(state);
  }

  // Phase 2: have Rook, no Queen — deploy Queen toward the middle artifact band
  if (!hasP1Queen) {
    let s = dispatch(state, { type: START_ACTION, actionType: 'add' });
    s = dispatch(s, { type: SELECT_ADD_PIECE, pieceType: 'Q' });
    if (s.legalMoves.length > 0) {
      let best = s.legalMoves[0], bestScore = Infinity;
      for (const k of s.legalMoves) {
        const [, r] = parseKey(k);
        if (Math.abs(r) < bestScore) { bestScore = Math.abs(r); best = k; }
      }
      return dispatch(s, { type: SELECT_DESTINATION, key: best });
    }
  }

  // Phase 3a: Rook intercepts the nearest P2 Queen — move toward it to block its lane
  if (p1RookKey && p2Queens.length > 0) {
    const [rq, rr] = parseKey(p1RookKey);
    let nearestQKey = p2Queens[0][0], nearestQDist = Infinity;
    for (const [qk] of p2Queens) {
      const [q, r] = parseKey(qk);
      const d = hexDist(q, r, rq, rr);
      if (d < nearestQDist) { nearestQDist = d; nearestQKey = qk; }
    }
    const [p2qq, p2qr] = parseKey(nearestQKey);
    const rookMoves = getLegalMoves(p1RookKey, state.board, player, state.terrain);
    if (rookMoves.length > 0 && nearestQDist > 2) {
      let best = rookMoves[0], bestDist = Infinity;
      for (const toKey of rookMoves) {
        const [tq, tr] = parseKey(toKey);
        const d = hexDist(tq, tr, p2qq, p2qr);
        if (d < bestDist) { bestDist = d; best = toKey; }
      }
      if (bestDist < nearestQDist) {
        let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
        s = dispatch(s, { type: SELECT_PIECE, key: p1RookKey });
        return dispatch(s, { type: SELECT_DESTINATION, key: best });
      }
    }
  }

  // Phase 3b: Queen excavates greedily, or moves toward the middle band
  if (p1QueenKey) {
    const excavTargets = getExcavationTargets(state.board, player, state.hexGrid)
      .filter(k => !state.excavated.has(k));
    const hit = excavTargets.find(k => state.artifacts.has(k));
    if (hit) {
      let s = dispatch(state, { type: START_ACTION, actionType: 'excavate' });
      return dispatch(s, { type: EXCAVATE_HEX, key: hit });
    }
    if (excavTargets.length > 0) {
      let s = dispatch(state, { type: START_ACTION, actionType: 'excavate' });
      return dispatch(s, { type: EXCAVATE_HEX, key: excavTargets[0] });
    }
    // No excavation targets near Queen — advance Queen toward middle band
    const queenMoves = getLegalMoves(p1QueenKey, state.board, player, state.terrain);
    if (queenMoves.length > 0) {
      const [, curR] = parseKey(p1QueenKey);
      let best = queenMoves[0], bestScore = Infinity;
      for (const toKey of queenMoves) {
        const [, r] = parseKey(toKey);
        if (Math.abs(r) < bestScore) { bestScore = Math.abs(r); best = toKey; }
      }
      if (Math.abs(parseKey(best)[1]) < Math.abs(curR)) {
        let s = dispatch(state, { type: START_ACTION, actionType: 'move' });
        s = dispatch(s, { type: SELECT_PIECE, key: p1QueenKey });
        return dispatch(s, { type: SELECT_DESTINATION, key: best });
      }
    }
  }

  return p1GreedyAgent(state);
}

// ── Entry point ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const N = parseInt(args.find(a => a.startsWith('--games='))?.split('=')[1] ?? '200');
const verbose = args.includes('--verbose');

console.log(`\nHex Game AI Simulation`);
console.log(`Games per matchup: ${N}`);
console.log(`\nAgents:`);
console.log(`  random          — uniform random action selection`);
console.log(`  p1-greedy       — P1 always excavates, then moves toward artifacts`);
console.log(`  p1-defensive    — p1-greedy + evades when P2 is within ${THREAT_DIST} hexes of king`);
console.log(`  p1-scry-oracle  — scry first each turn, then step King toward caret direction`);
console.log(`  p1-bishop-sweep — deploy a Queen and sweep the middle artifact band`);
console.log(`  p1-turtle       — build a pawn wall north of King, excavate from safety`);
console.log(`  p1-king-hunter  — build Q+Pawns strike force and march toward P2`);
console.log(`  p2-greedy       — P2 captures king if reachable, else closes distance`);
console.log(`  p2-balanced     — p2-greedy + adds Pawns when piece count < 5`);
console.log(`  p2-pawn-flood   — always spawns 2 Pawns per action aimed at P1 King`);
console.log(`  p2-fog-stalker  — spread to maximise fog coverage, converge when P1 spotted`);
console.log(`  p2-rook-charger    — deploy a Rook and march it at P1 King (King can't capture Rooks)`);
console.log(`  p1-rook-shield     — deploy a Rook to block P2 Queen lanes, then excavate`);
console.log(`  p2-rook-vanguard   — Rook+Queen: Rook clears P1 Pawns/Queens, Queen follows for the kill`);
console.log(`  p2-pawn-screen-rook— flood Pawns first, then Rook to eliminate P1 Pawns, then converge`);
console.log(`  p1-rook-corridor   — Rook+Queen: Rook intercepts P2 Queens, Queen excavates behind`);

// ── Baseline matchups (existing) ──────────────────────────────────────────────
runBatch(N, p1GreedyAgent,      p2GreedyAgent,      'p1-greedy       vs p2-greedy    (baseline)', verbose);
runBatch(N, p1DefensiveAgent,   p2GreedyAgent,      'p1-defensive    vs p2-greedy',               verbose);
runBatch(N, p1GreedyAgent,      p2BalancedAgent,    'p1-greedy       vs p2-balanced',             verbose);
runBatch(N, p1DefensiveAgent,   p2BalancedAgent,    'p1-defensive    vs p2-balanced',             verbose);

// ── New P1 strategies vs established P2 agents ────────────────────────────────
runBatch(N, p1ScryOracleAgent,  p2GreedyAgent,      'p1-scry-oracle  vs p2-greedy',               verbose);
runBatch(N, p1ScryOracleAgent,  p2BalancedAgent,    'p1-scry-oracle  vs p2-balanced',             verbose);
runBatch(N, p1BishopSweeperAgent, p2GreedyAgent,    'p1-bishop-sweep vs p2-greedy',               verbose);
runBatch(N, p1BishopSweeperAgent, p2BalancedAgent,  'p1-bishop-sweep vs p2-balanced',             verbose);
runBatch(N, p1TurtleAgent,      p2GreedyAgent,      'p1-turtle       vs p2-greedy',               verbose);
runBatch(N, p1TurtleAgent,      p2BalancedAgent,    'p1-turtle       vs p2-balanced',             verbose);
runBatch(N, p1KingHunterAgent,  p2GreedyAgent,      'p1-king-hunter  vs p2-greedy',               verbose);
runBatch(N, p1KingHunterAgent,  p2BalancedAgent,    'p1-king-hunter  vs p2-balanced',             verbose);

// ── New P2 strategies vs established P1 agents ────────────────────────────────
runBatch(N, p1GreedyAgent,      p2PawnFloodAgent,   'p1-greedy       vs p2-pawn-flood',           verbose);
runBatch(N, p1DefensiveAgent,   p2PawnFloodAgent,   'p1-defensive    vs p2-pawn-flood',           verbose);
runBatch(N, p1GreedyAgent,      p2FogStalkerAgent,  'p1-greedy       vs p2-fog-stalker',          verbose);
runBatch(N, p1DefensiveAgent,   p2FogStalkerAgent,  'p1-defensive    vs p2-fog-stalker',          verbose);

// ── Key cross-matchups (new P1 vs new P2) ─────────────────────────────────────
runBatch(N, p1TurtleAgent,      p2PawnFloodAgent,   'p1-turtle       vs p2-pawn-flood  (wall v wave)', verbose);
runBatch(N, p1KingHunterAgent,  p2PawnFloodAgent,   'p1-king-hunter  vs p2-pawn-flood  (disrupt v flood)', verbose);
runBatch(N, p1ScryOracleAgent,  p2FogStalkerAgent,  'p1-scry-oracle  vs p2-fog-stalker (info duel)',   verbose);
runBatch(N, p1BishopSweeperAgent, p2FogStalkerAgent,'p1-bishop-sweep vs p2-fog-stalker (speed v search)', verbose);

// ── Rook matchups ──────────────────────────────────────────────────────────────
runBatch(N, p1GreedyAgent,       p2RookChargerAgent, 'p1-greedy       vs p2-rook-charger (king-immune attacker)', verbose);
runBatch(N, p1DefensiveAgent,    p2RookChargerAgent, 'p1-defensive    vs p2-rook-charger',                        verbose);
runBatch(N, p1RookShieldAgent,   p2GreedyAgent,      'p1-rook-shield  vs p2-greedy       (blocker v rusher)',     verbose);
runBatch(N, p1RookShieldAgent,   p2RookChargerAgent, 'p1-rook-shield  vs p2-rook-charger (rook duel)',            verbose);
runBatch(N, p1TurtleAgent,       p2RookChargerAgent, 'p1-turtle       vs p2-rook-charger',                           verbose);

// ── Rook coordination matchups ─────────────────────────────────────────────────
runBatch(N, p1GreedyAgent,       p2RookVanguardAgent,    'p1-greedy       vs p2-rook-vanguard   (vanguard v passive)',   verbose);
runBatch(N, p1DefensiveAgent,    p2RookVanguardAgent,    'p1-defensive    vs p2-rook-vanguard',                         verbose);
runBatch(N, p1TurtleAgent,       p2RookVanguardAgent,    'p1-turtle       vs p2-rook-vanguard   (wall v vanguard)',      verbose);
runBatch(N, p1GreedyAgent,       p2PawnScreenRookAgent,  'p1-greedy       vs p2-pawn-screen-rook',                      verbose);
runBatch(N, p1TurtleAgent,       p2PawnScreenRookAgent,  'p1-turtle       vs p2-pawn-screen-rook (wall v screen)',       verbose);
runBatch(N, p1RookCorridorAgent, p2GreedyAgent,          'p1-rook-corridor vs p2-greedy          (corridor v rusher)',   verbose);
runBatch(N, p1RookCorridorAgent, p2BalancedAgent,        'p1-rook-corridor vs p2-balanced',                             verbose);
runBatch(N, p1RookCorridorAgent, p2RookVanguardAgent,    'p1-rook-corridor vs p2-rook-vanguard   (rook duel)',           verbose);
runBatch(N, p1RookCorridorAgent, p2PawnScreenRookAgent,  'p1-rook-corridor vs p2-pawn-screen-rook',                     verbose);
