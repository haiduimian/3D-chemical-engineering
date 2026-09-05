import * as THREE from 'three'
import { concrete, structuralSteel, machinedSteel, paintedSteel } from '../materials/pbr'
import { buildPhysicalSky, SUN_DIRECTION } from './sky'

/**
 * 装置环境 v9（黄昏/落日工业风 · 完整厂区）
 * v9 变更：物理大气散射天空（Preetham）替代渐变纹理背景；
 *          IBL 环境直接烘焙自天空（反射与可见天空物理一致）；
 *          移除假太阳圆盘/假体积光柱（廉价感来源）；雾色对齐天空地平线
 * 光型：低角度暖橙落日主光（长影）+ 冷蓝天光补光 + 反向暖轮廓光(rim)
 * 配套：中控楼/仓库/办公楼/消防站/火炬塔/冷却塔/停车场/背景城区 + 安全标线
 */

/** 厂区绿化：黄昏逆光下的暖褐剪影树（树干 + 偏暖树冠） */
function buildVegetation(scene: THREE.Scene) {
  const g = new THREE.Group()
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d3227, roughness: 0.92 })
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x57492f, roughness: 0.88 })
  const mkTree = (x: number, z: number, s: number) => {
    const t = new THREE.Group()
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.32 * s, 2.2 * s, 8), trunkMat)
    trunk.position.y = 1.1 * s
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.25 * s, 10, 8), crownMat)
    crown.position.y = 3.0 * s
    t.add(trunk, crown)
    t.position.set(x, 0, z)
    g.add(t)
  }
  mkTree(-68, -42, 1.2)
  mkTree(-66, -47, 0.95)
  mkTree(68, -38, 1.25)
  mkTree(66, 38, 1.1)
  mkTree(-62, 40, 1.0)
  mkTree(58, 42, 1.2)
  mkTree(-71, 8, 0.9)
  mkTree(71, -10, 1.0)
  scene.add(g)
}

/** 厂界/道路灌木带（R2）：沿围栏内侧与主路两侧的暖剪影低矮灌丛，InstancedMesh 单 DrawCall。
 *  呼应工业厂区"分区边界绿化"惯例（参考基准：分区界面），黄昏下呈暖褐剪影带 */
function buildShrubBands(scene: THREE.Scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x453a28, roughness: 0.95 })
  const geo = new THREE.SphereGeometry(0.7, 8, 6)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const p = new THREE.Vector3()
  let seed = 997
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const mtxs: THREE.Matrix4[] = []
  const push = (x: number, z: number) => {
    const sc = 0.75 + rnd() * 0.9
    s.set(1.0 + rnd() * 0.7, sc, 1.0 + rnd() * 0.7)
    p.set(x, 0.28 * sc, z)
    mtxs.push(m4.clone().compose(p, q, s))
  }
  // 围栏内侧（距栏 4m）北/南/东/西四段
  for (let x = -98; x <= 98; x += 6.5) { push(x, -61); push(x, 61) }
  for (let z = -56; z <= 56; z += 6.5) { push(-101, z); push(101, z) }
  // 主路两侧（避开路口与 u 主路路面留空）
  for (let x = -105; x <= 105; x += 7.5) { if (Math.abs(x) > 14) { push(x, -53.2); push(x, -42.8) } }
  for (let z = -58; z <= 58; z += 7.5) { if (Math.abs(z) > 20 && (z < -51.5 || z > -44.5)) { push(-65.8, z); push(65.8, z) } }
  // 罐区围堰与球罐围堰外缘点缀（间距更松）
  for (let x = -74; x <= -20; x += 9) push(x, -20.5)
  for (let z = -48.5; z <= -22; z += 9) push(-68, z)
  for (let x = 36; x <= 74; x += 9) push(x, -18.5)
  if (mtxs.length) {
    const inst = new THREE.InstancedMesh(geo, mat, mtxs.length)
    mtxs.forEach((mtx, i) => inst.setMatrixAt(i, mtx))
    inst.instanceMatrix.needsUpdate = true
    scene.add(inst)
  }
}

/** 道路虚线标线纹理（透明底 + 白色虚线段，4m 周期） */
function dashTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 16
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 128, 16)
  ctx.fillStyle = '#e8e2d0'
  ctx.fillRect(10, 5, 60, 6)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 道路标线（中央虚线 + 两侧边线）、路沿石与排水明沟 */
function buildRoadDetails(scene: THREE.Scene) {
  const g = new THREE.Group()
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8d2c0, transparent: true, opacity: 0.85 })

  // 中央虚线（东西主路 z=-48）
  const dashH = new THREE.Mesh(new THREE.PlaneGeometry(216, 0.2), new THREE.MeshBasicMaterial({
    map: dashTexture(), transparent: true,
  }))
  ;(dashH.material as THREE.MeshBasicMaterial).map!.repeat.set(54, 1)
  dashH.rotation.x = -Math.PI / 2
  dashH.position.set(0, DECAL_Y.onRoad, -48)
  g.add(dashH)

  // 中央虚线（南北路 x=±70）
  for (const x of [-70, 70]) {
    const dashV = new THREE.Mesh(new THREE.PlaneGeometry(136, 0.2), new THREE.MeshBasicMaterial({
      map: dashTexture(), transparent: true,
    }))
    ;(dashV.material as THREE.MeshBasicMaterial).map!.repeat.set(34, 1)
    dashV.rotation.x = -Math.PI / 2
    dashV.rotation.z = Math.PI / 2
    dashV.position.set(x, DECAL_Y.onRoad, 0)
    g.add(dashV)
  }

  // 边线（实线）
  const edgeGeoH = new THREE.PlaneGeometry(216, 0.12)
  for (const z of [-50.6, -45.4]) {
    const e = new THREE.Mesh(edgeGeoH, lineMat)
    e.rotation.x = -Math.PI / 2
    e.position.set(0, DECAL_Y.onRoad, z)
    g.add(e)
  }
  const edgeGeoV = new THREE.PlaneGeometry(136, 0.12)
  for (const x of [-70, 70]) {
    for (const dx of [-2.6, 2.6]) {
      const e = new THREE.Mesh(edgeGeoV, lineMat)
      e.rotation.x = -Math.PI / 2
      e.rotation.z = Math.PI / 2
      e.position.set(x + dx, DECAL_Y.onRoad, 0)
      g.add(e)
    }
  }

  // 路沿石（混凝土）
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x767c82, roughness: 0.9 })
  const curbH = new THREE.BoxGeometry(220, 0.18, 0.35)
  for (const z of [-51.35, -44.65]) {
    const c = new THREE.Mesh(curbH, curbMat)
    c.position.set(0, 0.09, z)
    g.add(c)
  }
  const curbV = new THREE.BoxGeometry(0.35, 0.18, 140)
  for (const x of [-70, 70]) {
    for (const dx of [-3.35, 3.35]) {
      const c = new THREE.Mesh(curbV, curbMat)
      c.position.set(x + dx, 0.09, 0)
      g.add(c)
    }
  }

  // 排水明沟（路沿外侧深色凹槽）
  const ditchMat = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.95 })
  const ditchH = new THREE.BoxGeometry(220, 0.06, 0.9)
  for (const z of [-52.2, -43.8]) {
    const d = new THREE.Mesh(ditchH, ditchMat)
    d.position.set(0, 0.02, z)
    g.add(d)
  }
  const ditchV = new THREE.BoxGeometry(0.9, 0.06, 140)
  for (const x of [-70, 70]) {
    for (const dx of [-4.2, 4.2]) {
      const d = new THREE.Mesh(ditchV, ditchMat)
      d.position.set(x + dx, 0.02, 0)
      g.add(d)
    }
  }
  scene.add(g)
}

