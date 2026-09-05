import * as THREE from 'three'
import {
  stainless, insulation, paintedSteel, sphereTank, structuralSteel, machinedSteel,
  pumpBody, motorOrange, motorEndBell, valveGray, rubber, lampGlass, electricHousing,
  nameplateMetal, concrete, glassMaterial,
} from '../materials/pbr'
import type { EquipmentDef } from '../layout/plantLayout'

/**
 * 设备程序化建模 v2 —— 精细化重构
 * 统一细节语言：椭圆封头 / 法兰 / 管口 / 护栏 / 爬梯 / 环形平台 / 液位计 / 铭牌 / 指示灯 / 焊缝环
 * 根节点 userData.elementId 由调用方埋入；动画锚点 userData.fan / userData.stirrer 保持兼容
 */

// ── 基础几何工具 ─────────────────────────────

function cylinder(rTop: number, rBottom: number, h: number, mat: THREE.Material, seg = 24) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), mat)
}

function box(w: number, h: number, d: number, mat: THREE.Material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
}

/** 椭圆封头（LatheGeometry 旋转体，开口朝下）：半径 R、凸高 depth */
function dishedHead(R: number, depth: number, mat: THREE.Material, seg = 24) {
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 14; i++) {
    const t = i / 14
    const a = (t * Math.PI) / 2
    pts.push(new THREE.Vector2(Math.cos(a) * R, Math.sin(a) * depth))
  }
  return new THREE.Mesh(new THREE.LatheGeometry(pts, seg), mat)
}

/** 锥顶盖（锥形封头） */
function coneRoof(R: number, height: number, mat: THREE.Material, seg = 32) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(R, height, seg), mat)
  mesh.position.y = height / 2
  return mesh
}

/** 法兰盘（带螺栓孔圈装饰） */
function flange(r: number, t: number, mat: THREE.Material, seg = 20, boltHoles = 6) {
  const g = new THREE.Group()
  const disc = cylinder(r, r, t, mat, seg)
  g.add(disc)
  // 螺栓头
  const boltMat = machinedSteel()
  for (let i = 0; i < boltHoles; i++) {
    const a = (i / boltHoles) * Math.PI * 2
    const bolt = new THREE.Mesh(new THREE.SphereGeometry(r * 0.09, 6, 4), boltMat)
    bolt.position.set(Math.cos(a) * r * 0.72, 0, Math.sin(a) * r * 0.72)
    g.add(bolt)
  }
  return g
}

/** 短管口（接管 + 端部小法兰），dir=1 朝 +Y */
function nozzle(r: number, len: number, mat: THREE.Material, dir: THREE.Vector3) {
  const g = new THREE.Group()
  const pipe = cylinder(r, r, len, stainless(), 16)
  pipe.position.set(0, len / 2, 0)
  g.add(pipe)
  const fl = flange(r * 1.45, r * 0.5, valveGray(), 16, 4)
  fl.position.y = len
  g.add(fl)
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  return g
}

/** 液位计（磁翻板：竖管 + 上下法兰 + 小阀） */
function levelGauge(len: number, mat: THREE.Material) {
  const g = new THREE.Group()
  const tube = cylinder(0.07, 0.07, len, machinedSteel(), 10)
  tube.position.y = len / 2
  g.add(tube)
  for (const y of [0.02, len - 0.02]) {
    const fl = flange(0.16, 0.07, valveGray(), 10, 4)
    fl.position.y = y
    g.add(fl)
  }
  // 玻璃管指示段（真实透射玻璃）+ 内部翻柱指示条（微自发光保持可读性）
  const glass = cylinder(0.095, 0.095, len * 0.6, glassMaterial(), 10)
  glass.position.y = len * 0.32
  g.add(glass)
  // 翻柱几何底部对齐（平移 +flipLen/2），缩放 Y 即表示液位高度
  const flipLen = len * 0.58
  const flipGeo = new THREE.CylinderGeometry(0.045, 0.045, flipLen, 8)
  flipGeo.translate(0, flipLen / 2, 0)
  const flip = new THREE.Mesh(flipGeo, lampGlass(0x8fd4a0))
  flip.position.y = len * 0.03 // 玻璃管底部
  g.add(flip)
  // 暴露翻柱供动态液位驱动
  g.userData.flip = flip
  void mat
  return g
}

/** 护栏（立柱 + 双横杆） */
function handrail(radius: number, mat: THREE.Material, posts = 12, h = 1) {
  const g = new THREE.Group()
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2
    const post = cylinder(0.04, 0.04, h, mat, 6)
    post.position.set(Math.cos(a) * radius, h / 2, Math.sin(a) * radius)
    g.add(post)
  }
  for (const y of [h * 0.25, h]) {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.028, 6, 48), mat)
    rail.rotation.x = Math.PI / 2
    rail.position.y = y
    g.add(rail)
  }
  return g
}

