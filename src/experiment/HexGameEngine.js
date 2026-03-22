// HexGameEngine — pure functions, no mutation
// Piece codes: 'K' King, 'Q' Queen, 'P' Pawn, 'R' Rook
// board: Map<hexKey, { piece, player, frozenTurns? }>
// terrain: Map<hexKey, 'mountain'>  (absent = normal)
// player: 1 | 2
//
// Rook rules:
//   • Slides in all 6 hex directions like a Queen
//   • Can only be captured by Pawns (Queens and Kings are blocked by enemy Rooks)
//   • Cannot capture a King
//   • Neither player starts with Rooks; must be deployed via Add Piece

import {
  DIRECTIONS,
  hexKey, parseKey, isValid, buildHexGrid, hexDist,
} from './hexMath';

// ── Terrain helpers ───────────────────────────────────────────────────────────

export function terrainOf(key, terrain) {
  return terrain.get(key) ?? 'normal';
}

// Returns: 'no' | 'yes' | 'yes-stop'
// movingPiece: piece code of the piece being moved (for capture-rule checks)
function canEnter(key, board, player, terrain, movingPiece = null) {
  if (terrainOf(key, terrain) === 'mountain') return 'no';
  const resident = board.get(key);
  if (!resident) return 'yes';
  if (resident.player === player) return 'no';
  // Enemy Rook: only Pawns can capture it; everyone else is blocked
  if (resident.piece === 'R') return movingPiece === 'P' ? 'yes-stop' : 'no';
  // Rook cannot capture the King
  if (movingPiece === 'R' && resident.piece === 'K') return 'no';
  return 'yes-stop';
}

// ── Movement ─────────────────────────────────────────────────────────────────

export function getLegalMoves(fromKey, board, player, terrain) {
  const entry = board.get(fromKey);
  if (!entry || entry.player !== player) return [];
  if (entry.piece === 'Q' && (entry.frozenTurns ?? 0) > 0) return [];
  const [q, r] = parseKey(fromKey);
  switch (entry.piece) {
    case 'K': return kingMoves(q, r, board, player, terrain);
    case 'Q': return queenMoves(q, r, board, player, terrain);
    case 'P': return pawnMoves(q, r, board, player, terrain);
    case 'R': return rookMoves(q, r, board, player, terrain);
    default:  return [];
  }
}

function slide(q, r, board, player, dirs, terrain, movingPiece = null) {
  const moves = [];
  for (const [dq, dr] of dirs) {
    let nq = q + dq, nr = r + dr;
    while (isValid(nq, nr)) {
      const key = hexKey(nq, nr);
      const result = canEnter(key, board, player, terrain, movingPiece);
      if (result === 'no') break;
      moves.push(key);
      if (result === 'yes-stop') break;
      nq += dq; nr += dr;
    }
  }
  return moves;
}

function singleStep(q, r, offsets, board, player, terrain, movingPiece = null) {
  return offsets
    .map(([dq, dr]) => hexKey(q + dq, r + dr))
    .filter(k => {
      const [nq, nr] = parseKey(k);
      if (!isValid(nq, nr)) return false;
      const result = canEnter(k, board, player, terrain, movingPiece);
      return result === 'yes' || result === 'yes-stop';
    });
}

function kingMoves(q, r, board, player, terrain) {
  return singleStep(q, r, DIRECTIONS, board, player, terrain, 'K');
}

function queenMoves(q, r, board, player, terrain) {
  return slide(q, r, board, player, DIRECTIONS, terrain, 'Q');
}

function rookMoves(q, r, board, player, terrain) {
  return slide(q, r, board, player, DIRECTIONS, terrain, 'R');
}

// Omnidirectional: all 6 adjacent hexes + 6 push-2 hexes (intermediate must be clear)
function pawnMoves(q, r, board, player, terrain) {
  const moves = [];
  // Ring 1: all 6 adjacent hexes
  for (const [dq, dr] of DIRECTIONS) {
    const nq = q + dq, nr = r + dr;
    if (!isValid(nq, nr)) continue;
    const key = hexKey(nq, nr);
    if (terrainOf(key, terrain) === 'mountain') continue;
    const resident = board.get(key);
    if (!resident || resident.player !== player) moves.push(key);
  }
  // Ring 2: 6 push-2 hexes — intermediate must be empty and not a mountain
  for (const [dq, dr] of DIRECTIONS) {
    const iq = q + dq,     ir = r + dr;       // intermediate
    const nq = q + 2 * dq, nr = r + 2 * dr;   // destination
    if (!isValid(iq, ir) || !isValid(nq, nr)) continue;
    const iKey = hexKey(iq, ir);
    if (terrainOf(iKey, terrain) === 'mountain') continue;
    if (board.has(iKey)) continue; // any piece blocks the push
    const key = hexKey(nq, nr);
    if (terrainOf(key, terrain) === 'mountain') continue;
    const resident = board.get(key);
    if (!resident || resident.player !== player) moves.push(key);
  }
  return moves;
}

// ── Excavation targets ────────────────────────────────────────────────────────

export function getExcavationTargets(board, player, hexGrid) {
  const targets = new Set();
  for (const [key, entry] of board) {
    if (entry.player !== player) continue;
    targets.add(key); // the hex the piece occupies
    const [q, r] = parseKey(key);
    for (const [dq, dr] of DIRECTIONS) {
      const nk = hexKey(q + dq, r + dr);
      if (hexGrid.has(nk)) targets.add(nk);
    }
  }
  return [...targets];
}

