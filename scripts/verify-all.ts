/**
 * 全功能自动化验证脚本（纯逻辑模块，Node 可跑）
 * 覆盖：端口引用完整性 / 管线路径（NaN·折返·端点吸附·L形） / 圆角弯头 / SOP 评分 / 数据源录制回放
 * 运行：esbuild 打包后 node 执行
 */
import * as THREE from 'three'
import { PIPES, EQUIPMENTS } from '../src/layout/plantLayout'
import { PORTS, portEnd } from '../src/layout/ports'
import { resolvePipePath, roundedPolyline } from '../src/connectors/path'
import { SopEngine, SOP_STARTUP, SOP_SHUTDOWN } from '../src/training/sop'
import { MockDataSource, TAG_MAP, PUMP_IDS } from '../src/data/processData'

let pass = 0, fail = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++ } else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`) }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── 1. 端口引用完整性 ──
console.log('■ 1. 端口引用完整性')
for (const p of PIPES) {
  const fp = PORTS[p.from], tp = PORTS[p.to]
  check(`${p.id}: from 端口存在`, !!fp, `from=${p.from}`)
  check(`${p.id}: to 端口存在`, !!tp, `to=${p.to}`)
  check(`${p.id}: from 设备存在`, !!EQUIPMENTS.find(e => e.id === fp?.elementId))
  check(`${p.id}: to 设备存在`, !!EQUIPMENTS.find(e => e.id === tp?.elementId))
  for (const v of p.via ?? []) {
    if (v.pump) {
      const base = v.pump.replace('P-', 'P')
      check(`${p.id}: 泵 ${v.pump} IN/OUT 端口`, !!PORTS[`${base}-IN`] && !!PORTS[`${base}-OUT`])
    }
  }
}

// ── 2. 管线路径质量 ──
console.log('■ 2. 管线路径（NaN / 折返 / 端点吸附 / 单轴水平段）')
for (const p of PIPES) {
  const pts = resolvePipePath(p)
  check(`${p.id}: 路径点数 ≥ 4`, pts.length >= 4, String(pts.length))
  let nan = false
  for (const v of pts) if (!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) nan = true
  check(`${p.id}: 无 NaN`, !nan)
  let fold = false
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i].clone().sub(pts[i - 1])
    const b = pts[i + 1].clone().sub(pts[i])
    if (a.lengthSq() > 1e-6 && b.lengthSq() > 1e-6 && a.normalize().dot(b.normalize()) < -0.9) fold = true
  }
  check(`${p.id}: 无 180° 折返`, !fold)
  const P0 = portEnd(p.from, 0.5), P1 = portEnd(p.to, 0.5)
  check(`${p.id}: 起点吸附端口`, pts[0].distanceTo(P0) < 0.01)
  check(`${p.id}: 终点吸附端口`, pts[pts.length - 1].distanceTo(P1) < 0.01)
  // 同一水平段（相邻点 y 差 < 0.05）只允许单轴移动（L 形）
  for (let i = 1; i < pts.length; i++) {
    const dx = Math.abs(pts[i].x - pts[i - 1].x)
    const dz = Math.abs(pts[i].z - pts[i - 1].z)
    const dy = Math.abs(pts[i].y - pts[i - 1].y)
    if (dy < 0.05 && dx > 0.01 && dz > 0.01) { check(`${p.id}: 段${i} 水平斜线`, false); break }
  }
}

// ── 3. 圆角弯头 ──
console.log('■ 3. 圆角弯头')
const corner = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 0, 0), new THREE.Vector3(10, 0, 10), new THREE.Vector3(0, 0, 10)]
const rounded = roundedPolyline(corner, 1.2)
check('圆角后点数增加', rounded.length > corner.length, String(rounded.length))
let sharp = false
for (let i = 1; i < rounded.length - 1; i++) {
  const a = rounded[i].clone().sub(rounded[i - 1])
  const b = rounded[i + 1].clone().sub(rounded[i])
  if (a.lengthSq() > 1e-6 && b.lengthSq() > 1e-6 && a.normalize().dot(b.normalize()) < -0.9) sharp = true
}
check('圆角后无锐角折返', !sharp)

// ── 4. SOP 培训评分 ──
console.log('■ 4. SOP 培训')
const eng = new SopEngine(SOP_STARTUP, '开车')
eng.begin()
let r = eng.handle('P-101', 'start'); check('S1 正确操作通过', r.ok, r.msg)
r = eng.handle('P-102', 'start'); check('顺序错误被拒+扣分', !r.ok)
r = eng.handle('pipe-aa', 'open'); check('S2 通过', r.ok)
r = eng.handle('P-102', 'start'); check('S3 通过', r.ok)
r = eng.handle('pipe-meoh', 'open'); check('S4 通过', r.ok)
r = eng.handle('P-103', 'start'); check('S5 通过', r.ok)
r = eng.handle('R-101', 'check'); check('S6 完成', r.ok && r.finished === true, r.msg)
check('得分 60~100', r.score !== undefined && r.score >= 60 && r.score <= 100, String(r.score))
// 停车 SOP 边界：直接跳到最后一步应被拒
const eng2 = new SopEngine(SOP_SHUTDOWN, '停车')
eng2.begin()
r = eng2.handle('R-101', 'check'); check('停车第1步必须是 P-101 stop（越级被拒）', !r.ok)

// ── 5. 数据源录制/回放 ──
console.log('■ 5. 数据源（实时/录制/回放）')
const ds = new MockDataSource()
let frames = 0
ds.onTick(() => frames++)
ds.start(50)
await sleep(180)
ds.stop()
check('实时帧 ≥ 2', frames >= 2, String(frames))
const hist = ds.getHistory()
check('历史帧 1~300', hist.length >= 1 && hist.length <= 300, String(hist.length))
const last = hist[hist.length - 1]
check('帧含全部 tag', last && Object.keys(last.points).length === Object.keys(TAG_MAP).length)
check('帧含 5 泵状态', last && PUMP_IDS.every(id => last.states[id]))
check('帧含阀门状态', last && Object.keys(last.states).some(k => k.startsWith('valve:')))
let replayFrames = 0
const ok = ds.startPlayback(() => replayFrames++, 20)
check('回放启动成功', ok)
await sleep(130)
ds.stopPlayback()
check('回放推进 ≥ 2 帧', replayFrames >= 2, String(replayFrames))

console.log(`\n═══ 结果：通过 ${pass} 项 / 失败 ${fail} 项 ═══`)
process.exit(fail > 0 ? 1 : 0)
