/**
 * STABLE: 2024-04-02
 * Property Panel Manager
 * 
 * Manages the property panel UI for:
 * - Transform properties (position, rotation, scale)
 * - Material properties (color, roughness, metalness, etc.)
 * - Light properties (color, intensity, distance, etc.)
 * - Camera properties (FOV, near, far)
 */

import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

export interface PropertyCallbacks {
  onTransformChange: () => void;
  onMaterialChange: () => void;
  onLightChange: () => void;
  onCameraChange: () => void;
  onCameraHelperToggle?: (visible: boolean) => void;
}

// ============================================================================
// Property Panel Manager
// ============================================================================

export class PropertyPanel {
  private noSelectionMsg: HTMLElement;
  private transformProps: HTMLElement;
  private callbacks: PropertyCallbacks;

  // Current transform command for undo/redo
  private currentTransformCmd: any = null;

  constructor(callbacks: PropertyCallbacks) {
    this.noSelectionMsg = document.getElementById('no-selection')!;
    this.transformProps = document.getElementById('transform-properties')!;
    this.callbacks = callbacks;

    this.setupTransformListeners();
    this.setupMaterialListeners();
    this.setupLightListeners();
    this.setupCameraListeners();
  }

  // -------------------------------------------------------------------------
  // Panel Visibility
  // -------------------------------------------------------------------------

  showNoSelection(): void {
    this.noSelectionMsg.style.display = 'block';
    this.transformProps.style.display = 'none';
    this.hideMaterialProps();
    this.hideLightProps();
    this.hideCameraProps();
  }

  showObjectProperties(obj: THREE.Object3D): void {
    this.noSelectionMsg.style.display = 'none';
    this.transformProps.style.display = 'block';

    // Show/hide specific property groups based on object type
    const isMesh = obj instanceof THREE.Mesh;
    const isLight = obj instanceof THREE.Light;
    const isCamera = obj instanceof THREE.Camera;

    document.getElementById('material-properties')!.style.display = isMesh ? 'block' : 'none';
    document.getElementById('light-properties')!.style.display = isLight ? 'block' : 'none';
    document.getElementById('camera-properties')!.style.display = isCamera ? 'block' : 'none';

    // Update inputs
    this.updateTransformInputs(obj);
    if (isMesh) this.populateMaterialInputs(obj as THREE.Mesh);
    if (isLight) this.populateLightInputs(obj as THREE.Light);
    if (isCamera) this.populateCameraInputs(obj as THREE.PerspectiveCamera);
  }

  // -------------------------------------------------------------------------
  // Transform Properties
  // -------------------------------------------------------------------------

  private setupTransformListeners(): void {
    const inputs = ['pos', 'rot', 'scale'];
    const axes = ['x', 'y', 'z'];

    inputs.forEach((type) => {
      axes.forEach((axis) => {
        const el = document.getElementById(`${type}-${axis}`) as HTMLInputElement;
        if (el) {
          el.addEventListener('change', () => this.callbacks.onTransformChange());
        }
      });
    });
  }

  updateTransformInputs(obj: THREE.Object3D): void {
    const euler = new THREE.Euler().setFromQuaternion(obj.quaternion);
    const axes: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];

