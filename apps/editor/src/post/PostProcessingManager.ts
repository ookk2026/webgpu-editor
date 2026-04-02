/**
 * STABLE: 2024-04-02
 * Post-processing effects manager
 * 
 * Handles all post-processing effects including bloom, SSAO, tone mapping,
 * FXAA, gamma correction, and color grading.
 */

import * as THREE from 'three';
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

// ============================================================================
// Types & Settings
// ============================================================================

export type ToneMappingType = 'Linear' | 'Reinhard' | 'Cineon' | 'ACESFilmic';
export type BackgroundType = 'color' | 'gradient' | 'hdr' | 'transparent';

export interface PostProcessingSettings {
  enabled: boolean;
  // HDR Environment
  hdrEnabled: boolean;
  hdrIntensity: number;
  hdrFilename: string | null;
  // Background
  bgType: BackgroundType;
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
  toneType: ToneMappingType;
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

const DEFAULT_SETTINGS: PostProcessingSettings = {
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
  gammaEnabled: false, // Disabled by default - renderer handles sRGB
  brightness: 0,
  contrast: 0,
  saturation: 1,
};

// ============================================================================
// Post Processing Manager
// ============================================================================

export class PostProcessingManager {
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private ssaoPass: SSAOPass | null = null;
  private fxaaPass: ShaderPass | null = null;
  private gammaPass: ShaderPass | null = null;
  private tonePass: OutputPass | null = null;
  private brightnessPass: ShaderPass | null = null;
  private huePass: ShaderPass | null = null;

  private settings: PostProcessingSettings = { ...DEFAULT_SETTINGS };
  private hdrTexture: THREE.Texture | null = null;
  private pmremGenerator: THREE.PMREMGenerator | null = null;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera
  ) {
    try {
      this.loadSettings();
      this.initComposer();
      this.setupPMREMGenerator();
    } catch (e) {
      console.error('[PostProcessingManager] Initialization failed:', e);
    }
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  private setupPMREMGenerator(): void {
    try {
      this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      this.pmremGenerator.compileEquirectangularShader();
    } catch (e) {
      console.error('[PostProcessingManager] PMREMGenerator setup failed:', e);
    }
  }

  private initComposer(): void {
    try {
      const size = this.renderer.getSize(new THREE.Vector2());
      this.composer = new EffectComposer(this.renderer);

      // Render pass
      this.renderPass = new RenderPass(this.scene, this.camera);
      this.composer.addPass(this.renderPass);

      // SSAO pass
      try {
        this.ssaoPass = new SSAOPass(this.scene, this.camera, size.x, size.y);
        this.ssaoPass.enabled = false;
        // Set conservative defaults to avoid artifacts
        this.ssaoPass.kernelRadius = 16;
        this.ssaoPass.minDistance = 0.005;
        this.ssaoPass.maxDistance = 0.1;
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
        const pixelRatio = this.renderer.getPixelRatio();
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

  // -------------------------------------------------------------------------
  // Render & Resize
  // -------------------------------------------------------------------------

  render(): void {
    if (this.settings.enabled && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
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
      const pixelRatio = this.renderer.getPixelRatio();
      this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (width * pixelRatio);
      this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (height * pixelRatio);
    }
  }

  // -------------------------------------------------------------------------
  // Settings Management
  // -------------------------------------------------------------------------

  getSettings(): PostProcessingSettings {
    return { ...this.settings };
  }

  isEnabled(): boolean {
    return this.settings.enabled;
  }

  updateSettings(newSettings: Partial<PostProcessingSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
    this.updatePasses();
    this.updateRenderer();
  }

  private updatePasses(): void {
    if (!this.composer) return;

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
    if (this.settings.toneEnabled) {
      switch (this.settings.toneType) {
        case 'Linear':
          this.renderer.toneMapping = THREE.LinearToneMapping;
          break;
        case 'Reinhard':
          this.renderer.toneMapping = THREE.ReinhardToneMapping;
          break;
        case 'Cineon':
          this.renderer.toneMapping = THREE.CineonToneMapping;
          break;
        case 'ACESFilmic':
          this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
          break;
      }
    } else {
      this.renderer.toneMapping = THREE.NoToneMapping;
    }
    this.renderer.toneMappingExposure = this.settings.toneExposure;
  }

  // -------------------------------------------------------------------------
  // HDR & Background
  // -------------------------------------------------------------------------

  loadHDR(url: string, filename: string, onLoad?: () => void, onError?: (error: any) => void): void {
    const loader = new RGBELoader();
    loader.load(
      url,
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        this.hdrTexture = texture;
        this.settings.hdrFilename = filename;
        this.updateHDREnvironment();
        this.saveSettings();
        onLoad?.();
      },
      undefined,
      onError
    );
  }

  updateHDREnvironment(): void {
    if (this.settings.hdrEnabled && this.hdrTexture && this.pmremGenerator) {
      const pmremTexture = this.pmremGenerator.fromEquirectangular(this.hdrTexture).texture;
      this.scene.environment = pmremTexture;
      this.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material) {
          const mat = obj.material as THREE.MeshStandardMaterial;
          mat.envMapIntensity = this.settings.hdrIntensity;
        }
      });
    } else {
      this.scene.environment = null;
    }
  }

  updateBackground(): void {
    switch (this.settings.bgType) {
      case 'color':
        this.scene.background = new THREE.Color(this.settings.bgColor);
        break;
      case 'gradient': {
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
        this.scene.background = gradientTexture;
        break;
      }
      case 'hdr':
        if (this.hdrTexture) {
          this.scene.background = this.hdrTexture;
          (this.scene as any).backgroundIntensity = this.settings.bgIntensity;
          (this.scene as any).backgroundBlurriness = 0;
        } else {
          this.scene.background = new THREE.Color(this.settings.bgColor);
        }
        break;
      case 'transparent':
        this.scene.background = null;
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

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
        // Merge saved settings but ensure SSAO is disabled by default to avoid artifacts
        this.settings = { ...DEFAULT_SETTINGS, ...parsed };
        // Always disable SSAO on startup to prevent visual artifacts
        this.settings.ssaoEnabled = false;
      }
    } catch (e) {
      console.warn('Failed to load post-processing settings:', e);
    }
  }
}
