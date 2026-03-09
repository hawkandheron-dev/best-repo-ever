// Hex grid math — pointy-top hexagons, axial coordinates (q, r)
// Cube: x=q, z=r, y=-(q+r)

export const GRID_RADIUS = 10;
export const HEX_SIZE = 28; // pixel radius of each hex

// 6 axial neighbor directions (pointy-top)
export const DIRECTIONS = [
  [1, 0], [1, -1], [0, -1],
  [-1, 0], [-1, 1], [0, 1],
];

// 6 bishop diagonal directions (combining pairs of adjacent neighbor directions)
// Between (1,0)+(1,-1)=(2,-1), (1,-1)+(0,-1)=(1,-2), (0,-1)+(-1,0)=(-1,-1),
// (-1,0)+(-1,1)=(-2,1), (-1,1)+(0,1)=(-1,2), (0,1)+(1,0)=(1,1)
export const BISHOP_DIRECTIONS = [
  [2, -1], [1, -2], [-1, -1], [-2, 1], [-1, 2], [1, 1],
];

// 12 hex knight move offsets (distance-3 jumps: 2 in one dir + 1 in non-opposite dir)
export const KNIGHT_MOVES = [
  [3, -1], [2, 1], [3, -2], [2, -3],
  [1, -3], [-1, -2], [-2, -1], [-3, 1],
  [-3, 2], [-2, 3], [-1, 3], [1, 2],
];

export function hexKey(q, r) {
  return `${q},${r}`;
}

export function parseKey(key) {
  const [q, r] = key.split(',').map(Number);
  return [q, r];
}

export function hexDist(q1, r1, q2, r2) {
  return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs((q1 + r1) - (q2 + r2))) / 2;
}

export function isValid(q, r) {
  return Math.abs(q) <= GRID_RADIUS && Math.abs(r) <= GRID_RADIUS && Math.abs(q + r) <= GRID_RADIUS;
}

export function buildHexGrid() {
  const grid = new Set();
  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++) {
      if (isValid(q, r)) grid.add(hexKey(q, r));
    }
  }
  return grid;
}

export function getNeighborKeys(q, r) {
  return DIRECTIONS
    .map(([dq, dr]) => [q + dq, r + dr])
    .filter(([nq, nr]) => isValid(nq, nr))
    .map(([nq, nr]) => hexKey(nq, nr));
}

// Pixel center of hex (pointy-top) — SVG coords with hex(0,0) at origin
export function hexToPixel(q, r, size = HEX_SIZE) {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * (1.5 * r);
  return { x, y };
}

// Pointy-top hexagon corner points as "x,y x,y ..." string
export function hexPolygonPoints(cx, cy, size = HEX_SIZE) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
  }
  return pts.join(' ');
}

// Bounding box of the hex grid in pixel space
export function gridBounds(size = HEX_SIZE) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
    for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++) {
      if (!isValid(q, r)) continue;
      const { x, y } = hexToPixel(q, r, size);
      const pad = size;
      minX = Math.min(minX, x - pad);
      maxX = Math.max(maxX, x + pad);
      minY = Math.min(minY, y - pad);
      maxY = Math.max(maxY, y + pad);
    }
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}
