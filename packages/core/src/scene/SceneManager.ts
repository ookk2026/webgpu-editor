import {
  Scene,
  PerspectiveCamera,
  OrthographicCamera,
  CameraHelper,
  GridHelper,
  Mesh,
  Group,
  Object3D,
  BoxGeometry,
  SphereGeometry,
  PlaneGeometry,
  CylinderGeometry,
  TorusGeometry,
  ConeGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  LineBasicMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  LineSegments,
  AmbientLight,
  DirectionalLight,
  PointLight,
  SpotLight,
  HemisphereLight,
  RectAreaLight,
  Color,
  Vector3,
  Euler,
  MathUtils
} from 'three';
import type { SceneNodeData, SceneNodeType, TransformData, GeometryData, MaterialData, LightData, CameraData } from '../types';

export interface SceneManagerConfig {
  defaultCamera?: 'perspective' | 'orthographic';
  backgroundColor?: string | number;
}

export class SceneManager {
  private scene: Scene;
  private camera: PerspectiveCamera | OrthographicCamera;
  private cameraHelper: CameraHelper | null = null;
  private gridHelper: GridHelper;
  private config: SceneManagerConfig;
  private selectedObject: Object3D | null = null;
  private objectMap: Map<string, Object3D> = new Map();

  constructor(config: SceneManagerConfig = {}) {
    this.config = {
      defaultCamera: 'perspective',
      backgroundColor: 0x1a1a1a,
      ...config
    };

    this.scene = this.createScene();
    this.camera = this.createDefaultCamera();
    this.addCameraToScene();
    this.gridHelper = this.createGridHelper();
  }

  /**
   * 创建场景
   */
  private createScene(): Scene {
    const scene = new Scene();
    scene.name = 'Scene';
    if (this.config.backgroundColor) {
      scene.background = new Color(this.config.backgroundColor);
    }
    return scene;
  }

  /**
   * 创建默认相机
   */
  private createDefaultCamera(): PerspectiveCamera | OrthographicCamera {
    const aspect = 16 / 9;
    
    if (this.config.defaultCamera === 'orthographic') {
      const frustumSize = 10;
      return new OrthographicCamera(
        frustumSize * aspect / -2,
        frustumSize * aspect / 2,
        frustumSize / 2,
        frustumSize / -2,
        0.1,
        1000
      );
    }

    const camera = new PerspectiveCamera(75, aspect, 0.1, 1000);
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    camera.name = '主摄像机';
    return camera;
  }

  /**
   * 将摄像机添加到场景，使其可见并可被选中
   */
  private addCameraToScene(): void {
    // 将摄像机添加到场景
    this.scene.add(this.camera);
    this.registerObject(this.camera);
    
    // 清理摄像机上旧的可视化模型（避免重复创建）
    const oldMeshes: Object3D[] = [];
    this.camera.children.forEach(child => {
      if (child.name === '摄像机模型') {
        oldMeshes.push(child);
      }
    });
    oldMeshes.forEach(mesh => this.camera.remove(mesh));
    
    // 创建摄像机可视化模型（一个相机形状的 Mesh）
    const cameraMesh = this.createCameraMesh();
    cameraMesh.name = '摄像机模型';
    this.camera.add(cameraMesh);
    
    // 创建摄像机辅助对象（视锥线框）- 添加到场景而不是摄像机
    this.cameraHelper = new CameraHelper(this.camera);
    this.cameraHelper.name = '摄像机辅助线';
    this.scene.add(this.cameraHelper);
    
    // 默认隐藏辅助线，选中摄像机时才显示
    this.cameraHelper.visible = false;
  }

  /**
   * 创建网格辅助对象
   */
  private createGridHelper(): GridHelper {
    const grid = new GridHelper(20, 20, 0x666666, 0x444444);
    grid.name = '网格辅助线';
    this.scene.add(grid);
    this.registerObject(grid);
    return grid;
  }

  /**
   * 设置网格辅助线可见性
   */
  setGridHelperVisible(visible: boolean): void {
    this.gridHelper.visible = visible;
  }

  /**
   * 获取网格辅助线可见性
   */
  isGridHelperVisible(): boolean {
    return this.gridHelper.visible;
  }

