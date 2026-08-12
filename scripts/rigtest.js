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
  restChannels,
  restWorldAngles,
  drawablePartsAtFrame,
} from '../src/fighter/rig/pose.js';
import {
  STANDARD_CLIPS,
  CLIP_GROUPS,
  installStandardClips,
} from '../src/fighter/rig/standardClips.js';
import {
  rigToSourcePx,
  boneOriginInSourcePx,
  buildParts,
  findMisalignedParts,
  initialAnchor,
} from '../src/rigStudio/derivePivots.js';

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

/* ── The standard moveset ─────────────────────────────────────────────────── */

// A rig carrying every standard clip, cut with the conventional part set.
const fighter = createEmptyRig('standard');
fighter.parts = [
  { id: 'p.armB.up', bone: 'armB.up', src: 'a.png', pivot: [8, 22], z: Z.ARM_B },
  { id: 'p.legB', bone: 'legB.thigh', src: 'b.png', pivot: [8, 22], z: Z.LEG_B },
  { id: 'p.robe', bone: 'robeA', src: 'c.png', pivot: [20, 8], z: Z.ROBE_B },
  { id: 'p.torso', bone: 'torso', src: 'd.png', pivot: [30, 6], z: Z.TORSO },
  { id: 'p.legF', bone: 'legF.thigh', src: 'e.png', pivot: [8, 22], z: Z.LEG_F },
  { id: 'p.head', bone: 'head', src: 'f.png', pivot: [46, 8], z: Z.HEAD },
  { id: 'p.armF.up', bone: 'armF.up', src: 'g.png', pivot: [8, 22], z: Z.ARM_F },
  { id: 'p.handF', bone: 'handF', src: 'h.png', pivot: [10, 22], z: Z.HAND_F },
  { id: 'p.fistF', bone: 'handF', src: 'i.png', pivot: [10, 22], z: Z.HAND_F },
];
const rigged = installStandardClips(fighter);

const clipIds = Object.keys(STANDARD_CLIPS);

check('the standard moveset covers 30+ clips', clipIds.length >= 30, `got ${clipIds.length}`);

check(
  'a rig with the full standard moveset validates clean',
  validateRig(rigged).length === 0,
  validateRig(rigged).slice(0, 6).join('; '),
);

check(
  'every group in CLIP_GROUPS names a real clip',
  CLIP_GROUPS.every((g) => g.clips.every((id) => id in STANDARD_CLIPS)),
  CLIP_GROUPS.flatMap((g) => g.clips).filter((id) => !(id in STANDARD_CLIPS)).join(', '),
);

check(
  'every standard clip is listed in a group',
  clipIds.every((id) => CLIP_GROUPS.some((g) => g.clips.includes(id))),
  clipIds.filter((id) => !CLIP_GROUPS.some((g) => g.clips.includes(id))).join(', '),
);

// The moveset must cover the genre's required shapes, or it isn't "standard".
for (const required of [
  'idle', 'walk.f', 'walk.b', 'crouch', 'jump.squat', 'jump.rise', 'jump.fall', 'land',
  'dash.f', 'dash.b', 'block.stand', 'block.crouch', 'kd.fall', 'getup', 'ko', 'win',
]) {
  check(`the moveset includes "${required}"`, required in STANDARD_CLIPS);
}

check(
  'there are light, medium and heavy versions of both punch and kick',
  ['5P', '5K'].every((b) => ['l', 'm', 'h'].every((s) => `attack.${b}.${s}` in STANDARD_CLIPS)),
);

// Every clip must survive evaluation at every one of its frames. This is what
// catches an authoring slip in the keyframe tables above.
for (const [id, source] of Object.entries(STANDARD_CLIPS)) {
  const bad = [];
  for (let f = 0; f < source.frames; f++) {
    const ev = evaluateClip(rigged, id, f);
    for (const [boneId, ch] of Object.entries(ev.bones)) {
      for (const [name, value] of Object.entries(ch)) {
        if (!Number.isFinite(value)) bad.push(`${boneId}.${name}@${f}=${value}`);
      }
    }
  }
  check(`clip "${id}" evaluates to finite numbers on every frame`, bad.length === 0, bad.slice(0, 3).join(', '));
}