/** 巡检灯共享几何体/材质（平台护栏立柱顶暖光小灯，黄昏灯火初上）
 *  v10：1.8 → 1.2 —— 低于 bloom 阈值，护栏小灯不产生光晕（远处成排灯珠
 *  曾与指示灯一起糊成白色光斑） */
const patrolLampGeo = new THREE.SphereGeometry(0.07, 8, 6)
const patrolLampMat = new THREE.MeshStandardMaterial({
  color: 0xffc37a, emissive: 0xffb066, emissiveIntensity: 1.2, roughness: 0.4,
})

/** 平台护栏巡检灯：每 3 根立柱挂 1 盏（控制数量），挂在立柱顶外侧 */
function addPatrolLamps(g: THREE.Group, radius: number, posts = 12, h = 1) {
  for (let i = 0; i < posts; i += 3) {
    const a = (i / posts) * Math.PI * 2
    const lamp = new THREE.Mesh(patrolLampGeo, patrolLampMat)
    lamp.position.set(Math.cos(a) * radius, h + 0.08, Math.sin(a) * radius)
    g.add(lamp)
  }
}

/** 环形平台（格栅盘 + 支撑筋 + 护栏） */
function platform(radius: number, mat: THREE.Material, withRail = true) {
  const g = new THREE.Group()
  // 格栅盘（薄环盘）
  const disc = new THREE.Mesh(new THREE.RingGeometry(radius * 0.32, radius, 8, 3), mat)
  disc.rotation.x = -Math.PI / 2
  g.add(disc)
  // 支撑筋（8 根径向梁）
  const beam = box(radius * 0.68, 0.08, 0.08, mat)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const b = beam.clone()
    b.position.set(Math.cos(a) * radius * 0.66, 0.02, Math.sin(a) * radius * 0.66)
    b.rotation.y = -a
    g.add(b)
  }
  // 外沿角钢
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.06, 6, 48), mat)
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.04
  g.add(rim)
  if (withRail) {
    const rail = handrail(radius, mat)
    rail.position.y = 0.04
    g.add(rail)
    // 巡检灯（黄昏灯火，共享几何体/材质）
    addPatrolLamps(g, radius)
  }
  return g
}

/** 爬梯护笼共享几何（GB 4053：登高>3m 设安全护笼，环箍 + 竖向扁钢） */
const cageHoopGeo = new THREE.TorusGeometry(0.36, 0.02, 6, 24, Math.PI * 1.6)
const cageBarGeo = new THREE.BoxGeometry(0.035, 1, 0.02)

/** 直爬梯（两侧立柱 + 横档 + 安全护笼） */
function ladder(h: number, mat: THREE.Material, width = 0.5) {
  const g = new THREE.Group()
  for (const s of [-1, 1]) {
    const post = box(0.06, h, 0.06, mat)
    post.position.set(s * width / 2, h / 2, 0)
    g.add(post)
  }
  const steps = Math.floor(h / 0.34)
  for (let i = 1; i <= steps; i++) {
    const rung = box(width, 0.045, 0.05, mat)
    rung.position.y = (h / (steps + 1)) * i
    g.add(rung)
  }
  // 安全护笼（自 2.2m 起至顶部，环箍间距 0.6m + 3 根竖向扁钢）
  if (h > 3) {
    const cageBot = 2.2
    const cageH = h - cageBot
    const hoops = Math.max(2, Math.floor(cageH / 0.6) + 1)
    for (let i = 0; i < hoops; i++) {
      const hoop = new THREE.Mesh(cageHoopGeo, mat)
      hoop.rotation.x = Math.PI / 2
      hoop.rotation.z = Math.PI * 0.2 // 开口朝向爬梯面
      hoop.position.y = cageBot + (cageH / (hoops - 1)) * i
      g.add(hoop)
    }
    // 竖向扁钢（3 根均布，长度 = 护笼高，共享几何按高度缩放）
    for (let k = 0; k < 3; k++) {
      const a = Math.PI * 0.2 + (k / 3) * Math.PI * 1.6 + Math.PI * 0.8
      const bar = new THREE.Mesh(cageBarGeo, mat)
      bar.scale.y = cageH
      bar.position.set(Math.cos(a) * 0.36, cageBot + cageH / 2, Math.sin(a) * 0.36)
      g.add(bar)
    }
  }
  return g
}

/** 焊缝环（设备分节装饰带） */
function weldRing(r: number, mat: THREE.Material) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 48), mat)
  ring.rotation.x = Math.PI / 2
  return ring
}

/** 铭牌（CanvasTexture 金属铭牌，带设备位号）
 *  R2：画布 256x128 → 512x256，近景可读性提升（对应参考基准"纹素密度一致"） */
function nameplate(text: string, mat: THREE.Material) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#cfcabe'
  ctx.fillRect(0, 0, 512, 256)
  ctx.strokeStyle = '#555a61'
  ctx.lineWidth = 12
  ctx.strokeRect(16, 16, 480, 224)
  ctx.strokeStyle = '#8b8f96'
  ctx.lineWidth = 4
  ctx.strokeRect(32, 32, 448, 192)
  ctx.fillStyle = '#20242a'
  ctx.font = 'bold 116px "Segoe UI", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 116)
  ctx.font = '44px "Segoe UI", Arial, sans-serif'
  ctx.fillStyle = '#4a4f56'
  ctx.fillText('SMES · CHEMICAL PLANT', 256, 204)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.55),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.35 }),
  )
  void mat
  return mesh
}

