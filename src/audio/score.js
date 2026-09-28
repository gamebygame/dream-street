import { CONFIG } from '../config.js';
import { FOUR_HITS, FOUR_HIT_WINDOW, mod, smooth, themeAt } from '../content/plan.js';
import { SUSTAINED } from './instruments.js';

/*
 * The original score. It is authored on the same beat timeline as the street, the wardrobe and the dance, and
 * its chapters are the same THEMES windows, so every musical window lines up with its shops by construction.
 * At 128 BPM the walker steps on every beat, and every beat carries an audible pulse.
 *
 *   daylight 0-80    driving post-punk electro in G minor; the four-hit is the loudest moment of the cycle
 *   pocket   80-144  a heavier broken funk groove; the crowd's claps and stomps grow as people join
 *   lyric    144-208 a tender half-time chamber of FM keys, warm pads and a soft heartbeat
 *   parade   208-256 a small brass-band march with glockenspiel
 */

// One chord per bar, repeating every four bars; `turn` replaces the chord from beat 2 of that bar.
// prettier-ignore
const HARMONY = {
  daylight: [
    { root: 43, chord: [55, 58, 62, 65] }, // Gm7
    { root: 39, chord: [51, 55, 58, 62] }, // Ebmaj7
    { root: 46, chord: [53, 58, 62, 65] }, // Bb/F
    { root: 41, chord: [53, 57, 60, 65] }, // F
  ],
  pocket: [
    { root: 43, chord: [58, 62, 65, 69] }, // Gm9
    { root: 36, chord: [52, 58, 62, 67] }, // C9
    { root: 43, chord: [58, 62, 65, 69] }, // Gm9
    { root: 46, chord: [58, 62, 65, 70], turn: { root: 48, chord: [55, 60, 64, 67] } }, // Bb, then C
  ],
  lyric: [
    { root: 39, chord: [51, 55, 58, 62] }, // Ebmaj7
    { root: 38, chord: [53, 58, 62, 65] }, // Bb/D
    { root: 36, chord: [51, 55, 58, 60] }, // Cm7
    { root: 44, chord: [51, 55, 60, 63] }, // Abmaj7
  ],
  parade: [
    { root: 46, chord: [58, 62, 65] }, // Bb
    { root: 45, chord: [57, 60, 65] }, // F/A
    { root: 43, chord: [55, 58, 62] }, // Gm
    { root: 39, chord: [55, 58, 63], turn: { root: 41, chord: [57, 60, 65] } }, // Eb, then F
  ],
};
// Melodies: [offset in beats, MIDI note, duration in beats] for each bar of a phrase.
// prettier-ignore
const MELODY = {
  daylight: [
    [[0, 74, 0.75], [0.75, 77, 0.75], [1.5, 79, 1], [3, 77, 0.5], [3.5, 74, 0.5]],
    [[0, 75, 0.75], [0.75, 74, 0.75], [1.5, 70, 1.5], [3.5, 72, 0.5]],
    [[0, 74, 0.75], [0.75, 77, 0.75], [1.5, 82, 1], [3, 81, 0.5], [3.5, 77, 0.5]],
    [[0, 77, 1], [1, 75, 0.5], [1.5, 74, 1], [2.5, 72, 1.5]],
  ],
  pocket: [
    [[0.5, 70, 0.25], [0.75, 72, 0.25], [1, 74, 0.5], [2.5, 77, 0.25], [2.75, 74, 0.25], [3, 70, 0.5]],
    [[0.5, 70, 0.25], [0.75, 72, 0.25], [1, 76, 0.5], [2.5, 74, 0.25], [2.75, 72, 0.25], [3, 67, 0.5]],
  ],
  lyric: [
    [[0, 70, 2], [2, 72, 1], [3, 74, 1]],
    [[0, 77, 2.5], [2.5, 74, 1.5]],
    [[0, 75, 2], [2, 72, 2]],
    [[0, 70, 3], [3, 72, 1]],
  ],
  parade: [
    [[0, 77, 0.5], [0.5, 74, 0.5], [1, 77, 0.5], [1.5, 82, 0.5], [2, 81, 1], [3, 79, 1]],
    [[0, 77, 0.5], [0.5, 72, 0.5], [1, 77, 0.5], [1.5, 81, 0.5], [2, 79, 1], [3, 77, 1]],
    [[0, 74, 0.5], [0.5, 70, 0.5], [1, 74, 0.5], [1.5, 79, 0.5], [2, 77, 1], [3, 74, 1]],
    [[0, 75, 0.5], [0.5, 79, 0.5], [1, 82, 1], [2, 81, 0.5], [2.5, 77, 0.5], [3, 77, 1]],
  ],
};
const FILL_TOMS = [52, 50, 47, 45];

