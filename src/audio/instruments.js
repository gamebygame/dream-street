import { SECONDS_PER_BEAT } from '../config.js';
import { noiseBuffer } from './mixer.js';

const hz = midi => 440 * 2 ** ((midi - 69) / 12);
const FLOOR = 0.0001;

/** Deterministic 0..1 value from a note id, so repeated notes vary without Math.random. */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
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
    osc.type = type;
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
  gain(value = 0) {
    const gain = this.context.createGain();
    gain.gain.value = value;
    this.nodes.push(gain);
    return gain;
  }
  filter(type, frequency, q = 0.7) {
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, this.when);
    filter.Q.value = q;
    this.nodes.push(filter);
    return filter;
  }
  pan(value) {
    if (typeof this.context.createStereoPanner !== 'function') return this.gain(1);
    const panner = this.context.createStereoPanner();
    panner.pan.value = value;
    this.nodes.push(panner);
    return panner;
  }
  chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes.at(-1);
  }
  /** A percussive envelope: fast attack to `peak`, exponential fall over `decay` seconds. */
  hit(gain, peak, decay, at = this.when, attack = 0.002) {
    gain.gain.setValueAtTime(FLOOR, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(FLOOR, peak), at + attack);
    gain.gain.exponentialRampToValueAtTime(FLOOR, at + attack + decay);
    this.end = Math.max(this.end, at + attack + decay + 0.02);
  }
  /** A held envelope: attack, sustain for `length` seconds, then release. Resumed notes fade in quickly instead. */
  hold(gain, peak, length, { attack = 0.01, release = 0.08, sustain = 0.85, decay = 0.2, resumed = false } = {}) {
    const t = this.when,
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
      source.start(this.when, source.offsetSeconds ?? 0);
      source.stop(this.end);
    }
    this.mixer.track({ sources: this.sources, nodes: this.nodes, last: this.sources[0] });
  }
}

const drums = {
  kick(v, note) {
    const { tone = 'club', duck, release } = note.params ?? {},
      soft = tone === 'soft',
      march = tone === 'march';
    const body = v.osc('sine', soft ? 92 : march ? 120 : 158),
      level = v.gain();
    body.frequency.exponentialRampToValueAtTime(soft ? 42 : march ? 52 : 46, v.when + (soft ? 0.09 : 0.068));
    v.hit(level, note.vel * (soft ? 0.62 : 1), soft ? 0.34 : march ? 0.26 : 0.4);
    v.chain(body, level, v.mixer.input('drums'));
    if (!soft) {
      const click = v.noise(),
        tone2 = v.filter('highpass', march ? 900 : 1700),
        clickLevel = v.gain();
      v.hit(clickLevel, note.vel * (march ? 0.22 : 0.3), 0.012);
      v.chain(click, tone2, clickLevel, v.mixer.input('drums'));
    }
    if (duck) v.mixer.duck(v.when, duck, release ?? 0.2);
  },
  snare(v, note) {
    const { tone = 'tight' } = note.params ?? {},
      march = tone === 'march';
    const body = v.osc('triangle', march ? 205 : 228),
      bodyLevel = v.gain();
    body.frequency.exponentialRampToValueAtTime(march ? 150 : 172, v.when + 0.03);
    v.hit(bodyLevel, note.vel * 0.5, 0.11);
    v.chain(body, bodyLevel, v.mixer.input('drums'));
    const rattle = v.noise(),
      band = v.filter('bandpass', march ? 3200 : 2100, march ? 0.5 : 0.75),
      rattleLevel = v.gain();
    v.hit(rattleLevel, note.vel * (march ? 0.62 : 0.72), march ? 0.2 : 0.17);
    v.chain(rattle, band, rattleLevel, v.mixer.input('drums'));
  },
  clap(v, note) {
    const noise = v.noise(),
      band = v.filter('bandpass', 1250, 1.1),
      level = v.gain();
    // Three tight bursts, then the room.
    level.gain.setValueAtTime(FLOOR, v.when);
    for (const offset of [0, 0.011, 0.023]) {
      level.gain.exponentialRampToValueAtTime(note.vel * 0.8, v.when + offset + 0.001);
      level.gain.exponentialRampToValueAtTime(note.vel * 0.12, v.when + offset + 0.009);
    }
    level.gain.exponentialRampToValueAtTime(FLOOR, v.when + 0.2);
    v.end = v.when + 0.22;
    v.chain(noise, band, level, v.mixer.input('drums'));
  },
  hat(v, note) {
    const open = note.params?.open,
      noise = v.noise(),
      high = v.filter('highpass', 7200),
      air = v.filter('peaking', 10500, 0.8),
      level = v.gain(),
      pan = v.pan(0.18);
    air.gain.value = 5;
    v.hit(level, note.vel * 0.36, open ? 0.26 : 0.034);
    v.chain(noise, high, air, level, pan, v.mixer.input('drums'));
  },
  shaker(v, note) {
    const noise = v.noise(),
      band = v.filter('bandpass', 6200, 1.4),
      level = v.gain(),
      pan = v.pan(-0.2);
    v.hit(level, note.vel * 0.3, 0.05, v.when, 0.012);
    v.chain(noise, band, level, pan, v.mixer.input('drums'));
  },
  tom(v, note) {
    const f = hz(note.midi),
      body = v.osc('sine', f * 1.7),
      level = v.gain();
    body.frequency.exponentialRampToValueAtTime(f, v.when + 0.1);
    v.hit(level, note.vel * 0.7, 0.28);
    v.chain(body, level, v.mixer.input('drums'));
  },
};

