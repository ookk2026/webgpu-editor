// 命令模式接口 - 用于撤销/重做系统

import type { Object3D, Vector3, Euler, Color } from 'three';

export interface Command {
  /** 命令名称 */
  name: string;
  
  /** 执行命令 */
  execute(): void;
  
  /** 撤销命令 */
  undo(): void;
  
  /** 
   * 尝试与另一个命令合并
   * 用于连续操作（如拖拽）的合并优化
   */
  mergeWith?(other: Command): boolean;
}

// ============ 场景操作命令 ============

import { 
  Scene, 
  Mesh, 
  Light,
  MathUtils
} from 'three';
import type { SceneManager } from '../scene/SceneManager';
import type { SceneNodeData, GeometryData, MaterialData, LightData } from '../types';

/**
 * 添加对象命令
 */
export class AddObjectCommand implements Command {
  name = 'Add Object';
  private parent: Object3D;
  private object: Object3D;
  private sceneManager: SceneManager;

  constructor(sceneManager: SceneManager, object: Object3D, parent?: Object3D) {
    this.sceneManager = sceneManager;
    this.object = object;
    this.parent = parent || sceneManager.getScene();
  }

  execute(): void {
    this.sceneManager.addObject(this.object, this.parent);
  }

  undo(): void {
    this.sceneManager.removeObject(this.object);
  }
}

/**
 * 删除对象命令
 */
export class RemoveObjectCommand implements Command {
  name = 'Remove Object';
  private parent: Object3D | null = null;
  private object: Object3D;
  private sceneManager: SceneManager;
  private wasSelected: boolean = false;

  constructor(sceneManager: SceneManager, object: Object3D) {
    this.sceneManager = sceneManager;
    this.object = object;
  }

  execute(): void {
    this.parent = this.object.parent;
    // 使用 addObject 的逆操作，直接调用 removeObject
    if (this.parent) {
      this.sceneManager.removeObject(this.object);
    }
  }

  undo(): void {
    if (this.parent) {
      // 使用 addObject 标准方法重新添加，保持 Three.js 内部状态一致
      this.sceneManager.addObject(this.object, this.parent);
    }
  }
}

/**
 * 变换命令 (位置/旋转/缩放)
 */
export class TransformCommand implements Command {
  name = 'Transform';
  private object: Object3D;
  private oldPosition: Vector3;
  private newPosition: Vector3;
  private oldRotation: Euler;
  private newRotation: Euler;
  private oldScale: Vector3;
  private newScale: Vector3;

  constructor(
    object: Object3D,
    oldPosition: Vector3,
    oldRotation: Euler,
    oldScale: Vector3
  ) {
    this.object = object;
    this.oldPosition = oldPosition.clone();
    this.oldRotation = oldRotation.clone();
    this.oldScale = oldScale.clone();
    
    // 新值为当前值
    this.newPosition = object.position.clone();
    this.newRotation = object.rotation.clone();
    this.newScale = object.scale.clone();
  }

  execute(): void {
    this.object.position.copy(this.newPosition);
    this.object.rotation.copy(this.newRotation);
    this.object.scale.copy(this.newScale);
  }

  undo(): void {
    this.object.position.copy(this.oldPosition);
    this.object.rotation.copy(this.oldRotation);
    this.object.scale.copy(this.oldScale);
  }

  mergeWith(other: Command): boolean {
    if (!(other instanceof TransformCommand)) return false;
    if (other.object !== this.object) return false;
    
    // 合并连续变换，保留旧的起点和新的终点
    this.newPosition = other.newPosition;
    this.newRotation = other.newRotation;
    this.newScale = other.newScale;
    return true;
  }
}

/**
 * 重命名命令
 */
export class RenameCommand implements Command {
  name = 'Rename';
  private object: Object3D;
  private oldName: string;
  private newName: string;

  constructor(object: Object3D, newName: string) {
    this.object = object;
    this.oldName = object.name;
    this.newName = newName;
  }

  execute(): void {
    this.object.name = this.newName;
  }

  undo(): void {
    this.object.name = this.oldName;
  }
}

/**
 * 材质修改命令
 */
import { Material, MeshStandardMaterial, MeshBasicMaterial } from 'three';

export class MaterialCommand implements Command {
  name = 'Change Material';
  private mesh: Mesh;
  private oldMaterial: Material;
  private newMaterial: Material;

  constructor(mesh: Mesh, newMaterial: Material) {
    this.mesh = mesh;
    // 处理 material 可能是 Material[] 的情况
    const currentMat = mesh.material;
    this.oldMaterial = Array.isArray(currentMat) ? currentMat[0].clone() : currentMat.clone();
    this.newMaterial = newMaterial;
  }

  execute(): void {
    this.mesh.material = this.newMaterial;
  }

  undo(): void {
    this.mesh.material = this.oldMaterial;
  }
}

/**
 * 颜色修改命令
 */
export class ColorCommand implements Command {
  name = 'Change Color';
  private material: MeshStandardMaterial | MeshBasicMaterial;
  private oldColor: Color;
  private newColor: Color;

  constructor(
    material: MeshStandardMaterial | MeshBasicMaterial,
    newColor: Color
  ) {
    this.material = material;
    this.oldColor = material.color.clone();
    this.newColor = newColor;
  }

  execute(): void {
    this.material.color.copy(this.newColor);
  }

  undo(): void {
    this.material.color.copy(this.oldColor);
  }

  mergeWith(other: Command): boolean {
    if (!(other instanceof ColorCommand)) return false;
    if (other.material !== this.material) return false;
    
    this.newColor = other.newColor;
    return true;
  }
}

/**
 * 可见性切换命令
 */
export class VisibilityCommand implements Command {
  name = 'Toggle Visibility';
  private object: Object3D;
  private oldVisible: boolean;

  constructor(object: Object3D) {
    this.object = object;
    this.oldVisible = object.visible;
  }

  execute(): void {
    this.object.visible = !this.oldVisible;
  }

  undo(): void {
    this.object.visible = this.oldVisible;
  }
}

/**
 * 复合命令 - 批量执行多个命令
 */
export class CompositeCommand implements Command {
  name = 'Composite';
  private commands: Command[];

  constructor(commands: Command[], name?: string) {
    this.commands = commands;
    if (name) this.name = name;
  }

  execute(): void {
    this.commands.forEach(cmd => cmd.execute());
  }

  undo(): void {
    // 逆序撤销
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }
}
