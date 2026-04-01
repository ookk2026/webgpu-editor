/**
 * 场景导出器 - 生成独立的 HTML 播放器文件
 * 允许将编辑好的场景导出为可独立运行的 HTML
 */

import type { Scene, Object3D, Mesh, Light, Camera, Material, Texture } from 'three';
import { SceneSerializer } from '../serialization/SceneSerializer';
import type { SceneData } from '../types';

export interface ExportOptions {
  title?: string;
  description?: string;
  author?: string;
  includeUI?: boolean;           // 是否包含控制 UI
  includePostProcessing?: boolean; // 是否包含后处理
  enableFullscreen?: boolean;    // 是否启用全屏
  backgroundColor?: string;      // 背景色
  autoRotate?: boolean;          // 自动旋转
  shadowMap?: boolean;           // 阴影
}

export interface ExportedScene {
  html: string;
  filename: string;
  size: number;
}

/**
 * 场景导出器
 */
export class SceneExporter {
  private static readonly TEMPLATE_VERSION = '1.0.0';
  private static readonly THREE_VERSION = '0.160.0';

  /**
   * 导出场景为独立 HTML 文件
   */
  static export(
    sceneData: SceneData,
    options: ExportOptions = {}
  ): ExportedScene {
    const opts = {
      title: sceneData.metadata.name || 'Exported Scene',
      description: sceneData.metadata.description || '',
      author: sceneData.metadata.author || 'WebGPU Editor',
      includeUI: true,
      includePostProcessing: true,
      enableFullscreen: true,
      backgroundColor: '#0a0a0a',
      autoRotate: false,
      shadowMap: true,
      ...options
    };

    const html = this.generateHTML(sceneData, opts);
    const filename = this.sanitizeFilename(opts.title) + '.html';
    
    return {
      html,
      filename,
      size: new Blob([html]).size
    };
  }

  /**
   * 从 Three.js 场景直接导出
   */
  static exportFromScene(
    scene: Scene,
    camera: Camera,
    options: ExportOptions = {}
  ): ExportedScene {
    // 这里简化处理，实际应该完整序列化场景
    const sceneData: SceneData = {
      version: this.TEMPLATE_VERSION,
      metadata: {
        name: options.title || 'Scene',
        description: options.description,
        created: Date.now(),
        modified: Date.now(),
        author: options.author
      },
      resources: {
        textures: [],
        materials: [],
        geometries: []
      },
      scene: {
        uuid: scene.uuid,
        type: 'Scene',
        name: scene.name || 'Scene',
        visible: true,
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        },
        children: this.serializeChildren(scene)
      }
    };