const effects = {
  crash(v, note) {
    const swell = note.params?.swell,
      length = swell ? note.dur * SECONDS_PER_BEAT : 1.9,
      noise = v.noise(),
      high = v.filter('highpass', 3800),
      shimmer = v.filter('peaking', 7600, 1.2),
      level = v.gain();
    shimmer.gain.value = 6;
    if (swell) {
      // A reversed cymbal: it grows toward the next downbeat and stops on it.
      level.gain.setValueAtTime(FLOOR, v.when);
      level.gain.exponentialRampToValueAtTime(note.vel * 0.5, v.when + length);
      level.gain.linearRampToValueAtTime(0, v.when + length + 0.02);
      v.end = v.when + length + 0.04;
    } else v.hit(level, note.vel * 0.5, length);
    v.chain(noise, high, shimmer, level, v.mixer.input('fx'));
  },
  impact(v, note) {
    const drop = v.osc('sine', 62),
      level = v.gain();
    drop.frequency.exponentialRampToValueAtTime(29, v.when + 0.9);
    v.hit(level, note.vel * 0.95, 1.1);
    v.chain(drop, level, v.mixer.input('fx'));
  },
  riser(v, note) {
    const length = note.dur * SECONDS_PER_BEAT,
      noise = v.noise(),
      band = v.filter('bandpass', 320, 2.2),
      level = v.gain();
    band.frequency.exponentialRampToValueAtTime(6400, v.when + length);
    level.gain.setValueAtTime(FLOOR, v.when);
    level.gain.exponentialRampToValueAtTime(note.vel * 0.42, v.when + length);
    level.gain.linearRampToValueAtTime(0, v.when + length + 0.03);
    v.end = v.when + length + 0.05;
    v.chain(noise, band, level, v.mixer.input('fx'));
  },
};

