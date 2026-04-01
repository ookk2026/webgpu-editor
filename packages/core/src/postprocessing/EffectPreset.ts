/**
 * 后处理效果预设系统
 * 保存和加载效果配置
 */

import type { PostProcessingConfig, BloomConfig, SSAOConfig } from './PostProcessingManager';

export interface EffectPreset {
  name: string;
  description?: string;
  category: 'cinematic' | 'artistic' | 'performance' | 'custom';
  config: Partial<PostProcessingConfig>;
  thumbnail?: string;
}

/**
 * 内置预设
 */
export const BuiltInPresets: EffectPreset[] = [
  // 电影级预设
  {
    name: '电影级 (Cinematic)',
    description: '高质量电影效果，适合展示',
    category: 'cinematic',
    config: {
      enabled: true,
      bloom: {
        enabled: true,
        strength: 0.8,
        radius: 0.6,
        threshold: 0.75
      },
      ssao: {
        enabled: true,
        radius: 0.5,
        minDistance: 0.005,
        maxDistance: 0.1,
        samples: 16
      },
      toneMapping: {
        enabled: true,
        exposure: 1.0
      }
    }
  },
  {
    name: '科幻 (Sci-Fi)',
    description: '强烈的霓虹辉光效果',
    category: 'cinematic',
    config: {
      enabled: true,
      bloom: {
        enabled: true,
        strength: 2.0,
        radius: 0.8,
        threshold: 0.5
      },
      ssao: {
        enabled: true,
        radius: 0.3,
        minDistance: 0.005,
        maxDistance: 0.08,
        samples: 12
      },
      toneMapping: {
        enabled: true,
        exposure: 1.2
      }
    }
  },
  {
    name: '恐怖 (Horror)',
    description: '阴暗压抑的氛围',
    category: 'cinematic',
    config: {
      enabled: true,
      bloom: {
        enabled: false,
        strength: 0.3,
        radius: 0.4,
        threshold: 0.9
      },
      ssao: {
        enabled: true,
        radius: 1.0,
        minDistance: 0.01,
        maxDistance: 0.2,
        samples: 24
      },
      toneMapping: {
        enabled: true,
        exposure: 0.7
      }
    }
  },
  
  // 艺术预设
  {
    name: '梦幻 (Dreamy)',
    description: '柔和的辉光和泛光',
    category: 'artistic',
    config: {
      enabled: true,
      bloom: {
        enabled: true,
        strength: 1.5,
        radius: 1.0,
        threshold: 0.6
      },
      ssao: {
        enabled: false,
        radius: 0.5,
        minDistance: 0.005,
        maxDistance: 0.1,
        samples: 8
      },
      toneMapping: {
        enabled: true,
        exposure: 1.1
      }
    }
  },
  {
    name: '复古 (Retro)',
    description: '怀旧风格，低对比度',
    category: 'artistic',
    config: {
      enabled: true,
      bloom: {
        enabled: true,
        strength: 0.4,
        radius: 0.3,
        threshold: 0.85
      },
      ssao: {
        enabled: false,
        radius: 0.5,
        minDistance: 0.005,
        maxDistance: 0.1,
        samples: 8
      },
      toneMapping: {
        enabled: true,
        exposure: 0.9
      }
    }
  },
  {
    name: '水墨 (Ink)',
    description: '高对比度黑白风格',
    category: 'artistic',
    config: {
      enabled: true,
      bloom: {
        enabled: false,
        strength: 0,
        radius: 0,
        threshold: 1
      },
      ssao: {
        enabled: true,
        radius: 0.8,
        minDistance: 0.01,
        maxDistance: 0.15,
        samples: 20
      },
      toneMapping: {
        enabled: true,
        exposure: 1.3
      }
    }
  },
  
  // 性能预设
  {
    name: '性能优先 (Performance)',
    description: '最佳帧率，最低效果',
    category: 'performance',
    config: {
      enabled: true,
      bloom: {
        enabled: true,
        strength: 0.3,
        radius: 0.3,
        threshold: 0.8
      },
      ssao: {
        enabled: false,
        radius: 0.5,
        minDistance: 0.005,
        maxDistance: 0.1,
        samples: 8
      },
      toneMapping: {
        enabled: true,
        exposure: 1.0
      }
    }
  },
  {
    name: '平衡 (Balanced)',
    description: '效果与性能的平衡',
    category: 'performance',
    config: {
      enabled: true,
      bloom: {
        enabled: true,
        strength: 0.5,
        radius: 0.4,
        threshold: 0.8
      },
      ssao: {
        enabled: true,
        radius: 0.4,
        minDistance: 0.005,
        maxDistance: 0.08,
        samples: 12
      },
      toneMapping: {
        enabled: true,
        exposure: 1.0
      }
    }
  },
  {
    name: '全部关闭 (None)',
    description: '禁用所有后处理',
    category: 'performance',
    config: {
      enabled: false,
      bloom: {
        enabled: false,
        strength: 0,
        radius: 0,
        threshold: 1
      },
      ssao: {
        enabled: false,
        radius: 0.5,
        minDistance: 0.005,
        maxDistance: 0.1,
        samples: 8
      },
      toneMapping: {
        enabled: false,
        exposure: 1.0
      }
    }
  }
];

