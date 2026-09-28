import { STEMS } from './score.js';

const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
function random(seed) {
  let x = seed >>> 0;
  return () => {
    x = (1664525 * x + 1013904223) >>> 0;
    return (x / 4294967296) * 2 - 1;
  };
}

export class Voices {
  constructor(context) {
    this.context = context;
    this.cache = new Map();
    this.active = new Set();
    this.stems = {};
    this.master = context.createGain();
    this.master.gain.value = 0.45;
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.012;
    this.compressor.release.value = 0.22;
    this.master.connect(this.compressor);
    this.compressor.connect(context.destination);
    this.capture = context.createMediaStreamDestination();
    this.captureDelay = context.createDelay(0.5);
    this.compressor.connect(this.captureDelay);
    this.captureDelay.connect(this.capture);
    for (const stem of STEMS) {
      const gain = context.createGain();
      gain.connect(this.master);
      this.stems[stem] = gain;
    }
    this.volume = 0.45;
    this.muted = false;
    this.paused = false;
  }
  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    this.applyVolume();
  }
  setMuted(value) {
    this.muted = value;
    this.applyVolume();
  }
  applyVolume() {
    this.master.gain.setTargetAtTime(this.muted || this.paused ? 0 : this.volume, this.context.currentTime, 0.02);
  }
  setPaused(value) {
    this.paused = value;
    this.applyVolume();
  }
  setRecordingDelay(seconds) {
    this.captureDelay.delayTime.setTargetAtTime(Math.max(0, Math.min(0.3, seconds)), this.context.currentTime, 0.03);
  }
  bufferFor(note) {
    const key = `${note.variant}:${note.stem}:${note.notes?.join(',') || ''}:${note.duration}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const rate = this.context.sampleRate,
      duration = note.duration * 0.5;
    const buffer = this.context.createBuffer(2, Math.ceil(rate * duration), rate);
    const rand = random(137 + note.stem.charCodeAt(0)),
      data = buffer.getChannelData(0),
      right = buffer.getChannelData(1);
    const pocket = note.variant === 'pocket',
      parade = note.variant === 'parade',
      lyric = note.variant === 'lyric';
    const tonal = ['chord', 'melody', 'arp'].includes(note.stem);
    const frequencies = (note.notes || []).map(frequency);
    const raw = new Float32Array(data.length);
    let previousNoise = 0,
      lowNoise = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / rate,
        tail = Math.min(1, (duration - t) / 0.025);
      let sample = 0;
      const noise = rand();
      lowNoise = 0.68 * lowNoise + 0.32 * noise;
      const bright = noise - previousNoise;
      previousNoise = noise;
      if (note.stem === 'kick') {
        const phase = 2 * Math.PI * ((pocket ? 43 : parade ? 53 : 47) * t + 100 * 0.025 * (1 - Math.exp(-t / 0.025)));
        sample = 0.88 * Math.sin(phase) * Math.exp(-t / (pocket ? 0.16 : 0.11)) + 0.035 * bright * Math.exp(-t / 0.006);
      } else if (note.stem === 'clap') {
        const bursts = [0, 0.013, 0.026].reduce((s, o) => s + (t >= o ? Math.exp(-(t - o) / 0.007) : 0), 0);
        sample = (noise - lowNoise) * (0.27 * bursts + 0.19 * Math.exp(-t / (pocket ? 0.085 : 0.055)));
        if (pocket || parade) sample += 0.2 * Math.sin(2 * Math.PI * 184 * t) * Math.exp(-t / 0.036);
      } else if (note.stem === 'hat') {
        sample = bright * 0.17 * Math.exp(-t / (duration > 0.2 ? 0.13 : 0.025));
      } else if (note.stem === 'wood') {
        const f = frequencies[0] * (parade ? 0.65 : 1);
        sample =
          (Math.sin(2 * Math.PI * f * t) + 0.45 * Math.sin(2 * Math.PI * f * 2.67 * t)) *
            0.32 *
            Math.exp(-t / (parade ? 0.085 : 0.055)) +
          0.08 * noise * Math.exp(-t / 0.008);
      } else if (note.stem === 'bass') {
        const f = frequencies[0],
          attack = Math.min(1, t / 0.009);
        const tone =
          Math.sin(2 * Math.PI * f * t) +
          0.26 * Math.sin(2 * Math.PI * f * 2 * t) +
          0.11 * Math.sin(2 * Math.PI * f * 3 * t) * Math.exp(-t / 0.14);
        sample = 0.55 * tone * attack * Math.exp(-t / (lyric ? 0.7 : pocket ? 0.29 : parade ? 0.17 : 0.22));
      } else if (note.stem === 'chord') {
        const envelope =
          (1 - Math.exp(-t / (lyric ? 0.36 : parade ? 0.012 : 0.025))) *
          Math.exp(-t / (lyric ? 2.1 : pocket ? 0.63 : parade ? 0.25 : 0.86)) *
          Math.min(1, (duration - t) / (lyric ? 0.55 : 0.15));
        for (const f of frequencies) {
          const phase = 2 * Math.PI * f * t;
          const tone = lyric
            ? (Math.sin(phase + 0.006 * Math.sin(t * 31)) + Math.sin(phase * 1.002)) * 0.65 + 0.1 * Math.sin(phase * 3)
            : pocket
              ? Math.sin(phase + 1.1 * Math.sin(phase * 2) * Math.exp(-t / 0.14))
              : parade
                ? Math.sin(phase) + 0.36 * Math.sin(phase * 2) + 0.18 * Math.sin(phase * 3)
                : Math.sin(phase) +
                  0.3 * Math.sin(phase * 2.001) +
                  0.13 * Math.sin(phase * 3) +
                  0.14 * Math.sin(phase * 0.998);
          sample += tone * 0.145 * envelope;
        }
      } else {
        const f = frequencies[0],
          phase = 2 * Math.PI * f * t;
        const arp = note.stem === 'arp',
          envelope =
            (1 - Math.exp(-t / (lyric && !arp ? 0.11 : parade && !arp ? 0.035 : 0.007))) *
            Math.exp(-t / (lyric ? (arp ? 0.65 : 1.05) : arp ? 0.13 : parade ? 0.36 : pocket ? 0.32 : 0.24));
        const tone = lyric
          ? arp
            ? Math.sin(phase) + 0.34 * Math.sin(phase * 2.003) * Math.exp(-t / 0.24)
            : Math.sin(phase + 0.03 * Math.sin(t * 29)) + 0.15 * Math.sin(phase * 2)
          : pocket
            ? Math.sin(phase + 0.85 * Math.sin(phase * 2) * Math.exp(-t / 0.1))
            : parade
              ? Math.sin(phase) + 0.28 * Math.sin(phase * 3) + 0.12 * Math.sin(phase * 5)
              : Math.sin(phase) + 0.22 * Math.sin(phase * 2.002) + 0.09 * Math.sin(phase * 3);
        sample = tone * (arp ? 0.26 : 0.41) * envelope;
      }
      raw[i] = sample * Math.max(0, tail);
    }
    // Short, baked stereo reflections are bounded by each note and pause with the transport.
    const leftDelay = Math.round(rate * 0.1875),
      rightDelay = Math.round(rate * 0.28125);
    const pan = note.stem === 'wood' ? -0.22 : note.stem === 'hat' ? 0.22 : 0;
    for (let i = 0; i < data.length; i++) {
      const tail = Math.max(0, Math.min(1, (data.length - i) / (rate * 0.035)));
      data[i] = (raw[i] * (1 - pan) + (tonal && i > leftDelay ? 0.18 * raw[i - leftDelay] : 0)) * tail;
      right[i] = (raw[i] * (1 + pan) + (tonal && i > rightDelay ? 0.18 * raw[i - rightDelay] : 0)) * tail;
    }
    this.cache.set(key, buffer);
    return buffer;
  }
  prewarm(notes) {
    for (const note of notes) this.bufferFor(note);
  }
  play(note, when, offset = 0) {
    const buffer = this.bufferFor(note);
    if (offset >= buffer.duration) return;
    const source = this.context.createBufferSource(),
      gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = note.velocity;
    if (offset > 0) {
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(note.velocity, when + 0.012);
    }
    source.connect(gain);
    gain.connect(this.stems[note.stem]);
    const voice = { source, gain, id: note.id, when };
    this.active.add(voice);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.active.delete(voice);
    };
    source.start(when, Math.max(0, offset));
  }
  stopAll() {
    for (const voice of this.active) {
      voice.source.stop();
      voice.source.disconnect();
      voice.gain.disconnect();
    }
    this.active.clear();
  }
  dispose() {
    this.stopAll();
    this.cache.clear();
    for (const stem of Object.values(this.stems)) stem.disconnect();
    this.master.disconnect();
    this.compressor.disconnect();
    this.captureDelay.disconnect();
  }
}
