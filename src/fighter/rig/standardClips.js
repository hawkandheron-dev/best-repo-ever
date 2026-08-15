/**
 * The standard fighting-game moveset, as keyframed animation clips.
 *
 * Every character gets these clips by default; a character may override any of
 * them in its own rig.  This is the animation half only — the gameplay half
 * (hitboxes, damage, stun) lives in `src/fighter/data/` and references these clips
 * by name.  Startup/active/recovery in the frame data must line up with the poses
 * here: an attack's impact keyframe sits on its first active frame.
 *
 * All `rot` values are ABSOLUTE degrees and replace the bone's rest angle, so the
 * rest angles are worth having in front of you while reading:
 *
 *   pelvis torso chest neck head        0
 *   armF.up  -75   armF.fore  -20   handF   0
 *   armB.up  -95   armB.fore  -15   handB   0
 *   legF.thigh -88 legF.shin   -4   footF  88
 *   legB.thigh -92 legB.shin   -6   footB  92
 *   robeA    -90   robeB        0
 *
 * A limb bone points along its own local +x, so 0° is straight forward, -90° is
 * straight down.  Punching therefore means driving `armF.up` from -75 up toward 0.
 *
 * Timings are a tuned-by-eye first pass in the tradition of the genre (lights
 * ~4f startup, mediums ~6-8f, heavies ~8-11f). Expect to adjust them in the
 * studio against real hitboxes — animation authored against a live hitbox is
 * worth three times animation authored in a vacuum.
 */

/** Build a clip. Keys are `[frame, value]`, or `[frame, value, 'step']` to hold. */
function clip(frames, loop, tracks, extras = {}) {
  return { frames, loop, interp: 'linear', tracks, ...extras };
}

/* ── Neutral and movement ─────────────────────────────────────────────────── */

const idle = clip(48, true, {
  // A slow two-beat breath. The whole body participates or it reads as a statue
  // with a twitching arm.
  pelvis: { y: [[0, 150], [24, 146]] },
  torso: { rot: [[0, 0], [24, -1.5]] },
  chest: { rot: [[0, 0], [24, 2.5]] },
  neck: { rot: [[0, 0], [24, -1]] },
  head: { rot: [[0, 0], [16, 1.2], [32, -1.2]] },
  'armF.up': { rot: [[0, -75], [24, -71]] },
  'armF.fore': { rot: [[0, -20], [24, -27]] },
  'armB.up': { rot: [[0, -95], [24, -92]] },
  'armB.fore': { rot: [[0, -15], [24, -21]] },
  robeA: { rot: [[0, -90], [18, -87], [36, -92]] },
  robeB: { rot: [[0, 0], [20, 4], [40, -2]] },
});

const walkF = clip(32, true, {
  pelvis: { y: [[0, 150], [8, 144], [16, 150], [24, 144]] },
  torso: { rot: [[0, 2], [16, 2]] },
  chest: { rot: [[0, 0], [8, -2], [24, 2]] },
  // Legs in antiphase — the near leg leads, the far leg trails by half a cycle.
  'legF.thigh': { rot: [[0, -62], [8, -88], [16, -112], [24, -88]] },
  'legF.shin': { rot: [[0, -20], [8, -4], [16, -2], [24, -30]] },
  footF: { rot: [[0, 96], [8, 88], [16, 80], [24, 92]] },
  'legB.thigh': { rot: [[0, -116], [8, -92], [16, -66], [24, -92]] },
  'legB.shin': { rot: [[0, -2], [8, -34], [16, -22], [24, -6]] },
  footB: { rot: [[0, 84], [8, 96], [16, 100], [24, 90]] },
  // Arms counter-swing.
  'armF.up': { rot: [[0, -86], [16, -64], [31, -84]] },
  'armF.fore': { rot: [[0, -24], [16, -34]] },
  'armB.up': { rot: [[0, -84], [16, -106], [31, -86]] },
  robeA: { rot: [[0, -84], [16, -96]] },
  robeB: { rot: [[0, 6], [16, -6]] },
});

// Walking backward is not the forward cycle reversed: the fighter keeps facing the
// opponent and leans away, so the torso and arm poses differ.
const walkB = clip(32, true, {
  pelvis: { y: [[0, 150], [8, 146], [16, 150], [24, 146]] },
  torso: { rot: [[0, -3], [16, -3]] },
  chest: { rot: [[0, -2], [8, 0], [24, -4]] },
  'legF.thigh': { rot: [[0, -110], [8, -88], [16, -68], [24, -88]] },
  'legF.shin': { rot: [[0, -4], [8, -26], [16, -18], [24, -6]] },
  footF: { rot: [[0, 84], [8, 92], [16, 96], [24, 88]] },
  'legB.thigh': { rot: [[0, -70], [8, -92], [16, -114], [24, -92]] },
  'legB.shin': { rot: [[0, -22], [8, -6], [16, -4], [24, -28]] },
  footB: { rot: [[0, 98], [8, 92], [16, 84], [24, 94]] },
  'armF.up': { rot: [[0, -78], [16, -70]] },
  'armF.fore': { rot: [[0, -34], [16, -42]] },
  'armB.up': { rot: [[0, -98], [16, -104]] },
  robeA: { rot: [[0, -96], [16, -86]] },
});