/** 指示灯（灯座 + 磨砂玻璃灯珠），bulb 标记 userData.isLamp 供状态动画检索 */
function indicatorLight(color: number, on = true) {
  const g = new THREE.Group()
  const housing = cylinder(0.09, 0.12, 0.12, electricHousing(), 10)
  housing.position.y = 0.06
  g.add(housing)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), lampGlass(color))
  bulb.position.y = 0.15
  g.add(bulb)
  bulb.userData.isLamp = true
  bulb.userData.lampBase = color
  bulb.userData.on = on
  return g
}

/** 锥形支柱（球罐用） */
function taperedLeg(rTop: number, rBot: number, h: number, mat: THREE.Material) {
  return cylinder(rTop, rBot, h, mat, 12)
}

/** 基础混凝土墩 */
export function foundation(r: number, h = 0.5) {
  const f = cylinder(r * 1.32, r * 1.45, h, concrete(), 32)
  f.position.y = h / 2
  return f
}

// ── 设备模型 ─────────────────────────────────

/** 立式储罐（V-101/V-102）：锥顶 + 罐体 + 色环 + 护栏 + 爬梯 + 液位计 + 铭牌 */
function buildStorageTank(def: EquipmentDef) {
  const g = new THREE.Group()
  const { radius = 4, height = 6, color = 0xe8e8e8, band = 0x999999 } = def.params ?? {}
  const shellMat = paintedSteel(color)
  const steel = structuralSteel()
  g.add(foundation(radius))

  // 罐体（带焊缝分节）
  const shell = cylinder(radius, radius, height, shellMat, 40)
  shell.position.y = height / 2 + 0.5
  g.add(shell)
  for (const y of [1.6, 2.9, 4.2, 5.5]) {
    const wr = weldRing(radius * 1.002, machinedSteel())
    wr.position.y = y + 0.5
    g.add(wr)
  }
  // 锥顶盖（圆台过渡 + 锥顶）
  const roofSkirt = cylinder(radius * 0.98, radius, 0.35, shellMat, 40)
  roofSkirt.position.y = height + 0.85
  g.add(roofSkirt)
  const roof = coneRoof(radius * 0.98, 1.05, shellMat, 40)
  roof.position.y = height + 1.05
  g.add(roof)
  const roofPeak = cylinder(0.12, 0.2, 0.5, machinedSteel(), 10)
  roofPeak.position.y = height + 1.9
  g.add(roofPeak)

  // 色环（介质识别带）
  const ring = cylinder(radius * 1.006, radius * 1.006, 0.7, paintedSteel(band), 40)
  ring.position.y = height * 0.72 + 0.5
  g.add(ring)

  // 顶部护栏 + 走道
  const deck = new THREE.Mesh(new THREE.RingGeometry(radius * 0.86, radius * 0.99, 4, 2), steel)
  deck.rotation.x = -Math.PI / 2
  deck.position.y = height + 1.62
  g.add(deck)
  const rail = handrail(radius * 0.92, steel, 12)
  rail.position.y = height + 1.62
  g.add(rail)

  // 罐壁爬梯 + 顶部围栏缺口
  const lad = ladder(height + 1.1, steel)
  lad.position.set(radius + 0.32, 0.5, 0)
  g.add(lad)

  // 液位计
  const gauge = levelGauge(height * 0.6, steel)
  gauge.position.set(radius + 0.75, height * 0.28 + 0.5, 0)
  g.add(gauge)

  // 底部人孔 + 进料/出料管口
  const manway = cylinder(0.4, 0.44, 0.35, machinedSteel(), 18)
  manway.position.set(0, 0.45, radius * 0.86)
  manway.rotation.x = Math.PI / 2
  g.add(manway)
  const inlet = nozzle(0.22, 0.8, steel, new THREE.Vector3(1, 0, 0))
  inlet.position.set(radius, 1.15, -radius * 0.4)
  g.add(inlet)
  const outlet = nozzle(0.24, 0.7, steel, new THREE.Vector3(0, 0, 1))
  outlet.position.set(-radius * 0.5, 0.85, radius)
  g.add(outlet)

  // 铭牌 + 指示灯
  const np = nameplate(def.id, steel)
  np.position.set(radius * 0.2, 2.4, radius * 1.02)
  g.add(np)
  const lamp = indicatorLight(0x37c871)
  lamp.position.set(radius * 0.2, 2.85, radius * 1.02)
  g.add(lamp)
  return g
}

