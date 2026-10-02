import { CONFIG } from '../config.js';
import { FOUR_HIT_WINDOW, mod, smooth, themeAt } from './plan.js';

/*
 * The visitor's one verb is to clap. The street's answer is confined to the passers-by and their stem: the man, his
 * reflection and the band are never touched, and with no clapping the picture and the score are exactly what they
 * were. Everything here is a pure function of the beat and a bounded log of clap beats, so a seek reproduces the
 * picture and the scheduled response. Only the clap itself is played the moment it happens.
 *
 *   24-144   whoever is standing on the street dips and stamps with each clap, from the moment they are in view,
 *            except through the four-hit, which stays his alone
 *   72-80    kept up, the clapping starts the stamp-stamp-clap at the corner before the kit carries it from 80
 *   80-144   on the crowd's own clap beats the people beside him bring their hands together, and more hands join
 *            the sound, as far as the clapping is kept up
 *   144-208  the clap itself turns soft; nobody answers in the flowers
 */

/** At most this many claps are kept, and none older than CLAP_MEMORY beats; the response looks back GROOVE_SPAN. */
export const CLAP_LIMIT = 64;
export const CLAP_MEMORY = 16;
const GROOVE_SPAN = 8;
/**
 * Two hits closer than this are one clap: the fastest a pair of hands goes. Measured in real seconds, not beats:
 * right after a resume the audible beat stands still for the scheduling lead, and would merge separate claps.
 */
export const MERGE_SECONDS = 0.12;
/** Cycle-local windows of the answer (the first standers come into view near 46), and of the early start at the corner. */
export const RESPONSE_WINDOW = Object.freeze({ start: 24, end: 144 });
export const EARLY_WINDOW = Object.freeze({ start: 72, end: 80 });

/**
 * Clap beats in musical time, which is what the response replays; the only wall-clock value is the moment of the
 * last clap, used to merge a double hit. There is no pending-action queue.
 */
export class ClapLog {
  constructor() {
    this.beats = [];
    this.lastTime = undefined;
  }
  get size() {
    return this.beats.length;
  }
  /** `time`, in seconds of any monotonic clock, merges hits closer than MERGE_SECONDS; omitted, nothing merges. */
  add(beat, time) {
    if (!Number.isFinite(beat) || beat < 0) return false;
    const last = this.beats.at(-1);
    if (last !== undefined && beat < last) return false;
    if (time !== undefined && this.lastTime !== undefined && time - this.lastTime < MERGE_SECONDS) return false;
    if (time !== undefined) this.lastTime = time;
    this.beats.push(beat);
    const oldest = beat - CLAP_MEMORY;
    while (this.beats.length > CLAP_LIMIT || this.beats[0] < oldest) this.beats.shift();
    return true;
  }
  /** A seek backward forgets claps that have not happened yet from the new position. */
  dropAfter(beat) {
    this.beats = this.beats.filter(b => b <= beat);
  }
  clear() {
    this.beats = [];
    this.lastTime = undefined;
  }
  snapshot() {
    return Object.freeze([...this.beats]);
  }
}

/**
 * How steadily the visitor has been clapping over the last GROOVE_SPAN beats, 0..1. It is a density, not an
 * accuracy: three claps on consecutive beats fill it, one clap barely registers, and mashing cannot exceed one.
 */
export function groove(beat, claps) {
  let weight = 0;
  for (const clap of claps) {
    const age = beat - clap;
    if (age >= 0 && age < GROOVE_SPAN) weight += 1 - age / GROOVE_SPAN;
  }
  return smooth((weight - 0.8) / 2);
}

/** The moment of each clap, fading over a third of a beat: what a stander's stamp follows. */
export function pulse(beat, claps) {
  let value = 0;
  for (const clap of claps) {
    const age = beat - clap;
    if (age >= 0 && age < 0.3) value = Math.max(value, 1 - smooth(age / 0.3));
  }
  return value;
}

/** The crowd's own clap beats of the bar containing cycle-local `local`: the score's stamp-stamp-clap, then the
 *  backbeat claps once everyone walks together. A test keeps this equal to the score. */
export function crowdClapBeats(local) {
  const bar = Math.floor(local / 4) * 4;
  if (bar < 80 || bar >= RESPONSE_WINDOW.end) return [];
  return bar < 112 ? [bar + 2] : [bar + 1, bar + 3];
}