// ── Scry ──────────────────────────────────────────────────────────────────────

export function getScryTargets(board) {
  const targets = [];
  for (const [key, entry] of board) {
    if (entry.player !== 1) continue;
    targets.push(key);
  }
  return targets;
}

// Returns { fromKey, directionAngle, caretCount } or null if no unfound artifacts.
// directionAngle is an exact float (degrees) pointing toward the nearest artifact.
export function computeScryResult(fromKey, artifacts, excavated) {
  const unfound = [...artifacts].filter(k => !excavated.has(k));
  if (unfound.length === 0) return null;

  const [fq, fr] = parseKey(fromKey);

  // Find nearest unfound artifact by hex distance
  let nearestKey = unfound[0], nearestDist = Infinity;
  for (const ak of unfound) {
    const [aq, ar] = parseKey(ak);
    const d = hexDist(fq, fr, aq, ar);
    if (d < nearestDist) { nearestDist = d; nearestKey = ak; }
  }

  const [aq, ar] = parseKey(nearestKey);

  // Pointy-top hex → exact pixel-space direction (HEX_SIZE cancels in atan2)
  const dx = Math.sqrt(3) * (aq - fq) + (Math.sqrt(3) / 2) * (ar - fr);
  const dy = 1.5 * (ar - fr);
  const directionAngle = Math.atan2(dy, dx) * (180 / Math.PI);

  // Caret count based on distance
  const caretCount = nearestDist <= 3 ? 3 : nearestDist <= 7 ? 2 : 1;

  return { fromKey, directionAngle, caretCount };
}

// Returns P2 piece keys that can scry (all P2 pieces).
export function getP2ScryTargets(board) {
  const targets = [];
  for (const [key, entry] of board) {
    if (entry.player === 2) targets.push(key);
  }
  return targets;
}

// Returns { fromKey, directionAngle, caretCount } pointing toward P1's King, or null.
export function computeP2ScryResult(fromKey, board) {
  let p1KingKey = null;
  for (const [key, entry] of board) {
    if (entry.player === 1 && entry.piece === 'K') { p1KingKey = key; break; }
  }
  if (!p1KingKey) return null;

  const [fq, fr] = parseKey(fromKey);
  const [kq, kr] = parseKey(p1KingKey);
  const dist = hexDist(fq, fr, kq, kr);

  const dx = Math.sqrt(3) * (kq - fq) + (Math.sqrt(3) / 2) * (kr - fr);
  const dy = 1.5 * (kr - fr);
  const directionAngle = Math.atan2(dy, dx) * (180 / Math.PI);
  const caretCount = dist <= 3 ? 3 : dist <= 7 ? 2 : 1;

  return { fromKey, directionAngle, caretCount };
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
      if (terrainOf(nk, terrain) !== 'mountain') targets.add(nk);
    }
  }
  return [...targets];
}

// ── Terrain action cost ───────────────────────────────────────────────────────

export function moveCost(_toKey, _terrain) {
  return 1;
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

  // Randomise starting positions ────────────────────────────────────────────
  const P2_COMPANION = [[-1, 1], [1, 1]]; // offsets from P2 King

  // P1: King only — southern outer zone (r ≥ 7, |q| ≤ 5)
  const p1Candidates = [...hexGrid].filter(k => {
    const [q, r] = parseKey(k);
    return r >= 7 && Math.abs(q) <= 5;
  });
  const [p1Key] = pickRandom(p1Candidates, 1);
  const [p1q, p1r] = parseKey(p1Key);
  board.set(p1Key, { piece: 'K', player: 1 });

  // P2: King + companions — northern outer zone (r ≤ -7, |q| ≤ 5)
  // Filter to positions where all companion hexes are also on the grid
  const p2Candidates = [...hexGrid].filter(k => {
    const [q, r] = parseKey(k);
    if (r > -7 || Math.abs(q) > 5) return false;
    return P2_COMPANION.every(([dq, dr]) => hexGrid.has(hexKey(q + dq, r + dr)));
  });
  const [p2Key] = pickRandom(p2Candidates, 1);
  const [p2q, p2r] = parseKey(p2Key);
  board.set(p2Key,                    { piece: 'K', player: 2 });
  board.set(hexKey(p2q - 1, p2r + 1), { piece: 'P', player: 2 });
  board.set(hexKey(p2q + 1, p2r + 1), { piece: 'P', player: 2 });

  // Protected zones: radius-3 around each King — no terrain placed there
  const protectedZone = new Set(board.keys());
  for (const [sq, sr] of [[p1q, p1r], [p2q, p2r]]) {
    for (const k of hexGrid) {
      const [q, r] = parseKey(k);
      if (hexDist(q, r, sq, sr) <= 3) protectedZone.add(k);
    }
  }

  // Generate terrain — mountains only
  const terrain = new Map();
  for (const key of hexGrid) {
    if (protectedZone.has(key)) continue;
    const [, r] = parseKey(key);
    const inMiddle = Math.abs(r) <= 3;
    const roll = Math.random();
    const mtn = inMiddle ? 0.07 : 0.18;
    if (roll < mtn) terrain.set(key, 'mountain');
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