/** 厂界围栏（混凝土矮墙 + 立柱 + 横杆）与大门/警示标牌 */
function buildFence(scene: THREE.Scene) {
  const g = new THREE.Group()
  const steel = structuralSteel()

  // 矮墙基座
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6f757b, roughness: 0.92 })
  const wallN = new THREE.Mesh(new THREE.BoxGeometry(210, 0.35, 0.25), wallMat)
  wallN.position.set(0, 0.175, -65)
  const wallS = wallN.clone(); wallS.position.z = 65
  const wallE = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 130), wallMat)
  wallE.position.set(105, 0.175, 0)
  const wallW = wallE.clone(); wallW.position.x = -105
  g.add(wallN, wallS, wallE, wallW)

  // 立柱（InstancedMesh 控制 DrawCall）
  const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.7, 8)
  const posts: THREE.Matrix4[] = []
  const m4 = new THREE.Matrix4()
  for (let x = -105; x <= 105; x += 10) {
    posts.push(m4.clone().makeTranslation(x, 0.85, -65))
    posts.push(m4.clone().makeTranslation(x, 0.85, 65))
  }
  for (let z = -55; z <= 55; z += 10) {
    posts.push(m4.clone().makeTranslation(-105, 0.85, z))
    posts.push(m4.clone().makeTranslation(105, 0.85, z))
  }
  const inst = new THREE.InstancedMesh(postGeo, steel, posts.length)
  posts.forEach((mtx, i) => inst.setMatrixAt(i, mtx))
  g.add(inst)

  // 横杆（每侧两道）
  const railH = new THREE.BoxGeometry(210, 0.05, 0.05)
  const railV = new THREE.BoxGeometry(0.05, 0.05, 130)
  for (const y of [0.75, 1.45]) {
    for (const z of [-65, 65]) {
      const r = new THREE.Mesh(railH, steel)
      r.position.set(0, y, z)
      g.add(r)
    }
    for (const x of [-105, 105]) {
      const r = new THREE.Mesh(railV, steel)
      r.position.set(x, y, 0)
      g.add(r)
    }
  }

  // 大门（西南侧 x=-70 南北路与南界交汇处）
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.85 })
  for (const x of [-74, -66]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.2, 0.6), pillarMat)
    p.position.set(x, 1.6, 65)
    g.add(p)
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.5, 0.4), pillarMat)
  beam.position.set(-70, 3.3, 65)
  g.add(beam)

  // 门楣标牌（厂名）
  const signCanvas = document.createElement('canvas')
  signCanvas.width = 512
  signCanvas.height = 96
  const sctx = signCanvas.getContext('2d')!
  sctx.fillStyle = '#2e6e5e'
  sctx.fillRect(0, 0, 512, 96)
  sctx.fillStyle = '#f2efe6'
  sctx.font = 'bold 52px "Segoe UI", "Microsoft YaHei", sans-serif'
  sctx.textAlign = 'center'
  sctx.textBaseline = 'middle'
  sctx.fillText('SMES 丙烯酸甲酯化工厂', 256, 50)
  const signTex = new THREE.CanvasTexture(signCanvas)
  signTex.colorSpace = THREE.SRGBColorSpace
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(7.6, 1.4),
    new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 }),
  )
  sign.position.set(-70, 4.3, 65)
  sign.rotation.y = Math.PI
  g.add(sign)

  // 界区警示标牌（黄底黑字"严禁烟火"）
  const warnCanvas = document.createElement('canvas')
  warnCanvas.width = 256
  warnCanvas.height = 256
  const wctx = warnCanvas.getContext('2d')!
  wctx.fillStyle = '#e8b820'
  wctx.fillRect(0, 0, 256, 256)
  wctx.strokeStyle = '#1c1e22'
  wctx.lineWidth = 14
  wctx.strokeRect(10, 10, 236, 236)
  wctx.fillStyle = '#1c1e22'
  wctx.font = 'bold 64px "Microsoft YaHei", sans-serif'
  wctx.textAlign = 'center'
  wctx.textBaseline = 'middle'
  wctx.fillText('严禁', 128, 96)
  wctx.fillText('烟火', 128, 168)
  const warnTex = new THREE.CanvasTexture(warnCanvas)
  warnTex.colorSpace = THREE.SRGBColorSpace
  const warnMat = new THREE.MeshStandardMaterial({ map: warnTex, roughness: 0.7 })
  for (const [x, z, ry] of [[-90, 65, Math.PI], [90, 65, Math.PI], [-105, -20, Math.PI / 2]] as const) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), steel)
    post.position.set(x, 1.1, z)
    g.add(post)
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), warnMat)
    panel.position.set(x, 2.0, z)
    panel.rotation.y = ry
    g.add(panel)
  }
  scene.add(g)
}

/** 道路路灯（黄昏灯火初上：暖光自发光灯头 + 局部 PointLight） */
function buildStreetLights(scene: THREE.Scene) {
  const g = new THREE.Group()
  const steel = structuralSteel()
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffc37a, emissive: 0xffb066, emissiveIntensity: 6, roughness: 0.4,
  })
  const xs = [-90, -60, -30, 0, 30, 60, 90]
  xs.forEach((x, i) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 6, 10), steel)
    pole.position.set(x, 3, -43.6)
    g.add(pole)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.09, 0.09), steel)
    arm.position.set(x, 5.95, -44.5)
    g.add(arm)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.3), lampMat)
    head.position.set(x, 5.9, -45.2)
    g.add(head)
    // 仅中央 3 盏挂真实光源（控制光源数量）
    if (i === 2 || i === 3 || i === 4) {
      const pl = new THREE.PointLight(0xffb066, 60, 30, 2)
      pl.position.set(x, 5.6, -45.2)
      g.add(pl)
    }
  })
  scene.add(g)
}

