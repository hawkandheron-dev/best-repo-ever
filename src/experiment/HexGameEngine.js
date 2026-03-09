// HexGameEngine — pure functions, no mutation
// Piece codes: 'K' King, 'Q' Queen, 'R' Rook, 'B' Bishop, 'N' Knight, 'P' Pawn
// board: Map<hexKey, { piece, player, justAdded?, isBridge? }>
// terrain: Map<hexKey, 'mountain'|'swamp'|'water'|'bridge'>  (absent = normal)
// player: 1 | 2

import {
  DIRECTIONS, BISHOP_DIRECTIONS, KNIGHT_MOVES,
  hexKey, parseKey, isValid, buildHexGrid, hexDist,
} from './hexMath';

// ── Terrain helpers ───────────────────────────────────────────────────────────

export function terrainOf(key, terrain) {
  return terrain.get(key) ?? 'normal';
}

// Returns: 'no' | 'yes' | 'yes-stop' | 'pass-through'
function canEnter(key, board, player, terrain, pieceType) {
  const t = terrainOf(key, terrain);
  if (t === 'mountain') return 'no';
  if (t === 'water') {
    // Only Rooks can enter open water (to become a bridge)
    return pieceType === 'R' ? 'yes-stop' : 'no';
  }
  if (t === 'bridge') {
    const resident = board.get(key);
    if (!resident) return 'yes';
    if (resident.player === player) {
      // Own bridge: sliding pieces pass through; non-sliders blocked
      return 'pass-through';
    } else {
      // Enemy bridge: only Rooks can capture & replace
      return pieceType === 'R' ? 'yes-stop' : 'no';
    }
  }
  // Normal or swamp
  const resident = board.get(key);
  if (resident) {
    return resident.player === player ? 'no' : 'yes-stop'; // capture enemy
  }
  return t === 'swamp' ? 'yes-stop' : 'yes'; // swamp stops sliding
}

// ── Movement ─────────────────────────────────────────────────────────────────

export function getLegalMoves(fromKey, board, player, terrain) {
  const entry = board.get(fromKey);
  if (!entry || entry.player !== player) return [];
  if (entry.isBridge) return [];                          // bridges are immovable
  if (entry.piece === 'Q' && entry.justAdded) return [];
  const [q, r] = parseKey(fromKey);
  switch (entry.piece) {
    case 'K': return kingMoves(q, r, board, player, terrain);
    case 'Q': return queenMoves(q, r, board, player, terrain);
    case 'R': return rookMoves(q, r, board, player, terrain);
    case 'B': return bishopMoves(q, r, board, player, terrain);
    case 'N': return knightMoves(q, r, board, player, terrain);
    case 'P': return pawnMoves(q, r, board, player, terrain);
    default:  return [];
  }
}

function slide(q, r, board, player, dirs, terrain, pieceType) {
  const moves = [];
  for (const [dq, dr] of dirs) {
    let nq = q + dq, nr = r + dr;
    while (isValid(nq, nr)) {
      const key = hexKey(nq, nr);
      const result = canEnter(key, board, player, terrain, pieceType);
      if (result === 'no') break;
      if (result === 'pass-through') { nq += dq; nr += dr; continue; }
      moves.push(key);
      if (result === 'yes-stop') break;
      nq += dq; nr += dr;
    }
  }
  return moves;
}

function singleStep(q, r, offsets, board, player, terrain, pieceType) {
  return offsets
    .map(([dq, dr]) => hexKey(q + dq, r + dr))
    .filter(k => {
      const [nq, nr] = parseKey(k);
      if (!isValid(nq, nr)) return false;
      const result = canEnter(k, board, player, terrain, pieceType);
      return result === 'yes' || result === 'yes-stop';
    });
}

function kingMoves(q, r, board, player, terrain) {
  return singleStep(q, r, DIRECTIONS, board, player, terrain, 'K');
}
function rookMoves(q, r, board, player, terrain) {
  return slide(q, r, board, player, DIRECTIONS, terrain, 'R');
}
function bishopMoves(q, r, board, player, terrain) {
  return slide(q, r, board, player, BISHOP_DIRECTIONS, terrain, 'B');
}
function queenMoves(q, r, board, player, terrain) {
  return [
    ...slide(q, r, board, player, DIRECTIONS, terrain, 'Q'),
    ...slide(q, r, board, player, BISHOP_DIRECTIONS, terrain, 'Q'),
  ];
}
function knightMoves(q, r, board, player, terrain) {
  return singleStep(q, r, KNIGHT_MOVES, board, player, terrain, 'N');
}

