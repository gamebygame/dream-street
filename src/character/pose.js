import { mod, smooth, wardrobeAt, themeWeightsAt, FOUR_HIT_WINDOW } from '../content/plan.js';
import { CONFIG } from '../config.js';
import { greetingAt } from '../content/social.js';

const TAU = Math.PI * 2;
const ease = t => t * t * (3 - 2 * t),
  mix = (a, b, t) => a + (b - a) * t;
const vMix = (a, b, t) => a.map((v, i) => mix(v, b[i], t));

// Elbows hinge backward. Arm IK pulls each elbow behind, outside and below the shoulder-hand line; a pole in
// front of the body (the knee's direction) lifts the upper arm forward into a zombie-like reach.
export const ELBOW_POLES = Object.freeze({
  left: Object.freeze([0.35, -0.3, -1]),
  right: Object.freeze([-0.35, -0.3, -1]),
});
const SHOULDER_X = 0.285,
  SHOULDER_ABOVE_HIP = 0.43,
  UPPER_ARM = 0.355,
  FOREARM = 0.32;

export function walkFoot(beat, side) {
  const p = mod(beat + (side === 1 ? 0 : 1), 2),
    stride = CONFIG.distancePerBeat / CONFIG.actorScale;
  if (p < 1) return [side * 0.19, 0.095, stride * (0.5 - p)];
  const u = p - 1;
  return [side * 0.19, 0.095 + 0.1 * Math.sin(Math.PI * u), stride * (ease(u) - 0.5)];
}
/**
 * Shoulder flexion (+ swings back), elbow flexion and abduction for a confident everyday walk. Each arm swings
 * opposite its own leg with a slight lag and bends most at the front of the swing. Gait studies measure roughly
 * 30 degrees of elbow range in ordinary walking; this swing covers 15-45 degrees of elbow and about 39 degrees of
 * shoulder travel.
 */
function armSwing(beat, side) {
  const phase = Math.PI * beat + (side === 1 ? 0 : Math.PI);
  return [0.34 * Math.cos(phase - 0.12), 0.26 + 0.26 * (1 - Math.cos(phase - 0.36)), side * 0.12];
}
/** Forward kinematics of armSwing, used as the IK target so walking blends continuously into gestures. */
function swingHand(hipY, side, [flex, bend, spread]) {
  const sa = Math.sin(spread),
    ca = Math.cos(spread),
    sf = Math.sin(flex),
    cf = Math.cos(flex),
    sb = Math.sin(bend),
    cb = Math.cos(bend);
  return [
    side * SHOULDER_X + (UPPER_ARM + FOREARM * cb) * sa,
    hipY + SHOULDER_ABOVE_HIP - (UPPER_ARM + FOREARM * cb) * ca * cf - FOREARM * sb * sf,
    -(UPPER_ARM + FOREARM * cb) * ca * sf + FOREARM * sb * cf,
  ];
}
function base(beat) {
  const s = Math.cos(Math.PI * beat),
    hipY = 0.91 - 0.018 * Math.cos(TAU * beat),
    leftArmSwing = armSwing(beat, 1),
    rightArmSwing = armSwing(beat, -1);
  return {
    // The body is lowest at each heel strike and highest over the planted foot.
    hip: [0.012 * Math.sin(Math.PI * beat), hipY, 0],
    yaw: 0,
    // The pelvis turns with the forward leg and the chest counter-rotates; the head stays level and forward.
    pelvis: -0.05 * s,
    chest: [0.045, 0.09 * s, 0.008 * Math.sin(Math.PI * beat)],
    head: [-0.045, -0.04 * s, 0],
    leftHand: swingHand(hipY, 1, leftArmSwing),
    rightHand: swingHand(hipY, -1, rightArmSwing),
    leftFoot: walkFoot(beat, 1),
    rightFoot: walkFoot(beat, -1),
    leftArmWalk: 1,
    rightArmWalk: 1,
    leftElbowPole: [...ELBOW_POLES.left],
    rightElbowPole: [...ELBOW_POLES.right],
    leftArmSwing,
    rightArmSwing,
    leftWrist: [0.04 * Math.sin(Math.PI * beat - 0.5), 0, 0.04],
    rightWrist: [-0.04 * Math.sin(Math.PI * beat - 0.5), 0, -0.04],
    leftAnkle: [0, 0, 0],
    rightAnkle: [0, 0, 0],
    coat: 0.035 * s,
    propTurn: 0,
    propOpen: 1,
  };
}
export function sampleWalk(beat, { social = true } = {}) {
  const p = base(beat);
  if (social) {
    const cue = greetingAt(beat);
    p.head[1] += cue.look;
    p.chest[1] += cue.look * 0.1;
    p.head[0] += 0.1 * Math.abs(cue.reply);
    if (cue.reply < 0) {
      p.rightHand = vMix(p.rightHand, [-0.53, 1.66, 0.18], -cue.reply);
      p.rightArmWalk = 1 + cue.reply;
    }
    if (cue.reply > 0) {
      p.leftHand = vMix(p.leftHand, [0.53, 1.66, 0.18], cue.reply);
      p.leftArmWalk = 1 - cue.reply;
    }
  }
  return p;
}

