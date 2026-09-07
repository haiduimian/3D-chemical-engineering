import * as THREE from 'three'
import { pipeMaterial, PIPE_COLORS, structuralSteel, machinedSteel, concrete, stainless, insulation, traceTube } from '../materials/pbr'
import type { PipeDef } from '../layout/plantLayout'
import { PORTS, portWorldPos, autoDiameter } from '../layout/ports'
import { resolvePipePath, roundedPolyline } from './path'
import { buildValve, type BuiltValve } from '../shapes/valves'

/**
 * 工艺管线构建器 v5（R10）
 * - 路径：端口引用 → L 形分层折线 → roundedPolyline 圆角弯头（工程 R≈3D）→ 管体
 * - 口径一致性：管线有效直径 = 显式 diameter ?? autoDiameter(端口口径较大值)；
 *   端口交界处：法兰盘（口径×1.85 扁圆柱）+ 端口短管 + 大小头（异径管）锥台
 * - 流向：锥形箭头沿切线（flow<0 反向）+ 发光脉冲
 * - 阀门：起点/终点/泵出入口自动放置；低架管线加管托支撑；管廊层管线加管廊托架
 * - 伴热：高温/易凝管线叠加蒸汽伴热细管（工艺真实感）
 */

/** R10：管线有效口径（缺省由端口口径推导 —— "粗细适应设备口径"） */
export function effectiveDiameter(def: PipeDef): number {
  return def.diameter ?? autoDiameter(def.from, def.to, def.via ?? [])
}

/** 需要蒸汽伴热的管线（高温物料/易凝介质） */
const TRACED_PIPES = new Set(['pipe-r-t101', 'pipe-acid-recycle', 'pipe-pre-r'])

/** 蒸汽伴热管：沿主管线平行敷设的细亮不锈钢管（偏移主管半径外侧） */
function addTracingPipe(group: THREE.Group, curve: THREE.CatmullRomCurve3, def: PipeDef) {
  if (!TRACED_PIPES.has(def.id)) return
  // 伴热管路径：主管曲线各点向外侧偏移（水平段偏 +z 侧，竖直段偏 +x 侧）
  const pts: THREE.Vector3[] = []
  const d = effectiveDiameter(def)
  const offset = d + 0.09
  const N = 60
  for (let i = 0; i <= N; i++) {
    const u = i / N
    const p = curve.getPointAt(u)
    const tan = curve.getTangentAt(u)
    // 取与切线垂直且尽量水平的方向作为偏移方向
    const side = new THREE.Vector3(-tan.z, 0, tan.x)
    if (side.lengthSq() < 0.01) side.set(1, 0, 0) // 竖直段
    side.normalize()
    pts.push(p.clone().addScaledVector(side, offset).add(new THREE.Vector3(0, -d * 0.5, 0)))
  }
  const traceCurve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0)
  // R7：材质 stainless() → traceTube()（哑光铝皮，消除特定角度整条镜面白带）
  const trace = new THREE.Mesh(
    new THREE.TubeGeometry(traceCurve, 160, 0.05, 8, false),
    traceTube(),
  )
  group.add(trace)
  // 伴热管两端保温铝皮封头（端部收口，工艺真实感）
  for (const u of [0, 1]) {
    const p = traceCurve.getPointAt(u)
    const tan = traceCurve.getTangentAt(u)
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 10), insulation())
    cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan)
    cap.position.copy(p)
    group.add(cap)
  }
  // 伴热管绑扎带（每隔一段用细卡箍固定在主管上）
  const bandMat = structuralSteel()
  const bands = Math.max(2, Math.floor(curve.getLength() / 6))
  for (let i = 0; i < bands; i++) {
    const u = (i + 0.5) / bands
    const p = curve.getPointAt(u)
    const band = new THREE.Mesh(new THREE.TorusGeometry(def.diameter + 0.06, 0.018, 6, 16), bandMat)
    band.position.copy(p)
    const tan = curve.getTangentAt(u)
    band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan)
    group.add(band)
  }
}

/** 就地压力表（共享几何体/材质）：导管 + 表壳 + 白表盘，装在长管线水平段顶部 */
const gaugeRimMat = machinedSteel()
const gaugeFaceMat = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.5 })
const gaugeBodyGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.07, 16)
const gaugeFaceGeo = new THREE.CircleGeometry(0.145, 16)
const gaugeStemGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.3, 6)
// 指针（细针，几何平移使枢轴在针尾，绕局部 Z 摆动）
const gaugeNeedleGeo = new THREE.BoxGeometry(0.012, 0.11, 0.008)
gaugeNeedleGeo.translate(0, 0.05, 0)
const gaugeNeedleMat = new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.5 })