/** 罐区安全设施：喷淋环管 / 泡沫枪立柱 / 静电接地桩 / 防火堤警示牌 */
function buildTankFarmSafety(scene: THREE.Scene) {
  const g = new THREE.Group()
  const steel = machinedSteel()

  // 储罐喷淋环管（V-101 / V-102 罐壁高位）
  for (const x of [-55, -40]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.055, 8, 48), steel)
    ring.rotation.x = Math.PI / 2
    ring.position.set(x, 5.4, -32)
    g.add(ring)
    // 供水立管
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5.4, 8), steel)
    riser.position.set(x + 4.2, 2.7, -32)
    g.add(riser)
  }

  // 泡沫枪立柱（围堰四角，红色）
  const foamMat = paintedSteel(0xc23b2e)
  const foamPositions = [[-62, -26], [-33, -26], [47, -26], [63, -26]]
  for (const [x, z] of foamPositions) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.3, 10), foamMat)
    post.position.set(x, 0.65, z)
    g.add(post)
    const monitor = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.7, 10), foamMat)
    monitor.position.set(x, 1.45, z)
    monitor.rotation.x = -0.6
    g.add(monitor)
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 16), foamMat)
    wheel.position.set(x, 1.35, z + 0.18)
    g.add(wheel)
  }

  // 静电接地桩（罐旁黄黑小桩）
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xd8b422, roughness: 0.6 })
  for (const [x, z] of [[-50, -28], [-35, -28], [60, -27]] as const) {
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8), groundMat)
    stub.position.set(x, 0.3, z)
    g.add(stub)
  }

  // 防火堤警示牌（白底红字）
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#f2f0e8'
  ctx.fillRect(0, 0, 256, 128)
  ctx.strokeStyle = '#c23b2e'
  ctx.lineWidth = 8
  ctx.strokeRect(6, 6, 244, 116)
  ctx.fillStyle = '#c23b2e'
  ctx.font = 'bold 40px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('防火堤内', 128, 42)
  ctx.fillText('严禁烟火', 128, 88)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 })
  for (const [x, z] of [[-47.5, -38.4], [55, -40.4]] as const) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), signMat)
    panel.position.set(x, 1.35, z)
    panel.rotation.y = Math.PI
    g.add(panel)
  }

  // R5 灭火器箱（罐区围堰外道路侧，红色箱体 + 顶部灭火器）：安全设施完整性
  const extMat = paintedSteel(0xb0312a)
  const mkExtinguisher = (x: number, z: number, ry: number) => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.32), extMat)
    box.position.set(x, 0.4, z)
    box.rotation.y = ry
    g.add(box)
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.5, 10), extMat)
    bottle.position.set(x + Math.sin(ry) * 0.26, 1.05, z + Math.cos(ry) * 0.26)
    g.add(bottle)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.1), new THREE.MeshStandardMaterial({ color: 0x2e6e5e, roughness: 0.5 }))
    head.position.set(bottle.position.x, 1.35, bottle.position.z)
    g.add(head)
  }
  mkExtinguisher(-64, -21, -0.9)
  mkExtinguisher(-36, -18.5, -2.4)
  mkExtinguisher(58, -20.5, 2.2)
  scene.add(g)
}

/** 通用建筑体块：带屋顶、窗户带与基座（黄昏下窗户部分亮灯，窗户用 InstancedMesh 合并） */
function makeBuilding(w: number, h: number, d: number, wallColor: number, litRatio = 0.5): THREE.Group {
  const g = new THREE.Group()
  const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.85 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat)
  body.position.y = h / 2
  body.castShadow = true
  body.receiveShadow = true
  g.add(body)
  // 屋顶（深色女儿墙）
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.35, d + 0.4), new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.9 }))
  roof.position.y = h + 0.15
  g.add(roof)
  // 基座
  const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), new THREE.MeshStandardMaterial({ color: 0x6a6f74, roughness: 0.9 }))
  base.position.y = 0.25
  g.add(base)
  // 窗户带（前后立面，部分亮灯）—— InstancedMesh 合并，亮/暗各 1 个 DrawCall
  // v10 修复"白色光斑方块"：窗光 emissive 必须低于 bloom 阈值 5，否则任何一扇
  // 正对相机的窗都会糊成白色光团（v9 的 1.4 与 v10 曾调的 3.2 都超阈值）。
  // 窗光只需"可见的暖光"不需要光晕 → 1.6（低于阈值一半）
  const winLitMat = new THREE.MeshStandardMaterial({ color: 0x2a2f36, emissive: 0xffc37a, emissiveIntensity: 1.6, roughness: 0.4 })
  const winDarkMat = new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 0.5, metalness: 0.3 })
  const winGeo = new THREE.PlaneGeometry(1.6, 1.4)
  const floors = Math.max(1, Math.floor(h / 3.2))
  const cols = Math.max(2, Math.floor(w / 3))
  const litMtx: THREE.Matrix4[] = []
  const darkMtx: THREE.Matrix4[] = []
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const qFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
  const one = new THREE.Vector3(1, 1, 1)
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.random() < litRatio
      const x = -w / 2 + (c + 0.5) * (w / cols)
      const y = 1.8 + f * 3.2
      // 前立面
      ;(lit ? litMtx : darkMtx).push(m4.clone().compose(new THREE.Vector3(x, y, d / 2 + 0.02), q, one))
      // 后立面（翻转朝向）
      ;(lit ? litMtx : darkMtx).push(m4.clone().compose(new THREE.Vector3(x, y, -d / 2 - 0.02), qFlip, one))
    }
  }
  if (litMtx.length) {
    const litInst = new THREE.InstancedMesh(winGeo, winLitMat, litMtx.length)
    litMtx.forEach((mtx, i) => litInst.setMatrixAt(i, mtx))
    g.add(litInst)
  }
  if (darkMtx.length) {
    const darkInst = new THREE.InstancedMesh(winGeo, winDarkMat, darkMtx.length)
    darkMtx.forEach((mtx, i) => darkInst.setMatrixAt(i, mtx))
    g.add(darkInst)
  }
  return g
}

/** 中控楼（多层，带亮窗，厂区管理核心） */
function buildControlBuilding(scene: THREE.Scene) {
  const b = makeBuilding(20, 12, 14, 0x9aa2ac, 0.6)
  b.position.set(-88, 0, 30)
  // 楼顶天线
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), structuralSteel())
  ant.position.set(-88 + 6, 14.5, 30)
  scene.add(b, ant)
  // 楼顶标识牌
  const cv = document.createElement('canvas')
  cv.width = 512; cv.height = 96
  const c = cv.getContext('2d')!
  c.fillStyle = '#2e6e5e'; c.fillRect(0, 0, 512, 96)
  c.fillStyle = '#f2efe6'; c.font = 'bold 48px "Microsoft YaHei", sans-serif'
  c.textAlign = 'center'; c.textBaseline = 'middle'
  c.fillText('中央控制室', 256, 48)
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }))
  sign.position.set(-88, 13.5, 30 + 7.1)
  scene.add(sign)
}

/** 仓库/成品库（大跨度单层，卷帘门） */
function buildWarehouse(scene: THREE.Scene) {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a929c, roughness: 0.8 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(26, 8, 16), wallMat)
  body.position.set(88, 4, 30)
  body.castShadow = true; body.receiveShadow = true
  scene.add(body)
  // 双坡屋顶（三棱柱，屋脊沿 x 向，两端山墙封闭）
  const roofShape = new THREE.Shape()
  roofShape.moveTo(-8.4, 0)
  roofShape.lineTo(0, 3.2)
  roofShape.lineTo(8.4, 0)
  roofShape.closePath()
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 26.8, bevelEnabled: false })
  roofGeo.translate(0, 0, -13.4) // 沿挤出方向居中
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.85 }))
  roof.rotation.y = Math.PI / 2 // 挤出方向 → 世界 x（屋脊）
  roof.position.set(88, 8, 30)
  roof.castShadow = true
  scene.add(roof)
  // 卷帘门
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.7, metalness: 0.3 })
  for (const dx of [-7, 0, 7]) {
    const door = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 5), doorMat)
    door.position.set(88 + dx, 2.5, 30 + 8.02)
    scene.add(door)
  }
}

