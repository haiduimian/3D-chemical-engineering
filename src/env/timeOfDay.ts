import * as THREE from 'three'
import type { SkyRig } from './sky'

/**
 * 时段系统（N1 核心）：午后 / 黄昏 / 夜景 三档预设 + 平滑过渡。
 *
 * 白皮书量化验收：
 *  - 切换插值 ≤0.8s、相邻帧全局均值差 ≤±3%
 *  - 三时段截帧全局均值差 ≤±8%、过曝像素 hiPct ≤0.05%
 *  - 闪烁回归 PASS、热点像素(std>30) ≤10px
 *
 * 过渡策略（大厂 3D 通用做法：所有光源/天空/后期 同源插值，避免"跳档"）：
 *  - 每帧对 from/to 预设全字段 lerp：太阳方向、Preetham 参数、直射/补光/
 *    rim/半球光 强度与色温、雾、曝光、路灯、分级参数、GodRays、晕影、星层
 *  - 太阳方向向量 lerp 后 normalize（避免长度收缩导致光强塌陷）
 *  - IBL 内容在过渡中点切换（环境贴图已按预设懒烘焙缓存；environmentIntensity
 *    全程平滑插值 → 全局亮度无跳变）
 *  - 首次使用某预设时 IBL 尚未烘焙（启动后空闲预热），切换前同步烘焙一次
 */

export type PresetName = 'afternoon' | 'dusk' | 'night'

export interface TimePreset {
  name: PresetName
  label: string
  /** 太阳（月光）方向单位向量 */
  sunDir: [number, number, number]
  turbidity: number
  rayleigh: number
  mieCoefficient: number
  mieDirectionalG: number
  /** 天空三段式 HDR 因子（对应 Sky 片段着色器 uniforms） */
  skyScale: number
  sunBoost: number
  skyClamp: number
  envIntensity: number
  sunColor: number
  sunIntensity: number
  fillColor: number
  fillIntensity: number
  rimColor: number
  rimIntensity: number
  hemiSky: number
  hemiGround: number
  hemiIntensity: number
  fogColor: number
  fogNear: number
  fogFar: number
  exposure: number
  godRaysStrength: number
  vignetteIntensity: number
  shadowTint: number
  highlightTint: number
  gradingAmount: number
  /** 路灯点光强度（物理模式 candela） */
  streetLight: number
  /** 路灯灯头自发光强度 */
  streetLampEi: number
  /** 月光补光（仅夜景 >0） */
  moonLight: number
  starsOpacity: number
  /** 云影地面投影强度（R10 P0：午后 0.22 / 黄昏 0.15 / 夜景 0.02） */
  cloudShadow: number
  /** 地面反弹色（IBL 下半球，[r,g,b] 线性） */
  bounceGround: [number, number, number]
}

/** 将颜色按亮度归一化为单位亮度 tint（亮度保持分级的关键：分级只移色相不偷能量） */
export function normalizedTint(hex: number): THREE.Color {
  const c = new THREE.Color(hex)
  const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
  return c.multiplyScalar(1 / Math.max(lum, 0.001))
}

/**
 * 三档时段预设（N1 调参基准）
 *
 * 午后：天顶蓝、太阳高角度（短影）、整体明亮通透
 * 黄昏：R7 光型的继承 —— 低角度暖橙长影 + 冷补光 + 暖 rim；
 *       N1 针对"偏暗偏冷"反馈整体提亮：曝光 0.95→1.05、IBL 0.38→0.42、
 *       太阳 3.4→3.6、补光 0.26→0.32 且色温降蓝、rim 0.72→0.8、
 *       半球 0.18→0.24、晕影 0.28→0.24、分级 amount 0.22→0.18、
 *       暗部 tint 去冷青（0x4a6a80→0x5b6878）、天空 0.30→0.34 加暮色层次
 * 夜景：月亮低角度冷光 + 路灯全开 + 深蓝夜景天空 + 星空
 */
