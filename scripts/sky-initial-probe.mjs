// R9 无切换时序诊断：复现 capture-frames 场景（加载后不切时段，等待覆盖全部预热烘焙）
// 用法：node scripts/sky-initial-probe.mjs [--url http://localhost:4173/3D-chemical-engineering/]
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const url = process.argv[process.argv.indexOf('--url') + 1] ?? 'http://localhost:4173/3D-chemical-engineering/'
const outDir = join(here, '..', '.shots', 'skyinit')
mkdirSync(outDir, { recursive: true })
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const userData = join(here, '..', '.shots', `edge-skyinit-${process.pid}`)
mkdirSync(userData, { recursive: true })
const port = 9587 + (process.pid % 200)
const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`,
  '--window-size=1280,720', '--force-device-scale-factor=1',
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
    await sleep(500)
  }
  throw new Error('no cdp')
}
try {
  const target = await waitForCdp()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)
  let id = 0; const pend = new Map()
  const pageErrors = []
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Runtime.exceptionThrown') pageErrors.push('EXC: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 400))
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id) }
  }
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) return 'EVAL-ERR: ' + JSON.stringify(r.exceptionDetails).slice(0, 200)
    return r.result?.value
  }
  await send('Runtime.enable'); await send('Page.enable')
  await send('Page.navigate', { url })
  let ready = false
  for (let i = 0; i < 120 && !ready; i++) { await sleep(500); ready = await ev(`!!(window.__ps && window.__ps.timeSystem)`) }
  if (!ready) throw new Error('not ready')
  // 时间线采样：0s(初始) / 1.5s / 5s（午后预热窗口）/ 11s（夜景预热窗口）/ 20s / 35s
  const at = [0, 1500, 5000, 11000, 20000, 35000]
  let prev = 0
  for (const ms of at) {
    await sleep(ms - prev); prev = ms
    const dbg = await ev(`JSON.stringify(window.__ps.timeSystem.skyDebug)`)
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    writeFileSync(join(outDir, `t${ms}.png`), Buffer.from(shot.data, 'base64'))
    console.log(`t=${ms}ms ${dbg} errs=${pageErrors.length}`)
    if (pageErrors.length) { console.log(pageErrors.slice(-3).join('\n')); pageErrors.length = 0 }
  }
  console.log('WROTE .shots/skyinit/')
} finally {
  try { execFileSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { }
  try { rmSync(userData, { recursive: true, force: true }) } catch { }
}