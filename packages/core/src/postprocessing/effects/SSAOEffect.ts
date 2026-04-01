/**
 * SSAO (Screen Space Ambient Occlusion) 效果实现
 * 屏幕空间环境光遮蔽
 */

import {
  WebGLRenderer,
  Scene,
  Camera,
  MeshNormalMaterial,
  ShaderMaterial,
  UniformsUtils,
  Vector2,
  Mesh,
  Object3D
} from 'three';

// SSAO Shader
const SSAOShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'tNormal': { value: null },
    'tDepth': { value: null },
    'resolution': { value: new Vector2(1, 1) },
    'cameraNear': { value: 0.1 },
    'cameraFar': { value: 1000 },
    'radius': { value: 0.5 },
    'minDistance': { value: 0.005 },
    'maxDistance': { value: 0.1 },
    'samples': { value: 16 },
    'bias': { value: 0.025 },
    'intensity': { value: 1.0 }
  },

  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tNormal;
    uniform sampler2D tDepth;
    uniform vec2 resolution;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform float radius;
    uniform float minDistance;
    uniform float maxDistance;
    uniform float samples;
    uniform float bias;
    uniform float intensity;
    
    varying vec2 vUv;
    
    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }
    
    float readDepth(sampler2D depthSampler, vec2 coord) {
      float fragCoordZ = texture2D(depthSampler, coord).x;
      float viewZ = (cameraNear * cameraFar) / ((far - near) * fragCoordZ - cameraFar);
      return (viewZ + cameraNear) / (cameraNear - cameraFar);
    }
    
    void main() {
      vec2 uv = vUv;
      float depth = texture2D(tDepth, uv).x;
      vec3 normal = normalize(texture2D(tNormal, uv).xyz * 2.0 - 1.0);
      
      float occlusion = 0.0;
      float sampleRadius = radius / resolution.x;
      
      vec2 sampleOffsets[16];
      sampleOffsets[0] = vec2(0.0, 1.0);
      sampleOffsets[1] = vec2(0.707, 0.707);
      sampleOffsets[2] = vec2(1.0, 0.0);
      sampleOffsets[3] = vec2(0.707, -0.707);
      sampleOffsets[4] = vec2(0.0, -1.0);
      sampleOffsets[5] = vec2(-0.707, -0.707);
      sampleOffsets[6] = vec2(-1.0, 0.0);
      sampleOffsets[7] = vec2(-0.707, 0.707);
      sampleOffsets[8] = vec2(0.5, 0.866);
      sampleOffsets[9] = vec2(0.866, 0.5);
      sampleOffsets[10] = vec2(0.866, -0.5);
      sampleOffsets[11] = vec2(0.5, -0.866);
      sampleOffsets[12] = vec2(-0.5, -0.866);
      sampleOffsets[13] = vec2(-0.866, -0.5);
      sampleOffsets[14] = vec2(-0.866, 0.5);
      sampleOffsets[15] = vec2(-0.5, 0.866);
      
      float randomAngle = rand(uv * 43758.5453) * 6.28318530718;
      float cosR = cos(randomAngle);
      float sinR = sin(randomAngle);
      mat2 rot = mat2(cosR, -sinR, sinR, cosR);
      
      for(int i = 0; i < 16; i++) {
        if(float(i) >= samples) break;
        vec2 offset = rot * sampleOffsets[i] * sampleRadius;
        vec2 sampleUv = uv + offset;
        float sampleDepth = texture2D(tDepth, sampleUv).x;
        vec3 sampleNormal = normalize(texture2D(tNormal, sampleUv).xyz * 2.0 - 1.0);
        float rangeCheck = smoothstep(minDistance, maxDistance, abs(depth - sampleDepth));
        float normalCheck = max(0.0, dot(normal, sampleNormal));
        float diff = depth - sampleDepth;
        if(diff > bias && diff < maxDistance) {
          occlusion += rangeCheck * (1.0 - normalCheck * 0.5);
        }
      }
      
      occlusion = 1.0 - (occlusion / samples) * intensity;
      occlusion = clamp(occlusion, 0.0, 1.0);
      
      vec3 color = texture2D(tDiffuse, uv).rgb;
      color *= occlusion;
      
      gl_FragColor = vec4(color, 1.0);
    }
  `
};

export interface SSAOEffectConfig {
  enabled: boolean;
  radius: number;
  minDistance: number;
  maxDistance: number;
  samples: number;
  bias: number;
  intensity: number;
}

export class SSAOEffect {
  private renderer: WebGLRenderer;
  private scene: Scene;
  private camera: Camera;
  private config: SSAOEffectConfig;
  private normalMaterial: MeshNormalMaterial;
  private ssaoMaterial: ShaderMaterial;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera, config: Partial<SSAOEffectConfig> = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.config = {
      enabled: true,
      radius: 0.5,
      minDistance: 0.005,
      maxDistance: 0.1,
      samples: 16,
      bias: 0.025,
      intensity: 1.0,
      ...config
    };
    this.normalMaterial = new MeshNormalMaterial();
    this.ssaoMaterial = new ShaderMaterial({
      uniforms: UniformsUtils.clone(SSAOShader.uniforms),
      vertexShader: SSAOShader.vertexShader,
      fragmentShader: SSAOShader.fragmentShader
    });
  }

  updateConfig(config: Partial<SSAOEffectConfig>): void {
    Object.assign(this.config, config);
  }

  dispose(): void {
    this.normalMaterial.dispose();
    this.ssaoMaterial.dispose();
  }
}
