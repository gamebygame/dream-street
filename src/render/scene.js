import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { AssetCache, createActor } from '../character/rig.js';
import { sampleWalk, sampleDance } from '../character/pose.js';
import { sampleScene, ContactTracker } from '../content/plan.js';
import { Street } from '../world/street.js';
import { Crowd } from '../world/crowd.js';
import { Cyclists } from '../world/cyclists.js';

function lights(scene) {
  scene.add(new THREE.HemisphereLight('#fffdf4', '#8d9b94', 1.6));
  const light = new THREE.DirectionalLight('#ffffff', 2.0);
  light.position.set(-12, 22, -8);
  scene.add(light);
  const fill = new THREE.DirectionalLight('#d9e8e5', 0.45);
  fill.position.set(8, 12, 12);
  scene.add(fill);
}

function glass(target) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: { reflection: { value: target.texture }, tint: { value: new THREE.Color('#bfd0bd') } },
    vertexShader: `varying vec4 clipPosition;varying vec2 glassUV;
      void main(){glassUV=uv;clipPosition=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position=clipPosition;}`,
    fragmentShader: `uniform sampler2D reflection;uniform vec3 tint;varying vec4 clipPosition;varying vec2 glassUV;
      void main(){
        vec2 uv=clipPosition.xy/clipPosition.w*.5+.5;
        vec4 actor=texture2D(reflection,uv);
        vec3 reflected=actor.rgb/max(actor.a,.0001);
        float luminance=dot(reflected,vec3(.2126,.7152,.0722));
        reflected=mix(reflected,vec3(luminance),.18);
        reflected=mix(reflected,tint*.62+vec3(luminance)*.38,.17);
        float imageAlpha=actor.a*mix(.68,.81,smoothstep(.05,.65,glassUV.y));
        float diagonal=glassUV.x+glassUV.y*.42;
        float skyBand=smoothstep(.24,.43,diagonal)*(1.-smoothstep(.48,.68,diagonal));
        float sheen=.065+.09*skyBand+.025*smoothstep(.55,1.,glassUV.y);
        float a=imageAlpha+sheen*(1.-imageAlpha);
        vec3 c=reflected*imageAlpha*(1.-sheen)+tint*sheen;
        gl_FragColor=vec4(c/max(a,.0001),a);
        #include <colorspace_fragment>
      }`,
  });
}