/** 变电所（小型，带散热格栅与绝缘子） */
function buildSubstation(scene: THREE.Scene) {
  const b = makeBuilding(10, 5, 8, 0x7d8590, 0.2)
  b.position.set(88, 0, -30)
  scene.add(b)
  // 绝缘子（陶瓷小柱）
  const insMat = new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 0.6 })
  for (let i = 0; i < 3; i++) {
    const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 8), insMat)
    ins.position.set(88 - 3 + i * 3, 5.6, -30)
    scene.add(ins)
  }
}

/** 门卫室（大门旁小房） */
function buildGuardHouse(scene: THREE.Scene) {
  const b = makeBuilding(5, 3.5, 4, 0xa8aeb6, 0.8)
  b.position.set(-62, 0, 60)
  scene.add(b)
}

/** 火炬塔（安全放空，顶端常燃小火苗）—— 返回火焰 mesh 供闪烁动画 */
function buildFlareStack(scene: THREE.Scene): THREE.Mesh {
  const g = new THREE.Group()
  const steel = structuralSteel()
  // 塔身（格构式简化为主柱+斜撑）
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 34, 12), steel)
  mast.position.y = 17
  mast.castShadow = true
  g.add(mast)
  // 顶部火炬头
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 2, 12), machinedSteel())
  tip.position.y = 34.5
  g.add(tip)
  // 火焰（自发光，HDR 亮度 9 —— 远超 bloom 阈值 5，光晕稳定不随抖动穿越阈值）
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.7, 2.4, 10),
    new THREE.MeshStandardMaterial({ color: 0xff8a3c, emissive: 0xff6a1e, emissiveIntensity: 9, transparent: true, opacity: 0.9 }),
  )
  flame.position.y = 36.5
  g.add(flame)
  // 拉索
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.6 })
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 26, 4), cableMat)
    cable.position.set(Math.cos(a) * 5, 13, Math.sin(a) * 5)
    cable.lookAt(new THREE.Vector3(0, 30, 0))
    cable.rotateX(Math.PI / 2)
    g.add(cable)
  }
  g.position.set(-95, 0, -40)
  scene.add(g)
  return flame
}

/** 火炬火焰闪烁（在渲染循环中调用）：火苗摇曳 + 亮度抖动
 *  v10 修复"闪烁 bug"：v1 的 9/23 rad/s 高频复合抖动让光晕在 bloom 阈值边缘反复
 *  穿越 → 火炬持续高频闪烁刺眼。改为低频摇曳（0.33/0.9 Hz），幅度收敛，光晕稳定 */
export function animateFlare(flame: THREE.Mesh, t: number) {
  const m = flame.material as THREE.MeshStandardMaterial
  // 低频呼吸式抖动（模拟燃烧不稳定，但不产生频闪）
  m.emissiveIntensity = 8.5 + Math.sin(t * 2.1) * 1.1 + Math.sin(t * 5.7) * 0.6
  // 火苗轻微摇曳（缩放 + 倾斜，低频）
  flame.scale.set(1 + Math.sin(t * 1.8) * 0.08, 1 + Math.sin(t * 2.6) * 0.1, 1 + Math.cos(t * 2.2) * 0.08)
  flame.rotation.z = Math.sin(t * 1.3) * 0.07
}

/** 蒸汽粒子（冷却塔动态水汽，循环上升/膨胀/淡出） */
export interface SteamPuff {
  mesh: THREE.Mesh
  baseX: number
  baseZ: number
  phase: number   // 0~1 循环相位
  speed: number   // 上升速度
  drift: number   // 水平飘移幅度
}

/** 冷却塔（双曲线自然通风塔，2 座）+ 动态蒸汽粒子 */
function buildCoolingTowers(scene: THREE.Scene): SteamPuff[] {
  const mat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.9 })
  const puffs: SteamPuff[] = []
  const puffGeo = new THREE.SphereGeometry(1, 12, 10)
  for (const [x, z] of [[-30, 52], [-14, 52]] as const) {
    // 双曲线近似：用 LatheGeometry
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= 20; i++) {
      const t = i / 20
      const y = t * 14
      const r = 5.5 - Math.sin(t * Math.PI) * 2.2 + t * 1.2
      pts.push(new THREE.Vector2(r, y))
    }
    const tower = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), mat)
    tower.position.set(x, 0, z)
    tower.castShadow = true
    scene.add(tower)
    // 每塔 5 颗蒸汽粒子，相位错开形成连续汽柱
    // R6：颜色 0xe8ecf0→0xded8cd（暖灰白，不再"刺眼白"）
    for (let i = 0; i < 5; i++) {
      const puffMat = new THREE.MeshStandardMaterial({
        color: 0xded8cd, transparent: true, opacity: 0, roughness: 1, depthWrite: false,
      })
      const puff = new THREE.Mesh(puffGeo, puffMat)
      puff.position.set(x, 14, z)
      scene.add(puff)
      puffs.push({
        mesh: puff, baseX: x, baseZ: z,
        phase: i / 5, speed: 0.55 + Math.random() * 0.2, drift: 1.2 + Math.random() * 1.4,
      })
    }
  }
  return puffs
}

/** 驱动蒸汽粒子动画（在渲染循环中调用）：上升→膨胀→淡出→循环
 *  R6：峰值透明度 0.4→0.24、膨胀上限 3.2→2.6 —— 柔和汽柱，不刺眼 */
export function animateSteam(puffs: SteamPuff[], t: number) {
  for (const p of puffs) {
    // 相位推进（0~1 循环）
    const u = (p.phase + t * p.speed * 0.12) % 1
    // 上升高度：塔顶 14 → 上方 12 米
    const rise = u * 12
    // 膨胀：随上升变大（1 → 2.6 倍）
    const scale = 1 + u * 1.6
    // 透明度：升起时淡入，到顶淡出（峰值 0.24）
    const alpha = u < 0.15 ? u / 0.15 : u > 0.7 ? (1 - u) / 0.3 : 1
    p.mesh.position.set(
      p.baseX + Math.sin(t * 0.6 + p.phase * 6.28) * p.drift * u,
      14 + rise,
      p.baseZ + Math.cos(t * 0.5 + p.phase * 6.28) * p.drift * u * 0.6,
    )
    p.mesh.scale.setScalar(scale)
    ;(p.mesh.material as THREE.MeshStandardMaterial).opacity = alpha * 0.24
  }
}

/** 停车场（车位线 + 几辆车） */
function buildParkingLot(scene: THREE.Scene) {
  const g = new THREE.Group()
  const pad = new THREE.Mesh(new THREE.BoxGeometry(24, 0.06, 14), new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.95 }))
  pad.position.set(30, 0.03, 58)
  g.add(pad)
  // 车位白线
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8d2c0, transparent: true, opacity: 0.7 })
  for (let i = 0; i <= 8; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 5), lineMat)
    line.rotation.x = -Math.PI / 2
    line.position.set(30 - 11 + i * 2.75, DECAL_Y.onPad, 58)
    g.add(line)
  }
  // 车辆（简化体块）
  const carColors = [0x3a6ea8, 0xc23b2e, 0xd8d3c8, 0x4a5058]
  for (let i = 0; i < 4; i++) {
    const car = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 4), new THREE.MeshStandardMaterial({ color: carColors[i], roughness: 0.4, metalness: 0.5 }))
    body.position.y = 0.55
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2), new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.3, metalness: 0.4 }))
    cabin.position.set(0, 1.1, -0.2)
    car.add(body, cabin)
    car.position.set(30 - 9.5 + i * 5.5, 0.06, 58)
    g.add(car)
  }
  scene.add(g)
}

