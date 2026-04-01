// Core 引擎入口
export { Renderer, loadWebGPURenderer } from './renderer/WebGPURenderer';

// 模型导入
export { ModelImporter } from './importer/ModelImporter';
export type { ModelFormat, ImportOptions, ImportResult } from './importer/ModelImporter';
export { SceneManager } from './scene/SceneManager';
export { SceneSerializer } from './serialization/SceneSerializer';

// 命令系统
export {
  CommandManager,
  getGlobalCommandManager,
  setGlobalCommandManager
} from './commands/CommandManager';

export {
  AddObjectCommand,
  RemoveObjectCommand,
  TransformCommand,
  RenameCommand,
  MaterialCommand,
  ColorCommand,
  VisibilityCommand,
  CompositeCommand
} from './commands/Command';

export type { Command } from './commands/Command';
export type { CommandEvent, CommandEventListener } from './commands/CommandManager';

// 材质系统
export { MaterialEditor } from './material/MaterialEditor';
export type { MaterialEditorState, MaterialType } from './material/MaterialEditor';

// 后处理系统
export { PostProcessingManager } from './postprocessing/PostProcessingManager';
export type { 
  PostProcessingConfig, 
  BloomConfig, 
  SSAOConfig, 
  FXAAConfig,
  ToneMappingConfig 
} from './postprocessing/PostProcessingManager';

// 后处理效果
export { FXAAEffect } from './postprocessing/effects/FXAAEffect';
export { DepthOfFieldEffect } from './postprocessing/effects/DepthOfFieldEffect';
export { MotionBlurEffect } from './postprocessing/effects/MotionBlurEffect';
export type { SSAOEffectConfig } from './postprocessing/effects/SSAOEffect';
export type { DepthOfFieldConfig } from './postprocessing/effects/DepthOfFieldEffect';
export type { MotionBlurConfig } from './postprocessing/effects/MotionBlurEffect';

// 效果预设
export { EffectPresetManager, BuiltInPresets, getGlobalPresetManager } from './postprocessing/EffectPreset';
export type { EffectPreset } from './postprocessing/EffectPreset';

// 粒子系统
export { ParticleEmitter, ParticlePresets } from './particles/ParticleSystem';
export type { EmitterConfig } from './particles/ParticleSystem';

// 物理引擎
export { PhysicsWorld } from './physics/PhysicsWorld';
export type { RigidBodyConfig, PhysicsMaterialConfig } from './physics/PhysicsWorld';

// 场景导出
export { SceneExporter } from './exporter/SceneExporter';
export type { ExportOptions, ExportedScene } from './exporter/SceneExporter';

// 类型导出
export type {
  SceneNodeType,
  SceneNodeData,
  TransformData,
  GeometryData,
  MaterialData,
  LightData,
  CameraData,
  SceneData,
  SceneMetadata,
  ResourcesData,
  RendererConfig,
  EngineEvents
} from './types';

// Three.js 类型重导出
export type {
  Object3D,
  Scene,
  Camera,
  Mesh,
  Light,
  Material,
  Texture,
  Vector3,
  Euler,
  Quaternion
} from 'three';
