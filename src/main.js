import './style.css';
import { CONFIG, secondsFromBeats } from './config.js';
import { ExperienceRenderer } from './render/scene.js';
import { Transport } from './audio/transport.js';
import { ReferenceMusic } from './audio/reference.js';
import { STEMS } from './audio/mixer.js';
import { renderScore, analyzeRender, encodeWav, CHAPTER_SPANS } from './audio/render.js';
import { prepareTones } from './audio/tones.js';
import { validatePlan } from './content/plan.js';

const $ = selector => document.querySelector(selector);
const entrance = $('#entrance'),
  startButton = $('#start'),
  pauseButton = $('#pause'),
  status = $('#status');
let experience,
  transport,
  reference,
  recording = false,
  lastHud = 0,
  started = false;
const showError = error => {
  console.error(error);
  $('#error-message').textContent = `暂时无法继续前行：${error.message}`;
  $('#error').hidden = false;
};

function updateControls() {
  const state = transport?.status || 'idle';
  pauseButton.textContent = state === 'running' ? '暂停' : '继续';
  pauseButton.setAttribute('aria-label', state === 'running' ? '暂停' : '继续');
  pauseButton.disabled = !started || state === 'starting';
  $('#status-dot').classList.toggle('running', state === 'running');
  status.textContent = state === 'running' ? experience.sample.phase : started ? '停一会儿，街道还在。' : '准备好了';
}

async function play() {
  await transport.resume();
  started = true;
  entrance.hidden = true;
  $('#error').hidden = true;
  updateControls();
}
async function pause() {
  const released = transport.pause();
  experience.render(transport.sample().beat, false);
  updateControls();
  await released;
}
async function seek(beat) {
  await transport.seek(beat);
  experience.contactTracker.seek(beat);
  experience.render(beat, false);
  experience.resetMetrics();
  updateControls();
}
function musicStatus(data) {
  const names = {
    score: '原创配乐 · 128 BPM',
    reference: 'Ecstatic Vibrations · 对照试听，画面不对齐',
    silent: '无声动作检查',
  };
  const states = {
    loading: '连接官方音源…',
    buffering: '等待音源缓冲…',
    blocked: '请点击官方播放器中的播放按钮',
    error: '音源暂时不可用',
    ready: '已选择',
    playing: '正在播放',
    paused: '已暂停',
    idle: '正在使用',
  };
  $('#music-status').textContent = `${names[data.mode]} · ${states[data.status] || data.status}`;
  document
    .querySelectorAll('[data-music]')
    .forEach(button => button.setAttribute('aria-pressed', String(button.dataset.music === data.mode)));
}
/** Switching sources never moves the clock: the score keeps time underneath a comparison or silence. */
async function chooseMusic(mode) {
  $('#official-shell').hidden = mode !== 'reference';
  try {
    await reference.select(mode);
    transport.setScoreAudible(mode === 'score');
  } catch (error) {
    $('#music-status').textContent = error.message;
    $('#music-panel').hidden = false;
  }
}

async function record({ seconds = secondsFromBeats(CONFIG.cycleBeats) + 0.5, fromBeat = 0, visualOnly = false } = {}) {
  if (recording) throw new Error('Already recording.');
  if (reference.mode === 'reference' && !visualOnly)
    throw new Error('对照原曲的声音来自官方在线播放器，无法录入视频。含声音的录制请切回原创配乐。');
  if (!window.MediaRecorder || !experience.renderer.domElement.captureStream)
    throw new Error('当前浏览器不支持演示录制。');
  recording = true;
  try {
    await pause();
    await seek(fromBeat);
    await transport.ensureAudio();
    const canvasStream = experience.renderer.domElement.captureStream(60);
    const hasAudio = reference.mode === 'score' && !visualOnly;
    const stream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...(hasAudio ? transport.mixer.capture.stream.getAudioTracks() : []),
    ]);
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4'].find(type =>
      MediaRecorder.isTypeSupported(type),
    );
    if (!mime) throw new Error('没有可用的录制编码器。');
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    const result = new Promise((resolve, reject) => {
      recorder.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = event => reject(event.error || new Error('MediaRecorder failed.'));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    });
    recorder.start(1000);
    await play();
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    recorder.stop();
    const blob = await result;
    for (const track of canvasStream.getTracks()) track.stop();
    return {
      blob,
      mime,
      seconds,
      bytes: blob.size,
      fromBeat,
      endBeat: transport.sample().beat,
      audioSource: reference.mode,
      hasAudio,
    };
  } finally {
    recording = false;
  }
}