/** 背景城区（远景楼群，雾中淡出，营造区位感）—— 共享材质 + 亮窗合并为单个 InstancedMesh；返回地标航空灯供闪烁动画 */
function buildBackgroundCity(scene: THREE.Scene): THREE.Mesh[] {
  const g = new THREE.Group()
  const cityBeacons: THREE.Mesh[] = []
  let seed = 42
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }

  // 共享墙体材质（5 种色调复用，避免每栋楼 new 一个）
  const wallPalette = [0x5a6068, 0x62686f, 0x4e545c, 0x6a6f76, 0x565c64].map(
    c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }),
  )
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.92 })
  const winLitMat = new THREE.MeshStandardMaterial({ color: 0x2a2f36, emissive: 0xffb066, emissiveIntensity: 1.2, roughness: 0.5 })

  // 收集所有亮窗矩阵，最后合并为单个 InstancedMesh（1 个 DrawCall）
  const winMtx: THREE.Matrix4[] = []
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const one = new THREE.Vector3(1, 1, 1)

  for (let i = 0; i < 30; i++) {
    const w = 6 + rnd() * 11
    const d = 6 + rnd() * 11
    // 高度分层：多数中低层 + 少数高层
    const tall = rnd() > 0.78
    const h = tall ? 26 + rnd() * 22 : 8 + rnd() * 18
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallPalette[Math.floor(rnd() * wallPalette.length)])
    const angle = rnd() * Math.PI * 2
    const dist = 175 + rnd() * 95
    const bx = Math.cos(angle) * dist
    const bz = Math.sin(angle) * dist
    b.position.set(bx, h / 2, bz)
    g.add(b)
    // 屋顶女儿墙
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5), roofMat)
    roof.position.set(bx, h + 0.2, bz)
    g.add(roof)
    // 窗光带（黄昏部分亮灯，收集矩阵）
    const litCount = Math.floor(h / 4)
    for (let f = 0; f < litCount; f++) {
      if (rnd() > 0.4) continue
      winMtx.push(m4.clone().compose(new THREE.Vector3(bx, 2.5 + f * 4, bz + d / 2 + 0.05), q, one))
    }
  }

  // 合并亮窗为单个 InstancedMesh
  if (winMtx.length) {
    const winGeo = new THREE.PlaneGeometry(4, 1.1)
    const winInst = new THREE.InstancedMesh(winGeo, winLitMat, winMtx.length)
    winMtx.forEach((mtx, i) => winInst.setMatrixAt(i, mtx))
    g.add(winInst)
  }

  // 地标高楼（2 栋，带顶部航空灯，收集供闪烁动画）
  for (const [dx, dz, h] of [[210, -60, 52], [-190, 120, 46]] as const) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(10, h, 10), wallPalette[2])
    tower.position.set(dx, h / 2, dz)
    g.add(tower)
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xff3333, emissiveIntensity: 5, roughness: 0.3 }),
    )
    beacon.position.set(dx, h + 1, dz)
    g.add(beacon)
    cityBeacons.push(beacon)
  }
  scene.add(g)
  return cityBeacons
}

/** 行政办公楼（玻璃幕墙高层，黄昏亮灯） */
function buildOfficeBuilding(scene: THREE.Scene) {
  const b = makeBuilding(16, 18, 12, 0x8a929c, 0.7)
  b.position.set(-88, 0, -10)
  scene.add(b)
  // 玻璃幕墙条（竖向，增强办公楼特征）
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x3a4858, roughness: 0.2, metalness: 0.6, emissive: 0x2a3848, emissiveIntensity: 0.4 })
  for (let i = 0; i < 4; i++) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 16), glassMat)
    strip.position.set(-88 - 6 + i * 4, 9, -10 + 6.02)
    scene.add(strip)
  }
}

/** 食堂/生活楼（矮层，暖色亮窗） */
function buildCanteen(scene: THREE.Scene) {
  const b = makeBuilding(14, 6, 10, 0xa8aeb6, 0.9)
  b.position.set(-60, 0, 40)
  scene.add(b)
}

/** 消防站（红色门，带消防栓） */
function buildFireStation(scene: THREE.Scene) {
  const b = makeBuilding(12, 5, 10, 0x9aa2ac, 0.3)
  b.position.set(60, 0, 48)
  scene.add(b)
  // 红色消防车库门
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.6, metalness: 0.2 })
  for (const dx of [-3, 3]) {
    const door = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), doorMat)
    door.position.set(60 + dx, 2, 48 + 5.02)
    scene.add(door)
  }
  // 消防栓
  const hydrant = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.7, 8), new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.5 }))
  hydrant.position.set(66, 0.35, 52)
  scene.add(hydrant)
}

/** 连接道路（主干道延伸到各配套建筑） */
function buildAccessRoads(scene: THREE.Scene) {
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.92 })
  // 通往中控楼/办公楼（西侧）
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(30, 0.05, 4), roadMat)
  r1.position.set(-75, 0.02, 10)
  scene.add(r1)
  // 通往仓库/消防站（东侧）
  const r2 = new THREE.Mesh(new THREE.BoxGeometry(30, 0.05, 4), roadMat)
  r2.position.set(75, 0.02, 38)
  scene.add(r2)
  // 通往停车场
  const r3 = new THREE.Mesh(new THREE.BoxGeometry(4, 0.05, 12), roadMat)
  r3.position.set(30, 0.02, 52)
  scene.add(r3)
}

/** 地坪伸缩缝网格（混凝土分缝线，深色细条，间距 10m） */
function buildGroundJoints(scene: THREE.Scene) {
  const g = new THREE.Group()
  const jointMat = new THREE.MeshBasicMaterial({ color: 0x3a3e42, transparent: true, opacity: 0.5 })
  // 横向缝（沿 x 方向，间距 10m，覆盖 -100~100）
  for (let x = -100; x <= 100; x += 10) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 138), jointMat)
    line.rotation.x = -Math.PI / 2
    line.position.set(x, DECAL_Y.onConcrete, 0)
    g.add(line)
  }
  // 纵向缝（沿 z 方向，间距 10m，覆盖 -65~65）
  for (let z = -60; z <= 60; z += 10) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(218, 0.15), jointMat)
    line.rotation.x = -Math.PI / 2
    line.position.set(0, DECAL_Y.onConcrete, z)
    g.add(line)
  }
  scene.add(g)
}

