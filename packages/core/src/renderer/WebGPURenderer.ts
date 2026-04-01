import { 
  Scene, 
  Camera, 
  WebGLRenderer, 
  WebGLRendererParameters,
  PCFSoftShadowMap,
  Color
} from 'three';
import type { RendererConfig } from '../types';

// WebGPU 类型声明
declare global {
  interface GPU {
    requestAdapter(options?: { powerPreference?: 'low-power' | 'high-performance' }): Promise<GPUAdapter | null>;
  }
  interface GPUAdapter {}
  interface Navigator {
    gpu?: GPU;
  }
}

// 动态导入 WebGPU 渲染器
let WebGPURenderer: any = null;

export async function loadWebGPURenderer() {
  if (WebGPURenderer) return WebGPURenderer;
  try {
    const module = await import('three/examples/jsm/renderers/webgpu/WebGPURenderer.js');
    WebGPURenderer = module.default;
    return WebGPURenderer;
  } catch {
    return null;
  }
}

export class Renderer {
  private renderer: WebGLRenderer | any; // WebGPURenderer 类型
  private canvas: HTMLCanvasElement;
  private isWebGPU: boolean = false;
  private config: RendererConfig;
  private animationId: number | null = null;
  private renderLoop: ((time: number) => void) | null = null;
  private onError?: (error: Error) => void;

  constructor(canvas: HTMLCanvasElement, config: RendererConfig = {}) {
    this.canvas = canvas;
    this.config = {
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      pixelRatio: Math.min(window.devicePixelRatio, 2),
      shadowMap: true,
      ...config
    };
  }

  /**
   * 初始化渲染器，优先使用 WebGPU，降级到 WebGL2
   */
  async init(): Promise<boolean> {
    // 尝试 WebGPU
    if (await this.tryWebGPU()) {
      console.log('[Renderer] WebGPU initialized successfully');
      return true;
    }

    // 降级到 WebGL2
    if (this.tryWebGL2()) {
      console.log('[Renderer] WebGL2 initialized (WebGPU not available)');
      return true;
    }

    throw new Error('Neither WebGPU nor WebGL2 is available');
  }

  private async tryWebGPU(): Promise<boolean> {
    if (!navigator.gpu) return false;

    try {
      const WebGPURendererClass = await loadWebGPURenderer();
      if (!WebGPURendererClass) return false;

      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: this.config.powerPreference
      });
      if (!adapter) return false;

      this.renderer = new WebGPURendererClass({
        canvas: this.canvas,
        antialias: this.config.antialias,
        alpha: this.config.alpha
      });

      await this.renderer.init();
      this.isWebGPU = true;
      this.setupCommon();
      return true;
    } catch (error) {
      console.warn('[Renderer] WebGPU init failed:', error);
      return false;
    }
  }

  private tryWebGL2(): boolean {
    try {
      const params: WebGLRendererParameters = {
        canvas: this.canvas,
        antialias: this.config.antialias,
        alpha: this.config.alpha,
        powerPreference: this.config.powerPreference
      };

      this.renderer = new WebGLRenderer(params);
      this.isWebGPU = false;
      this.setupCommon();
      return true;
    } catch (error) {
      console.error('[Renderer] WebGL2 init failed:', error);
      return false;
    }
  }

  private setupCommon(): void {
    this.renderer.setPixelRatio(this.config.pixelRatio!);
    
    if (this.config.shadowMap) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = this.config.shadowMapType || PCFSoftShadowMap;
    }

    // 设置初始大小
    this.updateSize();
  }

  /**
   * 更新渲染器尺寸
   */
  updateSize(): void {
    const parent = this.canvas.parentElement;
    if (parent) {
      const { clientWidth, clientHeight } = parent;
      this.renderer.setSize(clientWidth, clientHeight);
    }
  }

  /**
   * 渲染场景
   */
  render(scene: Scene, camera: Camera): void {
    this.renderer.render(scene, camera);
  }

  /**
   * 启动渲染循环
   */
  startRenderLoop(callback: (deltaTime: number) => void): void {
    this.stopRenderLoop();
    
    let lastTime = performance.now();
    
    const loop = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;
      
      callback(deltaTime);
      this.animationId = requestAnimationFrame(loop);
    };
    
    this.animationId = requestAnimationFrame(loop);
  }

  /**
   * 停止渲染循环
   */
  stopRenderLoop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * 设置背景色
   */
  setBackground(color: string | number | Color): void {
    this.renderer.setClearColor(color);
  }

  /**
   * 获取渲染器实例
   */
  getRenderer(): WebGLRenderer | any {
    return this.renderer;
  }

  /**
   * 是否为 WebGPU 模式
   */
  isWebGPUMode(): boolean {
    return this.isWebGPU;
  }

  /**
   * 获取 Canvas
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * 获取当前尺寸
   */
  getSize(): { width: number; height: number } {
    return {
      width: this.renderer.domElement.width,
      height: this.renderer.domElement.height
    };
  }

  /**
   * 设置尺寸
   */
  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height);
  }

  /**
   * 销毁渲染器
   */
  dispose(): void {
    this.stopRenderLoop();
    this.renderer.dispose();
  }

  /**
   * 获取渲染信息（调试用）
   */
  getInfo(): Record<string, any> {
    return {
      isWebGPU: this.isWebGPU,
      pixelRatio: this.config.pixelRatio,
      memory: this.renderer.info?.memory,
      render: this.renderer.info?.render
    };
  }
}
