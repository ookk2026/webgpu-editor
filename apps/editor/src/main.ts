import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

// Minimal Editor Implementation
class Editor {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private orbitControls!: OrbitControls;
  private transformControls!: TransformControls;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private gridHelper!: THREE.GridHelper;
  
  // State
  private selectedObject: THREE.Object3D | null = null;
  private transformMode: 'translate' | 'rotate' | 'scale' = 'translate';
  private isDragging = false;
  
  // DOM Elements
  private viewport: HTMLElement;
  private sceneTree: HTMLElement;
  private propertiesPanel: HTMLElement;
  private noSelectionMsg: HTMLElement;
  private transformProps: HTMLElement;

  constructor() {
    this.viewport = document.getElementById('viewport')!;
    this.sceneTree = document.getElementById('scene-tree')!;
    this.propertiesPanel = document.getElementById('properties')!;
    this.noSelectionMsg = document.getElementById('no-selection')!;
    this.transformProps = document.getElementById('transform-properties')!;

    this.init();
    this.setupUI();
    this.setupEventListeners();
    this.animate();
  }

  private init(): void {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1e1e1e);
    this.scene.name = 'Scene';

    // Camera - positioned to see origin
    this.camera = new THREE.PerspectiveCamera(
      50,
      this.viewport.clientWidth / this.viewport.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(5, 5, 10);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.viewport.clientWidth, this.viewport.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.viewport.appendChild(this.renderer.domElement);

    // Orbit Controls
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.target.set(0, 0, 0);

    // Transform Controls
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setMode('translate');
    this.transformControls.setSize(1.2);
    this.scene.add(this.transformControls);

    // Grid Helper
    this.gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x333333);
    this.scene.add(this.gridHelper);

