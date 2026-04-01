/**
 * Cannon.js 物理引擎集成
 * 刚体物理、碰撞检测、约束系统
 */

import { 
  World, 
  Body, 
  Material, 
  ContactMaterial,
  Vec3,
  Box,
  Sphere,
  Cylinder,
  Plane,
  Trimesh,
  RigidVehicle,
  Constraint,
  PointToPointConstraint,
  HingeConstraint,
  DistanceConstraint,
  LockConstraint,
  Spring
} from 'cannon-es';
import {
  Object3D,
  Mesh,
  Vector3,
  Quaternion,
  Euler,
  Scene
} from 'three';

/**
 * 物理材质配置
 */
export interface PhysicsMaterialConfig {
  name: string;
  friction: number;           // 摩擦力 (0-1)
  restitution: number;        // 弹性/恢复系数 (0-1)
  contactEquationStiffness: number;
  contactEquationRelaxation: number;
  frictionEquationStiffness: number;
}

/**
 * 刚体配置
 */
export interface RigidBodyConfig {
  mass: number;               // 质量 (0 = 静态)
  shape: 'box' | 'sphere' | 'cylinder' | 'plane' | 'mesh';
  size?: Vector3;             // 盒子/圆柱尺寸
  radius?: number;            // 球体半径
  position?: Vector3;
  rotation?: Vector3;         // Euler angles
  velocity?: Vector3;
  angularVelocity?: Vector3;
  linearDamping?: number;     // 线性阻尼
  angularDamping?: number;    // 角阻尼
  fixedRotation?: boolean;    // 固定旋转
  isTrigger?: boolean;        // 触发器（不产生碰撞响应）
  material?: string;          // 材质名称
}

/**
 * 物理对象映射
 */
interface PhysicsObject {
  mesh: Mesh;
  body: Body;
  config: RigidBodyConfig;
}

/**
 * 物理世界管理器
 */
export class PhysicsWorld {
  private world: World;
  private objects: Map<string, PhysicsObject> = new Map();
  private materials: Map<string, Material> = new Map();
  private defaultMaterial: Material;
  
  private timeStep: number = 1 / 60;
  private maxSubSteps: number = 3;
  private paused: boolean = false;
  
  private scene: Scene;
  private debugMode: boolean = false;
  private debugObjects: Object3D[] = [];

  constructor(scene: Scene, gravity: Vector3 = new Vector3(0, -9.82, 0)) {
    this.scene = scene;
    
    // 创建物理世界
    this.world = new World({
      gravity: new Vec3(gravity.x, gravity.y, gravity.z)
    });

    // 默认材质
    this.defaultMaterial = new Material('default');
    this.world.defaultMaterial = this.defaultMaterial;
    this.materials.set('default', this.defaultMaterial);

    // 默认接触材料
    const defaultContactMaterial = new ContactMaterial(
      this.defaultMaterial,
      this.defaultMaterial,
      {
        friction: 0.3,
        restitution: 0.3
      }
    );
    this.world.addContactMaterial(defaultContactMaterial);
  }

  /**
   * 添加材质
   */
  addMaterial(config: PhysicsMaterialConfig): Material {
    const material = new Material(config.name);
    this.materials.set(config.name, material);

    // 创建与其他所有材质的接触材料
    this.materials.forEach((otherMaterial, name) => {
      if (name === config.name) return;
      
      const contactMaterial = new ContactMaterial(material, otherMaterial, {
        friction: config.friction,
        restitution: config.restitution,
        contactEquationStiffness: config.contactEquationStiffness,
        contactEquationRelaxation: config.contactEquationRelaxation,
        frictionEquationStiffness: config.frictionEquationStiffness
      });
      this.world.addContactMaterial(contactMaterial);
    });

    return material;
  }

  /**
   * 添加刚体
   */
  addRigidBody(mesh: Mesh, config: RigidBodyConfig): Body {
    const shape = this.createShape(config);
    const material = config.material 
      ? this.materials.get(config.material) || this.defaultMaterial
      : this.defaultMaterial;

    const body = new Body({
      mass: config.mass,
      shape: shape,
      position: config.position 
        ? new Vec3(config.position.x, config.position.y, config.position.z)
        : new Vec3(mesh.position.x, mesh.position.y, mesh.position.z),
      material: material,
      linearDamping: config.linearDamping ?? 0.01,
      angularDamping: config.angularDamping ?? 0.01,
      fixedRotation: config.fixedRotation ?? false,
      isTrigger: config.isTrigger ?? false
    });

    // 设置旋转
    if (config.rotation) {
      const quaternion = new Quaternion();
      quaternion.setFromEuler(new Euler(
        config.rotation.x,
        config.rotation.y,
        config.rotation.z
      ));
      body.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    }

    // 设置速度
    if (config.velocity) {
      body.velocity.set(config.velocity.x, config.velocity.y, config.velocity.z);
    }
    if (config.angularVelocity) {
      body.angularVelocity.set(
        config.angularVelocity.x,
        config.angularVelocity.y,
        config.angularVelocity.z
      );
    }

    this.world.addBody(body);

    // 存储映射
    const id = mesh.uuid;
    this.objects.set(id, {
      mesh,
      body,
      config
    });

    return body;
  }

