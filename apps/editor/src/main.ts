import {
  Renderer,
  SceneManager,
  SceneSerializer,
  ModelImporter,
  MaterialEditor,
  CommandManager,
  AddObjectCommand,
  RemoveObjectCommand,
  TransformCommand,
  type SceneNodeData
} from '@webgpu-editor/core';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { 
  Raycaster, 
  Vector2, 
  Vector3,
  Euler,
  type Object3D,
  Mesh,
  Group,
  Light,
  LineSegments,
  Color,
  MathUtils,
  AmbientLight,
  DirectionalLight,
  PointLight,
  SpotLight,
  HemisphereLight,
  RectAreaLight,
  PerspectiveCamera,
  OrthographicCamera,
  Camera,
  ConeGeometry,
  BoxGeometry,
  BufferGeometry,
  BufferAttribute,
  LineBasicMaterial,
  Line,
  MeshBasicMaterial,
  BoxHelper,
  GridHelper,
  CameraHelper,
  Box3,
  Material
} from 'three';

// 编辑器状态
interface EditorState {
  selectedObject: Object3D | null;
  transformMode: 'translate' | 'rotate' | 'scale';
  space: 'local' | 'world';
  transformDragging: boolean;
}

// 场景树筛选状态
interface TreeFilterState {
  lights: boolean;
  models: boolean;
  helpers: boolean;
  cameras: boolean;
}

class Editor {
  private renderer!: Renderer;
  private sceneManager: SceneManager | null = null;
  private orbitControls: OrbitControls | null = null;
  private transformControls: TransformControls | null = null;
  private raycaster = new Raycaster();
  private mouse = new Vector2();
  private modelImporter = new ModelImporter();
  private materialEditor = new MaterialEditor();
  
  private state: EditorState = {
    selectedObject: null,
    transformMode: 'translate',
    space: 'local',
    transformDragging: false
  };

  // 场景树筛选状态（默认全部显示）
  private treeFilter: TreeFilterState = {
    lights: true,
    models: true,
    helpers: true,
    cameras: true
  };

  // 命令管理器（撤销/重做）
  private commandManager = new CommandManager({ debug: false });
  
  // 场景树事件监听器是否已绑定
  private treeEventListenersBound = false;
  
  // 场景树折叠状态持久化
  private collapsedObjects: Set<string> = new Set();
  
  // 方向光辅助对象映射
  private directionalLightHelpers: Map<string, { helper: Object3D; gizmo: TransformControls }> = new Map();
  
  // 选中对象线框包围盒
  private selectionBox: BoxHelper | null = null;
  
  // 属性面板状态缓存
  private propertyPanelState: Map<string, Record<string, any>> = new Map();
  
  // 存储所有事件监听器的清理函数
  private eventListeners: (() => void)[] = [];

  private viewport: HTMLElement;
  private overlay: HTMLElement;
  private statusFPS: HTMLElement;
  private statusObjects: HTMLElement;
  private statusRender: HTMLElement;
  
  // 聚光灯目标点辅助对象
  private spotLightTargetHelper: { mesh: Mesh; gizmo: TransformControls; line: Line } | null = null;

  constructor() {
    this.viewport = document.getElementById('viewport')!;
    this.overlay = document.getElementById('overlay')!;
    this.statusFPS = document.getElementById('status-fps')!;
    this.statusObjects = document.getElementById('status-objects')!;
    this.statusRender = document.getElementById('status-render')!;

    this.loadPersistedState();
    this.init();
    this.setupUI();
    this.setupEventListeners();
    this.setupGlobalKeyboardListeners();
  }

  private async init(): Promise<void> {
    try {
      // 创建 canvas
      const canvas = document.createElement('canvas');
      this.viewport.appendChild(canvas);
      console.log('[Editor] Canvas created');
      
      // 初始化渲染器
      this.renderer = new Renderer(canvas);
      const rendererOk = await this.renderer.init();
      if (!rendererOk) {
        throw new Error('Renderer initialization failed');
      }
      console.log('[Editor] Renderer initialized');

      // 初始化场景管理器
      this.sceneManager = new SceneManager();
      this.sceneManager.createDefaultScene();
      console.log('[Editor] SceneManager initialized');

      // 设置轨道控制器
      const camera = this.sceneManager.getCamera();
      this.orbitControls = new OrbitControls(camera, this.renderer.getCanvas());
      this.orbitControls.enableDamping = true;
      this.orbitControls.dampingFactor = 0.05;
      console.log('[Editor] OrbitControls initialized');

      // 设置变换控制器
      this.transformControls = new TransformControls(camera, this.renderer.getCanvas());
      this.transformControls.addEventListener('dragging-changed', (e) => {
        const isDragging = Boolean(e.value);
        this.state.transformDragging = isDragging;
        if (this.orbitControls) {
          this.orbitControls.enabled = !isDragging;
        }
      });

      this.sceneManager.getScene().add(this.transformControls);
      console.log('[Editor] TransformControls initialized');

      // 隐藏加载界面
      this.overlay.classList.add('hidden');
      console.log('[Editor] Initialization complete');

      // 开始渲染循环
      this.animate();
    } catch (error) {
      console.error('[Editor] Initialization failed:', error);
      this.overlay.innerHTML = `<div style="color: red; padding: 20px;">
        <h3>初始化失败</h3>
        <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        <p>请检查浏览器控制台获取详细信息</p>
      </div>`;
    }
  }

  private animate(): void {
    requestAnimationFrame(() => this.animate());

    if (!this.sceneManager) return;

    // 更新轨道控制器
    if (this.orbitControls) {
      this.orbitControls.update();
    }

    // 更新方向光辅助对象
    this.syncDirectionalLightTargets();

    // 更新聚光灯目标点辅助线位置
    this.updateSpotLightTarget();

    // 更新选中框
    this.updateSelectionBox();

    // 渲染场景
    this.renderer.render(this.sceneManager.getScene(), this.sceneManager.getCamera());

    // 更新状态栏
    this.updateStatusBar();
  }

  private updateStatusBar(): void {
    if (!this.sceneManager) return;

    // 更新FPS
    const info = this.renderer.getInfo();
    this.statusFPS.textContent = `${Math.round(info.render.frame)} FPS`;

    // 更新对象数量
    let objectCount = 0;
    this.sceneManager.getScene().traverse((obj) => {
      if (obj.type === 'Mesh') objectCount++;
    });
    this.statusObjects.textContent = `${objectCount} objects`;

    // 更新渲染信息
    this.statusRender.textContent = `WebGPU`;
  }

  private setupUI(): void {
    // 设置工具栏按钮
    this.setupToolbarButtons();
    
    // 设置场景树
    this.refreshSceneTree();
    
    // 设置属性面板
    this.setupPropertyInputs();
    
    // 设置可拖拽工具栏
    this.setupDraggableToolbars();
  }

