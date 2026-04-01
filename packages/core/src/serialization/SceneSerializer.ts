import type { SceneData, SceneNodeData, SceneMetadata, ResourcesData } from '../types';

export interface SerializationOptions {
  includeCameras?: boolean;
  includeLights?: boolean;
  prettyPrint?: boolean;
  compress?: boolean;
}

export class SceneSerializer {
  private static readonly CURRENT_VERSION = '1.0.0';

  /**
   * 序列化场景为 JSON
   */
  static serialize(
    sceneData: SceneNodeData,
    metadata: Partial<SceneMetadata> = {},
    options: SerializationOptions = {}
  ): string {
    const fullData: SceneData = {
      version: this.CURRENT_VERSION,
      metadata: {
        name: metadata.name || 'Untitled Scene',
        description: metadata.description,
        created: metadata.created || Date.now(),
        modified: Date.now(),
        author: metadata.author
      },
      resources: {
        textures: [],
        materials: [],
        geometries: []
      },
      scene: sceneData
    };

    const space = options.prettyPrint ? 2 : undefined;
    return JSON.stringify(fullData, null, space);
  }

  /**
   * 解析场景 JSON
   */
  static parse(json: string): SceneData {
    try {
      const data = JSON.parse(json) as SceneData;
      
      // 版本检查
      if (!data.version) {
        throw new Error('Invalid scene file: missing version');
      }

      // 版本迁移（如果需要）
      if (data.version !== this.CURRENT_VERSION) {
        data.scene = this.migrate(data.scene, data.version);
        data.version = this.CURRENT_VERSION;
      }

      return data;
    } catch (error) {
      throw new Error(`Failed to parse scene: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 从文件加载场景
   */
  static async loadFromFile(file: File): Promise<SceneData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const data = this.parse(content);
          resolve(data);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * 保存场景到文件
   */
  static saveToFile(sceneData: SceneData, filename?: string): void {
    const blob = new Blob(
      [JSON.stringify(sceneData, null, 2)],
      { type: 'application/json' }
    );
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `${sceneData.metadata.name.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * 验证场景数据
   */
  static validate(data: unknown): data is SceneData {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    const scene = data as Partial<SceneData>;
    
    // 检查必需字段
    if (!scene.version || typeof scene.version !== 'string') {
      return false;
    }
    
    if (!scene.metadata || typeof scene.metadata !== 'object') {
      return false;
    }
    
    if (!scene.scene || typeof scene.scene !== 'object') {
      return false;
    }

    return true;
  }

  /**
   * 版本迁移
   */
  private static migrate(scene: SceneNodeData, fromVersion: string): SceneNodeData {
    // 这里可以实现版本迁移逻辑
    // 例如：0.9.0 -> 1.0.0 的转换
    
    if (fromVersion.startsWith('0.')) {
      // 处理旧版本的转换
      console.log(`[SceneSerializer] Migrating from ${fromVersion} to ${this.CURRENT_VERSION}`);
    }
    
    return scene;
  }

  /**
   * 克隆场景节点
   */
  static cloneNode(node: SceneNodeData): SceneNodeData {
    return JSON.parse(JSON.stringify(node));
  }

  /**
   * 创建空场景模板
   */
  static createEmptyScene(name: string = 'New Scene'): SceneData {
    return {
      version: this.CURRENT_VERSION,
      metadata: {
        name,
        created: Date.now(),
        modified: Date.now()
      },
      resources: {
        textures: [],
        materials: [],
        geometries: []
      },
      scene: {
        uuid: crypto.randomUUID(),
        type: 'Scene',
        name: name,
        visible: true,
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1]
        },
        children: []
      }
    };
  }
}
