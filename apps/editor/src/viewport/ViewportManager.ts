/**
 * STABLE: 2024-04-02
 * Viewport Manager
 * 
 * Manages the 3D viewport including:
 * - Renderer setup and rendering loop
 * - Camera controls (OrbitControls)
 * - Transform controls (TransformControls)
 * - Object selection via raycasting
 * - Camera visualization helpers
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

// ============================================================================
// Types
// ============================================================================

export interface ViewportCallbacks {
  onSelect: (obj: THREE.Object3D | null) => void;
  onTransformStart: () => void;
  onTransformEnd: () => void;
  onCameraChange: () => void;
}

export type TransformMode = 'translate' | 'rotate' | 'scale';

// ============================================================================
// Viewport Manager
// ============================================================================

export class ViewportManager {
  // Three.js core
  private renderer: THREE.WebGLRenderer | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private scene: THREE.Scene | null = null;

  // Controls
  private orbitControls: OrbitControls | null = null;
  private transformControls: TransformControls | null = null;

  // DOM
  private container: HTMLElement;

  // State
  private isDragging = false;
  private gizmoSize = 0.6;
  private transformMode: TransformMode = 'translate';
  private mouse = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private callbacks: ViewportCallbacks;

  // Selection
  private selectedObject: THREE.Object3D | null = null;
  private selectedCamera: THREE.Camera | null = null;

  // Camera visuals
  private cameraVisuals = new Map<string, THREE.Object3D>();
  private cameraHelpers = new Map<string, THREE.CameraHelper>();

  // Animation
  private isCameraAnimating = false;
  private camAnim = {
    startPos: new THREE.Vector3(),
    targetPos: new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
    endTarget: new THREE.Vector3(),
    startTime: 0,
    duration: 500,
  };

  constructor(containerId: string, callbacks: ViewportCallbacks) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`ViewportManager: Container #${containerId} not found`);
    }
    this.container = container;
    this.callbacks = callbacks;
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  init(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.scene = scene;
    this.camera = camera;

    // Setup renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x1e1e1e);
    // NOTE: Disabled due to color rendering issues with post-processing
    // this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.container.appendChild(this.renderer.domElement);

    // Ensure all camera helpers are hidden initially
    // Use timeout to ensure this runs after all objects are created
    setTimeout(() => this.hideAllCameraHelpers(), 100);

    // Setup orbit controls
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;

    // Setup transform controls
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setMode(this.transformMode);
    this.transformControls.setSize(this.gizmoSize);
    this.scene.add(this.transformControls);

    // Setup event listeners
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.transformControls || !this.renderer) return;

    // Transform dragging events
    this.transformControls.addEventListener('dragging-changed', (e: any) => {
      this.isDragging = e.value as boolean;
      if (this.orbitControls) {
        this.orbitControls.enabled = !this.isDragging;
      }

      if (this.isDragging) {
        this.callbacks.onTransformStart();
      } else {
        this.callbacks.onTransformEnd();
      }
    });

    // Transform change events
    this.transformControls.addEventListener('change', () => {
      // Handled by caller
    });

    // Pointer events for selection
    this.renderer.domElement.addEventListener('pointerdown', (e) => this.handlePointerDown(e), {
      capture: false,
    });

    // Resize handling
    window.addEventListener('resize', () => this.handleResize());
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  render(postProcessingRender?: () => void): void {
    if (!this.renderer || !this.scene || !this.camera) return;

    this.orbitControls?.update();

    // Update camera animation
    if (this.isCameraAnimating) {
      this.updateCameraAnimation();
    }

    // Render
    if (postProcessingRender) {
      postProcessingRender();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------

  private handlePointerDown(e: PointerEvent): void {
    if (this.isDragging || !this.renderer || !this.camera || !this.scene) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // Delay to let TransformControls process the event first
    setTimeout(() => {
      if (this.isDragging || (this.transformControls as any)?.axis !== null) return;

      this.raycaster.setFromCamera(this.mouse, this.camera!);

      const objs: THREE.Object3D[] = [];
      this.scene!.traverse((o) => {
        if (this.isSelectable(o)) objs.push(o);
      });

      const hits = this.raycaster.intersectObjects(objs, false);

      if (hits.length > 0) {
        let target = hits[0].object;
        while (
          target.parent &&
          target.parent !== this.scene &&
          !(target.parent instanceof THREE.GridHelper)
        ) {
          target = target.parent;
        }
        this.callbacks.onSelect(target);
      } else {
        this.callbacks.onSelect(null);
      }
    }, 5);
  }

  private isSelectable(obj: THREE.Object3D): boolean {
    if (!obj.visible) return false;

    // Check if it's a child of transform controls
    let p = obj.parent;
    while (p) {
      if (p === this.transformControls) return false;
      p = p.parent;
    }

    // Exclude helpers and visual indicators
    if (obj instanceof THREE.GridHelper) return false;
    if (obj instanceof THREE.AxesHelper) return false;
    if (obj instanceof THREE.CameraHelper) return false;
    if (obj.name?.endsWith('_helper')) return false;
    if (obj.name?.endsWith('_visual')) return false;

    return true;
  }

  // -------------------------------------------------------------------------
  // Transform Controls
  // -------------------------------------------------------------------------

  attachObject(obj: THREE.Object3D | null, showCameraHelper = false): void {
    this.selectedObject = obj;
    if (!this.transformControls) return;

    // Hide all camera helpers first
    this.cameraHelpers.forEach((helper) => (helper.visible = false));
    this.selectedCamera = null;

    if (obj) {
      this.transformControls.attach(obj);
      this.transformControls.visible = true;
      this.transformControls.setSize(this.gizmoSize);

      // Show camera helper if selecting a camera and showCameraHelper is true
      if (obj instanceof THREE.Camera) {
        const helper = this.cameraHelpers.get(obj.uuid);
        if (helper) {
          helper.visible = showCameraHelper;
          this.selectedCamera = obj;
        }
      }
    } else {
      this.transformControls.detach();
      this.transformControls.visible = false;
    }
  }

  setTransformMode(mode: TransformMode): void {
    this.transformMode = mode;
    this.transformControls?.setMode(mode);
  }

  getTransformMode(): TransformMode {
    return this.transformMode;
  }

  adjustGizmoSize(delta: number): void {
    this.gizmoSize = Math.max(0.1, Math.min(2.0, this.gizmoSize + delta));
    this.transformControls?.setSize(this.gizmoSize);
  }

  /**
   * Check if the camera helper is visible for a specific camera
   */
  isCameraHelperVisible(camera: THREE.Camera): boolean {
    const helper = this.cameraHelpers.get(camera.uuid);
    return helper ? helper.visible : false;
  }

  /**
   * Set the visibility of a camera helper
   */
  setCameraHelperVisible(camera: THREE.Camera, visible: boolean): void {
    const helper = this.cameraHelpers.get(camera.uuid);
    if (helper) {
      helper.visible = visible;
    }
  }

  /**
   * Hide all camera helpers
   */
  hideAllCameraHelpers(): void {
    this.cameraHelpers.forEach((helper) => {
      helper.visible = false;
    });
  }

  // -------------------------------------------------------------------------
  // Camera Animation
  // -------------------------------------------------------------------------

  focusOnObject(obj: THREE.Object3D): void {
    if (!this.camera || !this.orbitControls) return;

    const target = new THREE.Vector3();
    obj.getWorldPosition(target);

    const offset = new THREE.Vector3(3, 3, 5);
    const newPos = target.clone().add(offset);

    this.animateCameraTo(newPos, target);
  }

  private animateCameraTo(targetPos: THREE.Vector3, lookAt: THREE.Vector3): void {
    if (!this.camera || !this.orbitControls) return;

    this.isCameraAnimating = true;
    this.camAnim.startPos.copy(this.camera.position);
    this.camAnim.startTarget.copy(this.orbitControls.target);
    this.camAnim.targetPos.copy(targetPos);
    this.camAnim.endTarget.copy(lookAt);
    this.camAnim.startTime = Date.now();
  }

  private updateCameraAnimation(): void {
    if (!this.camera || !this.orbitControls) return;

    const t = Math.min((Date.now() - this.camAnim.startTime) / this.camAnim.duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);

    this.camera.position.lerpVectors(this.camAnim.startPos, this.camAnim.targetPos, eased);
    this.orbitControls.target.lerpVectors(this.camAnim.startTarget, this.camAnim.endTarget, eased);

    if (t >= 1) this.isCameraAnimating = false;
  }

  // -------------------------------------------------------------------------
  // Camera Visualization
  // -------------------------------------------------------------------------

  createCameraVisual(camera: THREE.Camera): void {
    if (!this.scene) return;

    // Camera icon (box + arrow)
    const group = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(0.3, 0.2, 0.3);
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0x888888, wireframe: true });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    const arrowGeo = new THREE.ConeGeometry(0.08, 0.2, 4);
    arrowGeo.rotateX(-Math.PI / 2);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x0e639c, wireframe: true });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.z = -0.25;
    group.add(arrow);

    group.name = camera.name + '_visual';
    group.position.copy(camera.position);
    group.rotation.copy(camera.rotation);
    this.scene.add(group);
    this.cameraVisuals.set(camera.uuid, group);

    // CameraHelper - hidden by default
    const helper = new THREE.CameraHelper(camera);
    helper.name = camera.name + '_helper';
    helper.visible = false;
    this.scene.add(helper);
    this.cameraHelpers.set(camera.uuid, helper);
  }

  updateCameraVisuals(): void {
    this.cameraVisuals.forEach((visual, uuid) => {
      const camera = this.scene?.getObjectByProperty('uuid', uuid) as THREE.Camera;
      if (camera) {
        visual.visible = camera.visible;
        visual.position.copy(camera.position);
        visual.rotation.copy(camera.rotation);
      }
    });

    this.cameraHelpers.forEach((helper, uuid) => {
      const camera = this.scene?.getObjectByProperty('uuid', uuid) as THREE.Camera;
      if (camera && helper.visible) {
        helper.update();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Resize Handling
  // -------------------------------------------------------------------------

  private handleResize(): void {
    if (!this.renderer || !this.camera) return;

    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);

    // Notify caller for post-processing resize
    this.callbacks.onCameraChange();
  }

  getSize(): { width: number; height: number } {
    return {
      width: this.container.clientWidth,
      height: this.container.clientHeight,
    };
  }

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------

  getRenderer(): THREE.WebGLRenderer | null {
    return this.renderer;
  }

  getTransformControls(): TransformControls | null {
    return this.transformControls;
  }

  getSelectedObject(): THREE.Object3D | null {
    return this.selectedObject;
  }

  isTransformDragging(): boolean {
    return this.isDragging;
  }
}
