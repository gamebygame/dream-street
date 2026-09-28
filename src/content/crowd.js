import { CONFIG } from '../config.js';
import { CROSSROADS, mod, smooth, wardrobeAt } from './plan.js';
import { sampleDance, sampleStand, sampleWalk, blendPose, walkFoot, STAND_STYLES } from '../character/pose.js';
import { greetingAt, FAREWELLS } from './social.js';

const WALK = CONFIG.distancePerBeat;

/*
 * The passers-by are street life before they are a crowd. Each one is somewhere on this street, doing something
 * ordinary, in street coordinates: x across the road (shop windows on +x), s along it within the cycle. Only when
 * the walker comes near do they turn toward him and walk into their place beside him.
 *
 *   browse    looking into a shop window, far enough back not to cover the reflection
 *   wait      standing at a corner of the first crossroad
 *   chat      standing in a small group against the near wall
 *   cross     walking along the cross street toward the main road
 *   oncoming  walking down the pavement toward the walker, then turning back with him
 *
 * Standers are placed where they stand and join when the walker's approach reaches them; walkers are placed from
 * the beat (`until`) by which they are in their slot. Slot columns 0-2 are on the near side of the road (x < 0).
 */
// prettier-ignore
const LIFE = [
  { act: 'oncoming', x: -7.75, until: 96.76 },        { act: 'oncoming', x: -7.75, until: 95 },
  { act: 'cross', until: 80 },                        { act: 'cross', until: 79 },
  { act: 'browse', s: 63.3 },                         { act: 'browse', s: 65.6 },
  { act: 'oncoming', x: -7.9, until: 101.46 },        { act: 'oncoming', x: -7.7, until: 98.2 },
  { act: 'cross', until: 84 },                        { act: 'cross', until: 83 },
  { act: 'browse', s: 60.9 },                         { act: 'browse', s: 64.4 },
  { act: 'oncoming', x: -7.6, until: 104.45 },        { act: 'oncoming', x: -7.85, until: 102.94 },
  { act: 'wait', x: -6.9, s: 45.0, face: 0 },         { act: 'wait', x: 6.9, s: 45.0, face: 0 },
  { act: 'browse', s: 59.5 },                         { act: 'browse', s: 62.0 },
  { act: 'chat', x: -9.1, s: 59.35, face: Math.PI },  { act: 'chat', x: -9.05, s: 58.3, face: 0 },
  { act: 'cross', until: 90 },                        { act: 'cross', until: 89 },
  { act: 'browse', s: 55.9 },                         { act: 'browse', s: 58.4 },
  { act: 'chat', x: -9.1, s: 56.7, face: Math.PI },   { act: 'chat', x: -9.15, s: 55.65, face: 0 },
  { act: 'cross', until: 94 },                        { act: 'cross', until: 93 },
  { act: 'browse', s: 54.5 },                         { act: 'browse', s: 57.0 },
  { act: 'chat', x: -9.1, s: 54.05, face: Math.PI },  { act: 'chat', x: -9.05, s: 53.0, face: 0 },
  { act: 'wait', x: -7.3, s: 43.9 },                  { act: 'wait', x: 7.4, s: 44.0 },
  { act: 'browse', s: 44.4 },                         { act: 'browse', s: 53.4 },
];
const BROWSE_X = 8.4,
  CROSS_SPEED = 0.55,
  ONCOMING_SPEED = -0.5;
/** Beats to walk into the slot: long enough that the sideways part stays an unhurried walk. */
const joinBeats = lateral => Math.max(8, Math.min(14, 2.2 * Math.abs(lateral) + 1));

// Street surfaces from world/street.js: the pavements stand 0.125 above the road, except across the crossroads.
const CURB = 6.05,
  PAVEMENT = 0.125,
  JUNCTIONS = CROSSROADS.map(({ start, end }) => [start * WALK, end * WALK]);
function groundAt(x, s) {
  const s0 = mod(s, CONFIG.cycleBeats * WALK);
  let paved = 1;
  for (const [a, b] of JUNCTIONS) paved -= smooth((s0 - a + 0.1) / 0.2) * (1 - smooth((s0 - b + 0.1) / 0.2));
  return PAVEMENT * paved * smooth((Math.abs(x) - CURB + 0.1) / 0.2);
}