/** 产品球罐（V-105）：球体 + 赤道带 + 支柱 + 拉杆 + 顶部放空 + 铭牌 */
function buildSphereTank(def: EquipmentDef) {
  const g = new THREE.Group()
  const { radius = 6, legs = 6 } = def.params ?? {}
  const steel = structuralSteel()
  const ballMat = sphereTank()
  const legH = radius * 0.9

  // 支柱（锥形）+ 基座 + 拉杆
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2
    const leg = taperedLeg(0.28, 0.5, legH, steel)
    leg.position.set(Math.cos(a) * radius * 0.8, legH / 2, Math.sin(a) * radius * 0.8)
    leg.rotation.z = -Math.cos(a) * 0.14
    leg.rotation.x = Math.sin(a) * 0.14
    g.add(leg)
    const foot = cylinder(0.55, 0.62, 0.25, machinedSteel(), 12)
    foot.position.set(Math.cos(a) * radius * 0.8, 0.12, Math.sin(a) * radius * 0.8)
    g.add(foot)
    // 相邻支柱间拉杆
    const a2 = ((i + 1) / legs) * Math.PI * 2
    const p1 = new THREE.Vector3(Math.cos(a) * radius * 0.8, legH * 0.45, Math.sin(a) * radius * 0.8)
    const p2 = new THREE.Vector3(Math.cos(a2) * radius * 0.8, legH * 0.45, Math.sin(a2) * radius * 0.8)
    const mid = p1.clone().add(p2).multiplyScalar(0.5)
    const len = p1.distanceTo(p2)
    const tie = cylinder(0.05, 0.05, len, steel, 8)
    tie.position.copy(mid)
    tie.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p2.clone().sub(p1).normalize())
    g.add(tie)
  }

  const ballY = legH + radius * 0.32
  const ball = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), ballMat)
  ball.position.y = ballY
  g.add(ball)

  // 赤道焊接带 + 支座环
  const equator = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.004, 0.07, 8, 64), machinedSteel())
  equator.rotation.x = Math.PI / 2
  equator.position.y = ballY
  g.add(equator)
  // 经线焊缝（装饰，4 条，竖直环）
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI
    const seam = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.002, 0.035, 6, 48), machinedSteel())
    seam.position.y = ballY
    seam.rotation.y = a
    g.add(seam)
  }

  // 顶部放空管 + 安全阀
  const vent = nozzle(0.18, 1.4, steel, new THREE.Vector3(0, 1, 0))
  vent.position.y = ballY + radius
  g.add(vent)
  const valve = cylinder(0.14, 0.14, 0.5, valveGray(), 12)
  valve.position.y = ballY + radius + 2.0
  g.add(valve)

  // 西侧进料口（对应端口 V105-IN-1，位于球面外侧）
  const inlet = nozzle(0.35, 1.1, steel, new THREE.Vector3(1, 0, 0))
  inlet.position.set(-radius * 1.1, ballY - radius * 0.22, 0)
  g.add(inlet)

  // 赤道平台 + 爬梯（地面至赤道）
  const plat = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.04, 0.24, 8, 48), steel)
  plat.rotation.x = Math.PI / 2
  plat.position.y = ballY - 0.1
  g.add(plat)
  const lad = ladder(ballY + radius * 0.15, steel, 0.6)
  lad.position.set(radius * 1.1, 0, 0)
  lad.rotation.y = Math.PI / 2
  g.add(lad)

  // 液位计（LI-V105，动态液位由数据驱动）—— 赤道侧竖直安装
  const gauge = levelGauge(radius * 0.9, steel)
  gauge.position.set(radius * 1.06, ballY - radius * 0.45, radius * 0.35)
  g.add(gauge)
  g.userData.levelGauge = gauge

  // 铭牌 + 指示灯
  const np = nameplate(def.id, steel)
  np.position.set(radius * 0.55, ballY - radius * 0.6, radius * 1.02)
  g.add(np)
  const lamp = indicatorLight(0x37c871)
  lamp.position.set(radius * 0.55, ballY - radius * 0.6 + 0.4, radius * 1.02)
  g.add(lamp)
  return g
}

