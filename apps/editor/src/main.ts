/**
 * STABLE: 2024-04-02
 * WebGPU Scene Editor - Main Entry Point
 * 
 * This is the main entry point that initializes all modules:
 * - CommandManager: Undo/redo system
 * - PostProcessingManager: Post-processing effects
 * - ViewportManager: 3D viewport rendering and controls
 * - SceneTree: Scene hierarchy UI
 * - PropertyPanel: Object properties UI
 * - PostProcessingPanel: Post-processing settings UI
 * - LightHelpers: Light visualization helpers
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// Core modules
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
import { ViewportManager, TransformMode } from './viewport/ViewportManager';
import { LightHelpers } from './viewport/LightHelpers';

// UI
import { SceneTree } from './ui/SceneTree';
import { PropertyPanel } from './ui/PropertyPanel';
import { PostProcessingPanel } from './ui/PostProcessingPanel';

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

  // UI
  private sceneTree!: SceneTree;
  private propertyPanel!: PropertyPanel;
  private postProcessingPanel!: PostProcessingPanel;

  // State
  private selectedObject: THREE.Object3D | null = null;
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

    // Initialize managers
    this.commandManager = new CommandManager();
    this.lightHelpers = new LightHelpers(this.scene);

    // Initialize viewport
    this.viewport = new ViewportManager('viewport', {
      onSelect: (obj) => this.selectObject(obj),
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

    // Initialize UI
    this.sceneTree = new SceneTree('scene-tree', {
      onSelect: (obj) => this.selectObject(obj),
      onToggleVisibility: (obj) => this.onToggleVisibility(obj),
      onToggleExpand: () => {},
    });
    this.sceneTree.setScene(this.scene);
    this.sceneTree.setTransformControls(this.viewport.getTransformControls()!);

    this.propertyPanel = new PropertyPanel({
      onTransformChange: () => this.onTransformChange(),
      onMaterialChange: () => this.onMaterialChange(),
      onLightChange: () => this.onLightChange(),
      onCameraChange: () => this.onCameraChange(),
    });

    this.postProcessingPanel = new PostProcessingPanel(
      (settings) => this.postProcessing.updateSettings(settings),
      (url, filename, onLoad, onError) => this.postProcessing.loadHDR(url, filename, onLoad, onError)
    );

    // Setup scene
    this.setupScene();

    // Setup UI event listeners
    this.setupUIListeners();
    this.setupKeyboardShortcuts();
    this.setupToolbar();
    this.setupModelDropdown();

    // Restore post-processing settings
    this.postProcessingPanel.restoreSettings(this.postProcessing.getSettings());

    // Start render loop
    this.animate();

    // Hide loading overlay
    document.querySelectorAll('#overlay').forEach((el) => {
      el.classList.add('hidden');
      (el as HTMLElement).style.display = 'none';
    });

    // Ensure nothing is selected on startup
    this.selectObject(null);

    console.log('[Editor] Initialization complete');
  }

  private setupScene(): void {
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

    // Add default camera to scene (with visual)
    this.scene.add(this.camera);
    this.viewport.createCameraVisual(this.camera);

    // Refresh scene tree
    this.sceneTree.refresh();
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

    // Render viewport
    this.viewport.render(() => this.postProcessing.render());
  }

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------

  selectObject(obj: THREE.Object3D | null): void {
    this.selectedObject = obj;
    this.viewport.attachObject(obj);
    this.sceneTree.setSelectedObject(obj);

    if (obj) {
      this.propertyPanel.showObjectProperties(obj);
    } else {
      this.propertyPanel.showNoSelection();
    }
  }

  // -------------------------------------------------------------------------
  // Transform Operations
  // -------------------------------------------------------------------------

  private onTransformStart(): void {
    if (!this.selectedObject) return;
    this.currentTransformCmd = new TransformCommand(this.selectedObject, {
      updateTransformInputs: (obj) => this.propertyPanel.updateTransformInputs(obj),
    });
  }

  private onTransformEnd(): void {
    if (!this.currentTransformCmd || !this.selectedObject) return;
    this.currentTransformCmd.setNewState();
    this.commandManager.execute(this.currentTransformCmd);
    this.currentTransformCmd = null;
  }

  private onTransformChange(): void {
    if (!this.selectedObject) return;
    const values = this.propertyPanel.readTransformValues();
    this.selectedObject.position.copy(values.position);
    this.selectedObject.rotation.copy(values.rotation);
    this.selectedObject.scale.copy(values.scale);
  }

  // -------------------------------------------------------------------------
  // Material Operations
  // -------------------------------------------------------------------------

  private onMaterialChange(): void {
    if (!this.selectedObject || !(this.selectedObject instanceof THREE.Mesh)) return;

    const mesh = this.selectedObject;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat) return;

    if (!this.currentMaterialCmd) {
      this.currentMaterialCmd = new MaterialChangeCommand(mat);
    }

    const values = this.propertyPanel.readMaterialValues();
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
    if (!this.selectedObject || !(this.selectedObject instanceof THREE.Light)) return;

    const values = this.propertyPanel.readLightValues();
    const light = this.selectedObject;

    light.color.setHex(values.color);
    light.intensity = values.intensity;

    if (light instanceof THREE.PointLight || light instanceof THREE.SpotLight) {
      if (values.distance !== undefined) light.distance = values.distance;
    }

    if (light instanceof THREE.SpotLight) {
      if (values.angle !== undefined) light.angle = values.angle;
      if (values.penumbra !== undefined) light.penumbra = values.penumbra;
      if (values.decay !== undefined) light.decay = values.decay;
    }
  }

  // -------------------------------------------------------------------------
  // Camera Operations
  // -------------------------------------------------------------------------

  private onCameraChange(): void {
    if (!this.selectedObject || !(this.selectedObject instanceof THREE.PerspectiveCamera)) return;

    const values = this.propertyPanel.readCameraValues();
    const camera = this.selectedObject;

    camera.fov = values.fov;
    camera.near = values.near;
    camera.far = values.far;
    camera.updateProjectionMatrix();

    // Update helper
    const helper = this.viewport['cameraHelpers'].get(camera.uuid);
    if (helper) helper.update();
  }

  // -------------------------------------------------------------------------
  // Object Management
  // -------------------------------------------------------------------------

  private addObject(obj: THREE.Object3D): void {
    this.commandManager.execute(
      new AddObjectCommand(this.scene, obj, {
        refreshSceneTree: () => this.sceneTree.refresh(),
        selectObject: (o) => this.selectObject(o),
      })
    );
    this.selectObject(obj);
  }

  private deleteSelected(): void {
    if (!this.selectedObject) return;
    if (this.selectedObject instanceof THREE.Camera && this.selectedObject.userData.isDefaultCamera) {
      console.log('[Editor] Cannot delete protected object');
      return;
    }

    this.commandManager.execute(
      new RemoveObjectCommand(this.scene, this.selectedObject, {
        refreshSceneTree: () => this.sceneTree.refresh(),
        selectObject: (o) => this.selectObject(o),
      })
    );
    console.log('[Editor] Deleted object');
  }

  private onToggleVisibility(obj: THREE.Object3D): void {
    // Visibility is toggled by SceneTree, just refresh
    this.sceneTree.refresh();
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
    console.log('[Editor] Added cube');
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
    console.log('[Editor] Added sphere');
  }

  private addPlane(): void {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshStandardMaterial({ color: 0xff9800, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0, 0);
    mesh.name = `Plane ${this.getObjectCount('Plane') + 1}`;
    mesh.receiveShadow = true;
    this.addObject(mesh);
    console.log('[Editor] Added plane');
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
      case 'spot':
        const spotLight = new THREE.SpotLight(0xffffff, 1);
        spotLight.position.set(0, 5, 0);
        spotLight.angle = Math.PI / 6;
        spotLight.penumbra = 0.2;
        spotLight.distance = 10;
        spotLight.target.position.set(0, 0, 0);
        this.scene.add(spotLight.target);
        light = spotLight;
        name = `Spot Light ${this.getObjectCount('Spot Light') + 1}`;
        break;
      case 'hemisphere':
        light = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
        name = `Hemisphere Light ${this.getObjectCount('Hemisphere Light') + 1}`;
        break;
      default:
        return;
    }

    light.name = name;
    this.addObject(light);
    console.log('[Editor] Added light:', name);
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
      alert('Failed to import: ' + file.name);
    };

    if (ext === 'obj') {
      new OBJLoader().load(url, onLoad, undefined, onError);
    } else if (ext === 'gltf' || ext === 'glb') {
      new GLTFLoader().load(url, (g) => onLoad(g.scene), undefined, onError);
    } else if (ext === 'fbx') {
      new FBXLoader().load(url, onLoad, undefined, onError);
    } else {
      alert('Unsupported format: ' + ext);
    }
  }

  // -------------------------------------------------------------------------
  // UI Setup
  // -------------------------------------------------------------------------

  private setupUIListeners(): void {
    // Transform toolbar
    document.getElementById('tool-translate')?.addEventListener('click', () => {
      this.viewport.setTransformMode('translate');
      this.updateToolbarState();
    });
    document.getElementById('tool-rotate')?.addEventListener('click', () => {
      this.viewport.setTransformMode('rotate');
      this.updateToolbarState();
    });
    document.getElementById('tool-scale')?.addEventListener('click', () => {
      this.viewport.setTransformMode('scale');
      this.updateToolbarState();
    });

    // Undo/Redo
    document.getElementById('btn-undo')?.addEventListener('click', () => this.commandManager.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => this.commandManager.redo());

    // Import
    const importBtn = document.getElementById('btn-import-model');
    const fileInput = document.getElementById('model-input') as HTMLInputElement;
    importBtn?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.importModel(file);
      fileInput.value = '';
    });
  }

  private setupToolbar(): void {
    // Light buttons
    document.getElementById('btn-add-ambient')?.addEventListener('click', () => this.addLight('ambient'));
    document.getElementById('btn-add-directional')?.addEventListener('click', () => this.addLight('directional'));
    document.getElementById('btn-add-point')?.addEventListener('click', () => this.addLight('point'));
  }

  private setupModelDropdown(): void {
    const cubeBtn = document.getElementById('btn-add-cube');
    const sphereBtn = document.getElementById('btn-add-sphere');

    if (!cubeBtn || !cubeBtn.parentElement) return;

    const parent = cubeBtn.parentElement;

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.style.cssText = 'position: relative; display: inline-block;';
    dropdown.innerHTML = `
      <button id="btn-create-model" class="primary" style="padding: 6px 12px; background: #0e639c; color: #e0e0e0; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">+ 创建模型 ▼</button>
      <div id="model-dropdown-menu" style="display: none; position: absolute; top: 100%; left: 0; background: #3c3c3c; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); z-index: 1000; min-width: 120px; margin-top: 4px;">
        <div class="dropdown-model-item" data-type="cube" style="padding: 8px 12px; cursor: pointer; color: #e0e0e0; font-size: 12px; border-radius: 4px 4px 0 0;">□ 立方体</div>
        <div class="dropdown-model-item" data-type="sphere" style="padding: 8px 12px; cursor: pointer; color: #e0e0e0; font-size: 12px;">○ 球体</div>
        <div class="dropdown-model-item" data-type="plane" style="padding: 8px 12px; cursor: pointer; color: #e0e0e0; font-size: 12px; border-radius: 0 0 4px 4px;">▭ 平面</div>
      </div>
    `;

    // Hide original buttons
    cubeBtn.style.display = 'none';
    if (sphereBtn) sphereBtn.style.display = 'none';

    parent.insertBefore(dropdown, cubeBtn);

    // Setup dropdown behavior
    const btn = dropdown.querySelector('#btn-create-model');
    const menu = dropdown.querySelector('#model-dropdown-menu') as HTMLElement;

    btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', () => {
      menu.style.display = 'none';
    });

    dropdown.querySelectorAll('.dropdown-model-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = (e.currentTarget as HTMLElement).dataset.type;
        if (type === 'cube') this.addCube();
        else if (type === 'sphere') this.addSphere();
        else if (type === 'plane') this.addPlane();
        menu.style.display = 'none';
      });

      item.addEventListener('mouseenter', () => {
        (item as HTMLElement).style.background = '#4c4c4c';
      });
      item.addEventListener('mouseleave', () => {
        (item as HTMLElement).style.background = 'transparent';
      });
    });
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case 't':
          this.viewport.setTransformMode('translate');
          this.updateToolbarState();
          break;
        case 'r':
          this.viewport.setTransformMode('rotate');
          this.updateToolbarState();
          break;
        case 's':
          this.viewport.setTransformMode('scale');
          this.updateToolbarState();
          break;
        case 'f':
          if (this.selectedObject) this.viewport.focusOnObject(this.selectedObject);
          break;
        case 'delete':
        case 'backspace':
          this.deleteSelected();
          break;
        case '+':
        case '=':
          this.viewport.adjustGizmoSize(0.1);
          break;
        case '-':
        case '_':
          this.viewport.adjustGizmoSize(-0.1);
          break;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          e.shiftKey ? this.commandManager.redo() : this.commandManager.undo();
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          this.commandManager.redo();
        }
      }
    });
  }

  private updateToolbarState(): void {
    const mode = this.viewport.getTransformMode();
    document.getElementById('tool-translate')?.classList.toggle('active', mode === 'translate');
    document.getElementById('tool-rotate')?.classList.toggle('active', mode === 'rotate');
    document.getElementById('tool-scale')?.classList.toggle('active', mode === 'scale');
  }

  private onViewportResize(): void {
    const size = this.viewport.getSize();
    this.postProcessing.resize(size.width, size.height);
  }
}

// ============================================================================
// Entry Point
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  new Editor();
});
