import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { DirectionalLightHelper, PointLightHelper, SpotLightHelper } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

// Post-processing imports
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
import { BrightnessContrastShader } from 'three/examples/jsm/shaders/BrightnessContrastShader.js';
import { HueSaturationShader } from 'three/examples/jsm/shaders/HueSaturationShader.js';

interface Command { execute(): void; undo(): void; }
class AddObjectCommand implements Command {
  constructor(private scene: THREE.Scene, private obj: THREE.Object3D, private editor: Editor) {}
  execute() { this.scene.add(this.obj); this.editor.refreshSceneTree(); }
  undo() { this.scene.remove(this.obj); this.editor.selectObject(null); this.editor.refreshSceneTree(); }
}
class RemoveObjectCommand implements Command {
  private parent: THREE.Object3D | null;
  constructor(private scene: THREE.Scene, private obj: THREE.Object3D, private editor: Editor) {
    this.parent = obj.parent;
  }
  execute() { this.scene.remove(this.obj); this.editor.selectObject(null); this.editor.refreshSceneTree(); }
  undo() { if (this.parent) this.parent.add(this.obj); this.editor.refreshSceneTree(); }
}
class TransformCommand implements Command {
  private oldPos: THREE.Vector3;
  private oldRot: THREE.Euler;
  private oldScale: THREE.Vector3;
  private newPos: THREE.Vector3;
  private newRot: THREE.Euler;
  private newScale: THREE.Vector3;
  constructor(private obj: THREE.Object3D, private editor: Editor) {
    this.oldPos = obj.position.clone();
    this.oldRot = obj.rotation.clone();
    this.oldScale = obj.scale.clone();
    this.newPos = obj.position.clone();
    this.newRot = obj.rotation.clone();
    this.newScale = obj.scale.clone();
  }
  setNewState() { this.newPos.copy(this.obj.position); this.newRot.copy(this.obj.rotation); this.newScale.copy(this.obj.scale); }
  execute() { this.obj.position.copy(this.newPos); this.obj.rotation.copy(this.newRot); this.obj.scale.copy(this.newScale); this.editor.updateTransformInputs(this.obj); }
  undo() { this.obj.position.copy(this.oldPos); this.obj.rotation.copy(this.oldRot); this.obj.scale.copy(this.oldScale); this.editor.updateTransformInputs(this.obj); }
}
class MaterialChangeCommand implements Command {
  private oldValues: Record<string, any>;
  private newValues: Record<string, any> = {};
  constructor(private material: THREE.MeshStandardMaterial, private editor: Editor) {
    this.oldValues = { color: material.color.getHex(), roughness: material.roughness, metalness: material.metalness, wireframe: material.wireframe, opacity: material.opacity };
  }
  setNewState() { this.newValues = { color: this.material.color.getHex(), roughness: this.material.roughness, metalness: this.material.metalness, wireframe: this.material.wireframe, opacity: this.material.opacity }; }
  execute() { this.apply(this.newValues); }
  undo() { this.apply(this.oldValues); }
  private apply(v: Record<string, any>) {
    if (v.color !== undefined) this.material.color.setHex(v.color);
    if (v.roughness !== undefined) this.material.roughness = v.roughness;
    if (v.metalness !== undefined) this.material.metalness = v.metalness;
    if (v.wireframe !== undefined) this.material.wireframe = v.wireframe;
    if (v.opacity !== undefined) { this.material.opacity = v.opacity; this.material.transparent = v.opacity < 1; }
    this.material.needsUpdate = true;
  }
}
class LightChangeCommand implements Command {
  private oldValues: Record<string, any> = {};
  private newValues: Record<string, any> = {};
  constructor(private light: THREE.Light, private editor: Editor) {
    this.oldValues = { color: light.color.getHex(), intensity: light.intensity };
    if (light instanceof THREE.PointLight || light instanceof THREE.SpotLight) { this.oldValues.distance = light.distance; this.oldValues.decay = light.decay; }
    if (light instanceof THREE.SpotLight) { this.oldValues.angle = light.angle; this.oldValues.penumbra = light.penumbra; }
    if (light instanceof THREE.HemisphereLight) this.oldValues.groundColor = light.groundColor.getHex();
  }
  setNewState() {
    this.newValues = { color: this.light.color.getHex(), intensity: this.light.intensity };
    if (this.light instanceof THREE.PointLight || this.light instanceof THREE.SpotLight) { this.newValues.distance = this.light.distance; this.newValues.decay = this.light.decay; }
    if (this.light instanceof THREE.SpotLight) { this.newValues.angle = this.light.angle; this.newValues.penumbra = this.light.penumbra; }
    if (this.light instanceof THREE.HemisphereLight) this.newValues.groundColor = this.light.groundColor.getHex();
  }
  execute() { this.apply(this.newValues); }
  undo() { this.apply(this.oldValues); }
  private apply(v: Record<string, any>) {
    if (v.color !== undefined) this.light.color.setHex(v.color);
    if (v.intensity !== undefined) this.light.intensity = v.intensity;
    if (v.distance !== undefined) (this.light as any).distance = v.distance;
    if (v.decay !== undefined) (this.light as any).decay = v.decay;
    if (v.angle !== undefined) (this.light as any).angle = v.angle;
    if (v.penumbra !== undefined) (this.light as any).penumbra = v.penumbra;
    if (v.groundColor !== undefined) (this.light as THREE.HemisphereLight).groundColor.setHex(v.groundColor);
    this.editor.updateLightHelpers();
  }
}

type FilterType = 'lights' | 'models' | 'cameras' | 'helpers';

// Post-processing settings interface
interface PostProcessingSettings {
  enabled: boolean;
  // HDR Environment
  hdrEnabled: boolean;
  hdrIntensity: number;
  hdrFilename: string | null;
  // Background
  bgType: 'color' | 'gradient' | 'hdr' | 'transparent';
  bgColor: string;
  bgIntensity: number;
  // Bloom
  bloomEnabled: boolean;
  bloomThreshold: number;
  bloomStrength: number;
  bloomRadius: number;
  // SSAO
  ssaoEnabled: boolean;
  ssaoKernelRadius: number;
  ssaoMinDistance: number;
  ssaoMaxDistance: number;
  // Tone Mapping
  toneEnabled: boolean;
  toneType: 'Linear' | 'Reinhard' | 'Cineon' | 'ACESFilmic';
  toneExposure: number;
  // FXAA
  fxaaEnabled: boolean;
  // Gamma
  gammaEnabled: boolean;
  // Color Grading
  brightness: number;
  contrast: number;
  saturation: number;
}

const DEFAULT_PP_SETTINGS: PostProcessingSettings = {
  enabled: false,
  hdrEnabled: false,
  hdrIntensity: 1,
  hdrFilename: null,
  bgType: 'color',
  bgColor: '#1e1e1e',
  bgIntensity: 1,
  bloomEnabled: false,
  bloomThreshold: 0.85,
  bloomStrength: 0.5,
  bloomRadius: 0.5,
  ssaoEnabled: false,
  ssaoKernelRadius: 16,
  ssaoMinDistance: 0.005,
  ssaoMaxDistance: 0.1,
  toneEnabled: false,
  toneType: 'ACESFilmic',
  toneExposure: 1,
  fxaaEnabled: false,
  gammaEnabled: true,
  brightness: 0,
  contrast: 0,
  saturation: 1
};

class PostProcessingManager {
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private ssaoPass: SSAOPass | null = null;
  private fxaaPass: ShaderPass | null = null;
  private gammaPass: ShaderPass | null = null;
  private tonePass: OutputPass | null = null;
  private brightnessPass: ShaderPass | null = null;
  private huePass: ShaderPass | null = null;
  