/** How many passers-by clap along: it grows as the crowd joins, peaks while they travel and thins as they go. */
export function crowdEnergy(local) {
  if (local < 88 || local >= 144) return 0;
  if (local < 108) return 0.25 + 0.75 * smooth((local - 88) / 20);
  if (local < 130) return 1;
  return 1 - 0.8 * smooth((local - 130) / 14);
}

function chordAt(bar, chapter, offset) {
  const entry = HARMONY[chapter][mod(bar, 4)];
  return entry.turn && offset >= 2 ? entry.turn : entry;
}

function daylightBar(add, local, bar) {
  const n = local / 4,
    { root, chord } = chordAt(n, 'daylight', 0),
    intro = n < 2,
    office = local >= 60 && local < 72,
    building = local >= 40 && local < FOUR_HIT_WINDOW.start;
  if (local === 0 && bar >= CONFIG.cycleBeats / 4) add('crash', 0, 0.8);
  for (let beat = 0; beat < 4; beat++)
    add('kick', beat, intro ? 0.62 : beat === 0 ? 0.95 : 0.84, { params: { duck: intro ? 0.3 : 0.55 } });
  if (n >= 2) for (const beat of [1, 3]) add('clap', beat, office ? 0.58 : 0.74);
  for (let i = 0; i < 8; i++) add('hat', i / 2, i % 2 ? 0.46 : 0.26);
  if (n >= 4 && !office)
    for (const beat of [0.5, 1.5, 2.5, 3.5]) add('hat', beat + 0.02, 0.3, { params: { open: true } });
  if ((n >= 6 && n < 10) || n >= 16) for (let i = 0; i < 16; i++) add('shaker', i / 4, i % 4 ? 0.14 : 0.24);
  if (n >= 2)
    for (let i = 0; i < (office ? 4 : 8); i++) {
      const up = i % 2 && !office;
      add('bass', office ? i : i / 2, up ? 0.62 : 0.86, {
        midi: root + (up ? 12 : 0),
        dur: office ? 0.9 : 0.42,
        params: { style: 'pump' },
      });
    }
  if (!building) add('pad', 0, intro ? 0.42 : 0.6, { notes: chord, dur: 4, params: { cutoff: intro ? 520 : 1000 } });
  else if (local === 40) add('pad', 0, 0.72, { notes: chord, dur: 8, params: { cutoff: 600, open: 3600 } });
  if (n >= 4 && !office && !building) {
    add('stab', 0, 0.78, { notes: [...chord, chord[0] + 12], dur: 0.5 });
    add('stab', 2.5, 0.6, { notes: chord, dur: 0.25 });
  }
  if (n >= 2 && !office)
    for (let i = 0; i < 16; i++) {
      const midi = chord[[0, 1, 2, 3, 2, 1, 3, 2][i % 8]] + 12;
      add('pluck', i / 4, (i % 4 ? 0.34 : 0.52) * (intro ? 0.7 : 1), {
        midi,
        dur: 0.22,
        params: { pan: i % 2 ? 0.3 : -0.3 },
      });
    }
  if ((n >= 6 && n < 10) || n >= 18)
    for (const [offset, midi, dur] of MELODY.daylight[mod(n, 4)]) add('lead', offset, 0.72, { midi, dur });
  if (building) {
    // Two bars of rising snare and noise lead into the four-hit window.
    const sixteenths = local >= 44;
    for (let i = 0; i < (sixteenths ? 16 : 8); i++) {
      const offset = sixteenths ? i / 4 : i / 2;
      add('snare', offset, 0.3 + 0.62 * ((local - 40 + offset) / 8));
    }
    if (local === 40) add('riser', 0, 0.85, { dur: 8 });
  }
  if (local === 64) add('crash', 0, 0.5);
  if (local === 72) add('riser', 0, 0.7, { dur: 8 });
  if (local === 76) {
    for (let i = 8; i < 16; i++) add('snare', i / 4, 0.38 + 0.06 * (i - 8));
    for (const [i, midi] of FILL_TOMS.entries()) add('tom', 3 + i / 4, 0.75, { midi });
  }
}

