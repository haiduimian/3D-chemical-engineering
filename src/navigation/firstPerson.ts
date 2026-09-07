import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { EQUIPMENTS } from '../layout/plantLayout'

/**
 * 第一人称虚拟巡检控制器（PointerLockControls + WASD + 简化碰撞/边界）
 * 巡检点打卡：onMove 回调中由调用方判定
 */

export interface PatrolPoint {
  id: string
  name: string
  pos: THREE.Vector3
  radius: number
  checked: boolean
}

/** R10 巡检碰撞体（水平 AABB，y 方向游戏内恒定 2.2m 观察高度） */
export interface Collider {
  x: number
  z: number
  hx: number
  hz: number
  label: string
}

/** 玩家水平包围半径（身体宽度 ~0.9m） */
export const PLAYER_RADIUS = 0.45

/** 点是否与碰撞体相交（含玩家半径扩展） */
export function collides(x: number, z: number, c: Collider): boolean {
  return Math.abs(x - c.x) < c.hx + PLAYER_RADIUS && Math.abs(z - c.z) < c.hz + PLAYER_RADIUS
}

/**
 * R10 巡检碰撞体表：设备（按型体半径+平台余量）＋罐区/球罐围堰四墙＋管廊柱列。
 * 与 environment.ts / plantLayout.ts 的布置数据保持同一事实来源（直接 import EQUIPMENTS）。
 */
export function buildPatrolColliders(): Collider[] {
  const out: Collider[] = []
  const push = (x: number, z: number, hx: number, hz: number, label: string) =>
    out.push({ x, z, hx, hz, label })
  for (const e of EQUIPMENTS) {
    switch (e.type) {
      case 'tank': push(e.x, e.z, 5.2, 5.2, e.id); break
      case 'sphere': push(e.x, e.z, 7.6, 7.6, e.id); break
      case 'reactor': push(e.x, e.z, 3.2, 3.2, e.id); break
      case 'column': push(e.x, e.z, 3.4, 3.4, e.id); break
      case 'exchanger': push(e.x, e.z, 4.6, 2.4, e.id); break
      case 'pump': push(e.x, e.z, 1.7, 1.9, e.id); break
      case 'mixer': push(e.x, e.z, 2.4, 1.6, e.id); break
      case 'inhibitorTank': push(e.x, e.z, 2.3, 2.3, e.id); break
      default: break
    }
  }
  // 罐区围堰（丙烯酸+甲醇：x -65.5..-29.5, z -40.5..-24，墙厚 1m）
  // R10 门洞：东西墙中部各留 4m 通行口（巡检可进入罐区内部）
  for (const [cx, cz, hx, hz] of [
    [-47.5, -40, 18, 1], [-47.5, -25, 18, 1], // 北墙 / 南墙
    [-64, -35.5, 1, 5.25], [-64, -28.5, 1, 1.75], // 西墙（门洞 z -30.5..-26.5）
    [-31, -35.5, 1, 5.25], [-31, -28.5, 1, 1.75], // 东墙
  ] as const) push(cx, cz, hx + 0.3, hz + 0.3, 'dike-acid')
  // 球罐围堰（x 45..65, z -42..-24；同样留门洞）
  for (const [cx, cz, hx, hz] of [
    [55, -41, 10, 1], [55, -24, 10, 1],
    [46.5, -35.5, 1, 6.25], [46.5, -28.5, 1, 1.75],
    [63.5, -35.5, 1, 6.25], [63.5, -28.5, 1, 1.75],
  ] as const) push(cx, cz, hx + 0.3, hz + 0.3, 'dike-sphere')
  // 管廊柱列（z=-6 与 z=28；柱 ±2 错位 + 混凝土柱基墩 1.2 宽）
  for (const [z, x0, x1] of [[-6, -60, 30], [28, 15, 45]] as const) {
    for (let x = x0; x <= x1; x += 8) {
      push(x, z - 2, 0.8, 0.8, `rack${z}-n`)
      push(x, z + 2, 0.8, 0.8, `rack${z}-s`)
    }
  }
  return out
}

/** R10 滑移碰撞解析：优先完整位移 → 回退 X 轴 → 回退 Z 轴 → 原地（贴墙滑行） */
export function resolveCollision(
  pos: THREE.Vector3,
  dx: number,
  dz: number,
  colliders: Collider[],
): { x: number, z: number } {
  const nx = pos.x + dx
  const nz = pos.z + dz
  const hit = (x: number, z: number) => colliders.some(c => collides(x, z, c))
  if (!hit(nx, nz)) return { x: nx, z: nz }
  if (!hit(nx, pos.z)) return { x: nx, z: pos.z }
  if (!hit(pos.x, nz)) return { x: pos.x, z: nz }
  return { x: pos.x, z: pos.z }
}

