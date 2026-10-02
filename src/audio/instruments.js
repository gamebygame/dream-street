import { SECONDS_PER_BEAT } from '../config.js';
import { noiseBuffer } from './mixer.js';
import { chordFor, toneBuffer } from './tones.js';

const hz = midi => 440 * 2 ** ((midi - 69) / 12);
const FLOOR = 0.0001;

/** Deterministic 0..1 value from a note id, so repeated notes vary without Math.random. */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

const curves = new Map();
/** A tanh transfer curve for a valve-like overdrive of the given amount. */
function driveCurve(amount) {
  if (!curves.has(amount)) {
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(amount * ((i / (curve.length - 1)) * 2 - 1));
    curves.set(amount, curve);
  }
  return curves.get(amount);
}

const pianoWaves = new WeakMap();
/**
 * Harmonic spectrum of a struck piano string; the strong second and third partials give it its clang. The two
 * strings of a note use sine and cosine phases, so their attacks do not add up into one sharp peak.
 */
function pianoWave(context, string) {
  if (!pianoWaves.has(context)) {
    const amplitudes = Float32Array.from([
        0, 1, 0.66, 0.5, 0.3, 0.24, 0.17, 0.12, 0.1, 0.07, 0.055, 0.045, 0.035, 0.025, 0.02, 0.015,
      ]),
      silent = new Float32Array(amplitudes.length);
    pianoWaves.set(context, [
      context.createPeriodicWave(silent, amplitudes),
      context.createPeriodicWave(amplitudes, silent),
    ]);
  }
  return pianoWaves.get(context)[string];
}

/** Collects the nodes of one note so the mixer can stop and release them together. */
class Voice {
  constructor(mixer, note, when) {
    this.mixer = mixer;
    this.context = mixer.context;
    this.note = note;
    this.when = when;
    this.end = when;
    this.sources = [];
    this.nodes = [];
  }
  osc(type, frequency, detune = 0) {
    const osc = this.context.createOscillator();
    if (type === 'piano' || type === 'piano2') osc.setPeriodicWave(pianoWave(this.context, type === 'piano' ? 0 : 1));
    else osc.type = type;
    osc.frequency.setValueAtTime(frequency, this.when);
    osc.detune.value = detune;
    this.sources.push(osc);
    this.nodes.push(osc);
    return osc;
  }
  noise() {
    const source = this.context.createBufferSource();
    source.buffer = noiseBuffer(this.context);
    source.loop = true;
    source.offsetSeconds = hash(this.note.id) * 0.9;
    this.sources.push(source);
    this.nodes.push(source);
    return source;
  }
  /** A pre-rendered tone; `offset` seconds into it, `at` a context time other than the note's own. */
  tone(id, { rate = 1, offset = 0, loop = false, at = this.when } = {}) {
    const source = this.context.createBufferSource();
    source.buffer = toneBuffer(this.context, id);
    source.playbackRate.value = rate;
    source.loop = loop;
    source.offsetSeconds = offset;
    source.startAt = at;
    this.sources.push(source);
    this.nodes.push(source);
    return source;
  }
  gain(value = 0) {
    const gain = this.context.createGain();
    gain.gain.value = value;
    this.nodes.push(gain);
    return gain;
  }
  filter(type, frequency, q = 0.7, gainDb = 0) {
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, this.when);
    filter.Q.value = q;
    filter.gain.value = gainDb;
    this.nodes.push(filter);
    return filter;
  }
  shaper(amount) {
    const shaper = this.context.createWaveShaper();
    shaper.curve = driveCurve(amount);
    shaper.oversample = '2x';
    this.nodes.push(shaper);
    return shaper;
  }
  pan(value) {
    if (typeof this.context.createStereoPanner !== 'function') return this.gain(1);
    const panner = this.context.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, value));
    this.nodes.push(panner);
    return panner;
  }
  chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes.at(-1);
  }
  /** Sends a copy of `node` into the shared room. */
  room(node, amount) {
    const send = this.gain(amount);
    node.connect(send);
    send.connect(this.mixer.room);
  }
  /** A percussive envelope: fast attack to `peak`, exponential fall over `decay` seconds. */
  hit(gain, peak, decay, at = this.when, attack = 0.002) {
    gain.gain.setValueAtTime(FLOOR, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(FLOOR, peak), at + attack);
    gain.gain.exponentialRampToValueAtTime(FLOOR, at + attack + decay);
    this.end = Math.max(this.end, at + attack + decay + 0.02);
  }
  /** A held envelope: attack, sustain for `length` seconds, then release. Resumed notes fade in quickly instead. */
  hold(
    gain,
    peak,
    length,
    { attack = 0.01, release = 0.08, sustain = 0.85, decay = 0.2, resumed = false, at = this.when } = {},
  ) {
    const t = at,
      rise = resumed ? 0.015 : attack,
      stop = t + Math.max(rise + 0.005, length),
      held = Math.max(FLOOR, peak * sustain),
      top = resumed ? held : Math.max(FLOOR, peak);
    gain.gain.setValueAtTime(FLOOR, t);
    gain.gain.exponentialRampToValueAtTime(top, t + rise);
    // A note shorter than its decay releases from wherever the decay has reached; automation events must stay in
    // time order, or the release would be followed by a ramp back up.
    let level = top;
    if (!resumed) {
      const fraction = Math.min(1, (stop - t - rise) / decay);
      level = top * Math.pow(held / top, fraction);
      gain.gain.exponentialRampToValueAtTime(level, t + rise + fraction * decay);
    }
    gain.gain.setValueAtTime(level, stop);
    gain.gain.exponentialRampToValueAtTime(FLOOR, stop + release);
    this.end = Math.max(this.end, stop + release + 0.02);
  }
  start() {
    for (const source of this.sources) {
      source.start(source.startAt ?? this.when, source.offsetSeconds ?? 0);
      source.stop(this.end);
    }
    this.mixer.track({ sources: this.sources, nodes: this.nodes, last: this.sources[0] });
  }
}