/** The four-hit is the loudest moment of the cycle: stop-time band hits on beats 50, 52, 54 and 56. */
function fourHitBar(add, local) {
  const hits = FOUR_HITS.map(hit => hit - local).filter(offset => offset >= 0 && offset < 4);
  if (local === FOUR_HIT_WINDOW.start) {
    add('crash', 0, 0.7);
    add('impact', 0, 0.75);
    add('pad', 0, 0.45, { notes: HARMONY.daylight[0].chord, dur: 2, params: { cutoff: 700 } });
    add('bass', 0, 0.7, { midi: 31, dur: 1.8, params: { style: 'pump' } });
    for (const [i, midi] of FILL_TOMS.entries()) add('tom', 1 + i / 4, 0.55 + i * 0.08, { midi });
  }
  for (const offset of hits) {
    const { root, chord } = HARMONY.daylight[FOUR_HITS.indexOf(local + offset)];
    add('snare', offset - 0.5, 0.42);
    add('snare', offset - 0.25, 0.66);
    // No sidechain on these kicks: the whole band lands together at full weight.
    add('kick', offset, 1);
    add('impact', offset, 1);
    add('crash', offset, 0.9);
    add('clap', offset, 1);
    add('stab', offset, 1, { notes: [...chord, chord.at(-1) + 5], dur: 1.2 });
    add('stab', offset, 0.85, { notes: chord.map(midi => midi - 12), dur: 0.9, params: { style: 'brass' } });
    add('bass', offset, 0.95, { midi: root, dur: 1.5, params: { style: 'pump' } });
  }
  // Only a ticking hat keeps the walker's pulse between the hits.
  for (let i = 0; i < 8; i++) {
    const offset = i / 2;
    if (!hits.includes(offset)) add('hat', offset, i % 2 ? 0.3 : 0.22);
  }
  if (local === FOUR_HITS.at(-1)) {
    add('riser', 0, 0.6, { dur: 2 });
    for (const [i, midi] of FILL_TOMS.entries()) add('tom', 1 + i / 4, 0.62 + i * 0.07, { midi });
    // The full groove drops back in on beat 58, resolving to G minor.
    const { chord } = HARMONY.daylight[0];
    add('crash', 2, 0.82);
    for (const beat of [2, 3]) add('kick', beat, 0.95, { params: { duck: 0.55 } });
    add('clap', 3, 0.78);
    for (let i = 4; i < 8; i++)
      add('bass', i / 2, i % 2 ? 0.62 : 0.86, { midi: 43 + (i % 2 ? 12 : 0), dur: 0.42, params: { style: 'pump' } });
    add('stab', 2, 0.82, { notes: [...chord, chord[0] + 12], dur: 0.5 });
    add('pad', 2, 0.6, { notes: chord, dur: 2 });
    for (const [offset, midi, dur] of MELODY.daylight[0]) if (offset < 2) add('lead', 2 + offset, 0.7, { midi, dur });
  }
}

