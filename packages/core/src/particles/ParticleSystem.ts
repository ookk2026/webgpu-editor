/**
 * 粒子系统 - 高性能 GPU 粒子渲染
 * 支持火焰、烟雾、爆炸、雨雪等效果
 */

import {
  Object3D,
  BufferGeometry,
  BufferAttribute,
  ShaderMaterial,
  Points,
  Texture,
  Vector3,
  Color,
  AdditiveBlending,
  NormalBlending,
  DynamicDrawUsage,
  MathUtils
} from 'three';

/**
 * 粒子发射器配置
 */
export interface EmitterConfig {
  // 基础配置
  name: string;
  maxParticles: number;        // 最大粒子数
  emissionRate: number;        // 每秒发射数
  
  // 生命周期
  minLife: number;             // 最小生命（秒）
  maxLife: number;             // 最大生命（秒）
  
  // 位置
  position: Vector3;           // 发射器位置
  positionVariance: Vector3;   // 位置随机范围
  
  // 速度
  minVelocity: Vector3;        // 最小初速度
  maxVelocity: Vector3;        // 最大初速度
  
  // 大小
  startSize: number;           // 起始大小
  endSize: number;             // 结束大小
  sizeVariance: number;        // 大小随机
  
  // 颜色
  startColor: Color;           // 起始颜色
  endColor: Color;             // 结束颜色
  colorVariance: number;       // 颜色随机
  
  // 旋转
  minRotation: number;         // 最小旋转（弧度）
  maxRotation: number;         // 最大旋转
  rotationSpeed: number;       // 旋转速度
  
  // 物理
  gravity: Vector3;            // 重力
  drag: number;                // 阻力 (0-1)
  
  // 外观
  opacity: number;             // 不透明度
  fadeIn: number;              // 淡入时间（秒）
  fadeOut: number;             // 淡出时间（秒）
  
  // 纹理
  texture?: Texture;           // 粒子纹理
  blending: 'additive' | 'normal'; // 混合模式
  
  // 形状
  shape: 'point' | 'box' | 'sphere' | 'cone'; // 发射形状
  shapeRadius: number;         // 形状半径
  
  // 循环
  loop: boolean;               // 是否循环发射
  duration: number;            // 持续时间（0为无限）
}

/**
 * 单个粒子数据
 */
interface Particle {
  position: Vector3;
  velocity: Vector3;
  life: number;           // 当前生命
  maxLife: number;        // 最大生命
  size: number;
  rotation: number;
  rotationSpeed: number;
  color: Color;
  opacity: number;
  active: boolean;
}

/**
 * 粒子发射器
 */
export class ParticleEmitter extends Object3D {
  private config: EmitterConfig;
  private particles: Particle[] = [];
  private geometry!: BufferGeometry;
  private material!: ShaderMaterial;
  private points!: Points;
  
  // GPU 数据缓冲
  private positions!: Float32Array;
  private colors!: Float32Array;
  private sizes!: Float32Array;
  private rotations!: Float32Array;
  private opacities!: Float32Array;
  
  private elapsedTime: number = 0;
  private emissionAccumulator: number = 0;
  private isPlaying: boolean = true;
  private particleCount: number = 0;

  constructor(config: Partial<EmitterConfig> = {}) {
    super();
    
    this.config = {
      name: 'Particle Emitter',
      maxParticles: 1000,
      emissionRate: 100,
      minLife: 1,
      maxLife: 3,
      position: new Vector3(0, 0, 0),
      positionVariance: new Vector3(0, 0, 0),
      minVelocity: new Vector3(-1, 0, -1),
      maxVelocity: new Vector3(1, 2, 1),
      startSize: 1,
      endSize: 0.1,
      sizeVariance: 0.2,
      startColor: new Color(1, 1, 1),
      endColor: new Color(1, 1, 1),
      colorVariance: 0.1,
      minRotation: 0,
      maxRotation: Math.PI * 2,
      rotationSpeed: 0,
      gravity: new Vector3(0, -9.8, 0),
      drag: 0.01,
      opacity: 1,
      fadeIn: 0.1,
      fadeOut: 0.5,
      blending: 'additive',
      shape: 'point',
      shapeRadius: 1,
      loop: true,
      duration: 0,
      ...config
    };

    this.init();
  }

