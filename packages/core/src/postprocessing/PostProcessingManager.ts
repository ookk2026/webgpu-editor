import { 
  WebGLRenderer, 
  Scene, 
  Camera,
  Vector2
} from 'three';
import type { Renderer } from '../renderer/WebGPURenderer';
import { FXAAEffect } from './effects/FXAAEffect';
import { DepthOfFieldEffect, DepthOfFieldConfig } from './effects/DepthOfFieldEffect';
import { MotionBlurEffect, MotionBlurConfig } from './effects/MotionBlurEffect';
import type { SSAOEffectConfig } from './effects/SSAOEffect';

// 动态导入后处理相关类
let EffectComposer: any;
let RenderPass: any;
let ShaderPass: any;
let UnrealBloomPass: any;
let SSAOPass: any;
let OutputPass: any;

/**
 * 后处理效果配置
 */
export interface PostProcessingConfig {
  enabled: boolean;
  bloom: BloomConfig;
  ssao: SSAOConfig;
  fxaa: FXAAConfig;
  depthOfField: DepthOfFieldConfig;
  motionBlur: MotionBlurConfig;
  toneMapping: ToneMappingConfig;
}

export interface BloomConfig {
  enabled: boolean;
  strength: number;
  radius: number;
  threshold: number;
}

export interface SSAOConfig {
  enabled: boolean;
  radius: number;
  minDistance: number;
  maxDistance: number;
  samples: number;
}

export interface FXAAConfig {
  enabled: boolean;
}

export interface ToneMappingConfig {
  enabled: boolean;
  exposure: number;
}

/**
 * 后处理管理器
 * 管理 Bloom、SSAO、FXAA、DoF、Motion Blur 等效果
 */
export class PostProcessingManager {
  private renderer: Renderer;
  private composer: any; // EffectComposer
  private renderPass: any; // RenderPass
  private bloomPass: any; // UnrealBloomPass
  private ssaoPass: any; // SSAOPass
  private outputPass: any; // OutputPass
  private fxaaPass: any; // ShaderPass for FXAA
  private dofPass: any; // Depth of Field
  private motionBlurPass: any; // Motion Blur
  
  private config: PostProcessingConfig;
  private isInitialized: boolean = false;
  private isWebGL: boolean = true;

  // 自定义效果
  private fxaaEffect: FXAAEffect | null = null;
  private dofEffect: DepthOfFieldEffect | null = null;
  private motionBlurEffect: MotionBlurEffect | null = null;

  // 默认配置
  private static defaultConfig: PostProcessingConfig = {
    enabled: true,
    bloom: {
      enabled: true,
      strength: 0.5,
      radius: 0.4,
      threshold: 0.85
    },
    ssao: {
      enabled: false,
      radius: 0.5,
      minDistance: 0.005,
      maxDistance: 0.1,
      samples: 16
    },
    fxaa: {
      enabled: true
    },
    depthOfField: {
      enabled: false,
      focus: 10,
      aperture: 0.025,
      maxBlur: 1,
      near: 0.1,
      far: 1000
    },
    motionBlur: {
      enabled: false,
      intensity: 0.5,
      samples: 16,
      direction: 'camera'
    },
    toneMapping: {
      enabled: true,
      exposure: 1.0
    }
  };

  constructor(renderer: Renderer, config: Partial<PostProcessingConfig> = {}) {
    this.renderer = renderer;
    this.config = { ...PostProcessingManager.defaultConfig, ...config };
  }

