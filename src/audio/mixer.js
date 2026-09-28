import { CONFIG, SECONDS_PER_BEAT } from '../config.js';

/** Stem groups; each can be muted in debug listening. Bass and harmony duck under the kick. */
export const STEMS = Object.freeze(['drums', 'bass', 'harmony', 'lead', 'crowd', 'fx']);

// Sends are per stem, so a voice only connects to its stem input.
const SENDS = Object.freeze({
  drums: { reverb: 0.1, delay: 0 },
  bass: { reverb: 0, delay: 0 },
  harmony: { reverb: 0.3, delay: 0.06 },
  lead: { reverb: 0.22, delay: 0.28 },
  crowd: { reverb: 0.26, delay: 0 },
  fx: { reverb: 0.45, delay: 0.1 },
});
const LEVELS = Object.freeze({ drums: 0.9, bass: 0.78, harmony: 0.5, lead: 0.42, crowd: 0.55, fx: 0.5 });

function driveCurve(amount) {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  return curve;
}

/** Linear up to 0.8, then saturating smoothly toward 0.98, so nothing ever reaches digital full scale. */
function ceilingCurve() {
  const curve = new Float32Array(4096);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1,
      magnitude = Math.abs(x);
    curve[i] = Math.sign(x) * (magnitude < 0.8 ? magnitude : 0.8 + 0.18 * Math.tanh((magnitude - 0.8) / 0.18));
  }
  return curve;
}

/** A decaying stereo noise tail stands in for a small bright hall; the seed keeps renders repeatable. */
function impulseResponse(context, seconds = 2.3, decay = 3.2) {
  const length = Math.ceil(context.sampleRate * seconds),
    buffer = context.createBuffer(2, length, context.sampleRate);
  let seed = 1234567;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Darker as it decays: a one-pole lowpass that closes over the tail.
      const smoothing = 0.2 + 0.75 * t;
      low = low * smoothing + random() * (1 - smoothing);
      data[i] = low * Math.pow(1 - t, decay) * (i < context.sampleRate * 0.012 ? i / (context.sampleRate * 0.012) : 1);
    }
  }
  return buffer;
}

const noiseCache = new WeakMap();
/** One second of white noise shared by every percussive voice of a context. */
export function noiseBuffer(context) {
  if (!noiseCache.has(context)) {
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate),
      data = buffer.getChannelData(0);
    let seed = 42;
    for (let i = 0; i < data.length; i++) data[i] = ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    noiseCache.set(context, buffer);
  }
  return noiseCache.get(context);
}

/**
 * The score's output path, identical for live playback and offline rendering:
 * stems -> (kick sidechain) -> glue compressor -> soft ceiling -> capture tap / volume -> speakers.
 */