  /**
   * 创建摄像机可视化模型
   */
  private createCameraMesh(): Mesh {
    // 创建相机机身（长方体）
    const bodyGeometry = new BoxGeometry(0.6, 0.4, 0.3);
    const bodyMaterial = new MeshBasicMaterial({ 
      color: 0x2196F3,
      transparent: true,
      opacity: 0.8
    });
    const body = new Mesh(bodyGeometry, bodyMaterial);
    body.name = '机身';
    
    // 相机镜头（圆柱体）
    const lensGeometry = new CylinderGeometry(0.15, 0.15, 0.3, 16);
    const lensMaterial = new MeshBasicMaterial({ 
      color: 0x111111,
      transparent: true,
      opacity: 0.9
    });
    const lens = new Mesh(lensGeometry, lensMaterial);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.25;
    lens.name = '镜头';
    
    // 将镜头作为机身的子对象
    body.add(lens);
    
    // 设置用户数据以便识别这是摄像机的一部分
    body.userData.isCameraMesh = true;
    body.userData.parentCamera = this.camera;
    
    return body;
  }

  /**
   * 获取场景
   */
  getScene(): Scene {
    return this.scene;
  }

  /**
   * 获取相机
   */
  getCamera(): PerspectiveCamera | OrthographicCamera {
    return this.camera;
  }

  /**
   * 更新相机比例
   */
  updateCameraAspect(width: number, height: number): void {
    const aspect = width / height;
    
    if (this.camera instanceof PerspectiveCamera) {
      this.camera.aspect = aspect;
    } else {
      const frustumSize = 10;
      this.camera.left = -frustumSize * aspect / 2;
      this.camera.right = frustumSize * aspect / 2;
      this.camera.top = frustumSize / 2;
      this.camera.bottom = -frustumSize / 2;
    }
    
    this.camera.updateProjectionMatrix();
  }

