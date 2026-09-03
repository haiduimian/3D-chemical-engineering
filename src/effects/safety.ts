import * as THREE from 'three'

/**
 * 安全特效库 —— 气体泄漏粒子 / 火焰粒子 / 危险区域色块
 * 教学演示级物理近似：泄漏用简化高斯扩散，火焰用粒子上浮 + 光闪烁
 */

// ── 气体泄漏（THREE.Points，简化高斯扩散 + 风向偏移） ──
export class LeakEffect {
  points: THREE.Points
  private positions: Float32Array
  private velocities: Float32Array
  private ages: Float32Array
  private lifetime = 4
  private wind = new THREE.Vector3(0.35, 0, 0.15)
  private material: THREE.PointsMaterial

  constructor(origin: THREE.Vector3, count = 280, color = 0xffe082) {
    const geometry = new THREE.BufferGeometry()
    this.positions = new Float32Array(count * 3)
    this.velocities = new Float32Array(count * 3)
    this.ages = new Float32Array(count)
    for (let i = 0; i < count; i++) this.reset(i, true)
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.material = new THREE.PointsMaterial({
      color, size: 0.24, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    })
    this.points = new THREE.Points(geometry, this.material)
    this.points.frustumCulled = false
    this.points.position.copy(origin)
  }

  private reset(i: number, initial = false) {
    const a = Math.random() * Math.PI * 2
    const up = 0.6 + Math.random() * 1.4
    this.positions[i * 3] = 0
    this.positions[i * 3 + 1] = 0
    this.positions[i * 3 + 2] = 0
    this.velocities[i * 3] = Math.cos(a) * 0.4 + this.wind.x
    this.velocities[i * 3 + 1] = up * 0.55
    this.velocities[i * 3 + 2] = Math.sin(a) * 0.4 + this.wind.z
    this.ages[i] = initial ? Math.random() * this.lifetime : 0
  }

  update(dt: number) {
    const n = this.ages.length
    for (let i = 0; i < n; i++) {
      this.ages[i] += dt
      if (this.ages[i] > this.lifetime) this.reset(i)
      this.positions[i * 3] += this.velocities[i * 3] * dt
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt
      // 微风扰动
      const a = Math.sin(this.ages[i] * 2 + i) * 0.08
      this.positions[i * 3] += a * dt
      this.positions[i * 3 + 2] += Math.cos(this.ages[i] * 2 + i) * 0.08 * dt
    }
    ;(this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
    // 渐隐
    this.material.opacity = 0.75
  }
}

// ── 火焰（粒子上浮 + 点光闪烁） ──
export class FireEffect {
  group: THREE.Group
  private particles: THREE.Points
  private positions: Float32Array
  private ages: Float32Array
  private light: THREE.PointLight
  private baseY: number
  private t = 0

  constructor(origin: THREE.Vector3, scale = 1, count = 160) {
    this.group = new THREE.Group()
    this.group.position.copy(origin)
    this.baseY = origin.y
    const geometry = new THREE.BufferGeometry()
    this.positions = new Float32Array(count * 3)
    this.ages = new Float32Array(count)
    for (let i = 0; i < count; i++) this.reset(i, true)
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.particles = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: 0xff7722, size: 0.55 * scale, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }))
    this.particles.frustumCulled = false
    this.group.add(this.particles)
    this.light = new THREE.PointLight(0xff7a2a, 40, 30, 1.8)
    this.light.position.y = 2 * scale
    this.group.add(this.light)
  }

  private reset(i: number, initial = false) {
    const a = Math.random() * Math.PI * 2
    const r = Math.random() * 0.5
    this.positions[i * 3] = Math.cos(a) * r
    this.positions[i * 3 + 1] = 0
    this.positions[i * 3 + 2] = Math.sin(a) * r
    this.ages[i] = initial ? Math.random() * 2.2 : 0
  }

  update(dt: number, t: number) {
    this.t = t
    const n = this.ages.length
    for (let i = 0; i < n; i++) {
      this.ages[i] += dt
      if (this.ages[i] > 2.2) this.reset(i)
      const life = this.ages[i]
      this.positions[i * 3] += Math.sin(life * 6 + i) * 0.05 * dt
      this.positions[i * 3 + 1] += (0.9 + life * 0.6) * dt
      this.positions[i * 3 + 2] += Math.cos(life * 5 + i) * 0.05 * dt
    }
    ;(this.particles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
    // 光强闪烁
    this.light.intensity = 30 + Math.sin(t * 9) * 10 + Math.random() * 6
  }
}

// ── 危险区域（半透明风险色块，教学示意） ──
export function buildHazardZones(): THREE.Group {
  const g = new THREE.Group()
  const mkZone = (x: number, z: number, r: number, h: number, color: number, label: string) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 40, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }),
    )
    mesh.position.set(x, h / 2, z)
    g.add(mesh)
    // 底环描边
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.15, r, 40), new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide,
    }))
    ring.rotation.x = -Math.PI / 2
    ring.position.set(x, 0.06, z)
    g.add(ring)
    mesh.userData.label = label
    return mesh
  }
  // 罐区（丙烯酸/甲醇 易燃）：红色
  mkZone(-47.5, -32, 20, 7, 0xff4444, '罐区·易燃')
  // 塔区（高温高压）：橙色
  mkZone(10, 22, 20, 9, 0xff8c2a, '塔区·高温')
  // 反应区（带压反应）：黄色
  mkZone(-24, 18, 12, 6, 0xffd42a, '反应区·带压')
  // 球罐（高压）：红色
  mkZone(55, -32, 10, 5, 0xff4444, '球罐·高压')
  return g
}