const drums = {
  /** A warm, dry rock kick: a sine body that drops an octave and a felt beater's soft knock. */
  kick(v, note) {
    const soft = note.params?.tone === 'soft',
      body = v.osc('sine', soft ? 88 : 112),
      level = v.gain();
    body.frequency.exponentialRampToValueAtTime(soft ? 44 : 54, v.when + (soft ? 0.09 : 0.06));
    v.hit(level, note.vel * (soft ? 0.62 : 0.85), soft ? 0.42 : 0.3);
    v.chain(body, level, v.mixer.input('drums'));
    if (soft) return;
    const beater = v.noise(),
      felt = v.filter('lowpass', 2200, 0.7),
      beaterLevel = v.gain();
    v.hit(beaterLevel, note.vel * 0.22, 0.012);
    v.chain(beater, felt, beaterLevel, v.mixer.input('drums'));
  },
  /** A rock snare: two head modes, the snare wires' rattle without a hissing top, the stick's crack, some room. */
  snare(v, note) {
    const march = note.params?.tone === 'march',
      ghost = note.vel < 0.36;
    for (const [frequency, share] of [
      [186, 0.34],
      [330, 0.15],
    ]) {
      const head = v.osc('triangle', frequency),
        level = v.gain();
      head.frequency.exponentialRampToValueAtTime(frequency * 0.88, v.when + 0.03);
      v.hit(level, note.vel * share, ghost ? 0.05 : 0.12);
      v.chain(head, level, v.mixer.input('drums'));
    }
    const wires = v.noise(),
      high = v.filter('highpass', march ? 2200 : 1500),
      top = v.filter('lowpass', 8000, 0.7),
      body = v.filter('peaking', 4200, 0.9, 3),
      wireLevel = v.gain();
    v.hit(wireLevel, note.vel * 0.46, ghost ? 0.07 : march ? 0.15 : 0.2);
    v.chain(wires, high, top, body, wireLevel, v.mixer.input('drums'));
    const crack = v.noise(),
      band = v.filter('bandpass', 2600, 0.8),
      crackLevel = v.gain();
    v.hit(crackLevel, note.vel * 0.34, 0.018);
    v.chain(crack, band, crackLevel, v.mixer.input('drums'));
    if (!ghost) v.room(wireLevel, 0.3);
  },
  /** Hi-hats: the rendered bronze pair, closed to a tick or left open to wash. */
  hat(v, note) {
    const open = note.params?.open,
      cymbal = v.tone('hat', { offset: hash(note.id) * 0.02 }),
      high = v.filter('highpass', 6000),
      level = v.gain(),
      pan = v.pan(0.24);
    v.hit(level, note.vel * 0.42, open ? 0.3 : 0.05, v.when, 0.001);
    v.chain(cymbal, high, level, pan, v.mixer.input('drums'));
  },
  /** A crash cymbal ringing out and darkening as it decays. */
  crash(v, note) {
    const cymbal = v.tone('crash', { offset: hash(note.id) * 0.01 }),
      level = v.gain();
    v.hit(level, note.vel * 0.55, 2.2, v.when, 0.002);
    v.chain(cymbal, level, v.mixer.input('drums'));
    v.room(level, 0.18);
  },
  tom(v, note) {
    const f = hz(note.midi),
      body = v.osc('sine', f * 1.6),
      skin = v.osc('triangle', f * 2.4),
      level = v.gain(),
      skinLevel = v.gain();
    body.frequency.exponentialRampToValueAtTime(f, v.when + 0.09);
    skin.frequency.exponentialRampToValueAtTime(f * 1.5, v.when + 0.05);
    v.hit(level, note.vel * 0.72, 0.34);
    v.hit(skinLevel, note.vel * 0.1, 0.05);
    v.chain(body, level, v.mixer.input('drums'));
    v.chain(skin, skinLevel, v.mixer.input('drums'));
    v.room(level, 0.18);
  },
  shaker(v, note) {
    const noise = v.noise(),
      band = v.filter('bandpass', 6200, 1.4),
      level = v.gain(),
      pan = v.pan(-0.2);
    v.hit(level, note.vel * 0.3, 0.05, v.when, 0.012);
    v.chain(noise, band, level, pan, v.mixer.input('drums'));
  },
};

