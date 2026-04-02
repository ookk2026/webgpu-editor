/**
 * STABLE: 2024-04-02
 * Command Pattern implementation for Undo/Redo functionality
 * 
 * This module provides the command pattern infrastructure for the editor.
 * All state-changing operations should be wrapped in Command objects.
 */

import * as THREE from 'three';

// ============================================================================
// Command Interface
// ============================================================================

export interface Command {
  execute(): void;
  undo(): void;
}

// ============================================================================
// Command Implementations
// ============================================================================

export class AddObjectCommand implements Command {
  constructor(
    private scene: THREE.Scene,
    private obj: THREE.Object3D,
    private callbacks: {
      refreshSceneTree: () => void;
      selectObject: (obj: THREE.Object3D | null) => void;
    }
  ) {}

  execute(): void {
    this.scene.add(this.obj);
    this.callbacks.refreshSceneTree();
  }

  undo(): void {
    this.scene.remove(this.obj);
    this.callbacks.selectObject(null);
    this.callbacks.refreshSceneTree();
  }
}

export class RemoveObjectCommand implements Command {
  private parent: THREE.Object3D | null = null;

  constructor(
    private scene: THREE.Scene,
    private obj: THREE.Object3D,
    private callbacks: {
      refreshSceneTree: () => void;
      selectObject: (obj: THREE.Object3D | null) => void;
    }
  ) {
    this.parent = obj.parent;
  }

  execute(): void {
    this.scene.remove(this.obj);
    this.callbacks.selectObject(null);
    this.callbacks.refreshSceneTree();
  }

  undo(): void {
    if (this.parent) {
      this.parent.add(this.obj);
      this.callbacks.refreshSceneTree();
    }
  }
}

export class TransformCommand implements Command {
  private oldPos: THREE.Vector3;
  private oldRot: THREE.Euler;
  private oldScale: THREE.Vector3;
  private newPos: THREE.Vector3;
  private newRot: THREE.Euler;
  private newScale: THREE.Vector3;

  constructor(
    private obj: THREE.Object3D,
    private callbacks: {
      updateTransformInputs: (obj: THREE.Object3D) => void;
    }
  ) {
    this.oldPos = obj.position.clone();
    this.oldRot = obj.rotation.clone();
    this.oldScale = obj.scale.clone();
    this.newPos = obj.position.clone();
    this.newRot = obj.rotation.clone();
    this.newScale = obj.scale.clone();
  }

  setNewState(): void {
    this.newPos.copy(this.obj.position);
    this.newRot.copy(this.obj.rotation);
    this.newScale.copy(this.obj.scale);
  }

  execute(): void {
    this.obj.position.copy(this.newPos);
    this.obj.rotation.copy(this.newRot);
    this.obj.scale.copy(this.newScale);
    this.callbacks.updateTransformInputs(this.obj);
  }

  undo(): void {
    this.obj.position.copy(this.oldPos);
    this.obj.rotation.copy(this.oldRot);
    this.obj.scale.copy(this.oldScale);
    this.callbacks.updateTransformInputs(this.obj);
  }
}

export class MaterialChangeCommand implements Command {
  private oldValues: Record<string, any>;
  private newValues: Record<string, any> = {};

  constructor(
    private material: THREE.MeshStandardMaterial,
    private callbacks?: {
      onChange?: () => void;
    }
  ) {
    this.oldValues = {
      color: material.color.getHex(),
      roughness: material.roughness,
      metalness: material.metalness,
      wireframe: material.wireframe,
      opacity: material.opacity,
    };
  }

  setNewState(): void {
    this.newValues = {
      color: this.material.color.getHex(),
      roughness: this.material.roughness,
      metalness: this.material.metalness,
      wireframe: this.material.wireframe,
      opacity: this.material.opacity,
    };
  }

  execute(): void {
    this.apply(this.newValues);
  }

  undo(): void {
    this.apply(this.oldValues);
  }

  private apply(values: Record<string, any>): void {
    if (values.color !== undefined) this.material.color.setHex(values.color);
    if (values.roughness !== undefined) this.material.roughness = values.roughness;
    if (values.metalness !== undefined) this.material.metalness = values.metalness;
    if (values.wireframe !== undefined) this.material.wireframe = values.wireframe;
    if (values.opacity !== undefined) {
      this.material.opacity = values.opacity;
      this.material.transparent = values.opacity < 1;
    }
    this.callbacks?.onChange?.();
  }
}

// ============================================================================
// Command Manager
// ============================================================================

export class CommandManager {
  private history: Command[] = [];
  private index = -1;
  private maxHistory = 50;

  execute(cmd: Command): void {
    // Remove any redo states
    if (this.index < this.history.length - 1) {
      this.history = this.history.slice(0, this.index + 1);
    }

    cmd.execute();
    this.history.push(cmd);

    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.index++;
    }

    console.log('[CommandManager] Executed, history:', this.index + 1);
  }

  undo(): void {
    if (this.index < 0) return;

    this.history[this.index].undo();
    this.index--;
    console.log('[CommandManager] Undo, history:', this.index + 1);
  }

  redo(): void {
    if (this.index >= this.history.length - 1) return;

    this.index++;
    this.history[this.index].execute();
    console.log('[CommandManager] Redo, history:', this.index + 1);
  }

  canUndo(): boolean {
    return this.index >= 0;
  }

  canRedo(): boolean {
    return this.index < this.history.length - 1;
  }

  clear(): void {
    this.history = [];
    this.index = -1;
  }
}