/** 地平线雾带（远处地面与天空过渡的暖色薄雾，贴地大平面） */
function buildHorizonHaze(scene: THREE.Scene) {
  const hazeMat = new THREE.MeshBasicMaterial({
    color: 0xf0b27a, transparent: true, opacity: 0.16, fog: false, depthWrite: false,
  })
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(700, 40), hazeMat)
  haze.rotation.x = -Math.PI / 2
  haze.position.set(0, 1.5, -260)
  scene.add(haze)
  // R4 太阳方位侧暖光带：位于相机朝向侧（+z，设备群之后的可见地平线），
  // 沿太阳方位（-x）偏移中心，含量收敛 —— 天际线亮度梯度有"夕照指向性"
  const sunBandMat = new THREE.MeshBasicMaterial({
    color: 0xffb066, transparent: true, opacity: 0.16, fog: false, depthWrite: false,
  })
  const band = new THREE.Mesh(new THREE.PlaneGeometry(760, 46), sunBandMat)
  band.rotation.x = -Math.PI / 2
  band.position.set(-35, 1.8, 262)
  scene.add(band)
}

/** 安全黄色标线：设备警戒区方框 + 斑马线 + 道路导向箭头（化工厂标志性安全视觉） */
function buildSafetyMarkings(scene: THREE.Scene) {
  const g = new THREE.Group()
  const yellow = new THREE.MeshBasicMaterial({ color: 0xe8c222, transparent: true, opacity: 0.85 })

  // 设备警戒区方框（围绕主要设备区，四边黄线）
  const mkFrame = (cx: number, cz: number, w: number, d: number) => {
    const t = 0.35 // 线宽
    const mkBar = (bw: number, bd: number, x: number, z: number) => {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(bw, bd), yellow)
      bar.rotation.x = -Math.PI / 2
      bar.position.set(x, DECAL_Y.onConcrete, z)
      g.add(bar)
    }
    mkBar(w, t, cx, cz - d / 2) // 前
    mkBar(w, t, cx, cz + d / 2) // 后
    mkBar(t, d, cx - w / 2, cz) // 左
    mkBar(t, d, cx + w / 2, cz) // 右
  }
  mkFrame(-26, 18, 26, 22)  // 反应区
  mkFrame(10, 22, 22, 26)   // 塔区
  mkFrame(-47, -30, 30, 16) // 罐区
  mkFrame(55, -32, 20, 20)  // 球罐区

  // 斑马线（主路十字交叉口，白色横条）
  const white = new THREE.MeshBasicMaterial({ color: 0xd8d2c0, transparent: true, opacity: 0.8 })
  for (let i = 0; i < 6; i++) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 4.5), white)
    stripe.rotation.x = -Math.PI / 2
    stripe.position.set(-70 - 2.6 + i * 1.1, DECAL_Y.onRoad, -48)
    g.add(stripe)
  }

  // 道路导向箭头（主路，指向大门方向）
  const mkArrow = (x: number, z: number, rotY: number) => {
    const shape = new THREE.Shape()
    shape.moveTo(0, 1.2)
    shape.lineTo(0.7, 0)
    shape.lineTo(0.25, 0)
    shape.lineTo(0.25, -1.2)
    shape.lineTo(-0.25, -1.2)
    shape.lineTo(-0.25, 0)
    shape.lineTo(-0.7, 0)
    shape.closePath()
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), yellow)
    arrow.rotation.x = -Math.PI / 2
    arrow.rotation.z = rotY
    arrow.position.set(x, DECAL_Y.onConcrete, z)
    g.add(arrow)
  }
  mkArrow(-20, -48, 0)
  mkArrow(20, -48, 0)
  mkArrow(-70, 20, Math.PI / 2)
  mkArrow(70, 20, Math.PI / 2)

  scene.add(g)
}

/** 动态警示灯：火炬塔航空障碍灯 + 塔顶信标（红色闪烁，在 loop 中驱动） */
export function buildWarningLights(scene: THREE.Scene): THREE.Mesh[] {
  const lights: THREE.Mesh[] = []
  const mkBeacon = (x: number, y: number, z: number) => {
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2.5, roughness: 0.3 }),
    )
    beacon.position.set(x, y, z)
    beacon.userData.isBeacon = true
    scene.add(beacon)
    lights.push(beacon)
  }
  // 火炬塔顶航空障碍灯
  mkBeacon(-95, 37.5, -40)
  // 两座精馏塔顶信标
  mkBeacon(6, 26, 22)
  mkBeacon(16, 22, 22)
  return lights
}

// ── 地面贴花高度规范（v10 修复 z-fighting 闪烁）──
// 相机 near=0.5/far=1500 时，200m 外深度分辨率 ~0.7cm；贴花悬浮高度必须 ≥3cm
// 才能保证拉远视角（~300m）下不出现深度抖动闪烁。所有地面贴花统一从此取高度。
export const DECAL_Y = {
  onConcrete: 0.035,  // 地坪上的贴花（油渍/伸缩缝/警戒线/箭头）
  onRoad: 0.075,      // 路面上的标线（路面顶 0.045 + 3cm）
  onPad: 0.09,        // 停车场位线（pad 顶 0.06 + 3cm）
} as const

/** 体积夕阳光柱已移除：原"加法混合半透明长平面"是屏幕空间假象，
 *  与物理天空亮度不一致、无深度遮挡、边缘生硬（基线截图中白色斜条）。
 *  后续迭代可用 raymarch 体积光或 Postprocessing GodRays 替代 */

/** 尘埃软点纹理（径向渐变 → 柔圆光斑）。
 *  R6 闪烁修复：原方形点精灵（PointsMaterial 无贴图）在亚像素尺度漂移时
 *  硬边跳像素 → 屏幕上"刺眼白点持续闪烁"（射线反投影实测命中该 Points）。
 *  柔圆纹理 + 降低 opacity + 收敛漂移 → 变成低噪"浮尘光斑"，不再闪 */
function dustSpriteTexture(): THREE.CanvasTexture {
  const key = 'dustSprite'
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(canvas)
  return tex
}

/** 尘埃粒子场（承接夕阳光柱的浮尘，缓慢漂移）
 *  R6：count 160→120、size 0.16→0.34、opacity 0.45→0.3、
 *  色相 0xffd9a0→0xecc99a（暖金尘，不再"刺眼白"）+ 柔圆光斑贴图 */
