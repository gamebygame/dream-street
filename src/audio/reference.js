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
    this.requestedMode = 'score';
    this.selection = 0;
    this.disposed = false;
  }
  notify(status) {
    this.status = status;
    this.onChange(this.diagnostics());
  }
  async select(mode) {
    if (!MUSIC_MODES.includes(mode)) throw new Error('Unknown music source.');
    if (this.disposed) return false;
    const selection = ++this.selection;
    this.requestedMode = mode;
    if (mode !== 'reference') {
      this.mode = mode;
      this.player?.pauseVideo?.();
      this.notify('idle');
      return true;
    }
    this.notify('loading');
    try {
      await this.ensurePlayer();
    } catch (error) {
      if (selection !== this.selection) return false;
      this.requestedMode = this.mode;
      this.notify('error');
      this.onError(error);
      return false;
    }
    if (selection !== this.selection) return false;
    const previousMode = this.mode;
    try {
      this.mode = mode;
      // A comparison always starts from the top of the recording.
      this.player.seekTo(0, true);
      this.applyVolume();
      if (this.running) this.player.playVideo();
    } catch (error) {
      if (selection !== this.selection) return false;
      this.mode = this.requestedMode = previousMode === 'reference' ? 'score' : previousMode;
      this.player?.pauseVideo?.();
      this.notify('error');
      this.onError(error);
      return false;
    }
    if (selection !== this.selection) return false;
    this.notify(this.running ? 'playing' : 'ready');
    return true;
  }
  ensurePlayer() {
    if (this.playerReady) return this.playerReady;
    this.playerReady = new Promise((resolve, reject) => {
      let settled = false,
        ready = false,
        created = false,
        script,
        apiReady,
        previous;
      const cleanup = () => {
        clearTimeout(timeout);
        script?.remove();
        if (apiReady && window.onYouTubeIframeAPIReady === apiReady) window.onYouTubeIframeAPIReady = previous;
        this.cancelLoad = null;
      };
      const fail = error => {
        if (settled) return;
        settled = true;
        cleanup();
        this.player?.destroy?.();
        this.player = null;
        reject(error);
      };
      const timeout = setTimeout(() => fail(new Error('官方音源暂时连接不上，对照试听需要联网。')), 15000);
      this.cancelLoad = () => fail(new Error('Player disposed.'));
      const create = () => {
        if (settled || created) return;
        created = true;
        // YouTube replaces its mount node; keep a stable outer host so a failed load can be retried.
        const host = typeof this.element === 'string' ? document.getElementById(this.element) : this.element;
        const mount = document.createElement('div');
        host.replaceChildren(mount);
        try {
          this.player = new window.YT.Player(mount, {
            width: 320,
            height: 200,
            videoId: REFERENCE_VIDEO,
            playerVars: { playsinline: 1, origin: location.origin, controls: 1, rel: 0 },
            events: {
              onReady: () => {
                if (settled) return;
                settled = true;
                ready = true;
                cleanup();
                resolve();
              },
              onError: event => {
                const error = new Error(`官方播放器未能播放（${event.data}）。`);
                if (!settled) fail(error);
                else if (ready && event.target === this.player && !this.disposed && this.mode === 'reference') {
                  // A playing source can fail too. Restore the score and the UI as one state change.
                  this.selection++;
                  this.mode = this.requestedMode = 'score';
                  this.player?.pauseVideo?.();
                  this.player?.destroy?.();
                  this.player = this.playerReady = null;
                  this.notify('error');
                  this.onError(error);
                }
              },
              onAutoplayBlocked: event => {
                if (event.target === this.player && !this.disposed && this.mode === 'reference') this.notify('blocked');
              },
              onStateChange: event => {
                if (event.target !== this.player || this.disposed) return;
                if (this.mode !== 'reference' || !this.running) {
                  if (event.data === 1) this.player?.pauseVideo?.();
                  return;
                }
                if (event.data === 1) this.notify('playing');
                if (event.data === 2) this.notify('paused');
                if (event.data === 3) this.notify('buffering');
              },
            },
          });
        } catch (error) {
          fail(error);
        }
      };
      if (window.YT?.Player) create();
      else {
        previous = window.onYouTubeIframeAPIReady;
        apiReady = window.onYouTubeIframeAPIReady = () => {
          previous?.();
          create();
        };
        script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.onerror = () => {
          fail(new Error('无法连接官方音源。'));
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
      requestedMode: this.requestedMode,
      status: this.status,
      synchronized: this.mode !== 'reference',
      capturable: this.mode === 'score',
    };
  }
  dispose() {
    this.disposed = true;
    this.selection++;
    this.cancelLoad?.();
    this.player?.destroy?.();
  }
}
