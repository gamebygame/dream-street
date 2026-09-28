import * as THREE from 'three';
import { CROWD, crowdLayout, crowdPose } from '../content/crowd.js';
import { createActor } from '../character/rig.js';

/** Independent skeletons feed shared geometry batches; no actors are allocated while playing. */
export class Crowd {
  constructor(scene, cache, camera) {
    this.group = new THREE.Group();
    this.group.name = 'passers-by';
    scene.add(this.group);
    this.people = [];
    this.batches = new Map();
    this.visibleCount = 0;
    this.camera = camera;
    this.screenPoint = new THREE.Vector3();
    for (const person of CROWD) {
      const actor = createActor(cache, { ...person, outfitIds: [person.outfit], accessories: false });
      if (person.child) actor.head.scale.setScalar(1.1);
      const parts = [];
      actor.root.traverseVisible(object => {
        if (!object.isMesh) return;
        const key = object.geometry.uuid;
        if (!this.batches.has(key)) this.batches.set(key, { geometry: object.geometry, capacity: 0 });
        const batch = this.batches.get(key);
        batch.capacity++;
        parts.push({ object, batch, color: object.material.color });
      });
      this.people.push({ person, actor, parts, state: null });
    }
    const material = cache.material('#ffffff');
    for (const batch of this.batches.values()) {
      batch.mesh = new THREE.InstancedMesh(batch.geometry, material, batch.capacity);
      batch.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      batch.mesh.frustumCulled = false;
      batch.mesh.count = 0;
      this.group.add(batch.mesh);
      for (let i = 0; i < batch.capacity; i++) batch.mesh.setColorAt(i, new THREE.Color('#ffffff'));
    }
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: '#485d50',
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });
    cache.materials.set('crowd-shadow', shadowMaterial);
    this.shadows = new THREE.InstancedMesh(
      cache.geometry('crowd-shadow', () => new THREE.CircleGeometry(1, 16)),
      shadowMaterial,
      CROWD.length,
    );
    this.shadows.frustumCulled = false;
    this.group.add(this.shadows);
    this.shadowTransform = new THREE.Object3D();
  }
  update(beat, wardrobe) {
    for (const batch of this.batches.values()) batch.mesh.count = 0;
    this.visibleCount = 0;
    this.shadows.count = 0;
    const layout = crowdLayout(beat);
    for (const entry of this.people) {
      const { person, actor, parts } = entry,
        state = layout[person.index];
      entry.state = state;
      if (!state.visible) continue;
      this.screenPoint.set(state.x, 1, state.z).project(this.camera);
      if (Math.abs(this.screenPoint.x) < 1 && Math.abs(this.screenPoint.y) < 1) this.visibleCount++;
      actor.root.position.set(state.x, 0, state.z);
      actor.applyPose(crowdPose(person, beat, state, wardrobe));
      for (const { object, batch, color } of parts) {
        const index = batch.mesh.count++;
        batch.mesh.setMatrixAt(index, object.matrixWorld);
        batch.mesh.setColorAt(index, color);
      }
      this.shadowTransform.position.set(state.x, 0.015, state.z);
      this.shadowTransform.rotation.set(-Math.PI / 2, 0, 0);
      this.shadowTransform.scale.set(0.37 * person.height, 0.29 * person.height, 1);
      this.shadowTransform.updateMatrix();
      this.shadows.setMatrixAt(this.shadows.count++, this.shadowTransform.matrix);
    }
    for (const batch of this.batches.values()) {
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.mesh.instanceColor.needsUpdate = true;
    }
    this.shadows.instanceMatrix.needsUpdate = true;
  }
  diagnostics() {
    return {
      active: this.visibleCount,
      pool: this.people.length,
      batches: this.batches.size,
      wavers: CROWD.filter(p => p.wave).length,
    };
  }
  dispose() {
    for (const batch of this.batches.values()) batch.mesh.dispose();
    this.shadows.dispose();
  }
}