const crouchIn = clip(3, false, {
  pelvis: { y: [[0, 150], [2, 86]] },
  torso: { rot: [[0, 0], [2, 8]] },
  chest: { rot: [[0, 0], [2, 6]] },
  'legF.thigh': { rot: [[0, -88], [2, -128]] },
  'legF.shin': { rot: [[0, -4], [2, 74]] },
  footF: { rot: [[0, 88], [2, 56]] },
  'legB.thigh': { rot: [[0, -92], [2, -132]] },
  'legB.shin': { rot: [[0, -6], [2, 78]] },
  footB: { rot: [[0, 92], [2, 58]] },
  'armF.up': { rot: [[0, -75], [2, -58]] },
  'armF.fore': { rot: [[0, -20], [2, -48]] },
  robeA: { rot: [[0, -90], [2, -76]] },
});

const crouch = clip(24, true, {
  pelvis: { y: [[0, 86], [12, 83]] },
  torso: { rot: [[0, 8], [12, 9.5]] },
  chest: { rot: [[0, 6], [12, 7]] },
  head: { rot: [[0, 0], [12, 1]] },
  'legF.thigh': { rot: [[0, -128], [12, -128]] },
  'legF.shin': { rot: [[0, 74], [12, 74]] },
  footF: { rot: [[0, 56], [12, 56]] },
  'legB.thigh': { rot: [[0, -132], [12, -132]] },
  'legB.shin': { rot: [[0, 78], [12, 78]] },
  footB: { rot: [[0, 58], [12, 58]] },
  'armF.up': { rot: [[0, -58], [12, -55]] },
  'armF.fore': { rot: [[0, -48], [12, -52]] },
  robeA: { rot: [[0, -76], [12, -74]] },
});

const crouchOut = clip(3, false, {
  pelvis: { y: [[0, 86], [2, 150]] },
  torso: { rot: [[0, 8], [2, 0]] },
  'legF.thigh': { rot: [[0, -128], [2, -88]] },
  'legF.shin': { rot: [[0, 74], [2, -4]] },
  footF: { rot: [[0, 56], [2, 88]] },
  'legB.thigh': { rot: [[0, -132], [2, -92]] },
  'legB.shin': { rot: [[0, 78], [2, -6]] },
  footB: { rot: [[0, 58], [2, 92]] },
  'armF.up': { rot: [[0, -58], [2, -75]] },
  'armF.fore': { rot: [[0, -48], [2, -20]] },
});

/* ── Jumping ──────────────────────────────────────────────────────────────── */

// 4 frames of pre-jump crouch. These frames are why jumps are punishable on
// reaction, so the compression has to be readable.
const jumpSquat = clip(4, false, {
  pelvis: { y: [[0, 150], [3, 108]] },
  torso: { rot: [[0, 0], [3, 6]] },
  'legF.thigh': { rot: [[0, -88], [3, -114]] },
  'legF.shin': { rot: [[0, -4], [3, 44]] },
  footF: { rot: [[0, 88], [3, 66]] },
  'legB.thigh': { rot: [[0, -92], [3, -118]] },
  'legB.shin': { rot: [[0, -6], [3, 48]] },
  footB: { rot: [[0, 92], [3, 68]] },
  'armF.up': { rot: [[0, -75], [3, -96]] },
  'armB.up': { rot: [[0, -95], [3, -114]] },
});

const jumpRise = clip(6, false, {
  pelvis: { y: [[0, 108], [5, 161]] },
  torso: { rot: [[0, 6], [5, -4]] },
  'legF.thigh': { rot: [[0, -114], [5, -74]] },
  'legF.shin': { rot: [[0, 44], [5, -34]] },
  footF: { rot: [[0, 66], [5, 104]] },
  'legB.thigh': { rot: [[0, -118], [5, -104]] },
  'legB.shin': { rot: [[0, 48], [5, 4]] },
  'armF.up': { rot: [[0, -96], [5, -34]] },
  'armF.fore': { rot: [[0, -20], [5, -8]] },
  'armB.up': { rot: [[0, -114], [5, -58]] },
  robeA: { rot: [[0, -90], [5, -104]] },
});

const jumpApex = clip(8, true, {
  torso: { rot: [[0, -4], [4, -2]] },
  'legF.thigh': { rot: [[0, -74], [4, -70]] },
  'legF.shin': { rot: [[0, -34], [4, -40]] },
  'legB.thigh': { rot: [[0, -104], [4, -108]] },
  'legB.shin': { rot: [[0, 4], [4, 10]] },
  'armF.up': { rot: [[0, -34], [4, -30]] },
  'armB.up': { rot: [[0, -58], [4, -62]] },
  robeA: { rot: [[0, -104], [4, -100]] },
  robeB: { rot: [[0, -8], [4, -2]] },
});

const jumpFall = clip(6, false, {
  torso: { rot: [[0, -2], [5, 4]] },
  'legF.thigh': { rot: [[0, -70], [5, -92]] },
  'legF.shin': { rot: [[0, -40], [5, -10]] },
  footF: { rot: [[0, 104], [5, 92]] },
  'legB.thigh': { rot: [[0, -108], [5, -96]] },
  'legB.shin': { rot: [[0, 10], [5, -4]] },
  'armF.up': { rot: [[0, -30], [5, -62]] },
  'armB.up': { rot: [[0, -62], [5, -86]] },
  robeA: { rot: [[0, -100], [5, -88]] },
});

