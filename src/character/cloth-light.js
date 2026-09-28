import * as THREE from 'three';

/** Reusable ribbons live in the reflection pass, so glass and mullions clip the entire change. */
export class ClothLight {
  constructor(root, cache) {
    this.group = new THREE.Group();
    this.group.name = 'cloth-refraction';
    root.add(this.group);
    this.opacity = { value: 0 };
    this.progress = 0;
    this.strips = [];
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { opacity: this.opacity },
      vertexShader:
        'attribute float fade;varying float vFade;varying vec2 vUv;void main(){vFade=fade;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        'uniform float opacity;varying float vFade;varying vec2 vUv;void main(){float edge=pow(max(0.,sin(vUv.y*3.14159)),.55);vec3 color=mix(vec3(.45,.83,.77),vec3(1.,.91,.62),vUv.x);gl_FragColor=vec4(color,opacity*vFade*edge);#include <colorspace_fragment>}'.replace(
          '#include',
          '\n#include',
        ),
    });
    cache.materials.set('cloth-light-ribbon', material);
    for (let strip = 0; strip < 2; strip++) {
      const positions = new Float32Array(66 * 3),
        uv = [],
        fade = [],
        indices = [];
      for (let i = 0; i < 33; i++)
        for (let side = 0; side < 2; side++) {
          uv.push(i / 32, side);
          fade.push(Math.sin((i / 32) * Math.PI));
        }
      for (let i = 0; i < 32; i++) {
        const n = i * 2;
        indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
      }
      const geometry = cache.geometry(`cloth-light-strip-${strip}`, () => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setAttribute('fade', new THREE.Float32BufferAttribute(fade, 1));
        g.setIndex(indices);
        return g;
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.strips.push(geometry);
    }
    this.group.visible = false;
  }
  update(state) {
    const age = state.transitionAge,
      duration = state.transitionBeats;
    this.group.visible = age > 0 && age < duration + 0.35;
    if (!this.group.visible) {
      this.opacity.value = 0;
      return;
    }
    const t = Math.min(1, age / duration),
      edge = state.progress;
    this.progress = t;
    this.opacity.value = Math.min(1, age / 0.12) * Math.min(1, (duration + 0.35 - age) / 0.4) * 0.88;
    for (let strip = 0; strip < 2; strip++) {
      const geometry = this.strips[strip],
        position = geometry.attributes.position;
      for (let i = 0; i < 33; i++) {
        const tail = i / 32,
          angle = t * Math.PI * 3.2 - tail * Math.PI * 1.25 + strip * Math.PI;
        const radius = 0.48 + 0.16 * Math.sin(Math.PI * t) + 0.1 * tail;
        const y = Math.max(0.06, -0.2 + edge * 2.8 - 0.62 * tail) + 0.075 * Math.sin(angle * 2);
        const width = 0.032 + 0.052 * Math.sin(Math.PI * tail);
        for (let side = 0; side < 2; side++)
          position.setXYZ(i * 2 + side, Math.cos(angle) * radius, y + (side - 0.5) * width, Math.sin(angle) * radius);
      }
      position.needsUpdate = true;
    }
  }
}