function pocketBar(add, local) {
  const n = (local - 80) / 4,
    energy = crowdEnergy(local),
    leaving = local >= 140;
  if (local === 80) {
    add('crash', 0, 0.82);
    add('impact', 0, 0.55);
  }
  if (leaving) {
    // The farewell crossroad empties the drums toward the flower chapter.
    add('kick', 0, 0.7, { params: { duck: 0.35 } });
    for (let i = 0; i < 8; i++) add('snare', 2 + i / 4, 0.12 + 0.03 * i);
    add('crash', 0, 0.55, { dur: 4, params: { swell: true } });
    for (let i = 0; i < 8; i++) add('hat', i / 2, i % 2 ? 0.22 : 0.14);
  } else {
    for (const [offset, vel] of [[0, 0.95], [0.75, 0.6], [2.5, 0.88], ...(n % 2 ? [[3.75, 0.52]] : [])])
      add('kick', offset, vel, { params: { duck: 0.5, release: 0.17 } });
    for (const beat of [1, 3]) add('snare', beat, 0.86);
    for (const [offset, vel] of [
      [1.75, 0.2],
      [2.25, 0.15],
      [3.5, 0.2],
    ])
      add('snare', offset, vel);
    for (let i = 0; i < 16; i++) add('hat', i / 4 + (i % 2 ? 0.05 : 0), i % 2 ? 0.2 : 0.38);
    add('hat', 3.5, 0.34, { params: { open: true } });
  }
  for (const [offset, interval, dur] of [
    [0, 0, 0.5],
    [0.75, 12, 0.25],
    [1.5, 0, 0.25],
    [2, 7, 0.5],
    [2.75, 10, 0.25],
    [3.5, 12, 0.25],
  ]) {
    if (leaving && offset >= 2) break;
    add('bass', offset, offset % 1 ? 0.72 : 0.9, {
      midi: chordAt(n, 'pocket', offset).root + interval,
      dur,
      params: { style: 'funk' },
    });
  }
  for (const offset of [0.5, 1.5, 2.5, 3.5])
    add('stab', offset, 0.5, { notes: chordAt(n, 'pocket', offset).chord, dur: 0.2, params: { style: 'clav' } });
  add('pad', 0, 0.38, { notes: chordAt(n, 'pocket', 0).chord, dur: 4, params: { cutoff: 850 } });
  if (n >= 2 && n % 2 === 0 && !leaving)
    for (const [offset, midi, dur] of MELODY.pocket[mod(n / 2, 2)])
      add('stab', offset, 0.66, { notes: [midi], dur, params: { style: 'brass' } });
  if (energy > 0) {
    const count = 3 + Math.round(9 * energy);
    for (const beat of [1, 3]) add('groupClap', beat, 0.6 + 0.3 * energy, { params: { count } });
    if (energy > 0.7) for (const beat of [0, 2]) add('stomp', beat, 0.68 * energy);
  }
}

function lyricBar(add, local) {
  const n = (local - 144) / 4,
    { root, chord } = chordAt(n, 'lyric', 0);
  add('keys', 0, 0.66, { notes: chord, dur: 3.8 });
  add('keys', 1.5, 0.3, { notes: [chord[3] + 12], dur: 1.5 });
  add('keys', 2.5, 0.28, { notes: [chord[1] + 12], dur: 1.5 });
  if (n >= 1) add('pad', 0, 0.4, { notes: chord, dur: 4, params: { style: 'warm' } });
  add('bass', 0, 0.36, { midi: root, dur: 3.6, params: { style: 'soft' } });
  // A soft heartbeat and a shaker keep the walker's step without drums.
  for (const beat of n >= 14 ? [0, 1, 2, 3] : [0, 2])
    add('kick', beat, beat === 0 ? 0.38 : 0.26, { params: { tone: 'soft' } });
  for (let beat = 0; beat < 4; beat++) add('shaker', beat, 0.16);
  if (n >= 4 && n < 12)
    for (const [offset, midi, dur] of MELODY.lyric[mod(n, 4)]) add('bell', offset, 0.46, { midi, dur });
  if (n >= 12)
    for (let i = 0; i < 8; i++)
      add('pluck', i / 2, 0.24, { midi: chord[i % 4] + 12, dur: 0.4, params: { square: true } });
  if (local === 204) {
    add('riser', 0, 0.62, { dur: 4 });
    for (let i = 8; i < 16; i++) add('snare', i / 4, 0.28 + 0.06 * (i - 8), { params: { tone: 'march' } });
  }
}