const land = clip(4, false, {
  pelvis: { y: [[0, 133], [1, 103], [3, 150]] },
  torso: { rot: [[0, 4], [1, 10], [3, 0]] },
  'legF.thigh': { rot: [[0, -92], [1, -120], [3, -88]] },
  'legF.shin': { rot: [[0, -10], [1, 56], [3, -4]] },
  footF: { rot: [[0, 92], [1, 62], [3, 88]] },
  'legB.thigh': { rot: [[0, -96], [1, -124], [3, -92]] },
  'legB.shin': { rot: [[0, -4], [1, 60], [3, -6]] },
  'armF.up': { rot: [[0, -62], [1, -88], [3, -75]] },
});

/* ── Dashes ───────────────────────────────────────────────────────────────── */

const dashF = clip(18, false, {
  pelvis: { y: [[0, 150], [3, 133], [12, 136], [17, 150]] },
  torso: { rot: [[0, 0], [3, 12], [12, 10], [17, 0]] },
  chest: { rot: [[0, 0], [4, -4], [17, 0]] },
  'legF.thigh': { rot: [[0, -88], [4, -46], [11, -104], [17, -88]] },
  'legF.shin': { rot: [[0, -4], [4, -30], [11, -2], [17, -4]] },
  'legB.thigh': { rot: [[0, -92], [4, -124], [11, -70], [17, -92]] },
  'legB.shin': { rot: [[0, -6], [4, 30], [11, -26], [17, -6]] },
  'armF.up': { rot: [[0, -75], [4, -52], [12, -92], [17, -75]] },
  'armF.fore': { rot: [[0, -20], [4, -46], [17, -20]] },
  'armB.up': { rot: [[0, -95], [4, -118], [12, -74], [17, -95]] },
  robeA: { rot: [[0, -90], [4, -108], [12, -78], [17, -90]] },
  robeB: { rot: [[0, 0], [5, -14], [13, 10], [17, 0]] },
});

const dashB = clip(22, false, {
  pelvis: { y: [[0, 150], [4, 139], [14, 142], [21, 150]] },
  torso: { rot: [[0, 0], [4, -10], [14, -8], [21, 0]] },
  'legF.thigh': { rot: [[0, -88], [5, -120], [14, -74], [21, -88]] },
  'legF.shin': { rot: [[0, -4], [5, 26], [14, -22], [21, -4]] },
  'legB.thigh': { rot: [[0, -92], [5, -58], [14, -110], [21, -92]] },
  'legB.shin': { rot: [[0, -6], [5, -34], [14, -4], [21, -6]] },
  'armF.up': { rot: [[0, -75], [5, -60], [21, -75]] },
  'armF.fore': { rot: [[0, -20], [5, -54], [21, -20]] },
  'armB.up': { rot: [[0, -95], [5, -80], [21, -95]] },
  robeA: { rot: [[0, -90], [5, -70], [14, -100], [21, -90]] },
});

/* ── Standing normals ─────────────────────────────────────────────────────── */

/**
 * Punches share a shape: brief windup away from the target, drive to full
 * extension on the first active frame, hold, then retract.  What separates a light
 * from a heavy is how much of the body joins in — a jab is arm-only, a heavy
 * rotates the hips and steps into it.
 *
 * @param frames  total clip length; must equal startup + active + recovery
 * @param impact  the first active frame — extension lands exactly here
 * @param power   0 = jab, 1 = full-body heavy
 */
function punch(frames, impact, power) {
  const windup = Math.max(1, Math.round(impact * 0.4));
  const hold = impact + Math.max(1, Math.round(frames * 0.09));
  const last = frames - 1;
  const p = power;

  return clip(frames, false, {
    pelvis: {
      x: [[0, 0], [windup, -3 * p], [impact, 10 * p], [hold, 9 * p], [last, 0]],
    },
    torso: { rot: [[0, 0], [windup, -6 * p], [impact, 7 * p], [last, 0]] },
    chest: { rot: [[0, 0], [windup, 12 * p], [impact, -16 * p], [hold, -14 * p], [last, 0]] },
    head: { rot: [[0, 0], [windup, 3 * p], [impact, -4 * p], [last, 0]] },
    // The punching arm: rest -75 → 0 is straight forward.
    'armF.up': { rot: [[0, -75], [windup, -88], [impact, -2], [hold, -6], [last, -75]] },
    'armF.fore': {
      rot: [[0, -20], [windup, -72], [impact, 0], [hold, -8], [last, -20]],
      // A touch of stretch on impact sells the extension without a mesh deformer.
      sx: [[0, 1], [impact, 1 + 0.12 * p], [hold, 1]],
    },
    // The off arm pulls back — equal and opposite, and it stops the pose reading flat.
    'armB.up': { rot: [[0, -95], [windup, -78], [impact, -116], [last, -95]] },
    'armB.fore': { rot: [[0, -15], [windup, -30], [impact, -8], [last, -15]] },
    'legF.thigh': { rot: [[0, -88], [impact, -80 - 4 * p], [last, -88]] },
    'legB.thigh': { rot: [[0, -92], [impact, -98 - 4 * p], [last, -92]] },
    'legB.shin': { rot: [[0, -6], [impact, -14 * p], [last, -6]] },
    robeA: { rot: [[0, -90], [impact, -84], [last, -90]] },
    robeB: { rot: [[0, 0], [impact, -8 * p], [last, 0]] },
  }, {
    // Hand becomes a fist for the swing, opens again on recovery.
    parts: { 'p.handF': { swap: [[0, 'p.handF'], [1, 'p.fistF'], [hold + 2, 'p.handF']] } },
  });
}

