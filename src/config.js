export const CONFIG = Object.freeze({
  // The walker steps on every beat, so this is also the walking cadence in steps per minute.
  bpm: 128,
  distancePerBeat: 0.6,
  cycleBeats: 256,
  viewHeight: 17,
  cameraPitch: 38,
  facadeX: 9.8,
  reflectionFloor: 0.52,
  roadHalfWidth: 6,
  sidewalkWidth: 3.8,
  crowdCount: 36,
  actorScale: 0.91,
  pixelRatioLimit: 1.5,
  wardrobeGrace: 8,
  contactLead: 0.6,
  audioLookahead: 0.15,
  schedulerInterval: 25,
  defaultVolume: 0.45,
});
/** The only tempo conversion: everything authored in beats reaches seconds through these. */
export const SECONDS_PER_BEAT = 60 / CONFIG.bpm;
export const beatsFromSeconds = seconds => seconds / SECONDS_PER_BEAT;
export const secondsFromBeats = beats => beats * SECONDS_PER_BEAT;
export const OUTFITS = Object.freeze({
  old: { name: '旧长大衣', color: '#535954', dark: '#333c39', trim: '#a09a83', pants: '#535752', kind: 'old' },
  jacket: { name: '短夹克', color: '#c76b4e', dark: '#934c38', trim: '#f0d9b1', pants: '#484e5a', kind: 'jacket' },
  sport: { name: '宽肩外套', color: '#3f7894', dark: '#30586d', trim: '#efe4c8', pants: '#466575', kind: 'sport' },
  coat: { name: '长外套', color: '#bd9453', dark: '#8e693e', trim: '#e9d9ad', pants: '#4a5859', kind: 'coat' },
  open: { name: '开袖套装', color: '#e4d6b6', dark: '#b3a17c', trim: '#527965', pants: '#657d6c', kind: 'open' },
});