const inEarlyWindow = local => local >= EARLY_WINDOW.start && local < EARLY_WINDOW.end;
/** The beats on which hands meet: the crowd's own claps, and through the gateway the pattern's third beat. */
function meetBeats(local) {
  return inEarlyWindow(local) ? [Math.floor(local / 4) * 4 + 2] : crowdClapBeats(local);
}
/** Hands come together over a third of a beat before each clap beat and part again just after it. */
function meetEnvelope(local) {
  let value = 0;
  for (const clap of meetBeats(local)) {
    const d = local - clap;
    value = Math.max(value, d < 0 ? smooth((d + 0.35) / 0.35) : 1 - smooth(d / 0.45));
  }
  return value;
}
/** Through the gateway the pattern's two stamps, on the bar's first and second beats. */
function stampEnvelope(local) {
  if (!inEarlyWindow(local)) return 0;
  const offset = local - Math.floor(local / 4) * 4;
  for (const stamp of [0, 1]) {
    const age = offset - stamp;
    if (age >= 0 && age < 0.3) return 1 - smooth(age / 0.3);
  }
  return 0;
}

const SILENT = Object.freeze({ groove: 0, pulse: 0, meet: 0 });
/**
 * What the passers-by answer at `beat`: the groove; the pulse that standers stamp to (each clap, and through the
 * gateway the pattern's stamps as far as the groove carries them); and the hands-meet envelope of the clap beats.
 * Zero outside the response window, and exactly SILENT with no clapping.
 */
export function responseAt(beat, claps) {
  if (!claps.length) return SILENT;
  const local = mod(beat, CONFIG.cycleBeats);
  if (local < RESPONSE_WINDOW.start || local >= RESPONSE_WINDOW.end) return SILENT;
  // The four-hit is his alone: nobody on the street answers through it.
  if (local >= FOUR_HIT_WINDOW.start && local < FOUR_HIT_WINDOW.end) return SILENT;
  const g = groove(beat, claps),
    p = Math.max(pulse(beat, claps), g * stampEnvelope(local));
  if (g <= 0 && p <= 0) return SILENT;
  return { groove: g, pulse: p, meet: g > 0 ? meetEnvelope(local) : 0 };
}

/**
 * The answering notes on the crowd stem for [from, to): the corner's early stamp-stamp-clap, then extra hands in
 * the crowd's claps. Half-open and sorted like the score, with ids the score never uses, and empty without claps.
 */
export function responseBetween(from, to, claps) {
  const result = [];
  if (!claps.length || !(to > from)) return result;
  for (let bar = Math.max(0, Math.floor(from / 4)); bar <= Math.floor((to - 1e-9) / 4); bar++) {
    const start = bar * 4,
      local = mod(start, CONFIG.cycleBeats),
      chapter = themeAt(local).id;
    const add = (inst, offset, vel, count) => {
      const beat = start + offset;
      if (beat < from || beat >= to) return;
      result.push({ id: `response:${inst}:${beat}`, beat, inst, vel, dur: 0.25, chapter, params: { count } });
    };
    if (local >= EARLY_WINDOW.start && local < EARLY_WINDOW.end) {
      // A few people at the corner, as many as the clapping has gathered; never the whole crowd, never loud.
      for (const [inst, offset] of [
        ['stomp', 0],
        ['stomp', 1],
        ['groupClap', 2],
      ]) {
        const g = groove(start + offset, claps);
        if (g > 0.15) add(inst, offset, 0.3 + 0.3 * g, 1 + Math.round(2 * g));
      }
    } else if (local >= 80 && local < RESPONSE_WINDOW.end) {
      for (const clap of crowdClapBeats(local)) {
        const extra = Math.round(4 * groove(start + clap - local, claps));
        if (extra > 0) add('groupClap', clap - local, 0.5, extra);
      }
    }
  }
  return result.sort((a, b) => a.beat - b.beat || a.id.localeCompare(b.id));
}

/** The visitor's own clap, played as it happens: soft through the four-hit and the flowers, never silenced. */
export function clapNote(beat) {
  const local = mod(beat, CONFIG.cycleBeats),
    chapter = themeAt(local).id,
    soft = chapter === 'lyric' || (local >= FOUR_HIT_WINDOW.start && local < FOUR_HIT_WINDOW.end);
  return { id: `clap:${beat}`, beat, inst: 'clap', vel: soft ? 0.5 : 0.8, dur: 0.25, chapter, params: { soft } };
}