let dustSpriteCache: THREE.CanvasTexture | null = null
function buildDustField(scene: THREE.Scene): THREE.Points {
  const N = 120
  const pos = new Float32Array(N * 3)
  let seed = 1234
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  for (let i = 0; i < N; i++) {
    pos[i * 3] = -60 + rnd() * 120
    pos[i * 3 + 1] = 2 + rnd() * 30
    pos[i * 3 + 2] = -45 + rnd() * 90
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  if (!dustSpriteCache) dustSpriteCache = dustSpriteTexture()
  const mat = new THREE.PointsMaterial({
    color: 0xecc99a, size: 0.34, transparent: true, opacity: 0.3,
    map: dustSpriteCache, alphaTest: 0.02,
    sizeAttenuation: true, depthWrite: false,
  })
  const pts = new THREE.Points(geo, mat)
  scene.add(pts)
  return pts
}

/** 驱动尘埃漂移（渲染循环调用）：整体缓慢摆动 + 起伏
 *  R6：摆幅收敛（闪烁修复：位移幅度与亚像素抖动正相关） */
export function animateDust(dust: THREE.Points, t: number) {
  dust.rotation.y = Math.sin(t * 0.05) * 0.03
  dust.position.y = Math.sin(t * 0.25) * 0.3
  dust.position.x = Math.sin(t * 0.08) * 0.6
}

/** 地面油渍贴花纹理（不规则径向渐变暗斑，边缘透明） */
function stainTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const blob = (x: number, y: number, r: number, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(38,40,44,${a})`)
    g.addColorStop(0.65, `rgba(42,44,48,${a * 0.55})`)
    g.addColorStop(1, 'rgba(42,44,48,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  }
  // 多块叠加形成不规则油渍形状
  blob(64, 64, 58, 0.55)
  blob(40, 50, 30, 0.4)
  blob(88, 80, 26, 0.4)
  blob(70, 36, 20, 0.35)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 地面油渍/污渍贴花（设备周边作业区，共享纹理+单位平面，仅缩放旋转） */
function buildGroundStains(scene: THREE.Scene) {
  const mat = new THREE.MeshBasicMaterial({ map: stainTexture(), transparent: true, depthWrite: false, opacity: 0.8 })
  const unit = new THREE.PlaneGeometry(1, 1)
  let seed = 2026
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  // 高频作业区：反应区/罐区/球罐/塔区/消防站前等（避开道路沥青面）
  const hotspots: [number, number][] = [
    [-26, 18], [-47, -30], [55, -32], [10, 22],
    [-55, -32], [-38, -16], [42, 8], [60, 44],
  ]
  for (const [hx, hz] of hotspots) {
    const n = 2 + Math.floor(rnd() * 2)
    for (let i = 0; i < n; i++) {
      const s = 1.6 + rnd() * 3.4
      const stain = new THREE.Mesh(unit, mat)
      stain.rotation.x = -Math.PI / 2
      stain.rotation.z = rnd() * Math.PI * 2
      stain.scale.setScalar(s)
      stain.position.set(hx + (rnd() - 0.5) * 9, DECAL_Y.onConcrete, hz + (rnd() - 0.5) * 9)
      scene.add(stain)
    }
  }
}

/** 落日光晕已由物理天空渲染（Preetham 米氏散射自带太阳圆盘与光晕），假圆盘移除 */

/** 云层（R3：双层——暖亮云带 + 深灰暗云，黄昏天空纵深） */
function buildClouds(scene: THREE.Scene): THREE.Group {
  const cloudGroup = new THREE.Group()
  // A 层：夕照暖云（亮）
  const cloudMatA = new THREE.MeshBasicMaterial({ color: 0xf0b27a, transparent: true, opacity: 0.16, fog: false })
  // B 层：深灰暗云（对比层，压出云隙亮边）
  const cloudMatB = new THREE.MeshBasicMaterial({ color: 0x544e4a, transparent: true, opacity: 0.13, fog: false })
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  for (let i = 0; i < 8; i++) {
    const w = 40 + rnd() * 60
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(w, 8 + rnd() * 6), cloudMatA)
    const angle = rnd() * Math.PI * 2
    const dist = 200 + rnd() * 120
    cloud.position.set(Math.cos(angle) * dist, 90 + rnd() * 50, Math.sin(angle) * dist)
    cloud.lookAt(0, 60, 0)
    cloudGroup.add(cloud)
  }
  // B 层暗云（数量少、更散、偏高，缓慢对照）
  for (let i = 0; i < 5; i++) {
    const w = 50 + rnd() * 70
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(w, 10 + rnd() * 8), cloudMatB)
    const angle = rnd() * Math.PI * 2
    const dist = 230 + rnd() * 110
    cloud.position.set(Math.cos(angle) * dist, 110 + rnd() * 45, Math.sin(angle) * dist)
    cloud.lookAt(0, 60, 0)
    cloudGroup.add(cloud)
  }
  scene.add(cloudGroup)
  return cloudGroup
}

/** 驱动云层缓慢漂移（渲染循环调用）：整体绕场心慢转 + 轻微起伏 */
export function animateClouds(clouds: THREE.Group, t: number) {
  clouds.rotation.y = t * 0.004
  clouds.position.y = Math.sin(t * 0.1) * 1.2
}

/** 驱动地标高楼航空灯闪烁（渲染循环调用）：相位错开的红色呼吸
 *  v11 闪烁修复：v10 的 2.8~6.4 横跳 bloom 阈值 5 → 光晕忽大忽小（截帧定位的
 *  屏幕左/右侧高频闪烁块）。改为 5.4~7.2 全程高于阈值 → 光晕常驻平滑呼吸 */
export function animateCityBeacons(beacons: THREE.Mesh[], t: number) {
  for (let i = 0; i < beacons.length; i++) {
    const m = beacons[i].material as THREE.MeshStandardMaterial
    m.emissiveIntensity = 5.4 + 1.8 * Math.max(0, Math.sin(t * 1.1 + i * 2.6))
  }
}

/**
 * 装置环境 v9 入口：物理天空 + 黄昏照明 + 大气雾 + 地坪/道路/围堰/管廊
 * + 道路细节/厂界围栏/路灯/罐区安全设施 + 剪影绿化
 * + 周边配套：中控楼/仓库/变电所/门卫/火炬塔/冷却塔/停车场/背景城区
 * + 行政办公/食堂/消防站/连接道路 + 云层
 */
export function buildEnvironment(scene: THREE.Scene, renderer?: THREE.WebGLRenderer, weak = false): { steamPuffs: SteamPuff[], flame: THREE.Mesh, dust: THREE.Points | null, clouds: THREE.Group, cityBeacons: THREE.Mesh[] } {
  // ── 物理天空 + IBL（环境反射直接烘焙自天空，与可见背景物理一致） ──
  if (renderer) buildPhysicalSky(scene, renderer)

  // ── 大气雾：色相对齐物理天空地平线均值（暖灰橙），弱化"远景染色"强度 ──
  // v10：near/far 前移 —— 雾需可感知才有纵深（v9 的 300/950 几乎不可见）
  scene.fog = new THREE.Fog(0xb5886a, 160, 780)

  // ── 外部大地面（厂区外土地，承接背景城区，避免地平线穿帮） ──
  const outerGround = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshStandardMaterial({ color: 0x4a4d4a, roughness: 0.98 }),
  )
  outerGround.rotation.x = -Math.PI / 2
  outerGround.position.y = -0.32
  outerGround.receiveShadow = true
  scene.add(outerGround)

  // ── 地坪 ──
  const ground = new THREE.Mesh(new THREE.BoxGeometry(220, 0.4, 140), concrete())
  ground.position.y = -0.2
  ground.receiveShadow = true
  scene.add(ground)

  // ── 地坪伸缩缝网格（真实混凝土分缝，破除"整块塑料板"感） ──
  buildGroundJoints(scene)

  // ── 主道路（十字，中灰沥青不发黑） ──
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.92 })
  const roadH = new THREE.Mesh(new THREE.BoxGeometry(220, 0.05, 6), roadMat)
  roadH.position.set(0, 0.02, -48)
  scene.add(roadH)
  const roadV = new THREE.Mesh(new THREE.BoxGeometry(6, 0.05, 140), roadMat)
  roadV.position.set(-70, 0.02, 0)
  scene.add(roadV)
  const roadV2 = roadV.clone(); roadV2.position.x = 70
  scene.add(roadV2)

  // ── 罐区围堰 ──
  const dikeMat = new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.9 })
  const dike = new THREE.Group()
  const dw = 1, dh = 0.8
  const mk = (w: number, d: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, dh, d), dikeMat)
    m.position.set(x, dh / 2, z)
    dike.add(m)
  }
  // 丙烯酸+甲醇罐围堰
  mk(34, dw, -47.5, -25); mk(34, dw, -47.5, -39); mk(dw, 15, -63.5, -32); mk(dw, 15, -31.5, -32)
  // 球罐围堰
  mk(20, dw, 55, -23); mk(20, dw, 55, -41); mk(dw, 19, 46, -32); mk(dw, 19, 64, -32)
  scene.add(dike)

  // ── 管廊（东西向 z=-6 与 z=28 两道，三层结构） ──
  const rack = new THREE.Group()
  const mkRack = (z: number, x0: number, x1: number) => {
    const bays = Math.floor((x1 - x0) / 8)
    for (let i = 0; i <= bays; i++) {
      const x = x0 + i * 8
      for (const s of [-1, 1]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.4), structuralSteel())
        col.position.set(x, 3.5, z + s * 2)
        rack.add(col)
      }
    }
    for (const y of [3, 5.5, 7]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.3, 0.3), structuralSteel())
      beam.position.set((x0 + x1) / 2, y, z - 2)
      rack.add(beam)
      const beam2 = beam.clone(); beam2.position.z = z + 2
      rack.add(beam2)
      if (y < 7) {
        const cross = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.15, 4), structuralSteel())
        cross.position.set((x0 + x1) / 2, y + 0.2, z)
        rack.add(cross)
      }
    }
    // R5 电缆桥架：顶层横梁上方两侧各一条纵向电缆槽 + 每 8m 一道托架横撑
    // （工艺厂管廊"密而不乱"的标准细节：桥架与工艺管线分层敷设）
    const tray = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.06, 0.5), structuralSteel())
    tray.position.set((x0 + x1) / 2, 7.85, z - 1.55)
    rack.add(tray)
    const tray2 = tray.clone(); tray2.position.z = z + 1.55
    rack.add(tray2)
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 4.4), structuralSteel())
    for (let i = 0; i <= bays - 1; i++) {
      const b = bracket.clone()
      b.position.set(x0 + (i + 0.5) * 8, 7.6, z)
      rack.add(b)
    }
  }
  mkRack(-6, -60, 30)   // 主管廊（罐区↔反应区）
  mkRack(28, 15, 45)    // 塔区↔球罐支廊
  scene.add(rack)

  // ── 黄昏照明（与物理天空太阳方向严格对齐）──
  // v10 光比重构：核心是"恢复明暗比"。v9 直射 4.6 + 补光 0.7 + IBL 0.55 把暗部填满，
  // 全画面灰白无对比（= 劣质感蒙板）；现在压补光、保直射，让阴影沉下去。
  // IBL（scene.environment）已提供基础天光漫反射，半球光只做低强度方向性补正
  scene.add(new THREE.HemisphereLight(0x8fa2c8, 0xe0a070, 0.18))

  // 落日主光：方向 = SUN_DIRECTION（天空太阳/影子/高光三者自洽）
  const sun = new THREE.DirectionalLight(0xffd2a0, 3.4)
  sun.position.copy(SUN_DIRECTION).multiplyScalar(160)
  sun.castShadow = true
  sun.shadow.mapSize.set(4096, 4096)
  sun.shadow.radius = 4 // 落日柔和长影
  // v11 阴影相机收紧 ~15%：原 ±150/120/-140 覆盖 300m 摊薄阴影贴图（13.6px/m），
  // 收紧后 ~255m → 纹素密度 +17%（设备区阴影更锐利）。需保留长影方向（+x/-z）
  // 与厂界（±105）余量：left/right 115、top 100、bottom -120
  sun.shadow.camera.left = -115; sun.shadow.camera.right = 115
  sun.shadow.camera.top = 100; sun.shadow.camera.bottom = -120
  sun.shadow.camera.far = 500
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.02 // 低角度光防自遮挡痤疮
  scene.add(sun)

  // 冷蓝补光（天光反射，提亮背光面与地面阴影区，避免死黑）——只补不填
  // R3：0.22 → 0.26（配合体积光，暗部略提但保持明暗比）
  const fill = new THREE.DirectionalLight(0x9db2d8, 0.26)
  fill.position.set(50, 70, 60)
  scene.add(fill)

  // 暖轮廓光（rim，主光反向，勾边分离主体与背景）
  // R3：0.55 → 0.72（逆光剪影边缘更亮，冷暖对照更鲜明，锚定 "逆光电影光型"）
  const rim = new THREE.DirectionalLight(0xffb37a, 0.72)
  rim.position.set(110, 38, -85)
  scene.add(rim)

  // R3 次级阴影：与主太阳同方向的小范围 2048² 影子光，仅覆盖核心装置区（±50m）。
  // 主太阳 4096² ±115m ≈ 17.8px/m；核心层 2048² ±50m ≈ 41px/m（密度 2.3×）。
  // 方向严格一致 → 双层阴影完全重合（只是近场边缘更锐），近景塔/反应器落影更密实
  const core = new THREE.DirectionalLight(0xffd2a0, 0)
  core.position.copy(SUN_DIRECTION).multiplyScalar(160)
  core.castShadow = true
  core.shadow.mapSize.set(2048, 2048)
  core.shadow.radius = 4
  core.shadow.camera.left = -50; core.shadow.camera.right = 50
  core.shadow.camera.top = 50; core.shadow.camera.bottom = -50
  core.shadow.camera.near = 1; core.shadow.camera.far = 260
  core.shadow.bias = -0.0004
  core.shadow.normalBias = 0.02
  scene.add(core)

  // ── 场景细节（S4） ──
  buildRoadDetails(scene)
  buildFence(scene)
  buildStreetLights(scene)
  buildTankFarmSafety(scene)

  // ── 周边配套建筑（完整厂区） ──
  buildControlBuilding(scene)
  buildWarehouse(scene)
  buildSubstation(scene)
  buildGuardHouse(scene)
  const flame = buildFlareStack(scene)
  const steamPuffs = buildCoolingTowers(scene)
  buildParkingLot(scene)
  const cityBeacons = buildBackgroundCity(scene)
  buildOfficeBuilding(scene)
  buildCanteen(scene)
  buildFireStation(scene)
  buildAccessRoads(scene)

  // ── 安全标线（黄色警戒区/斑马线/导向箭头） ──
  buildSafetyMarkings(scene)

  // ── 天空氛围（太阳圆盘/光晕已由物理天空承担） ──
  const clouds = buildClouds(scene)
  buildHorizonHaze(scene)

  // ── 厂区绿化（黄昏剪影） ──
  buildVegetation(scene)
  // R2 厂界/道路灌木带（分区界面 + 地面过渡）
  buildShrubBands(scene)

  // ── 地面油渍贴花（作业区使用痕迹） ──
  buildGroundStains(scene)

  // ── 体积氛围（弱机自动关闭）：假光柱已移除，仅保留浮尘（承接天空光晕仍有氛围价值） ──
  let dust: THREE.Points | null = null
  if (!weak) {
    dust = buildDustField(scene)
  }

  return { steamPuffs, flame, dust, clouds, cityBeacons }
}
