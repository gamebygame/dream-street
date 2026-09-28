import { CONFIG } from '../config.js';
import { mod, smooth, wardrobeAt } from './plan.js';
import { sampleDance, sampleWalk, blendPose, walkFoot } from '../character/pose.js';
import { greetingAt, FAREWELLS } from './social.js';

const skins = ['#d8b194', '#97654c', '#bb8666', '#72503e', '#e0c2a4', '#b79270'];
const palettes = [
  { color: '#526c70', dark: '#34494d', trim: '#b6a47e', pants: '#45555a' },
  { color: '#a78462', dark: '#615347', trim: '#d3bd96', pants: '#665e50' },
  { color: '#798364', dark: '#485342', trim: '#c6bb93', pants: '#505a4b' },
  { color: '#987066', dark: '#5e4844', trim: '#d4b799', pants: '#5f5b53' },
  { color: '#d1bb92', dark: '#857658', trim: '#eee0b9', pants: '#6e7867' },
  { color: '#787383', dark: '#504f5b', trim: '#c7b6a4', pants: '#4f5559' },
];
export const CROWD = Object.freeze(
  Array.from({ length: CONFIG.crowdCount }, (_, i) => {
    const child = i % 11 === 7,
      elder = i % 9 === 4,
      row = Math.floor(i / 6),
      column = i % 6;
    const x = [-4.2, -2.7, -1.5, 1.5, 2.7, 4.2][column] + 0.07 * Math.sin(i * 2.7);
    const z = 3.2 - row * 1.85 + (column % 2) * 0.45 + 0.12 * Math.sin(i * 1.8);
    const outfit = child ? ['jacket', 'sport', 'open'][i % 3] : ['coat', 'jacket', 'sport', 'open', 'old'][i % 5];
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
      start: 20 + row * 1.4 + column * 0.45,
      arrived: 98 + row * 1.2 + column * 0.45,
      leave: 124 + row * 0.6 + column * 0.1,
      delay: [0.04, 0.11, 0.22, 0.07, 0.16][(i * 3) % 5],
      skill: [0.95, 0.72, 0.52, 0.84, 0.65][(i * 7) % 5],
      wave: FAREWELLS.some(c => c.person === i),
    };
  }),
);

const mix = (a, b, t) => a + (b - a) * t;
/** Approach on parallel walking lanes; departure follows a straight, circular turn, then exit. */
export function crowdState(person, beat) {
  const b = mod(beat, CONFIG.cycleBeats),
    [x, z] = person.slot;
  if (b < person.start || b >= 170)
    return { visible: false, x: 0, z: 0, phase: 'absent', participation: 0, yaw: 0, distance: 0 };
  if (b < person.arrived) {
    const u = Math.max(0, Math.min(1, (b - person.start) / (person.arrived - person.start))),
      e = smooth(u);
    const position = z - 22 * (1 - e),
      speed = 0.6 + (132 * u * (1 - u)) / (person.arrived - person.start);
    return {
      visible: true,
      x,
      z: position,
      phase: 'arrive',
      participation: smooth((u - 0.78) / 0.22),
      yaw: 0,
      distance: (b - person.start) * 0.6 + 22 * e,
      speed,
      wave: 0,
    };
  }
  if (b < person.leave)
    return {
      visible: true,
      x,
      z,
      phase: 'travel',
      participation: 1,
      yaw: 0,
      distance: (b - person.start) * 0.6 + 22,
      speed: 0.6,
      wave: 0,
    };
  const distance = (b - person.leave) * 0.6,
    startZ = person.leave * 0.6 + z;
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
    z: pz - b * 0.6,
    phase: 'depart',
    participation: 1 - smooth((b - person.leave) / 5),
    yaw,
    distance: (b - person.start) * 0.6 + 22,
    speed: 0.6,
    wave: cue.person === person.index ? cue.wave : 0,
    look: cue.person === person.index ? Math.atan2(-px, b * 0.6 - pz) - yaw : 0,
  };
}

export function crowdLayout(beat) {
  return CROWD.map(person => crowdState(person, beat));
}

export function crowdPose(person, beat, state = crowdState(person, beat), wardrobe = wardrobeAt(beat)) {
  const footBeat = state.distance / 0.6 + person.index * 0.13;
  const walk = sampleWalk(footBeat, { social: false }),
    dancer = sampleDance(beat - person.delay, wardrobe);
  const p = blendPose(walk, dancer, state.participation * (0.62 + 0.32 * person.skill));
  p.leftFoot = walkFoot(footBeat, 1);
  p.rightFoot = walkFoot(footBeat, -1);
  p.leftFoot[2] /= person.height;
  p.rightFoot[2] /= person.height;
  p.yaw = p.yaw * 0.28 + state.yaw;
  p.leftAnkle = dancer.leftAnkle.map(v => v * state.participation * 0.45);
  p.rightAnkle = dancer.rightAnkle.map(v => v * state.participation * 0.45);
  p.hip[0] += 0.018 * Math.sin(beat * Math.PI + person.index);
  p.head[1] += 0.09 * Math.sin((beat * Math.PI) / 8 + person.index);
  if (person.child) {
    const flourish = Math.max(0, Math.sin((beat * Math.PI) / 4 + person.index));
    p.leftHand[1] += 0.22 * flourish * state.participation;
    p.chest[2] += 0.08 * flourish;
  }
  if (state.wave) {
    p.rightArmWalk *= 1 - state.wave;
    const target = [-0.55 - 0.1 * Math.sin(beat * Math.PI * 2), 1.86, 0.1];
    p.rightHand = p.rightHand.map((v, i) => mix(v, target[i], state.wave));
    const angle = Math.atan2(Math.sin(state.look), Math.cos(state.look));
    p.head[1] = Math.max(-1.45, Math.min(1.45, angle * 0.6)) * state.wave;
    p.chest[1] += Math.max(-0.85, Math.min(0.85, angle * 0.48)) * state.wave;
  }
  return p;
}