/** Everyday holds for someone standing still: 0 relaxed, 1 hands behind the back, 2 in pockets, 3 one hand in a pocket. */
export const STAND_STYLES = 4;
/**
 * Standing on the pavement before the dance reaches them: weight settled over one foot and shifting slowly, the
 * head wandering. `seed` desynchronises neighbours. Arms hang on the walk's joint arcs or rest in a pocket, never
 * lifted.
 */
export function sampleStand(beat, style = 0, seed = 0) {
  const shift = Math.sin((TAU * beat) / 11 + seed),
    glance = Math.sin((TAU * beat) / 7.3 + seed * 1.7),
    hipY = 0.9 - 0.006 * Math.abs(shift),
    hang = side => [0.03 + 0.02 * shift * side, 0.17, side * 0.1];
  const p = {
    ...base(0),
    hip: [0.035 * shift, hipY, 0],
    pelvis: 0.05 * shift,
    chest: [0.03, -0.035 * shift, -0.02 * shift],
    head: [0.03, 0.2 * glance, 0.025 * shift],
    leftFoot: [0.17, 0.095, 0.05],
    rightFoot: [-0.17, 0.095, -0.03],
    leftArmSwing: hang(1),
    rightArmSwing: hang(-1),
    leftWrist: [0, 0, 0.05],
    rightWrist: [0, 0, -0.05],
    coat: 0.01 * shift,
  };
  p.leftHand = swingHand(hipY, 1, p.leftArmSwing);
  p.rightHand = swingHand(hipY, -1, p.rightArmSwing);
  if (style === 1) {
    p.leftHand = [0.08, hipY - 0.05, -0.17];
    p.rightHand = [-0.08, hipY - 0.04, -0.17];
    p.leftArmWalk = 0;
    p.rightArmWalk = 0;
  } else if (style === 2 || style === 3) {
    p.rightHand = [-0.21, hipY - 0.07, 0.07];
    p.rightArmWalk = 0;
    if (style === 2) {
      p.leftHand = [0.21, hipY - 0.07, 0.07];
      p.leftArmWalk = 0;
    }
  }
  return p;
}

const pose = overrides => ({
  ...base(0),
  // Dance keyframes start from a neutral stance rather than from the walk's step phase.
  pelvis: 0,
  chest: [0.018, 0.026, 0],
  head: [-0.025, 0, 0],
  leftArmWalk: 0,
  rightArmWalk: 0,
  hip: [0, 0.9, 0],
  leftHand: [0.29, 0.72, 0.02],
  rightHand: [-0.29, 0.72, 0.02],
  leftFoot: [0.2, 0.095, 0.03],
  rightFoot: [-0.2, 0.095, -0.03],
  ...overrides,
});

