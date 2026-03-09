// HexGameEngine — pure functions, no mutation
// Piece codes: 'K' King, 'Q' Queen, 'R' Rook, 'B' Bishop, 'N' Knight, 'P' Pawn
// board: Map<hexKey, { piece, player, justAdded? }>
// player: 1 | 2

import {
  DIRECTIONS, BISHOP_DIRECTIONS, KNIGHT_MOVES,
  hexKey, parseKey, isValid, buildHexGrid, hexDist,
} from './hexMath';

// ── Movement ─────────────────────────────────────────────────────────────────

export function getLegalMoves(fromKey, board, player) {
  const entry = board.get(fromKey);
  if (!entry || entry.player !== player) return [];
  // Queens added this turn cannot move
  if (entry.piece === 'Q' && entry.justAdded) return [];
  const [q, r] = parseKey(fromKey);
  switch (entry.piece) {
    case 'K': return kingMoves(q, r, board, player);
    case 'Q': return queenMoves(q, r, board, player);
    case 'R': return rookMoves(q, r, board, player);
    case 'B': return bishopMoves(q, r, board, player);
    case 'N': return knightMoves(q, r, board, player);
    case 'P': return pawnMoves(q, r, board, player);
    default:  return [];
  }
}

function slide(q, r, board, player, dirs) {
  const moves = [];
  for (const [dq, dr] of dirs) {
    let nq = q + dq, nr = r + dr;
    while (isValid(nq, nr)) {
      const key = hexKey(nq, nr);
      const target = board.get(key);
      if (target) {
        if (target.player !== player) moves.push(key); // capture enemy
        break; // blocked regardless
      }
      moves.push(key);
      nq += dq; nr += dr;
    }
  }
  return moves;
}

function kingMoves(q, r, board, player) {
  return DIRECTIONS
    .map(([dq, dr]) => hexKey(q + dq, r + dr))
    .filter(k => {
      const [nq, nr] = parseKey(k);
      if (!isValid(nq, nr)) return false;
      const t = board.get(k);
      return !t || t.player !== player;
    });
}

function rookMoves(q, r, board, player)   { return slide(q, r, board, player, DIRECTIONS); }
function bishopMoves(q, r, board, player) { return slide(q, r, board, player, BISHOP_DIRECTIONS); }
function queenMoves(q, r, board, player)  {
  return [...slide(q, r, board, player, DIRECTIONS), ...slide(q, r, board, player, BISHOP_DIRECTIONS)];
}

function knightMoves(q, r, board, player) {
  return KNIGHT_MOVES
    .map(([dq, dr]) => hexKey(q + dq, r + dr))
    .filter(k => {
      const [nq, nr] = parseKey(k);
      if (!isValid(nq, nr)) return false;
      const t = board.get(k);
      return !t || t.player !== player;
    });
}

// P1 moves north (r−): forward (0,−1), captures (1,−1) and (−1,0)
// P2 moves south (r+): forward (0,+1), captures (1,0) and (−1,+1)
function pawnMoves(q, r, board, player) {
  const moves = [];
  const [fq, fr] = player === 1 ? [0, -1] : [0, 1];
  const caps = player === 1 ? [[1, -1], [-1, 0]] : [[1, 0], [-1, 1]];

  // Forward (non-capture)
  if (isValid(q + fq, r + fr) && !board.has(hexKey(q + fq, r + fr))) {
    moves.push(hexKey(q + fq, r + fr));
  }
  // Diagonal captures
  for (const [dq, dr] of caps) {
    const cq = q + dq, cr = r + dr;
    if (!isValid(cq, cr)) continue;
    const t = board.get(hexKey(cq, cr));
    if (t && t.player !== player) moves.push(hexKey(cq, cr));
  }
  return moves;
}

// ── Placement ─────────────────────────────────────────────────────────────────

// All empty hexes adjacent to any friendly piece — valid "add piece" targets
export function getPlacementTargets(board, player, hexGrid) {
  const targets = new Set();
  for (const [key, entry] of board) {
    if (entry.player !== player) continue;
    const [q, r] = parseKey(key);
    for (const [dq, dr] of DIRECTIONS) {
      const nk = hexKey(q + dq, r + dr);
      if (hexGrid.has(nk) && !board.has(nk)) targets.add(nk);
    }
  }
  return [...targets];
}

// ── Win detection ─────────────────────────────────────────────────────────────

export function checkWin(board, foundArtifacts) {
  let p1King = false;
  for (const [, e] of board) {
    if (e.player === 1 && e.piece === 'K') { p1King = true; break; }
  }
  if (!p1King) return { winner: 2, reason: "Player 2 captured the King!" };
  if (foundArtifacts >= 3) return { winner: 1, reason: "All artifacts found!" };
  return null;
}

// ── Initial state factory ────────────────────────────────────────────────────

export function buildInitialState() {
  const hexGrid = buildHexGrid();
  const board = new Map();

  // Player 1 — south (high r)
  const p1Pieces = [
    { q: 0, r: 8, piece: 'K' },
  ];
  // Player 2 — north (low r)
  const p2Pieces = [
    { q: 0,  r: -8, piece: 'K' },
    { q: 2,  r: -8, piece: 'N' },
    { q: -1, r: -7, piece: 'P' },
    { q: 1,  r: -7, piece: 'P' },
  ];

  for (const { q, r, piece } of p1Pieces) board.set(hexKey(q, r), { piece, player: 1 });
  for (const { q, r, piece } of p2Pieces) board.set(hexKey(q, r), { piece, player: 2 });

  // 3 random artifacts in the middle band (r in [−4, 4]), not on piece positions
  const occupied = new Set(board.keys());
  const candidates = [...hexGrid].filter(k => {
    const [, r] = parseKey(k);
    return r >= -4 && r <= 4 && !occupied.has(k);
  });
  const artifacts = new Set(pickRandom(candidates, 3));

  return { hexGrid, board, artifacts };
}

function pickRandom(arr, n) {
  const copy = [...arr];
  const result = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

// ── Fog of war ────────────────────────────────────────────────────────────────

// Returns set of hexKeys visible to player 2 (distance ≤ 1 from any of their pieces)
export function getP2VisibleHexes(board) {
  const visible = new Set();
  for (const [key, entry] of board) {
    if (entry.player !== 2) continue;
    const [q, r] = parseKey(key);
    visible.add(key);
    for (const [dq, dr] of DIRECTIONS) {
      const nk = hexKey(q + dq, r + dr);
      if (isValid(q + dq, r + dr)) visible.add(nk);
    }
  }
  return visible;
}
