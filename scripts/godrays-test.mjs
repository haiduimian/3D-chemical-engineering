// 体积光开关对照测试：同一场景下 strength=0 vs strength=0.6 的渲染差异
// 同时输出 godRays uniform 实况（太阳屏幕坐标等）
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const here = dirname(fileURLToPath(import.meta.url))
const profile = join(here, '..', '.shots', `grtest-${process.pid}`)
mkdirSync(profile, { recursive: true })
const port = 9600 + (process.pid % 300)

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png')
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const ch = colorType === 6 ? 4 : 3
  const stride = w * ch
  const out = Buffer.alloc(h * stride)
  let prev = Buffer.alloc(stride)
  let rp = 0
  for (let y = 0; y < h; y++) {
    const f = raw[rp++]
    const line = raw.subarray(rp, rp + stride); rp += stride
    const cur = out.subarray(y * stride, (y + 1) * stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0
      const b = prev[i]
      const c = i >= ch ? prev[i - ch] : 0
      let v = line[i]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      cur[i] = v & 0xff
    }
    prev = cur
  }
  return { w, h, ch, data: out }
}

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
  await ev(`(() => { window.__ps.ssaoPass.enabled = false; return true })()`)
  console.log('passes:', await ev(`window.__ps.composer.passes.map(p => p.constructor.name).join(',')`))
  console.log('godRays uniforms:', await ev(`(() => { const g = window.__ps.godRays; return JSON.stringify({ strength: g.uniforms.strength.value, uSunRaw: g.uniforms.uSunRaw.value.toArray(), uSun: g.uniforms.uSun.value.toArray() }) })()`))
  // 关体积光 → 截图
  await ev(`window.__ps.godRays.uniforms.strength.value = 0`)
  await sleep(3500)
  let shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  writeFileSync(join(here, '..', '.shots', 'gr-off.png'), Buffer.from(shot.data, 'base64'))
  // 高强度 → 截图
  await ev(`(() => { const g = window.__ps.godRays; g.uniforms.strength.value = 0.6; g.uniforms.samples.value = 56; return true })()`)
  await sleep(3500)
  shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  writeFileSync(join(here, '..', '.shots', 'gr-on.png'), Buffer.from(shot.data, 'base64'))
  // 差值统计
  const a = decodePNG(readFileSync(join(here, '..', '.shots', 'gr-off.png')))
  const b = decodePNG(readFileSync(join(here, '..', '.shots', 'gr-on.png')))
  let maxDiff = 0, sumDiff = 0, n = 0
  const ch = a.ch
  for (let y = 0; y < a.h; y += 2) for (let x = 0; x < a.w; x += 2) {
    const i = (y * a.w + x) * ch
    const la = 0.299 * a.data[i] + 0.587 * a.data[i + 1] + 0.114 * a.data[i + 2]
    const lb = 0.299 * b.data[i] + 0.587 * b.data[i + 1] + 0.114 * b.data[i + 2]
    const d = Math.abs(la - lb)
    if (d > maxDiff) maxDiff = d
    sumDiff += d; n++
  }
  console.log(`god rays on/off: meanAbsDiff=${(sumDiff / n).toFixed(2)} maxDiff=${maxDiff.toFixed(1)}  (@1280x720, strength 0 vs 0.6)`)
  ws.close()
} finally {
  try { execFileSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { }
  try { rmSync(profile, { recursive: true, force: true }) } catch { }
}