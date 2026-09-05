import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import type { TimePreset } from './timeOfDay'

/**
 * 物理大气散射天空 v2（N1 时段化重构）
 *
 * v1 硬编码黄昏档：太阳方向/瑞利/米氏参数固定，IBL 只烘焙一次
 * → 无法演示昼夜（白皮书 N1 核心目标）。
 *
 * v2 关键改动：
 *  - 天空参数（Rayleigh/Mie/太阳位置/三段式 HDR 因子）全部可写，支持
 *    3 档时段预设 + 逐帧插值（uSkyScale/uSunBoost/uSkyClamp 提升为 uniform）。
 *  - IBL 按预设懒烘焙（PMREM fromScene）：天空 + 地面反弹同源，金属反射
 *    与可见天空物理一致；每个预设独立 RT 可缓存缓存切换（N1 过渡平滑）。
 *  - 夜空星层：挂在 skyGroup 上，由时段系统按 starsOpacity 控制。
 */

/** 黄昏太阳方向（单位向量）：西偏北低角度，与 environment.ts 主光保持一致 */
export const SUN_DIRECTION = new THREE.Vector3(-100, 42, 80).normalize()

export class SkyRig {
  readonly sky: Sky
  readonly skyGroup: THREE.Group
  private readonly stars: THREE.Points
  private pmrem: THREE.PMREMGenerator
  private envScene = new THREE.Scene()
  private bounceGround: THREE.Mesh
  private scene: THREE.Scene
  /** 已烘焙预设 → PMREM 纹理（独立 RT，可跨过渡缓存复用） */
  private envCache = new Map<string, THREE.Texture>()
  private envActive = ''
  /** 烘焙时间戳日志（自动化诊断/验收用） */
  readonly bakeLog: { name: string; at: number }[] = []

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene
    this.sky = new Sky()
    // Sky 顶点着色器将 z 强制推到远平面（gl_Position.z = gl_Position.w），
    // 尺度只需保证包住相机与全部场景即可
    this.sky.scale.setScalar(10000)

    const u = this.sky.material.uniforms
    u.turbidity.value = 4.2
    u.rayleigh.value = 0.95
    u.mieCoefficient.value = 0.0044
    u.mieDirectionalG.value = 0.85
    u.sunPosition.value.copy(SUN_DIRECTION)

    // ── v2 三段式 HDR 因子参数化：常量 → uniforms ──
    // v10 定位：Preetham 太阳盘 HDR 上万 → 任何阈值下都会被 bloom 放大；
    // 正解三段式：天空整体压暗 + 太阳盘恢复高亮 + 总钳制防 bloom 爆。
    // N1：三因子跟随时段插值（午后更亮、夜景极暗且无太阳盘）
    const frag = this.sky.material.fragmentShader.replace(
      'gl_FragColor = vec4( retColor, 1.0 );',
      `retColor *= uSkyScale;
			retColor += uSunBoost * sundisk;
			retColor = uSkyClamp * ( 1.0 - exp( - retColor / uSkyClamp ) );
			gl_FragColor = vec4( retColor, 1.0 );`,
    )
    const head = frag.indexOf('void main()')
    const decl = `uniform float uSkyScale;
      uniform float uSunBoost;
      uniform float uSkyClamp;
`
    this.sky.material.fragmentShader = frag.slice(0, head) + decl + frag.slice(head)
    // ⚠️ R9 修复：GLSL 声明了这三个 uniform，但 WebGLRenderer 只上传
    // material.uniforms 中登记的条目 —— 未登记则 GLSL 默认 0 → retColor*=0
    // → 天空恒黑（R8 全时段"天空偏黑"根因，含用户反馈与此前"偏暗"观感）。
    // 必须在 patch 着色器的同时登记 uniform 并提供与 dusk 档一致的初始值。
    const extra = this.sky.material.uniforms as unknown as Record<string, { value: number }>
    extra.uSkyScale = { value: 0.34 }
    extra.uSunBoost = { value: 3.6 }
    extra.uSkyClamp = { value: 4.6 }
    this.sky.material.needsUpdate = true

