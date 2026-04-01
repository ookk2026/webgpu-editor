/**
 * FXAA (Fast Approximate Anti-Aliasing) 快速近似抗锯齿
 * 轻量级后处理抗锯齿方案
 */

import {
  ShaderMaterial,
  UniformsUtils,
  Vector2
} from 'three';

// FXAA Shader - 基于 NVIDIA 的 FXAA 3.11 实现
const FXAAShader = {
  uniforms: {
    'tDiffuse': { value: null },
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
    uniform vec2 resolution;
    varying vec2 vUv;
    
    #define FXAA_REDUCE_MIN (1.0 / 128.0)
    #define FXAA_REDUCE_MUL (1.0 / 8.0)
    #define FXAA_SPAN_MAX 8.0
    
    void main() {
      vec2 texel = vec2(1.0 / resolution.x, 1.0 / resolution.y);
      
      vec3 rgbNW = texture2D(tDiffuse, vUv + vec2(-texel.x, -texel.y)).xyz;
      vec3 rgbNE = texture2D(tDiffuse, vUv + vec2(texel.x, -texel.y)).xyz;
      vec3 rgbSW = texture2D(tDiffuse, vUv + vec2(-texel.x, texel.y)).xyz;
      vec3 rgbSE = texture2D(tDiffuse, vUv + vec2(texel.x, texel.y)).xyz;
      vec3 rgbM = texture2D(tDiffuse, vUv).xyz;
      
      vec3 luma = vec3(0.299, 0.587, 0.114);
      float lumaNW = dot(rgbNW, luma);
      float lumaNE = dot(rgbNE, luma);
      float lumaSW = dot(rgbSW, luma);
      float lumaSE = dot(rgbSE, luma);
      float lumaM = dot(rgbM, luma);
      
      float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
      float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
      
      vec2 dir;
      dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
      dir.y = ((lumaNW + lumaSW) - (lumaNE + lumaSE));
      
      float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);
      float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
      
      dir = min(vec2(FXAA_SPAN_MAX, FXAA_SPAN_MAX),
                max(vec2(-FXAA_SPAN_MAX, -FXAA_SPAN_MAX), dir * rcpDirMin)) * texel;
      
      vec3 rgbA = 0.5 * (
        texture2D(tDiffuse, vUv + dir * (1.0 / 3.0 - 0.5)).xyz +
        texture2D(tDiffuse, vUv + dir * (2.0 / 3.0 - 0.5)).xyz
      );
      
      vec3 rgbB = rgbA * 0.5 + 0.25 * (
        texture2D(tDiffuse, vUv + dir * -0.5).xyz +
        texture2D(tDiffuse, vUv + dir * 0.5).xyz
      );
      
      float lumaB = dot(rgbB, luma);
      
      if ((lumaB < lumaMin) || (lumaB > lumaMax)) {
        gl_FragColor = vec4(rgbA, 1.0);
      } else {
        gl_FragColor = vec4(rgbB, 1.0);
      }
    }
  `
};

export interface FXAAEffectConfig {
  enabled: boolean;
}

export class FXAAEffect {
  private config: FXAAEffectConfig;
  public material: ShaderMaterial;

  constructor(config: Partial<FXAAEffectConfig> = {}) {
    this.config = {
      enabled: true,
      ...config
    };

    this.material = new ShaderMaterial({
      uniforms: UniformsUtils.clone(FXAAShader.uniforms),
      vertexShader: FXAAShader.vertexShader,
      fragmentShader: FXAAShader.fragmentShader,
      transparent: true
    });
  }

  updateConfig(config: Partial<FXAAEffectConfig>): void {
    Object.assign(this.config, config);
  }

  setSize(width: number, height: number): void {
    this.material.uniforms['resolution'].value.set(width, height);
  }

  dispose(): void {
    this.material.dispose();
  }
}