    return this.export(sceneData, options);
  }

  /**
   * 序列化场景子对象
   */
  private static serializeChildren(parent: Object3D): any[] {
    return parent.children
      .filter(child => !(child as any).isCamera && !(child as any).isTransformControls)
      .map(child => this.serializeObject(child));
  }

  /**
   * 序列化单个对象
   */
  private static serializeObject(obj: Object3D): any {
    const data: any = {
      uuid: obj.uuid,
      type: obj.type,
      name: obj.name,
      visible: obj.visible,
      transform: {
        position: [obj.position.x, obj.position.y, obj.position.z],
        rotation: [
          this.radToDeg(obj.rotation.x),
          this.radToDeg(obj.rotation.y),
          this.radToDeg(obj.rotation.z)
        ],
        scale: [obj.scale.x, obj.scale.y, obj.scale.z]
      },
      children: this.serializeChildren(obj)
    };

    // Mesh 特有属性
    if ((obj as Mesh).isMesh) {
      const mesh = obj as Mesh;
      const geometry = mesh.geometry;
      const material = mesh.material as Material;

      data.geometry = {
        type: geometry.type,
        parameters: this.extractGeometryParams(geometry)
      };

      if (material) {
        data.material = this.serializeMaterial(material);
      }
    }

    // Light 特有属性
    if ((obj as Light).isLight) {
      const light = obj as Light;
      data.light = {
        color: [light.color.r, light.color.g, light.color.b],
        intensity: light.intensity
      };

      if ((light as any).distance !== undefined) {
        data.light.distance = (light as any).distance;
      }
      if ((light as any).angle !== undefined) {
        data.light.angle = (light as any).angle;
      }
    }

    return data;
  }

  /**
   * 提取几何体参数
   */
  private static extractGeometryParams(geometry: any): any {
    const params: any = {};
    
    if (geometry.parameters) {
      Object.keys(geometry.parameters).forEach(key => {
        params[key] = geometry.parameters[key];
      });
    }

    return params;
  }

  /**
   * 序列化材质
   */
  private static serializeMaterial(material: Material): any {
    const mat = material as any;
    const data: any = {
      type: material.type,
      color: mat.color ? [mat.color.r, mat.color.g, mat.color.b] : [1, 1, 1]
    };

    if (mat.emissive) {
      data.emissive = [mat.emissive.r, mat.emissive.g, mat.emissive.b];
    }
    if (mat.roughness !== undefined) data.roughness = mat.roughness;
    if (mat.metalness !== undefined) data.metalness = mat.metalness;
    if (mat.transparent !== undefined) data.transparent = mat.transparent;
    if (mat.opacity !== undefined) data.opacity = mat.opacity;
    if (mat.wireframe !== undefined) data.wireframe = mat.wireframe;

    return data;
  }

  /**
   * 生成完整 HTML 文件
   */
  private static generateHTML(sceneData: SceneData, options: Required<ExportOptions>): string {
    const sceneJSON = JSON.stringify(sceneData, null, 2);
    
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>${this.escapeHTML(options.title)}</title>
  <meta name="description" content="${this.escapeHTML(options.description)}">
  <meta name="author" content="${this.escapeHTML(options.author)}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      width: 100%; 
      height: 100%; 
      overflow: hidden; 
      background: ${options.backgroundColor};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    }
    #container { 
      width: 100%; 
      height: 100%; 
      position: relative;
    }
    canvas { 
      width: 100% !important; 
      height: 100% !important; 
      display: block;
    }
    ${options.includeUI ? this.getUIStyles() : ''}
    #loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #666;
      font-size: 14px;
      pointer-events: none;
      transition: opacity 0.5s;
    }
    #loading.hidden { opacity: 0; }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255,255,255,0.1);
      border-top-color: #0e8add;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 12px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="container">
    <div id="loading">
      <div class="spinner"></div>
      <div>Loading Scene...</div>
    </div>
    ${options.includeUI ? this.getUIHTML(options) : ''}
  </div>

  <script type="importmap">
  {
    "imports": {
      "three": "https://unpkg.com/three@${this.THREE_VERSION}/build/three.module.js",
      "three/addons/": "https://unpkg.com/three@${this.THREE_VERSION}/examples/jsm/"
    }
  }
  </script>
  
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    ${options.includePostProcessing ? this.getPostProcessingImports() : ''}

    // 场景数据
    const sceneData = ${sceneJSON};

    // 场景播放器类
    class ScenePlayer {
      constructor() {
        this.container = document.getElementById('container');
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.composer = null;
        this.clock = new THREE.Clock();
        
        this.init();
      }

      init() {
        // 渲染器
        this.renderer = new THREE.WebGLRenderer({ 
          antialias: true,
          powerPreference: 'high-performance',
          alpha: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        ${options.shadowMap ? `
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        ` : ''}
        this.renderer.setClearColor('${options.backgroundColor}');
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.container.appendChild(this.renderer.domElement);

        // 场景
        this.scene = this.parseScene(sceneData.scene);

        // 相机
        this.camera = new THREE.PerspectiveCamera(
          60,
          window.innerWidth / window.innerHeight,
          0.1,
          1000
        );
        this.camera.position.set(5, 5, 5);
        this.camera.lookAt(0, 0, 0);

        // 控制器
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.autoRotate = ${options.autoRotate};

        ${options.includePostProcessing ? this.getPostProcessingSetup() : ''}

        // 事件
        window.addEventListener('resize', () => this.onResize());

        // 隐藏加载
        document.getElementById('loading').classList.add('hidden');

        // 开始动画
        this.animate();
      }

      parseScene(data) {
        const scene = new THREE.Scene();
        scene.name = data.name;

        // 递归解析对象
        const parseObject = (objData) => {
          let obj;

          switch (objData.type) {
            case 'Scene':
              obj = new THREE.Scene();
              break;
            case 'Mesh':
              obj = this.createMesh(objData);
              break;
            case 'Group':
              obj = new THREE.Group();
              break;
            case 'AmbientLight':
              obj = new THREE.AmbientLight(
                new THREE.Color(...objData.light.color),
                objData.light.intensity
              );
              break;
            case 'DirectionalLight':
              obj = new THREE.DirectionalLight(
                new THREE.Color(...objData.light.color),
                objData.light.intensity
              );
              obj.castShadow = true;
              break;
            case 'PointLight':
              obj = new THREE.PointLight(
                new THREE.Color(...objData.light.color),
                objData.light.intensity,
                objData.light.distance
              );
              break;
            case 'SpotLight':
              obj = new THREE.SpotLight(
                new THREE.Color(...objData.light.color),
                objData.light.intensity,
                objData.light.distance,
                objData.light.angle,
                objData.light.penumbra,
                objData.light.decay
              );
              break;
            case 'PerspectiveCamera':
            case 'OrthographicCamera':
              // 跳过相机
              return null;
            default:
              obj = new THREE.Object3D();
          }

          if (obj) {
            obj.name = objData.name;
            obj.visible = objData.visible;
            obj.position.set(...objData.transform.position);
            obj.rotation.set(
              THREE.MathUtils.degToRad(objData.transform.rotation[0]),
              THREE.MathUtils.degToRad(objData.transform.rotation[1]),
              THREE.MathUtils.degToRad(objData.transform.rotation[2])
            );
            obj.scale.set(...objData.transform.scale);

            // 递归子对象
            if (objData.children) {
              objData.children.forEach(childData => {
                const child = parseObject(childData);
                if (child) obj.add(child);
              });
            }
          }

          return obj;
        };

        // 解析场景子对象
        if (data.children) {
          data.children.forEach(childData => {
            const child = parseObject(childData);
            if (child) scene.add(child);
          });
        }

        return scene;
      }

      createMesh(data) {
        // 创建几何体
        let geometry;
        const params = data.geometry?.parameters || {};
        
        switch (data.geometry?.type) {
          case 'BoxGeometry':
            geometry = new THREE.BoxGeometry(
              params.width || 1,
              params.height || 1,
              params.depth || 1
            );
            break;
          case 'SphereGeometry':
            geometry = new THREE.SphereGeometry(
              params.radius || 0.5,
              params.widthSegments || 32,
              params.heightSegments || 16
            );
            break;
          case 'CylinderGeometry':
            geometry = new THREE.CylinderGeometry(
              params.radiusTop || 0.5,
              params.radiusBottom || 0.5,
              params.height || 1,
              params.radialSegments || 32
            );
            break;
          case 'PlaneGeometry':
            geometry = new THREE.PlaneGeometry(
              params.width || 1,
              params.height || 1
            );
            break;
          case 'TorusGeometry':
            geometry = new THREE.TorusGeometry(
              params.radius || 0.5,
              params.tube || 0.2,
              params.radialSegments || 16,
              params.tubularSegments || 100
            );
            break;
          default:
            geometry = new THREE.BoxGeometry(1, 1, 1);
        }

        // 创建材质
        let material;
        const matData = data.material || { type: 'MeshStandardMaterial', color: [0.8, 0.8, 0.8] };
        const color = new THREE.Color(...matData.color);

        switch (matData.type) {
          case 'MeshBasicMaterial':
            material = new THREE.MeshBasicMaterial({ color: color });
            break;
          case 'MeshPhongMaterial':
            material = new THREE.MeshPhongMaterial({ color: color });
            break;
          case 'MeshStandardMaterial':
          default:
            material = new THREE.MeshStandardMaterial({
              color: color,
              roughness: matData.roughness ?? 0.5,
              metalness: matData.metalness ?? 0,
              emissive: matData.emissive ? new THREE.Color(...matData.emissive) : new THREE.Color(0, 0, 0),
              transparent: matData.transparent ?? false,
              opacity: matData.opacity ?? 1,
              wireframe: matData.wireframe ?? false
            });
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
      }

      onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        ${options.includePostProcessing ? `
        if (this.composer) {
          this.composer.setSize(window.innerWidth, window.innerHeight);
        }
        ` : ''}
      }

      animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        
        ${options.includePostProcessing ? `
        if (this.composer) {
          this.composer.render();
        } else {
          this.renderer.render(this.scene, this.camera);
        }
        ` : `
        this.renderer.render(this.scene, this.camera);
        `}
      }

      ${options.includeUI ? this.getUIMethods() : ''}
    }

    // 启动播放器
    new ScenePlayer();
  </script>
</body>
</html>`;
  }

  /**
   * 获取后处理导入代码
   */
  private static getPostProcessingImports(): string {
    return `
    import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
    import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
    import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
    import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';`;
  }

  /**
   * 获取后处理设置代码
   */
  private static getPostProcessingSetup(): string {
    return `
        // 后处理
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        
        const bloomPass = new UnrealBloomPass(
          new THREE.Vector2(window.innerWidth, window.innerHeight),
          0.5, 0.4, 0.85
        );
        this.composer.addPass(bloomPass);
        
        this.composer.addPass(new OutputPass());`;
  }

  /**
   * 获取 UI 样式
   */
  private static getUIStyles(): string {
    return `
    #ui {
      position: absolute;
      top: 20px;
      left: 20px;
      z-index: 100;
      color: white;
    }
    #ui h1 {
      font-size: 18px;
      font-weight: 500;
      margin-bottom: 8px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.5);
    }
    #ui p {
      font-size: 12px;
      opacity: 0.7;
      max-width: 300px;
      line-height: 1.5;
    }
    #controls {
      position: absolute;
      bottom: 20px;
      right: 20px;
      display: flex;
      gap: 10px;
      z-index: 100;
    }
    #controls button {
      padding: 8px 16px;
      background: rgba(0,0,0,0.6);
      border: 1px solid rgba(255,255,255,0.2);
      color: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      backdrop-filter: blur(10px);
      transition: all 0.2s;
    }
    #controls button:hover {
      background: rgba(255,255,255,0.1);
    }`;
  }

  /**
   * 获取 UI HTML
   */
  private static getUIHTML(options: ExportOptions): string {
    return `
    <div id="ui">
      <h1>${this.escapeHTML(options.title)}</h1>
      ${options.description ? `<p>${this.escapeHTML(options.description)}</p>` : ''}
    </div>
    <div id="controls">
      <button onclick="player.toggleAutoRotate()">🔄 自动旋转</button>
      <button onclick="player.resetCamera()">📷 重置视角</button>
      ${options.enableFullscreen ? '<button onclick="player.toggleFullscreen()">⛶ 全屏</button>' : ''}
    </div>`;
  }

  /**
   * 获取 UI 方法
   */
  private static getUIMethods(): string {
    return `
      toggleAutoRotate() {
        this.controls.autoRotate = !this.controls.autoRotate;
      }

      resetCamera() {
        this.camera.position.set(5, 5, 5);
        this.camera.lookAt(0, 0, 0);
        this.controls.reset();
      }

      toggleFullscreen() {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen();
        } else {
          document.exitFullscreen();
        }
      }`;
  }

  /**
   * 转义 HTML 特殊字符
   */
  private static escapeHTML(str: string | undefined): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * 清理文件名
   */
  private static sanitizeFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'scene';
  }

  /**
   * 角度转弧度
   */
  private static radToDeg(rad: number): number {
    return rad * (180 / Math.PI);
  }

  /**
   * 下载 HTML 文件
   */
  static download(data: ExportedScene): void {
    const blob = new Blob([data.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