export class ExperienceRenderer {
  constructor(element) {
    this.element = element;
    this.cache = new AssetCache();
    this.frameTimes = [];
    this.fourFrameTimes = [];
    this.crowdFrameTimes = [];
    this.lastFrameTime = null;
    this.frameCount = 0;
    this.contactTracker = new ContactTracker();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor('#dedfd0');
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.pixelRatioLimit));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.info.autoReset = false;
    this.renderer.domElement.setAttribute('aria-label', '梦境街道动画');
    element.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#dedfd0');
    this.scene.fog = new THREE.Fog('#dedfd0', 44, 70);
    lights(this.scene);
    this.camera = new THREE.OrthographicCamera();
    this.camera.near = 0.1;
    this.camera.far = 100;
    const pitch = THREE.MathUtils.degToRad(CONFIG.cameraPitch);
    this.direction = new THREE.Vector3(
      Math.cos(pitch) / Math.sqrt(2),
      -Math.sin(pitch),
      Math.cos(pitch) / Math.sqrt(2),
    );
    this.right = new THREE.Vector3(-1, 0, 1).normalize();
    this.up = new THREE.Vector3().crossVectors(this.right, this.direction).normalize();
    this.reflectionScene = new THREE.Scene();
    lights(this.reflectionScene);
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      depthBuffer: true,
      samples: 4,
    });
    this.target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.target.texture.generateMipmaps = false;
    this.glassMaterial = glass(this.target);
    this.walker = createActor(this.cache);
    this.scene.add(this.walker.root);
    this.dancer = createActor(this.cache, { transitions: true });
    this.dancer.root.position.set(CONFIG.facadeX, CONFIG.reflectionFloor, 0);
    this.reflectionScene.add(this.dancer.root);
    const shadowGeo = this.cache.geometry('actor-shadow', () => new THREE.CircleGeometry(1, 40));
    for (const [scale, opacity] of [
      [0.51, 0.065],
      [0.32, 0.08],
      [0.19, 0.08],
    ]) {
      const mat = new THREE.MeshBasicMaterial({ color: '#31483d', transparent: true, opacity, depthWrite: false });
      this.cache.materials.set(`actor-shadow-${scale}`, mat);
      const shadow = new THREE.Mesh(shadowGeo, mat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(0, 0.013, 0);
      shadow.scale.set(scale, scale * 0.74, 1);
      this.scene.add(shadow);
    }
    this.street = new Street(this.scene, this.cache, this.glassMaterial, this.direction);
    this.crowd = new Crowd(this.scene, this.cache, this.camera);
    this.cyclists = new Cyclists(this.scene, this.cache, this.camera);
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(element);
    this.sample = sampleScene(0);
    this.render(0, false);
  }
  /**
   * Debug-only close-up that keeps the production viewing angle and projection, so body mechanics
   * can be judged at a readable size. `kind` is walker | dancer | crowd | cyclist.
   */
  setInspect(inspect) {
    this.inspect = inspect ? { viewHeight: 3.6, index: 0, ...inspect } : null;
    this.resize();
    this.render(this.sample.beat, false);
  }
  aimInspection() {
    const { kind, index } = this.inspect,
      focus = new THREE.Vector3();
    if (kind === 'dancer') this.dancer.root.getWorldPosition(focus);
    else if (kind === 'crowd') this.crowd.people[index]?.actor.root.getWorldPosition(focus);
    else if (kind === 'cyclist') this.cyclists.people[index]?.root.getWorldPosition(focus);
    else this.walker.root.getWorldPosition(focus);
    focus.y += 0.95;
    this.camera.position.copy(focus).addScaledVector(this.direction, -34);
    this.camera.lookAt(focus);
    this.camera.updateMatrixWorld();
  }
  resize() {
    const width = this.element.clientWidth,
      height = this.element.clientHeight,
      aspect = width / height;
    const viewHeight = this.inspect ? this.inspect.viewHeight : CONFIG.viewHeight * Math.max(1, 1.45 / aspect),
      viewWidth = viewHeight * aspect;
    this.camera.left = -viewWidth / 2;
    this.camera.right = viewWidth / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    const target = new THREE.Vector3()
      .addScaledVector(this.right, 0.03 * viewWidth)
      .addScaledVector(this.up, 0.16 * viewHeight);
    this.camera.position.copy(target).addScaledVector(this.direction, -34);
    this.camera.up.copy(this.up);
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.renderer.setSize(width, height);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target.setSize(size.x, size.y);
    this.viewport = { width, height, dpr: this.renderer.getPixelRatio() };
  }
  async warmup() {
    for (const id of ['old', 'jacket', 'sport', 'coat', 'open']) {
      this.dancer.setOutfit(id);
      await this.renderer.compileAsync(this.reflectionScene, this.camera);
    }
    this.dancer.setOutfit('old');
    this.crowd.update(104, sampleScene(104).wardrobe);
    this.cyclists.update(104, sampleScene(104).wardrobe);
    await this.renderer.compileAsync(this.scene, this.camera);
    this.render(104, false);
    this.render(0, false);
    this.contactTracker.seek(0);
    this.contactTracker.total = 0;
  }
  render(beat, measure = true) {
    const now = performance.now();
    if (measure && this.lastFrameTime !== null) {
      const dt = now - this.lastFrameTime;
      if (dt > 0) {
        this.frameTimes.push(dt);
        if (this.frameTimes.length > 40000) this.frameTimes.shift();
        if (beat % CONFIG.cycleBeats >= 48 && beat % CONFIG.cycleBeats < 60) {
          this.fourFrameTimes.push(dt);
          if (this.fourFrameTimes.length > 4000) this.fourFrameTimes.shift();
        }
        if (beat % CONFIG.cycleBeats >= 96 && beat % CONFIG.cycleBeats < 128) {
          this.crowdFrameTimes.push(dt);
          if (this.crowdFrameTimes.length > 10000) this.crowdFrameTimes.shift();
        }
      }
    }
    this.lastFrameTime = measure ? now : null;
    this.frameCount++;
    this.sample = sampleScene(beat);
    this.contactTracker.advance(beat);
    this.street.update(this.sample.travelS);
    this.walker.applyPose(sampleWalk(beat));
    this.dancer.setWardrobe(this.sample.wardrobe);
    this.dancer.applyPose(sampleDance(beat, this.sample.wardrobe));
    this.crowd.update(beat, this.sample.wardrobe);
    this.cyclists.update(beat, this.sample.wardrobe);
    if (this.inspect) this.aimInspection();
    this.renderer.info.reset();
    this.renderer.setRenderTarget(this.target);
    this.renderer.setClearColor(0, 0);
    this.renderer.clear();
    this.renderer.render(this.reflectionScene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor('#dedfd0', 1);
    this.renderer.render(this.scene, this.camera);
    this.lastRender = {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }
  diagnostics() {
    const times = [...this.frameTimes].sort((a, b) => a - b),
      percentile = p =>
        times.length ? Number(times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(2)) : null;
    const feet = this.walker.footPositions;
    const four = [...this.fourFrameTimes].sort((a, b) => a - b);
    const crowd = [...this.crowdFrameTimes].sort((a, b) => a - b);
    return {
      ...this.sample,
      ...this.lastRender,
      viewport: this.viewport,
      frameCount: this.frameCount,
      p50: percentile(0.5),
      p95: percentile(0.95),
      samples: times.length,
      fourHitFrames: {
        samples: four.length,
        p50: four.length ? +four[Math.floor(four.length * 0.5)].toFixed(2) : null,
        p95: four.length ? +four[Math.floor(four.length * 0.95)].toFixed(2) : null,
      },
      crowdFrames: {
        samples: crowd.length,
        p50: crowd.length ? +crowd[Math.floor(crowd.length * 0.5)].toFixed(2) : null,
        p95: crowd.length ? +crowd[Math.floor(crowd.length * 0.95)].toFixed(2) : null,
      },
      maxFrameMs: times.at(-1) ?? null,
      reflectionTargets: 1,
      actors: 2,
      crowd: this.crowd.visibleCount,
      crowdResources: this.crowd.diagnostics(),
      cyclists: this.cyclists.diagnostics(),
      streetPool: this.street.cycles.length,
      contactCache: this.contactTracker.recent.length,
      contactsTotal: this.contactTracker.total,
      footPositions: feet,
      products: this.street.contactDiagnostics(this.sample.travelS),
    };
  }
  resetMetrics() {
    this.frameTimes = [];
    this.fourFrameTimes = [];
    this.crowdFrameTimes = [];
    this.lastFrameTime = null;
  }
  setFixture(kind) {
    if (this.fixture) this.fixture.removeFromParent();
    this.street.group.visible = !kind;
    if (!kind) {
      this.fixture = null;
      this.render(this.sample.beat, false);
      return;
    }
    const group = new THREE.Group();
    this.scene.add(group);
    this.fixture = group;
    const backing = new THREE.Mesh(
      this.cache.geometry('fixture-backing', () => new THREE.BoxGeometry(0.1, 4, 6)),
      this.cache.material('#a9beb4'),
    );
    backing.position.set(CONFIG.facadeX + 0.35, 2, 0);
    group.add(backing);
    const windows =
      kind === 'gap'
        ? [
            [-3, -2],
            [2, 3],
          ]
        : [[-3, 3]];
    for (const [a, b] of windows) {
      const pane = new THREE.Mesh(
        this.cache.geometry('glass-plane', () => new THREE.PlaneGeometry(1, 1)),
        this.glassMaterial,
      );
      pane.rotation.y = -Math.PI / 2;
      pane.position.set(CONFIG.facadeX, 1.905, (a + b) / 2);
      pane.scale.set(b - a, 3.45, 1);
      pane.renderOrder = 5;
      group.add(pane);
    }
    if (kind === 'split' || kind === 'wall') {
      const width = kind === 'split' ? 0.2 : 2.8;
      const geometry = this.cache.geometry(`fixture-${kind}`, () => new THREE.BoxGeometry(0.15, 4, width));
      const obstruction = new THREE.Mesh(geometry, this.cache.material('#d5bea1'));
      obstruction.position.set(CONFIG.facadeX - 0.12, 2, 0);
      group.add(obstruction);
    }
    this.render(this.sample.beat, false);
  }
  reflectionPixelCount() {
    const canvas = document.createElement('canvas');
    canvas.width = this.renderer.domElement.width;
    canvas.height = this.renderer.domElement.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    this.dancer.root.visible = true;
    this.render(this.sample.beat, false);
    context.drawImage(this.renderer.domElement, 0, 0);
    const withActor = context.getImageData(0, 0, canvas.width, canvas.height).data;
    this.dancer.root.visible = false;
    this.render(this.sample.beat, false);
    context.drawImage(this.renderer.domElement, 0, 0);
    const withoutActor = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let pixels = 0;
    for (let i = 0; i < withActor.length; i += 4)
      if (
        Math.abs(withActor[i] - withoutActor[i]) +
          Math.abs(withActor[i + 1] - withoutActor[i + 1]) +
          Math.abs(withActor[i + 2] - withoutActor[i + 2]) >
        12
      )
        pixels++;
    this.dancer.root.visible = true;
    this.render(this.sample.beat, false);
    return pixels;
  }
  dispose() {
    this.resizeObserver.disconnect();
    this.renderer.setAnimationLoop(null);
    this.crowd.dispose();
    this.cyclists.dispose();
    this.target.dispose();
    this.glassMaterial.dispose();
    this.cache.dispose();
    this.renderer.dispose();
  }
}