export const PATROL_POINTS: PatrolPoint[] = [
  { id: 'pt1', name: '罐区 V-101', pos: new THREE.Vector3(-55, 2.2, -32), radius: 6, checked: false },
  { id: 'pt2', name: '反应器 R-101', pos: new THREE.Vector3(-24, 2.2, 18), radius: 6, checked: false },
  { id: 'pt3', name: '塔区 T-101', pos: new THREE.Vector3(-6, 2.2, 22), radius: 6, checked: false },
]

export class FirstPerson {
  controls: PointerLockControls
  private camera: THREE.Camera
  private direction = new THREE.Vector3()
  private moveState = { f: 0, b: 0, l: 0, r: 0 }
  private active = false
  private disposed = false
  /** 移动速度（m/s） */
  private speed = 16
  /** R10 碰撞体表（由 PlantScene 注入：设备/围堰/管廊柱） */
  private colliders: Collider[] = []
  onLockChange?: (locked: boolean) => void
  onMove?: (pos: THREE.Vector3) => void

  private keydown = (e: KeyboardEvent) => this.handleKey(e, true)
  private keyup = (e: KeyboardEvent) => this.handleKey(e, false)

  constructor(camera: THREE.Camera, dom: HTMLElement) {
    this.camera = camera
    this.controls = new PointerLockControls(camera, dom)

    document.addEventListener('keydown', this.keydown)
    document.addEventListener('keyup', this.keyup)
    this.controls.addEventListener('lock', () => this.onLockChange?.(true))
    this.controls.addEventListener('unlock', () => {
      this.active = false
      this.onLockChange?.(false)
    })
  }

  /** R10：注入碰撞体（巡检开始前由 PlantScene 调用） */
  setColliders(colliders: Collider[]) {
    this.colliders = colliders
  }

  private handleKey(e: KeyboardEvent, down: boolean) {
    if (this.disposed) return
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.moveState.f = down ? 1 : 0; break
      case 'KeyS': case 'ArrowDown': this.moveState.b = down ? 1 : 0; break
      case 'KeyA': case 'ArrowLeft': this.moveState.l = down ? 1 : 0; break
      case 'KeyD': case 'ArrowRight': this.moveState.r = down ? 1 : 0; break
      case 'KeyE': if (down) this.exit(); break  // E 退出巡检
      default: break
    }
  }

  /** 进入巡检（锁定指针） */
  enter() {
    if (this.disposed) return
    this.active = true
    this.controls.lock()
  }

  exit() {
    this.active = false
    if (this.controls.isLocked) this.controls.unlock()
  }

  /**
   * 释放资源：必须调用！
   * PointerLockControls 会在 canvas 上注册 click 监听（任意点击触发 lock()），
   * 若退出巡检后不移除，残留监听会导致之后点击场景时意外进入指针锁定（右键被浏览器捕获）。
   */
  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.exit()
    this.controls.dispose() // 移除 PointerLockControls 的 click/mousemove/pointerlockchange 监听
    document.removeEventListener('keydown', this.keydown)
    document.removeEventListener('keyup', this.keyup)
  }

  get isActive() { return this.active }
  get isLocked() { return this.controls.isLocked }

  update(dt: number) {
    if (!this.active || !this.controls.isLocked) return
    // 直驱移动（W 前 / S 后 / A 左 / D 右），视角旋转由 PointerLockControls 的 mousemove 处理
    this.direction.z = (this.moveState.f ? 1 : 0) - (this.moveState.b ? 1 : 0)
    this.direction.x = (this.moveState.r ? 1 : 0) - (this.moveState.l ? 1 : 0)
    if (this.direction.lengthSq() > 0) {
      this.direction.normalize()
      const dx = this.direction.x * this.speed * dt
      const dz = this.direction.z * this.speed * dt
      // R10 碰撞滑移：水平 XZ 位移先解算，再让 PointerLock 移动
      const resolved = resolveCollision(this.camera.position, dx, dz, this.colliders)
      this.camera.position.x = resolved.x
      this.camera.position.z = resolved.z
    }
    // 简化碰撞：固定观察高度 + 场景边界约束
    this.camera.position.y = 2.2
    const p = this.camera.position
    p.x = Math.max(-72, Math.min(72, p.x))
    p.z = Math.max(-50, Math.min(52, p.z))
    this.onMove?.(p.clone())
  }
}