/** 固定床列管反应器（R-101）：裙座 + 筒体 + 椭圆封头 + 平台 + 爬梯 + 仪表接口 */
function buildReactor(def: EquipmentDef) {
  const g = new THREE.Group()
  const { radius = 1.8, height = 9 } = def.params ?? {}
  const steel = structuralSteel()
  const shellMat = paintedSteel(0x2e6e5e)
  g.add(foundation(radius))

  // 裙座（带人孔）
  const skirt = cylinder(radius * 0.86, radius * 0.96, 2.2, paintedSteel(0x3a5a52), 32)
  skirt.position.y = 1.3
  g.add(skirt)
  const manway = cylinder(0.34, 0.38, 0.5, machinedSteel(), 16)
  manway.rotation.x = Math.PI / 2
  manway.position.set(0, 0.9, radius * 0.85)
  g.add(manway)

  // 催化剂段筒体（保温漆面 + 分节焊缝）
  const body = cylinder(radius, radius, height, shellMat, 36)
  body.position.y = 2.2 + height / 2
  g.add(body)
  for (let i = 1; i < 4; i++) {
    const wr = weldRing(radius * 1.004, machinedSteel())
    wr.position.y = 2.2 + (height / 4) * i
    g.add(wr)
  }

  // 上下椭圆封头
  const topHead = dishedHead(radius, radius * 0.5, shellMat, 32)
  topHead.position.y = 2.2 + height
  g.add(topHead)
  const botHead = dishedHead(radius, radius * 0.5, shellMat, 32)
  botHead.rotation.x = Math.PI
  botHead.position.y = 2.2
  g.add(botHead)

  // 顶部放空 + 安全阀
  const vent = nozzle(0.16, 1.1, steel, new THREE.Vector3(0, 1, 0))
  vent.position.y = 2.2 + height + radius * 0.5
  g.add(vent)
  const sv = cylinder(0.13, 0.17, 0.55, valveGray(), 12)
  sv.position.y = 2.2 + height + radius * 0.5 + 1.6
  g.add(sv)

  // 环平台 ×2 + 爬梯（通至上层平台）
  for (const py of [height * 0.42 + 2.2, height * 0.82 + 2.2]) {
    const plat = platform(radius * 1.3, steel)
    plat.position.y = py
    g.add(plat)
  }
  const lad = ladder(height * 0.8 + 1.4, steel, 0.55)
  lad.position.set(radius + 0.55, 2.2, 0)
  g.add(lad)

  // 进料/出料管口（x+ 侧并排两个进料口：预热器来料 + 酸循环回料）
  const inlet = nozzle(0.2, 0.8, steel, new THREE.Vector3(1, 0, 0))
  inlet.position.set(radius, 2.2 + height * 0.3, 0)
  g.add(inlet)
  const inlet2 = nozzle(0.16, 0.7, steel, new THREE.Vector3(1, 0, 0))
  inlet2.position.set(radius, 2.2 + height * 0.3, 0.9)
  g.add(inlet2)
  const outlet = nozzle(0.2, 0.8, steel, new THREE.Vector3(1, 0, 0))
  outlet.position.set(radius, 2.2 + height * 0.78, 0)
  g.add(outlet)

  // 热电偶/仪表接口（斜插短管）
  const tc = nozzle(0.09, 0.9, steel, new THREE.Vector3(1, 0.35, 0.6))
  tc.position.set(radius * 0.6, 2.2 + height * 0.55, radius * 0.6)
  g.add(tc)

  // 铭牌 + 指示灯
  const np = nameplate(def.id, steel)
  np.position.set(radius * 0.5, 3.2, radius * 1.03)
  g.add(np)
  const lamp = indicatorLight(0x37c871)
  lamp.position.set(radius * 0.5, 3.62, radius * 1.03)
  g.add(lamp)
  return g
}

