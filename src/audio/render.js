import { CONFIG, SECONDS_PER_BEAT } from '../config.js';
import { FOUR_HITS, THEMES } from '../content/plan.js';
import { Mixer, STEMS, measureLatency } from './mixer.js';
import { playNote } from './instruments.js';
import { notesBetween } from './score.js';
import { prepareTones } from './tones.js';

const LEAD_IN = 0.05;

/**
 * Renders a span of the score offline through the same mixer and instruments as live playback, so review audio
 * is exact and repeatable. Beats are absolute; the render starts LEAD_IN seconds before `from`. `stems` solos
 * those stems, for balancing the mix.
 */
export async function renderScore(from, to, { sampleRate = 48000, tail = 2.5, stems = STEMS } = {}) {
  const length = Math.ceil(((to - from) * SECONDS_PER_BEAT + LEAD_IN + tail) * sampleRate);
  await prepareTones();
  const latency = await measureLatency(sampleRate),
    context = new OfflineAudioContext(2, length, sampleRate),
    mixer = new Mixer(context);
  mixer.setVolume(1);
  for (const stem of STEMS) mixer.setStemEnabled(stem, stems.includes(stem), { immediate: true });
  // Compensated exactly as in live playback, so the metrics describe what a listener hears.
  for (const note of notesBetween(from, to))
    playNote(mixer, note, LEAD_IN + (note.beat - from) * SECONDS_PER_BEAT - latency);
  return context.startRendering();
}

const db = value => (value > 0 ? 20 * Math.log10(value) : -Infinity);

/**
 * Objective checks for review, not a verdict on musical power: peak, RMS, crest factor, the share of energy
 * below about 150 Hz, and for each four-hit accent its onset timing and how loud it is against the whole span.
 */
export function analyzeRender(buffer, from, to) {
  const rate = buffer.sampleRate,
    left = buffer.getChannelData(0),
    right = buffer.getChannelData(1),
    mono = new Float32Array(left.length),
    high = new Float32Array(left.length);
  let peak = 0,
    sum = 0,
    low = 0,
    lowSum = 0,
    previous = 0,
    highState = 0;
  const lowAlpha = 1 - Math.exp((-2 * Math.PI * 150) / rate),
    // Perceived onsets come from transients, so timing is measured on a 1.5 kHz high-passed copy.
    highAlpha = 1 / (1 + (2 * Math.PI * 1500) / rate);
  for (let i = 0; i < left.length; i++) {
    const x = (left[i] + right[i]) / 2;
    mono[i] = x;
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    sum += x * x;
    low += lowAlpha * (x - low);
    lowSum += low * low;
    highState = highAlpha * (highState + x - previous);
    previous = x;
    high[i] = Math.abs(highState);
  }
  const rms = Math.sqrt(sum / left.length);
  const shortRms = (start, seconds) => {
    const a = Math.max(0, Math.round(start * rate)),
      b = Math.min(mono.length, Math.round((start + seconds) * rate));
    let total = 0;
    for (let i = a; i < b; i++) total += mono[i] * mono[i];
    return Math.sqrt(total / Math.max(1, b - a));
  };
  const windows = [];
  for (let t = LEAD_IN; t + 0.3 <= LEAD_IN + (to - from) * SECONDS_PER_BEAT; t += 0.15) windows.push(shortRms(t, 0.3));
  windows.sort((a, b) => a - b);
  const quantile = q => windows[Math.min(windows.length - 1, Math.floor(q * windows.length))] ?? 0;
  const hits = [];
  for (let cycle = Math.floor(from / CONFIG.cycleBeats); cycle <= Math.floor(to / CONFIG.cycleBeats); cycle++)
    for (const hit of FOUR_HITS.map(beat => cycle * CONFIG.cycleBeats + beat)) {
      if (hit < from || hit >= to) continue;
      const target = LEAD_IN + (hit - from) * SECONDS_PER_BEAT,
        a = Math.round((target - 0.02) * rate),
        b = Math.round((target + 0.03) * rate);
      let best = 0;
      for (let i = a; i < b; i++) best = Math.max(best, high[i]);
      let onset = a;
      while (onset < b && high[onset] < best * 0.5) onset++;
      const loudness = shortRms(target, 0.3);
      hits.push({
        beat: hit,
        onsetErrorMs: +((onset / rate - target) * 1000).toFixed(2),
        rmsDb: +db(loudness).toFixed(2),
        louderThan: +(windows.filter(w => w < loudness).length / Math.max(1, windows.length)).toFixed(3),
      });
    }
  return {
    from,
    to,
    seconds: +(buffer.length / rate).toFixed(3),
    peakDb: +db(peak).toFixed(2),
    rmsDb: +db(rms).toFixed(2),
    crestDb: +(db(peak) - db(rms)).toFixed(2),
    lowShare: +(lowSum / Math.max(1e-12, sum)).toFixed(3),
    shortRmsDb: { p50: +db(quantile(0.5)).toFixed(2), p95: +db(quantile(0.95)).toFixed(2) },
    hits,
  };
}

/** 16-bit PCM WAV, for listening outside the page. */
export function encodeWav(buffer) {
  const channels = buffer.numberOfChannels,
    frames = buffer.length,
    bytes = new DataView(new ArrayBuffer(44 + frames * channels * 2));
  const text = (offset, value) => [...value].forEach((c, i) => bytes.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  bytes.setUint32(4, 36 + frames * channels * 2, true);
  text(8, 'WAVEfmt ');
  bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true);
  bytes.setUint16(22, channels, true);
  bytes.setUint32(24, buffer.sampleRate, true);
  bytes.setUint32(28, buffer.sampleRate * channels * 2, true);
  bytes.setUint16(32, channels * 2, true);
  bytes.setUint16(34, 16, true);
  text(36, 'data');
  bytes.setUint32(40, frames * channels * 2, true);
  const data = [...Array(channels).keys()].map(c => buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, data[c][i]));
      bytes.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  return new Uint8Array(bytes.buffer);
}

/** The four chapters of the first cycle, for per-chapter review renders. */
export const CHAPTER_SPANS = Object.freeze(THEMES.map(({ id, start, end }) => ({ id, from: start, to: end })));