function paradeBar(add, local) {
  const n = (local - 208) / 4,
    fill = local === CONFIG.cycleBeats - 4;
  if (local === 208) {
    add('crash', 0, 0.8);
    add('stab', 0, 0.9, { notes: HARMONY.parade[0].chord, dur: 0.6, params: { style: 'brass' } });
  }
  for (const beat of [0, 2]) add('kick', beat, 0.86, { params: { tone: 'march', duck: 0.35 } });
  for (const beat of [1, 3]) add('snare', beat, 0.76, { params: { tone: 'march' } });
  if (n % 2 && !fill)
    for (const [i, offset] of [3.25, 3.5, 3.75].entries())
      add('snare', offset, 0.34 + i * 0.1, { params: { tone: 'march' } });
  for (const beat of [1, 3]) add('clap', beat, 0.36);
  for (let i = 0; i < 8; i++) add('hat', i / 2, i % 2 ? 0.26 : 0.18);
  add('bass', 0, 0.82, { midi: chordAt(n, 'parade', 0).root, dur: 0.8, params: { style: 'tuba' } });
  add('bass', 2, 0.78, { midi: chordAt(n, 'parade', 2).root + 7, dur: 0.8, params: { style: 'tuba' } });
  for (const beat of [1, 3])
    add('stab', beat, 0.58, { notes: chordAt(n, 'parade', beat).chord, dur: 0.35, params: { style: 'brass' } });
  if (n >= 1) for (const [offset, midi, dur] of MELODY.parade[mod(n, 4)]) add('bell', offset, 0.6, { midi, dur });
  if (fill) {
    add('riser', 0, 0.7, { dur: 4 });
    for (let i = 8; i < 16; i++) add('snare', i / 4, 0.42 + 0.07 * (i - 8), { params: { tone: 'march' } });
    for (const [i, midi] of FILL_TOMS.entries()) add('tom', 3 + i / 4, 0.78, { midi });
  }
}

const BARS = { daylight: daylightBar, pocket: pocketBar, lyric: lyricBar, parade: paradeBar };

/** Half-open queries make the score independent of scheduler cadence and visual state. */
export function notesBetween(from, to) {
  const result = [];
  if (!(to > from)) return result;
  for (let bar = Math.max(0, Math.floor(from / 4)); bar <= Math.floor((to - 1e-9) / 4); bar++) {
    const start = bar * 4,
      local = mod(start, CONFIG.cycleBeats),
      chapter = themeAt(local).id,
      counts = new Map();
    const add = (inst, offset, vel, extra = {}) => {
      const beat = start + offset;
      if (beat < from || beat >= to) return;
      const key = `${inst}:${beat}`,
        n = counts.get(key) ?? 0;
      counts.set(key, n + 1);
      result.push({ id: `${chapter}:${key}:${n}`, beat, inst, vel, dur: 0.25, chapter, ...extra });
    };
    if (chapter === 'daylight' && local >= FOUR_HIT_WINDOW.start && local < FOUR_HIT_WINDOW.end) fourHitBar(add, local);
    else BARS[chapter](add, local, bar);
  }
  return result.sort((a, b) => a.beat - b.beat || a.id.localeCompare(b.id));
}

/** Sustained notes still sounding at `beat`, for re-entry after a pause or seek. */
export function activeNotesAt(beat) {
  return notesBetween(Math.max(0, beat - 8), beat).filter(
    note => SUSTAINED.includes(note.inst) && note.beat + note.dur > beat,
  );
}
