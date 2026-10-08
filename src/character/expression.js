import { CONFIG, beatsFromSeconds } from '../config.js';
import { FOUR_HITS, mod, smooth, themeWeightsAt } from '../content/plan.js';

export const EXPRESSION_LIMIT = 32;
const COALESCE = beatsFromSeconds(0.22);
const LOOKAHEAD = beatsFromSeconds(0.12);

/** Inputs are musical positions, never wall-clock timers. There is no pending-action queue. */
export class ExpressionInput {
  constructor() {
    this.enabled = true;
    this.events = [];
  }
  clear() {
    this.events = [];
  }
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.clear();
  }
  add(beat) {
    if (!this.enabled || !Number.isFinite(beat) || beat < 0) return false;
    const last = this.events.at(-1);
    if (last && beat - last.beat < COALESCE) return false;
    const next = Math.ceil(beat);
    // Very close attacks respond now; only a reachable future beat receives the accent.
    const aligned = next - beat >= beatsFromSeconds(0.035) && next - beat <= LOOKAHEAD;
    this.events = this.events.filter(event => event.beat >= beat - 8).slice(-(EXPRESSION_LIMIT - 1));
    this.events.push(Object.freeze({ beat, accent: aligned ? next : beat + beatsFromSeconds(0.065), aligned }));
    return true;
  }
}

/** A small immediate intake, a chest/shoulder release, then a return into the authored phrase. */
export function sampleExpression(beat, events) {
  const tender = themeWeightsAt(beat).find(theme => theme.id === 'lyric')?.weight || 0;
  let accent = 0,
    preparation = 0;
  for (const event of events) {
    const age = beat - event.beat;
    if (age < 0) continue;
    const attack = event.accent - event.beat;
    if (age < attack) {
      preparation = Math.max(preparation, Math.sin((Math.PI * age) / attack) * 0.22);
      accent = Math.max(accent, smooth(age / attack) * (event.aligned ? 1 : 0.8));
    } else {
      const release = 0.95 + tender * 0.9;
      accent = Math.max(accent, (1 - smooth((beat - event.accent) / release)) * (event.aligned ? 1 : 0.8));
    }
  }
  const local = mod(beat, CONFIG.cycleBeats);
  const distance = Math.min(...FOUR_HITS.map(hit => Math.abs(local - hit)));
  // The original four signatures and their readable holds remain exactly authored.
  const protection = smooth((distance - 0.42) / 0.4);
  const strength = (1 - tender * 0.65) * protection;
  return { accent: accent * strength, preparation: preparation * strength };
}

export function applyExpression(pose, beat, wardrobe, events) {
  const { accent, preparation } = sampleExpression(beat, events);
  if (!accent && !preparation) return pose;
  const p = { ...pose, chest: [...pose.chest], head: [...pose.head] };
  p.chest[0] += preparation * 0.18 - accent * 0.2;
  p.chest[1] += accent * 0.16;
  p.chest[2] -= accent * 0.12;
  p.head[0] -= accent * 0.05;
  // Hands and wrists keep their prop choreography throughout attachment and release blends.
  if (!Object.values(wardrobe.accessoryWeights).some(weight => weight > 0)) {
    p.leftHand = [...pose.leftHand];
    p.rightHand = [...pose.rightHand];
    p.leftHand[0] += accent * 0.22;
    p.leftHand[1] += accent * 0.16;
    p.rightHand[0] -= accent * 0.22;
    p.rightHand[1] += accent * 0.16;
  }
  return p;
}