  /**
   * 创建物理形状
   */
  private createShape(config: RigidBodyConfig): any {
    switch (config.shape) {
      case 'box':
        const size = config.size || new Vector3(1, 1, 1);
        return new Box(new Vec3(size.x / 2, size.y / 2, size.z / 2));
      
      case 'sphere':
        return new Sphere(config.radius || 0.5);
      
      case 'cylinder':
        const cylSize = config.size || new Vector3(0.5, 1, 0.5);
        return new Cylinder(
          cylSize.x,     // 顶部半径
          cylSize.x,     // 底部半径
          cylSize.y,     // 高度
          16             // 分段数
        );
      
      case 'plane':
        return new Plane();
      
      case 'mesh':
        // 从 Mesh 几何体创建 Trimesh
        // 简化版本，实际需要处理几何体数据
        return new Box(new Vec3(0.5, 0.5, 0.5));
      
      default:
        return new Box(new Vec3(0.5, 0.5, 0.5));
    }
  }

  /**
   * 移除刚体
   */
  removeRigidBody(mesh: Mesh): void {
    const id = mesh.uuid;
    const obj = this.objects.get(id);
    if (obj) {
      this.world.removeBody(obj.body);
      this.objects.delete(id);
    }
  }

  /**
   * 应用力
   */
  applyForce(mesh: Mesh, force: Vector3, worldPoint?: Vector3): void {
    const obj = this.objects.get(mesh.uuid);
    if (!obj) return;

    const forceVec = new Vec3(force.x, force.y, force.z);
    if (worldPoint) {
      const pointVec = new Vec3(worldPoint.x, worldPoint.y, worldPoint.z);
      obj.body.applyForce(forceVec, pointVec);
    } else {
      obj.body.force.vadd(forceVec, obj.body.force);
    }
  }

  /**
   * 应用冲量
   */
  applyImpulse(mesh: Mesh, impulse: Vector3, worldPoint?: Vector3): void {
    const obj = this.objects.get(mesh.uuid);
    if (!obj) return;

    const impulseVec = new Vec3(impulse.x, impulse.y, impulse.z);
    if (worldPoint) {
      const pointVec = new Vec3(worldPoint.x, worldPoint.y, worldPoint.z);
      obj.body.applyImpulse(impulseVec, pointVec);
    } else {
      obj.body.velocity.vadd(
        impulseVec.scale(1 / obj.body.mass, new Vec3()),
        obj.body.velocity
      );
    }
  }

  /**
   * 设置速度
   */
  setVelocity(mesh: Mesh, velocity: Vector3): void {
    const obj = this.objects.get(mesh.uuid);
    if (obj) {
      obj.body.velocity.set(velocity.x, velocity.y, velocity.z);
    }
  }

  /**
   * 设置位置
   */
  setPosition(mesh: Mesh, position: Vector3): void {
    const obj = this.objects.get(mesh.uuid);
    if (obj) {
      obj.body.position.set(position.x, position.y, position.z);
      obj.body.previousPosition.set(position.x, position.y, position.z);
      obj.body.interpolatedPosition.set(position.x, position.y, position.z);
    }
  }

  /**
   * 唤醒刚体
   */
  wakeUp(mesh: Mesh): void {
    const obj = this.objects.get(mesh.uuid);
    if (obj) obj.body.wakeUp();
  }

  /**
   * 休眠刚体
   */
  sleep(mesh: Mesh): void {
    const obj = this.objects.get(mesh.uuid);
    if (obj) obj.body.sleep();
  }

  // ========== 约束 ==========

  /**
   * 创建点对点约束
   */
  createPointToPointConstraint(
    meshA: Mesh,
    meshB: Mesh,
    pivotA: Vector3,
    pivotB: Vector3
  ): PointToPointConstraint {
    const objA = this.objects.get(meshA.uuid);
    const objB = this.objects.get(meshB.uuid);
    if (!objA || !objB) throw new Error('Body not found');

    const constraint = new PointToPointConstraint(
      objA.body,
      new Vec3(pivotA.x, pivotA.y, pivotA.z),
      objB.body,
      new Vec3(pivotB.x, pivotB.y, pivotB.z)
    );
    this.world.addConstraint(constraint);
    return constraint;
  }

  /**
   * 创建铰链约束
   */
  createHingeConstraint(
    meshA: Mesh,
    meshB: Mesh,
    pivotA: Vector3,
    pivotB: Vector3,
    axisA: Vector3,
    axisB: Vector3
  ): HingeConstraint {
    const objA = this.objects.get(meshA.uuid);
    const objB = this.objects.get(meshB.uuid);
    if (!objA || !objB) throw new Error('Body not found');

    const constraint = new HingeConstraint(
      objA.body,
      objB.body,
      {
        pivotA: new Vec3(pivotA.x, pivotA.y, pivotA.z),
        pivotB: new Vec3(pivotB.x, pivotB.y, pivotB.z),
        axisA: new Vec3(axisA.x, axisA.y, axisA.z),
        axisB: new Vec3(axisB.x, axisB.y, axisB.z)
      }
    );
    this.world.addConstraint(constraint);
    return constraint;
  }