  private setupToolbarButtons(): void {
    // 变换模式按钮 - HTML uses tool-* IDs
    const translateBtn = document.getElementById('tool-translate');
    const rotateBtn = document.getElementById('tool-rotate');
    const scaleBtn = document.getElementById('tool-scale');

    translateBtn?.addEventListener('click', () => this.setTransformMode('translate'));
    rotateBtn?.addEventListener('click', () => this.setTransformMode('rotate'));
    scaleBtn?.addEventListener('click', () => this.setTransformMode('scale'));

    // 空间切换按钮 - HTML uses tool-local
    const localWorldBtn = document.getElementById('tool-local');
    localWorldBtn?.addEventListener('click', () => this.toggleSpace());

    // 添加基本体按钮
    const addCubeBtn = document.getElementById('btn-add-cube');
    const addSphereBtn = document.getElementById('btn-add-sphere');

    addCubeBtn?.addEventListener('click', () => this.addPrimitive('Box'));
    addSphereBtn?.addEventListener('click', () => this.addPrimitive('Sphere'));

    // 导入模型按钮
    const importBtn = document.getElementById('btn-import-model');
    importBtn?.addEventListener('click', () => this.importModel());

    // 新建场景按钮 - HTML uses btn-new
    const newSceneBtn = document.getElementById('btn-new');
    newSceneBtn?.addEventListener('click', () => this.newScene());

    // 打开场景按钮
    const openBtn = document.getElementById('btn-open');
    openBtn?.addEventListener('click', () => this.openScene());

    // 保存场景按钮
    const saveBtn = document.getElementById('btn-save');
    saveBtn?.addEventListener('click', () => this.saveScene());

    // 撤销/重做按钮
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');

    undoBtn?.addEventListener('click', () => this.undo());
    redoBtn?.addEventListener('click', () => this.redo());

    // 播放按钮
    const playBtn = document.getElementById('btn-play');
    playBtn?.addEventListener('click', () => this.togglePlay());

    // 发布按钮
    const publishBtn = document.getElementById('btn-publish');
    publishBtn?.addEventListener('click', () => this.publish());

    // 场景树筛选按钮 - HTML uses btn-filter-*
    const filterLightsBtn = document.getElementById('btn-filter-lights');
    const filterModelsBtn = document.getElementById('btn-filter-models');
    const filterHelpersBtn = document.getElementById('btn-filter-helpers');
    const filterCamerasBtn = document.getElementById('btn-filter-cameras');

    filterLightsBtn?.addEventListener('click', () => {
      this.treeFilter.lights = !this.treeFilter.lights;
      filterLightsBtn.classList.toggle('active', this.treeFilter.lights);
      this.refreshSceneTree();
    });

    filterModelsBtn?.addEventListener('click', () => {
      this.treeFilter.models = !this.treeFilter.models;
      filterModelsBtn.classList.toggle('active', this.treeFilter.models);
      this.refreshSceneTree();
    });

    filterHelpersBtn?.addEventListener('click', () => {
      this.treeFilter.helpers = !this.treeFilter.helpers;
      filterHelpersBtn.classList.toggle('active', this.treeFilter.helpers);
      this.refreshSceneTree();
    });

    filterCamerasBtn?.addEventListener('click', () => {
      this.treeFilter.cameras = !this.treeFilter.cameras;
      filterCamerasBtn.classList.toggle('active', this.treeFilter.cameras);
      this.refreshSceneTree();
    });

    // 展开/收起全部按钮
    const expandAllBtn = document.getElementById('btn-expand-all');
    const collapseAllBtn = document.getElementById('btn-collapse-all');

    expandAllBtn?.addEventListener('click', () => {
      this.collapsedObjects.clear();
      this.refreshSceneTree();
    });

    collapseAllBtn?.addEventListener('click', () => {
      if (!this.sceneManager) return;
      this.sceneManager.getScene().traverse((obj) => {
        if (obj.children.length > 0 && this.shouldShowObject(obj)) {
          this.collapsedObjects.add(obj.uuid);
        }
      });
      this.refreshSceneTree();
    });

    // 网格切换按钮
    const toggleGridBtn = document.getElementById('btn-toggle-grid');
    toggleGridBtn?.addEventListener('click', () => {
      if (!this.sceneManager) return;
      const isVisible = this.sceneManager.isGridHelperVisible();
      this.sceneManager.setGridHelperVisible(!isVisible);
      toggleGridBtn.classList.toggle('active', !isVisible);
    });

    // 灯光添加按钮
    const addAmbientBtn = document.getElementById('btn-add-ambient');
    const addDirectionalBtn = document.getElementById('btn-add-directional');
    const addPointBtn = document.getElementById('btn-add-point');
    const addSpotBtn = document.getElementById('btn-add-spot');
    const addHemisphereBtn = document.getElementById('btn-add-hemisphere');

    addAmbientBtn?.addEventListener('click', () => this.addLight('ambient'));
    addDirectionalBtn?.addEventListener('click', () => this.addLight('directional'));
    addPointBtn?.addEventListener('click', () => this.addLight('point'));
    addSpotBtn?.addEventListener('click', () => this.addLight('spot'));
    addHemisphereBtn?.addEventListener('click', () => this.addLight('hemisphere'));

    // 初始化按钮状态
    this.updateToolbarState();
    
    // 初始化筛选按钮状态
    filterLightsBtn?.classList.toggle('active', this.treeFilter.lights);
    filterModelsBtn?.classList.toggle('active', this.treeFilter.models);
    filterHelpersBtn?.classList.toggle('active', this.treeFilter.helpers);
    filterCamerasBtn?.classList.toggle('active', this.treeFilter.cameras);
    
    // 初始化网格按钮状态
    if (this.sceneManager) {
      toggleGridBtn?.classList.toggle('active', this.sceneManager.isGridHelperVisible());
    }
  }

  private setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void {
    this.state.transformMode = mode;
    if (this.transformControls) {
      this.transformControls.setMode(mode);
    }
    this.updateToolbarState();
  }

  private setSpace(space: 'local' | 'world'): void {
    this.state.space = space;
    if (this.transformControls) {
      this.transformControls.setSpace(space);
    }
    this.updateToolbarState();
  }

  private toggleSpace(): void {
    const newSpace = this.state.space === 'local' ? 'world' : 'local';
    this.setSpace(newSpace);
  }

  private updateToolbarState(): void {
    // 更新变换模式按钮状态 - HTML uses tool-* IDs
    document.getElementById('tool-translate')?.classList.toggle('active', this.state.transformMode === 'translate');
    document.getElementById('tool-rotate')?.classList.toggle('active', this.state.transformMode === 'rotate');
    document.getElementById('tool-scale')?.classList.toggle('active', this.state.transformMode === 'scale');
  }

  private setupEventListeners(): void {
    const canvas = this.renderer?.getCanvas();
    if (!canvas) return;

    // 指针事件
    const pointerDown = (e: PointerEvent) => this.handlePointerDown(e);
    canvas.addEventListener('pointerdown', pointerDown);
    this.eventListeners.push(() => canvas.removeEventListener('pointerdown', pointerDown));

    // 窗口大小调整
    const resize = () => this.handleResize();
    window.addEventListener('resize', resize);
    this.eventListeners.push(() => window.removeEventListener('resize', resize));

    // 变换控制器事件
    if (this.transformControls) {
      const transformChange = () => {
        if (this.state.selectedObject) {
          this.updatePropertyInputs();
        }
      };
      this.transformControls.addEventListener('change', transformChange);
      
      const transformStart = () => {
        if (this.state.selectedObject) {
          const obj = this.state.selectedObject;
          obj.userData.transformStart = {
            position: obj.position.clone(),
            rotation: obj.rotation.clone(),
            scale: obj.scale.clone()
          };
        }
      };
      this.transformControls.addEventListener('mouseDown', transformStart);

      const transformEnd = () => {
        if (this.state.selectedObject) {
          const obj = this.state.selectedObject;
          const start = obj.userData.transformStart;
          if (start) {
            const command = new TransformCommand(
              obj,
              start.position,
              start.rotation,
              start.scale
            );
            this.commandManager.execute(command);
            delete obj.userData.transformStart;
          }
        }
      };
      this.transformControls.addEventListener('mouseUp', transformEnd);
    }
  }

  private setupGlobalKeyboardListeners(): void {
    const keyDown = (e: KeyboardEvent) => {
      // 撤销/重做
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          this.redo();
        } else {
          this.undo();
        }
      }