/** 精馏塔（T-101/102/103）：裙座 + 塔体 + 平台护栏 + 爬梯 + 吊柱 + 塔顶附件 + 回流罐/再沸器 */
function buildColumn(def: EquipmentDef) {
  const g = new THREE.Group()
  const { radius = 1.5, height = 16 } = def.params ?? {}
  const steel = structuralSteel()
  const jacket = insulation()
  g.add(foundation(radius))

  // 裙座（带人孔 + 巡检口）
  const skirt = cylinder(radius * 0.84, radius, 2.6, paintedSteel(0x4a5560), 32)
  skirt.position.y = 1.3
  g.add(skirt)
  const manway = cylinder(0.3, 0.34, 0.45, machinedSteel(), 16)
  manway.rotation.x = Math.PI / 2
  manway.position.set(0, 1.0, radius * 0.86)
  g.add(manway)

  // 塔体（保温铝皮 + 分节焊缝）
  const body = cylinder(radius, radius, height, jacket, 40)
  body.position.y = 2.6 + height / 2
  g.add(body)
  const sections = Math.max(3, Math.floor(height / 5))
  for (let i = 1; i < sections; i++) {
    const wr = weldRing(radius * 1.005, machinedSteel())
    wr.position.y = 2.6 + (height / sections) * i
    g.add(wr)
  }

  // 塔顶椭圆封头 + 放空
  const head = dishedHead(radius, radius * 0.5, jacket, 32)
  head.position.y = 2.6 + height
  g.add(head)
  const vent = nozzle(0.15, 1.2, steel, new THREE.Vector3(0, 1, 0))
  vent.position.y = 2.6 + height + radius * 0.5
  g.add(vent)
  const sv = cylinder(0.12, 0.16, 0.5, valveGray(), 12)
  sv.position.y = 2.6 + height + radius * 0.5 + 1.5
  g.add(sv)

  // 环平台（每 4m 一层，带护栏）+ 双侧爬梯
  const platforms = Math.max(3, Math.floor(height / 4))
  for (let i = 1; i <= platforms; i++) {
    const py = 2.6 + (height / (platforms + 1)) * i
    const plat = platform(radius * 1.3, steel)
    plat.position.y = py
    g.add(plat)
    // 平台之间爬梯（外侧）
    const seg = (height / (platforms + 1))
    const lad = ladder(seg * 0.9, steel, 0.55)
    lad.position.set(radius + 0.5, py + 0.2, 0)
    g.add(lad)
  }

  // 顶部吊柱 + 滑轮吊钩
  const davit = cylinder(0.1, 0.1, 5.2, steel, 8)
  davit.position.set(radius + 0.65, 2.6 + height - 2.2, 0)
  davit.rotation.z = 0.55
  g.add(davit)
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 12), machinedSteel())
  hook.position.set(radius + 1.5, 2.6 + height - 2.5, 0)
  g.add(hook)

  // 回流罐（塔侧高位，卧式带鞍座）
  const reflux = cylinder(0.7, 0.7, 3, stainless(), 24)
  reflux.rotation.z = Math.PI / 2
  reflux.position.set(radius + 2.6, height * 0.88, 0)
  g.add(reflux)
  for (const s of [-1, 1]) {
    const rh = dishedHead(0.7, 0.35, stainless(), 20)
    rh.rotation.z = s * Math.PI / 2
    rh.position.set(radius + 2.6 + s * 1.5, height * 0.88, 0)
    g.add(rh)
    const saddle = box(0.4, 0.75, 1.4, steel)
    saddle.position.set(radius + 2.6 + s * 0.9, height * 0.88 - 0.55, 0)
    g.add(saddle)
  }

  // 再沸器（塔釜侧卧式，带封头鞍座）
  const reboiler = cylinder(0.6, 0.6, 3.2, stainless(), 24)
  reboiler.rotation.z = Math.PI / 2
  reboiler.position.set(radius + 2.3, 2.2, 1.6)
  g.add(reboiler)
  for (const s of [-1, 1]) {
    const rh = dishedHead(0.6, 0.3, stainless(), 20)
    rh.rotation.z = s * Math.PI / 2
    rh.position.set(radius + 2.3 + s * 1.6, 2.2, 1.6)
    g.add(rh)
  }
  const rbSaddle = box(0.7, 1.0, 1.2, steel)
  rbSaddle.position.set(radius + 2.3, 0.8, 1.6)
  g.add(rbSaddle)

  // 塔釜采出泵位基础 + 液位计
  const pb = box(2.2, 0.35, 1.3, concrete())
  pb.position.set(radius + 2.1, 0.175, -2)
  g.add(pb)
  const gauge = levelGauge(height * 0.28, steel)
  gauge.position.set(radius + 0.85, 2.8, 0.6)
  g.add(gauge)

  // 铭牌 + 指示灯
  const np = nameplate(def.id, steel)
  np.position.set(radius * 0.5, 3.6, radius * 1.05)
  g.add(np)
  const lamp = indicatorLight(0x37c871)
  lamp.position.set(radius * 0.5, 4.02, radius * 1.05)
  g.add(lamp)
  return g
}

/** 卧式管壳换热器（E-101）：壳体 + 椭圆封头 + 管箱法兰 + 鞍座 + 管口 */
function buildExchanger(def: EquipmentDef) {
  const g = new THREE.Group()
  const { radius = 1, length = 5 } = def.params ?? {}
  const steel = structuralSteel()
  const ss = stainless()

  // 基础 + 双鞍座（带筋板）
  const base = box(length * 0.72, 0.45, radius * 2.6, concrete())
  base.position.y = 0.225
  g.add(base)
  for (const s of [-1, 1]) {
    const saddle = box(0.6, radius + 0.8, radius * 1.7, steel)
    saddle.position.set(s * length * 0.3, (radius + 0.8) / 2, 0)
    g.add(saddle)
    const rib = box(0.1, radius + 0.8, 0.3, steel)
    rib.position.set(s * length * 0.3, (radius + 0.8) / 2, radius * 0.72)
    g.add(rib)
    const rib2 = rib.clone(); rib2.position.z = -radius * 0.72
    g.add(rib2)
  }

  // 壳体（拉丝不锈钢 + 分节焊缝）
  const shell = cylinder(radius, radius, length, ss, 36)
  shell.rotation.z = Math.PI / 2
  shell.position.y = radius + 0.8
  g.add(shell)
  for (const s of [-0.35, 0.35]) {
    const wr = weldRing(radius * 1.006, machinedSteel())
    wr.rotation.y = Math.PI / 2
    wr.position.set(s * length, radius + 0.8, 0)
    g.add(wr)
  }

  // 前后椭圆封头 + 管箱法兰
  for (const s of [-1, 1]) {
    const head = dishedHead(radius, radius * 0.45, ss, 28)
    head.rotation.z = s * Math.PI / 2
    head.position.set(s * (length / 2 + radius * 0.45), radius + 0.8, 0)
    g.add(head)
    const fl = flange(radius * 1.06, 0.16, valveGray(), 28, 8)
    fl.rotation.z = s * Math.PI / 2
    fl.position.set(s * (length / 2), radius + 0.8, 0)
    g.add(fl)
    // 管口（上下布置）
    const npz = nozzle(0.14, 0.7, steel, new THREE.Vector3(0, s, 0))
    npz.position.set(s * (length / 2 + radius * 0.45), radius + 0.8, radius * 0.85)
    g.add(npz)
  }

  // 铭牌 + 指示灯
  const np = nameplate(def.id, steel)
  np.position.set(0, radius * 0.35, radius * 1.08)
  g.add(np)
  const lamp = indicatorLight(0xf0b429)
  lamp.position.set(0, radius * 0.35 + 0.42, radius * 1.08)
  g.add(lamp)
  return g
}