  /**
   * 创建距离约束
   */
  createDistanceConstraint(
    meshA: Mesh,
    meshB: Mesh,
    distance: number
  ): DistanceConstraint {
    const objA = this.objects.get(meshA.uuid);
    const objB = this.objects.get(meshB.uuid);
    if (!objA || !objB) throw new Error('Body not found');

    const constraint = new DistanceConstraint(objA.body, objB.body, distance);
    this.world.addConstraint(constraint);
    return constraint;
  }

  /**
   * 创建锁定约束
   */
  createLockConstraint(meshA: Mesh, meshB: Mesh): LockConstraint {
    const objA = this.objects.get(meshA.uuid);
    const objB = this.objects.get(meshB.uuid);
    if (!objA || !objB) throw new Error('Body not found');

    const constraint = new LockConstraint(objA.body, objB.body);
    this.world.addConstraint(constraint);
    return constraint;
  }

  /**
   * 移除约束
   */
  removeConstraint(constraint: Constraint): void {
    this.world.removeConstraint(constraint);
  }

  // ========== 弹簧 ==========

  /**
   * 创建弹簧
   */
  createSpring(
    meshA: Mesh,
    meshB: Mesh,
    options: {
      restLength?: number;
      stiffness?: number;
      damping?: number;
      localAnchorA?: Vector3;
      localAnchorB?: Vector3;
    } = {}
  ): Spring {
    const objA = this.objects.get(meshA.uuid);
    const objB = this.objects.get(meshB.uuid);
    if (!objA || !objB) throw new Error('Body not found');

    const spring = new Spring(objA.body, objB.body, {
      restLength: options.restLength ?? 1,
      stiffness: options.stiffness ?? 100,
      damping: options.damping ?? 1,
      localAnchorA: options.localAnchorA 
        ? new Vec3(options.localAnchorA.x, options.localAnchorA.y, options.localAnchorA.z)
        : new Vec3(0, 0, 0),
      localAnchorB: options.localAnchorB
        ? new Vec3(options.localAnchorB.x, options.localAnchorB.y, options.localAnchorB.z)
        : new Vec3(0, 0, 0)
    });

    this.world.addEventListener('postStep', () => {
      spring.applyForce();
    });

    return spring;
  }

  // ========== 射线检测 ==========

  /**
   * 射线检测
   */
  raycast(
    from: Vector3,
    to: Vector3,
    options: { 
      skipBackfaces?: boolean;
      collisionFilterMask?: number;
      collisionFilterGroup?: number;
    } = {}
  ): Array<{
    body: Body;
    point: Vector3;
    normal: Vector3;
    distance: number;
  }> {
    const fromVec = new Vec3(from.x, from.y, from.z);
    const toVec = new Vec3(to.x, to.y, to.z);
    
    const result = new (this.world.constructor as any).RaycastResult();
    const ray = new (this.world.constructor as any).Ray(fromVec, toVec);
    
    ray.intersectWorld(this.world, {
      ...options,
      mode: 1, // CLOSEST
      result: result
    });

    if (result.hasHit) {
      return [{
        body: result.body,
        point: new Vector3(result.hitPointWorld.x, result.hitPointWorld.y, result.hitPointWorld.z),
        normal: new Vector3(result.hitNormalWorld.x, result.hitNormalWorld.y, result.hitNormalWorld.z),
        distance: result.distance
      }];
    }

    return [];
  }

  // ========== 更新 ==========

  /**
   * 更新物理世界
   */
  update(deltaTime: number): void {
    if (this.paused) return;

    // 步进物理模拟
    this.world.step(this.timeStep, deltaTime, this.maxSubSteps);

    // 同步 Three.js 对象
    this.objects.forEach(obj => {
      // 位置
      obj.mesh.position.set(
        obj.body.position.x,
        obj.body.position.y,
        obj.body.position.z
      );

      // 旋转
      obj.mesh.quaternion.set(
        obj.body.quaternion.x,
        obj.body.quaternion.y,
        obj.body.quaternion.z,
        obj.body.quaternion.w
      );
    });
  }

  // ========== 控制 ==========

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  setTimeStep(step: number): void {
    this.timeStep = step;
  }

  setGravity(gravity: Vector3): void {
    this.world.gravity.set(gravity.x, gravity.y, gravity.z);
  }

  // ========== 调试 ==========

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    // 这里可以添加调试可视化
  }

  // ========== 清理 ==========

  dispose(): void {
    this.objects.clear();
    this.materials.clear();
    // Cannon.js 世界会在垃圾回收时自动清理
  }

  // ==========  getter ==========

  getWorld(): World {
    return this.world;
  }

  getBody(mesh: Mesh): Body | undefined {
    return this.objects.get(mesh.uuid)?.body;
  }

  getObjectCount(): number {
    return this.objects.size;
  }
}