/**
 * Kicks lift the near leg and lean the torso back to counterbalance.
 *
 * @param height 'low' scrapes the shin, 'mid' hits the body, 'high' goes for the head
 */
function kick(frames, impact, height) {
  const windup = Math.max(1, Math.round(impact * 0.45));
  const hold = impact + Math.max(1, Math.round(frames * 0.08));
  const last = frames - 1;

  // Thigh angle is local to the pelvis, where 0° is straight forward and -90° is
  // straight down — so a head-height kick needs a POSITIVE thigh angle, and only a
  // low kick points below the horizontal. Getting this backwards points the leg
  // behind the fighter, which is what `rigtest` caught the first time round.
  const thigh = { low: -42, mid: 8, high: 52 }[height];
  const shinOut = { low: -6, mid: -8, high: -14 }[height];
  const lean = { low: 4, mid: -8, high: -16 }[height];

  return clip(frames, false, {
    pelvis: { y: [[0, 150], [windup, 144], [impact, 139], [last, 150]] },
    torso: { rot: [[0, 0], [windup, 4], [impact, lean], [hold, lean * 0.9], [last, 0]] },
    chest: { rot: [[0, 0], [impact, lean * 0.5], [last, 0]] },
    head: { rot: [[0, 0], [impact, -lean * 0.4], [last, 0]] },
    'legF.thigh': { rot: [[0, -88], [windup, -108], [impact, thigh], [hold, thigh - 4], [last, -88]] },
    'legF.shin': { rot: [[0, -4], [windup, 42], [impact, shinOut], [hold, 6], [last, -4]] },
    footF: { rot: [[0, 88], [windup, 70], [impact, 96], [last, 88]] },
    // The planted leg straightens and takes the weight.
    'legB.thigh': { rot: [[0, -92], [windup, -96], [impact, -88], [last, -92]] },
    'legB.shin': { rot: [[0, -6], [windup, 8], [impact, -2], [last, -6]] },
    'armF.up': { rot: [[0, -75], [windup, -62], [impact, -108], [last, -75]] },
    'armF.fore': { rot: [[0, -20], [impact, -34], [last, -20]] },
    'armB.up': { rot: [[0, -95], [windup, -108], [impact, -66], [last, -95]] },
    'armB.fore': { rot: [[0, -15], [impact, -40], [last, -15]] },
    robeA: { rot: [[0, -90], [windup, -84], [impact, -102], [last, -90]] },
    robeB: { rot: [[0, 0], [impact, 14], [last, 0]] },
  });
}

/* ── Crouching normals ────────────────────────────────────────────────────── */

function crouchPunch(frames, impact) {
  const windup = Math.max(1, Math.round(impact * 0.4));
  const hold = impact + 2;
  const last = frames - 1;
  return clip(frames, false, {
    pelvis: { y: [[0, 86], [impact, 83], [last, 86]] },
    torso: { rot: [[0, 8], [windup, 4], [impact, 12], [last, 8]] },
    chest: { rot: [[0, 6], [windup, 14], [impact, -6], [last, 6]] },
    'armF.up': { rot: [[0, -58], [windup, -70], [impact, -26], [hold, -30], [last, -58]] },
    'armF.fore': { rot: [[0, -48], [windup, -78], [impact, -6], [hold, -14], [last, -48]] },
    'armB.up': { rot: [[0, -58], [impact, -74], [last, -58]] },
    'legF.thigh': { rot: [[0, -128], [impact, -126], [last, -128]] },
    'legF.shin': { rot: [[0, 74], [impact, 72], [last, 74]] },
    'legB.thigh': { rot: [[0, -132], [impact, -132]] },
    'legB.shin': { rot: [[0, 78], [impact, 78]] },
    footF: { rot: [[0, 56], [impact, 56]] },
    footB: { rot: [[0, 58], [impact, 58]] },
    robeA: { rot: [[0, -76], [impact, -72], [last, -76]] },
  }, {
    parts: { 'p.handF': { swap: [[0, 'p.handF'], [1, 'p.fistF'], [hold + 2, 'p.handF']] } },
  });
}