const skins = ['#d8b194', '#97654c', '#bb8666', '#72503e', '#e0c2a4', '#b79270'];
const palettes = [
  { color: '#526c70', dark: '#34494d', trim: '#b6a47e', pants: '#45555a' },
  { color: '#a78462', dark: '#615347', trim: '#d3bd96', pants: '#665e50' },
  { color: '#798364', dark: '#485342', trim: '#c6bb93', pants: '#505a4b' },
  { color: '#987066', dark: '#5e4844', trim: '#d4b799', pants: '#5f5b53' },
  { color: '#d1bb92', dark: '#857658', trim: '#eee0b9', pants: '#6e7867' },
  { color: '#787383', dark: '#504f5b', trim: '#c7b6a4', pants: '#4f5559' },
];

/** Where and how one person joins: their activity at the join, and the path parameters derived from it. */
function planJoin(life, [xs, zs]) {
  const side = Math.sign(xs);
  if (life.act === 'cross' || life.act === 'oncoming') {
    const cross = life.act === 'cross',
      vx = cross ? -side * CROSS_SPEED : 0,
      vs = cross ? 0 : ONCOMING_SPEED,
      T = cross ? 10 : joinBeats(life.x - xs),
      end = life.until;
    // Positions follow from the arrival: constant acceleration along the street, no overshoot either way.
    return {
      join: end - T,
      end,
      T,
      x: cross ? xs - (vx * T) / 2 : life.x,
      s: WALK * end + zs - ((vs + WALK) / 2) * T,
      vx,
      vs,
      face: Math.atan2(vx, vs),
      stand: false,
    };
  }
  const browse = life.act === 'browse',
    x = browse ? BROWSE_X + 0.07 * Math.sin(life.s * 2.3) : life.x,
    T = joinBeats(x - xs),
    end = (life.s - zs + (WALK / 2) * T) / WALK,
    // Browsers each look at something different in the window.
    face = browse ? Math.PI / 2 + 0.32 * Math.sin(life.s * 1.9 + 0.5) : (life.face ?? (side * -Math.PI) / 2);
  // They look up as he comes near: a few beats before walking, or before he passes if they fall in behind.
  const notice = Math.min(end - T, life.s / WALK) - 3;
  return { join: end - T, end, T, x, s: life.s, vx: 0, vs: 0, face, stand: true, notice };
}

export const CROWD = Object.freeze(
  Array.from({ length: CONFIG.crowdCount }, (_, i) => {
    const child = i % 11 === 7,
      elder = i % 9 === 4,
      row = Math.floor(i / 6),
      column = i % 6;
    const x = [-4.2, -2.7, -1.5, 1.5, 2.7, 4.2][column] + 0.07 * Math.sin(i * 2.7);
    const z = 3.2 - row * 1.85 + (column % 2) * 0.45 + 0.12 * Math.sin(i * 1.8);
    const outfit = child ? ['jacket', 'sport', 'open'][i % 3] : ['coat', 'jacket', 'sport', 'open', 'old'][i % 5];
    const life = LIFE[i];
    return {
      id: `passer-${i + 1}`,
      index: i,
      child,
      elder,
      outfit,
      skinColor: skins[(i * 5 + row) % skins.length],
      hairColor: elder ? '#c4bca7' : ['#493d35', '#796042', '#5d5548'][i % 3],
      height: child ? 0.65 + (i % 3) * 0.035 : elder ? 0.87 + (i % 2) * 0.07 : 0.91 + (i % 5) * 0.045,
      width: 0.88 + (i % 4) * 0.1,
      hatStyle: child ? 'cap' : i % 4 === 0 ? 'fedora' : 'none',
      palette: palettes[(i + row) % palettes.length],
      slot: [x, z],
      side: column < 3 ? -1 : 1,
      activity: life.act,
      idle: (i * 7) % STAND_STYLES,
      path: Object.freeze(planJoin(life, [x, z])),
      leave: 124 + row * 0.6 + column * 0.1,
      delay: [0.04, 0.11, 0.22, 0.07, 0.16][(i * 3) % 5],
      skill: [0.95, 0.72, 0.52, 0.84, 0.65][(i * 7) % 5],
      wave: FAREWELLS.some(c => c.person === i),
    };
  }),
);

const mix = (a, b, t) => a + (b - a) * t;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const turn = (from, to, t) => from + wrap(to - from) * t;
const hermite = (p0, m0, p1, m1, u) =>
  (2 * u ** 3 - 3 * u * u + 1) * p0 +
  (u ** 3 - 2 * u * u + u) * m0 +
  (3 * u * u - 2 * u ** 3) * p1 +
  (u ** 3 - u * u) * m1;