/** 就地压力表：导管 + 表壳 + 白表盘 + 指针；返回指针枢轴供摆动动画（无仪表返回 null） */
function addLocalInstruments(group: THREE.Group, curve: THREE.CatmullRomCurve3, def: PipeDef): THREE.Object3D | null {
  // 仅长管线（≥18m）放置，控制总量
  if (curve.getLength() < 18) return null
  const d = effectiveDiameter(def)
  const pos = curve.getPointAt(0.5)
  const tan = curve.getTangentAt(0.5)
  if (Math.abs(tan.y) > 0.3) return null // 仅水平段
  const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize()
  const base = pos.clone().add(new THREE.Vector3(0, d, 0))
  // 仪表导管（自管顶引出）
  const stem = new THREE.Mesh(gaugeStemGeo, gaugeRimMat)
  stem.position.copy(base).add(new THREE.Vector3(0, 0.15, 0))
  group.add(stem)
  // 表壳（圆盘，轴向朝侧向）
  const body = new THREE.Mesh(gaugeBodyGeo, gaugeRimMat)
  body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), side)
  body.position.copy(base).add(new THREE.Vector3(0, 0.34, 0))
  group.add(body)
  // 白表盘（朝外侧，巡检可视）
  const face = new THREE.Mesh(gaugeFaceGeo, gaugeFaceMat)
  face.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), side)
  face.position.copy(body.position).addScaledVector(side, 0.04)
  group.add(face)
  // 指针枢轴（贴表盘前方，绕局部 Z 摆动）
  const pivot = new THREE.Object3D()
  pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), side)
  pivot.position.copy(body.position).addScaledVector(side, 0.05)
  const needle = new THREE.Mesh(gaugeNeedleGeo, gaugeNeedleMat)
  pivot.add(needle)
  group.add(pivot)
  return pivot
}

/** 驱动压力表指针摆动（渲染循环调用）：围绕工作点小幅抖动，模拟压力波动 */
export function animateGauges(needles: THREE.Object3D[], t: number) {
  for (let i = 0; i < needles.length; i++) {
    // 基准角 ~ 指向 2/3 量程 + 每表相位错开 + 低频抖动
    needles[i].rotation.z = -0.6 + Math.sin(t * 1.3 + i * 2.1) * 0.16 + Math.sin(t * 5.7 + i) * 0.03
  }
}

function roundedCornerPath(pts: THREE.Vector3[]) {
  return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0)
}

export interface BuiltPipe {
  id: string
  def: PipeDef
  group: THREE.Group
  pulses: THREE.Mesh[]
  length: number
  curve: THREE.CatmullRomCurve3
  arrows: THREE.Mesh[]
  valves: BuiltValve[]
  /** 就地压力表指针枢轴（无仪表为 null） */
  gaugeNeedle: THREE.Object3D | null
  /** 高亮时恢复的原始材质状态 */
  tubeMat: THREE.MeshStandardMaterial
}

/** 阀件放置点：起点外延点 / 终点前 / 泵入口 / 泵出口 */
function collectValvePositions(def: PipeDef, pts: THREE.Vector3[]): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  const push = (p: THREE.Vector3) => {
    if (!out.some(o => o.distanceTo(p) < 2)) out.push(p.clone())
  }
  if (pts.length >= 2) push(pts[1])
  for (const v of def.via ?? []) {
    if (v.pump) {
      const base = v.pump.replace('P-', 'P')
      push(portWorldPos(`${base}-IN`))
      push(portWorldPos(`${base}-OUT`))
    }
  }
  if (pts.length >= 2) push(pts[pts.length - 2])
  return out
}

/** 端口端部衔接（R10 增强）：法兰盘 + 端口直径短管 + 大小头（异径管）锥台。
 *  法兰盘直径 = 端口口径 ×1.85（扁圆柱）贴设备管口 —— "管线与设备交界"的视觉锚点；
 *  泵出入口由泵模型自带法兰，仅补法兰盘不画短管/锥台（避免穿泵体） */
function addPortTransition(group: THREE.Group, portId: string, def: PipeDef, tubeMat: THREE.MeshStandardMaterial) {
  const port = PORTS[portId]
  if (!port) return
  const pumpish = port.kind === 'pumpIn' || port.kind === 'pumpOut'
  const pw = portWorldPos(portId)
  const dir = new THREE.Vector3(...port.dir).normalize()
  const d = effectiveDiameter(def)
  // 法兰盘（碳钢机加工面，所有端口统一补——泵口也补平垫环，机器视觉统一）
  const flange = new THREE.Mesh(
    new THREE.CylinderGeometry(port.diameter * 1.85, port.diameter * 1.85, pumpish ? 0.06 : 0.09, 16),
    machinedSteel(),
  )
  flange.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  flange.position.copy(pw).addScaledVector(dir, pumpish ? 0.03 : 0.06)
  group.add(flange)
  if (pumpish) return
  const shortLen = 0.5
  // 端口直径短管（与设备接管对接）
  const short = new THREE.Mesh(new THREE.CylinderGeometry(port.diameter, port.diameter, shortLen, 14), tubeMat)
  short.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  short.position.copy(pw).addScaledVector(dir, shortLen / 2 + 0.09)
  group.add(short)
  // 大小头：端口直径 → 管线直径（锥台，长 0.9，工程异径管）
  if (Math.abs(port.diameter - d) > 0.02) {
    const redLen = 0.9
    const reducer = new THREE.Mesh(
      new THREE.CylinderGeometry(d, port.diameter, redLen, 14),
      tubeMat,
    )
    reducer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    reducer.position.copy(pw).addScaledVector(dir, shortLen + 0.09 + redLen / 2)
    group.add(reducer)
  }
}

