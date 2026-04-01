import { 
  Renderer, 
  SceneManager, 
  SceneSerializer,
  type SceneData 
} from '@webgpu-editor/core';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// 播放器主类
class Player {
  private renderer: Renderer | null = null;
  private sceneManager: SceneManager | null = null;
  private controls: OrbitControls | null = null;
  private container: HTMLElement;
  private loadingEl: HTMLElement;
  private errorEl: HTMLElement;
  private fileInput: HTMLInputElement;

  constructor() {
    this.container = document.getElementById('canvas-container')!;
    this.loadingEl = document.getElementById('loading')!;
    this.errorEl = document.getElementById('error')!;
    this.fileInput = document.getElementById('file-input')! as HTMLInputElement;

    this.init();
    this.setupUI();
  }

  async init() {
    try {
      // 创建 Canvas
      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      this.container.appendChild(canvas);

      // 初始化渲染器
      this.renderer = new Renderer(canvas);
      const success = await this.renderer.init();
      
      if (!success) {
        throw new Error('无法初始化渲染器');
      }

      // 初始化场景管理器
      this.sceneManager = new SceneManager();
      this.sceneManager.createDefaultScene();

      // 初始化相机控制
      this.controls = new OrbitControls(
        this.sceneManager.getCamera(),
        canvas
      );
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;

      // 启动渲染循环
      this.renderer.startRenderLoop(() => {
        this.controls?.update();
        this.render();
      });

      // 处理窗口大小变化
      window.addEventListener('resize', () => this.handleResize());
      this.handleResize();

      // 隐藏加载
      this.loadingEl.classList.add('hidden');
      
      console.log('[Player] Initialized successfully');
      console.log('[Player] Render mode:', this.renderer.isWebGPUMode() ? 'WebGPU' : 'WebGL2');

    } catch (error) {
      this.showError(error instanceof Error ? error.message : '初始化失败');
    }
  }

  render() {
    if (this.renderer && this.sceneManager) {
      this.renderer.render(
        this.sceneManager.getScene(),
        this.sceneManager.getCamera()
      );
    }
  }

  handleResize() {
    if (this.renderer && this.sceneManager) {
      const { clientWidth, clientHeight } = this.container;
      this.renderer.updateSize();
      this.sceneManager.updateCameraAspect(clientWidth, clientHeight);
    }
  }

  setupUI() {
    // 加载场景按钮
    document.getElementById('btn-load')?.addEventListener('click', () => {
      this.fileInput.click();
    });

    // 文件选择
    this.fileInput.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await this.loadSceneFromFile(file);
      }
    });

    // 重置视角
    document.getElementById('btn-reset')?.addEventListener('click', () => {
      if (this.sceneManager) {
        const camera = this.sceneManager.getCamera();
        camera.position.set(5, 5, 5);
        camera.lookAt(0, 0, 0);
        this.controls?.reset();
      }
    });

    // 渲染信息
    document.getElementById('btn-info')?.addEventListener('click', () => {
      if (this.renderer) {
        const info = this.renderer.getInfo();
        alert(JSON.stringify(info, null, 2));
      }
    });
  }

  async loadSceneFromFile(file: File) {
    try {
      this.loadingEl.textContent = '加载场景中...';
      this.loadingEl.classList.remove('hidden');

      const sceneData = await SceneSerializer.loadFromFile(file);
      this.loadScene(sceneData);

      this.loadingEl.classList.add('hidden');
      console.log('[Player] Scene loaded:', sceneData.metadata.name);
    } catch (error) {
      this.showError(`加载场景失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  loadScene(data: SceneData) {
    if (!this.sceneManager) return;

    // 清空当前场景
    this.sceneManager.clear();

    // TODO: 从 data.scene 反序列化场景
    // 目前简化处理，创建默认场景
    this.sceneManager.createDefaultScene();
  }

  showError(message: string) {
    this.loadingEl.classList.add('hidden');
    this.errorEl.textContent = message;
    this.errorEl.classList.remove('hidden');
    console.error('[Player]', message);
  }
}

// 启动播放器
new Player();
