import {
  Material,
  MeshStandardMaterial,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshPhongMaterial,
  Color,
  Texture,
  Vector2,
  FrontSide,
  BackSide,
  DoubleSide
} from 'three';
import type { MaterialData } from '../types';

export type MaterialType = 'MeshBasic' | 'MeshStandard' | 'MeshPhysical' | 'MeshPhong';

export interface MaterialEditorState {
  type: MaterialType;
  color: [number, number, number];
  emissive: [number, number, number];
  roughness: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  opacity: number;
  transparent: boolean;
  wireframe: boolean;
  side: 'front' | 'back' | 'double';
}

/**
 * 材质编辑器 - 管理材质属性和修改
 */
export class MaterialEditor {
  private material: Material | null = null;
  private originalMaterial: Material | null = null;
  private changeCallback?: (material: Material) => void;

  /**
   * 设置当前编辑的材质
   */
  setMaterial(material: Material | null, preserveOriginal: boolean = true): void {
    if (preserveOriginal && material) {
      this.originalMaterial = material.clone();
    }
    this.material = material;
  }

  /**
   * 获取当前材质
   */
  getMaterial(): Material | null {
    return this.material;
  }

  /**
   * 获取原始材质（用于取消操作）
   */
  getOriginalMaterial(): Material | null {
    return this.originalMaterial;
  }

  /**
   * 恢复原始材质
   */
  restoreOriginal(): Material | null {
    if (this.originalMaterial && this.material) {
      this.copyMaterialProperties(this.originalMaterial, this.material);
      this.material.needsUpdate = true;
      this.notifyChange();
      return this.material;
    }
    return null;
  }

  /**
   * 设置变更回调
   */
  onChange(callback: (material: Material) => void): void {
    this.changeCallback = callback;
  }

  /**
   * 通知变更
   */
  private notifyChange(): void {
    if (this.changeCallback && this.material) {
      this.changeCallback(this.material);
    }
  }

  /**
   * 复制材质属性
   */
  private copyMaterialProperties(source: Material, target: Material): void {
    // 基础属性
    if ('color' in source && 'color' in target) {
      (target as any).color.copy((source as any).color);
    }
    if ('emissive' in source && 'emissive' in target) {
      (target as any).emissive.copy((source as any).emissive);
    }
    if ('opacity' in source && 'opacity' in target) {
      target.opacity = source.opacity;
    }
    if ('transparent' in source && 'transparent' in target) {
      target.transparent = source.transparent;
    }
    if ('wireframe' in source && 'wireframe' in target) {
      (target as any).wireframe = (source as any).wireframe;
    }
    if ('side' in source && 'side' in target) {
      target.side = source.side;
    }

    // StandardMaterial 属性
    if (source instanceof MeshStandardMaterial && target instanceof MeshStandardMaterial) {
      target.roughness = source.roughness;
      target.metalness = source.metalness;
    }

    // PhysicalMaterial 属性
    if (source instanceof MeshPhysicalMaterial && target instanceof MeshPhysicalMaterial) {
      target.clearcoat = source.clearcoat;
      target.clearcoatRoughness = source.clearcoatRoughness;
      target.ior = source.ior;
      target.thickness = source.thickness;
      target.transmission = source.transmission;
    }
  }

  /**
   * 设置颜色
   */
  setColor(r: number, g: number, b: number): void {
    if (!this.material) return;
    
    const mat = this.material as MeshStandardMaterial | MeshBasicMaterial;
    if ('color' in mat) {
      mat.color.setRGB(r, g, b);
      mat.needsUpdate = true;
      this.notifyChange();
    }
  }

  /**
   * 设置自发光颜色
   */
  setEmissive(r: number, g: number, b: number): void {
    if (!this.material) return;
    
    const mat = this.material as MeshStandardMaterial;
    if ('emissive' in mat) {
      mat.emissive.setRGB(r, g, b);
      mat.needsUpdate = true;
      this.notifyChange();
    }
  }

  /**
   * 设置粗糙度
   */
  setRoughness(value: number): void {
    if (!this.material) return;
    
    const mat = this.material as MeshStandardMaterial;
    if ('roughness' in mat) {
      mat.roughness = Math.max(0, Math.min(1, value));
      mat.needsUpdate = true;
      this.notifyChange();
    }
  }

  /**
   * 设置金属度
   */
  setMetalness(value: number): void {
    if (!this.material) return;
    
    const mat = this.material as MeshStandardMaterial;
    if ('metalness' in mat) {
      mat.metalness = Math.max(0, Math.min(1, value));
      mat.needsUpdate = true;
      this.notifyChange();
    }
  }

  /**
   * 设置清漆层（Physical）
   */
  setClearcoat(value: number): void {
    if (!this.material) return;
    
    const mat = this.material as MeshPhysicalMaterial;
    if ('clearcoat' in mat) {
      mat.clearcoat = Math.max(0, Math.min(1, value));
      mat.needsUpdate = true;
      this.notifyChange();
    }
  }

  /**
   * 设置不透明度
   */
  setOpacity(value: number): void {
    if (!this.material) return;
    
    this.material.opacity = Math.max(0, Math.min(1, value));
    this.material.transparent = value < 1;
    this.material.needsUpdate = true;
    this.notifyChange();
  }

  /**
   * 设置透明
   */
  setTransparent(transparent: boolean): void {
    if (!this.material) return;
    
    this.material.transparent = transparent;
    this.material.needsUpdate = true;
    this.notifyChange();
  }

  /**
   * 设置线框模式
   */
  setWireframe(wireframe: boolean): void {
    if (!this.material) return;
    
    const mat = this.material as MeshStandardMaterial | MeshBasicMaterial;
    if ('wireframe' in mat) {
      mat.wireframe = wireframe;
      mat.needsUpdate = true;
      this.notifyChange();
    }
  }

