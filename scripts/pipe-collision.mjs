// 管线碰撞检测：页面运行时两两检测管线中心线距离 < 半径和 → 重叠/碰触
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const here = dirname(fileURLToPath(import.meta.url))
const profile = join(here, '..', '.shots', `collide-${process.pid}`)
mkdirSync(profile, { recursive: true })
const port = 9800 + (process.pid % 180)
const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=1280,720', '--force-device-scale-factor=1',
  '--enable-unsafe-swiftshader', '--no-first-run', '--disable-extensions', '--mute-audio',
  'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (r.ok) { const l = await r.json(); const p = l.find(t => t.type === 'page'); if (p) return p }
    } catch { }
    await sleep(400)
  }
  throw new Error('no CDP')
}
try {
  const target = await getTarget()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)
  let id = 0; const pend = new Map()
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id) } }
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value
  await send('Runtime.enable'); await send('Page.enable')
  await send('Page.navigate', { url: 'http://localhost:5180/3D-chemical-engineering/' })
  let ready = false
  for (let i = 0; i < 90 && !ready; i++) { await sleep(500); ready = await ev(`!!window.__ps`) }
  if (!ready) throw new Error('scene not ready')
  await ev(`(() => { try { window.__ps.ssaoPass.enabled = false } catch(e){}; return true })()`)

  const result = await ev(`(() => {
    const pipes = window.__ps.pipes
    const n = pipes.length
    const arrs = pipes.map(p => {
      const pts = []
      for (let k = 0; k <= 128; k++) pts.push(p.curve.getPointAt(k / 128))
      return pts
    })
    const overlaps = []
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const A = arrs[i], B = arrs[j]
      // AABB 剪枝
      const aMin = [1e9, 1e9, 1e9], aMax = [-1e9, -1e9, -1e9]
      const bMin = [1e9, 1e9, 1e9], bMax = [-1e9, -1e9, -1e9]
      for (const p of A) { aMin[0] = Math.min(aMin[0], p.x); aMax[0] = Math.max(aMax[0], p.x); aMin[1] = Math.min(aMin[1], p.y); aMax[1] = Math.max(aMax[1], p.y); aMin[2] = Math.min(aMin[2], p.z); aMax[2] = Math.max(aMax[2], p.z) }
      for (const p of B) { bMin[0] = Math.min(bMin[0], p.x); bMax[0] = Math.max(bMax[0], p.x); bMin[1] = Math.min(bMin[1], p.y); bMax[1] = Math.max(bMax[1], p.y); bMin[2] = Math.min(bMin[2], p.z); bMax[2] = Math.max(bMax[2], p.z) }
      const touch = aMin[0] <= bMax[0] && aMax[0] >= bMin[0] && aMin[1] <= bMax[1] && aMax[1] >= bMin[1] && aMin[2] <= bMax[2] && aMax[2] >= bMin[2]
      if (!touch) continue
      const rSum = (pipes[i].def.diameter + pipes[j].def.diameter) * 0.5
      let minD = 1e9, minAt = null
      for (let ai = 0; ai <= 128; ai += 2) for (let bi = 0; bi <= 128; bi += 2) {
        const d = A[ai].distanceToSquared(B[bi])
        if (d < minD) { minD = d; minAt = { u: ai / 128, v: bi / 128 } }
      }
      minD = Math.sqrt(minD)
      if (minD < rSum * 0.9) {
        const pa = A[Math.round(minAt.u * 128)], pb = B[Math.round(minAt.v * 128)]
        overlaps.push({
          a: pipes[i].id, b: pipes[j].id,
          gap: +minD.toFixed(2), rSum: +rSum.toFixed(2),
          at_a: [pa.x, pa.y, pa.z].map(v => +v.toFixed(1)),
          at_b: [pb.x, pb.y, pb.z].map(v => +v.toFixed(1)),
        })
      }
    }
    return JSON.stringify(overlaps.sort((x, y) => x.gap - y.gap))
  })()`)
  const list = JSON.parse(result)
  console.log('=== 管线重叠/碰触检测（gap < 0.9×(r1+r2)） ===')
  if (!list.length) console.log('无重叠')
  for (const o of list) {
    console.log(`${o.a} × ${o.b}: 中心距 ${o.gap}m（半径和 ${o.rSum}m，欠 ${(o.rSum - o.gap).toFixed(2)}m）@A(${o.at_a.join(',')}) B(${o.at_b.join(',')})`)
  }
  ws.close()
} finally {
  try { execFileSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { }
  try { rmSync(profile, { recursive: true, force: true }) } catch { }
}