/** 静态混合器（M-101）：管段 + 法兰螺栓 + 支腿 + 铭牌 */
function buildMixer(def: EquipmentDef) {
  const g = new THREE.Group()
  const { radius = 0.5, length = 3 } = def.params ?? {}
  const steel = structuralSteel()

  // 底座 + 支腿
  const base = box(1, 0.32, length, concrete())
  base.position.y = 0.16
  g.add(base)
  for (const s of [-1, 1]) {
    const leg = box(0.18, 0.55, 0.25, steel)
    leg.position.set(0, 0.62, s * (length / 2 - 0.4))
    g.add(leg)
  }

  // 混合管段（拉丝不锈钢）
  const pipe = cylinder(radius, radius, length, stainless(), 24)
  pipe.rotation.x = Math.PI / 2
  pipe.position.y = 1.15
  g.add(pipe)

  // 甲醇侧向进料短管 ×2（对应端口 M101-IN-MEOH / M101-IN-MEOH2，-x 侧并排）
  const meohIn = nozzle(0.32, 0.75, steel, new THREE.Vector3(-1, 0, 0))
  meohIn.position.set(-radius - 0.15, 1.15, 0)
  g.add(meohIn)
  const meohIn2 = nozzle(0.3, 0.65, steel, new THREE.Vector3(-1, 0, 0))
  meohIn2.position.set(-radius - 0.1, 1.15, 0.65)
  g.add(meohIn2)

  // 两端法兰（带螺栓）
  for (const s of [-1, 1]) {
    const fl = flange(radius * 1.4, 0.18, valveGray(), 20, 6)
    fl.rotation.x = Math.PI / 2
    fl.position.set(0, 1.15, s * (length / 2))
    g.add(fl)
  }

  // 铭牌
  const np = nameplate(def.id, steel)
  np.position.set(0.5, 0.72, length / 2 - 0.4)
  np.rotation.y = Math.PI / 2
  g.add(np)
  return g
}

/** 卧式离心泵（P-101~105）：底座 + 蜗壳泵体 + 电机 + 联轴器护罩 + 管口 + 铭牌/指示灯 */
function buildPump(def: EquipmentDef) {
  const g = new THREE.Group()
  const steel = structuralSteel()
  const blue = pumpBody()
  const orange = motorOrange()

  // 底座（带地脚螺栓）
  const base = box(2.3, 0.28, 1.0, paintedSteel(0x49535e))
  base.position.y = 0.14
  g.add(base)
  for (const [bx, bz] of [[-1.0, -0.4], [-1.0, 0.4], [1.0, -0.4], [1.0, 0.4]]) {
    const bolt = cylinder(0.06, 0.08, 0.16, machinedSteel(), 8)
    bolt.position.set(bx, 0.36, bz)
    g.add(bolt)
  }

  // 泵壳（蜗壳锥台 + 出口管 + 入口法兰）
  const body = cylinder(0.34, 0.52, 0.8, blue, 22)
  body.rotation.z = Math.PI / 2
  body.position.set(-0.62, 0.72, 0)
  g.add(body)
  // 蜗壳顶部出口管
  const outlet = cylinder(0.14, 0.14, 0.6, steel, 14)
  outlet.position.set(-0.62, 1.38, 0)
  g.add(outlet)
  const outletFl = flange(0.26, 0.12, valveGray(), 14, 4)
  outletFl.position.set(-0.62, 1.68, 0)
  g.add(outletFl)
  // 泵入口法兰（朝前）
  const inletFl = flange(0.32, 0.14, valveGray(), 18, 6)
  inletFl.rotation.x = Math.PI / 2
  inletFl.position.set(-0.62, 0.72, 0.45)
  g.add(inletFl)

  // 电机（带散热鳍片）+ 端盖 + 尾扇（动画锚点）
  const motor = cylinder(0.34, 0.34, 1.05, orange, 22)
  motor.rotation.z = Math.PI / 2
  motor.position.set(0.62, 0.72, 0)
  g.add(motor)
  for (let i = 0; i < 4; i++) {
    const fin = cylinder(0.345, 0.345, 0.05, motorEndBell(), 22)
    fin.rotation.z = Math.PI / 2
    fin.position.set(0.62 + (i - 1.5) * 0.22, 0.72, 0)
    g.add(fin)
  }
  const bell = cylinder(0.32, 0.32, 0.12, motorEndBell(), 22)
  bell.rotation.z = Math.PI / 2
  bell.position.set(0.24, 0.72, 0)
  g.add(bell)
  const fan = cylinder(0.36, 0.36, 0.1, valveGray(), 18)
  fan.rotation.z = Math.PI / 2
  fan.position.set(1.22, 0.72, 0)
  g.add(fan)
  g.userData.fan = fan

  // 联轴器护罩（半圆罩）
  const guard = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.4, 16, 1, true, 0, Math.PI),
    rubber(),
  )
  guard.rotation.z = Math.PI / 2
  guard.position.set(0, 0.72, 0)
  g.add(guard)

  // 铭牌 + 指示灯（朝 +Z）
  const np = nameplate(def.id, steel)
  np.position.set(0, 0.5, 0.56)
  g.add(np)
  const lamp = indicatorLight(0x37c871)
  lamp.position.set(0.25, 0.5, 0.58)
  g.add(lamp)
  return g
}