  private settings: PostProcessingSettings = { ...DEFAULT_PP_SETTINGS };
  private hdrTexture: THREE.Texture | null = null;
  private pmremGenerator: THREE.PMREMGenerator | null = null;
  private rendererRef: THREE.WebGLRenderer;
  private sceneRef: THREE.Scene;
  private cameraRef: THREE.PerspectiveCamera;
  
  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera
  ) {
    this.rendererRef = renderer;
    this.sceneRef = scene;
    this.cameraRef = camera;
    
    try {
      this.loadSettings();
      this.initComposer();
      this.setupPMREMGenerator();
    } catch (e) {
      console.error('[PostProcessingManager] Initialization failed:', e);
    }
  }

  private setupPMREMGenerator(): void {
    try {
      this.pmremGenerator = new THREE.PMREMGenerator(this.rendererRef);
      this.pmremGenerator.compileEquirectangularShader();
    } catch (e) {
      console.error('[PostProcessingManager] PMREMGenerator setup failed:', e);
    }
  }

  private initComposer(): void {
    try {
      const size = this.rendererRef.getSize(new THREE.Vector2());
      this.composer = new EffectComposer(this.rendererRef);
      
      // Render pass
      this.renderPass = new RenderPass(this.sceneRef, this.cameraRef);
      this.composer.addPass(this.renderPass);
      
      // SSAO pass (must be added early to work with depth)
      try {
        this.ssaoPass = new SSAOPass(this.sceneRef, this.cameraRef, size.x, size.y);
        this.ssaoPass.enabled = false;
        this.composer.addPass(this.ssaoPass);
      } catch (e) {
        console.warn('[PostProcessing] SSAO pass failed:', e);
      }
      
      // Bloom pass
      try {
        this.bloomPass = new UnrealBloomPass(
          new THREE.Vector2(size.x, size.y),
          this.settings.bloomStrength,
          this.settings.bloomRadius,
          this.settings.bloomThreshold
        );
        this.bloomPass.enabled = false;
        this.composer.addPass(this.bloomPass);
      } catch (e) {
        console.warn('[PostProcessing] Bloom pass failed:', e);
      }
      
      // Brightness/Contrast pass
      try {
        this.brightnessPass = new ShaderPass(BrightnessContrastShader);
        if (this.brightnessPass.uniforms['brightness']) {
          this.brightnessPass.uniforms['brightness'].value = this.settings.brightness;
        }
        if (this.brightnessPass.uniforms['contrast']) {
          this.brightnessPass.uniforms['contrast'].value = this.settings.contrast;
        }
        this.brightnessPass.enabled = false;
        this.composer.addPass(this.brightnessPass);
      } catch (e) {
        console.warn('[PostProcessing] Brightness pass failed:', e);
      }
      
      // Hue/Saturation pass
      try {
        this.huePass = new ShaderPass(HueSaturationShader);
        if (this.huePass.uniforms['saturation']) {
          this.huePass.uniforms['saturation'].value = this.settings.saturation;
        }
        this.huePass.enabled = false;
        this.composer.addPass(this.huePass);
      } catch (e) {
        console.warn('[PostProcessing] Hue pass failed:', e);
      }
      
      // FXAA pass
      try {
        this.fxaaPass = new ShaderPass(FXAAShader);
        const pixelRatio = this.rendererRef.getPixelRatio();
        if (this.fxaaPass.material.uniforms['resolution']) {
          this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (size.x * pixelRatio);
          this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (size.y * pixelRatio);
        }
        this.fxaaPass.enabled = false;
        this.composer.addPass(this.fxaaPass);
      } catch (e) {
        console.warn('[PostProcessing] FXAA pass failed:', e);
      }
      
      // Gamma correction pass
      try {
        this.gammaPass = new ShaderPass(GammaCorrectionShader);
        this.gammaPass.enabled = false;
        this.composer.addPass(this.gammaPass);
      } catch (e) {
        console.warn('[PostProcessing] Gamma pass failed:', e);
      }
      
      // Output pass (includes tone mapping)
      try {
        this.tonePass = new OutputPass();
        this.tonePass.enabled = false;
        this.composer.addPass(this.tonePass);
      } catch (e) {
        console.warn('[PostProcessing] Tone pass failed:', e);
      }
      
      this.updatePasses();
    } catch (e) {
      console.error('[Editor] Post-processing init failed:', e);
      this.composer = null;
    }
  }

  resize(width: number, height: number): void {
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    if (this.bloomPass) {
      this.bloomPass.resolution.set(width, height);
    }
    if (this.ssaoPass) {
      this.ssaoPass.setSize(width, height);
    }
    if (this.fxaaPass) {
      const pixelRatio = this.rendererRef.getPixelRatio();
      this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (width * pixelRatio);
      this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (height * pixelRatio);
    }
  }

  render(): void {
    if (this.settings.enabled && this.composer) {
      this.composer.render();
    } else {
      this.rendererRef.render(this.sceneRef, this.cameraRef);
    }
  }

  isEnabled(): boolean {
    return this.settings.enabled;
  }

  getSettings(): PostProcessingSettings {
    return { ...this.settings };
  }

  updateSettings(newSettings: Partial<PostProcessingSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
    this.updatePasses();
    this.updateRenderer();
  }

  private updatePasses(): void {
    if (!this.composer) return;

    // Check if any post-processing effect is enabled
    const anyEffectEnabled = 
      this.settings.bloomEnabled ||
      this.settings.ssaoEnabled ||
      this.settings.fxaaEnabled ||
      this.settings.toneEnabled ||
      this.settings.gammaEnabled ||
      this.settings.brightness !== 0 ||
      this.settings.contrast !== 0 ||
      this.settings.saturation !== 1;
    
    this.settings.enabled = anyEffectEnabled;

    // Update bloom
    if (this.bloomPass) {
      this.bloomPass.enabled = this.settings.bloomEnabled;
      this.bloomPass.threshold = this.settings.bloomThreshold;
      this.bloomPass.strength = this.settings.bloomStrength;
      this.bloomPass.radius = this.settings.bloomRadius;
    }

    // Update SSAO
    if (this.ssaoPass) {
      this.ssaoPass.enabled = this.settings.ssaoEnabled;
      this.ssaoPass.kernelRadius = this.settings.ssaoKernelRadius;
      this.ssaoPass.minDistance = this.settings.ssaoMinDistance;
      this.ssaoPass.maxDistance = this.settings.ssaoMaxDistance;
    }

    // Update FXAA
    if (this.fxaaPass) {
      this.fxaaPass.enabled = this.settings.fxaaEnabled;
    }

    // Update Gamma
    if (this.gammaPass) {
      this.gammaPass.enabled = this.settings.gammaEnabled;
    }

    // Update Tone Mapping
    if (this.tonePass) {
      this.tonePass.enabled = this.settings.toneEnabled;
    }

    // Update Color Grading
    if (this.brightnessPass) {
      this.brightnessPass.uniforms['brightness'].value = this.settings.brightness;
      this.brightnessPass.uniforms['contrast'].value = this.settings.contrast;
    }
    if (this.huePass) {
      this.huePass.uniforms['saturation'].value = this.settings.saturation;
    }

    // Update HDR environment
    this.updateHDREnvironment();
    
    // Update background
    this.updateBackground();
  }

  private updateRenderer(): void {
    // Set tone mapping on renderer
    if (this.settings.toneEnabled) {
      switch (this.settings.toneType) {
        case 'Linear':
          this.rendererRef.toneMapping = THREE.LinearToneMapping;
          break;
        case 'Reinhard':
          this.rendererRef.toneMapping = THREE.ReinhardToneMapping;
          break;
        case 'Cineon':
          this.rendererRef.toneMapping = THREE.CineonToneMapping;
          break;
        case 'ACESFilmic':
          this.rendererRef.toneMapping = THREE.ACESFilmicToneMapping;
          break;
      }
    } else {
      this.rendererRef.toneMapping = THREE.NoToneMapping;
    }
    this.rendererRef.toneMappingExposure = this.settings.toneExposure;
  }

  loadHDR(url: string, filename: string, onLoad?: () => void, onError?: (error: any) => void): void {
    const loader = new RGBELoader();
    loader.load(url, (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      this.hdrTexture = texture;
      this.settings.hdrFilename = filename;
      this.updateHDREnvironment();
      this.saveSettings();
      if (onLoad) onLoad();
    }, undefined, onError);
  }

  updateHDREnvironment(): void {
    if (this.settings.hdrEnabled && this.hdrTexture && this.pmremGenerator) {
      const pmremTexture = this.pmremGenerator.fromEquirectangular(this.hdrTexture).texture;
      this.sceneRef.environment = pmremTexture;
      // environmentIntensity is handled via material.envMapIntensity on each material
      this.sceneRef.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material) {
          const mat = obj.material as THREE.MeshStandardMaterial;
          mat.envMapIntensity = this.settings.hdrIntensity;
        }
      });
    } else {
      this.sceneRef.environment = null;
    }
  }

  updateBackground(): void {
    switch (this.settings.bgType) {
      case 'color':
        this.sceneRef.background = new THREE.Color(this.settings.bgColor);
        break;
      case 'gradient':
        // Create gradient texture
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d')!;
        const gradient = ctx.createLinearGradient(0, 0, 0, 512);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 512);
        const gradientTexture = new THREE.CanvasTexture(canvas);
        this.sceneRef.background = gradientTexture;
        break;
      case 'hdr':
        if (this.hdrTexture) {
          this.sceneRef.background = this.hdrTexture;
          (this.sceneRef as any).backgroundIntensity = this.settings.bgIntensity;
          (this.sceneRef as any).backgroundBlurriness = 0;
        } else {
          this.sceneRef.background = new THREE.Color(this.settings.bgColor);
        }
        break;
      case 'transparent':
        this.sceneRef.background = null;
        break;
    }
  }

  dispose(): void {
    if (this.composer) {
      this.composer.dispose();
    }
    if (this.hdrTexture) {
      this.hdrTexture.dispose();
    }
    if (this.pmremGenerator) {
      this.pmremGenerator.dispose();
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem('editor-pp-settings', JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Failed to save post-processing settings:', e);
    }
  }

  private loadSettings(): void {
    try {
      const saved = localStorage.getItem('editor-pp-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.settings = { ...DEFAULT_PP_SETTINGS, ...parsed };
      }
    } catch (e) {
      console.warn('Failed to load post-processing settings:', e);
    }
  }
}