export const TIME_PRESETS: Record<PresetName, TimePreset> = {
  afternoon: {
    name: 'afternoon', label: '午后',
    sunDir: [-28, 76, 58].map(v => v / 100) as [number, number, number],
    turbidity: 3.4, rayleigh: 1.5, mieCoefficient: 0.0032, mieDirectionalG: 0.82,
    // R9（重收敛 v3）：午后 75.5 → ~60 —— 曝光 0.42→0.30、天空 0.13→0.09
    skyScale: 0.09, sunBoost: 3.2, skyClamp: 5.5,
    envIntensity: 0.45,
    sunColor: 0xfff0da, sunIntensity: 3.9,
    fillColor: 0xc4d2ea, fillIntensity: 0.34,
    rimColor: 0xffd9b4, rimIntensity: 0.5,
    hemiSky: 0xadc6e6, hemiGround: 0x9a8a68, hemiIntensity: 0.3,
    fogColor: 0xd8cfbc, fogNear: 260, fogFar: 1150,
    exposure: 0.3,
    godRaysStrength: 0.12,
    vignetteIntensity: 0.16,
    shadowTint: 0x6a7280, highlightTint: 0xffe2b0, gradingAmount: 0.12,
    streetLight: 0, streetLampEi: 0.25,
    moonLight: 0, starsOpacity: 0,
    cloudShadow: 0.22,
    bounceGround: [0.32, 0.28, 0.21],
  },
  dusk: {
    name: 'dusk', label: '黄昏',
    sunDir: [-100, 42, 80].map(v => v / 140) as [number, number, number],
    turbidity: 4.2, rayleigh: 0.95, mieCoefficient: 0.0044, mieDirectionalG: 0.85,
    // R9（重收敛 v4）：黄昏 68.6 → ~60 —— 曝光 0.60→0.52、天空 0.10→0.09
    skyScale: 0.09, sunBoost: 3.6, skyClamp: 4.6,
    envIntensity: 0.38,
    sunColor: 0xffd2a0, sunIntensity: 3.8,
    fillColor: 0xa9b8d6, fillIntensity: 0.36,
    rimColor: 0xffb37a, rimIntensity: 0.8,
    hemiSky: 0x9fb2d0, hemiGround: 0xe2a676, hemiIntensity: 0.28,
    fogColor: 0xc3947a, fogNear: 150, fogFar: 780,
    exposure: 0.5,
    godRaysStrength: 0.2,
    vignetteIntensity: 0.22,
    // R9 色相暖调恢复（不动亮度）：暗部 tint 微暖化 + 分级强度回升
    shadowTint: 0x5f6572, highlightTint: 0xffc890, gradingAmount: 0.2,
    streetLight: 50, streetLampEi: 6,
    moonLight: 0, starsOpacity: 0,
    cloudShadow: 0.15,
    bounceGround: [0.28, 0.2, 0.14],
  },
  night: {
    name: 'night', label: '夜景',
    sunDir: [60, -26, -95].map(v => v / 120) as [number, number, number],
    turbidity: 2.0, rayleigh: 1.1, mieCoefficient: 0.0034, mieDirectionalG: 0.72,
    // 太阳已沉入地平线以下：天空极暗、无太阳盘
    // R9（重收敛 v2）：夜景 64.8 → ~58 —— 曝光 2.2→1.9、天空 0.30→0.26
    skyScale: 0.26, sunBoost: 0, skyClamp: 2.8,
    envIntensity: 0.5,
    sunColor: 0x9db4e8, sunIntensity: 2.3,
    fillColor: 0x7a8cba, fillIntensity: 0.3,
    rimColor: 0x55689a, rimIntensity: 0.42,
    hemiSky: 0x3c4a6e, hemiGround: 0x1c2230, hemiIntensity: 1.25,
    fogColor: 0x182034, fogNear: 110, fogFar: 820,
    exposure: 1.9,
    godRaysStrength: 0.05,
    vignetteIntensity: 0.3,
    shadowTint: 0x35436b, highlightTint: 0xffc890, gradingAmount: 0.26,
    streetLight: 320, streetLampEi: 9,
    moonLight: 2.3, starsOpacity: 0.85,
    cloudShadow: 0.02,
    bounceGround: [0.1, 0.12, 0.2],
  },
}

/** 灯组句柄（environment.ts 构建后交给时段系统托管） */
export interface LightHandles {
  sun: THREE.DirectionalLight
  fill: THREE.DirectionalLight
  rim: THREE.DirectionalLight
  core: THREE.DirectionalLight
  moon: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  streets: THREE.PointLight[]
  streetLampMat: THREE.MeshStandardMaterial
}

/** 后期通道句柄（PlantScene 构建后交给时段系统托管） */
export interface PassHandles {
  gradingUniforms: {
    shadowTint: { value: THREE.Color }, highlightTint: { value: THREE.Color }, amount: { value: number },
  }
  vignetteUniforms: { intensity: { value: number } }
  godRaysUniforms: { strength: { value: number } } | null
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const lerp = (a: number, b: number, u: number) => a + (b - a) * u
const lerpArr = (a: [number, number, number], b: [number, number, number], u: number): [number, number, number] =>
  [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)]

export class TimeOfDaySystem {
  private rig: SkyRig
  private lights: LightHandles
  private passes: PassHandles
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private fog: THREE.Fog
  /** R10 云影地面投影贴片（环境构建后注入，按档位调 opacity） */
  private cloudShadows: THREE.Mesh[]