    axes.forEach((axis, i) => {
      const pos = document.getElementById(`pos-${axis}`) as HTMLInputElement;
      const rot = document.getElementById(`rot-${axis}`) as HTMLInputElement;
      const scl = document.getElementById(`scale-${axis}`) as HTMLInputElement;

      if (pos) pos.value = obj.position.getComponent(i).toFixed(2);
      if (rot) rot.value = THREE.MathUtils.radToDeg(euler[axis]).toFixed(1);
      if (scl) scl.value = obj.scale.getComponent(i).toFixed(2);
    });
  }

  readTransformValues(): { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 } {
    const position = new THREE.Vector3(
      parseFloat((document.getElementById('pos-x') as HTMLInputElement)?.value || '0'),
      parseFloat((document.getElementById('pos-y') as HTMLInputElement)?.value || '0'),
      parseFloat((document.getElementById('pos-z') as HTMLInputElement)?.value || '0')
    );

    const rotation = new THREE.Euler(
      THREE.MathUtils.degToRad(parseFloat((document.getElementById('rot-x') as HTMLInputElement)?.value || '0')),
      THREE.MathUtils.degToRad(parseFloat((document.getElementById('rot-y') as HTMLInputElement)?.value || '0')),
      THREE.MathUtils.degToRad(parseFloat((document.getElementById('rot-z') as HTMLInputElement)?.value || '0'))
    );

    const scale = new THREE.Vector3(
      parseFloat((document.getElementById('scale-x') as HTMLInputElement)?.value || '1'),
      parseFloat((document.getElementById('scale-y') as HTMLInputElement)?.value || '1'),
      parseFloat((document.getElementById('scale-z') as HTMLInputElement)?.value || '1')
    );

    return { position, rotation, scale };
  }

  // -------------------------------------------------------------------------
  // Material Properties
  // -------------------------------------------------------------------------

  private hideMaterialProps(): void {
    document.getElementById('material-properties')!.style.display = 'none';
  }

  private setupMaterialListeners(): void {
    const update = () => this.callbacks.onMaterialChange();

    document.getElementById('material-color')?.addEventListener('input', update);
    document.getElementById('material-roughness')?.addEventListener('change', update);
    document.getElementById('material-roughness-slider')?.addEventListener('input', update);
    document.getElementById('material-metalness')?.addEventListener('change', update);
    document.getElementById('material-metalness-slider')?.addEventListener('input', update);
    document.getElementById('material-wireframe')?.addEventListener('change', update);
    document.getElementById('material-opacity')?.addEventListener('change', update);
    document.getElementById('material-opacity-slider')?.addEventListener('input', update);
  }

  populateMaterialInputs(mesh: THREE.Mesh): void {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat) return;

    const color = document.getElementById('material-color') as HTMLInputElement;
    const rough = document.getElementById('material-roughness') as HTMLInputElement;
    const roughS = document.getElementById('material-roughness-slider') as HTMLInputElement;
    const metal = document.getElementById('material-metalness') as HTMLInputElement;
    const metalS = document.getElementById('material-metalness-slider') as HTMLInputElement;
    const wire = document.getElementById('material-wireframe') as HTMLInputElement;
    const op = document.getElementById('material-opacity') as HTMLInputElement;
    const opS = document.getElementById('material-opacity-slider') as HTMLInputElement;

    if (color) color.value = '#' + mat.color.getHexString();
    if (rough) rough.value = mat.roughness.toFixed(2);
    if (roughS) roughS.value = mat.roughness.toFixed(2);
    if (metal) metal.value = mat.metalness.toFixed(2);
    if (metalS) metalS.value = mat.metalness.toFixed(2);
    if (wire) wire.checked = mat.wireframe;
    if (op) op.value = mat.opacity.toFixed(2);
    if (opS) opS.value = mat.opacity.toFixed(2);
  }

  readMaterialValues(): {
    color: number;
    roughness: number;
    metalness: number;
    wireframe: boolean;
    opacity: number;
  } {
    const colorEl = document.getElementById('material-color') as HTMLInputElement;
    const roughEl = document.getElementById('material-roughness') as HTMLInputElement;
    const metalEl = document.getElementById('material-metalness') as HTMLInputElement;
    const wireEl = document.getElementById('material-wireframe') as HTMLInputElement;
    const opEl = document.getElementById('material-opacity') as HTMLInputElement;

    return {
      color: parseInt(colorEl?.value?.replace('#', '') || 'ffffff', 16),
      roughness: parseFloat(roughEl?.value || '0.5'),
      metalness: parseFloat(metalEl?.value || '0'),
      wireframe: wireEl?.checked || false,
      opacity: parseFloat(opEl?.value || '1'),
    };
  }

  // -------------------------------------------------------------------------
  // Light Properties
  // -------------------------------------------------------------------------

  private hideLightProps(): void {
    document.getElementById('light-properties')!.style.display = 'none';
  }

  private setupLightListeners(): void {
    const update = () => this.callbacks.onLightChange();

    document.getElementById('light-color')?.addEventListener('input', update);
    document.getElementById('light-intensity')?.addEventListener('change', update);
    document.getElementById('light-intensity-slider')?.addEventListener('input', update);
    document.getElementById('light-distance')?.addEventListener('change', update);
    document.getElementById('light-distance-slider')?.addEventListener('input', update);
    document.getElementById('light-angle')?.addEventListener('change', update);
    document.getElementById('light-angle-slider')?.addEventListener('input', update);
    document.getElementById('light-penumbra')?.addEventListener('change', update);
    document.getElementById('light-penumbra-slider')?.addEventListener('input', update);
    document.getElementById('light-decay')?.addEventListener('change', update);
    document.getElementById('light-decay-slider')?.addEventListener('input', update);
  }

  populateLightInputs(light: THREE.Light): void {
    const typeEl = document.getElementById('light-type') as HTMLElement;
    const color = document.getElementById('light-color') as HTMLInputElement;
    const intensity = document.getElementById('light-intensity') as HTMLInputElement;
    const intensityS = document.getElementById('light-intensity-slider') as HTMLInputElement;

    // Type display
    if (typeEl) {
      const typeMap: Record<string, string> = {
        AmbientLight: '环境光',
        DirectionalLight: '平行光',
        PointLight: '点光源',
        SpotLight: '聚光灯',
        HemisphereLight: '半球光',
      };
      typeEl.textContent = typeMap[light.constructor.name] || light.constructor.name;
    }

    // Common properties
    if (color) color.value = '#' + light.color.getHexString();
    if (intensity) intensity.value = light.intensity.toFixed(2);
    if (intensityS) intensityS.value = light.intensity.toFixed(2);

    // Light-specific properties
    const distanceRow = document.getElementById('light-distance-row');
    const angleRow = document.getElementById('light-angle-row');
    const penumbraRow = document.getElementById('light-penumbra-row');
    const decayRow = document.getElementById('light-decay-row');

    // Hide all specific rows first
    [distanceRow, angleRow, penumbraRow, decayRow].forEach((row) => {
      if (row) row.style.display = 'none';
    });

    // Show relevant rows based on light type
    if (light instanceof THREE.PointLight || light instanceof THREE.SpotLight) {
      if (distanceRow) {
        distanceRow.style.display = 'flex';
        const dist = document.getElementById('light-distance') as HTMLInputElement;
        const distS = document.getElementById('light-distance-slider') as HTMLInputElement;
        if (dist) dist.value = (light as THREE.PointLight).distance.toFixed(1);
        if (distS) distS.value = (light as THREE.PointLight).distance.toFixed(1);
      }
    }

    if (light instanceof THREE.SpotLight) {
      if (angleRow) {
        angleRow.style.display = 'flex';
        const angle = document.getElementById('light-angle') as HTMLInputElement;
        const angleS = document.getElementById('light-angle-slider') as HTMLInputElement;
        if (angle) angle.value = THREE.MathUtils.radToDeg((light as THREE.SpotLight).angle).toFixed(0);
        if (angleS) angleS.value = THREE.MathUtils.radToDeg((light as THREE.SpotLight).angle).toFixed(0);
      }
      if (penumbraRow) {
        penumbraRow.style.display = 'flex';
        const pen = document.getElementById('light-penumbra') as HTMLInputElement;
        const penS = document.getElementById('light-penumbra-slider') as HTMLInputElement;
        if (pen) pen.value = (light as THREE.SpotLight).penumbra.toFixed(2);
        if (penS) penS.value = (light as THREE.SpotLight).penumbra.toFixed(2);
      }
      if (decayRow) {
        decayRow.style.display = 'flex';
        const decay = document.getElementById('light-decay') as HTMLInputElement;
        const decayS = document.getElementById('light-decay-slider') as HTMLInputElement;
        if (decay) decay.value = (light as THREE.SpotLight).decay.toFixed(1);
        if (decayS) decayS.value = (light as THREE.SpotLight).decay.toFixed(1);
      }
    }
  }

  readLightValues(): {
    color: number;
    intensity: number;
    distance?: number;
    angle?: number;
    penumbra?: number;
    decay?: number;
  } {
    const colorEl = document.getElementById('light-color') as HTMLInputElement;
    const intensityEl = document.getElementById('light-intensity') as HTMLInputElement;

    const result: any = {
      color: parseInt(colorEl?.value?.replace('#', '') || 'ffffff', 16),
      intensity: parseFloat(intensityEl?.value || '1'),
    };

    const distanceEl = document.getElementById('light-distance') as HTMLInputElement;
    if (distanceEl) result.distance = parseFloat(distanceEl.value);

    const angleEl = document.getElementById('light-angle') as HTMLInputElement;
    if (angleEl) result.angle = THREE.MathUtils.degToRad(parseFloat(angleEl.value));

    const penumbraEl = document.getElementById('light-penumbra') as HTMLInputElement;
    if (penumbraEl) result.penumbra = parseFloat(penumbraEl.value);

    const decayEl = document.getElementById('light-decay') as HTMLInputElement;
    if (decayEl) result.decay = parseFloat(decayEl.value);

    return result;
  }

  // -------------------------------------------------------------------------
  // Camera Properties
  // -------------------------------------------------------------------------

  private hideCameraProps(): void {
    document.getElementById('camera-properties')!.style.display = 'none';
  }

  private setupCameraListeners(): void {
    const update = () => this.callbacks.onCameraChange();

    document.getElementById('camera-fov')?.addEventListener('change', update);
    document.getElementById('camera-fov-slider')?.addEventListener('input', update);
    document.getElementById('camera-near')?.addEventListener('change', update);
    document.getElementById('camera-far')?.addEventListener('change', update);

    // Camera helper toggle
    const helperToggle = document.getElementById('camera-helper-toggle');
    helperToggle?.addEventListener('change', () => {
      const visible = (helperToggle as HTMLInputElement).checked;
      this.callbacks.onCameraHelperToggle?.(visible);
    });
  }

  populateCameraInputs(camera: THREE.PerspectiveCamera): void {
    const fov = document.getElementById('camera-fov') as HTMLInputElement;
    const fovS = document.getElementById('camera-fov-slider') as HTMLInputElement;
    const near = document.getElementById('camera-near') as HTMLInputElement;
    const far = document.getElementById('camera-far') as HTMLInputElement;
    const aspect = document.getElementById('camera-aspect') as HTMLElement;

    if (fov) fov.value = camera.fov.toFixed(1);
    if (fovS) fovS.value = camera.fov.toFixed(1);
    if (near) near.value = camera.near.toFixed(2);
    if (far) far.value = camera.far.toFixed(1);
    if (aspect) aspect.textContent = camera.aspect.toFixed(2);
  }

  /**
   * Update the camera helper toggle checkbox state
   */
  setCameraHelperToggle(visible: boolean): void {
    const helperToggle = document.getElementById('camera-helper-toggle') as HTMLInputElement;
    if (helperToggle) helperToggle.checked = visible;
  }

  readCameraValues(): { fov: number; near: number; far: number } {
    const fovEl = document.getElementById('camera-fov') as HTMLInputElement;
    const nearEl = document.getElementById('camera-near') as HTMLInputElement;
    const farEl = document.getElementById('camera-far') as HTMLInputElement;

    return {
      fov: parseFloat(fovEl?.value || '50'),
      near: parseFloat(nearEl?.value || '0.1'),
      far: parseFloat(farEl?.value || '1000'),
    };
  }
}