export class Editor {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private orbitControls!: OrbitControls;
  private transformControls!: TransformControls;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private gridHelper!: THREE.GridHelper;
  
  private postProcessing!: PostProcessingManager;
  
  selectedObject: THREE.Object3D | null = null;
  private transformMode: 'translate' | 'rotate' | 'scale' = 'translate';
  private isDragging = false;
  private gizmoSize = 0.6;
  private isCameraAnimating = false;
  private camAnim = { startPos: new THREE.Vector3(), targetPos: new THREE.Vector3(), startTarget: new THREE.Vector3(), endTarget: new THREE.Vector3(), startTime: 0, duration: 500 };
  private filters: Record<FilterType, boolean> = { lights: true, models: true, cameras: true, helpers: true };
  private lightHelpers: Map<string, THREE.Object3D> = new Map();
  private ambientVisuals: Map<string, THREE.Mesh> = new Map();
  private hemisphereVisuals: Map<string, THREE.Mesh> = new Map();
  private cameraVisuals: Map<string, THREE.Object3D> = new Map();
  private cameraHelpers: Map<string, THREE.CameraHelper> = new Map();
  private commandHistory: Command[] = [];
  private historyIndex = -1;
  private maxHistory = 50;
  private currentTransformCmd: TransformCommand | null = null;
  private currentMaterialCmd: MaterialChangeCommand | null = null;
  private currentLightCmd: LightChangeCommand | null = null;
  
  private viewport = document.getElementById('viewport')!;
  private sceneTree = document.getElementById('scene-tree')!;
  private noSelectionMsg = document.getElementById('no-selection')!;
  private transformProps = document.getElementById('transform-properties')!;

  constructor() {
    this.init();
    this.setupUI();
    this.setupEventListeners();
    this.setupFilterButtons();
    this.setupImportButton();
    this.setupModelDropdown();
    this.setupPostProcessingUI();
    this.animate();
  }

  private init(): void {
    try {
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x1e1e1e);
      this.scene.name = 'Scene';
      this.camera = new THREE.PerspectiveCamera(50, this.viewport.clientWidth / this.viewport.clientHeight, 0.1, 1000);
      this.camera.position.set(5, 5, 10);
      this.camera.lookAt(0, 0, 0);
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setSize(this.viewport.clientWidth, this.viewport.clientHeight);
      this.renderer.setPixelRatio(window.devicePixelRatio);
      this.viewport.appendChild(this.renderer.domElement);
      
      // Initialize post-processing
      try {
        this.postProcessing = new PostProcessingManager(this.renderer, this.scene, this.camera);
      } catch (e) {
        console.error('[Editor] PostProcessingManager init failed:', e);
        this.postProcessing = null as any;
      }
      
      this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
      this.orbitControls.enableDamping = true;
      this.orbitControls.dampingFactor = 0.05;
      this.orbitControls.target.set(0, 0, 0);
      this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
      this.transformControls.setMode('translate');
      this.transformControls.setSize(this.gizmoSize);
      this.scene.add(this.transformControls);
      this.gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x333333);
      this.scene.add(this.gridHelper);
      // Default ambient light
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
      ambientLight.name = 'Ambient Light';
      this.scene.add(ambientLight);
      this.createAmbientVisual(ambientLight);
      
      // Default directional light
      const dirLight = new THREE.DirectionalLight(0xffffff, 1);
      dirLight.position.set(5, 10, 5);
      dirLight.name = 'Directional Light';
      this.scene.add(dirLight);
      
      // Add default camera to scene (visible, non-deletable)
      this.camera.name = 'Main Camera';
      this.camera.userData.isDefaultCamera = true;
      this.scene.add(this.camera);
      this.createCameraVisual(this.camera);
      
      // Hide loading overlay - hide all overlays just in case
      document.querySelectorAll('#overlay').forEach((el, i) => {
        el.classList.add('hidden');
        (el as HTMLElement).style.display = 'none';
        console.log('[Editor] Overlay', i, 'hidden');
      });
      
      this.ensureAllLightHelpers();
      
      // Restore post-processing settings to UI
      try {
        this.restorePostProcessingUI();
      } catch (e) {
        console.error('[Editor] Failed to restore post-processing UI:', e);
      }
      
      // Ensure nothing is selected on startup
      try {
        this.selectObject(null);
        console.log('[Editor] Selection cleared');
      } catch (e) {
        console.error('[Editor] Failed to clear selection:', e);
      }
      
