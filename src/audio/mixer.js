import { CONFIG, SECONDS_PER_BEAT } from '../config.js';

/**
 * Stem groups of a small rock band, each mutable in debug listening. Nothing ducks under the kick: a band plays
 * together, and sidechain pumping was what made the earlier electronic score bounce.
 */
export const STEMS = Object.freeze(['drums', 'bass', 'guitar', 'keys', 'lead', 'crowd']);

// Sends are per stem, so a voice only connects to its stem input. A small live room; only a hint of echo on the lead.
const SENDS = Object.freeze({
  drums: { reverb: 0.07, delay: 0 },
  bass: { reverb: 0, delay: 0 },
  guitar: { reverb: 0.06, delay: 0 },
  keys: { reverb: 0.14, delay: 0 },
  lead: { reverb: 0.14, delay: 0.1 },
  crowd: { reverb: 0.3, delay: 0 },
});
// Faders, set by soloing each stem over each chapter (scripts/balance-music.mjs): drums lead, the bass sits about
// two decibels under them, the rhythm guitar just under the drums.
const LEVELS = Object.freeze({
  drums: 0.42,
  bass: 0.11,
  guitar: 0.8,
  keys: 0.85,
  lead: 0.55,
  crowd: 0.8,
});
// Drums and bass pass through a touch of tanh warmth, as into a valve console; the rest stays clean.
const DRIVEN = Object.freeze({ drums: 1.15, bass: 1.2 });

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

/** A decaying stereo noise tail stands in for a small live room; the seed keeps renders repeatable. */
function impulseResponse(context, seconds = 1.3, decay = 3.8) {
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
    // Light bus glue, as on a 1970s console: a couple of decibels of gain reduction that never pumps.
    this.glue.threshold.value = -18;
    this.glue.knee.value = 10;
    this.glue.ratio.value = 2;
    this.glue.attack.value = 0.012;
    this.glue.release.value = 0.25;
    this.makeup = context.createGain();
    this.makeup.gain.value = 1.12;
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
      // One decibel of headroom keeps lossy video codecs from overshooting full scale.
      this.captureTrim = context.createGain();
      this.captureTrim.gain.value = 0.89;
      this.ceiling.connect(this.captureTrim);
      this.captureTrim.connect(this.captureDelay);
      this.captureDelay.connect(this.capture);
    }
    this.reverb = context.createConvolver();
    this.reverb.buffer = impulseResponse(context);
    this.reverbReturn = context.createGain();
    this.reverbReturn.gain.value = 0.24;
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
    this.stems = {};
    for (const stem of STEMS) {
      const input = context.createGain(),
        level = context.createGain();
      level.gain.value = LEVELS[stem];
      input.connect(level);
      if (DRIVEN[stem]) {
        const drive = context.createWaveShaper();
        drive.curve = driveCurve(DRIVEN[stem]);
        level.connect(drive);
        drive.connect(this.sum);
      } else level.connect(this.sum);
      for (const [send, amount] of Object.entries(SENDS[stem])) {
        if (!amount) continue;
        const gain = context.createGain();
        gain.gain.value = amount;
        level.connect(gain);
        gain.connect(send === 'reverb' ? this.reverb : this.delay);
      }
      this.stems[stem] = { input, level, enabled: true };
    }
    this.applyOutput();
  }
  input(stem) {
    return this.stems[stem].input;
  }
  /** The shared room, for voices that want more of it than their stem sends (a rock snare, a crowd's stomps). */
  get room() {
    return this.reverb;
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
  /** `immediate` is for offline renders, where there is no time to glide. */
  setStemEnabled(stem, enabled, { immediate = false } = {}) {
    this.stems[stem].enabled = Boolean(enabled);
    const gain = this.stems[stem].level.gain,
      level = enabled ? LEVELS[stem] : 0;
    if (immediate) gain.value = level;
    else gain.setTargetAtTime(level, this.context.currentTime, 0.02);
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
    this.captureTrim?.disconnect();
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
  source.connect(mixer.input('keys'));
  source.start(0.05);
  const data = (await context.startRendering()).getChannelData(0);
  let first = Math.round(0.05 * sampleRate);
  while (first < data.length && Math.abs(data[first]) < 1e-4) first++;
  return Math.max(0, Math.min(0.05, first / sampleRate - 0.05));
}
