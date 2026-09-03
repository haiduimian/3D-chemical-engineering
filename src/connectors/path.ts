import * as THREE from 'three'
import { portEnd } from '../layout/ports'
import type { PipeDef } from '../layout/plantLayout'

/**
 * 管线路径解析器 v2 —— 端口引用 → 世界坐标折线
 * 布线规则（横平竖直、L 形走线、分层走线）：
 *   起点端口 → (垂直升降到 viaY 高度层) → 水平段（先 x 后 z 的 L 形，可经泵串接 / 途经点）→ (垂直升降) → 终点端口
 * 泵串接：管线先水平到泵入口上方 → 垂直下降进泵 → 泵顶出口 → 垂直回升到高度层
 * 全程无斜线、无折返，弯头统一由 roundedPolyline 处理（可调半径，工程 R≈3D）
 */

export function resolvePipePath(def: PipeDef): THREE.Vector3[] {
  const viaY = def.viaY ?? 6
  const pts: THREE.Vector3[] = []

  const push = (x: number, y: number, z: number) => {
    const last = pts[pts.length - 1]
    if (last && Math.abs(last.x - x) < 1e-3 && Math.abs(last.y - y) < 1e-3 && Math.abs(last.z - z) < 1e-3) return
    pts.push(new THREE.Vector3(x, y, z))
  }

  const P0 = portEnd(def.from, 0.5)
  const P1 = portEnd(def.to, 0.5)

  push(P0.x, P0.y, P0.z)
  if (Math.abs(P0.y - viaY) > 0.05) push(P0.x, viaY, P0.z)

  for (const v of def.via ?? []) {
    if (v.pump) {
      // 串接泵：L 形到泵入口 → 进泵 → 泵顶出口 →（非终点时）回升高度层
      const base = v.pump.replace('P-', 'P')
      const pin = portEnd(`${base}-IN`, 0.3)
      const pout = portEnd(`${base}-OUT`, 0.3)
      const cur = pts[pts.length - 1]
      push(pin.x, cur.y, cur.z)
      push(pin.x, cur.y, pin.z)
      push(pin.x, pin.y, pin.z)
      push(pout.x, pout.y, pout.z)
      // 若管线终点就是该泵出口（如 pipe-hq-main），直接接终点，避免"升上去又降下来"折返
      if (`${base}-OUT` !== def.to) push(pout.x, viaY, pout.z)
    } else {
      // 强制途经点（L 形：先 x 后 z）
      const cur = pts[pts.length - 1]
      const tx = v.x !== undefined ? v.x : cur.x
      const tz = v.z !== undefined ? v.z : cur.z
      const ty = v.y !== undefined ? v.y : viaY
      push(tx, ty, cur.z)
      push(tx, ty, tz)
    }
  }

  // 终点：L 形水平段 → 垂直段
  const cur = pts[pts.length - 1]
  push(P1.x, cur.y, cur.z)
  push(P1.x, cur.y, P1.z)
  push(P1.x, P1.y, P1.z)
  return pts
}

/**
 * 折线圆角化 —— 在每个拐角处插入圆弧（半径 r，工程弯头 R=1.5~3D）
 * 保证弯头平滑、受力合理，避免 CatmullRom 振荡
 */
export function roundedPolyline(pts: THREE.Vector3[], r = 1.2): THREE.Vector3[] {
  if (pts.length < 3) return pts.slice()
  const out: THREE.Vector3[] = [pts[0].clone()]
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1]
    const d1 = p1.clone().sub(p0), d2 = p2.clone().sub(p1)
    const l1 = d1.length(), l2 = d2.length()
    if (l1 < 1e-4 || l2 < 1e-4) { out.push(p1.clone()); continue }
    const u1 = d1.clone().normalize(), u2 = d2.clone().normalize()
    const cosA = Math.max(-1, Math.min(1, u1.dot(u2)))
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA))
    if (sinA < 1e-3) { out.push(p1.clone()); continue } // 共线直行
    // 圆弧半径受限（不超过相邻段一半）
    const rr = Math.max(0.35, Math.min(r, l1 / 2, l2 / 2))
    const halfA = Math.acos(cosA) / 2
    const tanLen = rr / Math.tan(halfA)
    const t1 = p1.clone().addScaledVector(u1, -tanLen)
    const t2 = p1.clone().addScaledVector(u2, tanLen)
    // 圆心：沿角平分线（u2-u1 指向弯道内侧；u1+u2 会得到外侧圆心，圆弧画反产生折返）
    const bisect = u2.clone().sub(u1).normalize()
    const center = p1.clone().addScaledVector(bisect, rr / Math.sin(halfA))
    const normal = u1.clone().cross(u2).normalize()
    const v1 = t1.clone().sub(center).normalize()
    const v2 = t2.clone().sub(center).normalize()
    const angle = Math.acos(Math.max(-1, Math.min(1, v1.dot(v2))))
    const n = Math.max(3, Math.ceil(angle / (Math.PI / 14)))
    out.push(t1.clone()) // 圆弧起点切点（与上一拐角直线段衔接）
    for (let k = 1; k < n; k++) {
      const a = (k / n) * angle
      out.push(center.clone().addScaledVector(v1.clone().applyAxisAngle(normal, a), rr))
    }
    out.push(t2.clone())
  }
  out.push(pts[pts.length - 1].clone())
  return out
}

/** 管线中点（供视角聚焦） */
export function pipeMidpoint(def: PipeDef): THREE.Vector3 {
  const pts = resolvePipePath(def)
  return pts[Math.floor(pts.length / 2)]
}
