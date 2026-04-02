/**
 * STABLE: 2024-04-02
 * Light Helpers Manager
 * 
 * Manages visual helpers for lights:
 * - DirectionalLight: DirectionalLightHelper
 * - PointLight: PointLightHelper
 * - SpotLight: SpotLightHelper
 * - AmbientLight: Wireframe sphere
 * - HemisphereLight: Wireframe hemisphere
 */

import * as THREE from 'three';
import { DirectionalLightHelper, PointLightHelper, SpotLightHelper } from 'three';

// ============================================================================
// Light Helpers Manager
// ============================================================================

export class LightHelpers {
  private scene: THREE.Scene;
  private helpers = new Map<string, THREE.Object3D>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // -------------------------------------------------------------------------
  // Helper Creation
  // -------------------------------------------------------------------------

  createHelper(light: THREE.Light): void {
    if (this.helpers.has(light.uuid)) return;

    let helper: THREE.Object3D | null = null;

    if (light instanceof THREE.DirectionalLight) {
      helper = new DirectionalLightHelper(light, 1);
    } else if (light instanceof THREE.PointLight) {
      helper = new PointLightHelper(light, 0.5);
    } else if (light instanceof THREE.SpotLight) {
      helper = new SpotLightHelper(light);
    } else if (light instanceof THREE.AmbientLight) {
      helper = this.createAmbientVisual(light);
    } else if (light instanceof THREE.HemisphereLight) {
      helper = this.createHemisphereVisual(light);
    }

    if (helper) {
      helper.name = light.name + '_helper';
      this.scene.add(helper);
      this.helpers.set(light.uuid, helper);
    }
  }

  private createAmbientVisual(light: THREE.AmbientLight): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 4),
      new THREE.MeshBasicMaterial({ color: light.color, wireframe: true })
    );
    mesh.name = light.name + '_helper';
    mesh.position.copy(light.position);
    return mesh;
  }

  private createHemisphereVisual(light: THREE.HemisphereLight): THREE.Group {
    const group = new THREE.Group();

    // Sky hemisphere
    const skyGeo = new THREE.SphereGeometry(0.3, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    const skyMat = new THREE.MeshBasicMaterial({ color: light.color, wireframe: true });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.position.y = 0.15;
    group.add(sky);

    // Ground hemisphere
    const groundGeo = new THREE.SphereGeometry(0.3, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const groundMat = new THREE.MeshBasicMaterial({ color: light.groundColor, wireframe: true });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.15;
    group.add(ground);

    group.name = light.name + '_helper';
    group.position.copy(light.position);
    return group;
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  update(): void {
    this.helpers.forEach((helper, uuid) => {
      const light = this.scene.getObjectByProperty('uuid', uuid) as THREE.Light;
      if (light) {
        helper.visible = light.visible;

        // Update specific helper types
        if (helper instanceof DirectionalLightHelper || helper instanceof SpotLightHelper) {
          helper.update();
        }

        // Update ambient/hemisphere visual positions
        if (light instanceof THREE.AmbientLight || light instanceof THREE.HemisphereLight) {
          helper.position.copy(light.position);
        }
      }
    });
  }

  ensureAll(scene: THREE.Scene): void {
    scene.traverse((obj) => {
      if (
        obj instanceof THREE.Light &&
        !(obj instanceof THREE.AmbientLight) &&
        !(obj instanceof THREE.HemisphereLight)
      ) {
        if (!this.helpers.has(obj.uuid)) {
          this.createHelper(obj);
        }
      }
    });
  }

  // -------------------------------------------------------------------------
  // Removal
  // -------------------------------------------------------------------------

  removeHelper(lightUuid: string): void {
    const helper = this.helpers.get(lightUuid);
    if (helper) {
      this.scene.remove(helper);
      this.helpers.delete(lightUuid);
    }
  }

  clear(): void {
    this.helpers.forEach((helper) => this.scene.remove(helper));
    this.helpers.clear();
  }

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------

  getHelpers(): Map<string, THREE.Object3D> {
    return new Map(this.helpers);
  }
}
