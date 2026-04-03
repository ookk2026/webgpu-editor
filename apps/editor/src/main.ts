/**
 * STABLE: 2024-04-02
 * WebGPU Scene Editor - Main Entry Point
 * 
 * Architecture:
 * - UIManager: Controls overall UI layout and coordinates UI components
 * - ViewportManager: Handles 3D rendering, camera, and object interaction
 * - PostProcessingManager: Manages post-processing effects
 * - CommandManager: Handles undo/redo operations
 * - LightHelpers: Manages light visualization helpers
 * 
 * Each manager is responsible for a specific domain, making the codebase modular
 * and maintainable.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// Core managers
import {
  CommandManager,
  AddObjectCommand,
  RemoveObjectCommand,
  TransformCommand,
  MaterialChangeCommand,
} from './core/CommandManager';

// Post-processing
import { PostProcessingManager } from './post/PostProcessingManager';

// Viewport
import { ViewportManager } from './viewport/ViewportManager';
import { LightHelpers } from './viewport/LightHelpers';

// UI - UIManager is the main UI framework controller
import { UIManager } from './ui/UIManager';

// ============================================================================
// Main Editor Class
// ============================================================================

class Editor {
  // Core Three.js
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;

  // Managers
  private commandManager!: CommandManager;
  private postProcessing!: PostProcessingManager;
  private viewport!: ViewportManager;
  private lightHelpers!: LightHelpers;
  private ui!: UIManager;  // <-- Main UI Framework Controller

  // State
  private currentTransformCmd: TransformCommand | null = null;
  private currentMaterialCmd: MaterialChangeCommand | null = null;

  constructor() {
    this.init();
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  private init(): void {
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1e1e1e);
    this.scene.name = 'Scene';

    // Create camera
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    this.camera.position.set(5, 5, 10);
    this.camera.lookAt(0, 0, 0);
    this.camera.name = 'Main Camera';
    this.camera.userData.isDefaultCamera = true;

    // Initialize command manager
    this.commandManager = new CommandManager();

    // Initialize light helpers
    this.lightHelpers = new LightHelpers(this.scene);

    // Initialize viewport (3D rendering)
    this.viewport = new ViewportManager('viewport', {
      onSelect: (obj) => this.onObjectSelected(obj),
      onTransformStart: () => this.onTransformStart(),
      onTransformEnd: () => this.onTransformEnd(),
      onCameraChange: () => this.onViewportResize(),
    });
    this.viewport.init(this.scene, this.camera);

    // Initialize post-processing
    this.postProcessing = new PostProcessingManager(
      this.viewport.getRenderer()!,
      this.scene,
      this.camera
    );

    // Initialize UI Manager (Main UI Framework Controller)
    // All UI coordination goes through this manager
    this.ui = new UIManager({
      onUndo: () => this.commandManager.undo(),
      onRedo: () => this.commandManager.redo(),
      onAddCube: () => this.addCube(),
      onAddSphere: () => this.addSphere(),
      onAddPlane: () => this.addPlane(),
      onAddLight: (type) => this.addLight(type),
      onImportModel: () => this.triggerImport(),
      onDelete: () => this.deleteSelected(),
      onFocus: () => this.focusSelected(),
      onTransformModeChange: (mode) => this.viewport.setTransformMode(mode),
    });

    // Connect UI components to their data sources
    this.setupUIConnections();

    // Setup default scene
    this.setupDefaultScene();

    // Restore post-processing settings
    this.ui.getPostProcessingPanel().restoreSettings(this.postProcessing.getSettings());

    // Start render loop
    this.animate();

    // Hide loading overlay
    this.ui.hideLoading();

    // Set initial state
    this.viewport.attachObject(null);

    console.log('[Editor] Initialization complete');
  }

  /**
   * Connect UI components to their data sources.
   * This wires up the SceneTree, PropertyPanel, and PostProcessingPanel
   * to the actual scene data.
   */
  private setupUIConnections(): void {
    const sceneTree = this.ui.getSceneTree();
    const propertyPanel = this.ui.getPropertyPanel();
    const postProcessingPanel = this.ui.getPostProcessingPanel();

    // Connect SceneTree to scene
    sceneTree.setScene(this.scene);
    sceneTree.setTransformControls(this.viewport.getTransformControls()!);

    // Re-wire callbacks with proper context
    // NOTE: These callbacks are redefined here to maintain proper 'this' context
    Object.assign(sceneTree, {
      callbacks: {
        onSelect: (obj: THREE.Object3D) => this.onObjectSelected(obj),
        onToggleVisibility: () => sceneTree.refresh(),
        onToggleExpand: () => {},
      },
    });

    // Connect PropertyPanel callbacks
    Object.assign(propertyPanel, {
      callbacks: {
        onTransformChange: () => this.onTransformChange(),
        onMaterialChange: () => this.onMaterialChange(),
        onLightChange: () => this.onLightChange(),
        onCameraChange: () => this.onCameraChange(),
        onCameraHelperToggle: (visible: boolean) => {
          const selected = this.viewport.getSelectedObject();
          if (selected instanceof THREE.Camera) {
            this.viewport.setCameraHelperVisible(selected, visible);
          }
        },
      },
    });

    // Connect PostProcessingPanel to post-processing manager
    Object.assign(postProcessingPanel, {
      onSettingsChange: (settings: any) => this.postProcessing.updateSettings(settings),
      onHDRLoad: (url: string, filename: string, onLoad?: () => void, onError?: (e: any) => void) => {
        this.postProcessing.loadHDR(url, filename, onLoad, onError);
      },
    });
  }

  /**
   * Setup default scene with grid, lights, and camera.
   */
  private setupDefaultScene(): void {
    // Grid helper
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x333333);
    this.scene.add(gridHelper);

    // Default ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    ambientLight.name = 'Ambient Light';
    this.scene.add(ambientLight);

    // Default directional light
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 5);
    dirLight.name = 'Directional Light';
    this.scene.add(dirLight);

    // Add default camera to scene (no visual representation for default camera)
    this.scene.add(this.camera);
    // Don't create visual for default camera - it's the active camera
    // this.viewport.createCameraVisual(this.camera);

    // Refresh UI
    this.ui.getSceneTree().refresh();
    this.ui.updateStatusObjects(0);
  }

  // -------------------------------------------------------------------------
  // Render Loop
  // -------------------------------------------------------------------------

  private animate(): void {
    requestAnimationFrame(() => this.animate());

    // Update helpers
    this.lightHelpers.ensureAll(this.scene);
    this.lightHelpers.update();
    this.viewport.updateCameraVisuals();

    // Render viewport with post-processing
    this.viewport.render(() => this.postProcessing.render());
  }

  // -------------------------------------------------------------------------
  // Selection Handling
  // -------------------------------------------------------------------------

  private onObjectSelected(obj: THREE.Object3D | null): void {
    // Update viewport (camera helpers are hidden by default)
    this.viewport.attachObject(obj, false);

    // Update scene tree
    this.ui.getSceneTree().setSelectedObject(obj);

    // Update property panel
    if (obj) {
      this.ui.getPropertyPanel().showObjectProperties(obj);
      // Ensure camera helper toggle is unchecked when selecting a camera
      if (obj instanceof THREE.Camera) {
        this.ui.getPropertyPanel().setCameraHelperToggle(false);
      }
      this.ui.updateStatusMode(`选中: ${obj.name || obj.type}`);
    } else {
      this.ui.getPropertyPanel().showNoSelection();
      this.ui.updateStatusMode('就绪');
    }
  }

  // -------------------------------------------------------------------------
  // Transform Operations
  // -------------------------------------------------------------------------

  private onTransformStart(): void {
    const obj = this.viewport.getSelectedObject();
    if (!obj) return;

    this.currentTransformCmd = new TransformCommand(obj, {
      updateTransformInputs: (o) => this.ui.getPropertyPanel().updateTransformInputs(o),
    });
  }

  private onTransformEnd(): void {
    if (!this.currentTransformCmd) return;

    this.currentTransformCmd.setNewState();
    this.commandManager.execute(this.currentTransformCmd);
    this.currentTransformCmd = null;
  }

  private onTransformChange(): void {
    const obj = this.viewport['selectedObject'] as THREE.Object3D;
    if (!obj) return;

    const values = this.ui.getPropertyPanel().readTransformValues();
    obj.position.copy(values.position);
    obj.rotation.copy(values.rotation);
    obj.scale.copy(values.scale);
  }

  // -------------------------------------------------------------------------
  // Material Operations
  // -------------------------------------------------------------------------

  private onMaterialChange(): void {
    const obj = this.viewport.getSelectedObject();
    if (!obj || !(obj instanceof THREE.Mesh)) return;

    const mat = obj.material as THREE.MeshStandardMaterial;
    if (!mat) return;

    if (!this.currentMaterialCmd) {
      this.currentMaterialCmd = new MaterialChangeCommand(mat);
    }

    const values = this.ui.getPropertyPanel().readMaterialValues();
    mat.color.setHex(values.color);
    mat.roughness = values.roughness;
    mat.metalness = values.metalness;
    mat.wireframe = values.wireframe;
    mat.opacity = values.opacity;
    mat.transparent = values.opacity < 1;

    this.currentMaterialCmd.setNewState();
    this.commandManager.execute(this.currentMaterialCmd);
    this.currentMaterialCmd = null;
  }

  // -------------------------------------------------------------------------
  // Light Operations
  // -------------------------------------------------------------------------

  private onLightChange(): void {
    const obj = this.viewport.getSelectedObject();
    if (!obj || !(obj instanceof THREE.Light)) return;

    const values = this.ui.getPropertyPanel().readLightValues();
    obj.color.setHex(values.color);
    obj.intensity = values.intensity;

    if ((obj instanceof THREE.PointLight || obj instanceof THREE.SpotLight) && values.distance !== undefined) {
      obj.distance = values.distance;
    }

    if (obj instanceof THREE.SpotLight) {
      if (values.angle !== undefined) obj.angle = values.angle;
      if (values.penumbra !== undefined) obj.penumbra = values.penumbra;
      if (values.decay !== undefined) obj.decay = values.decay;
    }
  }

  // -------------------------------------------------------------------------
  // Camera Operations
  // -------------------------------------------------------------------------

  private onCameraChange(): void {
    const obj = this.viewport.getSelectedObject();
    if (!obj || !(obj instanceof THREE.PerspectiveCamera)) return;

    const values = this.ui.getPropertyPanel().readCameraValues();
    obj.fov = values.fov;
    obj.near = values.near;
    obj.far = values.far;
    obj.updateProjectionMatrix();
  }

  // -------------------------------------------------------------------------
  // Object Management
  // -------------------------------------------------------------------------

  private addObject(obj: THREE.Object3D): void {
    this.commandManager.execute(
      new AddObjectCommand(this.scene, obj, {
        refreshSceneTree: () => {
          this.ui.getSceneTree().refresh();
          this.updateObjectCount();
        },
        selectObject: (o) => this.onObjectSelected(o),
      })
    );
    this.onObjectSelected(obj);
  }

  private deleteSelected(): void {
    const obj = this.viewport.getSelectedObject();
    if (!obj) return;

    // Protect default camera
    if (obj instanceof THREE.Camera && obj.userData.isDefaultCamera) {
      console.log('[Editor] Cannot delete protected object');
      return;
    }

    this.commandManager.execute(
      new RemoveObjectCommand(this.scene, obj, {
        refreshSceneTree: () => {
          this.ui.getSceneTree().refresh();
          this.updateObjectCount();
        },
        selectObject: (o) => this.onObjectSelected(o),
      })
    );
  }

  private focusSelected(): void {
    const obj = this.viewport.getSelectedObject();
    if (obj) this.viewport.focusOnObject(obj);
  }

  private updateObjectCount(): void {
    let count = 0;
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Light || o instanceof THREE.Camera) {
        count++;
      }
    });
    this.ui.updateStatusObjects(count);
  }

  // -------------------------------------------------------------------------
  // Object Creation
  // -------------------------------------------------------------------------

  private addCube(): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x4caf50 })
    );
    mesh.position.set(0, 0.5, 0);
    mesh.name = `Cube ${this.getObjectCount('Cube') + 1}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.addObject(mesh);
  }

  private addSphere(): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 32, 16),
      new THREE.MeshStandardMaterial({ color: 0x2196f3 })
    );
    mesh.position.set(0, 0.5, 0);
    mesh.name = `Sphere ${this.getObjectCount('Sphere') + 1}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.addObject(mesh);
  }

  private addPlane(): void {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshStandardMaterial({ color: 0xff9800, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.name = `Plane ${this.getObjectCount('Plane') + 1}`;
    mesh.receiveShadow = true;
    this.addObject(mesh);
  }

  private addLight(type: 'ambient' | 'directional' | 'point' | 'spot' | 'hemisphere'): void {
    let light: THREE.Light;
    let name: string;

    switch (type) {
      case 'ambient':
        light = new THREE.AmbientLight(0xffffff, 0.5);
        name = `Ambient Light ${this.getObjectCount('Ambient Light') + 1}`;
        break;
      case 'directional':
        light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(2, 4, 2);
        name = `Directional Light ${this.getObjectCount('Directional Light') + 1}`;
        break;
      case 'point':
        light = new THREE.PointLight(0xffffff, 1, 100);
        light.position.set(0, 2, 0);
        name = `Point Light ${this.getObjectCount('Point Light') + 1}`;
        break;
      case 'spot': {
        const spot = new THREE.SpotLight(0xffffff, 1);
        spot.position.set(0, 5, 0);
        spot.angle = Math.PI / 6;
        spot.penumbra = 0.2;
        spot.distance = 10;
        spot.target.position.set(0, 0, 0);
        this.scene.add(spot.target);
        light = spot;
        name = `Spot Light ${this.getObjectCount('Spot Light') + 1}`;
        break;
      }
      case 'hemisphere':
        light = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
        name = `Hemisphere Light ${this.getObjectCount('Hemisphere Light') + 1}`;
        break;
      default:
        return;
    }

    light.name = name;
    this.addObject(light);
  }

  private getObjectCount(prefix: string): number {
    let count = 0;
    this.scene.traverse((o) => {
      if (o.name?.startsWith(prefix)) count++;
    });
    return count;
  }

  // -------------------------------------------------------------------------
  // Import
  // -------------------------------------------------------------------------

  private triggerImport(): void {
    const fileInput = document.getElementById('model-input') as HTMLInputElement;
    fileInput?.click();

    fileInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.importModel(file);
      fileInput.value = '';
    }, { once: true });
  }

  private importModel(file: File): void {
    const url = URL.createObjectURL(file);
    const ext = file.name.split('.').pop()?.toLowerCase();

    const onLoad = (obj: THREE.Object3D) => {
      obj.position.set(0, 0, 0);
      obj.name = file.name.split('.')[0];
      this.addObject(obj);
      URL.revokeObjectURL(url);
      console.log('[Editor] Imported:', file.name);
    };

    const onError = (err: any) => {
      console.error('[Editor] Import error:', err);
      alert('导入失败: ' + file.name);
    };

    if (ext === 'obj') {
      new OBJLoader().load(url, onLoad, undefined, onError);
    } else if (ext === 'gltf' || ext === 'glb') {
      new GLTFLoader().load(url, (g) => onLoad(g.scene), undefined, onError);
    } else if (ext === 'fbx') {
      new FBXLoader().load(url, onLoad, undefined, onError);
    } else {
      alert('不支持的格式: ' + ext);
    }
  }

  // -------------------------------------------------------------------------
  // Event Handlers
  // -------------------------------------------------------------------------

  private onViewportResize(): void {
    const size = this.ui.getViewportSize();
    this.postProcessing.resize(size.width, size.height);
  }

  // -------------------------------------------------------------------------
  // Draggable Panel Mode (Public API)
  // -------------------------------------------------------------------------

  /**
   * Enable draggable panel mode - panels can be dragged to reposition
   * Shortcut: Shift+D
   */
  enableDraggableMode(): void {
    this.ui.enableDraggableMode();
  }

  /**
   * Disable draggable panel mode - panels return to docked positions
   * Shortcut: Shift+D
   */
  disableDraggableMode(): void {
    this.ui.disableDraggableMode();
  }

  /**
   * Toggle draggable panel mode
   * Shortcut: Shift+D
   */
  toggleDraggableMode(): void {
    this.ui.toggleDraggableMode();
  }

  /**
   * Check if currently using responsive layout
   */
  isResponsiveLayout(): boolean {
    return this.ui.isResponsiveLayout();
  }
}

// ============================================================================
// Entry Point
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  const editor = new Editor();
  
  // Expose editor to window for debugging and console access
  (window as any).editor = editor;
});