  /**
   * 设置渲染面
   */
  setSide(side: 'front' | 'back' | 'double'): void {
    if (!this.material) return;
    
    const sideMap = {
      front: FrontSide,
      back: BackSide,
      double: DoubleSide
    };
    
    this.material.side = sideMap[side];
    this.material.needsUpdate = true;
    this.notifyChange();
  }

  /**
   * 获取当前状态
   */
  getState(): MaterialEditorState | null {
    if (!this.material) return null;

    const mat = this.material;
    const state: MaterialEditorState = {
      type: this.getMaterialType(),
      color: [1, 1, 1],
      emissive: [0, 0, 0],
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0,
      clearcoatRoughness: 0.5,
      opacity: 1,
      transparent: false,
      wireframe: false,
      side: 'front'
    };

    if ('color' in mat) {
      state.color = [(mat as any).color.r, (mat as any).color.g, (mat as any).color.b];
    }
    if ('emissive' in mat) {
      state.emissive = [(mat as any).emissive.r, (mat as any).emissive.g, (mat as any).emissive.b];
    }
    if ('roughness' in mat) state.roughness = (mat as any).roughness;
    if ('metalness' in mat) state.metalness = (mat as any).metalness;
    if ('clearcoat' in mat) state.clearcoat = (mat as any).clearcoat;
    if ('clearcoatRoughness' in mat) state.clearcoatRoughness = (mat as any).clearcoatRoughness;
    if ('opacity' in mat) state.opacity = mat.opacity;
    if ('transparent' in mat) state.transparent = mat.transparent;
    if ('wireframe' in mat) state.wireframe = (mat as any).wireframe;
    
    const sideMap: Record<number, 'front' | 'back' | 'double'> = { 0: 'front', 1: 'back', 2: 'double' };
    state.side = sideMap[mat.side] || 'front';

    return state;
  }

  /**
   * 获取材质类型
   */
  getMaterialType(): MaterialType {
    if (!this.material) return 'MeshStandard';
    
    if (this.material instanceof MeshPhysicalMaterial) return 'MeshPhysical';
    if (this.material instanceof MeshStandardMaterial) return 'MeshStandard';
    if (this.material instanceof MeshPhongMaterial) return 'MeshPhong';
    return 'MeshBasic';
  }

  /**
   * 切换材质类型
   */
  changeMaterialType(type: MaterialType): Material {
    if (!this.material) throw new Error('No material to change');

    const oldState = this.getState();
    let newMaterial: Material;

    switch (type) {
      case 'MeshBasic':
        newMaterial = new MeshBasicMaterial();
        break;
      case 'MeshStandard':
        newMaterial = new MeshStandardMaterial();
        break;
      case 'MeshPhysical':
        newMaterial = new MeshPhysicalMaterial();
        break;
      case 'MeshPhong':
        newMaterial = new MeshPhongMaterial();
        break;
      default:
        newMaterial = new MeshStandardMaterial();
    }

    // 复制通用属性
    if (oldState) {
      if ('color' in newMaterial) {
        (newMaterial as any).color.setRGB(...oldState.color);
      }
      newMaterial.opacity = oldState.opacity;
      newMaterial.transparent = oldState.transparent;
      const sideMap = { front: FrontSide, back: BackSide, double: DoubleSide };
      newMaterial.side = sideMap[oldState.side];
    }

    this.material = newMaterial;
    this.notifyChange();
    return newMaterial;
  }

  /**
   * 从 MaterialData 创建材质
   */
  static createFromData(data: MaterialData): Material {
    let material: Material;

    switch (data.type) {
      case 'MeshBasic':
        material = new MeshBasicMaterial({
          color: data.color ? new Color(...data.color) : 0xffffff,
          transparent: data.transparent,
          opacity: data.opacity
        });
        break;
      case 'MeshPhysical':
        material = new MeshPhysicalMaterial({
          color: data.color ? new Color(...data.color) : 0xffffff,
          roughness: data.roughness ?? 0.5,
          metalness: data.metalness ?? 0,
          transparent: data.transparent,
          opacity: data.opacity,
          clearcoat: (data as any).clearcoat ?? 0,
          clearcoatRoughness: (data as any).clearcoatRoughness ?? 0.5
        });
        break;
      case 'MeshStandard':
      default:
        material = new MeshStandardMaterial({
          color: data.color ? new Color(...data.color) : 0xffffff,
          roughness: data.roughness ?? 0.5,
          metalness: data.metalness ?? 0,
          transparent: data.transparent,
          opacity: data.opacity
        });
    }

    return material;
  }

  /**
   * 导出为 MaterialData
   */
  static toData(material: Material): MaterialData {
    const data: MaterialData = {
      type: 'MeshStandard',
      color: [1, 1, 1],
      roughness: 0.5,
      metalness: 0,
      transparent: false,
      opacity: 1
    };

    if ('color' in material) {
      const c = (material as any).color;
      data.color = [c.r, c.g, c.b];
    }
    if ('roughness' in material) data.roughness = (material as any).roughness;
    if ('metalness' in material) data.metalness = (material as any).metalness;
    if ('transparent' in material) data.transparent = material.transparent;
    if ('opacity' in material) data.opacity = material.opacity;

    if (material instanceof MeshPhysicalMaterial) {
      data.type = 'MeshPhysical';
      (data as any).clearcoat = material.clearcoat;
      (data as any).clearcoatRoughness = material.clearcoatRoughness;
    } else if (material instanceof MeshStandardMaterial) {
      data.type = 'MeshStandard';
    } else if (material instanceof MeshBasicMaterial) {
      data.type = 'MeshBasic';
    }

    return data;
  }
}
