// R10 巡检碰撞专项验证：CDP 页面内 walk-into-wall 断言
// 1) 直奔 V-101 罐中心：应停在罐体 AABB 边缘外（不能穿罐）
// 2) 沿管廊柱列横向走：应被柱/墩阻挡（滑移）
// 3) 空旷区自由通行：不受碰撞体影响
// 用法：node scripts/patrol-collide-check.mjs [--url http://localhost:4173/3D-chemical-engineering/]
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const url = process.argv[process.argv.indexOf('--url') + 1] ?? 'http://localhost:4173/3D-chemical-engineering/'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const userData = join(here, '..', '.shots', `edge-collide-${process.pid}`)
mkdirSync(userData, { recursive: true })
const port = 9621 + (process.pid % 240)
const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`,
  '--window-size=960,540', '--force-device-scale-factor=1',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox',
  '--no-first-run', '--disable-extensions', '--mute-audio', 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (r.ok) return (await r.json()).find(t => t.type === 'page')
    } catch { }
    await sleep(400)
  }
  throw new Error('no cdp')
}
let failures = 0
const report = (name, ok, detail) => {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? '  →  ' + detail : ''}`)
  if (!ok) failures++
}
try {
  const target = await waitForCdp()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)
  let id = 0; const pend = new Map()
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id) } }
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) return 'EVAL-ERR: ' + JSON.stringify(r.exceptionDetails).slice(0, 300)
    return r.result?.value
  }
  await send('Runtime.enable'); await send('Page.enable')
  await send('Page.navigate', { url })
  let ready = false
  for (let i = 0; i < 120 && !ready; i++) { await sleep(500); ready = await ev(`!!(window.__ps && window.__ps.patrolColliders)`) }
  if (!ready) throw new Error('scene not ready')

  const res = await ev(`(() => {
    const ps = window.__ps
    const cs = ps.patrolColliders
    const solve = (x, z, dx, dz) => ps.collisionResolve({ x, z }, dx, dz, cs)
    const hit = (x, z) => cs.some(c => Math.abs(x - c.x) < c.hx + 0.45 && Math.abs(z - c.z) < c.hz + 0.45)
    const out = { colliders: cs.length, nearEquipment: cs.filter(c => c.label === 'V-101').length }
    // 1) 直奔 V-101（-55,-32）：应从西侧 (-75,-32) 直走到被挡
    let x = -75, z = -32
    for (let i = 0; i < 600; i++) { const r = solve(x, z, 0.25, 0); x = r.x; z = r.z }
    out.intoV101 = { x: +x.toFixed(2), z: +z.toFixed(2), dist: +Math.hypot(x + 55, z + 32).toFixed(2), penetrated: hit(x, z) }
    // 2) 沿管廊 z=-6 北柱列（x=-60..30, z=-8）横向走：应贴柱滑移（z 被卡在柱前）
    let px = -70, pz = -8
    for (let i = 0; i < 400; i++) { const r = solve(px, pz, 0.25, 0); px = r.x; pz = r.z }
    out.rackWalk = { x: +px.toFixed(2), z: +pz.toFixed(2), penetrated: hit(px, pz) }
    // 3) 空旷区（公园绿地 x=60, z=40）：自由穿行
    let qx = 40, qz = 45
    for (let i = 0; i < 200; i++) { const r = solve(qx, qz, 0.3, 0); qx = r.x; qz = r.z }
    out.openField = { x: +qx.toFixed(2), z: +qz.toFixed(2), moved: Math.abs(qx - 40) > 40 }
    // 4) 围堰：自罐区外朝围堰墙 (x=-47.5, z=-44) 直走 → 被北墙挡在 z≈-39
    let wx = -47.5, wz = -46
    for (let i = 0; i < 300; i++) { const r = solve(wx, wz, 0, 0.25); wx = r.x; wz = r.z }
    out.dike = { x: +wx.toFixed(2), z: +wz.toFixed(2), penetrated: hit(wx, wz), stoppedBeforeWall: wz < -39.2 }
    return JSON.stringify(out)
  })()`)
  const r = JSON.parse(res)
  console.log('colliders:', r.colliders, '| V-101 AABB:', r.nearEquipment)

  report('碰撞体表就绪且覆盖设备', r.colliders >= 20 && r.nearEquipment >= 1, `${r.colliders} 个`)
  report('【V-101】不可穿罐（停在 AABB 外）', !r.intoV101.penetrated && r.intoV101.dist >= 5.2, `dist=${r.intoV101.dist}m @(${r.intoV101.x},${r.intoV101.z})`)
  report('【管廊柱列】贴柱滑移不穿透', !r.rackWalk.penetrated, `@(${r.rackWalk.x},${r.rackWalk.z})`)
  report('【空旷区】自由通行', r.openField.moved, `x=${r.openField.x}`)
  report('【围堰】北墙阻挡（z 停在墙前）', r.dike.stoppedBeforeWall && !r.dike.penetrated, `z=${r.dike.z}`)
} finally {
  try { execFileSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { }
  try { rmSync(userData, { recursive: true, force: true }) } catch { }
}
console.log(failures === 0 ? '\nALL PATROL-COLLIDE CHECKS PASS' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)