/** 管廊横梁层（environment.ts mkRack 同步）：R10 管廊托架匹配用 */
const RACK_LAYERS = [
  { z: -6, topY: 7.6, spanX: [-60, 30] as [number, number] },
  { z: 28, topY: 7.6, spanX: [15, 45] as [number, number] },
]

/** 管托支撑（低架 viaY ≤ 4.5：混凝土墩立柱；管廊层 5.6~7.6 且水平段在管廊 z 上：管廊托架） */
function addPipeSupports(group: THREE.Group, curve: THREE.CatmullRomCurve3, def: PipeDef) {
  const viaY = def.viaY ?? 6
  const total = curve.getLength()
  const isRack = viaY > 4.5 && viaY <= 7.6
  if (!isRack && viaY > 4.5) return
  const count = Math.max(1, Math.floor(total / (isRack ? 8 : 12)))
  for (let i = 0; i < count; i++) {
    const u = (i + 0.5) / count
    const pos = curve.getPointAt(u)
    if (Math.abs(pos.y - viaY) > 0.9) continue // 仅水平段
    if (isRack) {
      // 管廊托架：仅当水平段位于某道管廊 z±1.6 内，且管线在梁顶上方可达
      const rack = RACK_LAYERS.find(r => Math.abs(r.z - pos.z) <= 1.6 && pos.x >= r.spanX[0] && pos.x <= r.spanX[1])
      if (!rack) continue
      const sup = new THREE.Group()
      const d = effectiveDiameter(def)
      // 短支柱：梁顶 7.6 → 管线底部
      const postH = Math.max(0.3, pos.y - d - rack.topY)
      if (postH > 0.3) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, postH, 8), structuralSteel())
        post.position.y = rack.topY + postH / 2
        sup.add(post)
        // 顶部鞍座
        const saddle = new THREE.Mesh(
          new THREE.TorusGeometry(d * 1.15, d * 0.32, 6, 12),
          structuralSteel(),
        )
        saddle.rotation.x = Math.PI / 2
        saddle.position.y = pos.y - d * 0.4
        sup.add(saddle)
      }
      sup.position.set(pos.x, 0, pos.z)
      group.add(sup)
    } else {
      const sup = new THREE.Group()
      const d = effectiveDiameter(def)
      // 立柱（地面到管线底部）
      const postH = Math.max(0.4, pos.y - 0.08)
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, postH, 8), structuralSteel())
      post.position.y = pos.y - 0.08 - postH / 2
      sup.add(post)
      // 混凝土墩
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.4), concrete())
      base.position.y = 0.07
      sup.add(base)
      // 顶部鞍座
      const saddle = new THREE.Mesh(
        new THREE.TorusGeometry(d * 1.15, d * 0.32, 6, 12),
        structuralSteel(),
      )
      saddle.rotation.x = Math.PI / 2
      saddle.position.y = pos.y - d * 0.4
      sup.add(saddle)
      sup.position.set(pos.x, 0, pos.z)
      group.add(sup)
    }
  }
}

