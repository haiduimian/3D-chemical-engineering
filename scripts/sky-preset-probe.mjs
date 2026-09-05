// 天空随档位变化快速探针（R9 修复验证）：
// 1) 读取天空 uniforms 实况（skyDebug）确认已上传
// 2) 三档各截 1 帧，输出到 .shots/skyprobe/，供 sky-diagnose 做区域亮度分析
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', '.shots', 'skyprobe')
mkdirSync(outDir, { recursive: true })
const VW = 1280, VH = 720
// 默认走 vite preview（无 HMR，避免开发期源码热更污染无头页面）；可 --url 覆盖
const url = process.argv[process.argv.indexOf('--url') + 1] ?? 'http://localhost:4173/3D-chemical-engineering/'
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const userData = join(here, '..', '.shots', `edge-skyprobe-${process.pid}`)
mkdirSync(userData, { recursive: true })
const port = 9553 + (process.pid % 250)
const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`,
  `--window-size=${VW},${VH}`, '--force-device-scale-factor=1',
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
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id) } }
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value
  await send('Runtime.enable'); await send('Page.enable')
  // 捕获页面异常/console 错误（诊断用）
  const pageErrors = []
  ws.onmessage = (ev) => { /* 占位：下方重新挂载 */ }
  const origOn = ws.onmessage
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Runtime.exceptionThrown') pageErrors.push('EXC: ' + JSON.stringify(m.params.exceptionDetails).slice(0, 300))
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      pageErrors.push(m.params.type.toUpperCase() + ': ' + (m.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300))
    }
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id) }
  }
  await send('Log.enable')
  await ev(`window.onerror = (msg) => { (window.__errs = window.__errs || []).push(String(msg).slice(0,200)); return false }`)
  await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url })
  let ready = false
  for (let i = 0; i < 120 && !ready; i++) { await sleep(500); ready = await ev(`!!(window.__ps && window.__ps.timeSystem)`) }
  if (!ready) throw new Error('scene not ready')
  await sleep(2500)
  await ev(`(() => { const els = document.querySelectorAll('.toolbar,.panel,.func-bar,.hint,.legend,.trend'); els.forEach(e => e.style.display='none'); try { window.__ps.ssaoPass.enabled=false } catch(e){}; return true })()`)
  await sleep(500)

  for (const pre of ['afternoon', 'dusk', 'night']) {
    const cur = await ev(`window.__ps.timeSystem.presetName`)
    if (cur !== pre) await ev(`window.__ps.setTimeOfDay('${pre}')`)
    await sleep(1800)
    const dbg = await ev(`JSON.stringify(window.__ps.timeSystem.skyDebug)`)
    const state = await ev(`JSON.stringify({
      preset: window.__ps.timeSystem.presetName,
      transitioning: window.__ps.timeSystem.transitioning,
      sunDir: window.__ps.timeSystem.sunDirection.toArray(),
      exposure: window.__ps.diagram.renderer.toneMappingExposure,
      fog: window.__ps.diagram.scene.fog.color.getHexString(),
      envA: window.__ps.diagram.scene.environment ? 'set' : 'null',
      errs: window.__errs || []
    })`)
    // 直接采样天空：小相机朝太阳侧天区（仰角 35°）渲染 64×64 RT 读像素
    const skySample = await ev(`(() => {
      const { renderer, scene } = window.__ps.diagram
      const THREE = window.__THREE__
      const cam = new THREE.PerspectiveCamera(60, 1, 0.5, 20000)
      const dir = window.__ps.timeSystem.sunDirection.clone()
      dir.y = Math.abs(dir.y) * 0.7 + 0.5 // 抬到天区
      dir.normalize()
      cam.position.set(55, 48, -95)
      cam.lookAt(cam.position.clone().add(dir))
      const rt = new THREE.WebGLRenderTarget(64, 64)
      const old = renderer.getRenderTarget()
      renderer.setRenderTarget(rt)
      renderer.render(scene, cam)
      const px = new Uint8Array(64 * 64 * 4)
      renderer.readRenderTargetPixels(rt, 0, 0, 64, 64, px)
      renderer.setRenderTarget(old)
      rt.dispose()
      let r = 0, g = 0, b = 0, n = 0
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const i = (y * 64 + x) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++
      }
      return JSON.stringify({ rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)] })
    })()`)
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    const fn = join(outDir, `${pre}.png`)
    writeFileSync(fn, Buffer.from(shot.data, 'base64'))
    // 全帧均值（Node 侧快速估算，调参回路用）
    const mean = await (async () => {
      const { readFileSync } = await import('node:fs')
      const zlib = await import('node:zlib')
      const buf = readFileSync(fn)
      let pos = 8, w = 0, h = 0, colT = 0, idat = []
      while (pos < buf.length) {
        const len = buf.readUInt32BE(pos)
        const type = buf.toString('ascii', pos + 4, pos + 8)
        const data = buf.subarray(pos + 8, pos + 8 + len)
        if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colT = data[9] }
        else if (type === 'IDAT') idat.push(data)
        else if (type === 'IEND') break
        pos += 12 + len
      }
      const raw = zlib.inflateSync(Buffer.concat(idat))
      const ch = colT === 6 ? 4 : 3
      const stride = w * ch
      const out = Buffer.alloc(h * stride)
      let prev = Buffer.alloc(stride), rp = 0
      for (let y = 0; y < h; y++) {
        const f = raw[rp++]
        const line = raw.subarray(rp, rp + stride); rp += stride
        const cur = out.subarray(y * stride, (y + 1) * stride)
        for (let i = 0; i < stride; i++) {
          const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0
          let x
          switch (f) {
            case 0: x = line[i]; break
            case 1: x = (line[i] + a) & 255; break
            case 2: x = (line[i] + b) & 255; break
            case 3: x = (line[i] + ((a + b) >> 1)) & 255; break
            case 4: {
              const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
              const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
              x = (line[i] + pr) & 255; break
            }
            default: x = 0
          }
          cur[i] = x
        }
        prev = cur
      }
      let sum = 0, n = 0, hi = 0
      for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) {
        const p = (y * w + x) * ch
        const v = 0.299 * out[p] + 0.587 * out[p + 1] + 0.114 * out[p + 2]
        sum += v; n++; if (v > 250) hi++
      }
      return +(sum / n).toFixed(1) + '/' + +(100 * hi / n).toFixed(3)
    })()
    console.log(`=== ${pre} === ${dbg} | STATE ${state} | sky RGB ${skySample} | fullMean/hiPct=${mean} | pageErrors=${pageErrors.length}`)
  }
  console.log('WROTE .shots/skyprobe/')
} finally {
  try { execFileSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { }
  try { rmSync(userData, { recursive: true, force: true }) } catch { }
}