import { CONFIG, SECONDS_PER_BEAT, beatsFromSeconds } from '../config.js';
import { notesBetween, activeNotesAt } from './score.js';
import { ClapLog, clapNote, groove, responseBetween } from '../content/response.js';
import { Mixer, measureLatency } from './mixer.js';
import { playNote } from './instruments.js';
import { prepareTones } from './tones.js';

/** Maps the AudioContext's output position to performance time, so the picture follows what is heard. */
export function outputTime(context, now) {
  if (context.state === 'running' && typeof context.getOutputTimestamp === 'function') {
    const stamp = context.getOutputTimestamp();
    const age = (now - stamp.performanceTime) / 1000;
    if (stamp.contextTime > 0 && Number.isFinite(stamp.contextTime) && age >= -0.01 && age < 0.5) {
      return { time: Math.max(0, Math.min(context.currentTime, stamp.contextTime + age)), mode: 'output-timestamp' };
    }
  }
  return { time: context.currentTime, mode: 'currentTime-fallback' };
}

/**
 * The single clock. The score is scheduled ahead on AudioContext time; the picture samples the beat that is
 * audible now. `sample()` only observes; `tick()`, called once per frame, is the only place the beat is committed.
 */
export class Transport {
  constructor({
    contextFactory,
    reference = null,
    now = () => performance.now(),
    setTimer = (fn, ms) => globalThis.setInterval(fn, ms),
    clearTimer = id => globalThis.clearInterval(id),
    wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
    mixerFactory = context => new Mixer(context),
    play = playNote,
    prepare = prepareTones,
    latency = rate => (typeof OfflineAudioContext === 'function' ? measureLatency(rate) : 0),
  } = {}) {
    this.contextFactory = contextFactory || (() => new AudioContext({ latencyHint: 'interactive' }));
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.wait = wait;
    this.mixerFactory = mixerFactory;
    this.play = play;
    this.prepare = prepare;
    this.measureLatency = latency;
    this.latency = 0;
    this.status = 'idle';
    this.heldBeat = 0;
    this.lastBeat = 0;
    this.generation = 0;
    this.timer = null;
    this.context = null;
    this.mixer = null;
    this.volume = CONFIG.defaultVolume;
    this.muted = false;
    this.scoreAudible = true;
    this.syncMode = 'not-started';
    this.error = null;
    this.reference = reference;
    this.claps = new ClapLog();
  }
  /**
   * The visitor claps at the audible beat: heard at once, outside the look-ahead, and remembered so the passers-by
   * can answer. Ignored unless the street is moving. Returns whether the clap counted.
   */
  clap(beat) {
    if (this.status !== 'running' || !this.mixer || !this.claps.add(beat, this.now() / 1000)) return false;
    this.play(this.mixer, clapNote(beat), this.context.currentTime + 0.005);
    return true;
  }
  async ensureAudio() {
    if (this.context) return;
    this.context = this.contextFactory();
    this.mixer = this.mixerFactory(this.context);
    this.mixer.setVolume(this.volume);
    this.mixer.setMuted(this.muted);
    this.mixer.setAudible(this.scoreAudible);
    this.latency = await this.measureLatency(this.context.sampleRate);
    // Rendered tones must exist before the first note is scheduled; normally they were made during loading.
    await this.prepare();
    this.context.addEventListener?.('statechange', () => {
      if (this.status === 'running' && this.context.state !== 'running') this.pause();
    });
  }
  sample(now = this.now()) {
    if (this.status !== 'running')
      return { beat: this.heldBeat, travelS: this.heldBeat * CONFIG.distancePerBeat, status: this.status };
    const stamp = outputTime(this.context, now);
    const beat = Math.max(this.lastBeat, this.heldBeat + beatsFromSeconds(Math.max(0, stamp.time - this.epoch)));
    return { beat, travelS: beat * CONFIG.distancePerBeat, status: this.status, clock: stamp.mode };
  }
  tick(now = this.now()) {
    const frame = this.sample(now);
    if (this.status === 'running') {
      // Output-timestamp jitter must never move the street backward.
      this.lastBeat = frame.beat;
      this.syncMode = frame.clock;
    }
    return frame;
  }
  async resume() {
    if (this.status === 'running' || this.status === 'starting') return;
    const generation = ++this.generation;
    this.status = 'starting';
    try {
      if (this.pausePromise) await this.pausePromise;
      if (generation !== this.generation) return;
      await this.ensureAudio();
      if (generation !== this.generation) return;
      await this.context.resume();
      if (generation !== this.generation) {
        if (this.status === 'paused') await this.context.suspend();
        return;
      }
      if (this.context.state !== 'running') throw new Error('浏览器尚未允许声音播放。请再次点击继续。');
      this.epoch = this.context.currentTime + 0.1;
      this.lastBeat = this.heldBeat;
      this.cursor = this.heldBeat;
      this.mixer.stopAll();
      this.mixer.setPaused(false);
      for (const note of activeNotesAt(this.heldBeat))
        this.play(this.mixer, note, this.epoch - this.latency, (this.heldBeat - note.beat) * SECONDS_PER_BEAT);
      this.reference?.resume();
      this.status = 'running';
      this.schedule();
      this.timer = this.setTimer(() => {
        if (generation === this.generation) this.schedule();
      }, CONFIG.schedulerInterval);
    } catch (error) {
      this.error = error;
      await this.pause();
      throw error;
    }
  }
  schedule() {
    if (this.status !== 'running') return;
    const now = this.context.currentTime,
      horizon = this.heldBeat + beatsFromSeconds(now + CONFIG.audioLookahead - this.epoch);
    if (horizon <= this.cursor) return;
    // The crowd's answer to the clapping is scheduled like the score, from the claps known so far.
    for (const note of [
      ...notesBetween(this.cursor, horizon),
      ...responseBetween(this.cursor, horizon, this.claps.beats),
    ]) {
      // Sent early by the mix chain's own delay, so the note is heard on the beat the picture shows.
      const scheduled = this.epoch + (note.beat - this.heldBeat) * SECONDS_PER_BEAT - this.latency;
      // A note that is already audibly late is dropped rather than smeared onto the wrong beat.
      if (now - scheduled < 0.03) this.play(this.mixer, note, Math.max(now, scheduled));
    }
    this.cursor = horizon;
  }
  async pause() {
    if (this.pausePromise) {
      this.status = 'paused';
      this.generation++;
      return this.pausePromise;
    }
    this.heldBeat = this.tick().beat;
    this.lastBeat = this.heldBeat;
    this.status = 'paused';
    this.generation++;
    this.reference?.pause();
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    if (this.context?.state === 'running') {
      this.mixer.setPaused(true);
      this.pausePromise = (async () => {
        // Freeze the logical beat immediately, but let the output release before suspension.
        await this.wait(90);
        this.mixer.stopAll();
        await this.context.suspend();
      })().finally(() => {
        this.pausePromise = null;
      });
      return this.pausePromise;
    }
    this.mixer?.stopAll();
  }
  async seek(beat) {
    const running = this.status === 'running';
    await this.pause();
    this.heldBeat = Math.max(0, Number.isFinite(beat) ? beat : 0);
    this.lastBeat = this.heldBeat;
    this.claps.dropAfter(this.heldBeat);
    if (running) await this.resume();
  }
  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    this.mixer?.setVolume(this.volume);
    this.reference?.setVolume(this.volume);
  }
  setMuted(value) {
    this.muted = Boolean(value);
    this.mixer?.setMuted(this.muted);
    this.reference?.setMuted(this.muted);
  }
  /** The score keeps scheduling while silenced, so switching back from a comparison lands on the same beat. */
  setScoreAudible(value) {
    this.scoreAudible = Boolean(value);
    this.mixer?.setAudible(this.scoreAudible);
  }
  diagnostics() {
    const frame = this.sample();
    return {
      ...frame,
      claps: this.claps.size,
      groove: +groove(frame.beat, this.claps.beats).toFixed(3),
      syncMode: this.syncMode,
      music: this.reference?.diagnostics() ?? { mode: 'score' },
      scoreAudible: this.scoreAudible,
      contextState: this.context?.state || 'not-created',
      activeVoices: this.mixer?.active.size || 0,
      latencyMs: +(this.latency * 1000).toFixed(2),
      schedulers: this.timer === null ? 0 : 1,
      generation: this.generation,
    };
  }
  async dispose() {
    await this.pause();
    this.reference?.dispose();
    this.mixer?.dispose();
    await this.context?.close();
  }
}