// Full-body phrases alternate release, weight transfer, travel and punctuation.
// prettier-ignore
const ELECTRIC=[
  [0,pose({hip:[-.10,.91,0],leftHand:[.27,.68,-.14],rightHand:[-.36,.91,.23],rightFoot:[-.29,.095,.24],chest:[-.04,-.14,.10]})],
  [1,pose({hip:[.12,.84,.01],leftHand:[.44,1.06,.16],rightHand:[-.27,.65,-.12],leftFoot:[.34,.095,.22],rightFoot:[-.15,.16,-.22],rightAnkle:[-.35,.22,0],chest:[.12,.20,-.13]})],
  [2,pose({hip:[.14,.93,-.03],yaw:.23,leftHand:[.21,.73,-.14],rightHand:[-.20,1.38,.38],leftFoot:[.31,.095,-.22],rightFoot:[-.19,.12,.24],leftAnkle:[0,-.3,0],chest:[-.08,-.20,-.09]})],
  [3,pose({hip:[-.12,.87,0],leftHand:[.38,1.33,.26],rightHand:[-.29,.67,-.10],leftFoot:[.10,.19,.27],rightFoot:[-.32,.095,-.07],chest:[.10,.28,.15]})],
  [4,pose({hip:[-.04,.92,0],yaw:-.22,leftHand:[.27,.68,-.10],rightHand:[-.13,1.98,.16],rightWrist:[0,0,-.35],head:[.10,-.12,-.12],leftFoot:[.12,.095,-.20],rightFoot:[-.24,.095,.25]})],
  [4.5,pose({hip:[-.05,.90,0],yaw:-.22,leftHand:[.28,.70,-.12],rightHand:[-.13,1.98,.16],head:[.10,-.12,-.12]})],
  [5.5,pose({hip:[.08,.85,0],yaw:.20,leftHand:[.50,.92,.06],rightHand:[-.40,.68,-.20],leftFoot:[.30,.095,-.16],rightFoot:[-.22,.26,.40],rightAnkle:[-.35,0,0],chest:[.14,-.24,-.11]})],
  [6.5,pose({hip:[.10,.93,0],yaw:.48,leftHand:[.58,1.64,.09],rightHand:[-.27,.68,-.06],leftFoot:[.35,.095,.14],rightFoot:[-.14,.12,-.24],chest:[-.09,.28,-.14]})],
  [7.2,pose({hip:[-.05,.85,0],yaw:.08,leftHand:[.12,1.20,.38],rightHand:[-.16,1.10,.35],leftFoot:[.15,.12,-.05],rightFoot:[-.23,.095,.06],chest:[.15,-.17,0]})],
  [8,pose({hip:[-.12,.89,0],yaw:-.38,leftHand:[.33,.66,-.10],rightHand:[-.57,1.42,.10],leftFoot:[.21,.095,.28],rightFoot:[-.36,.095,-.13],chest:[-.08,-.2,.13]})],
  [9,pose({hip:[.08,.86,-.02],yaw:-.65,leftHand:[.28,.72,.12],rightHand:[-.35,.73,-.12],leftFoot:[.15,.095,-.25],rightFoot:[-.18,.17,.24],leftAnkle:[0,.32,0],chest:[.13,.21,-.09]})],
  [10,pose({hip:[.05,.96,0],yaw:.45,leftHand:[.22,1.27,.27],rightHand:[-.29,.71,-.20],leftFoot:[.28,.17,.22],rightFoot:[-.23,.095,-.20],chest:[-.12,-.20,0]})],
  [11,pose({hip:[-.14,.86,0],yaw:.18,leftHand:[.43,.82,-.14],rightHand:[-.43,.85,.18],leftFoot:[.12,.12,-.28],rightFoot:[-.35,.095,.23],chest:[.14,.14,.12]})],
  [12,pose({hip:[-.12,.91,0],yaw:0,leftHand:[.31,.69,-.12],rightHand:[-.64,1.21,.02],leftFoot:[.33,.095,.04],rightFoot:[-.33,.095,.04],chest:[-.09,-.23,.12]})],
  [13,pose({hip:[.08,.84,0],yaw:-.24,leftHand:[.44,1.12,.25],rightHand:[-.21,.70,-.03],leftFoot:[.10,.095,.25],rightFoot:[-.25,.16,-.13],chest:[.16,.17,-.14]})],
  [14,pose({hip:[.10,.94,0],yaw:.14,leftHand:[.20,.73,-.11],rightHand:[-.24,1.51,.25],leftFoot:[.34,.095,-.10],rightFoot:[-.12,.19,.22],head:[-.10,0,0],chest:[-.12,-.18,-.10]})],
  [15,pose({hip:[-.04,.86,0],leftHand:[.39,.86,.20],rightHand:[-.28,.70,-.15],leftFoot:[.20,.14,.22],rightFoot:[-.28,.095,-.10],chest:[.10,.14,.08]})],
];
// prettier-ignore
const LYRIC=[
  [0,pose({hip:[-.04,.90,0],yaw:-.16,leftHand:[.16,.93,.26],rightHand:[-.15,1.12,.30],head:[.12,-.12,.035],chest:[.09,-.08,.04]})],
  [4,pose({hip:[-.06,.885,.015],yaw:-.18,leftHand:[.13,1.04,.27],rightHand:[-.13,1.17,.29],head:[.20,-.10,.04],chest:[.14,-.09,.05]})],
  [8,pose({hip:[-.06,.885,.015],yaw:-.18,leftHand:[.14,1.02,.28],rightHand:[-.14,1.16,.30],head:[.18,-.12,.04],chest:[.13,-.09,.05]})],
  [12,pose({hip:[.035,.91,0],yaw:.06,leftHand:[.42,1.08,.24],rightHand:[-.20,.99,.29],leftFoot:[.30,.095,.13],rightFoot:[-.15,.095,-.08],leftAnkle:[0,-.15,-.035],head:[.03,.22,-.025],chest:[.035,.06,-.025]})],
  [16,pose({hip:[.055,.915,0],yaw:.22,leftHand:[.54,1.17,.10],rightHand:[-.27,.84,.19],leftFoot:[.36,.095,.15],rightFoot:[-.15,.095,-.08],leftAnkle:[.045,-.24,-.04],head:[-.025,.28,-.05],chest:[-.015,.08,-.035]})],
  [20,pose({hip:[.055,.915,0],yaw:.22,leftHand:[.51,1.15,.13],rightHand:[-.27,.84,.19],leftFoot:[.36,.095,.15],rightFoot:[-.15,.095,-.08],leftAnkle:[.045,-.24,-.04],head:[.005,.24,-.05],chest:[.005,.08,-.035]})],
  [24,pose({hip:[.025,.90,0],yaw:.09,leftHand:[.34,.93,.24],rightHand:[-.21,.91,.27],leftFoot:[.26,.095,.05],rightFoot:[-.16,.095,-.05],head:[.10,.05,-.02],chest:[.07,.035,-.01]})],
  [28,pose({hip:[-.025,.89,.01],yaw:-.08,leftHand:[.18,.87,.29],rightHand:[-.16,1.01,.31],head:[.16,-.10,.03],chest:[.12,-.05,.025]})],
];