/** The sweep: near leg scythes along the ground, body low and rotated. */
function crouchKick(frames, impact) {
  const windup = Math.max(1, Math.round(impact * 0.45));
  const hold = impact + 2;
  const last = frames - 1;
  return clip(frames, false, {
    pelvis: { y: [[0, 86], [windup, 75], [impact, 61], [hold, 64], [last, 86]] },
    torso: { rot: [[0, 8], [windup, 14], [impact, 22], [last, 8]] },
    chest: { rot: [[0, 6], [impact, 10], [last, 6]] },
    head: { rot: [[0, 0], [impact, -8], [last, 0]] },
    // Leg scythes forward along the floor: thigh swings up toward horizontal while
    // the shin unfolds, keeping the foot low because the pelvis has dropped to 44.
    'legF.thigh': { rot: [[0, -128], [windup, -136], [impact, -26], [hold, -22], [last, -128]] },
    'legF.shin': { rot: [[0, 74], [windup, 60], [impact, 4], [hold, 8], [last, 74]] },
    footF: { rot: [[0, 56], [impact, 74], [last, 56]] },
    'legB.thigh': { rot: [[0, -132], [impact, -140], [last, -132]] },
    'legB.shin': { rot: [[0, 78], [impact, 92], [last, 78]] },
    // A hand goes down for support — the pose is unreadable without it.
    'armF.up': { rot: [[0, -58], [impact, -112], [last, -58]] },
    'armF.fore': { rot: [[0, -48], [impact, -18], [last, -48]] },
    'armB.up': { rot: [[0, -58], [impact, -30], [last, -58]] },
    'armB.fore': { rot: [[0, -15], [impact, -46], [last, -15]] },
    robeA: { rot: [[0, -76], [impact, -108], [last, -76]] },
    robeB: { rot: [[0, 0], [impact, 22], [last, 0]] },
  });
}

/* ── Air normals ──────────────────────────────────────────────────────────── */

function airAttack(frames, impact, limb) {
  const windup = Math.max(1, Math.round(impact * 0.45));
  const hold = impact + 2;
  const last = frames - 1;

  const arms = limb === 'punch'
    ? {
      'armF.up': { rot: [[0, -34], [windup, -60], [impact, -14], [hold, -18], [last, -34]] },
      'armF.fore': { rot: [[0, -8], [windup, -56], [impact, 4], [last, -8]] },
      'armB.up': { rot: [[0, -58], [impact, -84], [last, -58]] },
    }
    : {
      'armF.up': { rot: [[0, -34], [impact, -58], [last, -34]] },
      'armB.up': { rot: [[0, -58], [impact, -34], [last, -58]] },
    };

  const legs = limb === 'kick'
    ? {
      'legF.thigh': { rot: [[0, -74], [windup, -96], [impact, -40], [hold, -44], [last, -74]] },
      'legF.shin': { rot: [[0, -34], [windup, 30], [impact, -18], [last, -34]] },
      footF: { rot: [[0, 104], [impact, 84], [last, 104]] },
      'legB.thigh': { rot: [[0, -104], [impact, -116], [last, -104]] },
    }
    : {
      'legF.thigh': { rot: [[0, -74], [impact, -82], [last, -74]] },
      'legB.thigh': { rot: [[0, -104], [impact, -110], [last, -104]] },
    };

  return clip(frames, false, {
    torso: { rot: [[0, -4], [impact, limb === 'kick' ? -12 : 6], [last, -4]] },
    chest: { rot: [[0, 0], [windup, 8], [impact, -10], [last, 0]] },
    ...arms,
    ...legs,
    robeA: { rot: [[0, -104], [impact, -92], [last, -104]] },
  }, limb === 'punch'
    ? { parts: { 'p.handF': { swap: [[0, 'p.handF'], [1, 'p.fistF'], [hold + 2, 'p.handF']] } } }
    : {});
}

/* ── Defence ──────────────────────────────────────────────────────────────── */

const blockStand = clip(6, false, {
  torso: { rot: [[0, 0], [3, -6]] },
  chest: { rot: [[0, 0], [3, 8]] },
  head: { rot: [[0, 0], [3, 4]] },
  // Both forearms come up across the centre line.
  'armF.up': { rot: [[0, -75], [3, -44]] },
  'armF.fore': { rot: [[0, -20], [3, 46]] },
  'armB.up': { rot: [[0, -95], [3, -58]] },
  'armB.fore': { rot: [[0, -15], [3, 52]] },
  'legF.thigh': { rot: [[0, -88], [3, -94]] },
  'legB.thigh': { rot: [[0, -92], [3, -86]] },
  robeA: { rot: [[0, -90], [3, -94]] },
});

const blockCrouch = clip(6, false, {
  pelvis: { y: [[0, 86], [3, 83]] },
  torso: { rot: [[0, 8], [3, 12]] },
  chest: { rot: [[0, 6], [3, 12]] },
  'armF.up': { rot: [[0, -58], [3, -38]] },
  'armF.fore': { rot: [[0, -48], [3, 40]] },
  'armB.up': { rot: [[0, -58], [3, -44]] },
  'armB.fore': { rot: [[0, -15], [3, 44]] },
  'legF.thigh': { rot: [[0, -128], [3, -128]] },
  'legF.shin': { rot: [[0, 74], [3, 74]] },
  'legB.thigh': { rot: [[0, -132], [3, -132]] },
  'legB.shin': { rot: [[0, 78], [3, 78]] },
});

/* ── Reactions ────────────────────────────────────────────────────────────── */

