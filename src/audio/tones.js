/*
 * Sounds that oscillators cannot make in real time are computed once in plain JavaScript and replayed as buffers:
 * plucked-string power chords through an overdriven amplifier and a speaker cabinet, and a metallic noise shared by
 * every cymbal. Everything is rendered at one fixed rate and from fixed seeds, so live playback and offline review
 * renders use identical sound; Web Audio resamples a buffer to whatever rate its context runs at.
 */
export const TONE_RATE = 48000;

function random(seed) {
  let state = seed >>> 0 || 1;
  return () => ((state = (1664525 * state + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

/** Robert Bristow-Johnson biquad coefficients, run in place over a whole signal. */
function biquad(signal, type, frequency, q = 0.707, gainDb = 0, rate = TONE_RATE) {
  const w = (2 * Math.PI * frequency) / rate,
    cos = Math.cos(w),
    alpha = Math.sin(w) / (2 * q),
    a = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lowpass')
    [b0, b1, b2, a0, a1, a2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  else if (type === 'highpass')
    [b0, b1, b2, a0, a1, a2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  else if (type === 'bandpass') [b0, b1, b2, a0, a1, a2] = [alpha, 0, -alpha, 1 + alpha, -2 * cos, 1 - alpha];
  else [b0, b1, b2, a0, a1, a2] = [1 + alpha * a, -2 * cos, 1 - alpha * a, 1 + alpha / a, -2 * cos, 1 - alpha / a];
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < signal.length; i++) {
    const x = signal[i],
      y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    signal[i] = y;
  }
  return signal;
}

/**
 * One plucked string (extended Karplus-Strong): a noise burst shaped by the pick position circulates through a
 * fractional delay and a damping filter. `mute` presses the palm on the bridge: more damping, a shorter ring.
 */
function pluck(target, frequency, start, { mute = false, seed = 1, level = 1 } = {}) {
  const gain = mute ? 0.972 : 0.9982,
    damping = mute ? 0.62 : 0.22,
    // The damping filter delays the loop by about damping / (1 - damping) samples; shorten the line to stay in tune.
    period = TONE_RATE / frequency - damping / (1 - damping),
    size = Math.ceil(period) + 2,
    line = new Float32Array(size),
    noise = random(seed),
    pickAt = Math.max(1, Math.round(period * 0.14));
  // Excitation: one period of darkened noise with the pick-position comb notch.
  const burst = new Float32Array(Math.ceil(period));
  let low = 0;
  for (let i = 0; i < burst.length; i++) {
    low += 0.55 * (noise() - low);
    burst[i] = low;
  }
  for (let i = burst.length - 1; i >= pickAt; i--) burst[i] -= burst[i - pickAt];
  let write = 0,
    filtered = 0;
  for (let n = start; n < target.length; n++) {
    let read = write - period;
    while (read < 0) read += size;
    const i = Math.floor(read),
      f = read - i,
      delayed = line[i % size] * (1 - f) + line[(i + 1) % size] * f;
    filtered += (1 - damping) * (delayed - filtered);
    const k = n - start,
      value = (k < burst.length ? burst[k] : 0) + gain * filtered;
    line[write] = value;
    write = (write + 1) % size;
    target[n] += value * level;
  }
}

/** Overdrive at twice the rate, so the new harmonics fold back far less before the cabinet removes them. */
function overdrive(signal, drive) {
  const up = new Float32Array(signal.length * 2);
  for (let i = 0; i < signal.length; i++) {
    const a = signal[i],
      b = signal[i + 1] ?? a;
    up[2 * i] = Math.tanh(drive * a);
    up[2 * i + 1] = Math.tanh(drive * (a + b) * 0.5);
  }
  biquad(up, 'lowpass', 17000, 0.707, 0, TONE_RATE * 2);
  biquad(up, 'lowpass', 17000, 0.707, 0, TONE_RATE * 2);
  for (let i = 0; i < signal.length; i++) signal[i] = up[2 * i];
  return signal;
}

/** Scales to a loudness over the attack's first 300 ms, so every chord lands equally hard; peaks stay below 0.95. */
function levelAttack(signal, rmsDb) {
  const n = Math.min(signal.length, Math.round(0.3 * TONE_RATE));
  let sum = 0,
    max = 0;
  for (let i = 0; i < n; i++) sum += signal[i] * signal[i];
  for (const v of signal) max = Math.max(max, Math.abs(v));
  const gain = Math.min(10 ** (rmsDb / 20) / Math.sqrt(sum / n), 0.95 / max);
  for (let i = 0; i < signal.length; i++) signal[i] *= gain;
  return signal;
}
function normalise(signal, peak) {
  let max = 0;
  for (const v of signal) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < signal.length; i++) signal[i] *= peak / max;
  return signal;
}

const hz = midi => 440 * 2 ** ((midi - 69) / 12);

/**
 * A power chord (root, fifth, octave) struck down across the strings, through an overdriven amplifier and a 4x12
 * cabinet. Palm-muted chugs are short and darker; open chords ring on under the distortion's sustain.
 */
function powerChord(root, mute) {
  const seconds = mute ? 0.5 : 2.6,
    signal = new Float32Array(Math.ceil(seconds * TONE_RATE));
  for (const [i, interval] of [0, 7, 12].entries())
    pluck(signal, hz(root + interval), Math.round(i * 0.0042 * TONE_RATE), {
      mute,
      seed: root * 31 + interval * 7 + (mute ? 5 : 0),
      level: [1, 0.85, 0.7][i],
    });
  // Tighten the lows and push the mids before the amplifier, as a treble booster in front of a valve amp does.
  biquad(signal, 'highpass', 140, 0.707);
  biquad(signal, 'peaking', 900, 0.8, 6);
  normalise(signal, 1);
  overdrive(signal, mute ? 9 : 14);
  // The speaker cabinet: little below 90 Hz (the amplifier's difference tones would muddy the bass), nothing much
  // above 5 kHz, a presence lift, and a slightly scooped low-mid.
  biquad(signal, 'highpass', 95, 0.707);
  biquad(signal, 'highpass', 95, 0.707);
  biquad(signal, 'peaking', 420, 1, -3);
  biquad(signal, 'peaking', 1900, 1.2, 3.5);
  biquad(signal, 'lowpass', 5200, 0.9);
  biquad(signal, 'lowpass', 6400, 0.6);
  // Fade the buffer's last few milliseconds so a long chord never ends on a click.
  const fade = Math.round(0.02 * TONE_RATE);
  for (let i = 0; i < fade; i++) signal[signal.length - 1 - i] *= i / fade;
  return levelAttack(signal, mute ? -15.5 : -12);
}

/**
 * Metallic noise from six detuned square waves, the classic analogue cymbal recipe, mixed with a little white
 * noise. Hi-hats, the crash, the tambourine and the cymbal roll filter it differently.
 */
function metal() {
  const signal = new Float32Array(TONE_RATE),
    noise = random(77),
    partials = [205.3, 304.4, 369.6, 522.7, 540, 800].map(f => f * 1.9);
  for (let i = 0; i < signal.length; i++) {
    const t = i / TONE_RATE;
    let sum = 0;
    for (const [k, f] of partials.entries()) sum += Math.sign(Math.sin(2 * Math.PI * f * t + k * 1.3));
    signal[i] = sum / 6 + 0.35 * noise();
  }
  biquad(signal, 'highpass', 3000, 0.707);
  return normalise(signal, 0.8);
}

/** Power-chord roots rendered ahead of time; other roots are played from the nearest one at a slightly other rate. */
export const CHORD_ROOTS = Object.freeze([41, 43, 45, 46, 48, 50, 51]);
const RECIPES = new Map([
  ['metal', metal],
  ...CHORD_ROOTS.flatMap(root => [
    [`chord:${root}`, () => powerChord(root, false)],
    [`chug:${root}`, () => powerChord(root, true)],
  ]),
]);
const baked = new Map();
let preparing = null;

/** Renders every tone, yielding between them so the page stays responsive while it loads. */
export function prepareTones({ yieldEvery = true } = {}) {
  preparing ??= (async () => {
    for (const [id, recipe] of RECIPES) {
      if (!baked.has(id)) baked.set(id, recipe());
      if (yieldEvery) await new Promise(resolve => setTimeout(resolve, 0));
    }
  })();
  return preparing;
}
export const tonesReady = () => baked.size === RECIPES.size;

const buffers = new WeakMap();
/** The tone as an AudioBuffer of `context`, created once per context; renders it on the spot if still missing. */
export function toneBuffer(context, id) {
  if (!buffers.has(context)) buffers.set(context, new Map());
  const cache = buffers.get(context);
  if (!cache.has(id)) {
    if (!baked.has(id)) baked.set(id, RECIPES.get(id)());
    const data = baked.get(id),
      buffer = context.createBuffer(1, data.length, TONE_RATE);
    buffer.copyToChannel(data, 0);
    cache.set(id, buffer);
  }
  return cache.get(id);
}
/** The rendered chord nearest to `root`, and the playback rate that lands it on `root`. */
export function chordFor(root) {
  const nearest = CHORD_ROOTS.reduce((best, r) => (Math.abs(r - root) < Math.abs(best - root) ? r : best));
  return { root: nearest, rate: 2 ** ((root - nearest) / 12) };
}