/** 阻聚剂溶解罐（V-104）：立罐 + 搅拌电机/减速机 + 桨叶 + 液位计 */
function buildInhibitorTank(def: EquipmentDef) {
  const g = new THREE.Group()
  const { radius = 1.2, height = 2 } = def.params ?? {}
  const steel = structuralSteel()
  const ss = stainless()
  g.add(foundation(radius))

  // 罐体（不锈钢 + 焊缝环）
  const shell = cylinder(radius, radius, height, ss, 28)
  shell.position.y = height / 2 + 0.5
  g.add(shell)
  const wr = weldRing(radius * 1.004, machinedSteel())
  wr.position.y = height * 0.7 + 0.5
  g.add(wr)

  // 锥顶 + 顶盖法兰
  const roof = coneRoof(radius * 1.02, 0.6, ss, 28)
  roof.position.y = height + 1.1
  g.add(roof)
  const headFl = cylinder(0.5, 0.55, 0.18, valveGray(), 18)
  headFl.position.y = height + 1.45
  g.add(headFl)

  // 搅拌电机 + 减速机 + 轴 + 桨叶
  const gearbox = box(0.42, 0.32, 0.42, paintedSteel(0x3a5a52))
  gearbox.position.y = height + 1.72
  g.add(gearbox)
  const motor = cylinder(0.24, 0.24, 0.42, motorOrange(), 16)
  motor.position.y = height + 2.12
  g.add(motor)
  const agitator = cylinder(0.05, 0.05, height * 0.85, ss, 8)
  agitator.position.y = height * 0.5 + 0.5
  g.add(agitator)
  for (let i = 0; i < 2; i++) {
    const blade = box(0.85, 0.06, 0.12, ss)
    blade.position.y = height * 0.42 + 0.5
    blade.rotation.y = (i / 2) * Math.PI
    g.add(blade)
  }
  g.userData.stirrer = agitator

  // 液位计 + 底部出料管（z+ 侧，对应端口 V104-OUT-1）
  const gauge = levelGauge(height * 0.65, steel)
  gauge.position.set(radius + 0.3, height * 0.3 + 0.5, 0)
  g.add(gauge)
  const outlet = nozzle(0.16, 0.6, steel, new THREE.Vector3(0, 0, 1))
  outlet.position.set(0, 0.9, radius)
  g.add(outlet)

  // 铭牌 + 指示灯
  const np = nameplate(def.id, steel)
  np.position.set(radius * 0.4, 1.9, radius * 1.04)
  g.add(np)
  const lamp = indicatorLight(0x37c871)
  lamp.position.set(radius * 0.4, 2.32, radius * 1.04)
  g.add(lamp)
  return g
}

/** 统一入口：按设备类型装配，根节点挂 elementId / 动画锚点 */
export function buildEquipment(def: EquipmentDef): THREE.Group {
  let g: THREE.Group
  switch (def.type) {
    case 'tank': g = buildStorageTank(def); break
    case 'sphere': g = buildSphereTank(def); break
    case 'reactor': g = buildReactor(def); break
    case 'column': g = buildColumn(def); break
    case 'exchanger': g = buildExchanger(def); break
    case 'mixer': g = buildMixer(def); break
    case 'pump': g = buildPump(def); break
    case 'inhibitorTank': g = buildInhibitorTank(def); break
    default: g = new THREE.Group()
  }
  g.userData.elementId = def.id
  g.position.set(def.x, 0, def.z)
  // 接触阴影盘：ShadowMaterial 圆盘贴在设备底部，密实阴影消除"悬浮感"（黄昏长影下加强）
  // v11：y 0.02 → 0.045 —— 与地面贴花统一悬浮规范（DECAL_Y ≥3cm），
  // 拉远俯视时避免与地坪顶面（y=0）深度抖动互相闪烁
  const footR = (def.params?.radius ?? 2.5) * 1.9
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(footR, 36),
    new THREE.ShadowMaterial({ opacity: 0.65 }),
  )
  disc.rotation.x = -Math.PI / 2
  disc.position.y = 0.045
  disc.receiveShadow = true
  g.add(disc)
  // 统一阴影设置：设备投影、平台接受阴影
  g.traverse(o => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  return g
}