function hurt(frames, severity) {
  const s = severity;
  const peak = Math.max(1, Math.round(frames * 0.28));
  const last = frames - 1;
  return clip(frames, false, {
    pelvis: { x: [[0, 0], [peak, -8 * s], [last, 0]] },
    torso: { rot: [[0, 0], [peak, -14 * s], [last, 0]] },
    chest: { rot: [[0, 0], [peak, -18 * s], [last, 0]] },
    neck: { rot: [[0, 0], [peak, -12 * s], [last, 0]] },
    head: { rot: [[0, 0], [peak, -22 * s], [last, 0]] },
    'armF.up': { rot: [[0, -75], [peak, -104], [last, -75]] },
    'armF.fore': { rot: [[0, -20], [peak, -46], [last, -20]] },
    'armB.up': { rot: [[0, -95], [peak, -128], [last, -95]] },
    'legF.thigh': { rot: [[0, -88], [peak, -74], [last, -88]] },
    'legB.thigh': { rot: [[0, -92], [peak, -104], [last, -92]] },
    'legB.shin': { rot: [[0, -6], [peak, -22], [last, -6]] },
    robeA: { rot: [[0, -90], [peak, -76], [last, -90]] },
    robeB: { rot: [[0, 0], [peak, 18 * s], [last, 0]] },
  });
}

const hurtCrouch = clip(10, false, {
  pelvis: { y: [[0, 86], [3, 81]], x: [[0, 0], [3, -6], [9, 0]] },
  torso: { rot: [[0, 8], [3, 0], [9, 8]] },
  chest: { rot: [[0, 6], [3, -8], [9, 6]] },
  head: { rot: [[0, 0], [3, -16], [9, 0]] },
  'armF.up': { rot: [[0, -58], [3, -84], [9, -58]] },
  'legF.thigh': { rot: [[0, -128], [3, -124], [9, -128]] },
  'legF.shin': { rot: [[0, 74], [3, 70], [9, 74]] },
  'legB.thigh': { rot: [[0, -132], [3, -132]] },
  'legB.shin': { rot: [[0, 78], [3, 78]] },
});

/* ── Knockdown and getup ──────────────────────────────────────────────────── */

const kdFall = clip(20, false, {
  // Feet leave the ground, body rotates back, lands flat.
  pelvis: { y: [[0, 150], [6, 175], [14, 34], [19, 22]], x: [[0, 0], [8, -26], [19, -54]] },
  torso: { rot: [[0, 0], [6, -28], [14, -68], [19, -84]] },
  chest: { rot: [[0, 0], [8, -18], [19, -6]] },
  head: { rot: [[0, 0], [6, -18], [19, 10]] },
  'armF.up': { rot: [[0, -75], [6, -18], [14, 26], [19, 34]] },
  'armF.fore': { rot: [[0, -20], [8, -6], [19, -12]] },
  'armB.up': { rot: [[0, -95], [6, -40], [19, 14]] },
  'legF.thigh': { rot: [[0, -88], [6, -34], [14, -6], [19, 2]] },
  'legF.shin': { rot: [[0, -4], [8, -44], [19, -18]] },
  'legB.thigh': { rot: [[0, -92], [6, -52], [19, -14]] },
  'legB.shin': { rot: [[0, -6], [8, -34], [19, -8]] },
  robeA: { rot: [[0, -90], [8, -40], [19, -4]] },
  robeB: { rot: [[0, 0], [8, 24], [19, 8]] },
});

const kdLie = clip(12, true, {
  pelvis: { y: [[0, 22], [6, 20]], x: [[0, -54], [6, -54]] },
  torso: { rot: [[0, -84], [6, -86]] },
  chest: { rot: [[0, -6], [6, -3]] },
  head: { rot: [[0, 10], [6, 13]] },
  'armF.up': { rot: [[0, 34], [6, 30]] },
  'armB.up': { rot: [[0, 14], [6, 18]] },
  'legF.thigh': { rot: [[0, 2], [6, -2]] },
  'legB.thigh': { rot: [[0, -14], [6, -10]] },
  robeA: { rot: [[0, -4], [6, -8]] },
});

const getup = clip(22, false, {
  pelvis: { y: [[0, 22], [8, 67], [16, 133], [21, 150]], x: [[0, -54], [10, -24], [21, 0]] },
  torso: { rot: [[0, -84], [8, -46], [16, -8], [21, 0]] },
  chest: { rot: [[0, -6], [10, 10], [21, 0]] },
  head: { rot: [[0, 10], [10, 4], [21, 0]] },
  'armF.up': { rot: [[0, 34], [8, -20], [16, -64], [21, -75]] },
  'armF.fore': { rot: [[0, -12], [10, -40], [21, -20]] },
  'armB.up': { rot: [[0, 14], [8, -44], [21, -95]] },
  'legF.thigh': { rot: [[0, 2], [8, -66], [16, -100], [21, -88]] },
  'legF.shin': { rot: [[0, -18], [8, 30], [16, 8], [21, -4]] },
  footF: { rot: [[0, 40], [10, 72], [21, 88]] },
  'legB.thigh': { rot: [[0, -14], [8, -78], [21, -92]] },
  'legB.shin': { rot: [[0, -8], [8, 24], [21, -6]] },
  footB: { rot: [[0, 44], [10, 76], [21, 92]] },
  robeA: { rot: [[0, -4], [8, -52], [21, -90]] },
});

