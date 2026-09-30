/*
 * Sounds that oscillators cannot make in real time are computed once in plain JavaScript and replayed as buffers:
 * plucked-string power chords through a crunchy valve amplifier and a speaker cabinet, and the ride of a hi-hat and
 * a crash cymbal. Everything is rendered at one fixed rate and from fixed seeds, so live playback and offline review
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
 * A power chord (root, fifth, octave) struck down across the strings, through a valve amplifier on the edge of
 * break-up and a 4x12 cabinet: the crunch of 1970s rock rather than modern high gain, so the strings still ring and
 * decay. Palm-muted chugs are short and darker.
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
  biquad(signal, 'peaking', 900, 0.8, 4);
  normalise(signal, 1);
  overdrive(signal, mute ? 4 : 4.5);
  // The speaker cabinet: little below 90 Hz (the amplifier's difference tones would muddy the bass), nothing much
  // above 5 kHz, a presence lift, and a slightly scooped low-mid.
  biquad(signal, 'highpass', 95, 0.707);
  biquad(signal, 'highpass', 95, 0.707);
  biquad(signal, 'peaking', 420, 1, -3);
  biquad(signal, 'peaking', 1900, 1.2, 2.5);
  biquad(signal, 'lowpass', 4800, 0.9);
  biquad(signal, 'lowpass', 6400, 0.6);
  // Fade the buffer's last few milliseconds so a long chord never ends on a click.
  const fade = Math.round(0.02 * TONE_RATE);
  for (let i = 0; i < fade; i++) signal[signal.length - 1 - i] *= i / fade;
  return levelAttack(signal, mute ? -15.5 : -12);
}

/**
 * A bronze cymbal struck once. A real cymbal's modes are so dense that its spectrum is nearly continuous, so the body
 * is noise in two bands, the brighter one dying first, the way a cymbal darkens as it rings. A sprinkling of faint
 * inharmonic partials adds shimmer. `hat` is the tight, bright pair of hi-hat cymbals; otherwise a crash. Nothing
 * here is periodic, unlike the six square waves of an analogue drum machine, so it does not buzz like electronics.
 */
function cymbal(hat) {
  const seconds = hat ? 0.8 : 2.4,
    length = Math.ceil(seconds * TONE_RATE),
    bright = new Float32Array(length),
    body = new Float32Array(length),
    noise = random(hat ? 77 : 78),
    fast = (hat ? 0.09 : 0.55) * TONE_RATE,
    slow = (hat ? 0.22 : 1.5) * TONE_RATE;
  for (let i = 0; i < length; i++) {
    bright[i] = noise() * Math.exp(-i / fast);
    body[i] = noise() * Math.exp(-i / slow);
  }
  biquad(bright, 'highpass', hat ? 8000 : 6000, 0.707);
  biquad(body, 'bandpass', hat ? 6500 : 3200, 0.6);
  const signal = new Float32Array(length);
  for (let i = 0; i < length; i++) signal[i] = bright[i] + (hat ? 0.6 : 0.9) * body[i];
  const jitter = random(hat ? 1901 : 2903),
    modes = 64,
    lowest = hat ? 3400 : 700,
    span = hat ? 3.6 : 15;
  for (let k = 0; k < modes; k++) {
    const f = lowest * span ** ((k + 0.5 + 0.45 * jitter()) / modes),
      tau = (hat ? 0.18 : 1.2) * (f / 3000) ** -0.4,
      r = Math.exp(-1 / (tau * TONE_RATE)),
      c = 2 * r * Math.cos((2 * Math.PI * f) / TONE_RATE);
    // A faint decaying sinusoid by recursion: y[n] = 2r cos(w) y[n-1] - r^2 y[n-2].
    let y1 = 0.012 * (0.5 + 0.5 * jitter()),
      y2 = 0;
    for (let i = 0; i < length; i++) {
      const y = c * y1 - r * r * y2;
      y2 = y1;
      y1 = y;
      signal[i] += y;
    }
  }
  biquad(signal, 'highpass', hat ? 4500 : 1400, 0.707);
  biquad(signal, 'lowpass', hat ? 15000 : 12500, 0.707);
  return normalise(signal, 0.8);
}

/** Power-chord roots rendered ahead of time; other roots are played from the nearest one at a slightly other rate. */
export const CHORD_ROOTS = Object.freeze([41, 43, 45, 46, 48, 50, 51]);
const RECIPES = new Map([
  ['hat', () => cymbal(true)],
  ['crash', () => cymbal(false)],
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