check(
  'every clip poses without throwing',
  (() => {
    for (const id of clipIds) {
      const ev = evaluateClip(rigged, id, Math.floor(STANDARD_CLIPS[id].frames / 2));
      const w = composePose(rigged, ev.bones);
      if (w.size !== rigged.bones.length) return false;
    }
    return true;
  })(),
);

// Attacks must actually reach: the striking limb has to travel meaningfully
// further forward than it sits at rest, or the animation doesn't read as an attack.
const restWorld = composePose(rigged, evaluateClip(rigged, 'idle', 0).bones);
const crouchWorld = composePose(rigged, evaluateClip(rigged, 'crouch', 0).bones);

// Crouching moves start and end in the crouch, so they must be measured against
// the crouch pose — comparing them to the standing stance measures the crouch, not
// the attack.
for (const [id, bone, from] of [
  ['attack.5P.h', 'handF', restWorld],
  ['attack.5P.m', 'handF', restWorld],
  ['attack.5K.h', 'footF', restWorld],
  ['attack.2K.h', 'footF', crouchWorld],
  ['attack.2P.m', 'handF', crouchWorld],
  ['sp.qcfP', 'handF', restWorld],
]) {
  let furthest = -Infinity;
  for (let f = 0; f < STANDARD_CLIPS[id].frames; f++) {
    const w = composePose(rigged, evaluateClip(rigged, id, f).bones);
    furthest = Math.max(furthest, apply(w.get(bone), 0, 0)[0]);
  }
  const restX = apply(from.get(bone), 0, 0)[0];
  check(`"${id}" extends ${bone} well past its resting reach`, furthest > restX + 45,
    `rest ${restX.toFixed(1)} → furthest ${furthest.toFixed(1)}`);
}

// Kicks must reach the height they advertise, or "low/mid/high" is a lie.
for (const [id, minY, maxY] of [
  ['attack.5K.l', 0, 70],
  ['attack.5K.m', 70, 150],
  ['attack.5K.h', 150, 260],
]) {
  let peak = -Infinity;
  for (let f = 0; f < STANDARD_CLIPS[id].frames; f++) {
    const w = composePose(rigged, evaluateClip(rigged, id, f).bones);
    peak = Math.max(peak, apply(w.get('footF'), 0, 0)[1]);
  }
  check(`"${id}" reaches its advertised height`, peak >= minY && peak <= maxY,
    `foot peaked at y=${peak.toFixed(1)}, wanted ${minY}..${maxY}`);
}

// The uppercut has to leave the ground, and the sweep has to stay low.
check(
  '"sp.dpP" lifts the fighter off the ground',
  (() => {
    let highest = -Infinity;
    for (let f = 0; f < STANDARD_CLIPS['sp.dpP'].frames; f++) {
      const w = composePose(rigged, evaluateClip(rigged, 'sp.dpP', f).bones);
      highest = Math.max(highest, apply(w.get('pelvis'), 0, 0)[1]);
    }
    return highest > 180;
  })(),
);

// A dragon punch that doesn't put the fist overhead is just a lunge. This is the
// check that catches local-vs-world rotation mistakes: `rot` is relative to the
// parent, so a leaning torso silently eats the shoulder's rotation.
check(
  '"sp.dpP" raises the fist above the head',
  (() => {
    let best = -Infinity;
    for (let f = 0; f < STANDARD_CLIPS['sp.dpP'].frames; f++) {
      const w = composePose(rigged, evaluateClip(rigged, 'sp.dpP', f).bones);
      best = Math.max(best, apply(w.get('handF'), 0, 0)[1] - apply(w.get('head'), 0, 0)[1]);
    }
    return best > 0;
  })(),
  `fist peaked ${(() => {
    let best = -Infinity;
    for (let f = 0; f < STANDARD_CLIPS['sp.dpP'].frames; f++) {
      const w = composePose(rigged, evaluateClip(rigged, 'sp.dpP', f).bones);
      best = Math.max(best, apply(w.get('handF'), 0, 0)[1] - apply(w.get('head'), 0, 0)[1]);
    }
    return best.toFixed(1);
  })()} above the head`,
);

