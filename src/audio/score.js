import { CONFIG } from '../config.js';
import { FOUR_HITS, FOUR_HIT_WINDOW, mod, smooth, themeAt } from '../content/plan.js';
import { SUSTAINED } from './instruments.js';

/*
 * The original score: a small rock band, played clean in the old manner, on the same beat timeline as the street,
 * the wardrobe and the dance. Its chapters are the same THEMES windows, so every musical window lines up with its
 * shops by construction. At 128 BPM the walker steps on every beat, and every beat carries an audible pulse. Only a
 * few parts play at once, and every build is the drummer's fill.
 *
 *   daylight 0-80    driving G-minor rock: a power-chord riff doubled by guitar and bass, stop-time band hits for
 *                    the four-hit, and a piano interlude past the offices
 *   pocket   80-144  the gathering crowd's own stamp-stamp-clap over a funk-rock bass line; the band lands once
 *                    everyone has joined, then thins out at the farewell crossroad
 *   lyric    144-208 a piano ballad in E-flat with a soft heartbeat and a violin-like guitar
 *   parade   208-256 piano-driven glam rock in B-flat with twin harmony guitars
 */

// Guitar power-chord root, bass an octave below, and a piano voicing.
// prettier-ignore
const CHORDS = {
  Gm:     { power: 43, bass: 31, piano: [55, 58, 62, 67] },
  Bb:     { power: 46, bass: 34, piano: [58, 62, 65, 70] },
  C:      { power: 48, bass: 36, piano: [55, 60, 64, 67] },
  Cm:     { power: 48, bass: 36, piano: [55, 60, 63, 67] },
  D:      { power: 50, bass: 38, piano: [57, 62, 66, 69] },
  Eb:     { power: 51, bass: 39, piano: [55, 58, 63, 67] },
  F:      { power: 41, bass: 29, piano: [57, 60, 65, 69] },
  FA:     { power: 41, bass: 33, piano: [57, 60, 65, 69] },
  Ab:     { power: 45, bass: 32, piano: [56, 60, 63, 68] },
};
// The ballad's chords: left-hand octave and the right hand's arpeggio notes.
// prettier-ignore
const BALLAD = {
  Ebmaj7: { hand: [39, 51], arpeggio: [58, 63, 67, 70, 74], bass: 39 },
  BbD:    { hand: [38, 50], arpeggio: [58, 62, 65, 70, 74], bass: 38 },
  Cm7:    { hand: [36, 48], arpeggio: [55, 60, 63, 67, 70], bass: 36 },
  Abmaj7: { hand: [32, 44], arpeggio: [60, 63, 67, 68, 72], bass: 44 },
  F:      { hand: [41, 53], arpeggio: [57, 60, 65, 69, 72], bass: 41 },
};

