/**
 * Motion Blur 运动模糊效果
 * 基于速度缓冲区的运动模糊
 */

import {
  ShaderMaterial,
  UniformsUtils,
  Vector2,
  Matrix4,
  Camera
} from 'three';

// 运动模糊 Shader
const MotionBlurShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'tDepth': { value: null },
    'velocityTexture': { value: null },
    'resolution': { value: new Vector2(1, 1) },
    'intensity': { value: 1.0 },
    'samples': { value: 16 },
    'prevViewProjMatrix': { value: new Matrix4() },
    'currViewProjMatrix': { value: new Matrix4() }
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
    uniform sampler2D tDepth;
    uniform vec2 resolution;
    uniform float intensity;
    uniform float samples;
    uniform mat4 prevViewProjMatrix;
    uniform mat4 currViewProjMatrix;
    
    varying vec2 vUv;
    
    // 从深度重建世界坐标
    vec3 reconstructWorldPos(vec2 uv, float depth, mat4 invViewProj) {
      vec4 clipSpace = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 worldSpace = invViewProj * clipSpace;
      return worldSpace.xyz / worldSpace.w;
    }
    
    // 计算像素速度
    vec2 computeVelocity(vec2 uv, float depth) {
      vec4 clipPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      
      // 转换到世界空间
      mat4 invCurr = inverse(currViewProjMatrix);
      vec4 worldPos = invCurr * clipPos;
      worldPos /= worldPos.w;
      
      // 用上一帧矩阵投影
      vec4 prevClipPos = prevViewProjMatrix * worldPos;
      prevClipPos /= prevClipPos.w;
      
      // 计算屏幕空间速度
      vec2 prevUV = prevClipPos.xy * 0.5 + 0.5;
      return uv - prevUV;
    }
    
    void main() {
      float depth = texture2D(tDepth, vUv).r;
      
      // 计算速度
      vec2 velocity = computeVelocity(vUv, depth) * intensity;
      
      // 如果速度很小，直接返回原色
      float speed = length(velocity * resolution);
      if (speed < 0.5) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }
      
      // 限制最大速度
      velocity = clamp(velocity, -0.1, 0.1);
      
      // 沿速度方向采样
      vec4 color = vec4(0.0);
      float totalWeight = 0.0;
      
      float s = min(samples, 32.0);
      
      for(float i = 0.0; i < 32.0; i++) {
        if(i >= s) break;
        
        float t = i / (s - 1.0) - 0.5;
        vec2 offset = velocity * t;
        vec2 sampleUV = vUv + offset;
        
        // 边界检查
        if(sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) continue;
        
        // 权重：中间大两边小
        float weight = 1.0 - abs(t) * 0.5;
        
        color += texture2D(tDiffuse, sampleUV) * weight;
        totalWeight += weight;
      }
      
      if(totalWeight > 0.0) {
        color /= totalWeight;
      } else {
        color = texture2D(tDiffuse, vUv);
      }
      
      gl_FragColor = color;
    }
  `
};

// 简化版运动模糊（基于方向采样）
const SimpleMotionBlurShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'resolution': { value: new Vector2(1, 1) },
    'intensity': { value: 0.5 },
    'direction': { value: new Vector2(1, 0) }
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
    uniform vec2 resolution;
    uniform float intensity;
    uniform vec2 direction;
    
    varying vec2 vUv;
    
    void main() {
      vec2 texel = vec2(1.0) / resolution;
      vec4 color = vec4(0.0);
      
      float weights[9];
      weights[0] = 0.05; weights[1] = 0.09; weights[2] = 0.12;
      weights[3] = 0.15; weights[4] = 0.18; weights[5] = 0.15;
      weights[6] = 0.12; weights[7] = 0.09; weights[8] = 0.05;
      
      for(int i = 0; i < 9; i++) {
        float offset = float(i - 4) * intensity;
        vec2 sampleUV = vUv + direction * offset * texel;
        color += texture2D(tDiffuse, sampleUV) * weights[i];
      }
      
      gl_FragColor = color;
    }
  `
};

export interface MotionBlurConfig {
  enabled: boolean;
  intensity: number;    // 模糊强度 (0-1)
  samples: number;      // 采样数 (4-32)
  direction: 'camera' | 'radial' | 'directional';  // 模糊方向模式
}

export class MotionBlurEffect {
  private config: MotionBlurConfig;
  public material: ShaderMaterial;
  private camera: Camera;
  private prevViewProjMatrix: Matrix4;

  constructor(camera: Camera, config: Partial<MotionBlurConfig> = {}) {
    this.camera = camera;
    this.prevViewProjMatrix = new Matrix4();
    this.config = {
      enabled: true,
      intensity: 0.5,
      samples: 16,
      direction: 'camera',
      ...config
    };

    // 使用简化版
    this.material = new ShaderMaterial({
      uniforms: UniformsUtils.clone(SimpleMotionBlurShader.uniforms),
      vertexShader: SimpleMotionBlurShader.vertexShader,
      fragmentShader: SimpleMotionBlurShader.fragmentShader,
      transparent: true
    });
  }

  updateConfig(config: Partial<MotionBlurConfig>): void {
    Object.assign(this.config, config);
    this.material.uniforms['intensity'].value = this.config.intensity;
  }

  setSize(width: number, height: number): void {
    this.material.uniforms['resolution'].value.set(width, height);
  }

  /**
   * 更新相机矩阵（用于计算运动）
   */
  updateCameraMatrix(): void {
    // 保存当前矩阵供下一帧使用
    this.prevViewProjMatrix.copy(this.camera.projectionMatrix).multiply(this.camera.matrixWorldInverse);
    this.material.uniforms['prevViewProjMatrix'].value.copy(this.prevViewProjMatrix);
    this.material.uniforms['currViewProjMatrix'].value.copy(this.camera.projectionMatrix).multiply(this.camera.matrixWorldInverse);
  }

  dispose(): void {
    this.material.dispose();
  }
}