export class Mixer {
  constructor(context) {
    this.context = context;
    this.active = new Set();
    this.volume = CONFIG.defaultVolume;
    this.muted = false;
    this.paused = false;
    this.audible = true;
    this.sum = context.createGain();
    this.glue = context.createDynamicsCompressor();
    this.glue.threshold.value = -16;
    this.glue.knee.value = 8;
    this.glue.ratio.value = 2.6;
    this.glue.attack.value = 0.018;
    this.glue.release.value = 0.16;
    this.makeup = context.createGain();
    this.makeup.gain.value = 1.0;
    // A soft ceiling instead of a second compressor: every DynamicsCompressor adds about 6 ms of look-ahead,
    // and oversampling adds more, which would put the music audibly behind the picture.
    this.ceiling = context.createWaveShaper();
    this.ceiling.curve = ceilingCurve();
    this.output = context.createGain();
    this.sum.connect(this.glue);
    this.glue.connect(this.makeup);
    this.makeup.connect(this.ceiling);
    this.ceiling.connect(this.output);
    this.output.connect(context.destination);
    if (typeof context.createMediaStreamDestination === 'function') {
      // Recordings take the full-level mix, independent of the listener's volume slider.
      this.capture = context.createMediaStreamDestination();
      this.captureDelay = context.createDelay(0.5);
      this.ceiling.connect(this.captureDelay);
      this.captureDelay.connect(this.capture);
    }
    this.reverb = context.createConvolver();
    this.reverb.buffer = impulseResponse(context);
    this.reverbReturn = context.createGain();
    this.reverbReturn.gain.value = 0.32;
    this.reverb.connect(this.reverbReturn);
    this.reverbReturn.connect(this.sum);
    this.delay = context.createDelay(2);
    this.delay.delayTime.value = 0.75 * SECONDS_PER_BEAT;
    this.delayFeedback = context.createGain();
    this.delayFeedback.gain.value = 0.32;
    this.delayTone = context.createBiquadFilter();
    this.delayTone.type = 'lowpass';
    this.delayTone.frequency.value = 3200;
    this.delay.connect(this.delayTone);
    this.delayTone.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delayReturn = context.createGain();
    this.delayReturn.gain.value = 0.24;
    this.delayTone.connect(this.delayReturn);
    this.delayReturn.connect(this.sum);
    this.drive = context.createWaveShaper();
    this.drive.curve = driveCurve(1.6);
    this.stems = {};
    for (const stem of STEMS) {
      const input = context.createGain(),
        duck = context.createGain(),
        level = context.createGain();
      level.gain.value = LEVELS[stem];
      input.connect(duck);
      duck.connect(level);
      // Drums pass through a gentle tanh drive for weight; the rest stays clean.
      if (stem === 'drums') {
        level.connect(this.drive);
        this.drive.connect(this.sum);
      } else level.connect(this.sum);
      for (const [send, amount] of Object.entries(SENDS[stem])) {
        if (!amount) continue;
        const gain = context.createGain();
        gain.gain.value = amount;
        level.connect(gain);
        gain.connect(send === 'reverb' ? this.reverb : this.delay);
      }
      this.stems[stem] = { input, duck, level, enabled: true };
    }
    this.applyOutput();
  }
  /** Pumps bass and harmony under a kick that lands at `when`. */
  duck(when, depth = 0.55, release = 0.2) {
    for (const stem of ['bass', 'harmony', 'lead']) {
      const gain = this.stems[stem].duck.gain,
        amount = stem === 'lead' ? depth * 0.4 : depth;
      gain.setValueAtTime(1, when);
      gain.linearRampToValueAtTime(1 - amount, when + 0.008);
      gain.linearRampToValueAtTime(1, when + release);
    }
  }
  input(stem) {
    return this.stems[stem].input;
  }
  applyOutput() {
    const level = this.muted || this.paused || !this.audible ? 0 : this.volume;
    this.output.gain.setTargetAtTime(level, this.context.currentTime, 0.02);
  }
  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    this.applyOutput();
  }
  setMuted(value) {
    this.muted = Boolean(value);
    this.applyOutput();
  }
  setPaused(value) {
    this.paused = Boolean(value);
    this.applyOutput();
  }
  /** False while the reference recording is being compared; the score keeps its time underneath. */
  setAudible(value) {
    this.audible = Boolean(value);
    this.applyOutput();
  }
  setStemEnabled(stem, enabled) {
    this.stems[stem].enabled = Boolean(enabled);
    this.stems[stem].level.gain.setTargetAtTime(enabled ? LEVELS[stem] : 0, this.context.currentTime, 0.02);
  }
  setRecordingDelay(seconds) {
    this.captureDelay?.delayTime.setTargetAtTime(Math.max(0, Math.min(0.3, seconds)), this.context.currentTime, 0.03);
  }
  /** Registers a playing voice so pause and seek can silence it. */
  track(voice) {
    this.active.add(voice);
    voice.last.onended = () => {
      for (const node of voice.nodes) node.disconnect();
      this.active.delete(voice);
    };
  }
  stopAll() {
    for (const voice of this.active) {
      for (const source of voice.sources) {
        try {
          source.stop();
        } catch {
          // A source that never started cannot be stopped; disconnecting is enough.
        }
      }
      for (const node of voice.nodes) node.disconnect();
    }
    this.active.clear();
  }
  dispose() {
    this.stopAll();
    for (const node of [this.sum, this.glue, this.makeup, this.ceiling, this.output, this.reverb, this.delay])
      node.disconnect();
    this.captureDelay?.disconnect();
  }
}

/**
 * The mix chain's processing delay, measured by sending an impulse through an offline copy of the mixer.
 * Notes are scheduled this much earlier, so what is heard lands on the beat the picture shows.
 */
export async function measureLatency(sampleRate) {
  const context = new OfflineAudioContext(1, Math.ceil(sampleRate * 0.2), sampleRate),
    mixer = new Mixer(context),
    source = context.createBufferSource(),
    impulse = context.createBuffer(1, 1, sampleRate);
  impulse.getChannelData(0)[0] = 0.5;
  source.buffer = impulse;
  mixer.setVolume(1);
  source.connect(mixer.input('harmony'));
  source.start(0.05);
  const data = (await context.startRendering()).getChannelData(0);
  let first = Math.round(0.05 * sampleRate);
  while (first < data.length && Math.abs(data[first]) < 1e-4) first++;
  return Math.max(0, Math.min(0.05, first / sampleRate - 0.05));
}