const ko = clip(34, false, {
  pelvis: { y: [[0, 150], [4, 156], [12, 81], [22, 26], [33, 20]], x: [[0, 0], [12, -18], [33, -62]] },
  torso: { rot: [[0, 0], [4, 10], [12, -36], [22, -74], [33, -88]] },
  chest: { rot: [[0, 0], [6, -14], [22, -10], [33, -2]] },
  neck: { rot: [[0, 0], [6, -18], [33, 6]] },
  head: { rot: [[0, 0], [4, -12], [12, -26], [33, 14]] },
  'armF.up': { rot: [[0, -75], [4, -102], [12, -30], [22, 20], [33, 38]] },
  'armF.fore': { rot: [[0, -20], [6, -52], [22, -14], [33, -8]] },
  'armB.up': { rot: [[0, -95], [4, -124], [12, -52], [33, 18]] },
  'armB.fore': { rot: [[0, -15], [6, -44], [33, -6]] },
  'legF.thigh': { rot: [[0, -88], [6, -80], [12, -40], [22, -8], [33, 4]] },
  'legF.shin': { rot: [[0, -4], [6, -26], [12, -48], [33, -16]] },
  'legB.thigh': { rot: [[0, -92], [6, -100], [12, -58], [33, -12]] },
  'legB.shin': { rot: [[0, -6], [6, -30], [33, -6]] },
  robeA: { rot: [[0, -90], [6, -104], [12, -46], [33, -2]] },
  robeB: { rot: [[0, 0], [8, -18], [20, 26], [33, 10]] },
});

const win = clip(60, true, {
  // Arms out, chin up. Slow and pleased with itself.
  pelvis: { y: [[0, 150], [30, 153]] },
  torso: { rot: [[0, 0], [20, -4], [44, -2]] },
  chest: { rot: [[0, 0], [20, 6], [44, 3]] },
  neck: { rot: [[0, 0], [20, -4]] },
  head: { rot: [[0, 0], [16, -8], [40, -5]] },
  'armF.up': { rot: [[0, -75], [16, -6], [40, -12]] },
  'armF.fore': { rot: [[0, -20], [16, 26], [40, 18]] },
  'armB.up': { rot: [[0, -95], [16, -34], [40, -28]] },
  'armB.fore': { rot: [[0, -15], [16, 14], [40, 8]] },
  'legF.thigh': { rot: [[0, -88], [20, -84]] },
  'legB.thigh': { rot: [[0, -92], [20, -96]] },
  robeA: { rot: [[0, -90], [20, -86], [44, -92]] },
  robeB: { rot: [[0, 0], [22, 8], [46, -4]] },
});

/* ── Specials ─────────────────────────────────────────────────────────────── */

/**
 * The quarter-circle-forward projectile. Both hands come to the hip, then thrust
 * forward together on the spawn frame (11).
 */
const spQcfP = clip(34, false, {
  pelvis: { x: [[0, 0], [6, -6], [11, 6], [20, 4], [33, 0]], y: [[0, 150], [6, 142], [11, 147], [33, 150]] },
  torso: { rot: [[0, 0], [6, -10], [11, 8], [20, 6], [33, 0]] },
  chest: { rot: [[0, 0], [6, 16], [11, -12], [20, -10], [33, 0]] },
  head: { rot: [[0, 0], [6, 6], [11, -4], [33, 0]] },
  'armF.up': { rot: [[0, -75], [6, -100], [11, -12], [20, -18], [33, -75]] },
  'armF.fore': { rot: [[0, -20], [6, -70], [11, 4], [20, -6], [33, -20]] },
  'armB.up': { rot: [[0, -95], [6, -112], [11, -30], [20, -40], [33, -95]] },
  'armB.fore': { rot: [[0, -15], [6, -62], [11, 8], [20, -4], [33, -15]] },
  'legF.thigh': { rot: [[0, -88], [6, -96], [11, -78], [33, -88]] },
  'legF.shin': { rot: [[0, -4], [6, 12], [11, -8], [33, -4]] },
  'legB.thigh': { rot: [[0, -92], [6, -84], [11, -102], [33, -92]] },
  'legB.shin': { rot: [[0, -6], [6, -20], [11, -2], [33, -6]] },
  robeA: { rot: [[0, -90], [6, -80], [11, -100], [33, -90]] },
  robeB: { rot: [[0, 0], [7, 16], [13, -12], [33, 0]] },
});

/** The dragon-punch reversal: rising uppercut, body leaves the ground. */
const spDpP = clip(40, false, {
  pelvis: {
    y: [[0, 150], [3, 117], [8, 236], [16, 292], [26, 181], [34, 147], [39, 150]],
    x: [[0, 0], [3, -4], [8, 14], [20, 30], [34, 8], [39, 0]],
  },
  torso: { rot: [[0, 0], [3, 8], [8, -14], [18, -20], [30, -4], [39, 0]] },
  chest: { rot: [[0, 0], [3, 14], [8, -18], [18, -12], [39, 0]] },
  head: { rot: [[0, 0], [3, 6], [8, -12], [39, 0]] },
  // The uppercut arm swings from low behind to straight up. These are large numbers
  // because `rot` is LOCAL to the parent: the torso and chest are leaning back ~32°
  // here, so the shoulder has to over-rotate by that much to put the fist overhead.
  'armF.up': { rot: [[0, -75], [3, -104], [8, 108], [16, 116], [26, 60], [39, -75]] },
  'armF.fore': { rot: [[0, -20], [3, -58], [8, 6], [16, 2], [39, -20]] },
  'armB.up': { rot: [[0, -95], [3, -76], [8, -118], [20, -126], [39, -95]] },
  'armB.fore': { rot: [[0, -15], [3, -38], [8, -10], [39, -15]] },
  'legF.thigh': { rot: [[0, -88], [3, -122], [8, -66], [16, -52], [26, -84], [39, -88]] },
  'legF.shin': { rot: [[0, -4], [3, 50], [8, -30], [16, -40], [39, -4]] },
  footF: { rot: [[0, 88], [3, 62], [8, 104], [39, 88]] },
  'legB.thigh': { rot: [[0, -92], [3, -126], [8, -104], [16, -114], [39, -92]] },
  'legB.shin': { rot: [[0, -6], [3, 54], [8, -12], [16, 4], [39, -6]] },
  footB: { rot: [[0, 92], [3, 64], [8, 100], [39, 92]] },
  robeA: { rot: [[0, -90], [3, -74], [8, -112], [20, -120], [39, -90]] },
  robeB: { rot: [[0, 0], [4, -20], [12, 26], [26, 12], [39, 0]] },
});