      // 变换模式快捷键
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
        case 'f':
          this.focusOnSelected();
          break;
        case 'delete':
        case 'backspace':
          if (this.state.selectedObject) {
            this.deleteSelectedObject();
          }
          break;
      }
    };

    document.addEventListener('keydown', keyDown);
    this.eventListeners.push(() => document.removeEventListener('keydown', keyDown));
  }

  private deleteSelectedObject(): void {
    if (!this.state.selectedObject || !this.sceneManager) return;

    const obj = this.state.selectedObject;
    // Fix: Correct parameter order for RemoveObjectCommand
    const command = new RemoveObjectCommand(this.sceneManager, obj);
    this.commandManager.execute(command);

    this.selectObject(null);
    this.refreshSceneTree();
  }

  private handleResize(): void {
    if (!this.renderer || !this.sceneManager) return;

    const canvas = this.renderer.getCanvas();
    const parent = canvas.parentElement;
    if (!parent) return;

    const width = parent.clientWidth;
    const height = parent.clientHeight;

    this.renderer.setSize(width, height);
    
    const camera = this.sceneManager.getCamera();
    if (camera instanceof PerspectiveCamera) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  }

  private handlePointerDown(e: PointerEvent): void {
    if (!this.sceneManager) return;

    const canvas = this.renderer.getCanvas();
    const rect = canvas.getBoundingClientRect();

    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // 延迟执行选择逻辑，让TransformControls先处理事件
    setTimeout(() => {
      this.handleSelectionAfterTransformControls();
    }, 0);
  }

  private handleSelectionAfterTransformControls(): void {
    if (!this.sceneManager) return;

    // 如果TransformControls正在拖拽，忽略此次选择
    if (this.state.transformDragging) {
      return;
    }

    this.raycaster.setFromCamera(this.mouse, this.sceneManager.getCamera());

    const intersects = this.raycaster.intersectObjects(
      this.sceneManager.getScene().children,
      true
    );

    // 检查是否点击了TransformControls手柄 - 如果是则忽略此点击
    if (intersects.length > 0 && this.isTransformControlsChild(intersects[0].object)) {
      return; // 点击了变换控制手柄，保持当前选择不变
    }

    // 过滤掉其他辅助对象
    const validIntersects = intersects.filter(i => 
      !this.isGridHelperChild(i.object) &&
      !this.isDirectionalLightHelper(i.object)
    );

    if (validIntersects.length > 0) {
      let target = validIntersects[0].object;
      // 如果点击的是Mesh，查找其父级Group或选择Mesh本身
      while (target.parent && target.parent.type !== 'Scene') {
        if (target.parent.type === 'Group') {
          target = target.parent;
          break;
        }
        target = target.parent;
      }
      this.selectObject(target);
    }
    // 点击空白处不取消选择，保持当前选中状态
  }

  private isDirectionalLightHelper(obj: Object3D): boolean {
    for (const [, data] of this.directionalLightHelpers) {
      if (data.helper === obj || data.gizmo === obj) return true;
    }
    return false;
  }

  private selectObject(obj: Object3D | null): void {
    this.state.selectedObject = obj;

    // 更新变换控制器
    if (this.transformControls) {
      if (obj) {
        this.transformControls.visible = true;
        this.transformControls.enabled = true;
        this.transformControls.attach(obj);
        // 强制设置一个合适的尺寸
        this.transformControls.setSize(1);
      } else {
        this.transformControls.detach();
        this.transformControls.visible = false;
      }
    }

    // 更新属性面板
    this.updatePropertyInputs();

    // 更新场景树选中状态
    this.updateSceneTreeSelection();

    // 更新选中框
    if (obj) {
      this.createSelectionBox(obj);
    } else {
      this.clearSelectionBox();
    }

    // 处理灯光辅助对象
    this.clearDirectionalLightHelpers();
    this.clearSpotLightTargetHelper();

    if (obj instanceof DirectionalLight) {
      this.setupDirectionalLightHelper(obj);
    } else if (obj instanceof SpotLight) {
      this.setupSpotLightTargetHelper(obj);
    }

    // 更新UI
    const deleteBtn = document.getElementById('btn-delete');
    if (deleteBtn) {
      deleteBtn.style.display = obj ? 'block' : 'none';
    }
  }

  private updateSceneTreeSelection(): void {
    document.querySelectorAll('.scene-tree-item').forEach(item => {
      item.classList.remove('selected');
    });

    if (this.state.selectedObject) {
      const item = document.querySelector(`[data-uuid="${this.state.selectedObject.uuid}"]`);
      item?.classList.add('selected');
    }
  }

  private setupPropertyInputs(): void {
    this.setupTransformInputs();
    this.setupLightPropertyInputs();
    this.setupMaterialPropertyInputs();
    this.setupCameraPropertyInputs();
  }

  private setupTransformInputs(): void {
    const inputs = [
      'pos-x', 'pos-y', 'pos-z',
      'rot-x', 'rot-y', 'rot-z',
      'scale-x', 'scale-y', 'scale-z'
    ];

    // 存储变换前的状态
    let oldPosition = new Vector3();
    let oldRotation = new Euler();
    let oldScale = new Vector3();

    inputs.forEach(id => {
      const input = document.getElementById(id) as HTMLInputElement;
      if (!input) return;

      // 开始编辑时记录旧值
      input.addEventListener('focus', () => {
        if (this.state.selectedObject) {
          oldPosition.copy(this.state.selectedObject.position);
          oldRotation.copy(this.state.selectedObject.rotation);
          oldScale.copy(this.state.selectedObject.scale);
        }
      });

      // 实时更新
      input.addEventListener('input', () => this.updateTransformFromInputs());

      // 完成编辑时创建撤销命令
      input.addEventListener('change', () => {
        if (this.state.selectedObject && this.sceneManager) {
          const obj = this.state.selectedObject;
          const cmd = new TransformCommand(
            obj,
            oldPosition,
            oldRotation,
            oldScale
          );
          this.commandManager.execute(cmd);
          // 更新旧值为当前值，用于下次编辑
          oldPosition.copy(obj.position);
          oldRotation.copy(obj.rotation);
          oldScale.copy(obj.scale);
        }
      });
    });
  }

  private setupLightPropertyInputs(): void {
    // 颜色
    const colorInput = document.getElementById('light-color') as HTMLInputElement;
    if (colorInput) {
      colorInput.addEventListener('change', () => this.updateLightFromInputs());
    }

    // 强度 - 滑块和数字框同步
    const intensitySlider = document.getElementById('light-intensity-slider') as HTMLInputElement;
    const intensityInput = document.getElementById('light-intensity') as HTMLInputElement;
    if (intensitySlider && intensityInput) {
      intensitySlider.addEventListener('input', () => {
        intensityInput.value = intensitySlider.value;
        this.updateLightFromInputs();
      });
      intensityInput.addEventListener('change', () => {
        intensitySlider.value = intensityInput.value;
        this.updateLightFromInputs();
      });
    }

    // 距离
    const distanceSlider = document.getElementById('light-distance-slider') as HTMLInputElement;
    const distanceInput = document.getElementById('light-distance') as HTMLInputElement;
    if (distanceSlider && distanceInput) {
      distanceSlider.addEventListener('input', () => {
        distanceInput.value = distanceSlider.value;
        this.updateLightFromInputs();
      });
      distanceInput.addEventListener('change', () => {
        distanceSlider.value = distanceInput.value;
        this.updateLightFromInputs();
      });
    }

    // 角度
    const angleSlider = document.getElementById('light-angle-slider') as HTMLInputElement;
    const angleInput = document.getElementById('light-angle') as HTMLInputElement;
    if (angleSlider && angleInput) {
      angleSlider.addEventListener('input', () => {
        angleInput.value = angleSlider.value;
        this.updateLightFromInputs();
      });
      angleInput.addEventListener('change', () => {
        angleSlider.value = angleInput.value;
        this.updateLightFromInputs();
      });
    }

    // 半影
    const penumbraSlider = document.getElementById('light-penumbra-slider') as HTMLInputElement;
    const penumbraInput = document.getElementById('light-penumbra') as HTMLInputElement;
    if (penumbraSlider && penumbraInput) {
      penumbraSlider.addEventListener('input', () => {
        penumbraInput.value = penumbraSlider.value;
        this.updateLightFromInputs();
      });
      penumbraInput.addEventListener('change', () => {
        penumbraSlider.value = penumbraInput.value;
        this.updateLightFromInputs();
      });
    }

    // 衰减
    const decaySlider = document.getElementById('light-decay-slider') as HTMLInputElement;
    const decayInput = document.getElementById('light-decay') as HTMLInputElement;
    if (decaySlider && decayInput) {
      decaySlider.addEventListener('input', () => {
        decayInput.value = decaySlider.value;
        this.updateLightFromInputs();
      });
      decayInput.addEventListener('change', () => {
        decaySlider.value = decayInput.value;
        this.updateLightFromInputs();
      });
    }
  }

  private setupMaterialPropertyInputs(): void {
    // 颜色输入
    const colorInput = document.getElementById('material-color') as HTMLInputElement;
    if (colorInput) {
      colorInput.addEventListener('change', () => this.updateMaterialFromInputs());
    }

    // 自发光输入
    const emissiveInput = document.getElementById('material-emissive') as HTMLInputElement;
    if (emissiveInput) {
      emissiveInput.addEventListener('change', () => this.updateMaterialFromInputs());
    }

    // 粗糙度 - 滑块和数字框同步
    const roughnessSlider = document.getElementById('material-roughness-slider') as HTMLInputElement;
    const roughnessInput = document.getElementById('material-roughness') as HTMLInputElement;
    if (roughnessSlider && roughnessInput) {
      roughnessSlider.addEventListener('input', () => {
        roughnessInput.value = roughnessSlider.value;
        this.updateMaterialFromInputs();
      });
      roughnessInput.addEventListener('change', () => {
        roughnessSlider.value = roughnessInput.value;
        this.updateMaterialFromInputs();
      });
    }

    // 金属度 - 滑块和数字框同步
    const metalnessSlider = document.getElementById('material-metalness-slider') as HTMLInputElement;
    const metalnessInput = document.getElementById('material-metalness') as HTMLInputElement;
    if (metalnessSlider && metalnessInput) {
      metalnessSlider.addEventListener('input', () => {
        metalnessInput.value = metalnessSlider.value;
        this.updateMaterialFromInputs();
      });
      metalnessInput.addEventListener('change', () => {
        metalnessSlider.value = metalnessInput.value;
        this.updateMaterialFromInputs();
      });
    }

    // 不透明度
    const opacitySlider = document.getElementById('material-opacity-slider') as HTMLInputElement;
    const opacityInput = document.getElementById('material-opacity') as HTMLInputElement;
    if (opacitySlider && opacityInput) {
      opacitySlider.addEventListener('input', () => {
        opacityInput.value = opacitySlider.value;
        this.updateMaterialFromInputs();
      });
      opacityInput.addEventListener('change', () => {
        opacitySlider.value = opacityInput.value;
        this.updateMaterialFromInputs();
      });
    }

    // 透明开关
    const transparentCheck = document.getElementById('material-transparent') as HTMLInputElement;
    if (transparentCheck) {
      transparentCheck.addEventListener('change', () => this.updateMaterialFromInputs());
    }

    // 线框开关
    const wireframeCheck = document.getElementById('material-wireframe') as HTMLInputElement;
    if (wireframeCheck) {
      wireframeCheck.addEventListener('change', () => this.updateMaterialFromInputs());
    }

    // 清漆层
    const clearcoatSlider = document.getElementById('material-clearcoat-slider') as HTMLInputElement;
    const clearcoatInput = document.getElementById('material-clearcoat') as HTMLInputElement;
    if (clearcoatSlider && clearcoatInput) {
      clearcoatSlider.addEventListener('input', () => {
        clearcoatInput.value = clearcoatSlider.value;
        this.updateMaterialFromInputs();
      });
      clearcoatInput.addEventListener('change', () => {
        clearcoatSlider.value = clearcoatInput.value;
        this.updateMaterialFromInputs();
      });
    }
  }

  private setupCameraPropertyInputs(): void {
    // FOV
    const fovSlider = document.getElementById('camera-fov-slider') as HTMLInputElement;
    const fovInput = document.getElementById('camera-fov') as HTMLInputElement;
    if (fovSlider && fovInput) {
      fovSlider.addEventListener('input', () => {
        fovInput.value = fovSlider.value;
        this.updateCameraFromInputs();
      });
      fovInput.addEventListener('change', () => {
        fovSlider.value = fovInput.value;
        this.updateCameraFromInputs();
      });
    }

    // Near/Far
    const nearInput = document.getElementById('camera-near') as HTMLInputElement;
    const farInput = document.getElementById('camera-far') as HTMLInputElement;
    if (nearInput) nearInput.addEventListener('change', () => this.updateCameraFromInputs());
    if (farInput) farInput.addEventListener('change', () => this.updateCameraFromInputs());
  }

  private updateCameraFromInputs(): void {
    const camera = this.sceneManager?.getCamera();
    if (!camera || !(camera instanceof PerspectiveCamera)) return;

    const fovInput = document.getElementById('camera-fov') as HTMLInputElement;
    const nearInput = document.getElementById('camera-near') as HTMLInputElement;
    const farInput = document.getElementById('camera-far') as HTMLInputElement;

    if (fovInput) camera.fov = parseFloat(fovInput.value) || 50;
    if (nearInput) camera.near = parseFloat(nearInput.value) || 0.1;
    if (farInput) camera.far = parseFloat(farInput.value) || 1000;

    camera.updateProjectionMatrix();
  }

  private updatePropertyInputs(): void {
    const propertiesContent = document.getElementById('properties');
    
    if (!this.state.selectedObject) {
      const noSelection = document.getElementById('no-selection');
      if (propertiesContent) propertiesContent.style.display = 'block';
      if (noSelection) noSelection.style.display = 'block';
      // 隐藏所有属性面板
      const transformProperties = document.getElementById('transform-properties');
      const lightProperties = document.getElementById('light-properties');
      const materialProperties = document.getElementById('material-properties');
      const cameraProperties = document.getElementById('camera-properties');
      if (transformProperties) transformProperties.style.display = 'none';
      if (lightProperties) lightProperties.style.display = 'none';
      if (materialProperties) materialProperties.style.display = 'none';
      if (cameraProperties) cameraProperties.style.display = 'none';
      return;
    }

    // 显示属性容器
    if (propertiesContent) propertiesContent.style.display = 'block';

    const noSelection = document.getElementById('no-selection');
    if (noSelection) noSelection.style.display = 'none';

    // 显示属性内容
    const transformProperties = document.getElementById('transform-properties');
    const lightProperties = document.getElementById('light-properties');
    const materialProperties = document.getElementById('material-properties');
    const cameraProperties = document.getElementById('camera-properties');

    if (transformProperties) transformProperties.style.display = 'block';
    if (lightProperties) lightProperties.style.display = 'none';
    if (materialProperties) materialProperties.style.display = 'none';
    if (cameraProperties) cameraProperties.style.display = 'none';

    const obj = this.state.selectedObject;

    // 更新变换输入
    this.updateTransformInputs(obj);

    // 更新灯光属性
    if (obj instanceof Light) {
      if (lightProperties) lightProperties.style.display = 'block';
      this.updateLightInputs(obj);
    }

    // 更新材质属性
    if (obj instanceof Mesh) {
      if (materialProperties) materialProperties.style.display = 'block';
      this.updateMaterialInputs(obj);
    }

    // 更新摄像机属性
    if (obj instanceof Camera) {
      if (cameraProperties) cameraProperties.style.display = 'block';
      this.updateCameraInputs(obj);
    }

    // 更新对象名称
    const nameInput = document.getElementById('obj-name') as HTMLInputElement;
    if (nameInput) {
      nameInput.value = obj.name || obj.type;
    }

    // 更新对象类型显示
    const typeLabel = document.getElementById('obj-type');
    if (typeLabel) {
      typeLabel.textContent = obj.type;
    }
  }

  private updateTransformInputs(obj: Object3D): void {
    const posX = document.getElementById('pos-x') as HTMLInputElement;
    const posY = document.getElementById('pos-y') as HTMLInputElement;
    const posZ = document.getElementById('pos-z') as HTMLInputElement;

    if (posX) posX.value = obj.position.x.toFixed(3);
    if (posY) posY.value = obj.position.y.toFixed(3);
    if (posZ) posZ.value = obj.position.z.toFixed(3);

    const rotX = document.getElementById('rot-x') as HTMLInputElement;
    const rotY = document.getElementById('rot-y') as HTMLInputElement;
    const rotZ = document.getElementById('rot-z') as HTMLInputElement;

    const euler = new Euler().setFromQuaternion(obj.quaternion);
    if (rotX) rotX.value = MathUtils.radToDeg(euler.x).toFixed(2);
    if (rotY) rotY.value = MathUtils.radToDeg(euler.y).toFixed(2);
    if (rotZ) rotZ.value = MathUtils.radToDeg(euler.z).toFixed(2);

    const scaleX = document.getElementById('scale-x') as HTMLInputElement;
    const scaleY = document.getElementById('scale-y') as HTMLInputElement;
    const scaleZ = document.getElementById('scale-z') as HTMLInputElement;

    if (scaleX) scaleX.value = obj.scale.x.toFixed(3);
    if (scaleY) scaleY.value = obj.scale.y.toFixed(3);
    if (scaleZ) scaleZ.value = obj.scale.z.toFixed(3);
  }

  private updateLightInputs(light: Light): void {
    const container = document.getElementById('light-properties');
    if (container) {
      container.style.display = 'block';
    }

    const colorInput = document.getElementById('light-color') as HTMLInputElement;
    const intensityInput = document.getElementById('light-intensity') as HTMLInputElement;
    const intensitySlider = document.getElementById('light-intensity-slider') as HTMLInputElement;

    if (colorInput) colorInput.value = '#' + light.color.getHexString();
    if (intensityInput) {
      intensityInput.value = light.intensity.toFixed(1);
      if (intensitySlider) intensitySlider.value = light.intensity.toFixed(1);
    }

    // 特定灯光类型的属性 - 显示/隐藏对应行
    const distanceRow = document.getElementById('light-distance-row');
    const angleRow = document.getElementById('light-angle-row');
    const penumbraRow = document.getElementById('light-penumbra-row');
    const decayRow = document.getElementById('light-decay-row');

    // 默认隐藏特定属性
    if (distanceRow) distanceRow.style.display = 'none';
    if (angleRow) angleRow.style.display = 'none';
    if (penumbraRow) penumbraRow.style.display = 'none';
    if (decayRow) decayRow.style.display = 'none';

    if (light instanceof PointLight || light instanceof SpotLight) {
      if (distanceRow) {
        distanceRow.style.display = 'flex';
        const distanceInput = document.getElementById('light-distance') as HTMLInputElement;
        const distanceSlider = document.getElementById('light-distance-slider') as HTMLInputElement;
        if (distanceInput) distanceInput.value = (light.distance || 0).toString();
        if (distanceSlider) distanceSlider.value = (light.distance || 0).toString();
      }
    }

    if (light instanceof SpotLight) {
      if (angleRow) {
        angleRow.style.display = 'flex';
        const angleInput = document.getElementById('light-angle') as HTMLInputElement;
        const angleSlider = document.getElementById('light-angle-slider') as HTMLInputElement;
        const angleDeg = MathUtils.radToDeg(light.angle);
        if (angleInput) angleInput.value = angleDeg.toFixed(0);
        if (angleSlider) angleSlider.value = angleDeg.toFixed(0);
      }
      if (penumbraRow) {
        penumbraRow.style.display = 'flex';
        const penumbraInput = document.getElementById('light-penumbra') as HTMLInputElement;
        const penumbraSlider = document.getElementById('light-penumbra-slider') as HTMLInputElement;
        if (penumbraInput) penumbraInput.value = light.penumbra.toFixed(2);
        if (penumbraSlider) penumbraSlider.value = light.penumbra.toFixed(2);
      }
    }
  }

  private updateMaterialInputs(mesh: Mesh): void {
    const container = document.getElementById('material-properties');
    if (container) {
      container.style.display = 'block';
    }

    const material = mesh.material as any;
    if (!material) return;

    const colorInput = document.getElementById('material-color') as HTMLInputElement;
    const metalnessInput = document.getElementById('material-metalness') as HTMLInputElement;
    const metalnessSlider = document.getElementById('material-metalness-slider') as HTMLInputElement;
    const roughnessInput = document.getElementById('material-roughness') as HTMLInputElement;
    const roughnessSlider = document.getElementById('material-roughness-slider') as HTMLInputElement;
    const emissiveInput = document.getElementById('material-emissive') as HTMLInputElement;
    const opacityInput = document.getElementById('material-opacity') as HTMLInputElement;
    const opacitySlider = document.getElementById('material-opacity-slider') as HTMLInputElement;
    const transparentCheck = document.getElementById('material-transparent') as HTMLInputElement;
    const wireframeCheck = document.getElementById('material-wireframe') as HTMLInputElement;
    const clearcoatInput = document.getElementById('material-clearcoat') as HTMLInputElement;
    const clearcoatSlider = document.getElementById('material-clearcoat-slider') as HTMLInputElement;

    if (colorInput && material.color) {
      colorInput.value = '#' + material.color.getHexString();
    }
    if (metalnessInput && material.metalness !== undefined) {
      metalnessInput.value = material.metalness.toFixed(2);
      if (metalnessSlider) metalnessSlider.value = material.metalness.toFixed(2);
    }
    if (roughnessInput && material.roughness !== undefined) {
      roughnessInput.value = material.roughness.toFixed(2);
      if (roughnessSlider) roughnessSlider.value = material.roughness.toFixed(2);
    }
    if (emissiveInput && material.emissive) {
      emissiveInput.value = '#' + material.emissive.getHexString();
    }
    if (opacityInput && material.opacity !== undefined) {
      opacityInput.value = material.opacity.toFixed(2);
      if (opacitySlider) opacitySlider.value = material.opacity.toFixed(2);
    }
    if (transparentCheck && material.transparent !== undefined) {
      transparentCheck.checked = material.transparent;
    }
    if (wireframeCheck && material.wireframe !== undefined) {
      wireframeCheck.checked = material.wireframe;
    }
    if (clearcoatInput && material.clearcoat !== undefined) {
      clearcoatInput.value = material.clearcoat.toFixed(2);
      if (clearcoatSlider) clearcoatSlider.value = material.clearcoat.toFixed(2);
    }

    // 显示/隐藏清漆层（仅物理材质）
    const clearcoatRow = document.getElementById('material-clearcoat-row');
    if (clearcoatRow) {
      clearcoatRow.style.display = material.clearcoat !== undefined ? 'flex' : 'none';
    }
  }

  private updateCameraInputs(camera: Camera): void {
    const container = document.getElementById('camera-properties');
    if (container) {
      container.style.display = 'block';
    }

    const fovInput = document.getElementById('camera-fov') as HTMLInputElement;
    const fovSlider = document.getElementById('camera-fov-slider') as HTMLInputElement;
    const nearInput = document.getElementById('camera-near') as HTMLInputElement;
    const farInput = document.getElementById('camera-far') as HTMLInputElement;
    const typeLabel = document.getElementById('camera-type');

    if (camera instanceof PerspectiveCamera) {
      if (typeLabel) typeLabel.textContent = '透视相机';
      if (fovInput) {
        fovInput.value = camera.fov.toFixed(0);
        if (fovSlider) fovSlider.value = camera.fov.toFixed(0);
      }
      if (nearInput) nearInput.value = camera.near.toFixed(2);
      if (farInput) farInput.value = camera.far.toFixed(1);
    }
  }

  private updateTransformFromInputs(): void {
    if (!this.state.selectedObject) return;

    const obj = this.state.selectedObject;

    const posX = parseFloat((document.getElementById('pos-x') as HTMLInputElement)?.value || '0');
    const posY = parseFloat((document.getElementById('pos-y') as HTMLInputElement)?.value || '0');
    const posZ = parseFloat((document.getElementById('pos-z') as HTMLInputElement)?.value || '0');

    if (!isNaN(posX) && !isNaN(posY) && !isNaN(posZ)) {
      obj.position.set(posX, posY, posZ);
    }

    const rotX = parseFloat((document.getElementById('rot-x') as HTMLInputElement)?.value || '0');
    const rotY = parseFloat((document.getElementById('rot-y') as HTMLInputElement)?.value || '0');
    const rotZ = parseFloat((document.getElementById('rot-z') as HTMLInputElement)?.value || '0');

    if (!isNaN(rotX) && !isNaN(rotY) && !isNaN(rotZ)) {
      obj.rotation.set(
        MathUtils.degToRad(rotX),
        MathUtils.degToRad(rotY),
        MathUtils.degToRad(rotZ)
      );
    }

    const scaleX = parseFloat((document.getElementById('scale-x') as HTMLInputElement)?.value || '1');
    const scaleY = parseFloat((document.getElementById('scale-y') as HTMLInputElement)?.value || '1');
    const scaleZ = parseFloat((document.getElementById('scale-z') as HTMLInputElement)?.value || '1');

    if (!isNaN(scaleX) && !isNaN(scaleY) && !isNaN(scaleZ)) {
      obj.scale.set(scaleX, scaleY, scaleZ);
    }

    this.updateSelectionBox();
  }

  private updateLightFromInputs(): void {
    if (!this.state.selectedObject || !(this.state.selectedObject instanceof Light)) return;

    const light = this.state.selectedObject;

    const colorInput = document.getElementById('light-color') as HTMLInputElement;
    const intensityInput = document.getElementById('light-intensity') as HTMLInputElement;

    if (colorInput) light.color.set(colorInput.value);
    if (intensityInput) light.intensity = parseFloat(intensityInput.value) || 1;

    if (light instanceof PointLight || light instanceof SpotLight) {
      const distanceInput = document.getElementById('light-distance') as HTMLInputElement;
      if (distanceInput) light.distance = parseFloat(distanceInput.value) || 0;
    }

    if (light instanceof SpotLight) {
      const angleInput = document.getElementById('light-angle') as HTMLInputElement;
      const penumbraInput = document.getElementById('light-penumbra') as HTMLInputElement;
      if (angleInput) light.angle = MathUtils.degToRad(parseFloat(angleInput.value) || 45);
      if (penumbraInput) light.penumbra = parseFloat(penumbraInput.value) || 0;
    }
  }

  private updateMaterialFromInputs(): void {
    if (!this.state.selectedObject || !(this.state.selectedObject instanceof Mesh)) return;

    const mesh = this.state.selectedObject;
    const material = mesh.material as any;
    if (!material) return;

    const colorInput = document.getElementById('material-color') as HTMLInputElement;
    const metalnessInput = document.getElementById('material-metalness') as HTMLInputElement;
    const roughnessInput = document.getElementById('material-roughness') as HTMLInputElement;
    const emissiveInput = document.getElementById('material-emissive') as HTMLInputElement;
    const opacityInput = document.getElementById('material-opacity') as HTMLInputElement;
    const transparentCheck = document.getElementById('material-transparent') as HTMLInputElement;
    const wireframeCheck = document.getElementById('material-wireframe') as HTMLInputElement;
    const clearcoatInput = document.getElementById('material-clearcoat') as HTMLInputElement;

    if (colorInput && material.color) {
      material.color.set(colorInput.value);
    }
    if (metalnessInput && material.metalness !== undefined) {
      material.metalness = parseFloat(metalnessInput.value) || 0;
    }
    if (roughnessInput && material.roughness !== undefined) {
      material.roughness = parseFloat(roughnessInput.value) || 1;
    }
    if (emissiveInput && material.emissive) {
      material.emissive.set(emissiveInput.value);
    }
    if (opacityInput && material.opacity !== undefined) {
      material.opacity = parseFloat(opacityInput.value) || 1;
    }
    if (transparentCheck && material.transparent !== undefined) {
      material.transparent = transparentCheck.checked;
    }
    if (wireframeCheck && material.wireframe !== undefined) {
      material.wireframe = wireframeCheck.checked;
    }
    if (clearcoatInput && material.clearcoat !== undefined) {
      material.clearcoat = parseFloat(clearcoatInput.value) || 0;
    }

    // 标记材质需要更新
    material.needsUpdate = true;
  }

  private setupDraggableToolbars(): void {
    // 实现工具栏拖拽功能
    const toolbars = document.querySelectorAll('.toolbar');
    toolbars.forEach(toolbar => {
      const header = toolbar.querySelector('.toolbar-header');
      if (!header) return;

      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let startLeft = 0;
      let startTop = 0;

      const onMouseDown = (e: Event) => {
        const me = e as MouseEvent;
        isDragging = true;
        startX = me.clientX;
        startY = me.clientY;
        const rect = (toolbar as HTMLElement).getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        (toolbar as HTMLElement).style.position = 'fixed';
        (toolbar as HTMLElement).style.left = startLeft + 'px';
        (toolbar as HTMLElement).style.top = startTop + 'px';
      };

      const onMouseMove = (e: Event) => {
        if (!isDragging) return;
        const me = e as MouseEvent;
        const dx = me.clientX - startX;
        const dy = me.clientY - startY;
        (toolbar as HTMLElement).style.left = (startLeft + dx) + 'px';
        (toolbar as HTMLElement).style.top = (startTop + dy) + 'px';
      };

      const onMouseUp = () => {
        isDragging = false;
      };

      header.addEventListener('mousedown', onMouseDown);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);

      this.eventListeners.push(() => {
        header.removeEventListener('mousedown', onMouseDown);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      });
    });
  }

  private addPrimitive(type: 'Box' | 'Sphere' | 'Plane' | 'Cylinder' | 'Torus' | 'Custom'): void {
    if (!this.sceneManager) return;

    const mesh = this.sceneManager.createPrimitive(type);
    // 新建物体默认在原点 (0, 0, 0)
    mesh.position.set(0, 0, 0);

    const command = new AddObjectCommand(this.sceneManager, mesh);
    this.commandManager.execute(command);

    this.refreshSceneTree();
    this.selectObject(mesh);
    this.showToast(`Added ${type}`);
  }

  private addLight(type: 'ambient' | 'directional' | 'point' | 'spot' | 'hemisphere'): void {
    if (!this.sceneManager) return;

    let light: Light;

    switch (type) {
      case 'ambient':
        light = new AmbientLight(0xffffff, 0.5);
        break;
      case 'directional':
        light = new DirectionalLight(0xffffff, 1);
        light.position.set(5, 10, 5);
        break;
      case 'point':
        light = new PointLight(0xffffff, 1, 100);
        light.position.set(0, 5, 0);
        break;
      case 'spot': {
        const spotLight = new SpotLight(0xffffff, 1);
        spotLight.position.set(0, 10, 0);
        spotLight.target.position.set(0, 0, 0);
        light = spotLight;
        break;
      }
      case 'hemisphere':
        light = new HemisphereLight(0xffffff, 0x444444, 1);
        break;
      default:
        light = new PointLight(0xffffff, 1);
    }

    light.name = `${type} Light`;

    const command = new AddObjectCommand(this.sceneManager, light);
    this.commandManager.execute(command);

    this.refreshSceneTree();
    this.selectObject(light);
    this.showToast(`Added ${type} light`);
  }

  private async importModel(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.glb,.gltf,.obj,.fbx';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !this.sceneManager) return;

      try {
        this.showToast('Importing model...');
        const result = await this.modelImporter.importFromFile(file, {
          addToScene: false
        });

        if (result.success && result.object) {
          // Fix: Correct parameter order for AddObjectCommand
          const command = new AddObjectCommand(this.sceneManager, result.object);
          this.commandManager.execute(command);
          this.refreshSceneTree();
          this.selectObject(result.object);
          this.showToast('Model imported successfully');
        }
      } catch (error) {
        console.error('Import failed:', error);
        this.showToast('Import failed');
      }
    };

    input.click();
  }

  private newScene(): void {
    if (!this.sceneManager) return;

    if (confirm('Create a new scene? All unsaved changes will be lost.')) {
      this.sceneManager.clear();
      this.selectObject(null);
      this.refreshSceneTree();
      this.showToast('New scene created');
    }
  }

  private openScene(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !this.sceneManager) return;

      try {
        this.showToast('Loading scene...');
        const text = await file.text();
        const data = JSON.parse(text);
        
        // TODO: Implement scene deserialization
        // For now, just show a toast
        this.showToast('Scene loaded (TODO: implement full deserialization)');
      } catch (error) {
        console.error('Failed to load scene:', error);
        this.showToast('Failed to load scene');
      }
    };

    input.click();
  }

  private saveScene(): void {
    if (!this.sceneManager) return;

    try {
      const sceneData = this.sceneManager.toJSON();
      const json = SceneSerializer.serialize(sceneData, { name: 'My Scene' }, { prettyPrint: true });
      
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scene-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      this.showToast('Scene saved');
    } catch (error) {
      console.error('Failed to save scene:', error);
      this.showToast('Failed to save scene');
    }
  }

  private togglePlay(): void {
    this.showToast('Play mode toggled (TODO: implement play mode)');
  }

  private publish(): void {
    this.showToast('Publishing (TODO: implement publish)');
  }

  private refreshSceneTree(): void {
    const treeContainer = document.getElementById('scene-tree');
    if (!treeContainer || !this.sceneManager) return;

    treeContainer.innerHTML = '';

    const buildTree = (obj: Object3D, level = 0): HTMLElement | null => {
      if (!this.shouldShowObject(obj)) return null;

      const item = document.createElement('div');
      item.className = 'scene-tree-item';
      item.style.paddingLeft = `${level * 16 + 8}px`;
      item.dataset.uuid = obj.uuid;

      const icon = this.getObjectIcon(obj);
      const hasChildren = obj.children.some(c => this.shouldShowObject(c));
      const isCollapsed = this.collapsedObjects.has(obj.uuid);

      const isVisible = obj.visible;
      item.innerHTML = `
        <span class="tree-toggle ${hasChildren ? (isCollapsed ? 'collapsed' : 'expanded') : ''}" 
              style="visibility: ${hasChildren ? 'visible' : 'hidden'}">▶</span>
        <span class="tree-icon">${icon}</span>
        <span class="tree-label">${obj.name || obj.type}</span>
        <span class="tree-visibility ${isVisible ? 'visible' : 'hidden'}" title="点击切换显示/隐藏"></span>
      `;

      // 点击选中
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectObject(obj);
      });

      // 展开/折叠
      const toggle = item.querySelector('.tree-toggle');
      if (toggle && hasChildren) {
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.collapsedObjects.has(obj.uuid)) {
            this.collapsedObjects.delete(obj.uuid);
          } else {
            this.collapsedObjects.add(obj.uuid);
          }
          this.refreshSceneTree();
        });
      }

      // 显示/隐藏切换
      const visibilityToggle = item.querySelector('.tree-visibility');
      if (visibilityToggle) {
        visibilityToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          obj.visible = !obj.visible;
          this.refreshSceneTree();
        });
      }

      return item;
    };

    const traverseAndBuild = (obj: Object3D, level = 0, parent: HTMLElement) => {
      const item = buildTree(obj, level);
      if (item) {
        parent.appendChild(item);

        if (!this.collapsedObjects.has(obj.uuid)) {
          obj.children.forEach(child => {
            traverseAndBuild(child, level + 1, parent);
          });
        }
      }
    };

    this.sceneManager.getScene().children.forEach(child => {
      traverseAndBuild(child, 0, treeContainer);
    });

    this.treeEventListenersBound = true;
  }

  private shouldShowObject(obj: Object3D): boolean {
    // 不显示变换控制器子对象
    if (this.isTransformControlsChild(obj)) return false;

    // 不显示网格辅助对象
    if (this.isGridHelperChild(obj)) return false;

    // 不显示相机子对象
    if (this.isCameraChild(obj)) return false;

    // 不显示方向光辅助对象
    if (this.isDirectionalLightHelper(obj)) return false;

    // 不显示聚光灯目标辅助对象
    if (this.spotLightTargetHelper && 
        (obj === this.spotLightTargetHelper.mesh || 
         obj === this.spotLightTargetHelper.line)) return false;

    // 根据筛选条件
    if (obj instanceof Light && !this.treeFilter.lights) return false;
    if (obj instanceof Mesh && !this.treeFilter.models) return false;
    if (obj instanceof GridHelper && !this.treeFilter.helpers) return false;
    if (obj instanceof CameraHelper && !this.treeFilter.helpers) return false;
    if ((obj instanceof PerspectiveCamera || obj instanceof OrthographicCamera) && !this.treeFilter.cameras) return false;

    return true;
  }

  private hasVisibleChild(obj: Object3D): boolean {
    return obj.children.some(child => this.shouldShowObject(child));
  }

  private isTransformControlsChild(obj: Object3D): boolean {
    if (!this.transformControls) return false;
    let current: Object3D | null = obj;
    while (current) {
      if (current === this.transformControls) return true;
      current = current.parent;
    }
    return false;
  }

  private isGridHelperChild(obj: Object3D): boolean {
    return obj instanceof GridHelper || (obj.parent instanceof GridHelper);
  }

  private isCameraChild(obj: Object3D): boolean {
    return obj instanceof CameraHelper || (obj.parent instanceof PerspectiveCamera);
  }

  private isLightChild(obj: Object3D): boolean {
    return obj instanceof Light;
  }

  private expandParents(obj: Object3D): void {
    let current = obj.parent;
    while (current) {
      this.collapsedObjects.delete(current.uuid);
      current = current.parent;
    }
  }

  private adjustTransformControlsSize(): void {
    if (!this.transformControls || !this.sceneManager) return;

    const camera = this.sceneManager.getCamera();
    if (this.state.selectedObject && camera instanceof PerspectiveCamera) {
      const obj = this.state.selectedObject;
      const distance = camera.position.distanceTo(obj.position);
      const size = Math.max(0.5, distance / 10);
      this.transformControls.setSize(size);
    }
  }

  private focusOnSelected(): void {
    if (!this.state.selectedObject || !this.orbitControls || !this.sceneManager) return;

    const obj = this.state.selectedObject;
    const box = new Box3().setFromObject(obj);
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const distance = maxDim * 2;

    const camera = this.sceneManager.getCamera();
    if (camera instanceof PerspectiveCamera) {
      const targetPosition = center.clone().add(new Vector3(0, 0, distance));
      this.animateCameraTo(targetPosition, center);
    }
  }

  private animateCameraTo(targetPosition: Vector3, targetLookAt: Vector3): void {
    if (!this.sceneManager) return;

    const camera = this.sceneManager.getCamera();
    const startPosition = camera.position.clone();
    const startLookAt = this.orbitControls?.target.clone() || new Vector3();

    const duration = 500;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      camera.position.lerpVectors(startPosition, targetPosition, easeProgress);
      
      if (this.orbitControls) {
        this.orbitControls.target.lerpVectors(startLookAt, targetLookAt, easeProgress);
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }

  private showToast(message: string): void {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      z-index: 10000;
      font-size: 14px;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  private savePersistedState(): void {
    const state = {
      treeFilter: this.treeFilter,
      collapsedObjects: Array.from(this.collapsedObjects)
    };
    localStorage.setItem('editor-state', JSON.stringify(state));
  }

  private loadPersistedState(): void {
    try {
      const saved = localStorage.getItem('editor-state');
      if (saved) {
        const state = JSON.parse(saved);
        if (state.treeFilter) {
          this.treeFilter = { ...this.treeFilter, ...state.treeFilter };
        }
        if (state.collapsedObjects) {
          this.collapsedObjects = new Set(state.collapsedObjects);
        }
      }
    } catch (e) {
      console.warn('Failed to load persisted state:', e);
    }
  }

  private createSelectionBox(obj: Object3D): void {
    this.clearSelectionBox();

    if (!this.sceneManager) return;

    this.selectionBox = new BoxHelper(obj, 0xffff00);
    this.sceneManager.getScene().add(this.selectionBox);
  }

  private clearSelectionBox(): void {
    if (this.selectionBox && this.sceneManager) {
      this.sceneManager.getScene().remove(this.selectionBox);
      this.selectionBox.dispose();
      this.selectionBox = null;
    }
  }

  private updateSelectionBox(): void {
    if (this.selectionBox) {
      this.selectionBox.update();
    }
  }

  private setupDirectionalLightHelper(light: DirectionalLight): void {
    if (!this.sceneManager) return;

    this.clearDirectionalLightHelpers();

    // 创建目标点可视化和操控器
    const targetGeometry = new ConeGeometry(0.2, 0.4, 8);
    targetGeometry.rotateX(Math.PI / 2);
    const targetMaterial = new MeshBasicMaterial({ 
      color: 0xffff00,
      transparent: true,
      opacity: 0.8
    });
    const targetMesh = new Mesh(targetGeometry, targetMaterial);

    // 设置初始位置
    const targetPos = new Vector3();
    light.target.getWorldPosition(targetPos);
    targetMesh.position.copy(targetPos);
    targetMesh.name = 'DirectionalLight Target';

    // 创建连线
    const lineGeometry = new BufferGeometry().setFromPoints([
      light.position.clone(),
      targetPos.clone()
    ]);
    const lineMaterial = new LineBasicMaterial({ color: 0xffff00 });
    const line = new Line(lineGeometry, lineMaterial);
    line.name = 'DirectionalLight Line';

    // 添加到场景
    this.sceneManager.getScene().add(targetMesh);
    this.sceneManager.getScene().add(line);

    // 创建TransformControls
    const gizmo = new TransformControls(
      this.sceneManager.getCamera(),
      this.renderer.getCanvas()
    );
    gizmo.attach(targetMesh);
    gizmo.setSpace('world');
    this.sceneManager.getScene().add(gizmo);

    // 存储引用
    this.directionalLightHelpers.set(light.uuid, {
      helper: targetMesh,
      gizmo
    });

    // 监听目标点变化
    gizmo.addEventListener('change', () => {
      light.target.position.copy(targetMesh.position);
      light.target.updateMatrixWorld();

      // 更新连线
      const positions = new Float32Array([
        light.position.x, light.position.y, light.position.z,
        targetMesh.position.x, targetMesh.position.y, targetMesh.position.z
      ]);
      line.geometry.setAttribute('position', new BufferAttribute(positions, 3));
    });

    gizmo.addEventListener('dragging-changed', (e) => {
      if (this.orbitControls) {
        this.orbitControls.enabled = !Boolean(e.value);
      }
    });
  }

  private clearDirectionalLightHelpers(): void {
    if (!this.sceneManager) return;

    for (const [, data] of this.directionalLightHelpers) {
      this.sceneManager.getScene().remove(data.helper);
      this.sceneManager.getScene().remove(data.gizmo);
      data.helper.traverse((child) => {
        if (child instanceof Mesh) {
          child.geometry.dispose();
          (child.material as Material).dispose();
        }
      });
      data.gizmo.dispose();

      // 移除连线
      const line = this.sceneManager.getScene().getObjectByName('DirectionalLight Line');
      if (line) {
        this.sceneManager.getScene().remove(line);
        (line as Line).geometry.dispose();
        ((line as Line).material as Material).dispose();
      }
    }

    this.directionalLightHelpers.clear();
  }

  private syncDirectionalLightTargets(): void {
    if (!this.sceneManager) return;

    for (const [uuid, data] of this.directionalLightHelpers) {
      const light = this.sceneManager.getScene().getObjectByProperty('uuid', uuid) as DirectionalLight;
      if (!light) continue;

      // 更新连线位置（光源位置可能变化）
      const line = this.sceneManager.getScene().getObjectByName('DirectionalLight Line');
      if (line && line instanceof Line) {
        const positions = line.geometry.attributes.position.array as Float32Array;
        positions[0] = light.position.x;
        positions[1] = light.position.y;
        positions[2] = light.position.z;
        line.geometry.attributes.position.needsUpdate = true;
      }
    }
  }

  private setupSpotLightTargetHelper(light: SpotLight): void {
    if (!this.sceneManager) return;

    this.clearSpotLightTargetHelper();

    // 确保目标点在场景中
    if (light.target.parent !== this.sceneManager.getScene()) {
      this.sceneManager.getScene().add(light.target);
    }

    // 创建目标点可视化
    const targetGeometry = new ConeGeometry(0.15, 0.3, 8);
    targetGeometry.rotateX(Math.PI / 2);
    const targetMaterial = new MeshBasicMaterial({ 
      color: 0xffaa00,
      transparent: true,
      opacity: 0.8
    });
    const targetMesh = new Mesh(targetGeometry, targetMaterial);

    // 设置位置
    const targetPos = new Vector3();
    light.target.getWorldPosition(targetPos);
    targetMesh.position.copy(targetPos);
    targetMesh.name = 'SpotLight Target';

    // 创建连线
    const lineGeometry = new BufferGeometry().setFromPoints([
      light.position.clone(),
      targetPos.clone()
    ]);
    const lineMaterial = new LineBasicMaterial({ color: 0xffaa00 });
    const line = new Line(lineGeometry, lineMaterial);
    line.name = 'SpotLight Line';

    // 添加到场景
    this.sceneManager.getScene().add(targetMesh);
    this.sceneManager.getScene().add(line);

    // 创建TransformControls
    const gizmo = new TransformControls(
      this.sceneManager.getCamera(),
      this.renderer.getCanvas()
    );
    gizmo.attach(targetMesh);
    gizmo.setSpace('world');
    this.sceneManager.getScene().add(gizmo);

    // 存储引用
    this.spotLightTargetHelper = { mesh: targetMesh, gizmo, line };

    // 监听目标点变化
    gizmo.addEventListener('change', () => {
      light.target.position.copy(targetMesh.position);
      light.target.updateMatrixWorld();
    });

    gizmo.addEventListener('dragging-changed', (e) => {
      if (this.orbitControls) {
        this.orbitControls.enabled = !Boolean(e.value);
      }
    });
  }

  private clearSpotLightTargetHelper(): void {
    if (!this.spotLightTargetHelper || !this.sceneManager) return;

    const { mesh, gizmo, line } = this.spotLightTargetHelper;

    this.sceneManager.getScene().remove(mesh);
    this.sceneManager.getScene().remove(gizmo);
    this.sceneManager.getScene().remove(line);

    mesh.geometry.dispose();
    (mesh.material as Material).dispose();
    line.geometry.dispose();
    (line.material as Material).dispose();
    gizmo.dispose();

    this.spotLightTargetHelper = null;
  }

  private updateSpotLightTarget(): void {
    if (!this.spotLightTargetHelper || !this.sceneManager) return;

    const light = this.state.selectedObject;
    if (!(light instanceof SpotLight)) return;

    const { mesh, line } = this.spotLightTargetHelper;

    // 同步目标点位置
    const targetPos = new Vector3();
    light.target.getWorldPosition(targetPos);
    mesh.position.copy(targetPos);

    // 更新连线 - 连接光源位置到目标点
    const positions = line.geometry.attributes.position.array as Float32Array;
    positions[0] = light.position.x;
    positions[1] = light.position.y;
    positions[2] = light.position.z;
    positions[3] = targetPos.x;
    positions[4] = targetPos.y;
    positions[5] = targetPos.z;
    line.geometry.attributes.position.needsUpdate = true;
  }

  private getObjectIcon(obj: Object3D): string {
    if (obj instanceof Mesh) return '⬛';
    if (obj instanceof Group) return '📁';
    if (obj instanceof DirectionalLight) return '☀️';
    if (obj instanceof PointLight) return '💡';
    if (obj instanceof SpotLight) return '🔦';
    if (obj instanceof AmbientLight) return '🌅';
    if (obj instanceof HemisphereLight) return '🌈';
    if (obj instanceof PerspectiveCamera) return '📷';
    if (obj instanceof OrthographicCamera) return '📹';
    if (obj instanceof GridHelper) return '▦';
    return '📦';
  }

  private undo(): void {
    if (this.commandManager.canUndo()) {
      this.commandManager.undo();
      this.refreshSceneTree();
      this.updatePropertyInputs();
      this.showToast('Undo');
    }
  }

  private redo(): void {
    if (this.commandManager.canRedo()) {
      this.commandManager.redo();
      this.refreshSceneTree();
      this.updatePropertyInputs();
      this.showToast('Redo');
    }
  }

  private dispose(): void {
    // 清理所有事件监听器
    this.eventListeners.forEach(cleanup => cleanup());
    this.eventListeners = [];

    // 清理辅助对象
    this.clearDirectionalLightHelpers();
    this.clearSpotLightTargetHelper();
    this.clearSelectionBox();

    // 清理控制器
    if (this.transformControls) {
      this.transformControls.dispose();
    }
    if (this.orbitControls) {
      this.orbitControls.dispose();
    }

    // 清理场景
    if (this.sceneManager) {
      this.sceneManager.clear();
    }

    // 清理渲染器
    if (this.renderer) {
      this.renderer.dispose();
    }

    // 保存状态
    this.savePersistedState();
  }
}

new Editor();