  /**
   * 初始化后处理系统
   */
  async init(scene: Scene, camera: Camera): Promise<boolean> {
    if (this.renderer.isWebGPUMode()) {
      console.log('[PostProcessing] WebGPU mode - post processing not yet supported');
      this.isWebGL = false;
      return false;
    }

    try {
      const [composerModule, passesModule, bloomModule, ssaoModule] = await Promise.all([
        import('three/examples/jsm/postprocessing/EffectComposer.js'),
        import('three/examples/jsm/postprocessing/RenderPass.js'),
        import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
        import('three/examples/jsm/postprocessing/SSAOPass.js')
      ]);

      EffectComposer = composerModule.EffectComposer;
      RenderPass = passesModule.RenderPass;
      
      try {
        const outputModule = await import('three/examples/jsm/postprocessing/OutputPass.js');
        OutputPass = outputModule.OutputPass;
      } catch {
        console.log('[PostProcessing] OutputPass not available');
      }

      try {
        const shaderPassModule = await import('three/examples/jsm/postprocessing/ShaderPass.js');
        ShaderPass = shaderPassModule.ShaderPass;
      } catch {
        console.log('[PostProcessing] ShaderPass not available');
      }

      UnrealBloomPass = bloomModule.UnrealBloomPass;
      SSAOPass = ssaoModule.SSAOPass;

      const glRenderer = this.renderer.getRenderer() as WebGLRenderer;
      const canvas = glRenderer.domElement;

      this.composer = new EffectComposer(glRenderer);

      // 渲染通道
      this.renderPass = new RenderPass(scene, camera);
      this.composer.addPass(this.renderPass);

      // SSAO 通道
      if (SSAOPass) {
        this.ssaoPass = new SSAOPass(
          scene,
          camera,
          canvas.clientWidth,
          canvas.clientHeight
        );
        this.ssaoPass.enabled = this.config.ssao.enabled;
        this.updateSSAOParams();
        this.composer.addPass(this.ssaoPass);
      }

      // Bloom 通道
      this.bloomPass = new UnrealBloomPass(
        new Vector2(canvas.clientWidth, canvas.clientHeight),
        this.config.bloom.strength,
        this.config.bloom.radius,
        this.config.bloom.threshold
      );
      this.bloomPass.enabled = this.config.bloom.enabled;
      this.composer.addPass(this.bloomPass);

      // 景深效果
      this.dofEffect = new DepthOfFieldEffect(camera, this.config.depthOfField);
      if (ShaderPass && this.dofEffect) {
        this.dofPass = new ShaderPass(this.dofEffect.material);
        this.dofPass.enabled = this.config.depthOfField.enabled;
        this.composer.addPass(this.dofPass);
      }

      // 运动模糊
      this.motionBlurEffect = new MotionBlurEffect(camera, this.config.motionBlur);
      if (ShaderPass && this.motionBlurEffect) {
        this.motionBlurPass = new ShaderPass(this.motionBlurEffect.material);
        this.motionBlurPass.enabled = this.config.motionBlur.enabled;
        this.composer.addPass(this.motionBlurPass);
      }

      // FXAA
      this.fxaaEffect = new FXAAEffect(this.config.fxaa);
      if (ShaderPass && this.fxaaEffect) {
        this.fxaaPass = new ShaderPass(this.fxaaEffect.material);
        this.fxaaPass.enabled = this.config.fxaa.enabled;
        this.composer.addPass(this.fxaaPass);
      }

      // 输出通道
      if (OutputPass) {
        this.outputPass = new OutputPass();
        this.composer.addPass(this.outputPass);
      }

      this.isInitialized = true;
      this.isWebGL = true;

      console.log('[PostProcessing] Initialized with effects: Bloom, SSAO, FXAA, DoF, MotionBlur');
      return true;

    } catch (error) {
      console.error('[PostProcessing] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * 渲染
   */
  render(): void {
    if (!this.isInitialized || !this.config.enabled) return;
    
    // 更新运动模糊相机矩阵
    if (this.motionBlurEffect && this.config.motionBlur.enabled) {
      this.motionBlurEffect.updateCameraMatrix();
    }
    
    this.composer.render();
  }

  /**
   * 调整大小
   */
  setSize(width: number, height: number): void {
    if (!this.isInitialized) return;
    this.composer.setSize(width, height);
    
    if (this.bloomPass) {
      this.bloomPass.resolution.set(width, height);
    }
    
    if (this.ssaoPass) {
      this.ssaoPass.setSize(width, height);
    }

    if (this.fxaaEffect) {
      this.fxaaEffect.setSize(width, height);
    }

    if (this.dofEffect) {
      this.dofEffect.setSize(width, height);
    }

    if (this.motionBlurEffect) {
      this.motionBlurEffect.setSize(width, height);
    }
  }

  // ========== Bloom 控制 ==========
  setBloomEnabled(enabled: boolean): void {
    this.config.bloom.enabled = enabled;
    if (this.bloomPass) this.bloomPass.enabled = enabled;
  }
  setBloomStrength(strength: number): void {
    this.config.bloom.strength = strength;
    if (this.bloomPass) this.bloomPass.strength = strength;
  }
  setBloomRadius(radius: number): void {
    this.config.bloom.radius = radius;
    if (this.bloomPass) this.bloomPass.radius = radius;
  }
  setBloomThreshold(threshold: number): void {
    this.config.bloom.threshold = threshold;
    if (this.bloomPass) this.bloomPass.threshold = threshold;
  }

  // ========== SSAO 控制 ==========
  setSSAOEnabled(enabled: boolean): void {
    this.config.ssao.enabled = enabled;
    if (this.ssaoPass) this.ssaoPass.enabled = enabled;
  }
  setSSAORadius(radius: number): void {
    this.config.ssao.radius = radius;
    this.updateSSAOParams();
  }
  setSSAOMinDistance(distance: number): void {
    this.config.ssao.minDistance = distance;
    this.updateSSAOParams();
  }
  setSSAOMaxDistance(distance: number): void {
    this.config.ssao.maxDistance = distance;
    this.updateSSAOParams();
  }
  private updateSSAOParams(): void {
    if (!this.ssaoPass) return;
    this.ssaoPass.radius = this.config.ssao.radius;
    this.ssaoPass.minDistance = this.config.ssao.minDistance;
    this.ssaoPass.maxDistance = this.config.ssao.maxDistance;
    this.ssaoPass.samples = this.config.ssao.samples;
  }

  // ========== FXAA 控制 ==========
  setFXAAEnabled(enabled: boolean): void {
    this.config.fxaa.enabled = enabled;
    if (this.fxaaPass) this.fxaaPass.enabled = enabled;
  }

  // ========== 景深控制 ==========
  setDOFEnabled(enabled: boolean): void {
    this.config.depthOfField.enabled = enabled;
    if (this.dofPass) this.dofPass.enabled = enabled;
  }
  setDOFFocus(focus: number): void {
    this.config.depthOfField.focus = focus;
    if (this.dofEffect) this.dofEffect.updateConfig({ focus });
  }
  setDOFAperture(aperture: number): void {
    this.config.depthOfField.aperture = aperture;
    if (this.dofEffect) this.dofEffect.updateConfig({ aperture });
  }
  setDOFMaxBlur(maxBlur: number): void {
    this.config.depthOfField.maxBlur = maxBlur;
    if (this.dofEffect) this.dofEffect.updateConfig({ maxBlur });
  }
  setFocusToTarget(target: { x: number; y: number; z: number }): void {
    if (this.dofEffect) this.dofEffect.setFocusToTarget(target);
  }

  // ========== 运动模糊控制 ==========
  setMotionBlurEnabled(enabled: boolean): void {
    this.config.motionBlur.enabled = enabled;
    if (this.motionBlurPass) this.motionBlurPass.enabled = enabled;
  }
  setMotionBlurIntensity(intensity: number): void {
    this.config.motionBlur.intensity = intensity;
    if (this.motionBlurEffect) this.motionBlurEffect.updateConfig({ intensity });
  }

  // ========== 全局控制 ==========
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }
  isReady(): boolean {
    return this.isInitialized;
  }
  getConfig(): PostProcessingConfig {
    return { ...this.config };
  }
  updateConfig(config: Partial<PostProcessingConfig>): void {
    if (config.bloom) {
      if (config.bloom.enabled !== undefined) this.setBloomEnabled(config.bloom.enabled);
      if (config.bloom.strength !== undefined) this.setBloomStrength(config.bloom.strength);
      if (config.bloom.radius !== undefined) this.setBloomRadius(config.bloom.radius);
      if (config.bloom.threshold !== undefined) this.setBloomThreshold(config.bloom.threshold);
    }
    if (config.ssao) {
      if (config.ssao.enabled !== undefined) this.setSSAOEnabled(config.ssao.enabled);
      if (config.ssao.radius !== undefined) this.setSSAORadius(config.ssao.radius);
      if (config.ssao.minDistance !== undefined) this.setSSAOMinDistance(config.ssao.minDistance);
      if (config.ssao.maxDistance !== undefined) this.setSSAOMaxDistance(config.ssao.maxDistance);
    }
    if (config.fxaa) {
      if (config.fxaa.enabled !== undefined) this.setFXAAEnabled(config.fxaa.enabled);
    }
    if (config.depthOfField) {
      if (config.depthOfField.enabled !== undefined) this.setDOFEnabled(config.depthOfField.enabled);
      if (config.depthOfField.focus !== undefined) this.setDOFFocus(config.depthOfField.focus);
      if (config.depthOfField.aperture !== undefined) this.setDOFAperture(config.depthOfField.aperture);
    }
    if (config.motionBlur) {
      if (config.motionBlur.enabled !== undefined) this.setMotionBlurEnabled(config.motionBlur.enabled);
      if (config.motionBlur.intensity !== undefined) this.setMotionBlurIntensity(config.motionBlur.intensity);
    }
  }
  reset(): void {
    this.updateConfig(PostProcessingManager.defaultConfig);
  }
  dispose(): void {
    if (this.composer) {
      this.composer.dispose();
    }
    if (this.fxaaEffect) {
      this.fxaaEffect.dispose();
    }
    if (this.dofEffect) {
      this.dofEffect.dispose();
    }
    if (this.motionBlurEffect) {
      this.motionBlurEffect.dispose();
    }
    this.isInitialized = false;
  }
}