    // Default Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    ambientLight.name = 'Ambient Light';
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 5);
    dirLight.name = 'Directional Light';
    this.scene.add(dirLight);

    // Hide loading overlay
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.classList.add('hidden');

    console.log('[Editor] Initialized');
  }

  private animate(): void {
    requestAnimationFrame(() => this.animate());
    
    this.orbitControls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private setupUI(): void {
    // Transform mode buttons
    document.getElementById('tool-translate')?.addEventListener('click', () => {
      this.setTransformMode('translate');
    });
    document.getElementById('tool-rotate')?.addEventListener('click', () => {
      this.setTransformMode('rotate');
    });
    document.getElementById('tool-scale')?.addEventListener('click', () => {
      this.setTransformMode('scale');
    });

    // Add cube button
    document.getElementById('btn-add-cube')?.addEventListener('click', () => {
      this.addCube();
    });

    // Add sphere button
    document.getElementById('btn-add-sphere')?.addEventListener('click', () => {
      this.addSphere();
    });

    // Property inputs
    const inputIds = ['pos-x', 'pos-y', 'pos-z', 'rot-x', 'rot-y', 'rot-z', 'scale-x', 'scale-y', 'scale-z'];
    inputIds.forEach(id => {
      const input = document.getElementById(id) as HTMLInputElement;
      if (input) {
        input.addEventListener('input', () => this.updateObjectFromInputs());
      }
    });

    // Initial scene tree refresh
    this.refreshSceneTree();
    this.updateToolbarState();
  }

  private setupEventListeners(): void {
    const canvas = this.renderer.domElement;

    // CRITICAL: TransformControls events must be set up BEFORE pointer events
    // This ensures TransformControls can intercept handle clicks before we do raycasting
    
    // TransformControls dragging state
    this.transformControls.addEventListener('dragging-changed', (e: any) => {
      this.isDragging = e.value as boolean;
      this.orbitControls.enabled = !this.isDragging;
      console.log('[Editor] Dragging:', this.isDragging);
    });

    // Update properties during transform
    this.transformControls.addEventListener('change', () => {
      if (this.selectedObject) {
        this.updateTransformInputs(this.selectedObject);
      }
    });

    // Pointer down for selection - with capture disabled so TransformControls gets first chance
    canvas.addEventListener('pointerdown', (e) => {
      this.handlePointerDown(e);
    }, { capture: false });

    // Window resize
    window.addEventListener('resize', () => {
      const width = this.viewport.clientWidth;
      const height = this.viewport.clientHeight;
      
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      switch (e.key.toLowerCase()) {
        case 't':
          this.setTransformMode('translate');
          break;
        case 'r':
          this.setTransformMode('rotate');
          break;
        case 's':
          this.setTransformMode('scale');
          break;
        case 'delete':
        case 'backspace':
          if (this.selectedObject && !(this.selectedObject instanceof THREE.Light)) {
            this.deleteSelected();
          }
          break;
      }
    });
  }

  private handlePointerDown(e: PointerEvent): void {
    // Skip if already dragging (TransformControls is handling it)
    if (this.isDragging) return;

    // Calculate mouse position in normalized device coordinates
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // Use setTimeout to let TransformControls process the event first
    setTimeout(() => {
      // Check if TransformControls started dragging (user clicked on handle)
      if (this.isDragging) {
        console.log('[Editor] Transform handle clicked');
        return;
      }

      // Check if hovering over gizmo using internal TransformControls state
      const isHoveringGizmo = (this.transformControls as any).axis !== null;
      if (isHoveringGizmo) {
        console.log('[Editor] Hovering gizmo, skip selection');
        return;
      }

      // Perform raycasting for object selection
      this.raycaster.setFromCamera(this.mouse, this.camera);
      
      // Get all intersectable objects (exclude helpers and TransformControls)
      const intersectObjects: THREE.Object3D[] = [];
      this.scene.traverse((obj) => {
        if (this.isSelectable(obj)) {
          intersectObjects.push(obj);
        }
      });

      const intersects = this.raycaster.intersectObjects(intersectObjects, false);

      if (intersects.length > 0) {
        // Find the topmost selectable parent
        let target = intersects[0].object;
        while (target.parent && target.parent !== this.scene && !(target.parent instanceof THREE.GridHelper)) {
          target = target.parent;
        }
        
        console.log('[Editor] Selected:', target.name || target.type);
        this.selectObject(target);
      } else {
        // Clicked on empty space - deselect
        this.selectObject(null);
      }
    }, 5);
  }

  private isSelectable(obj: THREE.Object3D): boolean {
    // Skip if it's part of TransformControls
    let parent = obj.parent;
    while (parent) {
      if (parent === this.transformControls) return false;
      parent = parent.parent;
    }
    
    // Skip helpers
    if (obj instanceof THREE.GridHelper) return false;
    if (obj instanceof THREE.AxesHelper) return false;
    if (obj instanceof THREE.Light && !(obj instanceof THREE.Mesh)) return false;
    
    // Must be a Mesh or Group
    return obj instanceof THREE.Mesh || obj instanceof THREE.Group;
  }

  private selectObject(obj: THREE.Object3D | null): void {
    this.selectedObject = obj;

    // Update TransformControls
    if (obj) {
      this.transformControls.attach(obj);
      this.transformControls.visible = true;
    } else {
      this.transformControls.detach();
      this.transformControls.visible = false;
    }

    // Update UI
    this.updatePropertyPanel();
    this.updateSceneTreeSelection();
  }

  private updatePropertyPanel(): void {
    if (!this.selectedObject) {
      // No selection
      if (this.noSelectionMsg) this.noSelectionMsg.style.display = 'block';
      if (this.transformProps) this.transformProps.style.display = 'none';
      return;
    }

    // Show transform properties
    if (this.noSelectionMsg) this.noSelectionMsg.style.display = 'none';
    if (this.transformProps) this.transformProps.style.display = 'block';

    // Update input values
    this.updateTransformInputs(this.selectedObject);
  }

  private updateTransformInputs(obj: THREE.Object3D): void {
    // Position
    const posX = document.getElementById('pos-x') as HTMLInputElement;
    const posY = document.getElementById('pos-y') as HTMLInputElement;
    const posZ = document.getElementById('pos-z') as HTMLInputElement;
    
    if (posX) posX.value = obj.position.x.toFixed(2);
    if (posY) posY.value = obj.position.y.toFixed(2);
    if (posZ) posZ.value = obj.position.z.toFixed(2);

    // Rotation (convert to degrees)
    const rotX = document.getElementById('rot-x') as HTMLInputElement;
    const rotY = document.getElementById('rot-y') as HTMLInputElement;
    const rotZ = document.getElementById('rot-z') as HTMLInputElement;
    
    const euler = new THREE.Euler().setFromQuaternion(obj.quaternion);
    if (rotX) rotX.value = THREE.MathUtils.radToDeg(euler.x).toFixed(1);
    if (rotY) rotY.value = THREE.MathUtils.radToDeg(euler.y).toFixed(1);
    if (rotZ) rotZ.value = THREE.MathUtils.radToDeg(euler.z).toFixed(1);

    // Scale
    const scaleX = document.getElementById('scale-x') as HTMLInputElement;
    const scaleY = document.getElementById('scale-y') as HTMLInputElement;
    const scaleZ = document.getElementById('scale-z') as HTMLInputElement;
    
    if (scaleX) scaleX.value = obj.scale.x.toFixed(2);
    if (scaleY) scaleY.value = obj.scale.y.toFixed(2);
    if (scaleZ) scaleZ.value = obj.scale.z.toFixed(2);
  }

  private updateObjectFromInputs(): void {
    if (!this.selectedObject) return;

    const obj = this.selectedObject;

    // Position
    const posX = parseFloat((document.getElementById('pos-x') as HTMLInputElement)?.value || '0');
    const posY = parseFloat((document.getElementById('pos-y') as HTMLInputElement)?.value || '0');
    const posZ = parseFloat((document.getElementById('pos-z') as HTMLInputElement)?.value || '0');
    
    if (!isNaN(posX) && !isNaN(posY) && !isNaN(posZ)) {
      obj.position.set(posX, posY, posZ);
    }

    // Rotation
    const rotX = parseFloat((document.getElementById('rot-x') as HTMLInputElement)?.value || '0');
    const rotY = parseFloat((document.getElementById('rot-y') as HTMLInputElement)?.value || '0');
    const rotZ = parseFloat((document.getElementById('rot-z') as HTMLInputElement)?.value || '0');
    
    if (!isNaN(rotX) && !isNaN(rotY) && !isNaN(rotZ)) {
      obj.rotation.set(
        THREE.MathUtils.degToRad(rotX),
        THREE.MathUtils.degToRad(rotY),
        THREE.MathUtils.degToRad(rotZ)
      );
    }

    // Scale
    const scaleX = parseFloat((document.getElementById('scale-x') as HTMLInputElement)?.value || '1');
    const scaleY = parseFloat((document.getElementById('scale-y') as HTMLInputElement)?.value || '1');
    const scaleZ = parseFloat((document.getElementById('scale-z') as HTMLInputElement)?.value || '1');
    
    if (!isNaN(scaleX) && !isNaN(scaleY) && !isNaN(scaleZ)) {
      obj.scale.set(scaleX, scaleY, scaleZ);
    }
  }

  private setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void {
    this.transformMode = mode;
    this.transformControls.setMode(mode);
    this.updateToolbarState();
    console.log('[Editor] Mode:', mode);
  }

  private updateToolbarState(): void {
    document.getElementById('tool-translate')?.classList.toggle('active', this.transformMode === 'translate');
    document.getElementById('tool-rotate')?.classList.toggle('active', this.transformMode === 'rotate');
    document.getElementById('tool-scale')?.classList.toggle('active', this.transformMode === 'scale');
  }

  private addCube(): void {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
    const mesh = new THREE.Mesh(geometry, material);
    
    mesh.position.set(0, 0.5, 0);
    mesh.name = `Cube ${this.getObjectCount('Cube') + 1}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    this.scene.add(mesh);
    this.refreshSceneTree();
    this.selectObject(mesh);
    
    console.log('[Editor] Added cube');
  }

  private addSphere(): void {
    const geometry = new THREE.SphereGeometry(0.5, 32, 16);
    const material = new THREE.MeshStandardMaterial({ color: 0x2196f3 });
    const mesh = new THREE.Mesh(geometry, material);
    
    mesh.position.set(0, 0.5, 0);
    mesh.name = `Sphere ${this.getObjectCount('Sphere') + 1}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    this.scene.add(mesh);
    this.refreshSceneTree();
    this.selectObject(mesh);
    
    console.log('[Editor] Added sphere');
  }

  private deleteSelected(): void {
    if (!this.selectedObject) return;
    
    this.scene.remove(this.selectedObject);
    this.selectObject(null);
    this.refreshSceneTree();
    
    console.log('[Editor] Deleted object');
  }

  private getObjectCount(prefix: string): number {
    let count = 0;
    this.scene.traverse((obj) => {
      if (obj.name?.startsWith(prefix)) count++;
    });
    return count;
  }

  private refreshSceneTree(): void {
    if (!this.sceneTree) return;
    
    this.sceneTree.innerHTML = '';
    
    this.scene.children.forEach((child) => {
      if (!this.shouldShowInTree(child)) return;
      
      const item = document.createElement('div');
      item.className = 'scene-tree-item';
      item.dataset.uuid = child.uuid;
      
      const icon = this.getObjectIcon(child);
      const name = child.name || child.type;
      
      item.innerHTML = `<span>${icon}</span><span>${name}</span>`;
      
      item.addEventListener('click', () => {
        this.selectObject(child);
      });
      
      this.sceneTree.appendChild(item);
    });
  }

  private updateSceneTreeSelection(): void {
    document.querySelectorAll('.scene-tree-item').forEach((el) => {
      el.classList.remove('selected');
      if (this.selectedObject && (el as HTMLElement).dataset.uuid === this.selectedObject.uuid) {
        el.classList.add('selected');
      }
    });
  }

  private shouldShowInTree(obj: THREE.Object3D): boolean {
    // Skip helpers and controls
    if (obj instanceof THREE.GridHelper) return false;
    if (obj === this.transformControls) return false;
    if (obj instanceof THREE.Light && !(obj instanceof THREE.Mesh)) return true; // Show lights
    
    // Show meshes and groups
    return obj instanceof THREE.Mesh || obj instanceof THREE.Group || obj instanceof THREE.Light;
  }

  private getObjectIcon(obj: THREE.Object3D): string {
    if (obj instanceof THREE.Mesh) {
      if (obj.geometry instanceof THREE.BoxGeometry) return '⬛';
      if (obj.geometry instanceof THREE.SphereGeometry) return '🔵';
      return '📦';
    }
    if (obj instanceof THREE.Group) return '📁';
    if (obj instanceof THREE.DirectionalLight) return '☀️';
    if (obj instanceof THREE.PointLight) return '💡';
    if (obj instanceof THREE.AmbientLight) return '🌅';
    return '📦';
  }
}

// Initialize editor when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new Editor();
});