  private current: PresetName = 'dusk'
  private trans: { from: TimePreset; to: TimePreset; t0: number; dur: number } | null = null
  private envSwapped = false
  /** R9：目标预设的 IBL 异步烘焙完成后待切换（烘焙晚于过渡结束时的兜底轮询） */
  private pendingEnv: PresetName | null = null
  /** 当前太阳方向（GodRays 等按帧读取） */
  private sunDirVec = new THREE.Vector3(...TIME_PRESETS.dusk.sunDir).normalize()
  private now = 0

  constructor(rig: SkyRig, lights: LightHandles, passes: PassHandles, scene: THREE.Scene, renderer: THREE.WebGLRenderer, cloudShadows: THREE.Mesh[] = []) {
    this.rig = rig
    this.lights = lights
    this.passes = passes
    this.scene = scene
    this.renderer = renderer
    this.fog = scene.fog as THREE.Fog
    this.cloudShadows = cloudShadows
    // 初始：黄昏档直接落位（与 R7 外观基线一致，但含提亮修正）
    this.apply(TIME_PRESETS.dusk, 1)
    // 首帧 IBL 烘焙（成本与 R7 相同）
    this.rig.ensureBaked(TIME_PRESETS.dusk)
    // R9 阴影按需更新：autoUpdate=false 下首帧贴图为空 → 构造时立即触发一次，
    // 否则全场景无影子（渲染器 shadowMap.autoUpdate 由 PlantScene 关闭）
    this.lights.sun.shadow.needsUpdate = true
    this.lights.core.shadow.needsUpdate = true
    // 空闲预热其余两档 IBL（真实 GPU ≤0.5s；SwiftShader 数秒，不阻塞首帧）
    setTimeout(() => this.rig.ensureBaked(TIME_PRESETS.afternoon), 4000)
    setTimeout(() => this.rig.ensureBaked(TIME_PRESETS.night), 9000)
  }

  get presetName(): PresetName { return this.current }
  /** 当前（插值中）太阳方向，GodRays/测试按帧读取 */
  get sunDirection(): THREE.Vector3 { return this.sunDirVec }
  /** 是否正处于过渡中（自动化测试用） */
  get transitioning(): boolean { return this.trans !== null }
  /** IBL 烘焙日志（自动化诊断用） */
  get bakeLog(): { name: string; at: number }[] { return this.rig.bakeLog }
  /** 天空 unifom 实况（自动化诊断用：验证天空随档位变化） */
  get skyDebug(): Record<string, unknown> {
    const u = this.rig.sky.material.uniforms as unknown as Record<string, { value: unknown }>
    return {
      turbo: [u.turbidity.value, u.rayleigh.value, u.mieCoefficient.value, u.mieDirectionalG.value],
      sunPos: (u.sunPosition.value as THREE.Vector3).toArray(),
      skyScale: u.uSkyScale?.value, sunBoost: u.uSunBoost?.value, skyClamp: u.uSkyClamp?.value,
      starsOpacity: this.rig.starsOpacity, envActive: this.rig.envActiveName,
      // R9 诊断：天空是否在可见场景（skyGroup）中；不能期望 null/其他 parent
      skyParent: this.rig.sky.parent === this.rig.skyGroup ? 'skyGroup' : (this.rig.sky.parent === null ? 'NULL-ORPHAN' : this.rig.sky.parent.type),
      envSceneHasSky: this.rig.envSceneHasSky,
    }
  }

  setPreset(name: PresetName, dur = 0.8) {
    if (name === this.current && !this.trans) return
    const to = TIME_PRESETS[name]
    // 首次使用未烘焙预设 → 异步烘焙（不阻塞过渡；烘焙完成后由 update 择机换环境贴图）。
    // 同步烘焙会把主线程卡住数秒（SwiftShader），且 clock 继续走表 → 过渡瞬跳完成。
    if (!this.rig.hasEnv(name)) setTimeout(() => this.rig.ensureBaked(to), 0)
    this.pendingEnv = name
    this.trans = { from: TIME_PRESETS[this.current], to, t0: this.now, dur }
    this.envSwapped = false
  }