check(
  '"attack.2K.h" sweeps low, staying under standing hip height',
  (() => {
    let highest = -Infinity;
    for (let f = 0; f < STANDARD_CLIPS['attack.2K.h'].frames; f++) {
      const w = composePose(rigged, evaluateClip(rigged, 'attack.2K.h', f).bones);
      highest = Math.max(highest, apply(w.get('pelvis'), 0, 0)[1]);
    }
    return highest < 108;
  })(),
);

check(
  'the knockdown ends with the body near the floor',
  (() => {
    const frames = STANDARD_CLIPS['kd.fall'].frames;
    const w = composePose(rigged, evaluateClip(rigged, 'kd.fall', frames - 1).bones);
    return apply(w.get('pelvis'), 0, 0)[1] < 40;
  })(),
);

check(
  'getup returns to the idle stance',
  (() => {
    const frames = STANDARD_CLIPS.getup.frames;
    const end = composePose(rigged, evaluateClip(rigged, 'getup', frames - 1).bones);
    const [ex, ey] = apply(end.get('pelvis'), 0, 0);
    const [ix, iy] = apply(restWorld.get('pelvis'), 0, 0);
    return Math.abs(ex - ix) < 6 && Math.abs(ey - iy) < 6;
  })(),
);

// Non-looping clips must return to the stance they started from, or they snap
// visibly when the state machine drops back to idle (or to crouch).
for (const [id, from, label] of [
  ['attack.5P.h', restWorld, 'idle'],
  ['attack.5K.h', restWorld, 'idle'],
  ['hurt.h.hi', restWorld, 'idle'],
  ['dash.f', restWorld, 'idle'],
  ['dash.b', restWorld, 'idle'],
  ['attack.2P.l', crouchWorld, 'crouch'],
  ['attack.2K.h', crouchWorld, 'crouch'],
]) {
  check(
    `"${id}" ends back in the ${label} pose`,
    (() => {
      const end = composePose(rigged, evaluateClip(rigged, id, STANDARD_CLIPS[id].frames - 1).bones);
      return ['handF', 'footF', 'head'].every((bone) => {
        const [ax, ay] = apply(end.get(bone), 0, 0);
        const [bx, by] = apply(from.get(bone), 0, 0);
        return Math.hypot(ax - bx, ay - by) < 20;
      });
    })(),
  );
}

check(
  'looping clips are marked loop, one-shots are not',
  (() => {
    const shouldLoop = ['idle', 'walk.f', 'walk.b', 'crouch', 'jump.apex', 'kd.lie', 'win'];
    const shouldNot = ['attack.5P.h', 'kd.fall', 'getup', 'ko', 'land', 'jump.squat'];
    return shouldLoop.every((id) => STANDARD_CLIPS[id].loop === true)
      && shouldNot.every((id) => !STANDARD_CLIPS[id].loop);
  })(),
);

check(
  'installStandardClips drops swaps for parts the rig lacks',
  (() => {
    const noFist = createEmptyRig('nofist');
    noFist.parts = [{ id: 'p.torso', bone: 'torso', src: 'd.png', pivot: [0, 0], z: Z.TORSO }];
    const installed = installStandardClips(noFist);
    return validateRig(installed).length === 0 && !installed.clips['attack.5P.h'].parts;
  })(),
);