// P1 moves north (r−): forward (0,−1), captures (1,−1) and (−1,0)
// P2 moves south (r+): forward (0,+1), captures (1,0) and (−1,+1)
function pawnMoves(q, r, board, player, terrain) {
  const moves = [];
  const [fq, fr] = player === 1 ? [0, -1] : [0, 1];
  const caps     = player === 1 ? [[1, -1], [-1, 0]] : [[1, 0], [-1, 1]];

  const fwdKey = hexKey(q + fq, r + fr);
  if (isValid(q + fq, r + fr)) {
    const t = terrainOf(fwdKey, terrain);
    if (!board.has(fwdKey) && t !== 'mountain' && t !== 'water' && t !== 'bridge') {
      moves.push(fwdKey);
    }
  }
  for (const [dq, dr] of caps) {
    const cq = q + dq, cr = r + dr;
    if (!isValid(cq, cr)) continue;
    const cKey = hexKey(cq, cr);
    const t = terrainOf(cKey, terrain);
    if (t === 'mountain' || t === 'water' || t === 'bridge') continue;
    const resident = board.get(cKey);
    if (resident && resident.player !== player) moves.push(cKey);
  }
  return moves;
}

// ── Placement ─────────────────────────────────────────────────────────────────

export function getPlacementTargets(board, player, hexGrid, terrain) {
  const targets = new Set();
  for (const [key, entry] of board) {
    if (entry.player !== player) continue;
    const [q, r] = parseKey(key);
    for (const [dq, dr] of DIRECTIONS) {
      const nk = hexKey(q + dq, r + dr);
      if (!hexGrid.has(nk) || board.has(nk)) continue;
      const t = terrainOf(nk, terrain);
      if (t !== 'mountain' && t !== 'water' && t !== 'bridge') targets.add(nk);
    }
  }
  return [...targets];
}

// ── Terrain action cost ───────────────────────────────────────────────────────

export function moveCost(toKey, terrain) {
  return terrainOf(toKey, terrain) === 'swamp' ? 2 : 1;
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

// ── Fog of war ────────────────────────────────────────────────────────────────

export function getP2VisibleHexes(board) {
  const visible = new Set();
  for (const [key, entry] of board) {
    if (entry.player !== 2) continue;
    const [q, r] = parseKey(key);
    visible.add(key);
    for (const [dq, dr] of DIRECTIONS) {
      if (isValid(q + dq, r + dr)) visible.add(hexKey(q + dq, r + dr));
    }
  }
  return visible;
}

// ── Initial state factory ────────────────────────────────────────────────────

export function buildInitialState() {
  const hexGrid = buildHexGrid();
  const board = new Map();

  // Player 1 — south (high r)
  board.set(hexKey(0, 8),   { piece: 'K', player: 1 });

  // Player 2 — north (low r)
  board.set(hexKey(0, -8),  { piece: 'K', player: 2 });
  board.set(hexKey(2, -8),  { piece: 'N', player: 2 });
  board.set(hexKey(-1, -7), { piece: 'P', player: 2 });
  board.set(hexKey(1, -7),  { piece: 'P', player: 2 });

  // Protected zones: radius-3 around each starting cluster — no terrain placed there
  const protectedZone = new Set(board.keys());
  for (const [sq, sr] of [[0, 8], [0, -8]]) {
    for (const k of hexGrid) {
      const [q, r] = parseKey(k);
      if (hexDist(q, r, sq, sr) <= 3) protectedZone.add(k);
    }
  }

  // Generate terrain
  const terrain = new Map();
  for (const key of hexGrid) {
    if (protectedZone.has(key)) continue;
    const [, r] = parseKey(key);
    const inMiddle = Math.abs(r) <= 3;
    const roll = Math.random();
    const mtn   = inMiddle ? 0.07 : 0.18;
    const water = inMiddle ? 0.07 : 0.14;
    const swamp = inMiddle ? 0.08 : 0.10;
    if      (roll < mtn)              terrain.set(key, 'mountain');
    else if (roll < mtn + water)      terrain.set(key, 'water');
    else if (roll < mtn + water + swamp) terrain.set(key, 'swamp');
  }

  // Artifacts: middle band, only on normal (unset) terrain
  const occupied = new Set(board.keys());
  const candidates = [...hexGrid].filter(k => {
    const [, r] = parseKey(k);
    return Math.abs(r) <= 4 && !occupied.has(k) && !terrain.has(k);
  });
  const artifacts = new Set(pickRandom(candidates, 3));

  return { hexGrid, board, artifacts, terrain };
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
