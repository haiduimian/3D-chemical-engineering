import * as THREE from 'three'
import { Diagram } from 'aurea-eden/lib/diagrams/Diagram.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { EQUIPMENTS, PIPES, CAMERA_TOURS, type EquipmentDef } from '../layout/plantLayout'
import { PORTS, auditPipePortSizes } from '../layout/ports'
import { buildEquipment } from '../shapes/plantShapes'
import { buildPipe, animatePipes, animateGauges, setPipeHighlight, setPipeHeat, resetPipeHeat, type BuiltPipe } from '../connectors/pipes'
import { pipeMidpoint } from '../connectors/path'
import { buildEnvironment, buildWarningLights, animateSteam, animateFlare, animateDust, animateClouds, animateCityBeacons, type SteamPuff } from '../env/environment'
import { TimeOfDaySystem, normalizedTint, type PresetName } from '../env/timeOfDay'
import { MockDataSource, TAG_MAP, norm, type TickCallback, type DeviceState } from '../data/processData'
import { LeakEffect, FireEffect, buildHazardZones } from '../effects/safety'
import { FirstPerson, PATROL_POINTS, buildPatrolColliders, resolveCollision, type Collider } from '../navigation/firstPerson'
import { PIPE_COLORS } from '../materials/pbr'
import { assertEmissionInvariants } from './emissionInvariants'

/**
 * PlantScene —— 3D 化工厂场景编排 v6（黄昏工业风质感）
 * 集成：设备精细建模 / 端口化管线 + 流向 / 阀门泵状态 / 仪表盘 /
 *       安全特效（泄漏·火焰·危险区）/ 第一人称巡检 / SOP 培训联动 / 热力图 / 渲染预算
 * 渲染：接管 Diagram 自带渲染循环，走 EffectComposer（SSAO + Bloom + 青橙分级 + ACES 输出）
 */

/** 青橙分级 v2（teal & orange）：亮度保持式 split-toning。
 *  v1 缺陷：直接乘 tint 系数（×2.2）改变画面能量，暗部大面积偏青发脏；
 *  v2 先按 tint 归一化亮度再混合 → 只移色相不偷能量，黄昏暖调不被破坏 */
const tealOrangeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    // tint 已按亮度归一化（JS 侧计算）：暗部冷青、高光暖橙
    shadowTint: { value: normalizedTint(0x4a6a80) },
    highlightTint: { value: normalizedTint(0xffc890) },
    amount: { value: 0.22 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec3 shadowTint;
    uniform vec3 highlightTint;
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      float shadowW = smoothstep(0.5, 0.0, lum);
      float highW = smoothstep(0.5, 1.0, lum);
      // 亮度保持：tint 归一化后 × 当前亮度 → 混合前后能量一致
      vec3 graded = mix(c.rgb, lum * shadowTint, shadowW * amount);
      graded = mix(graded, lum * highlightTint, highW * amount);
      gl_FragColor = vec4(graded, c.a);
    }
  `,
}

/** 将颜色按亮度归一化为单位亮度 tint（亮度保持分级的关键，定义于 timeOfDay.ts 供时段系统复用） */

/** Glsl 风格 smoothstep（JS 侧，报警灯斜坡用） */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** 微晕影（vignette v1）：画面四角轻微压暗，把视线收拢到主体设备群，
 *  并压住角落高亮（天空/远景）对构图的干扰。0.25 强度：有层次感但不"暗角病" */
const vignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    intensity: { value: 0.28 },
    radius: { value: 0.72 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float intensity;
    uniform float radius;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float dist = length(d);
      float vig = smoothstep(radius, radius * 1.55, dist);
      gl_FragColor = vec4(c.rgb * (1.0 - vig * intensity), c.a);
    }
  `,
}

/** 屏幕空间体积光（God Rays v1，R2）：沿"像素→太阳屏幕方向"径向采样并加权累计，
 *  只放大高亮流（太阳盘/夕照天空/浮尘承接），additive 叠加 → 夕阳丁达尔光柱。
 *  - uSunRaw 为太阳归一化屏幕坐标（用于屏内/屏外判定）；
 *    uSun 钳制到屏内 → 太阳在屏外时产生"屏外斜射"经典光型（默认逆光构图的常态）
 *  - dither 为静态哈希（无时间噪声 → 不引入闪烁）
 *  - 仅在强机上启用；R3 采样 56→48（性能平衡） */
const godRaysShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSunRaw: { value: new THREE.Vector2(2, 2) },
    uSun: { value: new THREE.Vector2(0.85, 0.5) },
    strength: { value: 0.2 },
    samples: { value: 48 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uSunRaw;
    uniform vec2 uSun;
    uniform float strength;
    uniform int samples;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      // 太阳真正在屏内时给满强度；屏外仅保留斜射光路（轻微）
      float inScreen = step(0.0, uSunRaw.x) * step(uSunRaw.x, 1.0) * step(0.0, uSunRaw.y) * step(uSunRaw.y, 1.0);
      float gain = mix(0.35, 1.0, inScreen);
      vec2 dir = uSun - vUv;
      float dither = hash(vUv + vec2(0.137, 0.31));
      vec3 rays = vec3(0.0);
      for (int i = 0; i < 48; i++) {
        if (i >= samples) break;
        float u = (float(i) + dither) / 48.0;
        vec2 p = vUv + dir * u;
        // 采样越靠近太阳的像素权重越高（光路衰减的屏幕空间近似）
        float reach = (1.0 - u) * (1.0 - u);
        rays += texture2D(tDiffuse, p).rgb * reach;
      }
      rays /= 48.0;
      float lum = dot(rays, vec3(0.299, 0.587, 0.114));
      // 只放大"亮的光路"，避免整屏提亮；强度收敛防止过曝
      vec3 extra = rays * lum * strength * gain * 0.8;
      extra = min(extra, vec3(0.35));
      gl_FragColor = vec4(col + extra, 1.0);
    }
  `,
}

interface DataBar {
  equipmentId: string
  tag: string
  mesh: THREE.Mesh
  label: THREE.Sprite
  labelCtx: CanvasRenderingContext2D
  labelTex: THREE.CanvasTexture
  slot: number
}

interface Panel {
  mesh: THREE.Mesh
  ctx: CanvasRenderingContext2D
  tex: THREE.CanvasTexture
  tag: string
  label: string
  unit: string
}

function makeTextSprite(text: string, color = '#e8eef4', size = 42): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = `500 ${size}px "Segoe UI", sans-serif`
  const w = ctx.measureText(text).width + 24
  canvas.width = Math.ceil(w)
  canvas.height = size + 16
  const ctx2 = canvas.getContext('2d')!
  ctx2.font = `500 ${size}px "Segoe UI", sans-serif`
  ctx2.fillStyle = 'rgba(10,16,22,0.72)'
  ctx2.fillRect(0, 0, canvas.width, canvas.height)
  ctx2.fillStyle = color
  ctx2.textBaseline = 'middle'
  ctx2.fillText(text, 12, canvas.height / 2)
  const tex = new THREE.CanvasTexture(canvas)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }))
  sprite.scale.set(canvas.width / 40, canvas.height / 40, 1)
  sprite.renderOrder = 200
  return sprite
}

export class PlantScene {
  diagram: Diagram
  private container: HTMLElement
  private composer: EffectComposer | null = null
  private ssaoPass: SSAOPass | null = null
  private godRays: ShaderPass | null = null
  private equipmentGroups: THREE.Group[] = []
  private pipes: BuiltPipe[] = []
  private dataBars: DataBar[] = []
  private panels: Panel[] = []
  private barRoot = new THREE.Group()
  private dataSource = new MockDataSource()
  /** R4: 发光阈值不变量校验结果（空 = 通过），供快照/回归测试读取 */
  invariants: string[] = []
  private clock = new THREE.Clock()
  private rafId = 0
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private downPos = { x: 0, y: 0 }
  private flight: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number; dur: number } | null = null
  private analyzeVisible = false
  private deviceStates: Record<string, DeviceState> = {}
  private alarmIds = new Set<string>()
  private heatEnabled = false

  // 安全特效
  private leakFx: LeakEffect | null = null
  private fireFx: FireEffect | null = null
  private hazardGroup: THREE.Group | null = null
  private hazardVisible = false

  // 巡检
  private firstPerson: FirstPerson | null = null
  private patrolPoints = PATROL_POINTS.map(p => ({ ...p, pos: p.pos.clone(), checked: false }))

  // 动态警示灯（火炬塔航空灯 + 塔顶信标，红色闪烁）
  private beacons: THREE.Mesh[] = []
  // 冷却塔动态蒸汽粒子
  private steamPuffs: SteamPuff[] = []
  // 火炬塔火焰（闪烁动态）
  private flame: THREE.Mesh | null = null
  // 体积光浮尘粒子（弱机为 null）
  private dust: THREE.Points | null = null
  // 就地压力表指针枢轴（摆动动画）
  private gaugeNeedles: THREE.Object3D[] = []
  // 云层组（缓慢漂移）
  private clouds: THREE.Group | null = null
  // 背景城区地标航空灯（闪烁）
  private cityBeacons: THREE.Mesh[] = []

  // 时段系统（N1：午后/黄昏/夜景；public 供 UI 与自动化测试读取）
  readonly timeSystem: TimeOfDaySystem
  /** R9 性能统计（每 1s 采样，供性能面板/验收读取） */
  readonly perfStats = { fps: 0, calls: 0, tris: 0, textures: 0, tier: 'weak' as string }
  /** R10：帧级真实绘制统计（composer.render() 后采样、随即归零；1s 节流面板读此快照） */
  private frameCalls = 0
  private frameTris = 0
  private perfFrames = 0
  private perfLast = 0
  private qualityTier: 'weak' | 'mid' | 'strong' = 'strong'
  /** R10 管线-端口口径审计（空 = 通过；capture-frames 快照读取） */
  readonly sizeAudit: string[] = []
  /** R10 巡检碰撞体表（FirstPerson 注入 + 自动化测试读取） */
  readonly patrolColliders: Collider[] = []
  /** R10 碰撞求解器（自动化测试注入用：walk-into-wall 断言） */
  readonly collisionResolve: (pos: { x: number; z: number }, dx: number, dz: number, cs: Collider[]) => { x: number; z: number } = resolveCollision

  // 回调
  onSelect: (id: string | null) => void = () => {}
  onModeChange: (m: 'VIEW' | 'ANALYZE') => void = () => {}
  onData: (points: Record<string, number>, alarms: string[], states: Record<string, DeviceState>) => void = () => {}
  onScenario: (type: 'leak' | 'fire', deviceId: string) => void = () => {}
  onScenarioEnd: () => void = () => {}
  onPatrolLock: (locked: boolean) => void = () => {}
  onPatrolCheck: (id: string, name: string) => void = () => {}

  constructor(container: HTMLElement) {
    this.container = container
    // 调试句柄：浏览器控制台/自动化可访问场景运行时状态（迭代调参用）
    ;(window as unknown as { __ps?: PlantScene }).__ps = this
    // 调试句柄：暴露 THREE 命名空间（射线检测/自动化分析用；随 __ps 一同只在 dev 调试有意义）
    ;(window as unknown as { __THREE__?: typeof THREE }).__THREE__ = THREE
    // R4 闪烁回归校验：发光强度 vs Bloom 阈值 5.0 的不变量（见 emissionInvariants.ts）。
    // 违规时 console.error；快照工具会读取并纳入每轮验证
    this.invariants = assertEmissionInvariants()
    this.diagram = new Diagram(container, { theme: 'DARK', mode: 'VIEW' })

    const renderer = this.diagram.renderer
    // ── R9 画质分档（弱/中/强）：核数 + 内存双维度（不再只看核数） ──
    //   weak  (≤4 核 或 ≤2GB)  ：关阴影/SSAO/Bloom/GodRays/浮尘，dpr=1
    //   mid   (≤8 核 或 ≤4GB)  ：主影 2048²、无核心影、dpr≤1.5
    //   strong(>8 核)          ：主影 4096² + 核心影 2048²、dpr≤2
    const cores = navigator.hardwareConcurrency || 8
    const gpuMem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4
    const qualityTier: 'weak' | 'mid' | 'strong' =
      cores <= 4 || gpuMem <= 2 ? 'weak' : (cores <= 8 || gpuMem <= 4 ? 'mid' : 'strong')
    this.qualityTier = qualityTier
    const weak = qualityTier === 'weak'
    renderer.shadowMap.enabled = !weak
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    // R9：阴影按需更新（静态场景官方范式）——仅时段切换时 needsUpdate
    renderer.shadowMap.autoUpdate = false
    // AgX：高光滚出平滑不猝死白、饱和度保持优于 ACES（ACES 会把金属压灰）
    // 工业可视化首选；若需更强"电影感"可切回 ACESFilmicToneMapping
    renderer.toneMapping = THREE.AgXToneMapping
    // 曝光由时段系统按预设托管（N1：黄昏 1.05，午后 1.12，夜景 1.35）
    // R10 参数勘误：原 `shadowMap.blurSamples = 8`（注释"落日柔和长影"）为 VSM 专用参数，
    // PCFSoftShadowMap 下完全无效（官方 LightShadow 文档：blurSamples 仅 VSMShadowMap 读取）；
    // PCFSoft 的柔和度由固定 3x3 高斯内核决定，shadow.radius 同样被忽略 → 已删除死参数。
    // 若下轮要"更柔长影"，正道是切 VSMShadowMap + radius/blurSamples（需验收漏光）
    // R10 性能面板可信度修复：EffectComposer 一帧内多次 renderer.render()，
    // info.autoReset=true 时每次 render 后计数清零 → 面板读到的是"末位全屏 quad"的 1 次
    // 调用（实测真值 14012 calls/2411 meshes）。改为手动累计：每秒采样后归零
    renderer.info.autoReset = false
    // 像素比：高分屏（DPI>1）必须按设备像素比渲染，否则全局模糊（拉远更明显）
    // 弱机降到 1 保帧率，其余封顶 2 兼顾清晰度与性能
    renderer.setPixelRatio(weak ? 1 : Math.min(window.devicePixelRatio, 2))

    // 必须先切换透视相机：enablePerspectiveCamera() 会替换 this.camera，
    // 后处理 RenderPass 需要引用最终相机（否则拿着被替换的旧相机渲染 → 黑屏）
    ;(this.diagram as any).enablePerspectiveCamera()
    // v10 深度精度修复：near 0.1 → 0.5、far 2000 → 1500。
    // 原 near/far 比例下 200m 处深度分辨率 ~4cm，地面贴花（标线/油渍仅悬浮 1~2cm）
    // 在拉远视角时深度值交替 → z-fighting 闪烁；收紧后 ~0.7cm，配合贴花抬高 3cm 双保险
    this.diagram.camera.near = 0.5
    this.diagram.camera.far = 1500
    this.diagram.camera.updateProjectionMatrix()
    // 初始镜头：低视角面向落日（逆光），设备呈剪影轮廓，背景为晚霞，电影感更强
    this.diagram.camera.position.set(55, 48, -95)
    this.diagram.controls.target.set(0, 6, 0)
    this.diagram.controls.enableDamping = true
    this.diagram.controls.maxPolarAngle = Math.PI * 0.49
    this.diagram.controls.minDistance = 8
    this.diagram.controls.maxDistance = 320 // 放宽拉远上限，可看全周边配套厂区
    // 鼠标映射（用户偏好）：左键平移、右键旋转、滚轮缩放
    // 注：Edge 内置「鼠标手势」会劫持右键拖拽（触发前进/返回，浏览器进程级、JS 无法阻止），
    // 若在 Edge 中使用右键旋转受干扰，请在 edge://settings/mouseGesture 关闭鼠标手势
    const mb = this.diagram.controls.mouseButtons as { LEFT: number; MIDDLE: number; RIGHT: number | undefined }
    mb.LEFT = THREE.MOUSE.PAN
    mb.MIDDLE = THREE.MOUSE.DOLLY
    mb.RIGHT = THREE.MOUSE.ROTATE
    // 用户开始交互（拖拽/缩放）时中断自动漫游
    this.diagram.controls.addEventListener('start', () => { if (this.tourOn) this.stopTour() })
    this.diagram.controls.update()

    const env = buildEnvironment(
      this.diagram.scene, renderer, weak,
      qualityTier === 'weak'
        ? { shadowSize: 0, coreShadow: false }
        : { shadowSize: qualityTier === 'mid' ? 2048 : 4096, coreShadow: qualityTier !== 'mid' },
    )
    this.steamPuffs = env.steamPuffs
    this.flame = env.flame
    this.dust = env.dust
    this.clouds = env.clouds
    this.cityBeacons = env.cityBeacons
    this.beacons = buildWarningLights(this.diagram.scene)

    // ── 移除 Diagram 基座遗留灯光（v10 定位的"白色光斑"显示 bug 根源）──
    // aurea-eden Diagram 自带两个无衰减点光（decay=0/distance=0，位于地下异常坐标）
    // + 一个 AmbientLight。无衰减点光会隔空照亮场景中部的透明粒子/雾滴，
    // 在设备剪影之间形成一团持续存在的"白色光斑"（用户报告的闪烁光效 bug 实体）。
    // 本项目有完整 PBR 光照体系（直射太阳 + 补光 + rim + IBL + 半球光），全部移除
    const legacyLights: THREE.Object3D[] = []
    this.diagram.scene.traverse(o => {
      if (o instanceof THREE.PointLight || o instanceof THREE.AmbientLight) legacyLights.push(o)
    })
    legacyLights.forEach(o => o.parent?.remove(o))

    // ── 接管渲染循环：断链 Diagram 自带 animate（rAF 持有 bind 引用，需先 cancel） ──
    cancelAnimationFrame((this.diagram as any).animationFrameId)
    ;(this.diagram as any).animate = () => {}

    // ── 后处理管线：RenderPass → SSAO → Bloom → 景深 → 青橙分级 → OutputPass（ACES 输出） ──
    // 关键：EffectComposer 默认渲染目标无抗锯齿（会绕过 renderer.antialias），
    // 必须给内部 RenderTarget 开 MSAA（WebGL2 samples），否则边缘锯齿 → 画面"粗糙感"
    this.composer = new EffectComposer(renderer)
    const msaa = weak ? 0 : 4
    ;(this.composer.renderTarget1 as unknown as { samples: number }).samples = msaa
    ;(this.composer.renderTarget2 as unknown as { samples: number }).samples = msaa
    this.composer.addPass(new RenderPass(this.diagram.scene, this.diagram.camera))
    if (!weak) {
      const size = renderer.getSize(new THREE.Vector2())
      // SSAO 环境光遮蔽：低强度，只强化设备缝隙接触感，不压暗整体画面
      const ssao = new SSAOPass(this.diagram.scene, this.diagram.camera, size.x, size.y)
      ssao.kernelRadius = 6
      ssao.minDistance = 0.004
      ssao.maxDistance = 0.08
      ssao.output = SSAOPass.OUTPUT.Default
      this.composer.addPass(ssao)
      this.ssaoPass = ssao
      // Bloom 泛光 v10（HDR 光源分离）：阈值 1.1 → 5.0。
      // v9 缺陷：Preetham 天空线性亮度 2~4 全部 >1.1 → 整片天空参与泛光 →
      // 全屏灰白蒙板（劣质感主因之一）。HDR 正统做法：自发光体亮度拉到 6~9，
      // 阈值 5 只让真光源（太阳/火焰/灯具/航空灯）泛光，亮面与天空不泛光。
      // v10b：strength 0.45→0.3 / radius 0.55→0.35 —— 太阳光晕经 sky 亮度钳制
      // 后已可控，进一步收小光晕半径消除 mip 块状伪影
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.3, 0.35, 5.0))
      // 注：不使用景深（Bokeh）—— 总览视角下远景会被模糊化，导致"拉远发糊"
    }
    // R2 体积光（God Rays）：必须接在 Bloom 之后（光晕成为光路的光源），
    // 再进入分级/晕影。强机专属；弱机整段跳过
    if (!weak) {
      this.godRays = new ShaderPass(godRaysShader)
      this.composer.addPass(this.godRays)
    }
    // 青橙色彩分级：暗部偏冷青、高光偏暖橙（统一黄昏调性）
    this.composer.addPass(new ShaderPass(tealOrangeShader))
    // v11 微晕影：收拢视线至主体 + 压住四角天空高亮
    this.composer.addPass(new ShaderPass(vignetteShader))
    this.composer.addPass(new OutputPass())
    window.addEventListener('resize', this.onComposerResize)

    // ── N1 时段系统：午后/黄昏/夜景三档，托管天空/光照/雾/曝光/后期 ──
    // 预设数值一律走 timeOfDay.ts（提亮去阴冷修正见黄昏档），后期句柄在此接线
    this.timeSystem = new TimeOfDaySystem(
      env.rig,
      env.lights,
      {
        gradingUniforms: tealOrangeShader.uniforms as unknown as { shadowTint: { value: THREE.Color }, highlightTint: { value: THREE.Color }, amount: { value: number } },
        vignetteUniforms: vignetteShader.uniforms as unknown as { intensity: { value: number } },
        godRaysUniforms: this.godRays ? godRaysShader.uniforms as unknown as { strength: { value: number } } : null,
      },
      this.diagram.scene,
      renderer,
      env.cloudShadows,
    )
    this.perfStats.tier = qualityTier
    this.perfLast = performance.now()

    this.buildAllEquipments()
    this.buildAllPipes()
    this.buildDataBars()
    this.buildPanels()
    this.diagram.scene.add(this.barRoot)
    this.barRoot.visible = false

    // R10 口径一致性审计（管线 vs 设备端口）：violations 为空 = 通过；
    // 验收工具（capture-frames snapshot）读取并纳入回归
    this.sizeAudit = auditPipePortSizes(PIPES)
    if (this.sizeAudit.length) console.error('⚠ PipeSizeAudit:', this.sizeAudit)

    // R10 巡检碰撞体（设备/围堰/管廊柱 AABB 表，供 FirstPerson 滑移碰撞）
    this.patrolColliders = buildPatrolColliders()

    this.diagram.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.diagram.renderer.domElement.addEventListener('pointerup', this.onPointerUp)
    // 阻止 canvas 右键弹出浏览器菜单（非巡检时右键用于 OrbitControls 平移）
    this.diagram.renderer.domElement.addEventListener('contextmenu', this.onContextMenu)

    this.loop()
  }

  // ── 构建 ─────────────────────────────
  private buildAllEquipments() {
    for (const def of EQUIPMENTS) {
      const g = buildEquipment(def)
      this.equipmentGroups.push(g)
      this.diagram.scene.add(g)
      const topY = this.equipmentTopY(def)
      const label = makeTextSprite(def.id)
      label.position.set(def.x, topY + 3, def.z)
      this.diagram.scene.add(label)
      const lamps: THREE.Mesh[] = []
      g.traverse(o => { if (o instanceof THREE.Mesh && o.userData.isLamp) lamps.push(o) })
      // v11 修复：指示灯原共享 `lampGlass(color)` 材质 —— 任何一台设备报警/停车时
      // 会改写全厂同色灯珠的 emissive（颜色/强度串扰），报警时全厂灯一起频闪。
      // 按设备克隆一份专属材质，使每台设备的灯状态完全独立。
      if (lamps.length) {
        const own = (lamps[0].material as THREE.MeshStandardMaterial).clone()
        for (const lamp of lamps) {
          lamp.material = own
          lamp.userData.curEi = own.emissiveIntensity
        }
      }
      g.userData.lamps = lamps
      g.userData.status = 'RUN'
    }
  }

  private equipmentTopY(def: EquipmentDef): number {
    switch (def.type) {
      case 'column': return (def.params?.height ?? 16) + 5
      case 'reactor': return (def.params?.height ?? 9) + 4
      case 'sphere': return ((def.params?.radius ?? 6) * 1.9) + 2
      case 'tank': return (def.params?.height ?? 6) + 2.5
      default: return 4
    }
  }

  private buildAllPipes() {
    for (const def of PIPES) {
      const p = buildPipe(def)
      this.pipes.push(p)
      this.diagram.scene.add(p.group)
      if (p.gaugeNeedle) this.gaugeNeedles.push(p.gaugeNeedle)
    }
  }

  private buildDataBars() {
    const barGeo = new THREE.BoxGeometry(0.7, 1, 0.7)
    barGeo.translate(0, 0.5, 0)
    for (const [tag, def] of Object.entries(TAG_MAP)) {
      const equip = EQUIPMENTS.find(e => e.id === def.elementId)
      if (!equip) continue
      const mesh = new THREE.Mesh(barGeo, new THREE.MeshStandardMaterial({
        color: 0x6fcf97, metalness: 0.1, roughness: 0.4, emissive: 0x1d4d33, emissiveIntensity: 0.6,
      }))
      const topY = this.equipmentTopY(equip)
      const offsetX = (def.slot === 0 ? -0.9 : 0.9)
      mesh.position.set(equip.x + offsetX, topY + 0.5, equip.z)
      mesh.scale.y = 0.001
      this.barRoot.add(mesh)

      const canvas = document.createElement('canvas')
      canvas.width = 220; canvas.height = 64
      const ctx = canvas.getContext('2d')!
      const tex = new THREE.CanvasTexture(canvas)
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }))
      label.scale.set(5.5, 1.6, 1)
      label.renderOrder = 300
      this.barRoot.add(label)

      this.dataBars.push({ equipmentId: def.elementId, tag, mesh, label, labelCtx: ctx, labelTex: tex, slot: def.slot })
    }
  }

  private drawBarLabel(bar: DataBar, text: string, color: string) {
    const ctx = bar.labelCtx
    ctx.clearRect(0, 0, 220, 64)
    ctx.fillStyle = 'rgba(10,16,22,0.78)'
    ctx.beginPath(); ctx.roundRect(0, 0, 220, 64, 10); ctx.fill()
    ctx.fillStyle = color
    ctx.font = '500 30px "Segoe UI", sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(text, 110, 34)
    bar.labelTex.needsUpdate = true
  }

  private updateBars(points: Record<string, number>, alarms: string[]) {
    for (const bar of this.dataBars) {
      const def = TAG_MAP[bar.tag]
      const raw = points[bar.tag]
      if (raw === undefined) continue
      const nv = norm(raw, def)
      bar.mesh.scale.y = Math.max(0.5, nv / 100 * 7)
      const alarmed = alarms.includes(bar.tag)
      const c = new THREE.Color()
      if (alarmed) c.set('#e24b4a')
      else if (def.unit === '%') c.set('#6fcf97')
      else c.setHSL(0.66 - (nv / 100) * 0.66, 0.85, 0.55)
      ;(bar.mesh.material as THREE.MeshStandardMaterial).color.copy(c)
      ;(bar.mesh.material as THREE.MeshStandardMaterial).emissive.copy(c).multiplyScalar(0.35)
      const labelColor = alarmed ? '#ff8f8f' : '#dfe6ee'
      this.drawBarLabel(bar, `${raw} ${def.unit}`, labelColor)
      bar.label.position.set(bar.mesh.position.x, bar.mesh.position.y + bar.mesh.scale.y + 1.2, bar.mesh.position.z)
    }
  }

  private buildPanels() {
    const handled = new Set<string>()
    for (const [tag, def] of Object.entries(TAG_MAP)) {
      if (handled.has(def.elementId)) continue
      handled.add(def.elementId)
      const equip = EQUIPMENTS.find(e => e.id === def.elementId)
      if (!equip) continue
      const canvas = document.createElement('canvas')
      canvas.width = 256; canvas.height = 96
      const ctx = canvas.getContext('2d')!
      const tex = new THREE.CanvasTexture(canvas)
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 0.9),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
      )
      const topY = this.equipmentTopY(equip)
      const panelY = Math.max(1.5, Math.min(topY * 0.38, 4.5))
      const side = equip.type === 'sphere' ? 6.5 : 2.2
      mesh.position.set(equip.x + 0.8, panelY, equip.z + side)
      mesh.lookAt(new THREE.Vector3(equip.x + 0.8, panelY, equip.z + side + 8))
      this.diagram.scene.add(mesh)
      this.panels.push({ mesh, ctx, tex, tag, label: def.label, unit: def.unit })
    }
  }

  private updatePanels(points: Record<string, number>, alarms: string[]) {
    for (const p of this.panels) {
      const v = points[p.tag]
      if (v === undefined) continue
      const alarmed = alarms.includes(p.tag)
      const ctx = p.ctx
      ctx.clearRect(0, 0, 256, 96)
      ctx.fillStyle = alarmed ? 'rgba(130,28,28,0.94)' : 'rgba(10,16,22,0.94)'
      ctx.beginPath(); ctx.roundRect(2, 2, 252, 92, 8); ctx.fill()
      ctx.strokeStyle = alarmed ? '#ff6b6b' : '#3a4a5a'
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.roundRect(4, 4, 248, 88, 7); ctx.stroke()
      ctx.fillStyle = '#8fa3b8'
      ctx.font = '500 20px "Segoe UI", sans-serif'
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillText(p.label, 12, 10)
      ctx.fillStyle = alarmed ? '#ff8f8f' : '#6fcf97'
      ctx.font = 'bold 40px "Segoe UI", sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(`${v} ${p.unit}`, 244, 40)
      p.tex.needsUpdate = true
    }
  }

  private applyStates(points: Record<string, number>, alarms: string[], states: Record<string, DeviceState>) {
    this.deviceStates = states
    this.alarmIds = new Set(alarms.map(t => TAG_MAP[t]?.elementId).filter(Boolean) as string[])
    for (const g of this.equipmentGroups) {
      const id = g.userData.elementId as string
      if (states[id]) g.userData.status = states[id].status
    }
    for (const pipe of this.pipes) {
      const vs = states[`valve:${pipe.id}`]
      if (vs) for (const v of pipe.valves) v.setOpen(vs.valveOpen / 100)
    }
    // 动态液位：LI-* 点位驱动对应设备液位计翻柱高度（如 LI-V105 → V-105 球罐）
    for (const [tag, val] of Object.entries(points)) {
      if (!tag.startsWith('LI-')) continue
      const def = TAG_MAP[tag]
      if (!def) continue
      const g = this.equipmentGroups.find(gr => gr.userData.elementId === def.elementId)
      const gauge = g?.userData.levelGauge as THREE.Group | undefined
      const flip = gauge?.userData.flip as THREE.Mesh | undefined
      if (!flip) continue
      const ratio = Math.max(0.02, Math.min(1, (val - def.min) / (def.max - def.min)))
      flip.scale.y = ratio
    }
  }

  private applyLamps(t: number, delta: number) {
    // v11 闪烁修复核心：报警频闪不再用方波（5↔0.25 横跳 bloom 阈值 → 光晕瞬爆瞬灭），
    // 改为陡斜坡（smoothstep 0.1s 过渡）+ 帧间指数平滑；报警档 6.4 全程高于
    // bloom 阈值 5 → 光晕常驻、亮度平滑呼吸（真实警示灯 + 无频闪）。
    const ph = (Math.sin(t * 5) + 1) / 2 // 0.8Hz 周期 0..1
    const ramp = smoothstep(0.45, 0.55, ph)
    const flash = ramp > 0.5
    // 帧率无关的指数平滑系数（~0.15s 过渡）
    const k = 1 - Math.exp(-22 * delta)
    for (const g of this.equipmentGroups) {
      const lamps = g.userData.lamps as THREE.Mesh[] | undefined
      if (!lamps?.length) continue
      const id = g.userData.elementId as string
      const st = this.deviceStates[id]
      const alarm = this.alarmIds.has(id) || (this.scenarioDevice === id)
      let color: number
      let on: boolean
      if (alarm) { color = 0xe24b4a; on = flash }
      else if (st?.status === 'FAULT') { color = 0xe24b4a; on = flash }
      else if (st?.status === 'STOP') { color = 0x555b62; on = false }
      else { color = lamps[0].userData.lampBase ?? 0x37c871; on = true }
      const target = on ? (alarm || st?.status === 'FAULT' ? 6.4 : 2.2) : 0.25
      for (const lamp of lamps) {
        const m = lamp.material as THREE.MeshStandardMaterial
        m.color.set(color)
        m.emissive.set(color)
        const cur = (lamp.userData.curEi as number) ?? 2.2
        const next = cur + (target - cur) * k
        lamp.userData.curEi = next
        // 常亮态直接落位（避免 STOP→RUN 出现 0.4s 半亮残留）
        m.emissiveIntensity = target === 2.2 && !alarm ? target : next
      }
    }
  }

  // ── 模式与导览 ──────────────────────────
  setMode(m: 'VIEW' | 'ANALYZE') {
    this.analyzeVisible = m === 'ANALYZE'
    this.barRoot.visible = this.analyzeVisible
    this.onModeChange(m)
    if (this.analyzeVisible) this.flyTo([30, 45, 60], [5, 8, 10])
  }

  /** N1 时段切换：afternoon 午后 / dusk 黄昏 / night 夜景（0.8s 平滑过渡） */
  setTimeOfDay(name: PresetName) {
    this.timeSystem.setPreset(name)
  }

  get timeOfDay(): PresetName {
    return this.timeSystem.presetName
  }

  flyTo(pos: [number, number, number], target: [number, number, number]) {
    this.flight = {
      from: this.diagram.camera.position.clone(),
      to: new THREE.Vector3(...pos),
      tFrom: this.diagram.controls.target.clone(),
      tTo: new THREE.Vector3(...target),
      t: 0, dur: 1.6,
    }
  }

  // ── 自动漫游（沿导览机位循环巡航，用户拖拽即中断） ──
  private tourOn = false
  private tourIdx = 0
  private tourDwell = 0
  /** 漫游被中断回调（用户交互/手动停止），供 UI 同步按钮状态 */
  onTourStop: () => void = () => {}

  startTour() {
    if (this.firstPerson?.isActive) return
    this.tourOn = true
    this.tourIdx = 0
    this.tourDwell = 0
    this.tourFly()
  }

  stopTour(notify = true) {
    if (!this.tourOn) return
    this.tourOn = false
    if (notify) this.onTourStop()
  }

  private tourFly() {
    const t = CAMERA_TOURS[this.tourIdx]
    this.flyTo(t.pos as [number, number, number], t.target as [number, number, number])
  }

  focusPipe(pipeId: string) {
    const def = PIPES.find(p => p.id === pipeId)
    if (!def) return
    const mid = pipeMidpoint(def)
    this.flyTo([mid.x + 14, mid.y + 8, mid.z + 14], [mid.x, mid.y, mid.z])
    setPipeHighlight(this.pipes, PORTS[def.from]?.elementId ?? null)
  }

  /** 聚焦任意目标（设备或管线），SOP/搜索共用 */
  focusTarget(target: string) {
    if (target.startsWith('pipe-')) { this.focusPipe(target); return }
    const e = EQUIPMENTS.find(e => e.id === target)
    if (!e) return
    this.flyTo([e.x + 18, 12, e.z + 18], [e.x, 4, e.z])
    setPipeHighlight(this.pipes, e.id)
    this.onSelect(e.id)
  }

  /** 热力图开关 */
  setHeatEnabled(on: boolean) {
    this.heatEnabled = on
    if (on) {
      for (const pipe of this.pipes) setPipeHeat(this.pipes, Object.fromEntries(this.pipes.map(p => [p.id, this.heatOf(p)])))
    } else {
      resetPipeHeat(this.pipes)
    }
  }

  /** 管线热度估计（按介质色系近似，红线热、蓝线冷） */
  private heatOf(pipe: BuiltPipe): number {
    const c = new THREE.Color(PIPE_COLORS[pipe.def.color])
    return Math.max(0, Math.min(1, (c.r - c.b) * 0.8 + 0.35))
  }

  // ── 安全特效与演练 ──────────────────────
  private scenario: 'leak' | 'fire' | null = null
  private scenarioDevice: string | null = null

  triggerScenario(type: 'leak' | 'fire', deviceId = 'R-101') {
    this.stopScenario()
    const equip = EQUIPMENTS.find(e => e.id === deviceId)
    if (!equip) return
    const origin = new THREE.Vector3(equip.x + 1.5, this.equipmentTopY(equip) * 0.55, equip.z + 1.5)
    if (type === 'leak') {
      this.leakFx = new LeakEffect(origin, 300)
      this.diagram.scene.add(this.leakFx.points)
    } else {
      this.fireFx = new FireEffect(origin, 1.5)
      this.diagram.scene.add(this.fireFx.group)
    }
    this.scenario = type
    this.scenarioDevice = deviceId
    this.onScenario(type, deviceId)
  }

  stopScenario() {
    if (this.leakFx) { this.diagram.scene.remove(this.leakFx.points); this.leakFx = null }
    if (this.fireFx) { this.diagram.scene.remove(this.fireFx.group); this.fireFx = null }
    if (this.scenario) { this.scenario = null; this.scenarioDevice = null; this.onScenarioEnd() }
  }

  get scenarioActive() { return this.scenario !== null }

  /** 危险区域色块开关 */
  setHazardZonesVisible(v: boolean) {
    if (v && !this.hazardGroup) {
      this.hazardGroup = buildHazardZones()
      this.diagram.scene.add(this.hazardGroup)
    }
    if (this.hazardGroup) this.hazardGroup.visible = v
    this.hazardVisible = v
  }

  // 巡检时被接管/恢复的 OrbitControls.update（Diagram 内部动画循环每帧调用它）
  private savedControlsUpdate: (() => void) | null = null

  // ── 第一人称巡检 ────────────────────────
  setFirstPerson(on: boolean) {
    if (on && !this.firstPerson) {
      // 1) 接管 OrbitControls.update：Diagram 内部有独立动画循环每帧调用 controls.update()，
      //    OrbitControls.update() 会执行 lookAt(target)，把 PointerLock 旋转的相机朝向拉回。
      //    因此巡检期间把 update 替换为空函数，退出时恢复。
      const c = this.diagram.controls as unknown as { update: () => void }
      this.savedControlsUpdate = c.update.bind(c)
      c.update = () => {}
      this.diagram.controls.enabled = false

      this.firstPerson = new FirstPerson(this.diagram.camera, this.diagram.renderer.domElement)
      this.firstPerson.setColliders(this.patrolColliders)
      this.firstPerson.onLockChange = locked => {
        if (!locked) {
          // E 键 / Esc 退出：dispose 移除 PointerLockControls 监听（防残留意外锁定）+ 恢复自由视角
          this.firstPerson?.dispose()
          this.firstPerson = null
          this.restoreControls()
          this.onPatrolLock(false)
        } else {
          this.onPatrolLock(true)
        }
      }
      this.firstPerson.onMove = pos => {
        for (const pt of this.patrolPoints) {
          if (!pt.checked && pos.distanceTo(pt.pos) < pt.radius) {
            pt.checked = true
            this.onPatrolCheck(pt.id, pt.name)
          }
        }
      }
      this.firstPerson.enter()
    } else if (!on && this.firstPerson) {
      // dispose 会移除 PointerLockControls 的 click 监听，避免退出后残留导致意外锁定
      this.firstPerson.dispose()
      this.firstPerson = null
      this.restoreControls()
      this.onPatrolLock(false)
    }
  }

  /** 恢复 OrbitControls 正常行为 */
  private restoreControls() {
    if (this.savedControlsUpdate && this.diagram.controls) {
      ;(this.diagram.controls as unknown as { update: () => void }).update = this.savedControlsUpdate
      this.savedControlsUpdate = null
    }
    this.diagram.controls.enabled = true
  }

  resetPatrol() {
    for (const p of this.patrolPoints) p.checked = false
  }

  // ── SOP 操作联动 ────────────────────────
  /** 执行操作：设备启停 / 管线阀门开闭 + 视觉联动 */
  operate(target: string, action: string) {
    this.focusTarget(target)
    if (action === 'start' || action === 'stop') {
      const g = this.equipmentGroups.find(g => g.userData.elementId === target)
      if (g) g.userData.status = action === 'start' ? 'RUN' : 'STOP'
    } else if (action === 'open' || action === 'close') {
      const pipe = this.pipes.find(p => p.id === target)
      if (pipe) for (const v of pipe.valves) v.setOpen(action === 'open' ? 1 : 0)
    }
  }

  // ── 拾取 ──────────────────────────
  private onPointerDown = (e: PointerEvent) => {
    this.downPos = { x: e.clientX, y: e.clientY }
  }

  /** 阻止右键默认行为（浏览器菜单），让右键用于场景平移 */
  private onContextMenu = (e: Event) => {
    e.preventDefault()
  }

  private onPointerUp = (e: PointerEvent) => {
    // 第一人称模式下不响应拾取
    if (this.firstPerson?.isActive) return
    const dx = Math.abs(e.clientX - this.downPos.x), dy = Math.abs(e.clientY - this.downPos.y)
    if (dx > 5 || dy > 5) return
    const rect = this.container.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.diagram.camera)
    const hits = this.raycaster.intersectObjects(this.equipmentGroups, true)
    if (hits.length) {
      let obj: THREE.Object3D | null = hits[0].object
      while (obj && !obj.userData.elementId) obj = obj.parent
      const id = obj?.userData.elementId ?? null
      this.onSelect(id)
      setPipeHighlight(this.pipes, id)
    } else {
      this.onSelect(null)
      setPipeHighlight(this.pipes, null)
    }
  }

  // ── 动画循环 ──────────────────────────
  private loop = () => {
    this.rafId = requestAnimationFrame(this.loop)
    const delta = this.clock.getDelta()
    const t = this.clock.elapsedTime

    // N1 时段系统：每帧推进过渡插值（无过渡时近乎零开销）
    this.timeSystem.update(t)

    // R9 性能采样（1s 节流）；R10：面板值改读"上一帧"真实累计快照
    // （composer 一帧内多次 renderer.render()，autoReset=true 时 info 只反映末位全屏 quad
    //  → 旧面板恒显示 calls=1；实测真值 14012 calls / 1.65M tris）
    this.perfFrames++
    const nowMs = performance.now()
    if (nowMs - this.perfLast >= 1000) {
      this.perfStats.fps = Math.round(this.perfFrames * 1000 / (nowMs - this.perfLast))
      this.perfStats.calls = this.frameCalls
      this.perfStats.tris = this.frameTris
      this.perfStats.textures = this.diagram.renderer.info.memory.textures
      this.perfFrames = 0
      this.perfLast = nowMs
    }

    animatePipes(this.pipes, t)

    for (const g of this.equipmentGroups) {
      const status = g.userData.status ?? 'RUN'
      const speed = status === 'RUN' ? 0.3 : 0
      const fan = g.userData.fan as THREE.Mesh | undefined
      if (fan) fan.rotation.x += speed
      const stirrer = g.userData.stirrer as THREE.Mesh | undefined
      if (stirrer) stirrer.rotation.y += status === 'RUN' ? 0.05 : 0
    }

    this.applyLamps(t, delta)

    // 警示灯闪烁（红色航空障碍灯/信标）v11：v10 的 4.0~8.5 横跳 bloom 阈值 5 →
    // 光晕忽大忽小 = 用户报告的"局部持续闪烁"。改为 6.1~8.2 全程高于阈值：
    // 光晕常驻、亮度平滑呼吸，且呼吸幅度收敛
    for (let i = 0; i < this.beacons.length; i++) {
      const m = this.beacons[i].material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 6.1 + 2.1 * Math.max(0, Math.sin(t * 1.5 + i * 2.1))
    }

    // 冷却塔蒸汽（上升/膨胀/淡出循环）
    animateSteam(this.steamPuffs, t)

    // 火炬火焰闪烁（亮度抖动 + 火苗摇曳）
    if (this.flame) animateFlare(this.flame, t)

    // 体积光浮尘漂移（弱机为 null 自动跳过）
    if (this.dust) animateDust(this.dust, t)

    // 就地压力表指针摆动（模拟压力波动）
    animateGauges(this.gaugeNeedles, t)

    // 云层缓慢漂移 + 背景城区地标航空灯闪烁
    if (this.clouds) animateClouds(this.clouds, t)
    animateCityBeacons(this.cityBeacons, t)

    // 安全特效
    if (this.leakFx) this.leakFx.update(delta)
    if (this.fireFx) this.fireFx.update(delta, t)

    // 第一人称
    this.firstPerson?.update(delta)

    if (this.flight) {
      const f = this.flight
      f.t += delta * 1.2
      const u = Math.min(1, f.t / f.dur)
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
      this.diagram.camera.position.lerpVectors(f.from, f.to, e)
      this.diagram.controls.target.lerpVectors(f.tFrom, f.tTo, e)
      if (u >= 1) this.flight = null
    } else if (this.tourOn) {
      // 漫游：抵达机位后停留 2.2s，再飞往下一机位（循环）
      this.tourDwell += delta
      if (this.tourDwell >= 2.2) {
        this.tourDwell = 0
        this.tourIdx = (this.tourIdx + 1) % CAMERA_TOURS.length
        this.tourFly()
      }
    }

    // 巡检激活时跳过 OrbitControls 更新（PointerLock 负责旋转，避免被拉回）
    if (!this.firstPerson?.isActive) this.diagram.controls.update()

    // R2 体积光：每帧重算太阳屏幕坐标（相机移动/时段切换时方向随之变化）
    if (this.godRays) {
      const u = this.godRays.uniforms as unknown as {
        uSunRaw: { value: THREE.Vector2 }, uSun: { value: THREE.Vector2 },
      }
      // 太阳方向转到相机空间（z>0 = 在相机前方）；N1 起取时段系统实时方向
      const sunDir = this.timeSystem.sunDirection
      const dirCam = sunDir.clone().transformDirection(this.diagram.camera.matrixWorldInverse)
      const az = new THREE.Vector2(dirCam.x, dirCam.y)
      const azLen = az.length()
      if (dirCam.z > 0 && azLen > 1e-5) {
        // 太阳在屏内：真实投影位置（NDC → 归一化屏幕坐标）
        const ndc = sunDir.clone().multiplyScalar(600).project(this.diagram.camera)
        u.uSunRaw.value.set(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5)
        u.uSun.value.copy(u.uSunRaw.value)
      } else if (azLen > 1e-5) {
        // 太阳在屏后（默认逆光构图）：按方位角推到对应屏边 → "屏外太阳斜射"光型
        az.normalize()
        const k = 0.5 / Math.max(Math.abs(az.x), Math.abs(az.y))
        u.uSunRaw.value.set(2, 2) // 屏外标记
        u.uSun.value.set(0.5 + az.x * k, 0.5 + az.y * k)
      }
    }

    // 渲染（接管后由后处理管线输出）
    this.composer?.render()

    // R10：帧级真实绘制统计 —— composer.render() 结束后 info 内是本帧全部
    // pass（RenderPass/SSAO/Bloom/GodRays/分级/晕影/Output）的累计值，
    // 采样进快照后立即归零（autoReset=false 范式）
    const info = this.diagram.renderer.info
    this.frameCalls = info.render.calls
    this.frameTris = info.render.triangles
    info.reset()
  }

  /** 窗口缩放同步后处理尺寸 */
  private onComposerResize = () => {
    if (!this.composer) return
    const size = this.diagram.renderer.getSize(new THREE.Vector2())
    this.composer.setSize(size.x, size.y)
    this.ssaoPass?.setSize(size.x, size.y)
  }

  start() {
    this.dataSource.onTick((points, alarms, states) => {
      this.updateBars(points, alarms)
      this.updatePanels(points, alarms)
      this.applyStates(points, alarms, states)
      this.onData(points, alarms, states)
    })
    this.dataSource.start()
    const init: Record<string, number> = {}
    for (const [tag, d] of Object.entries(TAG_MAP)) init[tag] = d.steady
    this.updateBars(init, [])
    this.updatePanels(init, [])
  }

  /** 历史帧（回放/趋势图数据源） */
  getHistory() { return this.dataSource.getHistory() }

  startPlayback(onTick: TickCallback) {
    return this.dataSource.startPlayback(onTick)
  }

  stopPlayback() { this.dataSource.stopPlayback() }

  /** 恢复实时数据（停止回放） */
  resumeRealtime() {
    this.dataSource.stopPlayback()
    this.dataSource.start()
  }

  dispose() {
    cancelAnimationFrame(this.rafId)
    window.removeEventListener('resize', this.onComposerResize)
    this.stopScenario()
    this.firstPerson?.dispose()
    this.firstPerson = null
    this.restoreControls()
    this.dataSource.stop()
    this.dataSource.stopPlayback()
    this.diagram.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.diagram.renderer.domElement.removeEventListener('pointerup', this.onPointerUp)
    this.diagram.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu)
    this.composer?.dispose()
    this.timeSystem.dispose()
    this.diagram.dispose()
  }
}