check(
  'installStandardClips keeps a character\'s own overrides',
  (() => {
    const custom = createEmptyRig('custom');
    custom.clips = { idle: { frames: 8, loop: true, interp: 'linear', tracks: {} } };
    return installStandardClips(custom).clips.idle.frames === 8;
  })(),
);

/* ── Pivot derivation (Rig Studio) ────────────────────────────────────────── */

const anchor = { footX: 200, footY: 600, pxPerUnit: 2, viewX: 0, viewY: 0, viewScale: 1 };

check(
  'rig origin maps to the anchor point in source pixels',
  nearArr(rigToSourcePx(anchor, 0, 0), [200, 600]),
);

// The sign of the vertical term is the trap: rig +y is UP, image +y is DOWN.
// Getting it wrong mirrors the whole figure and looks like a rigging mistake.
check(
  'rig +y (up) maps to smaller image y (up the page)',
  nearArr(rigToSourcePx(anchor, 0, 100), [200, 400]),
);
check(
  'rig +x (forward) maps to larger image x',
  nearArr(rigToSourcePx(anchor, 50, 0), [300, 600]),
);

check(
  'a bone origin resolves to source pixels through the anchor',
  (() => {
    const world = composePose(rigged, restChannels(rigged).bones);
    const px = boneOriginInSourcePx(world, 'pelvis', anchor);
    // pelvis sits 108 units up from the feet.
    return near(px[0], 200, 1e-6) && near(px[1], 600 - 108 * 2, 1e-6);
  })(),
);

check(
  'a pivot is the joint position measured inside the cut piece',
  (() => {
    const world = composePose(rigged, restChannels(rigged).bones);
    const [jx, jy] = boneOriginInSourcePx(world, 'torso', anchor);
    // Pretend the torso was cut from a rectangle starting 30px left and 40px above
    // the joint; the pivot must land at exactly (30, 40) inside that piece.
    const offsets = { 'p.torso': [jx - 30, jy - 40] };
    const parts = buildParts(rigged, [{ id: 'p.torso', bone: 'torso', z: 20 }], { 'p.torso': true }, offsets, anchor);
    return parts.length === 1 && nearArr(parts[0].pivot, [30, 40], 1e-6);
  })(),
);

check(
  'moving a joint re-pivots the parts bound to it',
  (() => {
    const shifted = {
      ...rigged,
      bones: rigged.bones.map((b) => (b.id === 'pelvis' ? { ...b, pos: [0, 150] } : b)),
    };
    const targets = [{ id: 'p.torso', bone: 'torso', z: 20 }];
    const before = buildParts(rigged, targets, { 'p.torso': true }, {}, anchor)[0].pivot;
    const after = buildParts(shifted, targets, { 'p.torso': true }, {}, anchor)[0].pivot;
    // Pelvis rose 42 units, so the torso joint rises 84 image px (pxPerUnit = 2).
    return near(after[1], before[1] - 84, 1e-6);
  })(),
);

check(
  'parts with no cut piece are left out entirely',
  buildParts(rigged, [{ id: 'p.torso', bone: 'torso', z: 20 }], {}, {}, anchor).length === 0,
);

check(
  'a pivot inside its part is not flagged',
  findMisalignedParts([{ id: 'a', pivot: [20, 30] }], { a: { width: 60, height: 60 } }).length === 0,
);
check(
  'a pivot outside its part is flagged',
  findMisalignedParts([{ id: 'a', pivot: [-40, 30] }], { a: { width: 60, height: 60 } }).length === 1,
);
check(
  'a pivot just past the edge is tolerated, since parts overlap their joints',
  findMisalignedParts([{ id: 'a', pivot: [63, 30] }], { a: { width: 60, height: 60 } }).length === 0,
);

check(
  'the initial anchor stands the figure on the bottom of the frame',
  (() => {
    const a = initialAnchor(400, 620, 340);
    return a.footX === 200 && a.footY > 580 && a.pxPerUnit > 1.4 && a.pxPerUnit < 1.8;
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
