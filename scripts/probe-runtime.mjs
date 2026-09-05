// 运行时探针：逐帧读取页面内场景实时状态（composer passes / beacon emissive / 定时采样）
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const here = dirname(fileURLToPath(import.meta.url))
const profile = join(here, '..', '.shots', `probe-${process.pid}`)
mkdirSync(profile, { recursive: true })
const port = 9500 + (process.pid % 400)
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
  if (!ready) { console.log('SCENE NOT READY'); throw new Error('scene not ready') }
  // 关闭 SSAO 提速（与截帧 fast 模式一致）
  await ev(`(() => { try { window.__ps.ssaoPass.enabled = false } catch(e){}; return true })()`)
  console.log('PASSES:', await ev(`window.__ps.composer.passes.map(p => p.constructor.name).join(',')`))
  const rows = []
  for (let k = 0; k < 8; k++) {
    const s = await ev(`(() => {
      const ps = window.__ps
      const beacons = ps.beacons.map(b => +(b.material.emissiveIntensity).toFixed(2))
      const cb = ps.cityBeacons.map(b => +(b.material.emissiveIntensity).toFixed(2))
      const flame = ps.flame ? +(ps.flame.material.emissiveIntensity).toFixed(2) : null
      const lamp0 = ps.equipmentGroups[0]?.userData.lamps?.[0] ? +(ps.equipmentGroups[0].userData.lamps[0].material.emissiveIntensity).toFixed(2) : null
      const cfg = { bloomThr: 5.0, ssaoOn: !ps.ssaoPass || ps.ssaoPass.enabled }
      return JSON.stringify({ simT: +ps.clock.elapsedTime.toFixed(2), beacons, cb, flame, lamp0 })
    })()`)
    rows.push(JSON.parse(s))
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    writeFileSync(`.shots\\probe-f${k}.png`, Buffer.from(shot.data, 'base64'))
    await sleep(1500)
  }
  console.table(rows)
  console.log('done')
  ws.close()
} finally {
  try { execFileSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { }
  try { rmSync(profile, { recursive: true, force: true }) } catch { }
}