  /** 每帧调用（seconds = clock.elapsedTime） */
  update(nowSec: number) {
    this.now = nowSec
    // R9：异步烘焙兜底 —— 过渡已结束但 IBL 尚未就绪时，烘焙完成后的下一帧补切换
    if (this.pendingEnv && this.rig.hasEnv(this.pendingEnv)) {
      this.rig.swapEnvironment(TIME_PRESETS[this.pendingEnv])
      this.pendingEnv = null
    }
    const tr = this.trans
    if (!tr) return
    const u = Math.min(1, (nowSec - tr.t0) / tr.dur)
    const e = easeInOut(u)
    this.apply(tr.to, e)
    // 过渡中点切换 IBL 内容（强度已由 apply 平滑插值）；
    // 若目标 IBL 仍在异步烘焙，则烘焙完成后于后续帧切换
    if (!this.envSwapped && this.rig.hasEnv(tr.to.name) && e >= 0.5) {
      this.rig.swapEnvironment(tr.to)
      this.envSwapped = true
      if (this.pendingEnv === tr.to.name) this.pendingEnv = null
      // R9：太阳方向已移动过半 → 触发阴影贴图按需重算（autoUpdate=false 范式）
      this.lights.sun.shadow.needsUpdate = true
      this.lights.core.shadow.needsUpdate = true
    }
    if (u >= 1) {
      this.current = tr.to.name
      this.trans = null
      // 过渡终态：太阳/月光落位 → 阴影贴图最终刷新一次
      this.lights.sun.shadow.needsUpdate = true
      this.lights.core.shadow.needsUpdate = true
    }
  }

  // 需逐帧插值的标量字段（apply 时成对处理）
  private static NUMERIC_FIELDS = [
    'turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG',
    'skyScale', 'sunBoost', 'skyClamp', 'envIntensity',
    'sunColor', 'sunIntensity', 'fillColor', 'fillIntensity',
    'rimColor', 'rimIntensity', 'hemiSky', 'hemiGround', 'hemiIntensity',
    'fogColor', 'fogNear', 'fogFar', 'exposure',
    'godRaysStrength', 'vignetteIntensity',
    'shadowTint', 'highlightTint', 'gradingAmount',
    'streetLight', 'streetLampEi', 'moonLight', 'starsOpacity', 'cloudShadow',
  ] as const

  /** 数值字段统一插值（避免逐字段硬编码） */
  private static lerpPreset(a: TimePreset, b: TimePreset, u: number): TimePreset {
    const out = { ...b } as TimePreset & Record<string, unknown>
    for (const k of TimeOfDaySystem.NUMERIC_FIELDS) {
      out[k] = lerp(a[k] as number, b[k] as number, u)
    }
    out.sunDir = lerpArr(a.sunDir, b.sunDir, u)
    out.bounceGround = lerpArr(a.bounceGround, b.bounceGround, u)
    return out
  }

  private apply(b: TimePreset, u: number) {
    const a = TIME_PRESETS[this.current]
    const m = TimeOfDaySystem.lerpPreset(a, b, u)
    const L = this.lights

    // ── 太阳/月光（方向 lerp 后归一化，防止光强塌陷） ──
    const dir = new THREE.Vector3(...m.sunDir).normalize()
    this.sunDirVec.copy(dir)
    L.sun.position.copy(dir).multiplyScalar(160)
    L.core.position.copy(dir).multiplyScalar(160)
    L.moon.position.copy(dir).multiplyScalar(-160)
    L.sun.color.setHex(m.sunColor)
    L.sun.intensity = m.sunIntensity
    L.rim.color.setHex(m.rimColor)
    L.rim.intensity = m.rimIntensity
    L.fill.color.setHex(m.fillColor)
    L.fill.intensity = m.fillIntensity
    L.hemi.color.setHex(m.hemiSky)
    L.hemi.groundColor.setHex(m.hemiGround)
    L.hemi.intensity = m.hemiIntensity
    L.moon.intensity = m.moonLight

    // ── 路灯（点光 + 灯头自发光联动） ──
    for (const pl of L.streets) pl.intensity = m.streetLight
    L.streetLampMat.emissiveIntensity = m.streetLampEi

    // ── 天空/星层 ──
    this.rig.applySkyState(m)

    // ── R10 云影投影强度（午后强 / 黄昏弱 / 夜景近无） ──
    for (const sh of this.cloudShadows) {
      ;(sh.material as THREE.MeshBasicMaterial).opacity = m.cloudShadow
    }

    // ── IBL / 雾 / 曝光 ──
    this.scene.environmentIntensity = m.envIntensity
    this.fog.color.setHex(m.fogColor)
    this.fog.near = m.fogNear
    this.fog.far = m.fogFar
    this.renderer.toneMappingExposure = m.exposure

    // ── 后期通道 ──
    const P = this.passes
    P.gradingUniforms.amount.value = m.gradingAmount
    P.gradingUniforms.shadowTint.value.setHex(m.shadowTint)
    P.gradingUniforms.highlightTint.value.setHex(m.highlightTint)
    P.vignetteUniforms.intensity.value = m.vignetteIntensity
    if (P.godRaysUniforms) P.godRaysUniforms.strength.value = m.godRaysStrength
  }

  dispose() {
    this.rig.dispose()
  }
}