// The four-hit memory (H1-01): four garments, four signature accents on beats 50, 52, 54 and 56 - press the hat,
// pop the chest and shoulders, turn and stand firm, open the body. Each accent has an anticipation, an arrival, a
// brief readable hold and a recovery. Restored from the G1 phrase and re-posed for backward-hinged elbows.
// prettier-ignore
const HAT=pose({hip:[-.025,.86,.015],chest:[.08,.08,.08],head:[.10,-.08,-.12],rightHand:[-.13,1.91,.19],leftHand:[.53,1.04,.30],rightFoot:[-.22,.095,.29]});
// prettier-ignore
const CHEST_POP=pose({hip:[0,.85,0],chest:[-.12,0,0],head:[-.05,0,0],leftHand:[.75,1.43,.21],rightHand:[-.75,1.43,.21],leftFoot:[.29,.095,.15],rightFoot:[-.29,.095,.15]});
// prettier-ignore
const TURN=pose({hip:[.015,.89,0],yaw:-.72,chest:[.015,-.15,-.10],head:[0,.14,0],leftHand:[.62,1.60,.18],rightHand:[-.38,1.13,.41],leftFoot:[.24,.095,.26],rightFoot:[-.24,.095,-.23],coat:.35});
// prettier-ignore
const OPEN=pose({hip:[0,.94,0],yaw:.05,chest:[-.085,0,0],head:[-.06,0,0],leftHand:[.87,1.65,.08],rightHand:[-.87,1.65,.08],leftFoot:[.26,.095,.08],rightFoot:[-.26,.095,.08],coat:.12});
// A held accent keeps a little life instead of freezing the whole body.
const settle = accent => blendPose(accent, pose({}), 0.1);
// Local beat 0 is the cycle's beat 48; the accents land on local beats 2, 4, 6 and 8.
// prettier-ignore
const FOUR_HIT=[
  [0,pose({})],
  [1.2,pose({hip:[-.02,.87,0],chest:[.12,0,.04],rightHand:[-.27,1.65,.34],leftHand:[.32,.98,.36]})],
  [1.82,pose({...HAT,hip:[-.03,.83,0],rightHand:[-.16,1.83,.25]})],
  [2,HAT],[2.42,settle(HAT)],
  [3.15,pose({hip:[0,.89,0],chest:[.08,0,0],leftHand:[.17,1.19,.43],rightHand:[-.17,1.19,.43]})],
  [3.8,pose({hip:[0,.79,0],leftHand:[.49,1.30,.33],rightHand:[-.49,1.30,.33]})],
  [4,CHEST_POP],[4.42,settle(CHEST_POP)],
  [5.12,pose({hip:[.04,.85,0],yaw:.25,chest:[.06,.10,0],leftHand:[.34,1.21,.42],rightHand:[-.51,1.52,.27],coat:-.12})],
  [5.8,pose({...TURN,yaw:-.52,hip:[.04,.86,0],coat:.24})],
  [6,TURN],[6.4,settle(TURN)],
  [7.1,pose({hip:[0,.86,0],yaw:-.26,chest:[.12,0,0],leftHand:[.22,1.10,.40],rightHand:[-.22,1.10,.40],coat:.22})],
  [7.8,pose({...OPEN,hip:[0,.87,0],leftHand:[.65,1.39,.24],rightHand:[-.65,1.39,.24]})],
  [8,OPEN],[8.52,settle(OPEN)],
  [10,pose({hip:[0,.91,0],leftHand:[.56,1.25,.21],rightHand:[-.56,1.25,.21],coat:.04})],
];
/** Weight of the four-hit phrase: eases in over the first beat of its window and out over the last. */
function fourHitWeight(beat) {
  const local = mod(beat, CONFIG.cycleBeats) - FOUR_HIT_WINDOW.start,
    length = FOUR_HIT_WINDOW.end - FOUR_HIT_WINDOW.start;
  return smooth(local) * (1 - smooth(local - length + 1));
}

