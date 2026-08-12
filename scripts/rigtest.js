/**
 * Headless rig / pose validation.  Run with `npm run rigtest`.
 *
 * Deliberately DOM-free: it imports only the pure rig modules, never an image, so
 * it can run under vite-node in CI.  That is the whole reason hitboxes live in
 * `src/fighter/data/` rather than in the rig JSON.
 */

import { identity, fromChannels, multiply, apply, rigToScreen, invert } from '../src/fighter/rig/mat2d.js';
import {
  createEmptyRig,
  validateRig,
  boneOrder,
  DEFAULT_SKELETON,
  Z,
} from '../src/fighter/rig/rigSchema.js';
import {
  evaluateTrack,
  evaluateClip,
  composePose,
  restWorldAngles,
  drawablePartsAtFrame,
} from '../src/fighter/rig/pose.js';

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Compare floats with a tolerance, since these are trig results. */
function near(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

function nearArr(a, b, eps = 1e-9) {
  return a.length === b.length && a.every((v, i) => near(v, b[i], eps));
}

/* ── mat2d ────────────────────────────────────────────────────────────────── */

check('identity is a no-op', nearArr(apply(identity(), 7, -3), [7, -3]));

check(
  'multiply applies the right-hand transform first',
  nearArr(apply(multiply(fromChannels(10, 0, 0), fromChannels(0, 5, 0)), 0, 0), [10, 5]),
);

// A 90° rotation should send local +x onto rig +y (counter-clockwise, +y up).
check('90° rotation maps +x to +y', nearArr(apply(fromChannels(0, 0, 90), 1, 0), [0, 1], 1e-12));

// A bone at rest -90 pointing "down": local +x should land on rig -y.
check('-90° rotation maps +x to -y', nearArr(apply(fromChannels(0, 0, -90), 1, 0), [0, -1], 1e-12));

check('scale multiplies before translation', nearArr(apply(fromChannels(4, 0, 0, 2, 3), 1, 1), [6, 3]));

check('invert round-trips a point', (() => {
  const m = fromChannels(12, -7, 33, 1.5, 0.8, 10);
  const inv = invert(m);
  const [x, y] = apply(m, 4, 9);
  return inv && nearArr(apply(inv, x, y), [4, 9], 1e-9);
})());

check('invert returns null for a singular transform', invert(fromChannels(0, 0, 0, 0, 1)) === null);

// rigToScreen must flip Y and honour facing, and nothing else should.
check(
  'rigToScreen puts the feet at the anchor',
  nearArr(apply(rigToScreen(100, 200, 1, 1), 0, 0), [100, 200]),
);
check(
  'rigToScreen sends rig +y upward on screen',
  nearArr(apply(rigToScreen(100, 200, 1, 1), 0, 50), [100, 150]),
);
check(
  'rigToScreen mirrors forward when facing left',
  nearArr(apply(rigToScreen(100, 200, -1, 1), 30, 0), [70, 200]),
);
check(
  'rigToScreen scales rig units to pixels',
  nearArr(apply(rigToScreen(0, 0, 1, 2), 10, 10), [20, -20]),
);

/* ── Schema ───────────────────────────────────────────────────────────────── */

const rig = createEmptyRig('testicles');

check('a blank rig validates clean', validateRig(rig).length === 0, validateRig(rig).join('; '));
check('default skeleton has 23 bones', DEFAULT_SKELETON.length === 23, `got ${DEFAULT_SKELETON.length}`);
check('boneOrder returns every bone', boneOrder(rig).length === rig.bones.length);

check(
  'boneOrder puts parents before children',
  (() => {
    const seen = new Set();
    for (const bone of boneOrder(rig)) {
      if (bone.parent !== null && !seen.has(bone.parent)) return false;
      seen.add(bone.id);
    }
    return true;
  })(),
);

check(
  'limb parts are named .f/.b, never left/right',
  DEFAULT_SKELETON.every((b) => !/\.(l|r)$|left|right/i.test(b.id)),
);

check(
  'the near arm draws in front of the torso',
  Z.ARM_F > Z.TORSO && Z.ARM_B < Z.TORSO,
);

// Validation has to *report* rather than throw, since the studio calls it on every keystroke.
check(
  'a bone cycle is reported, not thrown',
  (() => {
    const bad = createEmptyRig('cyclic');
    bad.bones = [
      { id: 'a', parent: 'b', pos: [0, 0], rest: 0 },
      { id: 'b', parent: 'a', pos: [0, 0], rest: 0 },
    ];
    const problems = validateRig(bad);
    return problems.some((p) => p.includes('cycle'));
  })(),
);

check(
  'a part bound to a missing bone is reported',
  (() => {
    const bad = createEmptyRig('orphan');
    bad.parts = [{ id: 'p.x', bone: 'nope', src: 'x.png', pivot: [0, 0], z: 1 }];
    return validateRig(bad).some((p) => p.includes('unknown bone'));
  })(),
);

check(
  'out-of-range and unordered keyframes are reported',
  (() => {
    const bad = createEmptyRig('badkeys');
    bad.clips = {
      idle: { frames: 10, loop: true, tracks: { torso: { rot: [[0, 0], [99, 5]] } } },
      jump: { frames: 10, loop: false, tracks: { torso: { rot: [[5, 0], [2, 5]] } } },
    };
    const problems = validateRig(bad);
    return problems.some((p) => p.includes('outside')) && problems.some((p) => p.includes('frame order'));
  })(),
);

/* ── Track interpolation ──────────────────────────────────────────────────── */

const keys = [
  [0, 0],
  [10, 100],
];

check('track hits its keyed values exactly', evaluateTrack(keys, 0, 20, false) === 0 && evaluateTrack(keys, 10, 20, false) === 100);
check('track interpolates linearly', evaluateTrack(keys, 5, 20, false) === 50);
check('non-looping track holds after the last key', evaluateTrack(keys, 18, 20, false) === 100);
check('single-key track is constant', evaluateTrack([[4, 42]], 0, 20, false) === 42);
check('empty track returns null so the bone rest applies', evaluateTrack([], 3, 20, false) === null);

// Looping wraps from the last key around the end of the clip back to the first.
check(
  'looping track wraps past the last key',
  evaluateTrack(keys, 15, 20, true) === 50,
  `got ${evaluateTrack(keys, 15, 20, true)}`,
);
check(
  'a step key holds its value until the next',
  evaluateTrack([[0, 0, 'step'], [10, 100]], 7, 20, false) === 0,
);
check(
  "clip-level interp 'step' suppresses interpolation",
  evaluateTrack(keys, 5, 20, false, 'step') === 0,
);

/* ── Clip evaluation and posing ───────────────────────────────────────────── */

const posed = createEmptyRig('heraclitus');
posed.parts = [
  { id: 'p.torso', bone: 'torso', src: 'torso.png', pivot: [30, 6], z: Z.TORSO },
  { id: 'p.handF', bone: 'handF', src: 'hand.png', pivot: [10, 22], z: Z.HAND_F },
  { id: 'p.fistF', bone: 'handF', src: 'fist.png', pivot: [10, 22], z: Z.HAND_F },
  { id: 'p.armB', bone: 'armB.up', src: 'armb.png', pivot: [8, 22], z: Z.ARM_B },
];
posed.clips = {
  idle: {
    frames: 48,
    loop: true,
    interp: 'linear',
    tracks: { torso: { rot: [[0, 0], [24, -1.5]] } },
  },
  punch: {
    frames: 22,
    loop: false,
    interp: 'linear',
    tracks: { 'armF.up': { rot: [[0, -75], [8, -2]], sx: [[0, 1], [8, 1.12]] } },
    parts: { 'p.handF': { swap: [[0, 'p.handF'], [2, 'p.fistF'], [16, 'p.handF']] } },
  },
};

check('a rig with parts and clips validates clean', validateRig(posed).length === 0, validateRig(posed).join('; '));

// Purity: this is the property that makes timeline scrubbing and rollback safe.
check(
  'evaluateClip is a pure function of the frame',
  (() => {
    const forward = [];
    for (let f = 0; f < 48; f++) forward.push(JSON.stringify(evaluateClip(posed, 'idle', f)));
    const backward = [];
    for (let f = 47; f >= 0; f--) backward.unshift(JSON.stringify(evaluateClip(posed, 'idle', f)));
    return forward.every((v, i) => v === backward[i]);
  })(),
);

check(
  'unkeyed bones fall back to their rest pose',
  (() => {
    const ev = evaluateClip(posed, 'idle', 12);
    const chest = DEFAULT_SKELETON.find((b) => b.id === 'chest');
    return ev.bones.chest.rot === chest.rest && ev.bones.chest.x === chest.pos[0];
  })(),
);

check(
  'a looping clip wraps its frame index',
  JSON.stringify(evaluateClip(posed, 'idle', 50)) === JSON.stringify(evaluateClip(posed, 'idle', 2)),
);

check(
  'a non-looping clip clamps past its end',
  JSON.stringify(evaluateClip(posed, 'punch', 999).bones) ===
    JSON.stringify(evaluateClip(posed, 'punch', 21).bones),
);

check('a missing clip is flagged, not fatal', evaluateClip(posed, 'nope', 0).missing === true);

// Forward kinematics: the standard skeleton should stand on the ground.
const world = composePose(posed, evaluateClip(posed, 'idle', 0).bones);

check('composePose covers every bone', world.size === posed.bones.length);

check(
  'the skeleton stands with its near foot on the ground',
  (() => {
    const [, footY] = apply(world.get('footF'), 0, 0);
    return Math.abs(footY) < 12;
  })(),
  `footF y = ${apply(world.get('footF'), 0, 0)[1].toFixed(2)}`,
);

check(
  'the head sits near the nominal standing height',
  (() => {
    const [, headY] = apply(world.get('head'), 0, 0);
    return headY > 200 && headY < posed.space.height;
  })(),
  `head y = ${apply(world.get('head'), 0, 0)[1].toFixed(2)}`,
);

check(
  'the near hand hangs below the shoulder at rest',
  (() => {
    const [, shoulderY] = apply(world.get('armF.up'), 0, 0);
    const [, handY] = apply(world.get('handF'), 0, 0);
    return handY < shoulderY;
  })(),
);

check(
  'rest angles accumulate down the chain',
  (() => {
    const angles = restWorldAngles(posed);
    const up = DEFAULT_SKELETON.find((b) => b.id === 'armF.up').rest;
    const fore = DEFAULT_SKELETON.find((b) => b.id === 'armF.fore').rest;
    return angles.get('armF.fore') === up + fore;
  })(),
);

check(
  'raising a bone moves its descendants',
  (() => {
    const ev = evaluateClip(posed, 'punch', 8);
    const punchWorld = composePose(posed, ev.bones);
    const [restX] = apply(world.get('handF'), 0, 0);
    const [punchX] = apply(punchWorld.get('handF'), 0, 0);
    return punchX > restX + 40; // the fist should now be well out in front
  })(),
);

/* ── Part swapping and draw order ─────────────────────────────────────────── */

check(
  'the hand swaps to a fist mid-punch and back',
  (() => {
    const at = (f) => {
      const ev = evaluateClip(posed, 'punch', f);
      const drawn = drawablePartsAtFrame(posed, ev).find((d) => d.slot.id === 'p.handF');
      return drawn.part.id;
    };
    return at(0) === 'p.handF' && at(8) === 'p.fistF' && at(20) === 'p.handF';
  })(),
);

check(
  'parts draw back-to-front by z',
  (() => {
    const order = drawablePartsAtFrame(posed, evaluateClip(posed, 'idle', 0)).map((d) => d.slot.id);
    return order.indexOf('p.armB') < order.indexOf('p.torso') && order.indexOf('p.torso') < order.indexOf('p.handF');
  })(),
);

check(
  'draw order is total, so it is deterministic',
  (() => {
    const tied = createEmptyRig('tied');
    tied.parts = [
      { id: 'p.zebra', bone: 'torso', src: 'a.png', pivot: [0, 0], z: 5 },
      { id: 'p.alpha', bone: 'torso', src: 'b.png', pivot: [0, 0], z: 5 },
    ];
    const ev = evaluateClip(tied, 'none', 0);
    const order = drawablePartsAtFrame(tied, ev).map((d) => d.slot.id);
    return order[0] === 'p.alpha' && order[1] === 'p.zebra';
  })(),
);

/* ── Report ───────────────────────────────────────────────────────────────── */

const total = passed + failures.length;
if (failures.length > 0) {
  console.error(`\nrigtest: ${passed}/${total} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error('');
  process.exit(1);
}
console.log(`\nrigtest: ${passed}/${total} passed\n`);
