/**
 * Depth of Field (DoF) 景深效果
 * 模拟相机焦外虚化效果
 */

import {
  ShaderMaterial,
  UniformsUtils,
  Vector2,
  Camera
} from 'three';

// Bokeh 景深 Shader
const BokehShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'tDepth': { value: null },
    'focus': { value: 1.0 },
    'dof': { value: 0.0 },
    'aperture': { value: 0.025 },
    'maxBlur': { value: 1.0 },
    'near': { value: 0.1 },
    'far': { value: 1000.0 },
    'resolution': { value: new Vector2(1, 1) }
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
    uniform float focus;
    uniform float dof;
    uniform float aperture;
    uniform float maxBlur;
    uniform float near;
    uniform float far;
    uniform vec2 resolution;
    
    varying vec2 vUv;
    
    // 圆形 bokeh
    vec4 bokeh(sampler2D tex, vec2 uv, float radius) {
      vec4 sum = vec4(0.0);
      float samples = 0.0;
      
      float r = radius;
      int rings = 3;
      
      for(int i = 0; i < 8; i++) {
        if(i >= rings) break;
        float ringRadius = r * (float(i) + 1.0) / float(rings);
        int samplesInRing = 4 + i * 4;
        
        for(int j = 0; j < 16; j++) {
          if(j >= samplesInRing) break;
          float angle = float(j) * 6.28318530718 / float(samplesInRing);
          vec2 offset = vec2(cos(angle), sin(angle)) * ringRadius;
          sum += texture2D(tex, uv + offset / resolution);
          samples += 1.0;
        }
      }
      
      // 中心样本
      sum += texture2D(tex, uv);
      samples += 1.0;
      
      return sum / samples;
    }
    
    float getDepth(vec2 uv) {
      float z = texture2D(tDepth, uv).x;
      // 转换为线性深度
      return (2.0 * near) / (far + near - z * (far - near));
    }
    
    void main() {
      vec2 uv = vUv;
      float depth = getDepth(uv);
      
      // 计算模糊因子
      float blur = 0.0;
      
      // 基于焦点距离的模糊计算
      float focusDepth = (focus - near) / (far - near);
      float diff = abs(depth - focusDepth);
      
      // 景深范围计算
      float coc = diff * aperture * 100.0; // circle of confusion
      coc = clamp(coc, 0.0, maxBlur);
      
      // 前景/背景不同处理
      if (depth < focusDepth) {
        // 前景模糊较少
        blur = coc * 0.5;
      } else {
        // 背景模糊更多
        blur = coc;
      }
      
      blur = clamp(blur, 0.0, maxBlur);
      
      // 如果模糊很小，直接使用原始颜色
      if (blur < 0.01) {
        gl_FragColor = texture2D(tDiffuse, uv);
        return;
      }
      
      // 应用 bokeh 模糊
      gl_FragColor = bokeh(tDiffuse, uv, blur * 20.0);
    }
  `
};

export interface DepthOfFieldConfig {
  enabled: boolean;
  focus: number;        // 焦点距离
  aperture: number;     // 光圈大小 (0.001 - 0.1)
  maxBlur: number;      // 最大模糊 (0-2)
  near: number;         // 近裁剪面
  far: number;          // 远裁剪面
}

export class DepthOfFieldEffect {
  private config: DepthOfFieldConfig;
  public material: ShaderMaterial;
  private camera: Camera;

  constructor(camera: Camera, config: Partial<DepthOfFieldConfig> = {}) {
    this.camera = camera;
    this.config = {
      enabled: true,
      focus: 10.0,
      aperture: 0.025,
      maxBlur: 1.0,
      near: 0.1,
      far: 1000.0,
      ...config
    };

    this.material = new ShaderMaterial({
      uniforms: UniformsUtils.clone(BokehShader.uniforms),
      vertexShader: BokehShader.vertexShader,
      fragmentShader: BokehShader.fragmentShader,
      transparent: true
    });

    this.updateUniforms();
  }

  private updateUniforms(): void {
    this.material.uniforms['focus'].value = this.config.focus;
    this.material.uniforms['aperture'].value = this.config.aperture;
    this.material.uniforms['maxBlur'].value = this.config.maxBlur;
    this.material.uniforms['near'].value = this.config.near;
    this.material.uniforms['far'].value = this.config.far;
  }

  updateConfig(config: Partial<DepthOfFieldConfig>): void {
    Object.assign(this.config, config);
    this.updateUniforms();
  }

  setSize(width: number, height: number): void {
    this.material.uniforms['resolution'].value.set(width, height);
  }

  /**
   * 设置焦点到指定物体
   */
  setFocusToTarget(targetPosition: { x: number; y: number; z: number }): void {
    // 计算目标到相机的距离
    const distance = this.camera.position.distanceTo(targetPosition as any);
    this.updateConfig({ focus: distance });
  }

  dispose(): void {
    this.material.dispose();
  }
}