const tonal = {
  bass(v, note, resumed) {
    const { style = 'pump' } = note.params ?? {},
      f = hz(note.midi),
      length = note.length;
    const out = v.gain(),
      tone = v.filter('lowpass', 1400, style === 'funk' ? 7 : 3.2);
    if (style === 'soft') {
      const sine = v.osc('sine', f),
        warm = v.osc('triangle', f, 4);
      tone.frequency.setValueAtTime(620, v.when);
      v.chain(sine, tone);
      v.chain(warm, tone);
      v.hold(out, note.vel * 0.42, length, { attack: 0.03, release: 0.25, sustain: 0.7, decay: 0.6, resumed });
    } else if (style === 'tuba') {
      const square = v.osc('square', f),
        sub = v.osc('sine', f / 2);
      tone.frequency.setValueAtTime(760, v.when);
      v.chain(square, tone);
      v.chain(sub, tone);
      v.hold(out, note.vel * 0.55, length, { attack: 0.012, release: 0.06, sustain: 0.6, decay: 0.12, resumed });
    } else {
      const saw = v.osc('sawtooth', f),
        sub = v.osc('sine', f / 2);
      const open = style === 'funk' ? 2600 : 1500,
        closed = style === 'funk' ? 420 : 380;
      tone.frequency.setValueAtTime(open, v.when);
      tone.frequency.exponentialRampToValueAtTime(closed, v.when + (style === 'funk' ? 0.09 : 0.14));
      v.chain(saw, tone);
      const subLevel = v.gain(0.9);
      v.chain(sub, subLevel, out);
      v.hold(out, note.vel * 0.5, length, { attack: 0.004, release: 0.04, sustain: 0.78, decay: 0.12, resumed });
    }
    v.chain(tone, out, v.mixer.input('bass'));
  },
  stab(v, note, resumed) {
    const { style = 'saw' } = note.params ?? {},
      length = note.length,
      out = v.gain(),
      tone = v.filter('lowpass', 4200, style === 'brass' ? 1.2 : 0.9);
    const detunes = style === 'clav' ? [0] : style === 'brass' ? [-6, 6] : [-13, 0, 11];
    for (const [i, midi] of note.notes.entries())
      for (const detune of detunes) {
        const osc = v.osc(style === 'clav' ? 'square' : 'sawtooth', hz(midi), detune),
          spread = v.pan(((i % 2) * 2 - 1) * 0.35 * (detune === 0 ? 0.3 : 1));
        v.chain(osc, spread, tone);
      }
    if (style === 'brass') {
      tone.frequency.setValueAtTime(500, v.when);
      tone.frequency.exponentialRampToValueAtTime(2600, v.when + 0.05);
      tone.frequency.exponentialRampToValueAtTime(1300, v.when + 0.3);
    } else if (style === 'clav') {
      tone.frequency.setValueAtTime(3200, v.when);
      tone.frequency.exponentialRampToValueAtTime(900, v.when + 0.12);
    } else tone.frequency.exponentialRampToValueAtTime(1500, v.when + 0.24);
    const scale = 0.34 / Math.sqrt(note.notes.length * detunes.length);
    v.hold(out, note.vel * scale, length, {
      attack: style === 'brass' ? 0.022 : 0.004,
      release: style === 'clav' ? 0.03 : 0.12,
      sustain: style === 'clav' ? 0.3 : 0.55,
      decay: 0.18,
      resumed,
    });
    v.chain(tone, out, v.mixer.input('harmony'));
  },
  pad(v, note, resumed) {
    const warm = note.params?.style === 'warm',
      out = v.gain(),
      tone = v.filter('lowpass', warm ? 1300 : (note.params?.cutoff ?? 1000), 0.6);
    for (const [i, midi] of note.notes.entries())
      for (const detune of [-8, 8]) {
        const osc = v.osc(warm && detune < 0 ? 'triangle' : 'sawtooth', hz(midi), detune),
          spread = v.pan((detune > 0 ? 1 : -1) * 0.45 * ((i + 1) / note.notes.length));
        v.chain(osc, spread, tone);
      }
    if (note.params?.open) tone.frequency.exponentialRampToValueAtTime(note.params.open, v.when + note.length);
    v.hold(out, note.vel * (0.2 / Math.sqrt(note.notes.length)), note.length, {
      attack: warm ? 0.9 : 0.4,
      release: warm ? 1.2 : 0.6,
      sustain: 1,
      decay: 0.01,
      resumed,
    });
    v.chain(tone, out, v.mixer.input('harmony'));
  },
  /** A two-operator FM electric piano: the modulation index decays, like a struck tine. */
  keys(v, note, resumed) {
    const out = v.gain();
    for (const [i, midi] of note.notes.entries()) {
      const f = hz(midi),
        carrier = v.osc('sine', f),
        modulator = v.osc('sine', f),
        index = v.gain(),
        voiceLevel = v.gain(1 / Math.sqrt(note.notes.length)),
        spread = v.pan((i / Math.max(1, note.notes.length - 1) - 0.5) * 0.5);
      index.gain.setValueAtTime(f * (resumed ? 0.3 : 2.4), v.when);
      index.gain.exponentialRampToValueAtTime(f * 0.18, v.when + 0.9);
      v.chain(modulator, index);
      index.connect(carrier.frequency);
      v.chain(carrier, voiceLevel, spread, out);
    }
    v.hold(out, note.vel * 0.34, note.length, { attack: 0.004, release: 0.5, sustain: 0.45, decay: 1.4, resumed });
    out.connect(v.mixer.input('harmony'));
  },
  pluck(v, note) {
    const saw = v.osc(note.params?.square ? 'square' : 'sawtooth', hz(note.midi)),
      tone = v.filter('lowpass', 3600, 2.5),
      level = v.gain(),
      pan = v.pan(note.params?.pan ?? 0);
    tone.frequency.exponentialRampToValueAtTime(700, v.when + 0.16);
    v.hit(level, note.vel * 0.22, Math.min(0.5, note.length + 0.12));
    v.chain(saw, tone, level, pan, v.mixer.input('lead'));
  },
  lead(v, note, resumed) {
    const out = v.gain(),
      tone = v.filter('lowpass', 2900, 1.1);
    for (const detune of [-7, 7]) v.chain(v.osc('sawtooth', hz(note.midi), detune), tone);
    const vibrato = v.osc('sine', 5.2),
      depth = v.gain(0);
    depth.gain.setValueAtTime(0, v.when);
    depth.gain.linearRampToValueAtTime(9, v.when + Math.min(0.5, note.length));
    v.chain(vibrato, depth);
    for (const source of v.sources.slice(0, 2)) depth.connect(source.detune);
    v.hold(out, note.vel * 0.24, note.length, { attack: 0.012, release: 0.14, sustain: 0.75, decay: 0.15, resumed });
    v.chain(tone, out, v.mixer.input('lead'));
  },
  /** Glockenspiel: inharmonic partials with fast decay. */
  bell(v, note) {
    const f = hz(note.midi),
      out = v.gain(1);
    for (const [ratio, level, decay] of [
      [1, 0.5, 1.2],
      [2.76, 0.18, 0.5],
      [5.4, 0.08, 0.25],
    ]) {
      const osc = v.osc('sine', f * ratio),
        gain = v.gain();
      v.hit(gain, note.vel * level * 0.5, decay);
      v.chain(osc, gain, out);
    }
    out.connect(v.mixer.input('lead'));
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
  stomp(v, note) {
    const thud = v.osc('sine', 78),
      level = v.gain(),
      scuff = v.noise(),
      low = v.filter('lowpass', 380),
      scuffLevel = v.gain();
    thud.frequency.exponentialRampToValueAtTime(44, v.when + 0.12);
    v.hit(level, note.vel * 0.6, 0.18);
    v.hit(scuffLevel, note.vel * 0.3, 0.07);
    v.chain(thud, level, v.mixer.input('crowd'));
    v.chain(scuff, low, scuffLevel, v.mixer.input('crowd'));
  },
};

const INSTRUMENTS = { ...drums, ...effects, ...tonal, ...crowd };
export const INSTRUMENT_NAMES = Object.freeze(Object.keys(INSTRUMENTS));
/** Instruments whose notes are long enough to be re-entered mid-note after a pause or seek. */
export const SUSTAINED = Object.freeze(['bass', 'stab', 'pad', 'keys', 'lead']);

/**
 * Plays one score note at context time `when`. `offset` seconds skips into a sustained note after a pause or
 * seek; percussive notes are never resumed mid-way.
 */
export function playNote(mixer, note, when, offset = 0) {
  const play = INSTRUMENTS[note.inst];
  if (!play) throw new Error(`Unknown instrument ${note.inst}`);
  const length = Math.max(0.02, (note.dur ?? 0.25) * SECONDS_PER_BEAT - offset);
  const voice = new Voice(mixer, { ...note, length }, when);
  play(voice, { ...note, length }, offset > 0);
  voice.start();
  return voice;
}