/**
 * 效果预设管理器
 */
export class EffectPresetManager {
  private presets: Map<string, EffectPreset> = new Map();
  private customPresets: Map<string, EffectPreset> = new Map();
  private storageKey = 'webgpu-editor-effect-presets';

  constructor() {
    this.loadBuiltInPresets();
    this.loadCustomPresets();
  }

  /**
   * 加载内置预设
   */
  private loadBuiltInPresets(): void {
    BuiltInPresets.forEach(preset => {
      this.presets.set(preset.name, preset);
    });
  }

  /**
   * 从本地存储加载自定义预设
   */
  private loadCustomPresets(): void {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        const presets = JSON.parse(data) as EffectPreset[];
        presets.forEach(preset => {
          this.customPresets.set(preset.name, preset);
        });
      }
    } catch (e) {
      console.warn('Failed to load custom presets:', e);
    }
  }

  /**
   * 保存自定义预设到本地存储
   */
  private saveCustomPresets(): void {
    try {
      const presets = Array.from(this.customPresets.values());
      localStorage.setItem(this.storageKey, JSON.stringify(presets));
    } catch (e) {
      console.warn('Failed to save custom presets:', e);
    }
  }

  /**
   * 获取所有预设
   */
  getAllPresets(): EffectPreset[] {
    return [
      ...Array.from(this.presets.values()),
      ...Array.from(this.customPresets.values())
    ];
  }

  /**
   * 按分类获取预设
   */
  getPresetsByCategory(category: EffectPreset['category']): EffectPreset[] {
    return this.getAllPresets().filter(p => p.category === category);
  }

  /**
   * 获取单个预设
   */
  getPreset(name: string): EffectPreset | undefined {
    return this.presets.get(name) || this.customPresets.get(name);
  }

  /**
   * 保存自定义预设
   */
  saveCustomPreset(name: string, config: Partial<PostProcessingConfig>, description?: string): void {
    const preset: EffectPreset = {
      name,
      description,
      category: 'custom',
      config
    };
    this.customPresets.set(name, preset);
    this.saveCustomPresets();
  }

  /**
   * 删除自定义预设
   */
  deleteCustomPreset(name: string): boolean {
    const result = this.customPresets.delete(name);
    if (result) {
      this.saveCustomPresets();
    }
    return result;
  }

  /**
   * 导出预设为 JSON
   */
  exportPreset(name: string): string | null {
    const preset = this.getPreset(name);
    if (!preset) return null;
    return JSON.stringify(preset, null, 2);
  }

  /**
   * 从 JSON 导入预设
   */
  importPreset(json: string): EffectPreset | null {
    try {
      const preset = JSON.parse(json) as EffectPreset;
      if (preset.name && preset.config) {
        preset.category = 'custom';
        this.customPresets.set(preset.name, preset);
        this.saveCustomPresets();
        return preset;
      }
    } catch (e) {
      console.error('Failed to import preset:', e);
    }
    return null;
  }

  /**
   * 重置为默认预设
   */
  resetToDefault(): void {
    this.customPresets.clear();
    this.saveCustomPresets();
  }

  /**
   * 应用预设配置到当前配置
   */
  static applyPreset(baseConfig: PostProcessingConfig, presetConfig: Partial<PostProcessingConfig>): PostProcessingConfig {
    return {
      ...baseConfig,
      ...presetConfig,
      bloom: { ...baseConfig.bloom, ...presetConfig.bloom },
      ssao: { ...baseConfig.ssao, ...presetConfig.ssao },
      toneMapping: { ...baseConfig.toneMapping, ...presetConfig.toneMapping }
    };
  }
}

// 单例实例
let globalPresetManager: EffectPresetManager | null = null;

export function getGlobalPresetManager(): EffectPresetManager {
  if (!globalPresetManager) {
    globalPresetManager = new EffectPresetManager();
  }
  return globalPresetManager;
}