/* ── The moveset ──────────────────────────────────────────────────────────── */

/**
 * Every clip a character needs, keyed by clip id.  Frame counts here are the
 * authority: the frame data in `src/fighter/data/` must agree, and
 * `scripts/rigtest.js` checks that startup + active + recovery matches.
 */
export const STANDARD_CLIPS = {
  idle,
  'walk.f': walkF,
  'walk.b': walkB,
  'crouch.in': crouchIn,
  crouch,
  'crouch.out': crouchOut,

  'jump.squat': jumpSquat,
  'jump.rise': jumpRise,
  'jump.apex': jumpApex,
  'jump.fall': jumpFall,
  land,

  'dash.f': dashF,
  'dash.b': dashB,

  // Standing normals. (frames, first active frame, how much body goes into it)
  'attack.5P.l': punch(12, 4, 0.25),
  'attack.5P.m': punch(18, 6, 0.6),
  'attack.5P.h': punch(24, 8, 1),
  'attack.5K.l': kick(14, 5, 'low'),
  'attack.5K.m': kick(20, 7, 'mid'),
  'attack.5K.h': kick(28, 11, 'high'),

  // Crouching normals.
  'attack.2P.l': crouchPunch(12, 4),
  'attack.2P.m': crouchPunch(18, 6),
  'attack.2K.l': crouchKick(14, 5),
  'attack.2K.h': crouchKick(26, 9),

  // Air normals.
  'attack.jP.m': airAttack(16, 6, 'punch'),
  'attack.jK.h': airAttack(22, 8, 'kick'),

  'block.stand': blockStand,
  'block.crouch': blockCrouch,

  'hurt.l.hi': hurt(10, 0.55),
  'hurt.h.hi': hurt(16, 1),
  'hurt.crouch': hurtCrouch,

  'kd.fall': kdFall,
  'kd.lie': kdLie,
  getup,
  ko,
  win,

  'sp.qcfP': spQcfP,
  'sp.dpP': spDpP,
};

/**
 * Copy the standard clips into a rig.
 *
 * Part tracks are dropped when the rig lacks the part they reference — the punch
 * clips swap `p.handF` to `p.fistF`, but a rig cut without a separate fist should
 * still get the punch rather than fail validation.  Clips the rig has already
 * overridden are left alone.
 */
export function installStandardClips(rig, { overwrite = false } = {}) {
  const have = new Set(rig.parts.map((p) => p.id));
  const clips = { ...rig.clips };

  for (const [id, source] of Object.entries(STANDARD_CLIPS)) {
    if (!overwrite && clips[id]) continue;

    const next = { ...source };
    if (source.parts) {
      const kept = Object.entries(source.parts).filter(([partId, tracks]) => {
        if (!have.has(partId)) return false;
        // A swap track pointing at a part that was never cut would be a no-op.
        if (tracks.swap) return tracks.swap.every(([, target]) => have.has(target));
        return true;
      });
      if (kept.length > 0) next.parts = Object.fromEntries(kept);
      else delete next.parts;
    }
    clips[id] = next;
  }

  return { ...rig, clips };
}

/** Clip ids grouped for the Move Viewer's category list. */
export const CLIP_GROUPS = [
  { label: 'Neutral', clips: ['idle', 'walk.f', 'walk.b', 'crouch.in', 'crouch', 'crouch.out'] },
  { label: 'Jump', clips: ['jump.squat', 'jump.rise', 'jump.apex', 'jump.fall', 'land'] },
  { label: 'Dash', clips: ['dash.f', 'dash.b'] },
  { label: 'Standing', clips: ['attack.5P.l', 'attack.5P.m', 'attack.5P.h', 'attack.5K.l', 'attack.5K.m', 'attack.5K.h'] },
  { label: 'Crouching', clips: ['attack.2P.l', 'attack.2P.m', 'attack.2K.l', 'attack.2K.h'] },
  { label: 'Air', clips: ['attack.jP.m', 'attack.jK.h'] },
  { label: 'Defence', clips: ['block.stand', 'block.crouch'] },
  { label: 'Reactions', clips: ['hurt.l.hi', 'hurt.h.hi', 'hurt.crouch'] },
  { label: 'Knockdown', clips: ['kd.fall', 'kd.lie', 'getup', 'ko'] },
  { label: 'Specials', clips: ['sp.qcfP', 'sp.dpP'] },
  { label: 'Flavour', clips: ['win'] },
];
