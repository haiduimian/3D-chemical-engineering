import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'

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
      this.controls.moveRight(this.direction.x * this.speed * dt)
      this.controls.moveForward(this.direction.z * this.speed * dt)
    }
    // 简化碰撞：固定观察高度 + 场景边界约束
    this.camera.position.y = 2.2
    const p = this.camera.position
    p.x = Math.max(-72, Math.min(72, p.x))
    p.z = Math.max(-50, Math.min(52, p.z))
    this.onMove?.(p.clone())
  }
}
