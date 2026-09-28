import { CONFIG } from '../config.js';

export const FAREWELLS = Object.freeze([
  { person: 2, start: 130, reply: 132, end: 136, side: -1 },
  { person: 5, start: 136, reply: 138, end: 142, side: 1 },
  { person: 18, start: 142, reply: 144, end: 149, side: -1 },
  { person: 29, start: 149, reply: 151, end: 157, side: 1 },
]);
const ease = x => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
export function greetingAt(beat) {
  const b = ((beat % CONFIG.cycleBeats) + CONFIG.cycleBeats) % CONFIG.cycleBeats;
  const cue = FAREWELLS.find(c => b >= c.start && b < c.end);
  if (!cue) return { person: null, look: 0, reply: 0, wave: 0 };
  const look = cue.side * 1.12 * ease((b - cue.start) / 1.4) * (1 - ease((b - cue.end + 2) / 2));
  const reply = cue.side * ease((b - cue.reply) / 0.7) * (1 - ease((b - cue.reply - 1.2) / 1.5));
  const wave = ease((b - cue.start) / 0.7) * (1 - ease((b - cue.end + 1.6) / 1.6));
  return { person: cue.person, look, reply, wave };
}