export function buildPipe(def: PipeDef): BuiltPipe {
  const color = PIPE_COLORS[def.color]
  const d = effectiveDiameter(def) // R10：管线粗细随设备口径
  const pts = resolvePipePath(def)
  const curve = roundedCornerPath(roundedPolyline(pts, 1.2))

  // 管体：每条管线独立材质（支持发光/透明联动，不污染共享材质）
  const tubeMat = (pipeMaterial(color) as THREE.MeshStandardMaterial).clone()
  tubeMat.emissive = new THREE.Color(color)
  tubeMat.emissiveIntensity = 0.12

  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 200, d, 12, false), tubeMat)
  tube.castShadow = true
  const group = new THREE.Group()
  group.add(tube)

  // 端部衔接（短管 + 大小头）
  addPortTransition(group, def.from, def, tubeMat)
  addPortTransition(group, def.to, def, tubeMat)

  // 管托支撑（低架段）
  addPipeSupports(group, curve, def)

  // 蒸汽伴热管（高温/易凝管线）
  addTracingPipe(group, curve, def)

  // 就地压力表（长管线水平段，巡检可视）
  const gaugeNeedle = addLocalInstruments(group, curve, def)

  // 流向箭头（锥体 + 切线方向）
  // R4 去卡通化：MeshBasicMaterial → MeshStandardMaterial（低自发光，
  // 受光照着色；emissiveIntensity 0.35 << bloom 阈值 5.0，无光晕无闪烁）
  const arrows: THREE.Mesh[] = []
  const arrowMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.25),
    emissive: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35),
    emissiveIntensity: 0.35,
    roughness: 0.5, metalness: 0.2,
  })
  const arrowCount = Math.max(2, Math.floor(curve.getLength() / 5))
  const sign = def.flow < 0 ? -1 : 1
  for (let i = 0; i < arrowCount; i++) {
    const u = (i + 0.5) / arrowCount
    const pos = curve.getPointAt(u)
    const tan = curve.getTangentAt(u).multiplyScalar(sign).normalize()
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(d * 0.6, d * 1.5, 8), arrowMat)
    arrow.position.copy(pos)
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan)
    group.add(arrow)
    arrows.push(arrow)
  }

  // 阀门
  const valves: BuiltValve[] = []
  for (const vp of collectValvePositions(def, pts)) {
    const v = buildValve(d * 1.25)
    v.group.position.copy(vp)
    group.add(v.group)
    valves.push(v)
  }

  // 批次物料团（沿切线拉伸的"胶囊段"，模拟批次物料移动，方向随 flow 符号）
  // R4 去卡通化：同箭头处理（Standard + 低自发光 0.4）
  const pulses: THREE.Mesh[] = []
  const pulseCount = Math.max(3, Math.floor(curve.getLength() / 12))
  const pulseMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.2),
    emissive: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3),
    emissiveIntensity: 0.4,
    roughness: 0.55, metalness: 0.1,
  })
  for (let i = 0; i < pulseCount; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(d * 0.62, 10, 8), pulseMat)
    group.add(p)
    pulses.push(p)
  }

  return { id: def.id, def, group, pulses, length: curve.getLength(), curve, arrows, valves, gaugeNeedle, tubeMat }
}

/** 每帧推进流动动画（批次物料团沿切线拉伸前进，方向遵循 flow 符号） */
export function animatePipes(pipes: BuiltPipe[], t: number) {
  const tangent = new THREE.Vector3()
  for (const pipe of pipes) {
    const v = 0.04 + (pipe.length / 600)
    const sign = pipe.def.flow < 0 ? -1 : 1
    pipe.pulses.forEach((p, i) => {
      const u = ((((t * v * sign) % 1) + 1) % 1 + i / pipe.pulses.length) % 1
      const pos = pipe.curve.getPointAt(u)
      p.position.copy(pos)
      // 胶囊拉伸 + 切线对齐
      pipe.curve.getTangentAt(u, tangent)
      tangent.multiplyScalar(sign)
      p.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), tangent.normalize())
      const stretch = 2.4 + pipe.def.flow * 1.6 + 0.6 * Math.sin(u * Math.PI * 5)
      p.scale.set(stretch, 1, 1)
    })
  }
}

/** 管线热力图：按 0~1 值将管体着色（蓝→黄→红），heatEnabled=false 时还原 */
export function setPipeHeat(pipes: BuiltPipe[], values: Record<string, number>) {
  const c = new THREE.Color()
  for (const pipe of pipes) {
    const v = values[pipe.id]
    if (v === undefined) continue
    const t = Math.max(0, Math.min(1, v))
    c.setHSL(0.66 - t * 0.66, 0.85, 0.5)
    pipe.tubeMat.color.copy(c)
  }
}

export function resetPipeHeat(pipes: BuiltPipe[]) {
  for (const pipe of pipes) {
    pipe.tubeMat.color.set(PIPE_COLORS[pipe.def.color])
  }
}

/** 设备联动高亮：相连管线提亮 + 箭头可见，无关管线半透明 */
export function setPipeHighlight(pipes: BuiltPipe[], elementId: string | null) {
  for (const pipe of pipes) {
    const fromDev = PORTS[pipe.def.from]?.elementId
    const toDev = PORTS[pipe.def.to]?.elementId
    const connected = elementId !== null && (fromDev === elementId || toDev === elementId)
    // 泵串接也算相连
    const viaConnected = (pipe.def.via ?? []).some(v => v.pump === elementId)
    const on = connected || viaConnected
    pipe.tubeMat.emissiveIntensity = on ? 0.55 : 0.12
    pipe.tubeMat.transparent = !on && elementId !== null
    pipe.tubeMat.opacity = on || elementId === null ? 1 : 0.3
    for (const a of pipe.arrows) a.visible = on || elementId === null
  }
}