  private init(): void {
    const maxParticles = this.config.maxParticles;
    
    // 初始化粒子数组
    for (let i = 0; i < maxParticles; i++) {
      this.particles.push({
        position: new Vector3(),
        velocity: new Vector3(),
        life: 0,
        maxLife: 1,
        size: 1,
        rotation: 0,
        rotationSpeed: 0,
        color: new Color(),
        opacity: 1,
        active: false
      });
    }

    // 创建 GPU 数据缓冲
    this.positions = new Float32Array(maxParticles * 3);
    this.colors = new Float32Array(maxParticles * 3);
    this.sizes = new Float32Array(maxParticles);
    this.rotations = new Float32Array(maxParticles);
    this.opacities = new Float32Array(maxParticles);

    // 创建几何体
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('size', new BufferAttribute(this.sizes, 1).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('rotation', new BufferAttribute(this.rotations, 1).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('opacity', new BufferAttribute(this.opacities, 1).setUsage(DynamicDrawUsage));

    // 创建 ShaderMaterial
    this.material = new ShaderMaterial({
      uniforms: {
        pointTexture: { value: this.config.texture || null }
      },
      vertexShader: this.getVertexShader(),
      fragmentShader: this.getFragmentShader(),
      transparent: true,
      depthWrite: false,
      blending: this.config.blending === 'additive' ? AdditiveBlending : NormalBlending,
      vertexColors: true
    });

    // 创建 Points 对象
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false; // 禁用视锥剔除
    this.add(this.points);

    this.name = this.config.name;
  }

  private getVertexShader(): string {
    return `
      attribute float size;
      attribute float rotation;
      attribute float opacity;
      attribute vec3 color;
      
      varying vec3 vColor;
      varying float vOpacity;
      varying float vRotation;
      
      void main() {
        vColor = color;
        vOpacity = opacity;
        vRotation = rotation;
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = size * (300.0 / -mvPosition.z);
      }
    `;
  }

  private getFragmentShader(): string {
    return `
      uniform sampler2D pointTexture;
      
      varying vec3 vColor;
      varying float vOpacity;
      varying float vRotation;
      
      void main() {
        // 旋转纹理坐标
        vec2 center = gl_PointCoord - 0.5;
        float cosR = cos(vRotation);
        float sinR = sin(vRotation);
        vec2 rotated = vec2(
          center.x * cosR - center.y * sinR,
          center.x * sinR + center.y * cosR
        );
        vec2 uv = rotated + 0.5;
        
        vec4 texColor = texture2D(pointTexture, uv);
        if (texColor.a < 0.01) discard;
        
        gl_FragColor = vec4(vColor, vOpacity) * texColor;
      }
    `;
  }

  /**
   * 更新粒子系统
   */
  update(deltaTime: number): void {
    if (!this.isPlaying) return;

    this.elapsedTime += deltaTime;

    // 检查持续时间
    if (this.config.duration > 0 && this.elapsedTime > this.config.duration) {
      if (this.config.loop) {
        this.elapsedTime = 0;
      } else {
        this.isPlaying = false;
      }
    }

    // 发射新粒子
    if (this.isPlaying) {
      this.emitParticles(deltaTime);
    }

    // 更新现有粒子
    this.updateParticles(deltaTime);

    // 更新 GPU 数据
    this.updateGPUData();
  }

  /**
   * 发射新粒子
   */
  private emitParticles(deltaTime: number): void {
    this.emissionAccumulator += this.config.emissionRate * deltaTime;
    const emitCount = Math.floor(this.emissionAccumulator);
    this.emissionAccumulator -= emitCount;

    for (let i = 0; i < emitCount; i++) {
      // 查找非活动粒子
      const particle = this.particles.find(p => !p.active);
      if (!particle) break;

      this.initParticle(particle);
    }
  }

  /**
   * 初始化单个粒子
   */
  private initParticle(particle: Particle): void {
    const config = this.config;

    // 根据发射形状计算初始位置
    particle.position.copy(this.getRandomPositionInShape());
    
    // 初速度
    particle.velocity.set(
      MathUtils.lerp(config.minVelocity.x, config.maxVelocity.x, Math.random()),
      MathUtils.lerp(config.minVelocity.y, config.maxVelocity.y, Math.random()),
      MathUtils.lerp(config.minVelocity.z, config.maxVelocity.z, Math.random())
    );

    // 生命周期
    particle.maxLife = MathUtils.lerp(config.minLife, config.maxLife, Math.random());
    particle.life = particle.maxLife;

    // 大小
    const sizeVar = 1 + (Math.random() - 0.5) * config.sizeVariance;
    particle.size = config.startSize * sizeVar;

    // 旋转
    particle.rotation = MathUtils.lerp(config.minRotation, config.maxRotation, Math.random());
    particle.rotationSpeed = config.rotationSpeed * (Math.random() - 0.5);

    // 颜色
    const colorVar = (Math.random() - 0.5) * config.colorVariance;
    particle.color.copy(config.startColor);
    particle.color.r = MathUtils.clamp(particle.color.r + colorVar, 0, 1);
    particle.color.g = MathUtils.clamp(particle.color.g + colorVar, 0, 1);
    particle.color.b = MathUtils.clamp(particle.color.b + colorVar, 0, 1);

    particle.opacity = config.opacity;
    particle.active = true;
    this.particleCount++;
  }

  /**
   * 根据形状获取随机位置
   */
  private getRandomPositionInShape(): Vector3 {
    const config = this.config;
    const base = config.position.clone();
    const variance = config.positionVariance;

    switch (config.shape) {
      case 'box':
        base.x += (Math.random() - 0.5) * 2 * config.shapeRadius;
        base.y += (Math.random() - 0.5) * 2 * config.shapeRadius;
        base.z += (Math.random() - 0.5) * 2 * config.shapeRadius;
        break;
      
      case 'sphere':
        const r = Math.pow(Math.random(), 1/3) * config.shapeRadius;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        base.x += r * Math.sin(phi) * Math.cos(theta);
        base.y += r * Math.sin(phi) * Math.sin(theta);
        base.z += r * Math.cos(phi);
        break;
      
      case 'cone':
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * config.shapeRadius;
        base.x += Math.cos(angle) * dist;
        base.z += Math.sin(angle) * dist;
        break;
      
      case 'point':
      default:
        base.x += (Math.random() - 0.5) * variance.x;
        base.y += (Math.random() - 0.5) * variance.y;
        base.z += (Math.random() - 0.5) * variance.z;
        break;
    }

    return base;
  }

  /**
   * 更新现有粒子
   */
  private updateParticles(deltaTime: number): void {
    const config = this.config;

    for (const particle of this.particles) {
      if (!particle.active) continue;

      // 更新生命
      particle.life -= deltaTime;
      
      if (particle.life <= 0) {
        particle.active = false;
        this.particleCount--;
        continue;
      }

      // 归一化生命 (0-1)
      const lifeRatio = particle.life / particle.maxLife;

      // 应用重力
      particle.velocity.x += config.gravity.x * deltaTime;
      particle.velocity.y += config.gravity.y * deltaTime;
      particle.velocity.z += config.gravity.z * deltaTime;

      // 应用阻力
      particle.velocity.multiplyScalar(1 - config.drag * deltaTime);

      // 更新位置
      particle.position.addScaledVector(particle.velocity, deltaTime);

      // 更新旋转
      particle.rotation += particle.rotationSpeed * deltaTime;

      // 更新大小
      const sizeRatio = 1 - lifeRatio;
      particle.size = MathUtils.lerp(config.startSize, config.endSize, sizeRatio);

      // 更新颜色
      particle.color.lerpColors(config.endColor, config.startColor, lifeRatio);

      // 更新不透明度（淡入淡出）
      const age = config.maxLife - particle.life;
      if (age < config.fadeIn) {
        particle.opacity = (age / config.fadeIn) * config.opacity;
      } else if (particle.life < config.fadeOut) {
        particle.opacity = (particle.life / config.fadeOut) * config.opacity;
      } else {
        particle.opacity = config.opacity;
      }
    }
  }

  /**
   * 更新 GPU 数据
   */
  private updateGPUData(): void {
    let index = 0;
    
    for (const particle of this.particles) {
      if (!particle.active) {
        // 隐藏非活动粒子
        this.sizes[index] = 0;
        index++;
        continue;
      }

      // 位置
      this.positions[index * 3] = particle.position.x;
      this.positions[index * 3 + 1] = particle.position.y;
      this.positions[index * 3 + 2] = particle.position.z;

      // 颜色
      this.colors[index * 3] = particle.color.r;
      this.colors[index * 3 + 1] = particle.color.g;
      this.colors[index * 3 + 2] = particle.color.b;

      // 大小、旋转、不透明度
      this.sizes[index] = particle.size;
      this.rotations[index] = particle.rotation;
      this.opacities[index] = particle.opacity;

      index++;
    }

    // 标记属性需要更新
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.rotation.needsUpdate = true;
    this.geometry.attributes.opacity.needsUpdate = true;
  }

  // ========== 控制方法 ==========

  play(): void {
    this.isPlaying = true;
  }

  pause(): void {
    this.isPlaying = false;
  }

  stop(): void {
    this.isPlaying = false;
    this.elapsedTime = 0;
    this.emissionAccumulator = 0;
    this.clear();
  }

  clear(): this {
    for (const particle of this.particles) {
      particle.active = false;
    }
    this.particleCount = 0;
    this.updateGPUData();
    return this;
  }

  burst(count: number): void {
    for (let i = 0; i < count; i++) {
      const particle = this.particles.find(p => !p.active);
      if (!particle) break;
      this.initParticle(particle);
    }
  }

  // ========== 配置更新 ==========

  updateConfig(config: Partial<EmitterConfig>): void {
    Object.assign(this.config, config);
    
    // 更新材质
    if (config.blending) {
      this.material.blending = this.config.blending === 'additive' ? AdditiveBlending : NormalBlending;
    }
    if (config.texture) {
      this.material.uniforms.pointTexture.value = config.texture;
    }
  }

  getConfig(): EmitterConfig {
    return { ...this.config };
  }

  getParticleCount(): number {
    return this.particleCount;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.particles = [];
  }
}

/**
 * 预定义粒子效果
 */
export const ParticlePresets = {
  // 火焰
  fire: (): Partial<EmitterConfig> => ({
    name: 'Fire',
    maxParticles: 500,
    emissionRate: 60,
    minLife: 0.5,
    maxLife: 1.5,
    minVelocity: new Vector3(-0.5, 1, -0.5),
    maxVelocity: new Vector3(0.5, 3, 0.5),
    startSize: 0.8,
    endSize: 0.1,
    startColor: new Color(1, 0.8, 0),
    endColor: new Color(1, 0.2, 0),
    gravity: new Vector3(0, 0, 0),
    drag: 0.5,
    blending: 'additive',
    shape: 'sphere',
    shapeRadius: 0.3
  }),

  // 烟雾
  smoke: (): Partial<EmitterConfig> => ({
    name: 'Smoke',
    maxParticles: 300,
    emissionRate: 30,
    minLife: 2,
    maxLife: 4,
    minVelocity: new Vector3(-0.3, 0.5, -0.3),
    maxVelocity: new Vector3(0.3, 1.5, 0.3),
    startSize: 0.5,
    endSize: 2,
    startColor: new Color(0.5, 0.5, 0.5),
    endColor: new Color(0.3, 0.3, 0.3),
    gravity: new Vector3(0, 0.5, 0),
    drag: 0.2,
    blending: 'normal',
    opacity: 0.3,
    fadeIn: 0.5,
    fadeOut: 1
  }),

  // 爆炸
  explosion: (): Partial<EmitterConfig> => ({
    name: 'Explosion',
    maxParticles: 200,
    emissionRate: 0,
    minLife: 0.3,
    maxLife: 0.8,
    minVelocity: new Vector3(-8, -8, -8),
    maxVelocity: new Vector3(8, 8, 8),
    startSize: 1.5,
    endSize: 0.2,
    startColor: new Color(1, 0.9, 0.5),
    endColor: new Color(1, 0.3, 0),
    gravity: new Vector3(0, -5, 0),
    drag: 0.02,
    blending: 'additive',
    loop: false
  }),

  // 雨雪
  rain: (): Partial<EmitterConfig> => ({
    name: 'Rain',
    maxParticles: 2000,
    emissionRate: 500,
    minLife: 1,
    maxLife: 2,
    minVelocity: new Vector3(-2, -10, -2),
    maxVelocity: new Vector3(2, -15, 2),
    startSize: 0.05,
    endSize: 0.05,
    startColor: new Color(0.7, 0.8, 1),
    endColor: new Color(0.7, 0.8, 1),
    gravity: new Vector3(0, -9.8, 0),
    drag: 0,
    blending: 'normal',
    shape: 'box',
    shapeRadius: 10,
    position: new Vector3(0, 10, 0)
  }),

  // 魔法/星星
  magic: (): Partial<EmitterConfig> => ({
    name: 'Magic',
    maxParticles: 300,
    emissionRate: 40,
    minLife: 1,
    maxLife: 2,
    minVelocity: new Vector3(-1, 0, -1),
    maxVelocity: new Vector3(1, 2, 1),
    startSize: 0.3,
    endSize: 0,
    startColor: new Color(0.5, 0.8, 1),
    endColor: new Color(1, 0.5, 0.8),
    gravity: new Vector3(0, 2, 0),
    drag: 0.3,
    blending: 'additive',
    rotationSpeed: 2
  }),

  // 火花
  spark: (): Partial<EmitterConfig> => ({
    name: 'Sparks',
    maxParticles: 100,
    emissionRate: 20,
    minLife: 0.2,
    maxLife: 0.5,
    minVelocity: new Vector3(-3, 0, -3),
    maxVelocity: new Vector3(3, 5, 3),
    startSize: 0.1,
    endSize: 0.02,
    startColor: new Color(1, 1, 0.8),
    endColor: new Color(1, 0.5, 0),
    gravity: new Vector3(0, -9.8, 0),
    drag: 0.01,
    blending: 'additive'
  })
};