    this.pmrem = new THREE.PMREMGenerator(renderer)
    this.bounceGround = new THREE.Mesh(
      new THREE.SphereGeometry(50, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x8a6a4c, side: THREE.BackSide }),
    )
    this.envScene.add(this.bounceGround)

    // ── 夜空星层（N1 夜景氛围；白天 opacity=0） ──
    this.stars = buildStarField()
    this.stars.visible = true
    this.skyGroup = new THREE.Group()
    this.skyGroup.add(this.sky)
    this.skyGroup.add(this.stars)
    scene.add(this.skyGroup)
  }

  get starsOpacity() { return (this.stars.material as THREE.PointsMaterial).opacity }
  /** 当前生效的环境贴图档位（诊断用） */
  get envActiveName(): string { return this.envActive }
  /** 天空是否遗留在烘焙场景（诊断用；true = 孤儿态 bug） */
  get envSceneHasSky(): boolean { return this.envScene.getObjectById(this.sky.id) !== undefined }

  /** 是否有该预设的 IBL 缓存 */
  hasEnv(name: string) { return this.envCache.has(name) }

  /** 为预设烘焙 IBL（懒调用；已缓存则跳过。返回是否完成） */
  ensureBaked(preset: TimePreset): boolean {
    if (this.envCache.has(preset.name)) return true
    this.bake(preset)
    return true
  }

  /** 把可见天空/星层状态切到某预设（IBL 不动） */
  applySkyState(preset: TimePreset) {
    this.applyUniforms(preset)
    ;(this.stars.material as THREE.PointsMaterial).opacity = preset.starsOpacity
  }

  /** 把环境贴图切到某预设（已烘焙才生效；首次需先 ensureBaked）。
   *  旧贴图不在此处 dispose —— 三档预设全量缓存，随时可切回（内存 ~3×少量 MB） */
  swapEnvironment(preset: TimePreset) {
    const env = this.envCache.get(preset.name)
    if (!env || this.envActive === preset.name) return
    this.scene.environment = env
    this.envActive = preset.name
  }

  private bake(preset: TimePreset) {
    this.bakeLog.push({ name: preset.name, at: performance.now() })
    ;(this.bounceGround.material as THREE.MeshBasicMaterial).color
      .fromArray(preset.bounceGround)
    // ⚠️ R9 根因修复：烘焙必须使用天空的【克隆材质】，绝不改动可见天空的 uniforms！
    // 旧实现直接 applyUniforms(preset) 到共享材质 → 预热烘焙（4s 午后 / 9s 夜景）
    // 会把可见天空永久置成"该档参数"——夜景档太阳沉平地线、skyScale 低 →
    // 用户打开页面约 10s 后天空变黑（与反馈"天空背景都是黑的"完全吻合；
    // 每次切换时段恰好把 uniforms 重新写成当前档，掩盖了此 bug）。
    // 克隆体：geometry 共享、material 独立（ShaderMaterial.clone 会克隆 uniforms 对象）
    const skyClone = new THREE.Mesh(this.sky.geometry, this.sky.material.clone())
    skyClone.scale.copy(this.sky.scale)
    skyClone.frustumCulled = false
    this.applyUniformsTo(skyClone.material, preset)
    try {
      this.envScene.add(skyClone)
      const env = this.pmrem.fromScene(this.envScene)
      this.envCache.set(preset.name, env)
      // 当前无活动环境（首帧）→ 立即生效
      if (!this.envActive) {
        this.scene.environment = env
        this.envActive = preset.name
      }
    } finally {
      this.envScene.remove(skyClone)
      skyClone.material.dispose()
    }
  }

  /** 对任意天空材质应用档位参数（可见天空与烘焙克隆共用此函数） */
  private applyUniformsTo(material: THREE.Material, preset: TimePreset) {
    const u = material.uniforms as unknown as {
      turbidity: { value: number }
      rayleigh: { value: number }
      mieCoefficient: { value: number }
      mieDirectionalG: { value: number }
      sunPosition: { value: THREE.Vector3 }
    }
    u.turbidity.value = preset.turbidity
    u.rayleigh.value = preset.rayleigh
    u.mieCoefficient.value = preset.mieCoefficient
    u.mieDirectionalG.value = preset.mieDirectionalG
    u.sunPosition.value.set(preset.sunDir[0], preset.sunDir[1], preset.sunDir[2])
    const sh = material as unknown as { uniforms: Record<string, { value: number }> }
    if (sh.uniforms.uSkyScale) {
      sh.uniforms.uSkyScale.value = preset.skyScale
      sh.uniforms.uSunBoost.value = preset.sunBoost
      sh.uniforms.uSkyClamp.value = preset.skyClamp
    }
  }

  private applyUniforms(preset: TimePreset) {
    this.applyUniformsTo(this.sky.material, preset)
  }

  dispose() {
    this.pmrem.dispose()
    for (const env of this.envCache.values()) env.dispose()
    this.envCache.clear()
  }
}

/** 星空粒子层：半径 1200 的内球壳（相机 far=1500 内、天空盒 10000 内），
 *  上半球为主。sizeAttenuation=false → 恒定 ~1.6px 星点；
 *  fog=false（否则夜景雾色会把远距星点点没）；深度测试保留（设备遮挡星点）。 */
function buildStarField(): THREE.Points {
  const N = 650
  const pos = new Float32Array(N * 3)
  const R = 1200
  let s = 20240601
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  for (let i = 0; i < N; i++) {
    const u = rnd() * 2 - 1
    const th = rnd() * Math.PI * 2
    const r = Math.sqrt(Math.max(0, 1 - u * u))
    // 上半球 85% + 下半球少量（地平线以下被地面遮挡，无妨）
    const y = (Math.abs(u) * 0.85 + 0.1) * (rnd() > 0.15 ? 1 : -0.2)
    pos[i * 3] = r * Math.cos(th) * R
    pos[i * 3 + 1] = y * R
    pos[i * 3 + 2] = r * Math.sin(th) * R
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    color: 0xdfe8ff, size: 1.6, sizeAttenuation: false,
    transparent: true, opacity: 0, depthWrite: false, fog: false,
  })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  return pts
}