const hermiteSlope = (p0, m0, p1, m1, u) =>
  (6 * u * u - 6 * u) * p0 + (3 * u * u - 4 * u + 1) * m0 + (6 * u - 6 * u * u) * p1 + (3 * u * u - 2 * u) * m1;
// Five-point Gauss-Legendre nodes and weights on [0, 1], for the length walked along a curved join.
const GAUSS = [
  [0.0469101, 0.1184634],
  [0.2307653, 0.2393143],
  [0.5, 0.2844444],
  [0.7692347, 0.2393143],
  [0.9530899, 0.1184634],
];

/** Street position and ground velocity (per beat) of a person on their way into the slot. */
function joining(person, b) {
  const { path, slot } = person,
    u = Math.max(0, Math.min(1, (b - path.join) / path.T)),
    endS = WALK * path.end + slot[1];
  return {
    x: hermite(path.x, path.vx * path.T, slot[0], 0, u),
    s: hermite(path.s, path.vs * path.T, endS, WALK * path.T, u),
    vx: hermiteSlope(path.x, path.vx * path.T, slot[0], 0, u) / path.T,
    vs: hermiteSlope(path.s, path.vs * path.T, endS, WALK * path.T, u) / path.T,
    u,
  };
}
function walkedWhileJoining(person, b) {
  const span = Math.max(0, Math.min(b, person.path.end) - person.path.join);
  let length = 0;
  for (const [node, weight] of GAUSS) {
    const { vx, vs } = joining(person, person.path.join + node * span);
    length += weight * Math.hypot(vx, vs);
  }
  return length * span;
}

const HIDDEN = Object.freeze({
  visible: false,
  x: 0,
  y: 0,
  z: 0,
  phase: 'absent',
  participation: 0,
  yaw: 0,
  distance: 0,
});
/**
 * Where a passer-by is at `beat`, relative to the walker (who stays at the origin while the street scrolls).
 * Phases: street life, joining, travel beside him, then departure at the farewell crossroad.
 */
export function crowdState(person, beat) {
  const b = mod(beat, CONFIG.cycleBeats),
    { path, slot } = person,
    [x, z] = slot,
    walker = WALK * b;
  if (b >= 170) return HIDDEN;
  if (b < path.end) {
    let street, speed, heading;
    if (b < path.join) {
      street = { x: path.x + path.vx * (b - path.join), s: path.s + path.vs * (b - path.join), u: 0 };
      speed = Math.hypot(path.vx, path.vs);
      heading = path.face;
    } else {
      street = joining(person, b);
      speed = Math.hypot(street.vx, street.vs);
      heading = speed > 1e-6 ? Math.atan2(street.vx, street.vs) : path.face;
    }
    const relative = street.s - walker;
    if (relative > 30 || relative < -18 || Math.abs(street.x) > 32) return HIDDEN;
    // Standers look toward the walker as he comes, turning partly, then set off; walkers keep their heading.
    let yaw = heading,
      look = 0,
      participation = 0,
      stand = 0;
    if (path.stand) {
      const noticed = smooth((b - path.notice) / 2),
        toward = Math.atan2(-street.x, walker - street.s),
        faced = turn(path.face, toward, 0.55 * noticed);
      stand = 1 - smooth(speed / 0.3);
      yaw = turn(faced, heading, 1 - stand);
      look = Math.max(-1.2, Math.min(1.2, wrap(toward - yaw))) * noticed * stand;
      participation = 0.12 * noticed;
    }
    participation = mix(participation, 1, smooth((street.u - 0.35) / 0.65));
    const distance = b < path.join ? (path.stand ? 0 : speed * (b - path.join)) : walkedWhileJoining(person, b);
    return {
      visible: true,
      x: street.x,
      y: groundAt(street.x, street.s),
      z: relative,
      phase: b < path.join ? person.activity : 'join',
      participation,
      yaw: wrap(yaw),
      look,
      stand,
      distance,
      speed,
      wave: 0,
    };
  }
  const joined = walkedWhileJoining(person, path.end) + WALK * (b - path.end);
  if (b < person.leave)
    return {
      visible: true,
      x,
      y: 0,
      z,
      phase: 'travel',
      participation: 1,
      yaw: 0,
      look: 0,
      stand: 0,
      distance: joined,
      speed: WALK,
      wave: 0,
    };
  const distance = (b - person.leave) * WALK,
    startZ = person.leave * WALK + z;
  // Concentric walking lanes keep the bend clear without moving anyone sideways to resolve collisions.
  const radius = 3 - person.side * (x - person.side * 2.75);
  const straight = 80.4 - startZ,
    arc = (radius * Math.PI) / 2;
  let px = x,
    pz = startZ,
    yaw = 0;
  if (distance < straight) pz += distance;
  else if (distance < straight + arc) {
    const a = (distance - straight) / radius;
    px += person.side * radius * (1 - Math.cos(a));
    pz += straight + radius * Math.sin(a);
    yaw = person.side * a;
  } else {
    px += person.side * (radius + distance - straight - arc);
    pz += straight + radius;
    yaw = (person.side * Math.PI) / 2;
  }
  const cue = greetingAt(beat);
  return {
    visible: true,
    x: px,
    y: groundAt(px, pz),
    z: pz - walker,
    phase: 'depart',
    participation: 1 - smooth((b - person.leave) / 5),
    yaw,
    look: 0,
    stand: 0,
    distance: joined,
    speed: WALK,
    wave: cue.person === person.index ? cue.wave : 0,
    greet: cue.person === person.index ? Math.atan2(-px, walker - pz) - yaw : 0,
  };
}