/** Offline render of a span of the score for review listening; returns metrics and a base64 WAV. */
async function renderMusic(from, to, options = {}) {
  const buffer = await renderScore(from, to, options),
    bytes = encodeWav(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { metrics: analyzeRender(buffer, from, to), wav: btoa(binary) };
}

function mountStemToggles() {
  const container = $('#stems');
  for (const stem of STEMS) {
    const label = document.createElement('label'),
      input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = true;
    input.addEventListener('change', async () => {
      await transport.ensureAudio();
      transport.mixer.setStemEnabled(stem, input.checked);
    });
    label.append(input, ` ${stem}`);
    container.append(label);
  }
}

try {
  validatePlan();
  experience = new ExperienceRenderer($('#stage'));
  reference = new ReferenceMusic({
    element: 'official-player',
    onChange: musicStatus,
    onError: error => {
      $('#music-status').textContent = error.message;
      $('#music-panel').hidden = false;
    },
  });
  transport = new Transport({ reference });
  startButton.disabled = true;
  startButton.firstChild.textContent = '准备街道… ';
  // The guitar tones are rendered while the street's shaders compile, before anyone can press start.
  await Promise.all([experience.warmup(), prepareTones()]);
  startButton.disabled = false;
  startButton.firstChild.textContent = '开始前行 ';
  startButton.addEventListener('click', async () => {
    startButton.disabled = true;
    try {
      await play();
    } catch (error) {
      showError(error);
    } finally {
      startButton.disabled = false;
    }
  });
  pauseButton.addEventListener('click', () => {
    (transport.status === 'running' ? pause() : play()).catch(showError);
  });
  $('#mute').addEventListener('click', () => {
    transport.setMuted(!transport.muted);
    $('#mute').setAttribute('aria-pressed', String(transport.muted));
    $('#mute').textContent = transport.muted ? '静音中' : '声音';
  });
  $('#volume').addEventListener('input', event => transport.setVolume(Number(event.target.value)));
  $('#about-toggle').addEventListener('click', () => {
    const hidden = !$('#about').hidden;
    $('#about').hidden = hidden;
    $('#about-toggle').setAttribute('aria-expanded', String(!hidden));
  });
  $('#music-toggle').addEventListener('click', () => {
    $('#music-panel').hidden = !$('#music-panel').hidden;
    $('#music-toggle').setAttribute('aria-expanded', String(!$('#music-panel').hidden));
  });
  document
    .querySelectorAll('[data-music]')
    .forEach(button => button.addEventListener('click', () => chooseMusic(button.dataset.music)));
  $('#retry').addEventListener('click', () => location.reload());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause().catch(showError);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && started) {
      event.preventDefault();
      (transport.status === 'running' ? pause() : play()).catch(showError);
    }
  });
  const params = new URLSearchParams(location.search),
    debug = params.has('debug');
  $('#debug').hidden = !debug;
  if (debug) mountStemToggles();
  if (debug && params.get('inspect'))
    experience.setInspect({
      kind: params.get('inspect'),
      index: Number(params.get('index') ?? 0),
      viewHeight: Number(params.get('zoom') ?? 3.6),
    });
  document
    .querySelectorAll('[data-beat]')
    .forEach(button => button.addEventListener('click', () => seek(Number(button.dataset.beat)).catch(showError)));
  $('#contacts').addEventListener('change', event => {
    experience.street.showContacts(event.target.checked);
    experience.render(transport.sample().beat, false);
  });
  $('#capture').addEventListener('click', async () => {
    const button = $('#capture'),
      label = button.textContent;
    button.disabled = true;
    button.textContent = '录制中…';
    try {
      const { blob, mime, hasAudio } = await record({ visualOnly: reference.mode !== 'score' });
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = `dream-street${hasAudio ? '' : '-silent'}.${mime.includes('mp4') ? 'mp4' : 'webm'}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });
  experience.renderer.setAnimationLoop(time => {
    if (transport.status === 'running') experience.render(transport.tick().beat);
    if (recording && transport.context) {
      const stamp = transport.context.getOutputTimestamp?.();
      if (stamp?.contextTime > 0)
        transport.mixer.setRecordingDelay(
          transport.context.currentTime - stamp.contextTime - (performance.now() - stamp.performanceTime) / 1000,
        );
    }
    if (time - lastHud > 250) {
      updateControls();
      lastHud = time;
      if (debug) {
        const d = experience.diagnostics(),
          t = transport.diagnostics();
        $('#diagnostics').textContent = JSON.stringify(
          {
            beat: +d.beat.toFixed(3),
            outfit: d.wardrobe.outfit,
            theme: d.theme,
            crowd: d.crowd,
            cyclists: d.cyclists.visible,
            clock: t.syncMode,
            music: t.music.mode,
            voices: t.activeVoices,
            drawCalls: d.calls,
            p50: d.p50,
            p95: d.p95,
            textures: d.textures,
            geometry: d.geometries,
            contactCache: d.contactCache,
          },
          null,
          2,
        );
      }
    }
  });
  window.__dreamStreet = {
    ready: true,
    play,
    pause,
    seek,
    record,
    chooseMusic,
    renderMusic,
    chapters: CHAPTER_SPANS,
    snapshot: () => ({ visual: experience.diagnostics(), audio: transport.diagnostics() }),
    showContacts: show => {
      experience.street.showContacts(show);
      experience.render(transport.sample().beat, false);
    },
    project: point => {
      const p = point.clone ? point : experience.walker.root.position.clone().set(...point);
      const out = p.project(experience.camera);
      return {
        x: (out.x * 0.5 + 0.5) * experience.viewport.width,
        y: (-0.5 * out.y + 0.5) * experience.viewport.height,
      };
    },
    get renderer() {
      return experience;
    },
    get transport() {
      return transport;
    },
    get music() {
      return reference;
    },
  };
  updateControls();
  musicStatus(reference.diagnostics());
  if (params.get('music') === 'silent') {
    await chooseMusic('silent');
    $('#music-status').textContent = '无声动作检查 · 此模式不代表音乐交付';
  }
} catch (error) {
  showError(error);
  startButton.disabled = true;
  startButton.textContent = '暂时无法开启街道';
}
