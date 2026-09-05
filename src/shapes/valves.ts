import * as THREE from 'three'
import { valveGray, machinedSteel, paintedSteel, lampGlass } from '../materials/pbr'

/**
 * 工艺阀门模型 —— 立式闸阀（阀体 + 阀杆 + 手轮 + 状态指示灯）
 * setOpen(ratio) 驱动：手轮旋转角度 = 开度；指示灯颜色 = 开度区间
 */
export interface BuiltValve {
  group: THREE.Group
  wheel: THREE.Mesh
  indicator: THREE.Mesh
  setOpen: (ratio: number) => void
}

export function buildValve(diameter: number): BuiltValve {
  const g = new THREE.Group()
  const d = Math.max(0.25, diameter)

  // 阀体（短圆柱，轴向沿 X —— 管线水平走向）
  const body = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.85, d * 0.85, d * 1.15, 16), valveGray())
  body.rotation.z = Math.PI / 2
  g.add(body)
  // 阀体两端连接法兰环
  for (const s of [-1, 1]) {
    const fr = new THREE.Mesh(new THREE.TorusGeometry(d * 0.9, d * 0.16, 8, 18), machinedSteel())
    fr.position.x = s * d * 0.55
    g.add(fr)
  }
  // 阀杆
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.09, d * 0.13, d * 0.85, 10), machinedSteel())
  stem.position.y = d * 0.72
  g.add(stem)
  // 手轮（开度动画旋转轴为 Y）
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(d * 0.55, d * 0.08, 8, 22), paintedSteel(0x4a5560))
  wheel.position.y = d * 0.72 + d * 0.3
  g.add(wheel)
  // 手轮辐条
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.02, d * 0.02, d * 0.9, 6), machinedSteel())
    spoke.position.set(Math.cos(a) * d * 0.4, d * 0.72 + d * 0.3, Math.sin(a) * d * 0.4)
    spoke.rotation.z = -a
    g.add(spoke)
  }
  // 状态指示灯（R2：克隆材质 —— 原共享 lampGlass(0x37c871) 与设备灯同实例，
  // setOpen 改色会串扰全厂其它阀门/设备灯；每个阀门独立一份）
  const indicatorMat = (lampGlass(0x37c871) as THREE.MeshStandardMaterial).clone()
  const indicator = new THREE.Mesh(new THREE.SphereGeometry(d * 0.11, 8, 6), indicatorMat)
  indicator.position.y = d * 1.15
  g.add(indicator)
  indicator.userData.isLamp = true

  const setOpen = (ratio: number) => {
    wheel.rotation.y = ratio * Math.PI * 1.5
    const c = ratio >= 0.95 ? 0x37c871 : ratio >= 0.05 ? 0xf0b429 : 0xe24b4a
    const m = indicator.material as THREE.MeshStandardMaterial
    m.color.set(c)
    m.emissive.set(c)
    m.emissiveIntensity = 1.8
  }

  return { group: g, wheel, indicator, setOpen }
}