function cubic(a, b, c, d, t, leftScale, rightScale) {
  const m1 = (c - a) * leftScale,
    m2 = (d - b) * rightScale;
  return (
    (2 * t * t * t - 3 * t * t + 1) * b +
    (t * t * t - 2 * t * t + t) * m1 +
    (-2 * t * t * t + 3 * t * t) * c +
    (t * t * t - t * t) * m2
  );
}
function phrase(keys, beat, length = 16) {
  const t = mod(beat, length);
  let i = keys.findIndex((k, n) => t >= k[0] && t < (keys[n + 1]?.[0] ?? length));
  if (i < 0) i = 0;
  const a = keys[mod(i - 1, keys.length)][1],
    b = keys[i][1],
    c = keys[(i + 1) % keys.length][1],
    d = keys[(i + 2) % keys.length][1];
  const at = keys[mod(i - 1, keys.length)][0] - (i === 0 ? length : 0),
    bt = keys[i][0];
  const ct = keys[(i + 1) % keys.length][0] + (i + 1 >= keys.length ? length : 0),
    dt = keys[(i + 2) % keys.length][0] + (i + 2 >= keys.length ? length : 0);
  const u = (t - bt) / (ct - bt),
    leftScale = (0.7 * (ct - bt)) / (ct - at),
    rightScale = (0.7 * (ct - bt)) / (dt - bt),
    result = {};
  for (const key of Object.keys(b))
    result[key] = Array.isArray(b[key])
      ? b[key].map((v, j) => cubic(a[key][j], v, c[key][j], d[key][j], u, leftScale, rightScale))
      : cubic(a[key], b[key], c[key], d[key], u, leftScale, rightScale);
  result.leftFoot[1] = Math.max(0.095, result.leftFoot[1]);
  result.rightFoot[1] = Math.max(0.095, result.rightFoot[1]);
  return result;
}
export function blendPose(a, b, t) {
  const result = {};
  for (const key of Object.keys(a))
    result[key] = Array.isArray(a[key]) ? vMix(a[key], b[key], t) : mix(a[key], b[key], t);
  return result;
}

