import { CONFIG } from '../config.js';

export const REFERENCE_VIDEO = 'knOXppaqBYY';
export const MUSIC_MODES = Object.freeze(['score', 'reference', 'silent']);

/**
 * Music source selection. The original score is the default and the only clock. "reference" plays the user's
 * reference recording through the visible official YouTube player purely to compare its power by ear: the street
 * keeps the score's beat, so the two are deliberately not synchronized. Nothing is downloaded or captured.
 */
export class ReferenceMusic {
  constructor({ element, onChange = () => {}, onError = () => {} } = {}) {
    this.element = element;
    this.onChange = onChange;
    this.onError = onError;
    this.mode = 'score';
    this.status = 'idle';
    this.volume = CONFIG.defaultVolume;
    this.muted = false;
    this.running = false;
  }
  notify(status) {
    this.status = status;
    this.onChange(this.diagnostics());
  }
  async select(mode) {
    if (!MUSIC_MODES.includes(mode)) throw new Error('Unknown music source.');
    this.mode = mode;
    if (mode !== 'reference') {
      this.player?.pauseVideo?.();
      this.notify('idle');
      return;
    }
    await this.ensurePlayer();
    // A comparison always starts from the top of the recording.
    this.player.seekTo(0, true);
    this.applyVolume();
    if (this.running) this.player.playVideo();
    this.notify(this.running ? 'playing' : 'ready');
  }
  ensurePlayer() {
    if (this.playerReady) return this.playerReady;
    this.notify('loading');
    this.playerReady = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('官方音源暂时连接不上，对照试听需要联网。')), 15000);
      const create = () => {
        this.player = new window.YT.Player(this.element, {
          width: 320,
          height: 200,
          videoId: REFERENCE_VIDEO,
          playerVars: { playsinline: 1, origin: location.origin, controls: 1, rel: 0 },
          events: {
            onReady: () => {
              clearTimeout(timeout);
              resolve();
            },
            onError: event => {
              const error = new Error(`官方播放器未能播放（${event.data}）。`);
              clearTimeout(timeout);
              reject(error);
              this.notify('error');
              this.onError(error);
            },
            onAutoplayBlocked: () => this.notify('blocked'),
            onStateChange: event => {
              if (this.mode !== 'reference') return;
              if (event.data === 1) this.notify('playing');
              if (event.data === 2) this.notify('paused');
              if (event.data === 3) this.notify('buffering');
            },
          },
        });
      };
      if (window.YT?.Player) create();
      else {
        const previous = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          previous?.();
          create();
        };
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('无法连接官方音源。'));
        };
        document.head.appendChild(script);
      }
    }).catch(error => {
      this.playerReady = null;
      throw error;
    });
    return this.playerReady;
  }
  /** Follows the street's start and stop; the recording's position is its own. */
  resume() {
    this.running = true;
    if (this.mode === 'reference' && this.player?.playVideo) {
      this.applyVolume();
      this.player.playVideo();
    }
  }
  pause() {
    this.running = false;
    this.player?.pauseVideo?.();
  }
  applyVolume() {
    this.player?.setVolume?.(this.muted ? 0 : Math.round(this.volume * 100));
  }
  setVolume(value) {
    this.volume = value;
    this.applyVolume();
  }
  setMuted(value) {
    this.muted = Boolean(value);
    this.applyVolume();
  }
  diagnostics() {
    return {
      mode: this.mode,
      status: this.status,
      synchronized: this.mode !== 'reference',
      capturable: this.mode === 'score',
    };
  }
  dispose() {
    this.player?.destroy?.();
  }
}
