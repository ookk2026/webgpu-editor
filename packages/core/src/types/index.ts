import { 
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

// 场景节点类型
export type SceneNodeType = 
  | 'Scene' 
  | 'Group' 
  | 'Mesh' 
  | 'Light' 
  | 'Camera' 
  | 'PerspectiveCamera' 
  | 'OrthographicCamera'
  | 'AmbientLight'
  | 'DirectionalLight'
  | 'PointLight'
  | 'SpotLight';

// 可序列化的场景节点数据
export interface SceneNodeData {
  uuid: string;
  type: SceneNodeType;
  name: string;
  visible: boolean;
  transform: TransformData;
  children: SceneNodeData[];
  // 类型特定数据
  geometry?: GeometryData;
  material?: MaterialData;
  light?: LightData;
  camera?: CameraData;
}

// 变换数据
export interface TransformData {
  position: [number, number, number];
  rotation: [number, number, number]; // Euler angles in degrees
  scale: [number, number, number];
  quaternion?: [number, number, number, number];
}

// 几何体数据
export interface GeometryData {
  type: 'Box' | 'Sphere' | 'Plane' | 'Cylinder' | 'Torus' | 'Custom';
  parameters?: Record<string, number>;
}

// 材质数据
export interface MaterialData {
  type: 'MeshStandard' | 'MeshBasic' | 'MeshPhong' | 'MeshPhysical';
  color?: [number, number, number];
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
}

// 光照数据
export interface LightData {
  color: [number, number, number];
  intensity: number;
  // 点光源/聚光灯
  distance?: number;
  decay?: number;
  // 方向光源/聚光灯
  castShadow?: boolean;
  // 聚光灯特有
  angle?: number;
  penumbra?: number;
  // 半球光特有
  groundColor?: [number, number, number];
  // 矩形区域光特有
  width?: number;
  height?: number;
}

// 相机数据
export interface CameraData {
  fov?: number;
  near: number;
  far: number;
  aspect?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

// 完整场景数据
export interface SceneData {
  version: string;
  metadata: SceneMetadata;
  resources: ResourcesData;
  scene: SceneNodeData;
}

// 场景元数据
export interface SceneMetadata {
  name: string;
  description?: string;
  created: number;
  modified: number;
  author?: string;
}

// 资源数据
export interface ResourcesData {
  textures: TextureResource[];
  materials: MaterialResource[];
  geometries: GeometryResource[];
}

export interface TextureResource {
  uuid: string;
  name: string;
  url: string;
  type: 'image' | 'hdr';
}

export interface MaterialResource {
  uuid: string;
  name: string;
  data: MaterialData;
}

export interface GeometryResource {
  uuid: string;
  name: string;
  data: GeometryData;
}

// 渲染器配置
export interface RendererConfig {
  antialias?: boolean;
  alpha?: boolean;
  powerPreference?: 'high-performance' | 'low-power';
  pixelRatio?: number;
  shadowMap?: boolean;
  shadowMapType?: number;
}

// 引擎事件
export interface EngineEvents {
  'scene:loaded': { scene: Scene };
  'scene:changed': { type: string; object?: Object3D };
  'object:selected': { object: Object3D | null };
  'object:transformed': { object: Object3D };
  'render:before': { deltaTime: number };
  'render:after': { deltaTime: number };
}

// 导出 Three.js 类型
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
};