export function crowdLayout(beat) {
  return CROWD.map(person => crowdState(person, beat));
}

export function crowdPose(person, beat, state = crowdState(person, beat), wardrobe = wardrobeAt(beat)) {
  const footBeat = state.distance / WALK + person.index * 0.13;
  let body = sampleWalk(footBeat, { social: false });
  const stepping = [walkFoot(footBeat, 1), walkFoot(footBeat, -1)];
  if (state.stand > 0) {
    const still = sampleStand(beat, person.idle, person.index * 1.3);
    if (person.activity === 'browse') {
      // Leaning a little toward the display.
      still.chest[0] += 0.05;
      still.head[0] += 0.08;
    }
    body = blendPose(body, still, state.stand);
    stepping[0] = stepping[0].map((v, i) => mix(v, still.leftFoot[i], state.stand));
    stepping[1] = stepping[1].map((v, i) => mix(v, still.rightFoot[i], state.stand));
  }
  const dancer = sampleDance(beat - person.delay, wardrobe, { props: false }),
    imitation = state.participation * (0.62 + 0.32 * person.skill);
  const p = blendPose(body, dancer, imitation);
  // Whatever share of the arm stays in the walk keeps the walk's own swing, not the dancer's neutral angles. The arm
  // hands over to the dancer's targets faster than the rest of the body: a joint-angle swing mixed half and half
  // with a raised gesture can push the elbow ahead of the hand.
  p.leftArmSwing = body.leftArmSwing;
  p.rightArmSwing = body.rightArmSwing;
  p.leftArmWalk = body.leftArmWalk * (1 - imitation) ** 2;
  p.rightArmWalk = body.rightArmWalk * (1 - imitation) ** 2;
  [p.leftFoot, p.rightFoot] = stepping;
  p.leftFoot[2] /= person.height;
  p.rightFoot[2] /= person.height;
  p.yaw = p.yaw * 0.28 + state.yaw;
  p.leftAnkle = dancer.leftAnkle.map(v => v * state.participation * 0.45);
  p.rightAnkle = dancer.rightAnkle.map(v => v * state.participation * 0.45);
  p.hip[0] += 0.018 * Math.sin(beat * Math.PI + person.index) * (1 - state.stand);
  p.head[1] += 0.09 * Math.sin((beat * Math.PI) / 8 + person.index) + state.look;
  if (state.stand > 0 && state.participation > 0) {
    // Having noticed, they nod along on the beat before they move.
    const nod = state.participation * state.stand * Math.max(0, Math.cos(Math.PI * 2 * beat));
    p.head[0] += 1.2 * nod;
    p.hip[1] -= 0.08 * nod;
  }
  if (person.child) {
    const flourish = Math.max(0, Math.sin((beat * Math.PI) / 4 + person.index));
    p.leftHand[1] += 0.22 * flourish * state.participation;
    p.chest[2] += 0.08 * flourish;
  }
  if (state.wave) {
    p.rightArmWalk *= 1 - state.wave;
    const target = [-0.55 - 0.1 * Math.sin(beat * Math.PI * 2), 1.86, 0.1];
    p.rightHand = p.rightHand.map((v, i) => mix(v, target[i], state.wave));
    const angle = wrap(state.greet);
    p.head[1] = Math.max(-1.45, Math.min(1.45, angle * 0.6)) * state.wave;
    p.chest[1] += Math.max(-0.85, Math.min(0.85, angle * 0.48)) * state.wave;
  }
  return p;
}