function bodyPhrase(beat, theme, outfit) {
  const lyric = theme === 'lyric';
  let p = lyric ? phrase(LYRIC, beat - 144, 32) : phrase(ELECTRIC, beat + (theme === 'parade' ? 4 : 0));
  const fourHit = theme === 'daylight' ? fourHitWeight(beat) : 0;
  if (fourHit > 0) {
    const local = mod(beat, CONFIG.cycleBeats) - FOUR_HIT_WINDOW.start;
    p = blendPose(p, phrase(FOUR_HIT, local, FOUR_HIT_WINDOW.end - FOUR_HIT_WINDOW.start), fourHit);
  }
  // Sustained movement has its own timing; the electric outfit accents must not leak into it.
  if (lyric) {
    const breath = Math.sin((TAU * (beat - 144)) / 16);
    p.hip[1] += 0.003 * breath;
    p.chest[0] += 0.008 * breath;
    p.coat = 0.025 * Math.sin((TAU * (beat - 146)) / 16);
    p.leftWrist = [0.06 * breath, 0, 0.12];
    p.rightWrist = [-0.04 * breath, 0, -0.12];
    if (outfit === 'open') {
      p.leftHand[0] *= 1.06;
      p.rightHand[0] *= 1.06;
    }
    return p;
  }
  const pulse = Math.sin(Math.PI * beat),
    rise = Math.max(0, Math.sin((Math.PI * beat) / 2));
  if (theme === 'pocket') {
    p.hip[1] -= 0.025;
    p.chest[1] *= 1.25;
    p.coat += 0.09 * pulse;
  }
  if (theme === 'parade') {
    p.hip[1] += 0.02 * rise;
    p.leftAnkle[0] -= 0.18 * rise;
    p.head[2] += 0.06 * pulse;
  }
  if (outfit === 'sport') {
    p.chest[1] *= 1.2;
    p.hip[1] -= 0.025;
    p.chest[0] += 0.055 * Math.sin(TAU * beat);
  }
  if (outfit === 'coat') {
    p.yaw *= 1.18;
    p.coat += 0.18 * Math.sin((Math.PI * beat) / 4);
  }
  if (outfit === 'open') {
    p.leftHand[0] *= 1.1;
    p.rightHand[0] *= 1.1;
    p.chest[2] *= 1.12;
  }
  p.coat += 0.1 * pulse;
  p.leftWrist[2] += 0.16 * Math.sin((Math.PI * beat) / 2);
  p.rightWrist[2] -= 0.14 * pulse;
  return p;
}
function propPhrase(id, beat, age, basePose, tender) {
  const p = { ...basePose };
  for (const key of Object.keys(p)) if (Array.isArray(p[key])) p[key] = [...p[key]];
  const a = (Math.max(0, age) / 8) * TAU;
  if (id === 'bouquet') {
    p.rightHand = [-0.34 - 0.2 * Math.sin(a), 1.14 + 0.35 * Math.sin(a * 0.5), 0.25 + 0.18 * Math.cos(a)];
    p.rightWrist = [0.18 * Math.sin(a), 0.5 * Math.sin(a), -0.65 * Math.sin(a)];
    p.propTurn = 0.65 * Math.sin(a);
    p.leftHand = [0.4 + 0.14 * Math.sin(a), 0.78 + 0.24 * Math.max(0, -Math.sin(a)), 0.04];
    p.head = [0.1, -0.25 * Math.sin(a * 0.5), -0.1 * Math.sin(a)];
    p.chest[2] += 0.08 * Math.sin(a);
  } else if (id === 'rose') {
    p.yaw += 0.24 * Math.sin(a);
    p.head = [-0.06, -0.35 * Math.sin(a * 0.5), 0.12 * Math.sin(a)];
    p.leftHand = [0.45 + 0.14 * Math.sin(a), 0.9 + 0.4 * Math.max(0, Math.sin(a)), 0.12];
    p.rightHand = [-0.32, 0.73 + 0.15 * Math.max(0, -Math.sin(a)), 0];
    p.chest[0] -= 0.055;
  } else if (id === 'umbrella') {
    p.rightHand = [-0.43, 1.64 + 0.08 * Math.sin(a), 0.06];
    p.rightWrist = [0, 0.25 * Math.sin(a), -0.15];
    p.propTurn = a;
    p.propOpen = 0.85 + 0.15 * Math.sin(a * 0.5);
    p.yaw += 0.23 * Math.sin(a);
    p.leftHand = [0.43 + 0.17 * Math.sin(a), 0.7 + 0.31 * Math.max(0, Math.sin(a)), 0.08];
    p.head[2] -= 0.12 * Math.sin(a);
  } else if (id === 'cane') {
    const sweep = Math.sin(a),
      plant = Math.max(0, Math.cos(a));
    p.rightHand = [-0.4 - 0.16 * sweep, 0.82 + 0.38 * (1 - plant), 0.23 + 0.13 * sweep];
    p.rightWrist = [0.25 * sweep, 0, 0.58 * sweep];
    p.propTurn = 0.18 * sweep;
    p.leftHand = [0.3, 0.73 + 0.55 * Math.max(0, -sweep), -0.06];
    p.chest[0] += 0.09 * plant;
    p.head[0] += 0.08 * plant;
    p.head[1] -= 0.22 * sweep;
    p.rightAnkle[0] -= 0.25 * Math.max(0, sweep);
  } else if (id === 'watch') {
    const inspect = Math.max(0, Math.sin(a));
    p.rightHand = [-0.27, 1.03 + 0.53 * inspect, 0.32];
    p.rightWrist = [-0.3 * inspect, 0.25, 0.35 * Math.cos(a)];
    p.propTurn = 0.65 * Math.sin(a * 2);
    p.head[0] += 0.18 * inspect;
    p.head[1] -= 0.32 * inspect;
    p.leftHand = [0.29, 0.7, -0.1];
    p.chest[1] += 0.1 * Math.sin(a * 4);
  } else if (id === 'record') {
    p.rightHand = [-0.33 - 0.17 * Math.sin(a), 0.89 + 0.46 * Math.max(0, Math.sin(a)), 0.26];
    p.rightWrist = [0.4 * Math.sin(a), a, 0];
    p.propTurn = a;
    p.leftHand = [0.39, 0.71 + 0.6 * Math.max(0, -Math.sin(a)), 0.15];
    p.head[1] = -0.22 * Math.sin(a);
  } else if (id === 'puppet') {
    p.hip[1] -= 0.05 * (1 + Math.sin(a));
    p.rightHand = [-0.37, 1.05 + 0.27 * Math.sin(a * 2), 0.38];
    p.rightWrist = [0.16 * Math.sin(a * 2), 0, 0.32 * Math.sin(a)];
    p.propTurn = 0.2 * Math.sin(a * 2);
    p.leftHand = [0.32, 0.74 + 0.25 * Math.max(0, -Math.sin(a * 2)), 0.08];
    p.head[0] = 0.13 + 0.09 * Math.sin(a * 2);
  } else if (id === 'cup') {
    const toast = Math.max(0, Math.sin(a));
    p.rightHand = [-0.27, 0.83 + 0.65 * toast, 0.3];
    p.rightWrist = [-0.3 * toast, 0, 0.07];
    p.leftHand = [0.35, 0.69, -0.12];
    p.head[0] = -0.12 * toast;
    p.chest[0] -= 0.08 * toast;
  } else if (id === 'scarf') {
    p.leftHand = [0.32, 1.05 + 0.38 * Math.sin(a), 0.2];
    p.leftWrist[2] = 0.4 * Math.sin(a);
    p.yaw += 0.16 * Math.sin(a);
  }
  if (tender > 0 && ['bouquet', 'rose', 'umbrella'].includes(id)) {
    const q = { ...basePose };
    for (const key of Object.keys(q)) if (Array.isArray(q[key])) q[key] = [...q[key]];
    const breath = Math.sin((Math.max(0, age) / 16) * TAU),
      offer = 0.5 - 0.5 * Math.cos((Math.max(0, age) / 24) * TAU);
    if (id === 'bouquet') {
      q.rightHand = [-0.18 - 0.17 * offer, 1.13 + 0.07 * offer, 0.29 + 0.14 * offer];
      q.rightWrist = [0.1, 0.1, -0.12 - 0.22 * offer];
      q.leftHand = [0.1 + 0.2 * offer, 1.0 - 0.12 * offer, 0.31];
      q.leftWrist = [0.08, 0, 0.22];
      q.head = [0.17 - 0.14 * offer, -0.15 - 0.12 * offer, 0.025];
      q.chest[0] += 0.035 * (1 - offer);
      q.propTurn = 0.12 * breath;
    } else if (id === 'rose') {
      q.leftHand = [0.28 + 0.14 * offer, 0.84 + 0.22 * offer, 0.23];
      q.rightHand = [-0.19, 0.91 + 0.07 * breath, 0.28];
      q.leftWrist = [0.04, 0, 0.18];
      q.rightWrist = [0.03, 0, -0.12];
      q.head = [0.1 - 0.11 * offer, 0.2 * breath, -0.045];
      q.yaw += 0.1 * offer;
    } else {
      q.rightHand = [-0.43, 1.66 + 0.02 * breath, 0.06];
      q.rightWrist = [0, 0.1 * breath, -0.15];
      q.leftHand = [0.3 + 0.13 * offer, 0.89 + 0.08 * breath, 0.24];
      q.leftWrist = [-0.1, 0, 0.14];
      q.head = [0.04, 0.14 * breath, -0.035];
      q.propTurn = 0.22 * breath;
      q.propOpen = 1;
    }
    return blendPose(p, q, tender);
  }
  return p;
}

/**
 * The reflection's dance. Passers-by and cyclists imitate it with `props: false`: they hold nothing, so they must
 * not mime the reflection's bouquet, cane or record gestures.
 */
export function sampleDance(beat, state = wardrobeAt(beat), { props = true } = {}) {
  const themes = themeWeightsAt(beat);
  let p,
    total = 0;
  for (const [outfit, weight] of Object.entries(state.weights))
    for (const theme of themes) {
      const w = weight * theme.weight;
      if (w <= 0) continue;
      const q = bodyPhrase(beat, theme.id, outfit);
      p = p ? blendPose(p, q, w / (total + w)) : q;
      total += w;
    }
  if (!props) return p;
  const tender = themes.find(t => t.id === 'lyric')?.weight || 0;
  for (const [id, weight] of Object.entries(state.accessoryWeights))
    if (weight > 0) p = blendPose(p, propPhrase(id, beat, beat - state.accessoryStarts[id], p, tender), weight);
  return p;
}
