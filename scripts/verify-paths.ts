/**
 * 临时验证脚本：检查管线路径是否穿越设备（圆柱碰撞检测）
 * 运行：esbuild 打包后 node 执行
 */
import { PIPES, EQUIPMENTS } from '../src/layout/plantLayout'
import { resolvePipePath } from '../src/connectors/path'
import * as THREE from 'three'

interface Cyl { id: string; x: number; z: number; r: number; y0: number; y1: number }

function buildCylinders(): Cyl[] {
  const out: Cyl[] = []
  for (const e of EQUIPMENTS) {
    const p = e.params ?? {}
    switch (e.type) {
      case 'tank': out.push({ id: e.id, x: e.x, z: e.z, r: p.radius ?? 4, y0: 0, y1: (p.height ?? 6) + 2.5 }); break
      case 'sphere': out.push({ id: e.id, x: e.x, z: e.z, r: (p.radius ?? 6) * 1.02, y0: 0, y1: (p.radius ?? 6) * 2.6 }); break
      case 'reactor': out.push({ id: e.id, x: e.x, z: e.z, r: p.radius ?? 1.8, y0: 0, y1: (p.height ?? 9) + 5 }); break
      case 'column': out.push({ id: e.id, x: e.x, z: e.z, r: p.radius ?? 1.5, y0: 0, y1: (p.height ?? 16) + 4 }); break
      case 'exchanger': out.push({ id: e.id, x: e.x, z: e.z, r: 1.2, y0: 0.6, y1: 2.9 }); break
      case 'mixer': out.push({ id: e.id, x: e.x, z: e.z, r: 0.8, y0: 0.8, y1: 1.6 }); break
      case 'inhibitorTank': out.push({ id: e.id, x: e.x, z: e.z, r: p.radius ?? 1.2, y0: 0, y1: (p.height ?? 2) + 2 }); break
      default: break
    }
  }
  return out
}

const cyls = buildCylinders()
let issues = 0

for (const pipe of PIPES) {
  const pts = resolvePipePath(pipe)
  // 检查每段是否穿设备（排除管线自身的 from/to 设备——端口本就在设备表面）
  const fromDev = pipe.from.match(/^([A-Z]+\d*-\d+)/)?.[0] ?? ''
  const toDev = pipe.to.match(/^([A-Z]+\d*-\d+)/)?.[0] ?? ''
  const exclude = new Set([fromDev, toDev])
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    for (let s = 1; s <= 4; s++) {
      const pt = a.clone().lerp(b, s / 4)
      for (const c of cyls) {
        if (exclude.has(c.id)) continue
        if (pt.y < c.y0 - 0.2 || pt.y > c.y1 + 0.2) continue
        const dx = pt.x - c.x, dz = pt.z - c.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist < c.r + (pipe.diameter / 2) + 0.25) {
          console.log(`⚠ ${pipe.id} 段 ${i} 采样点 (${pt.x.toFixed(1)},${pt.y.toFixed(1)},${pt.z.toFixed(1)}) 穿入 ${c.id}（距离 ${dist.toFixed(2)} < ${c.r.toFixed(2)}+）`)
          issues++
          break
        }
      }
    }
  }
  console.log(`✓ ${pipe.id} → ${pts.length} 点`)
}

console.log(issues === 0 ? '\n✅ 全部管线无穿越' : `\n❌ 发现 ${issues} 处穿越`)