// The riff: a power chord per event, [offset, chord, beats, palm-muted]. Open chords with room between them, as a
// 1970s band played it; two bars on G minor, then E-flat and F.
// prettier-ignore
const RIFF = [
  [[0, 'Gm', 0.75], [1, 'Bb', 0.5], [1.75, 'C', 0.75], [3, 'Bb', 0.25], [3.25, 'Gm', 0.75]],
  [[0, 'Gm', 0.75], [1, 'Bb', 0.5], [1.75, 'D', 0.75], [2.5, 'C', 0.5], [3, 'Bb', 0.5], [3.5, 'F', 0.5]],
  [[0, 'Eb', 1.5], [2, 'Eb', 0.5], [2.5, 'F', 1.5]],
  [[0, 'F', 1.5], [2, 'F', 0.5], [2.5, 'Gm', 0.5], [3, 'Bb', 0.5], [3.5, 'C', 0.5]],
];
const GROOVE = ['Gm', 'Gm', 'Eb', 'F'];
// Lead melodies: [offset, MIDI note, beats, scoop into the note] for each bar of a phrase.
// prettier-ignore
const MELODY = {
  daylight: [
    [[0, 67, 0.5], [0.5, 70, 0.5], [1, 74, 1, 1], [2, 72, 0.5], [2.5, 70, 0.5], [3, 72, 1]],
    [[0, 74, 1.5], [1.5, 77, 0.5], [2, 79, 1.5, 1], [3.5, 77, 0.5]],
    [[0, 75, 1], [1, 74, 0.5], [1.5, 72, 0.5], [2, 70, 1.5], [3.5, 67, 0.5]],
    [[0, 69, 1], [1, 72, 0.5], [1.5, 74, 0.5], [2, 77, 2, 1]],
  ],
  // Over G minor, C, E-flat and F once the whole crowd walks together.
  pocket: [
    [[0, 74, 1.5, 1], [1.5, 72, 0.5], [2, 70, 0.5], [2.5, 72, 0.5], [3, 74, 1]],
    [[0, 76, 1.5], [1.5, 74, 0.5], [2, 72, 1], [3, 67, 1]],
    [[0, 70, 0.5], [0.5, 72, 0.5], [1, 75, 1.5, 1], [2.5, 74, 0.5], [3, 72, 0.5], [3.5, 70, 0.5]],
    [[0, 72, 1], [1, 74, 1], [2, 77, 2, 1]],
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
// The funk-rock bass line, one bar each on G minor and C: [offset, MIDI note, beats].
// prettier-ignore
const BASS_LINE = [
  [[0, 43, 0.5], [0.75, 43, 0.25], [1, 50, 0.25], [1.25, 53, 0.25], [1.5, 55, 0.25], [2, 53, 0.25], [2.25, 50, 0.25],
    [2.5, 48, 0.5], [3.25, 46, 0.25], [3.5, 48, 0.25], [3.75, 49, 0.25]],
  [[0, 48, 0.5], [0.75, 48, 0.25], [1, 55, 0.25], [1.25, 58, 0.25], [1.5, 60, 0.25], [2, 58, 0.25], [2.25, 55, 0.25],
    [2.5, 53, 0.5], [3.25, 52, 0.25], [3.5, 53, 0.25], [3.75, 54, 0.25]],
];
const FOUR_HIT_CHORDS = ['Gm', 'Bb', 'C', 'D'];
const FILL_TOMS = [52, 50, 47, 45];
const G_MINOR = [7, 9, 10, 0, 2, 3, 5],
  G_DORIAN = [7, 9, 10, 0, 2, 4, 5],
  B_FLAT = [10, 0, 2, 3, 5, 7, 9];

/** The diatonic third below `midi` in `scale` (pitch classes): the second guitar of a harmony pair. */
function thirdBelow(midi, scale) {
  for (let step = 3; step <= 4; step++) if (scale.includes(mod(midi - step, 12))) return midi - step;
  return midi - 3;
}

/**
 * How many passers-by stamp and clap along: it follows the crowd as it gathers from beat 76, is complete by 108,
 * and thins as they leave the farewell crossroad.
 */
export function crowdEnergy(local) {
  if (local < 76 || local >= 144) return 0;
  if (local < 108) return ((local - 76) / 32) ** 1.4;
  if (local < 128) return 1;
  return 1 - smooth((local - 128) / 16);
}

/** A rock kit bar: kicks and snares where given, eighth-note hats, open hats where given. */
function kit(add, { kicks = [0, 2, 2.5], snares = [1, 3], hats = [0.34, 0.2], open = [], vel = 1 } = {}) {
  for (const beat of kicks) add('kick', beat, (beat % 1 ? 0.8 : 0.95) * vel);
  for (const beat of snares) add('snare', beat, 0.9 * vel);
  for (let i = 0; i < 8; i++) if (!open.includes(i / 2)) add('hat', i / 2, (i % 2 ? hats[1] : hats[0]) * vel);
  for (const beat of open) add('hat', beat, 0.3 * vel, { params: { open: true } });
}
/** Guitar and bass together: each riff event is a power chord, and the bass plays its root an octave below. */
function riff(add, events, { vel = 0.8, bass = true } = {}) {
  for (const [offset, name, dur, mute] of events) {
    const chord = CHORDS[name];
    add('guitar', offset, vel * (mute ? 0.72 : 1), { midi: chord.power, dur, params: { mute: Boolean(mute) } });
    if (bass) add('bass', offset, 0.86 * (mute ? 0.85 : 1), { midi: chord.bass, dur: Math.max(0.25, dur - 0.05) });
  }
}
function melody(add, bar, { vel = 0.8, harmony = null, soft = false, pan = 0 } = {}) {
  for (const [offset, midi, dur, scoop] of bar) {
    add('lead', offset, vel, { midi, dur, params: { scoop: Boolean(scoop), soft, pan } });
    if (harmony)
      add('lead', offset, vel * 0.85, { midi: thirdBelow(midi, harmony), dur, params: { soft, pan: -pan || -0.35 } });
  }
}
function fill(add, from = 3, vel = 0.62) {
  for (const [i, midi] of FILL_TOMS.entries()) add('tom', from + i / 4, vel + i * 0.06, { midi });
}

function daylightBar(add, local, bar) {
  const n = local / 4;
  if (local === 0 && bar >= CONFIG.cycleBeats / 4) add('crash', 0, 0.8);
  if (n < 2) {
    // The riff alone over a ticking hat, the kick arriving in the second bar and a snare fill into the band.
    riff(add, RIFF[n], { vel: 0.72, bass: false });
    kit(add, { kicks: n ? [0, 1, 2, 3] : [0], snares: [], hats: [0.24, 0.14], vel: 0.8 });
    if (n === 1) for (let i = 0; i < 4; i++) add('snare', 3 + i / 4, 0.42 + 0.12 * i);
    return;
  }
  if (n < 10) {
    const chord = CHORDS[GROOVE[mod(n - 2, 4)]];
    if (n === 2 || n === 6) add('crash', 0, 0.78);
    // The groove plays a little under the four-hit so the hits can stand out above it.
    kit(add, { kicks: [0, 1.75, 2.5], open: n % 2 ? [3.5] : [], vel: 0.86 });
    if (n < 6) riff(add, RIFF[mod(n - 2, 4)], { vel: 0.72 });
    else {
      // Under the lead the guitar sustains its chords and the bass drives in eighths.
      add('guitar', 0, 0.6, { midi: chord.power, dur: 1.9 });
      add('guitar', 2, 0.52, { midi: chord.power, dur: 1.9 });
      for (let i = 0; i < 8; i++) add('bass', i / 2, i % 2 ? 0.66 : 0.78, { midi: chord.bass, dur: 0.42 });
      melody(add, MELODY.daylight[mod(n - 6, 4)]);
    }
    return;
  }
  if (n < 12) {
    // Two bars climbing into the four-hit: E-flat and F on the beat, then D palm-muted under a snare crescendo.
    const rising = local - 40;
    if (local === 40) add('crash', 0, 0.62);
    for (let beat = 0; beat < 4; beat++) add('kick', beat, 0.72 + 0.03 * (rising + beat));
    // The crescendo climbs toward the hits without reaching them.
    for (let i = 0; i < (local === 44 ? 16 : 8); i++) {
      const offset = local === 44 ? i / 4 : i / 2;
      add('snare', offset, 0.25 + 0.55 * ((rising + offset) / 8));
    }
    for (let i = 0; i < 8; i++) add('hat', i / 2, 0.22);
    if (local === 40)
      for (const [beat, name] of [
        [0, 'Eb'],
        [1, 'Eb'],
        [2, 'F'],
        [3, 'F'],
      ]) {
        add('guitar', beat, 0.78, { midi: CHORDS[name].power, dur: 0.9 });
        add('bass', beat, 0.8, { midi: CHORDS[name].bass, dur: 0.9 });
      }
    else {
      for (let beat = 0; beat < 3; beat++) {
        add('guitar', beat, 0.62 + 0.08 * beat, { midi: CHORDS.D.power, dur: 0.9 });
        add('bass', beat, 0.72 + 0.04 * beat, { midi: CHORDS.D.bass, dur: 0.9 });
      }
      add('guitar', 3.5, 0.85, { midi: CHORDS.D.power, dur: 0.5 });
      fill(add, 3);
    }
    return;
  }
  if (n < 18) {
    // Past the offices: a Queen-like piano interlude over half-time drums; the guitar rests.
    const chord = CHORDS[['Gm', 'Eb', 'Bb'][n - 15]];
    if (local === 64) add('crash', 0, 0.5);
    kit(add, { kicks: [0, 2.5], snares: [2], hats: [0.26, 0.16], vel: 0.85 });
    add('piano', 0, 0.6, { notes: [chord.bass + 12, chord.bass + 24], dur: 2 });
    add('piano', 2, 0.5, { notes: [chord.bass + 12, chord.bass + 24], dur: 2 });
    for (let i = 0; i < 8; i++) {
      const pattern = [0, 1, 2, 3, 2, 1, 2, 3][i];
      add('piano', i / 2, i % 2 ? 0.34 : 0.42, { notes: [chord.piano[pattern] + 12], dur: 0.9 });
    }
    add('bass', 0, 0.8, { midi: chord.bass, dur: 1.4 });
    add('bass', 1.5, 0.66, { midi: chord.bass, dur: 0.45 });
    add('bass', 2.5, 0.78, { midi: chord.bass, dur: 1.4 });
    return;
  }
  // The gateway: F with the full band, then D under a fill into the crowd's chapter.
  if (local === 72) {
    add('crash', 0, 0.78);
    kit(add, { open: [3.5] });
    add('guitar', 0, 0.9, { midi: CHORDS.F.power, dur: 1.9 });
    add('guitar', 2, 0.72, { midi: CHORDS.F.power, dur: 1.9 });
    for (let i = 0; i < 8; i++) add('bass', i / 2, i % 2 ? 0.72 : 0.86, { midi: CHORDS.F.bass, dur: 0.42 });
    for (const beat of [0, 1, 2, 3]) add('piano', beat, 0.42, { notes: CHORDS.F.piano, dur: 0.9 });
    return;
  }
  for (let beat = 0; beat < 4; beat++) add('kick', beat, 0.92);
  for (let i = 0; i < 8; i++) add('hat', i / 2, 0.24);
  for (let i = 0; i < 8; i++) add('snare', 2 + i / 4, 0.38 + 0.07 * i);
  for (const beat of [0, 1, 2]) add('guitar', beat, 0.8 + 0.05 * beat, { midi: CHORDS.D.power, dur: 0.9 });
  for (let i = 0; i < 8; i++) add('bass', i / 2, 0.78 + 0.02 * i, { midi: CHORDS.D.bass, dur: 0.42 });
  fill(add, 3, 0.7);
}

/** The four-hit is the loudest moment of the cycle: stop-time band hits on beats 50, 52, 54 and 56. */
function fourHitBar(add, local) {
  const hits = FOUR_HITS.map(hit => hit - local).filter(offset => offset >= 0 && offset < 4);
  if (local === FOUR_HIT_WINDOW.start) {
    add('crash', 0, 0.75);
    add('kick', 0, 1);
    add('guitar', 0, 0.9, { midi: CHORDS.Gm.power, dur: 1.5 });
    add('bass', 0, 0.9, { midi: CHORDS.Gm.bass, dur: 1.5 });
    add('piano', 0, 0.7, { notes: [43, 50, 55, 58], dur: 1.5 });
    fill(add, 1, 0.55);
  }
  for (const offset of hits) {
    const chord = CHORDS[FOUR_HIT_CHORDS[FOUR_HITS.indexOf(local + offset)]];
    add('snare', offset - 0.5, 0.42);
    add('snare', offset - 0.25, 0.66);
    // The whole band lands together.
    add('kick', offset, 1);
    add('tom', offset, 0.9, { midi: 40 });
    add('snare', offset, 1);
    add('crash', offset, 0.9);
    add('guitar', offset, 1, { midi: chord.power, dur: 1.2 });
    add('bass', offset, 0.95, { midi: chord.bass, dur: 1.4 });
    add('piano', offset, 0.95, { notes: [chord.bass + 12, ...chord.piano], dur: 1.2 });
  }
  // Only a ticking hat keeps the walker's pulse between the hits.
  for (let i = 0; i < 8; i++) {
    const offset = i / 2;
    if (!hits.includes(offset)) add('hat', offset, i % 2 ? 0.3 : 0.22);
  }
  if (local === FOUR_HITS.at(-1)) {
    // A fill and a roll, and the riff drops back in on beat 58.
    fill(add, 1, 0.62);
    add('crash', 2, 0.85);
    add('kick', 2, 0.95);
    add('snare', 3, 0.9);
    riff(
      add,
      RIFF[0].filter(([offset]) => offset > 2),
    );
    add('guitar', 2, 0.9, { midi: CHORDS.Gm.power, dur: 0.5 });
    add('bass', 2, 0.9, { midi: CHORDS.Gm.bass, dur: 0.45 });
  }
}

function pocketBar(add, local) {
  const n = (local - 80) / 4,
    energy = crowdEnergy(local);
  if (local < 112) {
    // The crowd's stamp-stamp-clap, carried by the kit until enough people join to make it themselves.
    const chord = CHORDS[n % 2 ? 'C' : 'Gm'];
    if (local === 80) {
      add('crash', 0, 0.85);
      add('guitar', 0, 0.9, { midi: CHORDS.Gm.power, dur: 1.5 });
    }
    add('kick', 0, 0.85);
    add('kick', 1, 0.8);
    add('snare', 2, 0.82);
    for (let i = 0; i < 7; i++) if (i !== 4) add('hat', i / 2, i % 2 ? 0.18 : 0.28);
    add('hat', 3.5, 0.24, { params: { open: true } });
    if (energy > 0) {
      const people = 1 + Math.round(4 * energy);
      add('stomp', 0, 0.5 + 0.4 * energy, { params: { count: people } });
      add('stomp', 1, 0.5 + 0.4 * energy, { params: { count: people } });
      add('groupClap', 2, 0.5 + 0.4 * energy, { params: { count: 3 + Math.round(9 * energy) } });
    }
    // A funk-rock bass line on G minor and C, the guitar stabbing with the clap.
    const line = n % 2 ? BASS_LINE[1] : BASS_LINE[0];
    for (const [offset, midi, dur] of line)
      add('bass', offset, offset % 1 ? 0.7 : 0.86, { midi, dur, params: { style: 'funk' } });
    if (local !== 80) add('guitar', 2, 0.68, { midi: chord.power, dur: 0.45 });
    if (local === 108) {
      for (let i = 8; i < 16; i++) add('snare', i / 4, 0.4 + 0.07 * (i - 8));
      fill(add, 3, 0.7);
    }
    return;
  }
  if (local < 128) {
    // Everyone walks together: the band lands on G minor, C, E-flat and F with twin harmony guitars on top.
    const bar = mod(n - 8, 4),
      chord = CHORDS[['Gm', 'C', 'Eb', 'F'][bar]];
    if (bar === 0 || bar === 2) add('crash', 0, 0.82);
    kit(add, { open: [3.5] });
    for (const beat of [1, 3]) add('groupClap', beat, 0.7, { params: { count: 3 + Math.round(9 * energy) } });
    add('guitar', 0, 0.85, { midi: chord.power, dur: 1.9 });
    add('guitar', 2, 0.7, { midi: chord.power, dur: 1.9 });
    for (let i = 0; i < 8; i++) add('bass', i / 2, i % 2 ? 0.72 : 0.86, { midi: chord.bass, dur: 0.42 });
    melody(add, MELODY.pocket[bar], { vel: 0.85, harmony: bar === 1 ? G_DORIAN : G_MINOR, pan: 0.35 });
    return;
  }
  // The farewell crossroad: the band thins toward the flowers, landing on B-flat for the E-flat ballad.
  const chord = CHORDS[['Gm', 'Eb', 'Cm', 'Bb'][n - 12]];
  if (local === 128) add('crash', 0, 0.7);
  add('kick', 0, 0.72);
  if (local < 136) add('kick', 2, 0.62);
  if (local < 140) add('snare', 3, 0.5);
  for (let i = 0; i < 8; i++) add('hat', i / 2, i % 2 ? 0.14 : 0.24);
  if (energy > 0.05)
    for (const beat of [1, 3])
      add('groupClap', beat, 0.4 * energy + 0.2, { params: { count: 2 + Math.round(8 * energy) } });
  if (local < 136) add('guitar', 0, 0.55, { midi: chord.power, dur: 3.5 });
  add('bass', 0, 0.5, { midi: chord.bass + 12, dur: 3.6, params: { style: local < 136 ? 'rock' : 'ballad' } });
  for (let i = 0; i < 8; i++)
    add('piano', i / 2, 0.3, { notes: [chord.piano[[0, 1, 2, 3, 2, 1, 2, 3][i]] + 12], dur: 0.9 });
  // A soft snare roll carries the last crossroad into the flowers.
  if (local === 140) for (let i = 8; i < 16; i++) add('snare', i / 4, 0.12 + 0.04 * (i - 8));
}

function lyricBar(add, local) {
  const n = (local - 144) / 4,
    name = n >= 15 ? 'F' : n >= 14 ? 'Cm7' : ['Ebmaj7', 'BbD', 'Cm7', 'Abmaj7'][mod(n, 4)],
    chord = BALLAD[name];
  // Piano: the left hand's octave, and the right hand rising and falling through the chord.
  add('piano', 0, 0.3, { notes: chord.hand, dur: 3.9 });
  for (let i = 0; i < 8; i++)
    add('piano', i / 2, (i % 2 ? 0.16 : 0.2) * (n >= 12 ? 1.25 : 1), {
      notes: [chord.arpeggio[[0, 1, 2, 3, 4, 3, 2, 1][i]]],
      dur: 1.2,
    });
  if (n >= 2) add('bass', 0, 0.32, { midi: chord.bass, dur: 3.8, params: { style: 'ballad' } });
  // The walker's pulse without drums: a soft heartbeat and a shaker.
  for (const beat of n >= 12 ? [0, 1, 2, 3] : [0, 2])
    if (n >= 1 || beat === 0) add('kick', beat, beat === 0 ? 0.38 : 0.26, { params: { tone: 'soft' } });
  for (let beat = 0; beat < 4; beat++) add('shaker', beat, 0.15);
  if (n >= 4 && n < 8)
    for (const [offset, midi, dur] of MELODY.lyric[mod(n, 4)]) add('piano', offset, 0.34, { notes: [midi], dur });
  if (n >= 8 && n < 12) melody(add, MELODY.lyric[mod(n, 4)], { vel: 0.48, soft: true });
  if (n === 14) for (let i = 0; i < 16; i++) add('snare', i / 4, 0.12 + 0.02 * i);
  if (n === 15) {
    for (let i = 0; i < 16; i++) add('snare', i / 4, 0.46 + 0.03 * i);
    add('guitar', 2, 0.6, { midi: CHORDS.F.power, dur: 0.9 });
    add('guitar', 3, 0.7, { midi: CHORDS.F.power, dur: 0.9 });
    fill(add, 3, 0.7);
  }
}

function paradeBar(add, local) {
  const n = (local - 208) / 4,
    names = [['Bb'], ['FA'], ['Gm'], ['Eb', 'F']][mod(n, 4)],
    last = local === CONFIG.cycleBeats - 4;
  if (local === 208) add('crash', 0, 0.85);
  else if (n % 4 === 0) add('crash', 0, 0.7);
  kit(add, { kicks: n % 2 ? [0, 2, 2.5] : [0, 2], vel: 0.95 });
  if (n % 2 && !last)
    for (const [i, offset] of [3.25, 3.5, 3.75].entries())
      add('snare', offset, 0.34 + i * 0.1, { params: { tone: 'march' } });
  for (const [half, name] of names.entries()) {
    const chord = CHORDS[name],
      from = names.length > 1 ? half * 2 : 0,
      span = names.length > 1 ? 2 : 4;
    add('guitar', from, 0.62, { midi: chord.power, dur: span - 0.1 });
    add('piano', from, 0.5, { notes: [chord.bass + 12, chord.bass + 24], dur: span });
    for (let i = from * 2; i < (from + span) * 2; i++) {
      add('piano', i / 2, i % 2 ? 0.28 : 0.36, { notes: chord.piano.map(m => m + 12), dur: 0.45 });
      add('bass', i / 2, i % 2 ? 0.7 : 0.84, { midi: chord.bass + 12, dur: 0.42 });
    }
  }
  if (n >= 1 && n < 9) melody(add, MELODY.parade[mod(n, 4)], { vel: 0.72, harmony: B_FLAT, pan: 0.35 });
  if (last) {
    for (let i = 8; i < 16; i++) add('snare', i / 4, 0.42 + 0.07 * (i - 8), { params: { tone: 'march' } });
    fill(add, 3, 0.78);
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