  /**
   * 创建基础几何体
   */
  createPrimitive(
    type: GeometryData['type'],
    materialData?: MaterialData,
    name?: string
  ): Mesh {
    const geometry = this.createGeometry(type);
    const material = this.createMaterial(materialData);
    const mesh = new Mesh(geometry, material);
    
    mesh.name = name || `${type}_${MathUtils.generateUUID().slice(0, 8)}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    this.objectMap.set(mesh.uuid, mesh);
    return mesh;
  }

  /**
   * 创建几何体
   */
  private createGeometry(type: GeometryData['type']) {
    switch (type) {
      case 'Box':
        return new BoxGeometry(1, 1, 1);
      case 'Sphere':
        return new SphereGeometry(0.5, 32, 16);
      case 'Plane':
        return new PlaneGeometry(1, 1);
      case 'Cylinder':
        return new CylinderGeometry(0.5, 0.5, 1, 32);
      case 'Torus':
        return new TorusGeometry(0.5, 0.2, 16, 100);
      default:
        return new BoxGeometry(1, 1, 1);
    }
  }

  /**
   * 创建材质
   */
  private createMaterial(data?: MaterialData): MeshStandardMaterial | MeshBasicMaterial {
    if (!data || data.type === 'MeshStandard' || data.type === 'MeshPhysical') {
      const mat = new MeshStandardMaterial({
        color: data?.color ? new Color(...data.color) : 0x888888,
        roughness: data?.roughness ?? 0.5,
        metalness: data?.metalness ?? 0.0,
      });
      if (data?.transparent) {
        mat.transparent = true;
        mat.opacity = data.opacity ?? 1;
      }
      return mat;
    }

    return new MeshBasicMaterial({
      color: data?.color ? new Color(...data.color) : 0x888888,
      transparent: data?.transparent,
      opacity: data?.opacity
    });
  }

  /**
   * 创建光源
   */
  createLight(type: 'ambient' | 'directional' | 'point' | 'spot' | 'hemisphere' | 'rectarea', data?: LightData): AmbientLight | DirectionalLight | PointLight | SpotLight | HemisphereLight | RectAreaLight {
    let light: AmbientLight | DirectionalLight | PointLight | SpotLight | HemisphereLight | RectAreaLight;
    const color = data?.color ? new Color(...data.color) : 0xffffff;
    const intensity = data?.intensity ?? 1;

    switch (type) {
      case 'ambient':
        light = new AmbientLight(color, intensity);
        break;
      case 'directional':
        light = new DirectionalLight(color, intensity);
        light.castShadow = data?.castShadow ?? true;
        break;
      case 'point':
        light = new PointLight(color, intensity, data?.distance, data?.decay);
        light.castShadow = data?.castShadow ?? true;
        break;
      case 'spot':
        light = new SpotLight(
          color, 
          intensity, 
          data?.distance, 
          data?.angle, 
          data?.penumbra, 
          data?.decay
        );
        light.castShadow = data?.castShadow ?? true;
        break;
      case 'hemisphere':
        const skyColor = data?.color ? new Color(...data.color) : 0xffffff;
        const groundColor = data?.groundColor ? new Color(...data.groundColor) : 0x444444;
        light = new HemisphereLight(skyColor, groundColor, intensity);
        break;
      case 'rectarea':
        light = new RectAreaLight(color, intensity, data?.width ?? 10, data?.height ?? 10);
        break;
      default:
        light = new AmbientLight(color, intensity);
    }

    light.name = `${type}_${MathUtils.generateUUID().slice(0, 8)}`;
    
    // 添加灯光辅助对象 - 添加到灯光本身，自动跟随
    const helper = this.createLightHelper(light, type);
    if (helper) {
      light.userData.helper = helper;
      light.userData.helperLight = light; // 记录关联的灯光
      light.add(helper);
      // 默认显示辅助对象
      helper.visible = true;
    }
    
    // 如果是聚光灯，添加 target 作为子对象并注册
    if (light instanceof SpotLight) {
      light.target.name = `目标点`;
      light.target.userData.isSpotLightTarget = true;
      light.target.userData.parentLight = light;
      light.add(light.target);
      this.registerObject(light.target);
    }
    
    this.objectMap.set(light.uuid, light);
    return light;
  }

  /**
   * 创建灯光辅助对象
   */
  private createLightHelper(light: AmbientLight | DirectionalLight | PointLight | SpotLight | HemisphereLight | RectAreaLight, type: string): Object3D | null {
    if (type === 'ambient') return null;

    const color = 0xffff00;
    const material = new LineBasicMaterial({ color, transparent: true, opacity: 0.5 });

    if (light instanceof DirectionalLight) {
      // 方向光 - 创建可选择的箭头辅助对象
      const helperGroup = new Group();
      helperGroup.name = 'DirectionalLightHelper';
      helperGroup.userData = {
        isLightHelper: true,
        parentLight: light
      };
      
      // 创建箭头几何体
      const arrowGeometry = new ConeGeometry(0.2, 0.6, 8);
      arrowGeometry.rotateX(-Math.PI / 2);
      const arrowMaterial = new MeshBasicMaterial({ 
        color: 0xffff00, 
        transparent: true, 
        opacity: 0.8,
        depthTest: false
      });
      const arrow = new Mesh(arrowGeometry, arrowMaterial);
      arrow.position.z = -1;
      arrow.renderOrder = 999;
      arrow.userData = {
        isLightHelper: true,
        parentLight: light
      };
      helperGroup.add(arrow);
      
      // 添加一条线表示光线
      const lineGeometry = new BufferGeometry().setFromPoints([
        new Vector3(0, 0, 0),
        new Vector3(0, 0, -1.5)
      ]);
      const line = new LineSegments(lineGeometry, material);
      line.renderOrder = 998;
      line.userData = { isLightHelper: true };
      helperGroup.add(line);
      
      return helperGroup;
    }

    if (light instanceof PointLight) {
      // 点光源 - 创建可选择的球形辅助对象
      const helperGroup = new Group();
      helperGroup.name = 'PointLightHelper';
      helperGroup.userData = {
        isLightHelper: true,
        parentLight: light
      };
      
      // 创建一个小的球体表示点光源位置（可点击）
      const sphereGeometry = new SphereGeometry(0.15, 8, 8);
      const sphereMaterial = new MeshBasicMaterial({ 
        color: 0xffff00, 
        transparent: true, 
        opacity: 0.8,
        depthTest: false
      });
      const sphere = new Mesh(sphereGeometry, sphereMaterial);
      sphere.renderOrder = 999;
      sphere.userData = {
        isLightHelper: true,
        parentLight: light
      };
      helperGroup.add(sphere);
      
      // 添加线框表示范围
      const geometry = new BufferGeometry();
      const vertices: number[] = [];
      const radius = 1;
      const segments = 32;
      
      for (let i = 0; i < segments; i++) {
        const theta1 = (i / segments) * Math.PI * 2;
        const theta2 = ((i + 1) / segments) * Math.PI * 2;
        
        vertices.push(
          Math.cos(theta1) * radius, Math.sin(theta1) * radius, 0,
          Math.cos(theta2) * radius, Math.sin(theta2) * radius, 0
        );
        vertices.push(
          Math.cos(theta1) * radius, 0, Math.sin(theta1) * radius,
          Math.cos(theta2) * radius, 0, Math.sin(theta2) * radius
        );
        vertices.push(
          0, Math.cos(theta1) * radius, Math.sin(theta1) * radius,
          0, Math.cos(theta2) * radius, Math.sin(theta2) * radius
        );
      }
      
      geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
      const line = new LineSegments(geometry, material);
      helperGroup.add(line);
      
      return helperGroup;
    }

    if (light instanceof SpotLight) {
      // 聚光灯 - 创建可选择的辅助对象（只显示小球标记）
      const helperGroup = new Group();
      helperGroup.name = 'SpotLightHelper';
      helperGroup.userData = {
        isLightHelper: true,
        parentLight: light
      };
      
      // 创建一个小球体表示聚光灯位置（可点击）
      const sphereGeometry = new SphereGeometry(0.06, 16, 16);
      const sphereMaterial = new MeshBasicMaterial({ 
        color: 0xffff00, 
        transparent: true, 
        opacity: 0.8,
        depthTest: false
      });
      const sphere = new Mesh(sphereGeometry, sphereMaterial);
      sphere.renderOrder = 999;
      sphere.userData = {
        isLightHelper: true,
        parentLight: light
      };
      helperGroup.add(sphere);
      
      return helperGroup;
    }

    return null;
  }

  /**
   * 切换灯光辅助对象显示
   */
  toggleLightHelper(light: AmbientLight | DirectionalLight | PointLight | SpotLight | HemisphereLight | RectAreaLight, show: boolean): void {
    const helper = light.userData.helper as Object3D;
    if (helper) {
      helper.visible = show;
    }
  }

  /**
   * 获取灯光辅助对象可见性
   */
  isLightHelperVisible(light: AmbientLight | DirectionalLight | PointLight | SpotLight | HemisphereLight | RectAreaLight): boolean {
    const helper = light.userData.helper as Object3D;
    return helper ? helper.visible : false;
  }

  /**
   * 更新灯光辅助对象
   */
  updateLightHelper(light: AmbientLight | DirectionalLight | PointLight | SpotLight | HemisphereLight | RectAreaLight): void {
    const helper = light.userData.helper as Object3D;
    if (helper && light instanceof SpotLight) {
      // 保存原来的可见性状态
      const wasVisible = helper.visible;
      
      // 重新创建聚光灯辅助对象（角度可能改变）
      light.remove(helper);
      const newHelper = this.createLightHelper(light, 'spot');
      if (newHelper) {
        newHelper.visible = wasVisible;
        light.userData.helper = newHelper;
        light.userData.helperLight = light;
        light.add(newHelper);
      }
    }
  }
  
  /**
   * 同步所有灯光辅助对象的位置
   */
  syncLightHelpers(): void {
    this.scene.traverse((obj) => {
      // 检查是否为灯光类型（使用具体类型）
      const isLight = obj instanceof AmbientLight || 
                      obj instanceof DirectionalLight || 
                      obj instanceof PointLight || 
                      obj instanceof SpotLight ||
                      obj instanceof HemisphereLight ||
                      obj instanceof RectAreaLight;
      if (isLight && obj.userData.helper) {
        // 确保灯光矩阵已更新
        obj.updateMatrix();
        obj.updateMatrixWorld();
        this.syncLightHelperTransform(obj as any);
      }
    });
  }
  
  /**
   * 同步单个灯光辅助对象的变换
   */
  syncLightHelperTransform(light: AmbientLight | DirectionalLight | PointLight | SpotLight | HemisphereLight | RectAreaLight): void {
    const helper = light.userData.helper as Object3D;
    if (!helper) return;
    
    // 辅助对象作为子对象，位置设为原点即可跟随父级
    helper.position.set(0, 0, 0);
    helper.rotation.set(0, 0, 0);
    
    // 方向光特殊处理 - 辅助对象需要指向 target
    if (light instanceof DirectionalLight) {
      helper.lookAt(light.target.position);
    }
  }

  /**
   * 添加对象到场景
   */
  addObject(object: Object3D, parent: Object3D = this.scene): void {
    parent.add(object);
    this.registerObject(object);
  }

  /**
   * 递归注册对象
   */
  registerObject(object: Object3D): void {
    this.objectMap.set(object.uuid, object);
    object.traverse((child) => {
      this.objectMap.set(child.uuid, child);
    });
  }

  /**
   * 从场景中移除对象
   */
  removeObject(object: Object3D): void {
    if (object.parent) {
      object.parent.remove(object);
    }
    this.unregisterObject(object);
    
    if (this.selectedObject === object) {
      this.selectedObject = null;
    }
  }

  /**
   * 递归注销对象
   */
  unregisterObject(object: Object3D): void {
    this.objectMap.delete(object.uuid);
    object.traverse((child) => {
      this.objectMap.delete(child.uuid);
    });
  }

  /**
   * 通过 UUID 获取对象
   */
  getObjectByUUID(uuid: string): Object3D | undefined {
    return this.objectMap.get(uuid);
  }

  /**
   * 设置摄像机辅助线可见性
   */
  setCameraHelperVisible(visible: boolean): void {
    if (this.cameraHelper) {
      this.cameraHelper.visible = visible;
    }
  }

  /**
   * 获取摄像机辅助线
   */
  getCameraHelper(): CameraHelper | null {
    return this.cameraHelper;
  }

  /**
   * 选择对象
   */
  selectObject(object: Object3D | null): void {
    this.selectedObject = object;
  }

  /**
   * 获取选中的对象
   */
  getSelectedObject(): Object3D | null {
    return this.selectedObject;
  }

  /**
   * 清除场景
   */
  clear(): void {
    // 保存网格辅助对象
    const grid = this.gridHelper;
    this.scene.remove(grid);
    
    this.scene.clear();
    this.objectMap.clear();
    this.selectedObject = null;
    
    // 重新添加网格辅助对象并注册
    this.scene.add(grid);
    this.registerObject(grid);
  }

  /**
   * 遍历所有对象
   */
  traverse(callback: (object: Object3D) => void): void {
    this.scene.traverse(callback);
  }

  /**
   * 创建默认场景（空场景，只保留基础光源和摄像机）
   */
  createDefaultScene(): void {
    this.clear();
    
    // 重新添加摄像机到场景
    this.addCameraToScene();

    // 环境光
    const ambient = this.createLight('ambient', { 
      color: [0.5, 0.5, 0.5], 
      intensity: 0.5 
    });
    ambient.name = '环境光';
    this.addObject(ambient);

    // 方向光
    const directional = this.createLight('directional', { 
      color: [1, 1, 1], 
      intensity: 1 
    });
    directional.name = '方向光';
    directional.position.set(0, 0, 0);
    this.addObject(directional);

    // 添加默认立方体（在原点，便于用户立即操作）
    const cube = this.createPrimitive('Box', {
      type: 'MeshStandard',
      color: [0.8, 0.8, 0.8]
    }, '立方体');
    cube.position.set(0, 0.5, 0);
    this.addObject(cube);
  }

  /**
   * 创建空场景（只保留摄像机和网格）
   */
  createEmptyScene(): void {
    this.clear();
    
    // 重新添加摄像机到场景
    this.addCameraToScene();
  }

  /**
   * 导出为场景数据
   */
  toJSON(): SceneNodeData {
    return this.serializeObject(this.scene);
  }

  /**
   * 序列化对象
   */
  private serializeObject(object: Object3D): SceneNodeData {
    const data: SceneNodeData = {
      uuid: object.uuid,
      type: this.getNodeType(object),
      name: object.name,
      visible: object.visible,
      transform: {
        position: [object.position.x, object.position.y, object.position.z],
        rotation: [
          MathUtils.radToDeg(object.rotation.x),
          MathUtils.radToDeg(object.rotation.y),
          MathUtils.radToDeg(object.rotation.z)
        ],
        scale: [object.scale.x, object.scale.y, object.scale.z],
        quaternion: [object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w]
      },
      children: object.children.map(child => this.serializeObject(child))
    };

    // 序列化 Mesh 特有数据
    if (object instanceof Mesh) {
      data.material = this.serializeMaterial(object.material as MeshStandardMaterial);
      data.geometry = { type: 'Box' }; // 简化处理，实际需要检测几何体类型
    }

    return data;
  }

  /**
   * 序列化材质
   */
  private serializeMaterial(material: MeshStandardMaterial): MaterialData {
    return {
      type: 'MeshStandard',
      color: [material.color.r, material.color.g, material.color.b],
      roughness: material.roughness,
      metalness: material.metalness,
      transparent: material.transparent,
      opacity: material.opacity
    };
  }

  /**
   * 获取节点类型
   */
  private getNodeType(object: Object3D): SceneNodeType {
    if (object instanceof Scene) return 'Scene';
    if (object instanceof PerspectiveCamera) return 'PerspectiveCamera';
    if (object instanceof OrthographicCamera) return 'OrthographicCamera';
    if (object instanceof Mesh) return 'Mesh';
    if (object instanceof AmbientLight) return 'AmbientLight';
    if (object instanceof DirectionalLight) return 'DirectionalLight';
    if (object instanceof PointLight) return 'PointLight';
    if (object instanceof SpotLight) return 'SpotLight';
    if (object instanceof Group) return 'Group';
    return 'Group';
  }
}
