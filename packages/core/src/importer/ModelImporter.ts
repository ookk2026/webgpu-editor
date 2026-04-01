import {
  Object3D,
  Group,
  Mesh,
  MeshStandardMaterial,
  Box3,
  Vector3
} from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export type ModelFormat = 'gltf' | 'glb' | 'obj' | 'fbx';

export interface ImportOptions {
  addToScene?: boolean;
  autoScale?: boolean;
  targetSize?: number;
}

export interface ImportResult {
  success: boolean;
  object?: Object3D;
  error?: string;
  format: ModelFormat;
  originalFileName: string;
}

/**
 * 模型导入器 - 支持 GLTF/GLB/OBJ/FBX 格式
 */
export class ModelImporter {
  private gltfLoader: GLTFLoader;
  private objLoader: OBJLoader;
  private fbxLoader: FBXLoader;

  constructor() {
    this.gltfLoader = new GLTFLoader();
    this.objLoader = new OBJLoader();
    this.fbxLoader = new FBXLoader();
  }

  /**
   * 从文件导入模型
   */
  async importFromFile(
    file: File,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const format = this.detectFormat(file.name);
    const url = URL.createObjectURL(file);

    try {
      const result = await this.loadFromUrl(url, format, file.name, options);
      URL.revokeObjectURL(url);
      return result;
    } catch (error) {
      URL.revokeObjectURL(url);
      return {
        success: false,
        error: error instanceof Error ? error.message : '导入失败',
        format,
        originalFileName: file.name
      };
    }
  }

  /**
   * 从 URL 导入模型
   */
  async importFromUrl(
    url: string,
    format?: ModelFormat,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const detectedFormat = format || this.detectFormatFromUrl(url);
    const fileName = url.split('/').pop() || 'unknown';
    return this.loadFromUrl(url, detectedFormat, fileName, options);
  }

  /**
   * 检测文件格式
   */
  private detectFormat(fileName: string): ModelFormat {
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
      case 'gltf':
        return 'gltf';
      case 'glb':
        return 'glb';
      case 'obj':
        return 'obj';
      case 'fbx':
        return 'fbx';
      default:
        return 'glb';
    }
  }

  /**
   * 从 URL 检测格式
   */
  private detectFormatFromUrl(url: string): ModelFormat {
    return this.detectFormat(url);
  }

  /**
   * 加载模型
   */
  private async loadFromUrl(
    url: string,
    format: ModelFormat,
    fileName: string,
    options: ImportOptions
  ): Promise<ImportResult> {
    let object: Object3D;

    switch (format) {
      case 'gltf':
      case 'glb':
        object = await this.loadGLTF(url);
        break;
      case 'obj':
        object = await this.loadOBJ(url);
        break;
      case 'fbx':
        object = await this.loadFBX(url);
        break;
      default:
        throw new Error(`不支持的格式: ${format}`);
    }

    // 处理导入的对象
    this.processImportedObject(object, options);

    return {
      success: true,
      object,
      format,
      originalFileName: fileName
    };
  }

  /**
   * 加载 GLTF/GLB
   */
  private loadGLTF(url: string): Promise<Object3D> {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf: GLTF) => {
          const scene = gltf.scene;
          scene.name = 'GLTF_Model';
          
          // 处理动画
          if (gltf.animations.length > 0) {
            (scene as any).animations = gltf.animations;
          }
          
          resolve(scene);
        },
        undefined,
        (error: any) => reject(new Error(`GLTF 加载失败: ${error.message}`))
      );
    });
  }

  /**
   * 加载 OBJ
   */
  private loadOBJ(url: string): Promise<Object3D> {
    return new Promise((resolve, reject) => {
      this.objLoader.load(
        url,
        (group: Group) => {
          group.name = 'OBJ_Model';
          
          // 为没有材质的 Mesh 添加默认材质
          group.traverse((child) => {
            if (child instanceof Mesh && !child.material) {
              child.material = new MeshStandardMaterial({
                color: 0x888888,
                roughness: 0.5,
                metalness: 0.0
              });
            }
          });
          
          resolve(group);
        },
        undefined,
        (error: any) => reject(new Error(`OBJ 加载失败: ${error.message}`))
      );
    });
  }

  /**
   * 加载 FBX
   */
  private loadFBX(url: string): Promise<Object3D> {
    return new Promise((resolve, reject) => {
      this.fbxLoader.load(
        url,
        (object: Object3D) => {
          object.name = 'FBX_Model';
          resolve(object);
        },
        undefined,
        (error: any) => reject(new Error(`FBX 加载失败: ${error.message}`))
      );
    });
  }

  /**
   * 处理导入的对象
   */
  private processImportedObject(object: Object3D, options: ImportOptions): void {
    const { autoScale = true, targetSize = 2 } = options;

    // 启用阴影
    object.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // 自动缩放
    if (autoScale) {
      this.autoScale(object, targetSize);
    }
  }

  /**
   * 自动缩放到目标大小
   */
  private autoScale(object: Object3D, targetSize: number): void {
    const box = new Box3().setFromObject(object);
    const size = new Vector3();
    box.getSize(size);
    
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const scale = targetSize / maxDim;
      if (scale < 1 || maxDim < targetSize * 0.5) {
        object.scale.multiplyScalar(scale);
      }
    }
  }
}