const tonal = {
  /**
   * Electric bass with the round, woody tone of old flatwound strings: picked for rock, a little brighter and
   * shorter for the funk line, or soft for the ballad.
   */
  bass(v, note, resumed) {
    const { style = 'rock' } = note.params ?? {},
      f = hz(note.midi),
      out = v.gain();
    if (style === 'ballad') {
      const round = v.osc('sine', f),
        warm = v.osc('triangle', f, 3),
        tone = v.filter('lowpass', 650, 0.7);
      v.chain(round, tone);
      v.chain(warm, tone);
      v.hold(out, note.vel * 0.44, note.length, { attack: 0.03, release: 0.25, sustain: 0.7, decay: 0.7, resumed });
      v.chain(tone, out, v.mixer.input('bass'));
      return;
    }
    const funk = style === 'funk',
      string = v.osc('triangle', f),
      edge = v.osc('sawtooth', f),
      edgeLevel = v.gain(0.3),
      fundamental = v.osc('sine', f),
      body = v.gain(0.7),
      tone = v.filter('lowpass', funk ? 2400 : 1500, funk ? 1.4 : 0.9);
    tone.frequency.exponentialRampToValueAtTime(funk ? 800 : 560, v.when + (funk ? 0.12 : 0.22));
    v.chain(string, tone);
    v.chain(edge, edgeLevel, tone);
    v.chain(fundamental, body, tone);
    v.hold(out, note.vel * 0.46, note.length, {
      attack: 0.003,
      release: funk ? 0.03 : 0.05,
      sustain: funk ? 0.55 : 0.72,
      decay: funk ? 0.14 : 0.3,
      resumed,
    });
    v.chain(tone, out, v.mixer.input('bass'));
  },
  /**
   * Rhythm guitar: a rendered power chord, double-tracked hard left and right with a hair of timing and tuning
   * between the takes, as rock records do. `mute` plays palm-muted chugs.
   */
  guitar(v, note, resumed) {
    const mute = note.params?.mute,
      { root, rate } = chordFor(note.midi),
      id = `${mute ? 'chug' : 'chord'}:${root}`;
    for (const [side, detune, late] of [
      [-1, 1, 0],
      [1, 1.0026, 0.007],
    ]) {
      const take = v.tone(id, { rate: rate * detune, offset: note.elapsed * rate, at: v.when + late }),
        level = v.gain(),
        pan = v.pan(side * 0.6);
      v.hold(level, note.vel * 0.5, note.length - late, {
        attack: 0.002,
        release: mute ? 0.04 : 0.09,
        sustain: 1,
        decay: 0.01,
        resumed,
        at: v.when + late,
      });
      v.chain(take, level, pan, v.mixer.input('guitar'));
    }
  },
  /**
   * A singing lead guitar in the older, smoother manner: a rounded source into a valve amp just breaking up and a
   * cabinet, a pick's transient, and a vibrato that blooms once the note is held. `scoop` bends up into the note;
   * `soft` is the violin-like tone for the ballad, swelled in with the volume knob.
   */
  lead(v, note, resumed) {
    const { scoop = false, soft = false, pan = 0 } = note.params ?? {},
      f = hz(note.midi),
      a = v.osc('triangle', f, -4),
      b = v.osc('sawtooth', f, 5),
      mix = v.gain(0.18),
      tame = v.filter('lowpass', soft ? 1600 : 2200, 0.7),
      drive = v.gain(soft ? 1.2 : 2.4),
      amp = v.shaper(soft ? 1.8 : 2.8),
      low = v.filter('highpass', 170),
      voice = v.filter('peaking', 1250, 0.9, 3),
      cabinet = v.filter('lowpass', soft ? 3000 : 3800, 0.8),
      out = v.gain(),
      spread = v.pan(pan);
    v.chain(a, tame);
    v.chain(b, mix, tame);
    v.chain(tame, drive, amp, low, voice, cabinet, out, spread, v.mixer.input('lead'));
    const vibrato = v.osc('sine', 5.6),
      depth = v.gain(0);
    depth.gain.setValueAtTime(0, v.when);
    depth.gain.linearRampToValueAtTime(0, v.when + Math.min(0.25, note.length * 0.5));
    depth.gain.linearRampToValueAtTime(soft ? 14 : 18, v.when + Math.min(0.7, note.length));
    v.chain(vibrato, depth);
    depth.connect(a.detune);
    depth.connect(b.detune);
    if (scoop && !resumed)
      for (const osc of [a, b]) {
        osc.detune.setValueAtTime(osc.detune.value - 110, v.when);
        osc.detune.linearRampToValueAtTime(osc.detune.value, v.when + 0.07);
      }
    if (!soft && !resumed) {
      const pick = v.noise(),
        band = v.filter('bandpass', 3000, 1.2),
        pickLevel = v.gain();
      v.hit(pickLevel, note.vel * 0.05, 0.012);
      v.chain(pick, band, pickLevel, drive);
    }
    v.hold(out, note.vel * (soft ? 0.2 : 0.17), note.length, {
      attack: soft ? 0.18 : 0.006,
      release: soft ? 0.3 : 0.12,
      sustain: 0.85,
      decay: 0.3,
      resumed,
    });
  },
  /**
   * Piano: a struck-string spectrum on two slightly detuned strings, a hammer's thud, brightness that fades as the
   * note decays, and the two-stage decay of a real piano: a quick fall, then a long singing tail.
   */
  piano(v, note, resumed) {
    const notes = note.notes ?? [note.midi],
      out = v.gain(1),
      stop = v.when + Math.max(0.05, note.length);
    for (const [i, midi] of notes.entries()) {
      const f = hz(midi),
        level = v.gain(),
        tone = v.filter('lowpass', Math.min(9000, f * 16), 0.5),
        spread = v.pan((i / Math.max(1, notes.length - 1) - 0.5) * 0.5 + (midi - 60) / 90),
        peak = (note.vel * 0.3) / Math.sqrt(notes.length),
        tail = Math.max(0.9, 3.4 - (midi - 48) * 0.05);
      tone.frequency.setTargetAtTime(f * 3.5 + 300, v.when + 0.01, 0.45);
      v.chain(v.osc('piano', f, -1.2), tone);
      v.chain(v.osc('piano2', f, 1.2), tone);
      if (midi < 50) {
        const weight = v.gain(0.5);
        v.chain(v.osc('sine', f), weight, tone);
      }
      const g = level.gain,
        start = resumed ? peak * 0.4 : peak;
      g.setValueAtTime(FLOOR, v.when);
      g.exponentialRampToValueAtTime(start, v.when + (resumed ? 0.02 : 0.002));
      g.setTargetAtTime(peak * 0.4, v.when + 0.002, 0.1);
      if (stop > v.when + 0.35) g.setTargetAtTime(FLOOR, v.when + 0.35, tail);
      g.setTargetAtTime(FLOOR, stop, 0.06);
      v.chain(tone, level, spread, out);
    }
    if (!resumed) {
      const hammer = v.noise(),
        band = v.filter('bandpass', 2400, 1),
        hammerLevel = v.gain();
      v.hit(hammerLevel, note.vel * 0.035, 0.008);
      v.chain(hammer, band, hammerLevel, out);
    }
    v.end = Math.max(v.end, stop + 0.4);
    out.connect(v.mixer.input('keys'));
  },
};

