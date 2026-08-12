/**
 * 2-D affine transforms, stored as 6 numbers in canvas `setTransform` order.
 *
 *   [a c e]
 *   [b d f]   →  x' = a·x + c·y + e
 *   [0 0 1]      y' = b·x + d·y + f
 *
 * Pure and allocation-light: every operation returns a plain 6-element array so
 * matrices stay JSON-serialisable and comparable by value.  No DOM, no
 * `DOMMatrix` — this module has to run under vite-node for the headless tests.
 */

const DEG_TO_RAD = Math.PI / 180;

/** The identity transform. */
export function identity() {
  return [1, 0, 0, 1, 0, 0];
}

/**
 * Build a transform from a bone/part channel set.
 *
 * Order is translate → rotate → skew → scale, applied so that a point is
 * scaled first and translated last.  That ordering is what makes `rot` read as
 * "rotate this limb about its joint" rather than "rotate about the origin".
 *
 * @param {number} x    translation along parent's +x
 * @param {number} y    translation along parent's +y
 * @param {number} rot  rotation in DEGREES (positive = counter-clockwise in rig space)
 * @param {number} sx   scale along local x
 * @param {number} sy   scale along local y
 * @param {number} skx  x-shear, in DEGREES
 */
export function fromChannels(x, y, rot, sx = 1, sy = 1, skx = 0) {
  const r = rot * DEG_TO_RAD;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const tan = skx === 0 ? 0 : Math.tan(skx * DEG_TO_RAD);

  // Rotation ∘ Skew ∘ Scale.  The skew term leaks into the c/d column only,
  // which is what gives a sheared limb without moving its joint.
  const a = cos * sx;
  const b = sin * sx;
  const c = (cos * tan - sin) * sy;
  const d = (sin * tan + cos) * sy;

  return [a, b, c, d, x, y];
}

/**
 * Compose two transforms: the result applies `n` first, then `m`.
 * Equivalent to the matrix product m · n.
 */
export function multiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** Transform a point. Returns a new [x, y]. */
export function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Translation-only transform. */
export function translation(x, y) {
  return [1, 0, 0, 1, x, y];
}

/**
 * The rig→screen transform.
 *
 * Rig space has its origin at the character's feet with +x FORWARD and +y UP;
 * screen space has its origin top-left with +y DOWN.  Both the Y flip and the
 * facing flip live here and nowhere else — which is why frame data can be
 * authored once, facing forward, and never mention left or right.
 *
 * @param {number} screenX  where the character's feet sit on screen
 * @param {number} screenY
 * @param {number} facing   +1 faces screen-right, -1 faces screen-left
 * @param {number} scale    rig units → screen pixels
 */
export function rigToScreen(screenX, screenY, facing, scale = 1) {
  return [facing * scale, 0, 0, -scale, screenX, screenY];
}

/**
 * Invert an affine transform. Returns null if it is singular (zero scale),
 * which callers should treat as "this part is not visible this frame".
 */
export function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (det === 0) return null;
  const inv = 1 / det;
  return [
    m[3] * inv,
    -m[1] * inv,
    -m[2] * inv,
    m[0] * inv,
    (m[2] * m[5] - m[3] * m[4]) * inv,
    (m[1] * m[4] - m[0] * m[5]) * inv,
  ];
}