      console.log('[Editor] Initialization complete');
    } catch (e) {
      console.error('[Editor] CRITICAL INIT ERROR:', e);
      // Even on error, try to hide the overlay so user can see something
      document.querySelectorAll('#overlay').forEach(el => {
        el.classList.add('hidden');
        (el as HTMLElement).style.display = 'none';
      });
    }
  }

  private animate(): void {
    requestAnimationFrame(() => this.animate());
    this.orbitControls.update();
    this.ensureAllLightHelpers();
    this.updateLightHelperSelection();
    this.updateAmbientVisuals();
    this.updateHemisphereVisuals();
    this.updateCameraVisuals();
    if (this.isCameraAnimating) this.updateCameraAnimation();
    
    // Use post-processing render
    if (this.postProcessing) {
      this.postProcessing.render();
    } else if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private focusOnObject(obj: THREE.Object3D): void {
    const target = new THREE.Vector3();
    obj.getWorldPosition(target);
    const offset = new THREE.Vector3(3, 3, 5);
    const newPos = target.clone().add(offset);
    this.animateCameraTo(newPos, target);
  }

  private animateCameraTo(targetPos: THREE.Vector3, lookAt: THREE.Vector3): void {
    this.isCameraAnimating = true;
    this.camAnim.startPos.copy(this.camera.position);
    this.camAnim.startTarget.copy(this.orbitControls.target);
    this.camAnim.targetPos.copy(targetPos);
    this.camAnim.endTarget.copy(lookAt);
    this.camAnim.startTime = Date.now();
  }

  private updateCameraAnimation(): void {
    const t = Math.min((Date.now() - this.camAnim.startTime) / this.camAnim.duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    this.camera.position.lerpVectors(this.camAnim.startPos, this.camAnim.targetPos, eased);
    this.orbitControls.target.lerpVectors(this.camAnim.startTarget, this.camAnim.endTarget, eased);
    if (t >= 1) this.isCameraAnimating = false;
  }

  private createAmbientVisual(light: THREE.AmbientLight): void {
    // Low poly: 8 segments = ~16 quads
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 4), new THREE.MeshBasicMaterial({ color: light.color, wireframe: true }));
    mesh.name = light.name + '_visual';
    mesh.position.copy(light.position);
    this.scene.add(mesh);
    this.ambientVisuals.set(light.uuid, mesh);
  }

  private updateAmbientVisuals(): void {
    this.ambientVisuals.forEach((mesh, uuid) => {
      const light = this.scene.getObjectByProperty('uuid', uuid) as THREE.AmbientLight;
      if (light) { mesh.visible = light.visible; mesh.position.copy(light.position); (mesh.material as THREE.MeshBasicMaterial).color.copy(light.color); }
    });
  }

  private createHemisphereVisual(light: THREE.HemisphereLight): void {
    // Low poly hemisphere: 8x2 segments = ~16 quads
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: light.color, wireframe: true, side: THREE.DoubleSide }));
    mesh.name = light.name + '_visual';
    mesh.position.copy(light.position);
    this.scene.add(mesh);
    this.hemisphereVisuals.set(light.uuid, mesh);
  }

  private updateHemisphereVisuals(): void {
    this.hemisphereVisuals.forEach((mesh, uuid) => {
      const light = this.scene.getObjectByProperty('uuid', uuid) as THREE.HemisphereLight;
      if (light) { mesh.visible = light.visible; mesh.position.copy(light.position); }
    });
  }

  private createCameraVisual(camera: THREE.Camera): void {
    // Create a camera icon (small pyramid shape)
    const group = new THREE.Group();
    
    // Camera body (box)
    const bodyGeo = new THREE.BoxGeometry(0.4, 0.3, 0.5);
    const bodyMat = new THREE.MeshBasicMaterial({ color: 0x888888, wireframe: true });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);
    
    // Camera lens (cone)
    const lensGeo = new THREE.ConeGeometry(0.15, 0.3, 8);
    lensGeo.rotateX(-Math.PI / 2);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, wireframe: true });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.position.z = -0.4;
    group.add(lens);
    
    group.name = camera.name + '_visual';
    group.position.copy(camera.position);
    group.rotation.copy(camera.rotation);
    this.scene.add(group);
    this.cameraVisuals.set(camera.uuid, group);
    
    // Add camera helper (frustum lines)
    const helper = new THREE.CameraHelper(camera);
    helper.name = camera.name + '_helper';
    this.scene.add(helper);
    this.cameraHelpers.set(camera.uuid, helper);
  }

  private updateCameraVisuals(): void {
    this.cameraVisuals.forEach((visual, uuid) => {
      const camera = this.scene.getObjectByProperty('uuid', uuid) as THREE.Camera;
      if (camera) {
        visual.visible = camera.visible;
        visual.position.copy(camera.position);
        visual.rotation.copy(camera.rotation);
      }
    });
    this.cameraHelpers.forEach((helper, uuid) => {
      const camera = this.scene.getObjectByProperty('uuid', uuid) as THREE.Camera;
      if (camera) {
        helper.visible = camera.visible;
        helper.update();
      }
    });
  }

  executeCommand(cmd: Command): void {
    cmd.execute();
    if (this.historyIndex < this.commandHistory.length - 1) this.commandHistory = this.commandHistory.slice(0, this.historyIndex + 1);
    this.commandHistory.push(cmd);
    if (this.commandHistory.length > this.maxHistory) this.commandHistory.shift(); else this.historyIndex++;
    console.log('[Editor] Command executed, history:', this.historyIndex + 1);
  }

  undo(): void { if (this.historyIndex >= 0) { this.commandHistory[this.historyIndex].undo(); this.historyIndex--; console.log('[Editor] Undo, history:', this.historyIndex + 1); } }
  redo(): void { if (this.historyIndex < this.commandHistory.length - 1) { this.historyIndex++; this.commandHistory[this.historyIndex].execute(); console.log('[Editor] Redo, history:', this.historyIndex + 1); } }

  private setupUI(): void {
    document.getElementById('tool-translate')?.addEventListener('click', () => this.setTransformMode('translate'));
    document.getElementById('tool-rotate')?.addEventListener('click', () => this.setTransformMode('rotate'));
    document.getElementById('tool-scale')?.addEventListener('click', () => this.setTransformMode('scale'));
    document.getElementById('btn-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => this.redo());
    document.getElementById('btn-add-ambient')?.addEventListener('click', () => this.addLight('ambient'));
    document.getElementById('btn-add-directional')?.addEventListener('click', () => this.addLight('directional'));
    document.getElementById('btn-add-point')?.addEventListener('click', () => this.addLight('point'));
    document.getElementById('btn-add-spot')?.addEventListener('click', () => this.addLight('spot'));
    document.getElementById('btn-add-hemisphere')?.addEventListener('click', () => this.addLight('hemisphere'));
    ['pos', 'rot', 'scale'].forEach(t => ['x', 'y', 'z'].forEach(a => {
      const el = document.getElementById(`${t}-${a}`) as HTMLInputElement;
      if (el) el.addEventListener('change', () => this.updateObjectFromInputs());
    }));
    this.refreshSceneTree();
    this.updateToolbarState();
  }

  private setupFilterButtons(): void {
    (['lights', 'models', 'cameras', 'helpers'] as FilterType[]).forEach(type => {
      const btn = document.getElementById(`btn-filter-${type}`);
      if (btn) {
        btn.addEventListener('click', () => { this.filters[type] = !this.filters[type]; btn.classList.toggle('active', this.filters[type]); this.refreshSceneTree(); });
        btn.classList.add('active');
      }
    });
  }

  private setupImportButton(): void {
    const importBtn = document.getElementById('btn-import-model');
    const fileInput = document.getElementById('model-input') as HTMLInputElement;
    importBtn?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) this.importModel(f); fileInput.value = ''; });
  }

  private setupModelDropdown(): void {
    const cubeBtn = document.getElementById('btn-add-cube');
    const sphereBtn = document.getElementById('btn-add-sphere');
    if (cubeBtn && cubeBtn.parentElement) {
      const parent = cubeBtn.parentElement;
      const dropdown = document.createElement('div');
      dropdown.style.cssText = 'position: relative; display: inline-block;';
      dropdown.innerHTML = `<button id="btn-create-model" class="primary" style="padding: 6px 12px; background: #0e639c; color: #e0e0e0; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">+ 创建模型 ▼</button><div id="model-dropdown-menu" style="display: none; position: absolute; top: 100%; left: 0; background: #3c3c3c; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); z-index: 1000; min-width: 120px; margin-top: 4px;"><div class="dropdown-model-item" data-type="cube" style="padding: 8px 12px; cursor: pointer; color: #e0e0e0; font-size: 12px; border-radius: 4px 4px 0 0;">□ 立方体</div><div class="dropdown-model-item" data-type="sphere" style="padding: 8px 12px; cursor: pointer; color: #e0e0e0; font-size: 12px;">○ 球体</div><div class="dropdown-model-item" data-type="plane" style="padding: 8px 12px; cursor: pointer; color: #e0e0e0; font-size: 12px; border-radius: 0 0 4px 4px;">▭ 平面</div></div>`;
      cubeBtn.style.display = 'none';
      if (sphereBtn) sphereBtn.style.display = 'none';
      parent.insertBefore(dropdown, cubeBtn);
      const btn = dropdown.querySelector('#btn-create-model');
      const menu = dropdown.querySelector('#model-dropdown-menu') as HTMLElement;
      btn?.addEventListener('click', (e) => { e.stopPropagation(); menu.style.display = menu.style.display === 'none' ? 'block' : 'none'; });
      document.addEventListener('click', () => { menu.style.display = 'none'; });
      dropdown.querySelectorAll('.dropdown-model-item').forEach(item => {
        item.addEventListener('click', (e) => { e.stopPropagation(); const type = (e.currentTarget as HTMLElement).dataset.type; if (type === 'cube') this.addCube(); else if (type === 'sphere') this.addSphere(); else if (type === 'plane') this.addPlane(); menu.style.display = 'none'; });
        item.addEventListener('mouseenter', () => { (item as HTMLElement).style.background = '#4c4c4c'; });
        item.addEventListener('mouseleave', () => { (item as HTMLElement).style.background = 'transparent'; });
      });
    }
  }

  private importModel(file: File): void {
    const url = URL.createObjectURL(file);
    const ext = file.name.split('.').pop()?.toLowerCase();
    const onLoad = (obj: THREE.Object3D) => { obj.position.set(0, 0, 0); obj.name = file.name.split('.')[0]; this.executeCommand(new AddObjectCommand(this.scene, obj, this)); this.selectObject(obj); URL.revokeObjectURL(url); console.log('[Editor] Imported:', file.name); };
    const onError = (err: any) => { console.error('[Editor] Import error:', err); alert('Failed to import: ' + file.name); };
    if (ext === 'obj') new OBJLoader().load(url, onLoad, undefined, onError);
    else if (ext === 'gltf' || ext === 'glb') new GLTFLoader().load(url, (g) => onLoad(g.scene), undefined, onError);
    else if (ext === 'fbx') new FBXLoader().load(url, onLoad, undefined, onError);
    else alert('Unsupported format: ' + ext);
  }

  private setupEventListeners(): void {
    this.transformControls.addEventListener('dragging-changed', (e: any) => {
      this.isDragging = e.value as boolean;
      this.orbitControls.enabled = !this.isDragging;
      if (this.isDragging && this.selectedObject) this.currentTransformCmd = new TransformCommand(this.selectedObject, this);
      else if (!this.isDragging && this.currentTransformCmd) { this.currentTransformCmd.setNewState(); this.executeCommand(this.currentTransformCmd); this.currentTransformCmd = null; }
    });
    this.transformControls.addEventListener('change', () => { if (this.selectedObject) this.updateTransformInputs(this.selectedObject); });
    this.renderer.domElement.addEventListener('pointerdown', (e) => this.handlePointerDown(e), { capture: false });
    window.addEventListener('resize', () => { 
      const w = this.viewport.clientWidth, h = this.viewport.clientHeight; 
      this.camera.aspect = w / h; 
      this.camera.updateProjectionMatrix(); 
      this.renderer.setSize(w, h); 
      this.postProcessing?.resize(w, h);
    });
    document.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key.toLowerCase()) { 
        case 't': this.setTransformMode('translate'); break; 
        case 'r': this.setTransformMode('rotate'); break; 
        case 's': this.setTransformMode('scale'); break; 
        case 'f': if (this.selectedObject) this.focusOnObject(this.selectedObject); break; 
        case 'delete': case 'backspace': 
          if (this.selectedObject && !this.isProtectedObject(this.selectedObject)) this.deleteSelected(); 
          break; 
        case '+': case '=': this.adjustGizmoSize(0.1); break; 
        case '-': case '_': this.adjustGizmoSize(-0.1); break; 
      }
      if (e.ctrlKey || e.metaKey) { if (e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); } else if (e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); } }
    });
    this.setupMaterialListeners();
    this.setupLightListeners();
  }

  private setupMaterialListeners(): void {
    const update = () => {
      const mesh = this.selectedObject as THREE.Mesh;
      if (!mesh?.material) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!this.currentMaterialCmd) this.currentMaterialCmd = new MaterialChangeCommand(mat, this);
      const color = (document.getElementById('material-color') as HTMLInputElement)?.value;
      const roughness = parseFloat((document.getElementById('material-roughness') as HTMLInputElement)?.value || '0');
      const metalness = parseFloat((document.getElementById('material-metalness') as HTMLInputElement)?.value || '0');
      const wireframe = (document.getElementById('material-wireframe') as HTMLInputElement)?.checked;
      const opacity = parseFloat((document.getElementById('material-opacity') as HTMLInputElement)?.value || '1');
      if (color) mat.color.set(color);
      if (!isNaN(roughness)) mat.roughness = roughness;
      if (!isNaN(metalness)) mat.metalness = metalness;
      if (wireframe !== undefined) mat.wireframe = wireframe;
      if (!isNaN(opacity)) { mat.opacity = opacity; mat.transparent = opacity < 1; }
      mat.needsUpdate = true;
    };
    const commit = () => { if (this.currentMaterialCmd) { this.currentMaterialCmd.setNewState(); this.executeCommand(this.currentMaterialCmd); this.currentMaterialCmd = null; } };
    ['material-roughness-slider', 'material-metalness-slider', 'material-opacity-slider'].forEach(id => {
      const slider = document.getElementById(id) as HTMLInputElement;
      const inputId = id.replace('-slider', '');
      slider?.addEventListener('input', () => { const input = document.getElementById(inputId) as HTMLInputElement; if (input) input.value = slider.value; update(); });
      slider?.addEventListener('change', commit);
    });
    ['material-color', 'material-roughness', 'material-metalness', 'material-wireframe', 'material-opacity'].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener('input', update);
      el?.addEventListener('change', commit);
    });
  }

  private setupLightListeners(): void {
    const update = () => {
      const light = this.selectedObject as THREE.Light;
      if (!light) return;
      if (!this.currentLightCmd) this.currentLightCmd = new LightChangeCommand(light, this);
      const color = (document.getElementById('light-color') as HTMLInputElement)?.value;
      const intensity = parseFloat((document.getElementById('light-intensity') as HTMLInputElement)?.value || '1');
      const distance = parseFloat((document.getElementById('light-distance') as HTMLInputElement)?.value || '100');
      const angle = parseFloat((document.getElementById('light-angle') as HTMLInputElement)?.value || '45');
      const penumbra = parseFloat((document.getElementById('light-penumbra') as HTMLInputElement)?.value || '0');
      const decay = parseFloat((document.getElementById('light-decay') as HTMLInputElement)?.value || '2');
      if (color) light.color.set(color);
      if (!isNaN(intensity)) light.intensity = intensity;
      if ((light instanceof THREE.PointLight || light instanceof THREE.SpotLight) && !isNaN(distance)) light.distance = distance;
      if ((light instanceof THREE.PointLight || light instanceof THREE.SpotLight) && !isNaN(decay)) light.decay = decay;
      if (light instanceof THREE.SpotLight && !isNaN(angle)) light.angle = THREE.MathUtils.degToRad(angle);
      if (light instanceof THREE.SpotLight && !isNaN(penumbra)) light.penumbra = penumbra;
      this.updateLightHelpers();
    };
    const commit = () => { if (this.currentLightCmd) { this.currentLightCmd.setNewState(); this.executeCommand(this.currentLightCmd); this.currentLightCmd = null; } };
    ['light-intensity-slider', 'light-distance-slider', 'light-angle-slider', 'light-penumbra-slider', 'light-decay-slider'].forEach(id => {
      const slider = document.getElementById(id) as HTMLInputElement;
      const inputId = id.replace('-slider', '');
      slider?.addEventListener('input', () => { const input = document.getElementById(inputId) as HTMLInputElement; if (input) input.value = slider.value; update(); });
      slider?.addEventListener('change', commit);
    });
    ['light-color', 'light-intensity', 'light-distance', 'light-angle', 'light-penumbra', 'light-decay'].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener('input', update);
      el?.addEventListener('change', commit);
    });
  }

  private handlePointerDown(e: PointerEvent): void {
    if (this.isDragging) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    setTimeout(() => {
      if (this.isDragging || (this.transformControls as any).axis !== null) return;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const objs: THREE.Object3D[] = [];
      this.scene.traverse((o) => { if (this.isSelectable(o)) objs.push(o); });
      const hits = this.raycaster.intersectObjects(objs, false);
      if (hits.length > 0) {
        let target = hits[0].object;
        while (target.parent && target.parent !== this.scene && !(target.parent instanceof THREE.GridHelper)) target = target.parent;
        this.selectObject(target);
      }
    }, 5);
  }

  private isSelectable(obj: THREE.Object3D): boolean {
    if (!obj.visible) return false;
    let p = obj.parent;
    while (p) { if (p === this.transformControls) return false; p = p.parent; }
    if (obj instanceof THREE.GridHelper || obj instanceof THREE.AxesHelper) return false;
    return true;
  }

  selectObject(obj: THREE.Object3D | null): void {
    this.selectedObject = obj;
    if (obj) { this.transformControls.attach(obj); this.transformControls.visible = true; this.transformControls.setSize(this.gizmoSize); }
    else { this.transformControls.detach(); this.transformControls.visible = false; }
    this.updateLightHelperSelection();
    this.updatePropertyPanel();
    this.updateSceneTreeSelection();
  }

  private adjustGizmoSize(delta: number): void {
    this.gizmoSize = Math.max(0.1, Math.min(2.0, this.gizmoSize + delta));
    this.transformControls.setSize(this.gizmoSize);
    console.log('[Editor] Gizmo size:', this.gizmoSize.toFixed(2));
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

  updateTransformInputs(obj: THREE.Object3D): void {
    const euler = new THREE.Euler().setFromQuaternion(obj.quaternion);
    ['x', 'y', 'z'].forEach((a, i) => {
      const pos = document.getElementById(`pos-${a}`) as HTMLInputElement;
      const rot = document.getElementById(`rot-${a}`) as HTMLInputElement;
      const scl = document.getElementById(`scale-${a}`) as HTMLInputElement;
      if (pos) pos.value = obj.position.getComponent(i).toFixed(2);
      if (rot) rot.value = THREE.MathUtils.radToDeg(euler[['x','y','z'][i] as 'x'|'y'|'z']).toFixed(1);
      if (scl) scl.value = obj.scale.getComponent(i).toFixed(2);
    });
  }

  private updateObjectFromInputs(): void {
    if (!this.selectedObject) return;
    const o = this.selectedObject;
    ['x', 'y', 'z'].forEach((a, i) => {
      const p = parseFloat((document.getElementById(`pos-${a}`) as HTMLInputElement)?.value || '0');
      const r = parseFloat((document.getElementById(`rot-${a}`) as HTMLInputElement)?.value || '0');
      const s = parseFloat((document.getElementById(`scale-${a}`) as HTMLInputElement)?.value || '1');
      if (!isNaN(p)) o.position.setComponent(i, p);
      if (!isNaN(r)) { const c = ['x','y','z'][i] as 'x'|'y'|'z'; o.rotation[c] = THREE.MathUtils.degToRad(r); }
      if (!isNaN(s)) o.scale.setComponent(i, s);
    });
  }

  private updatePropertyPanel(): void {
    if (!this.selectedObject) { if (this.noSelectionMsg) this.noSelectionMsg.style.display = 'block'; if (this.transformProps) this.transformProps.style.display = 'none'; return; }
    if (this.noSelectionMsg) this.noSelectionMsg.style.display = 'none';
    if (this.transformProps) this.transformProps.style.display = 'block';
    this.updateTransformInputs(this.selectedObject);
    const matProps = document.getElementById('material-properties');
    const isMesh = this.selectedObject instanceof THREE.Mesh;
    if (matProps) { matProps.style.display = isMesh ? 'block' : 'none'; if (isMesh) this.populateMaterialInputs(this.selectedObject as THREE.Mesh); }
    const lightProps = document.getElementById('light-properties');
    const isLight = this.selectedObject instanceof THREE.Light;
    if (lightProps) { lightProps.style.display = isLight ? 'block' : 'none'; if (isLight) this.populateLightInputs(this.selectedObject as THREE.Light); }
    const cameraProps = document.getElementById('camera-properties');
    const isCamera = this.selectedObject instanceof THREE.Camera;
    if (cameraProps) { cameraProps.style.display = isCamera ? 'block' : 'none'; if (isCamera) this.populateCameraInputs(this.selectedObject as THREE.PerspectiveCamera); }
  }

  private populateMaterialInputs(mesh: THREE.Mesh): void {
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

  private populateLightInputs(light: THREE.Light): void {
    const color = document.getElementById('light-color') as HTMLInputElement;
    const int = document.getElementById('light-intensity') as HTMLInputElement;
    const intS = document.getElementById('light-intensity-slider') as HTMLInputElement;
    const distRow = document.getElementById('light-distance-row');
    const angRow = document.getElementById('light-angle-row');
    const penRow = document.getElementById('light-penumbra-row');
    const decRow = document.getElementById('light-decay-row');
    if (color) color.value = '#' + light.color.getHexString();
    if (int) int.value = light.intensity.toFixed(2);
    if (intS) intS.value = light.intensity.toFixed(2);
    const isPoint = light instanceof THREE.PointLight, isSpot = light instanceof THREE.SpotLight;
    if (distRow) distRow.style.display = (isPoint || isSpot) ? 'flex' : 'none';
    if (angRow) angRow.style.display = isSpot ? 'flex' : 'none';
    if (penRow) penRow.style.display = isSpot ? 'flex' : 'none';
    if (decRow) decRow.style.display = (isPoint || isSpot) ? 'flex' : 'none';
    if (isPoint || isSpot) {
      const dist = document.getElementById('light-distance') as HTMLInputElement;
      const distS = document.getElementById('light-distance-slider') as HTMLInputElement;
      const dec = document.getElementById('light-decay') as HTMLInputElement;
      const decS = document.getElementById('light-decay-slider') as HTMLInputElement;
      if (dist) dist.value = light.distance.toFixed(1);
      if (distS) distS.value = light.distance.toFixed(1);
      if (dec) dec.value = light.decay.toFixed(1);
      if (decS) decS.value = light.decay.toFixed(1);
    }
    if (isSpot) {
      const ang = document.getElementById('light-angle') as HTMLInputElement;
      const angS = document.getElementById('light-angle-slider') as HTMLInputElement;
      const pen = document.getElementById('light-penumbra') as HTMLInputElement;
      const penS = document.getElementById('light-penumbra-slider') as HTMLInputElement;
      if (ang) ang.value = THREE.MathUtils.radToDeg(light.angle).toFixed(1);
      if (angS) angS.value = THREE.MathUtils.radToDeg(light.angle).toFixed(1);
      if (pen) pen.value = light.penumbra.toFixed(2);
      if (penS) penS.value = light.penumbra.toFixed(2);
    }
  }

  private addCube(): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4caf50 }));
    mesh.position.set(0, 0.5, 0);
    mesh.name = `Cube ${this.getObjectCount('Cube') + 1}`;
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.executeCommand(new AddObjectCommand(this.scene, mesh, this));
    this.selectObject(mesh);
    console.log('[Editor] Added cube');
  }

  private addSphere(): void {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), new THREE.MeshStandardMaterial({ color: 0x2196f3 }));
    mesh.position.set(0, 0.5, 0);
    mesh.name = `Sphere ${this.getObjectCount('Sphere') + 1}`;
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.executeCommand(new AddObjectCommand(this.scene, mesh, this));
    this.selectObject(mesh);
    console.log('[Editor] Added sphere');
  }

  private addPlane(): void {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial({ color: 0xff9800, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, 0, 0);
    mesh.name = `Plane ${this.getObjectCount('Plane') + 1}`; mesh.receiveShadow = true;
    this.executeCommand(new AddObjectCommand(this.scene, mesh, this));
    this.selectObject(mesh);
    console.log('[Editor] Added plane');
  }

  private populateCameraInputs(camera: THREE.PerspectiveCamera): void {
    const fov = document.getElementById('camera-fov') as HTMLInputElement;
    const near = document.getElementById('camera-near') as HTMLInputElement;
    const far = document.getElementById('camera-far') as HTMLInputElement;
    if (fov) fov.value = camera.fov.toFixed(1);
    if (near) near.value = camera.near.toFixed(2);
    if (far) far.value = camera.far.toFixed(1);
  }

  private addLight(type: 'ambient' | 'directional' | 'point' | 'spot' | 'hemisphere'): void {
    let light: THREE.Light, name: string;
    switch (type) {
      case 'ambient': light = new THREE.AmbientLight(0xffffff, 0.5); name = `Ambient Light ${this.getObjectCount('Ambient Light') + 1}`; break;
      case 'directional': light = new THREE.DirectionalLight(0xffffff, 1); light.position.set(2, 4, 2); name = `Directional Light ${this.getObjectCount('Directional Light') + 1}`; break;
      case 'point': light = new THREE.PointLight(0xffffff, 1, 100); light.position.set(0, 2, 0); name = `Point Light ${this.getObjectCount('Point Light') + 1}`; break;
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
      case 'hemisphere': light = new THREE.HemisphereLight(0xffffff, 0x444444, 1); name = `Hemisphere Light ${this.getObjectCount('Hemisphere Light') + 1}`; break;
      default: light = new THREE.PointLight(0xffffff, 1); name = 'Light';
    }
    light.name = name;
    this.executeCommand(new AddObjectCommand(this.scene, light, this));
    if (light instanceof THREE.AmbientLight) this.createAmbientVisual(light);
    if (light instanceof THREE.HemisphereLight) this.createHemisphereVisual(light);
    this.selectObject(light);
    console.log('[Editor] Added light:', name);
  }

  private deleteSelected(): void { 
    if (this.selectedObject && !this.isProtectedObject(this.selectedObject)) { 
      this.executeCommand(new RemoveObjectCommand(this.scene, this.selectedObject, this)); 
      console.log('[Editor] Deleted object'); 
    } else {
      console.log('[Editor] Cannot delete protected object');
    }
  }
  
  private isProtectedObject(obj: THREE.Object3D): boolean {
    // Default camera cannot be deleted
    if (obj instanceof THREE.Camera && obj.userData.isDefaultCamera) return true;
    return false;
  }
  private getObjectCount(prefix: string): number { let c = 0; this.scene.traverse((o) => { if (o.name?.startsWith(prefix)) c++; }); return c; }

  private createLightHelper(light: THREE.Light): void {
    let helper: THREE.Object3D | null = null;
    if (light instanceof THREE.DirectionalLight) helper = new DirectionalLightHelper(light, 1);
    else if (light instanceof THREE.PointLight) helper = new PointLightHelper(light, 0.5);
    else if (light instanceof THREE.SpotLight) helper = new SpotLightHelper(light);
    if (helper) { helper.name = light.name + '_helper'; this.scene.add(helper); this.lightHelpers.set(light.uuid, helper); }
  }

  updateLightHelpers(): void { this.lightHelpers.forEach((h) => { if (h instanceof DirectionalLightHelper || h instanceof SpotLightHelper) h.update(); }); }
  private updateLightHelperSelection(): void { this.lightHelpers.forEach((h, uuid) => { const l = this.scene.getObjectByProperty('uuid', uuid) as THREE.Light; if (l) h.visible = l.visible; }); }
  private ensureAllLightHelpers(): void { this.scene.traverse((o) => { if (o instanceof THREE.Light && !(o instanceof THREE.AmbientLight) && !(o instanceof THREE.HemisphereLight) && !this.lightHelpers.has(o.uuid)) this.createLightHelper(o); }); }

  // Track expanded state of tree items
  private expandedItems: Set<string> = new Set();

  refreshSceneTree(): void {
    if (!this.sceneTree) return;
    this.sceneTree.innerHTML = '';
    
    // Render scene children recursively
    this.scene.children.forEach((child) => {
      if (!this.shouldShowInTree(child)) return;
      this.renderTreeItem(child, 0);
    });
  }

  private renderTreeItem(obj: THREE.Object3D, depth: number): void {
    const item = document.createElement('div');
    item.className = 'scene-tree-item';
    item.dataset.uuid = obj.uuid;
    item.style.paddingLeft = `${8 + depth * 16}px`;
    
    const hasChildren = obj.children.length > 0 && obj.children.some(c => this.shouldShowInTree(c));
    const isExpanded = this.expandedItems.has(obj.uuid);
    const icon = this.getObjectIcon(obj);
    const name = obj.name || obj.type;
    
    // Expand/collapse toggle
    const expander = hasChildren ? (isExpanded ? '▼' : '▶') : '<span style="visibility:hidden">▶</span>';
    
    item.innerHTML = `
      <span class="tree-expander">${expander}</span>
      <span class="tree-icon">${icon}</span>
      <span class="tree-name">${name}</span>
      <span class="tree-visibility ${obj.visible ? 'visible' : 'hidden'}" title="Toggle visibility"></span>
    `;
    
    // Click handlers
    item.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      
      // Toggle visibility
      if (target.classList.contains('tree-visibility')) {
        obj.visible = !obj.visible;
        this.refreshSceneTree();
        return;
      }
      
      // Toggle expand/collapse
      if (target.classList.contains('tree-expander') && hasChildren) {
        if (isExpanded) {
          this.expandedItems.delete(obj.uuid);
        } else {
          this.expandedItems.add(obj.uuid);
        }
        this.refreshSceneTree();
        return;
      }
      
      // Select object
      this.selectObject(obj);
    });
    
    this.sceneTree.appendChild(item);
    
    // Render children if expanded
    if (isExpanded) {
      obj.children.forEach((child) => {
        if (this.shouldShowInTree(child)) {
          this.renderTreeItem(child, depth + 1);
        }
      });
    }
  }

  private updateSceneTreeSelection(): void {
    document.querySelectorAll('.scene-tree-item').forEach((el) => {
      el.classList.remove('selected');
      if (this.selectedObject && (el as HTMLElement).dataset.uuid === this.selectedObject.uuid) el.classList.add('selected');
    });
  }

  private shouldShowInTree(obj: THREE.Object3D): boolean {
    if (obj === this.transformControls || obj instanceof THREE.GridHelper || obj instanceof THREE.CameraHelper || obj.name === '摄像机模型' || obj.name?.endsWith('_helper') || obj.name?.endsWith('_visual')) return false;
    if (obj instanceof THREE.Light && !this.filters.lights) return false;
    if (obj instanceof THREE.Mesh && !this.filters.models) return false;
    if (obj instanceof THREE.Camera && !this.filters.cameras) return false;
    return obj instanceof THREE.Light || obj instanceof THREE.Mesh || obj instanceof THREE.Group || obj instanceof THREE.Camera;
  }

  private getObjectIcon(obj: THREE.Object3D): string {
    if (obj instanceof THREE.Mesh) { if (obj.geometry instanceof THREE.BoxGeometry) return '□'; if (obj.geometry instanceof THREE.SphereGeometry) return '○'; if (obj.geometry instanceof THREE.PlaneGeometry) return '▭'; if (obj.geometry instanceof THREE.CylinderGeometry) return '▲'; return '◆'; }
    if (obj instanceof THREE.Group) return '❏'; if (obj instanceof THREE.Scene) return '◈'; if (obj instanceof THREE.PerspectiveCamera || obj instanceof THREE.OrthographicCamera) return '◎';
    if (obj instanceof THREE.DirectionalLight) return '☀'; if (obj instanceof THREE.PointLight) return '●'; if (obj instanceof THREE.SpotLight) return '◐'; if (obj instanceof THREE.AmbientLight) return '○'; if (obj instanceof THREE.HemisphereLight) return '◑';
    return '◆';
  }

  // ==================== Post Processing UI Setup ====================
  
  private setupPostProcessingUI(): void {
    // Tab switching
    const tabs = document.querySelectorAll('.panel-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        const propertiesPanel = document.getElementById('properties');
        const postprocessingPanel = document.getElementById('postprocessing-panel');
        
        if (tabName === 'properties') {
          propertiesPanel?.classList.add('active');
          postprocessingPanel?.classList.remove('active');
        } else {
          propertiesPanel?.classList.remove('active');
          postprocessingPanel?.classList.add('active');
        }
      });
    });
    
    // HDR file loading
    const hdrLoadBtn = document.getElementById('pp-hdr-load-btn');
    const hdrInput = document.getElementById('pp-hdr-input') as HTMLInputElement;
    const hdrLoading = document.getElementById('pp-hdr-loading');
    const hdrFilename = document.getElementById('pp-hdr-filename');
    
    hdrLoadBtn?.addEventListener('click', () => hdrInput?.click());
    hdrInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && this.postProcessing) {
        hdrLoading?.classList.remove('hidden');
        const url = URL.createObjectURL(file);
        this.postProcessing.loadHDR(
          url, 
          file.name,
          () => {
            hdrLoading?.classList.add('hidden');
            if (hdrFilename) hdrFilename.textContent = file.name;
            // Enable HDR automatically
            const hdrEnabled = document.getElementById('pp-hdr-enabled') as HTMLInputElement;
            if (hdrEnabled && !hdrEnabled.checked && this.postProcessing) {
              hdrEnabled.checked = true;
              this.postProcessing.updateSettings({ hdrEnabled: true });
            }
            URL.revokeObjectURL(url);
          },
          (error) => {
            hdrLoading?.classList.add('hidden');
            console.error('[PostProcessing] Failed to load HDR:', error);
            alert('加载 HDR 文件失败');
          }
        );
      }
    });
    
    // Setup all post-processing controls
    this.setupPPControl('pp-hdr-enabled', 'checkbox', (v) => ({ hdrEnabled: v }));
    this.setupPPControl('pp-hdr-intensity', 'range', (v) => ({ hdrIntensity: v }), 'pp-hdr-intensity-slider');
    this.setupPPControl('pp-hdr-intensity-slider', 'range', (v) => ({ hdrIntensity: v }), 'pp-hdr-intensity');
    
    this.setupPPControl('pp-bg-type', 'select', (v) => ({ bgType: v }), undefined, (value) => {
      // Update background row visibility
      const colorRow = document.getElementById('pp-bg-color-row');
      const intensityRow = document.getElementById('pp-bg-intensity-row');
      if (value === 'color') {
        colorRow!.style.display = 'flex';
        intensityRow!.style.display = 'none';
      } else if (value === 'hdr') {
        colorRow!.style.display = 'none';
        intensityRow!.style.display = 'flex';
      } else {
        colorRow!.style.display = value === 'gradient' ? 'none' : 'none';
        intensityRow!.style.display = 'none';
      }
    });
    this.setupPPControl('pp-bg-color', 'color', (v) => ({ bgColor: v }));
    this.setupPPControl('pp-bg-intensity', 'range', (v) => ({ bgIntensity: v }), 'pp-bg-intensity-slider');
    this.setupPPControl('pp-bg-intensity-slider', 'range', (v) => ({ bgIntensity: v }), 'pp-bg-intensity');
    
    this.setupPPControl('pp-bloom-enabled', 'checkbox', (v) => ({ bloomEnabled: v }));
    this.setupPPControl('pp-bloom-threshold', 'range', (v) => ({ bloomThreshold: v }), 'pp-bloom-threshold-slider');
    this.setupPPControl('pp-bloom-threshold-slider', 'range', (v) => ({ bloomThreshold: v }), 'pp-bloom-threshold');
    this.setupPPControl('pp-bloom-strength', 'range', (v) => ({ bloomStrength: v }), 'pp-bloom-strength-slider');
    this.setupPPControl('pp-bloom-strength-slider', 'range', (v) => ({ bloomStrength: v }), 'pp-bloom-strength');
    this.setupPPControl('pp-bloom-radius', 'range', (v) => ({ bloomRadius: v }), 'pp-bloom-radius-slider');
    this.setupPPControl('pp-bloom-radius-slider', 'range', (v) => ({ bloomRadius: v }), 'pp-bloom-radius');
    
    this.setupPPControl('pp-ssao-enabled', 'checkbox', (v) => ({ ssaoEnabled: v }));
    this.setupPPControl('pp-ssao-radius', 'range', (v) => ({ ssaoKernelRadius: v }), 'pp-ssao-radius-slider');
    this.setupPPControl('pp-ssao-radius-slider', 'range', (v) => ({ ssaoKernelRadius: v }), 'pp-ssao-radius');
    this.setupPPControl('pp-ssao-intensity', 'range', (v) => ({ ssaoMaxDistance: v }), 'pp-ssao-intensity-slider');
    this.setupPPControl('pp-ssao-intensity-slider', 'range', (v) => ({ ssaoMaxDistance: v }), 'pp-ssao-intensity');
    
    this.setupPPControl('pp-tone-enabled', 'checkbox', (v) => ({ toneEnabled: v }));
    this.setupPPControl('pp-tone-type', 'select', (v) => ({ toneType: v }));
    this.setupPPControl('pp-tone-exposure', 'range', (v) => ({ toneExposure: v }), 'pp-tone-exposure-slider');
    this.setupPPControl('pp-tone-exposure-slider', 'range', (v) => ({ toneExposure: v }), 'pp-tone-exposure');
    
    this.setupPPControl('pp-fxaa-enabled', 'checkbox', (v) => ({ fxaaEnabled: v }));
    this.setupPPControl('pp-gamma-enabled', 'checkbox', (v) => ({ gammaEnabled: v }));
    
    this.setupPPControl('pp-color-brightness', 'range', (v) => ({ brightness: v }), 'pp-color-brightness-slider');
    this.setupPPControl('pp-color-brightness-slider', 'range', (v) => ({ brightness: v }), 'pp-color-brightness');
    this.setupPPControl('pp-color-contrast', 'range', (v) => ({ contrast: v }), 'pp-color-contrast-slider');
    this.setupPPControl('pp-color-contrast-slider', 'range', (v) => ({ contrast: v }), 'pp-color-contrast');
    this.setupPPControl('pp-color-saturation', 'range', (v) => ({ saturation: v }), 'pp-color-saturation-slider');
    this.setupPPControl('pp-color-saturation-slider', 'range', (v) => ({ saturation: v }), 'pp-color-saturation');
  }
  
  private setupPPControl(
    id: string, 
    type: 'checkbox' | 'range' | 'select' | 'color',
    getSettings: (value: any) => Partial<PostProcessingSettings>,
    syncId?: string,
    onChange?: (value: any) => void
  ): void {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
    if (!el) return;
    
    el.addEventListener('input', () => {
      if (!this.postProcessing) return;
      
      let value: any;
      if (type === 'checkbox') value = (el as HTMLInputElement).checked;
      else if (type === 'range' || type === 'color') value = parseFloat(el.value);
      else if (type === 'select') value = el.value;
      
      if (type === 'color') value = el.value;
      
      // Sync with paired input/slider
      if (syncId) {
        const syncEl = document.getElementById(syncId) as HTMLInputElement;
        if (syncEl) syncEl.value = el.value;
      }
      
      this.postProcessing.updateSettings(getSettings(value));
      if (onChange) onChange(value);
    });
  }
  
  private restorePostProcessingUI(): void {
    if (!this.postProcessing) return;
    const settings = this.postProcessing.getSettings();
    
    // Restore all UI controls from saved settings
    const setValue = (id: string, value: any, type: 'checkbox' | 'range' | 'select' | 'color') => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
      if (!el) return;
      if (type === 'checkbox') (el as HTMLInputElement).checked = value;
      else el.value = String(value);
    };
    
    setValue('pp-hdr-enabled', settings.hdrEnabled, 'checkbox');
    setValue('pp-hdr-intensity', settings.hdrIntensity, 'range');
    setValue('pp-hdr-intensity-slider', settings.hdrIntensity, 'range');
    if (settings.hdrFilename) {
      const filenameEl = document.getElementById('pp-hdr-filename');
      if (filenameEl) filenameEl.textContent = settings.hdrFilename;
    }
    
    setValue('pp-bg-type', settings.bgType, 'select');
    setValue('pp-bg-color', settings.bgColor, 'color');
    setValue('pp-bg-intensity', settings.bgIntensity, 'range');
    setValue('pp-bg-intensity-slider', settings.bgIntensity, 'range');
    
    // Trigger background row visibility
    const bgTypeSelect = document.getElementById('pp-bg-type') as HTMLSelectElement;
    if (bgTypeSelect) {
      const colorRow = document.getElementById('pp-bg-color-row');
      const intensityRow = document.getElementById('pp-bg-intensity-row');
      if (settings.bgType === 'color') {
        if (colorRow) colorRow.style.display = 'flex';
        if (intensityRow) intensityRow.style.display = 'none';
      } else if (settings.bgType === 'hdr') {
        if (colorRow) colorRow.style.display = 'none';
        if (intensityRow) intensityRow.style.display = 'flex';
      } else {
        if (colorRow) colorRow.style.display = 'none';
        if (intensityRow) intensityRow.style.display = 'none';
      }
    }
    
    setValue('pp-bloom-enabled', settings.bloomEnabled, 'checkbox');
    setValue('pp-bloom-threshold', settings.bloomThreshold, 'range');
    setValue('pp-bloom-threshold-slider', settings.bloomThreshold, 'range');
    setValue('pp-bloom-strength', settings.bloomStrength, 'range');
    setValue('pp-bloom-strength-slider', settings.bloomStrength, 'range');
    setValue('pp-bloom-radius', settings.bloomRadius, 'range');
    setValue('pp-bloom-radius-slider', settings.bloomRadius, 'range');
    
    setValue('pp-ssao-enabled', settings.ssaoEnabled, 'checkbox');
    setValue('pp-ssao-radius', settings.ssaoKernelRadius, 'range');
    setValue('pp-ssao-radius-slider', settings.ssaoKernelRadius, 'range');
    setValue('pp-ssao-intensity', settings.ssaoMaxDistance, 'range');
    setValue('pp-ssao-intensity-slider', settings.ssaoMaxDistance, 'range');
    
    setValue('pp-tone-enabled', settings.toneEnabled, 'checkbox');
    setValue('pp-tone-type', settings.toneType, 'select');
    setValue('pp-tone-exposure', settings.toneExposure, 'range');
    setValue('pp-tone-exposure-slider', settings.toneExposure, 'range');
    
    setValue('pp-fxaa-enabled', settings.fxaaEnabled, 'checkbox');
    setValue('pp-gamma-enabled', settings.gammaEnabled, 'checkbox');
    
    setValue('pp-color-brightness', settings.brightness, 'range');
    setValue('pp-color-brightness-slider', settings.brightness, 'range');
    setValue('pp-color-contrast', settings.contrast, 'range');
    setValue('pp-color-contrast-slider', settings.contrast, 'range');
    setValue('pp-color-saturation', settings.saturation, 'range');
    setValue('pp-color-saturation-slider', settings.saturation, 'range');
    
    // Apply settings
    this.postProcessing.updateSettings(settings);
  }
}

document.addEventListener('DOMContentLoaded', () => { new Editor(); });
