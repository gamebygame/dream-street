import { CONFIG } from '../config.js';
import { mod, smooth } from './plan.js';
import { sampleDance, blendPose, sampleWalk } from '../character/pose.js';

const WALK = CONFIG.distancePerBeat;

/*
 * Two people out riding. Each is first seen cycling as anyone would, then turns in beside the walker: `merged` is
 * the beat they reach their place (relative to the walker), `join` the beat their imitation is in full swing, and
 * `leave` the beat they ride on ahead.
 *
 *   morning    rides out of the near side street at the first crossroad and turns in ahead of the walker, leading
 *              the procession down the middle of the road, where no one joining the crowd ever crosses
 *   afternoon  rides down the road toward the walker, turns back beside him and keeps his pace through the parade
 */
export const CYCLISTS = Object.freeze([
  {
    id: 'bicycle-morning',
    slot: [0, 6],
    approach: { vx: 1.1, vs: 0, T: 6 },
    merged: 78,
    join: 96,
    leave: 130,
    end: 162,
    color: '#507c77',
    skinColor: '#9c6b51',
  },
  {
    id: 'bicycle-afternoon',
    slot: [5.35, -1.8],
    approach: { x: 3, vx: 0, vs: -1, T: 6 },
    merged: 197,
    join: 214,
    leave: 234,
    end: 256,
    color: '#b07d52',
    skinColor: '#d1ab86',
  },
]);

const hermite = (p0, m0, p1, m1, u) =>
  (2 * u ** 3 - 3 * u * u + 1) * p0 +
  (u ** 3 - 2 * u * u + u) * m0 +
  (3 * u * u - 2 * u ** 3) * p1 +
  (u ** 3 - u * u) * m1;
const hermiteSlope = (p0, m0, p1, m1, u) =>
  (6 * u * u - 6 * u) * p0 + (3 * u * u - 4 * u + 1) * m0 + (6 * u - 6 * u * u) * p1 + (3 * u * u - 2 * u) * m1;
const GAUSS = [
  [0.0469101, 0.1184634],
  [0.2307653, 0.2393143],
  [0.5, 0.2844444],
  [0.7692347, 0.2393143],
  [0.9530899, 0.1184634],
];

/** Street position at the start of the turn-in, placed so both the road and the turn are ridden without overshoot. */
function turnStart({ slot: [xs, zs], approach: { x, vx, vs, T }, merged }) {
  return {
    x: vx ? xs - (vx * T) / 2 : x,
    s: WALK * merged + zs - ((vs + WALK) / 2) * T,
  };
}
function turning(person, b) {
  const { slot, approach, merged } = person,
    { T, vx, vs } = approach,
    start = turnStart(person),
    u = Math.max(0, Math.min(1, (b - merged + T) / T)),
    endS = WALK * merged + slot[1];
  return {
    x: hermite(start.x, vx * T, slot[0], 0, u),
    s: hermite(start.s, vs * T, endS, WALK * T, u),
    vx: hermiteSlope(start.x, vx * T, slot[0], 0, u) / T,
    vs: hermiteSlope(start.s, vs * T, endS, WALK * T, u) / T,
  };
}
function riddenWhileTurning(person, b) {
  const from = person.merged - person.approach.T,
    span = Math.max(0, Math.min(b, person.merged) - from);
  let length = 0;
  for (const [node, weight] of GAUSS) {
    const { vx, vs } = turning(person, from + node * span);
    length += weight * Math.hypot(vx, vs);
  }
  return length * span;
}

const HIDDEN = Object.freeze({ visible: false, x: 0, z: -30, yaw: 0, distance: 0, participation: 0 });
export function cyclistState(person, beat) {
  const b = mod(beat, CONFIG.cycleBeats),
    { slot, approach, merged, join, leave, end } = person,
    walker = WALK * b,
    from = merged - approach.T;
  if (b >= end) return HIDDEN;
  let x, s, yaw, distance;
  if (b < from) {
    const start = turnStart(person);
    x = start.x + approach.vx * (b - from);
    s = start.s + approach.vs * (b - from);
    yaw = Math.atan2(approach.vx, approach.vs);
    distance = Math.hypot(approach.vx, approach.vs) * (b - from);
  } else if (b < merged) {
    const t = turning(person, b);
    ({ x, s } = t);
    yaw = Math.atan2(t.vx, t.vs);
    distance = riddenWhileTurning(person, b);
  } else {
    const exit = 26 * smooth((b - leave) / (end - leave));
    x = slot[0];
    s = walker + slot[1] + exit;
    yaw = 0;
    distance = riddenWhileTurning(person, merged) + WALK * (b - merged) + exit;
  }
  const z = s - walker;
  if (z > 30 || z < -18 || Math.abs(x) > 32) return HIDDEN;
  const greeting = smooth((b - join + 20) / 3) * (1 - smooth((b - join + 12) / 3));
  const farewell = smooth((b - leave + 1) / 2) * (1 - smooth((b - leave - 7) / 3));
  return {
    visible: true,
    x,
    z,
    yaw,
    distance,
    acknowledgement: Math.max(greeting, farewell),
    greetingPhase: b - (greeting > farewell ? join - 20 : leave - 1),
    participation: smooth((b - join + 12) / 10) * (1 - smooth((b - leave) / 5)),
  };
}
export function cyclistPose(person, beat, state, wardrobe) {
  const p = blendPose(
    sampleWalk(beat, { social: false }),
    sampleDance(beat, wardrobe, { props: false }),
    state.participation * 0.72,
  );
  const phase = (state.distance / 1.9) * Math.PI * 2;
  p.leftArmWalk = 0;
  p.rightArmWalk = 0;
  p.hip = [0, 0.94, -0.12];
  p.yaw = 0;
  p.chest = [0.16, 0.035 * Math.sin(beat * Math.PI) * state.participation, 0.015];
  const proximity = smooth((state.z + 12) / 5) * (1 - smooth((state.z - 12) / 6));
  // The walker's direction as seen from the saddle; a rider ahead glances back over the shoulder.
  const toward = Math.atan2(-state.x, -state.z) - state.yaw,
    look = Math.max(-1.12, Math.min(1.12, Math.atan2(Math.sin(toward), Math.cos(toward))));
  p.head = [
    -0.06 + 0.13 * Math.sin(Math.PI * state.greetingPhase) * state.acknowledgement,
    look * proximity * 0.9 - Math.sign(state.x) * 0.22 * state.acknowledgement,
    -0.04 * state.acknowledgement,
  ];
  p.coat = 0.04;
  p.rightHand = [-0.32, 1.23, 0.52];
  p.rightWrist = [0.35, 0, 0];
  const grip = [0.32, 1.23, 0.52];
  p.leftHand = p.leftHand.map((v, i) => grip[i] + (v - grip[i]) * state.participation);
  const wave = [0.48 + 0.045 * Math.sin(Math.PI * state.greetingPhase), 1.66, 0.24];
  p.leftHand = p.leftHand.map((v, i) => v + (wave[i] - v) * state.acknowledgement);
  for (const [key, side, offset] of [
    ['leftFoot', 1, 0],
    ['rightFoot', -1, Math.PI],
  ]) {
    p[key] = [
      side * 0.22,
      (0.54 + 0.16 * Math.cos(phase + offset) - 0.18) / 0.91,
      (0.05 + 0.16 * Math.sin(phase + offset)) / 0.91,
    ];
  }
  p.leftAnkle = [0, 0, 0];
  p.rightAnkle = [0, 0, 0];
  return p;
}
