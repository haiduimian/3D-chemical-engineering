import * as THREE from 'three'
import { Diagram } from 'aurea-eden/lib/diagrams/Diagram.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { EQUIPMENTS, PIPES, type EquipmentDef } from '../layout/plantLayout'
import { PORTS } from '../layout/ports'
import { buildEquipment } from '../shapes/plantShapes'
import { buildPipe, animatePipes, animateGauges, setPipeHighlight, setPipeHeat, resetPipeHeat, type BuiltPipe } from '../connectors/pipes'
import { pipeMidpoint } from '../connectors/path'
import { buildEnvironment, buildWarningLights, animateSteam, animateFlare, animateDust, animateClouds, animateCityBeacons, type SteamPuff } from '../env/environment'
import { MockDataSource, TAG_MAP, norm, type TickCallback, type DeviceState } from '../data/processData'
import { LeakEffect, FireEffect, buildHazardZones } from '../effects/safety'
import { FirstPerson, PATROL_POINTS } from '../navigation/firstPerson'
import { PIPE_COLORS } from '../materials/pbr'

/**
 * PlantScene —— 3D 化工厂场景编排 v6（黄昏工业风质感）
 * 集成：设备精细建模 / 端口化管线 + 流向 / 阀门泵状态 / 仪表盘 /
 *       安全特效（泄漏·火焰·危险区）/ 第一人称巡检 / SOP 培训联动 / 热力图 / 渲染预算
 * 渲染：接管 Diagram 自带渲染循环，走 EffectComposer（SSAO + Bloom + 青橙分级 + ACES 输出）
 */

/** 青橙色彩分级（teal & orange）：暗部偏冷青、高光偏暖橙，统一画面调性 */
const tealOrangeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    shadowTint: { value: new THREE.Color(0x2a4a5e) },
    highlightTint: { value: new THREE.Color(0xffb066) },
    amount: { value: 0.28 },
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
      vec3 graded = c.rgb;
      graded = mix(graded, c.rgb * shadowTint * 2.2, shadowW * amount);
      graded = mix(graded, c.rgb * highlightTint * 1.35, highW * amount * 0.8);
      gl_FragColor = vec4(graded, c.a);
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
  private equipmentGroups: THREE.Group[] = []
  private pipes: BuiltPipe[] = []
  private dataBars: DataBar[] = []
  private panels: Panel[] = []
  private barRoot = new THREE.Group()
  private dataSource = new MockDataSource()
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
    this.diagram = new Diagram(container, { theme: 'DARK', mode: 'VIEW' })

    const renderer = this.diagram.renderer
    // 渲染预算：弱机自动降级
    const weak = navigator.hardwareConcurrency ? navigator.hardwareConcurrency <= 4 : false
    renderer.shadowMap.enabled = !weak
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15 // 黄昏整体偏暗，略提曝光避免发闷
    ;(renderer.shadowMap as any).blurSamples = 8 // 落日柔和长影
    // 像素比：高分屏（DPI>1）必须按设备像素比渲染，否则全局模糊（拉远更明显）
    // 弱机降到 1 保帧率，其余封顶 2 兼顾清晰度与性能
    renderer.setPixelRatio(weak ? 1 : Math.min(window.devicePixelRatio, 2))

    // 必须先切换透视相机：enablePerspectiveCamera() 会替换 this.camera，
    // 后处理 RenderPass 需要引用最终相机（否则拿着被替换的旧相机渲染 → 黑屏）
    ;(this.diagram as any).enablePerspectiveCamera()
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

    const env = buildEnvironment(this.diagram.scene, renderer, weak)
    this.steamPuffs = env.steamPuffs
    this.flame = env.flame
    this.dust = env.dust
    this.clouds = env.clouds
    this.cityBeacons = env.cityBeacons
    this.beacons = buildWarningLights(this.diagram.scene)

    this.diagram.scene.traverse(o => {
      if (o instanceof THREE.PointLight && o.distance === 0) o.intensity *= 0.08
      else if (o instanceof THREE.AmbientLight) o.intensity = 0.12
    })

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
      // Bloom 泛光：落日高光 + 自发光元件柔和发光（阈值略降强化夕阳）
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.55, 0.72))
      // 注：不使用景深（Bokeh）—— 总览视角下远景会被模糊化，导致"拉远发糊"
    }
    // 青橙色彩分级：暗部偏冷青、高光偏暖橙（统一黄昏调性）
    this.composer.addPass(new ShaderPass(tealOrangeShader))
    this.composer.addPass(new OutputPass())
    window.addEventListener('resize', this.onComposerResize)

    this.buildAllEquipments()
    this.buildAllPipes()
    this.buildDataBars()
    this.buildPanels()
    this.diagram.scene.add(this.barRoot)
    this.barRoot.visible = false

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

  private applyLamps(t: number) {
    const flash = Math.sin(t * 5) > 0
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
      for (const lamp of lamps) {
        const m = lamp.material as THREE.MeshStandardMaterial
        m.color.set(color)
        m.emissive.set(color)
        m.emissiveIntensity = on ? 1.8 : 0.15
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

    animatePipes(this.pipes, t)

    for (const g of this.equipmentGroups) {
      const status = g.userData.status ?? 'RUN'
      const speed = status === 'RUN' ? 0.3 : 0
      const fan = g.userData.fan as THREE.Mesh | undefined
      if (fan) fan.rotation.x += speed
      const stirrer = g.userData.stirrer as THREE.Mesh | undefined
      if (stirrer) stirrer.rotation.y += status === 'RUN' ? 0.05 : 0
    }

    this.applyLamps(t)

    // 警示灯闪烁（红色航空障碍灯/信标，正弦呼吸 + 相位错开）
    for (let i = 0; i < this.beacons.length; i++) {
      const m = this.beacons[i].material as THREE.MeshStandardMaterial
      m.emissiveIntensity = 1.2 + 2.2 * Math.max(0, Math.sin(t * 2.4 + i * 1.7))
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

    // 渲染（接管后由后处理管线输出）
    this.composer?.render()
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
    this.diagram.dispose()
  }
}