const crowd = {
  /** Many people clapping together: a few milliseconds apart, each a little different. */
  groupClap(v, note) {
    const count = note.params?.count ?? 6;
    for (let i = 0; i < count; i++) {
      const offset = (hash(`${note.id}:${i}`) - 0.5) * 0.028,
        at = v.when + Math.max(0, offset + 0.014),
        noise = v.noise(),
        band = v.filter('bandpass', 1050 + hash(`${note.id}:f${i}`) * 700, 1.3),
        level = v.gain(),
        pan = v.pan((hash(`${note.id}:p${i}`) - 0.5) * 1.2);
      v.hit(level, (note.vel * 0.55) / Math.sqrt(count), 0.09, at, 0.001);
      v.chain(noise, band, level, pan, v.mixer.input('crowd'));
    }
  },
  /** People stamping on the boards: a low boom and the wood's knock, a few feet at a time, in a big room. */
  stomp(v, note) {
    const count = Math.max(1, Math.min(5, note.params?.count ?? 1)),
      room = v.gain(1);
    for (let i = 0; i < count; i++) {
      const at = v.when + (count > 1 ? Math.max(0, (hash(`${note.id}:${i}`) - 0.3) * 0.022) : 0),
        boom = v.osc('sine', 74),
        boomLevel = v.gain(),
        knock = v.noise(),
        wood = v.filter('bandpass', 210 + 90 * hash(`${note.id}:w${i}`), 1.5),
        knockLevel = v.gain(),
        pan = v.pan((hash(`${note.id}:p${i}`) - 0.5) * 0.9);
      boom.frequency.setValueAtTime(74, at);
      boom.frequency.exponentialRampToValueAtTime(40, at + 0.14);
      v.hit(boomLevel, (note.vel * 0.5) / Math.sqrt(count), 0.24, at);
      v.hit(knockLevel, (note.vel * 0.5) / Math.sqrt(count), 0.07, at);
      v.chain(boom, boomLevel, pan, room);
      v.chain(knock, wood, knockLevel, pan);
    }
    room.connect(v.mixer.input('crowd'));
    v.room(room, 0.35);
  },
  /**
   * One pair of hands, the visitor's own clap: the palms' hollow knock and, a few milliseconds behind it, the
   * fingers' slap, from the viewer's side of the room. `soft` is for the four-hit and the flowers.
   */
  clap(v, note) {
    const soft = note.params?.soft,
      room = v.gain(1);
    for (const [frequency, q, share, decay, delay] of [
      [soft ? 650 : 820, 1.1, soft ? 0.55 : 0.85, soft ? 0.05 : 0.065, 0],
      [soft ? 1700 : 2300, 1.4, soft ? 0.32 : 0.6, 0.022, 0.004],
    ]) {
      const noise = v.noise(),
        band = v.filter('bandpass', frequency, q),
        level = v.gain();
      v.hit(level, note.vel * share, decay, v.when + delay, 0.0015);
      v.chain(noise, band, level, room);
    }
    v.chain(room, v.pan(-0.12), v.mixer.input('crowd'));
    v.room(room, soft ? 0.2 : 0.3);
  },
};

const INSTRUMENTS = { ...drums, ...tonal, ...crowd };
export const INSTRUMENT_NAMES = Object.freeze(Object.keys(INSTRUMENTS));
/** Instruments whose notes are long enough to be re-entered mid-note after a pause or seek. */
export const SUSTAINED = Object.freeze(['bass', 'guitar', 'lead', 'piano']);

/**
 * Plays one score note at context time `when`. `offset` seconds skips into a sustained note after a pause or
 * seek; percussive notes are never resumed mid-way.
 */
export function playNote(mixer, note, when, offset = 0) {
  const play = INSTRUMENTS[note.inst];
  if (!play) throw new Error(`Unknown instrument ${note.inst}`);
  const length = Math.max(0.02, (note.dur ?? 0.25) * SECONDS_PER_BEAT - offset),
    voiced = { ...note, length, elapsed: offset };
  const voice = new Voice(mixer, voiced, when);
  play(voice, voiced, offset > 0);
  voice.start();
  return voice;
}
