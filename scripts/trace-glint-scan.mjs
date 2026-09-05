// 伴热管/管线镜面高光复现：围绕 E-101（及 P-103）轨道多角度截帧，
// 统计"近白高强度像素"比例与聚类数 → 定位刺眼白色"放射线"的来源角度
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const here = dirname(fileURLToPath(import.meta.url))
const profile = join(here, '..', '.shots', `glint-${process.pid}`)
mkdirSync(profile, { recursive: true })
const outDir = join(here, '..', '.shots', 'glint')
mkdirSync(outDir, { recursive: true })
const port = 9900 + (process.pid % 100)

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
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: 'http://localhost:5180/3D-chemical-engineering/' })
  let ready = false
  for (let i = 0; i < 90 && !ready; i++) { await sleep(500); ready = await ev(`!!window.__ps`) }
  if (!ready) throw new Error('scene not ready')
  await ev(`(() => { try { window.__ps.ssaoPass.enabled = false; window.__ps.godRays.uniforms.strength.value = 0 } catch(e){}; document.querySelectorAll('.toolbar,.panel,.func-bar,.hint,.legend,.trend').forEach(e => e.style.display = 'none'); return true })()`)
  await sleep(1000)
  // 围绕 E-101 的 12 角度轨道（半径 13，高度 7，目标 E-101 中心）
  const CX = -36, CZ = 18, R = 13, H = 7
  const rows = []
  const bufs = []
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    const px = CX + Math.cos(a) * R, pz = CZ + Math.sin(a) * R
    await ev(`(() => { window.__ps.flyTo([${px}, ${H}, ${pz}], [${CX}, 2.5, ${CZ}]); return true })()`)
    await sleep(2500)
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    const b = Buffer.from(shot.data, 'base64')
    writeFileSync(join(outDir, `g${String(k).padStart(2, '0')}.png`), b)
    bufs.push(b)
    rows.push({ k, a: +(a).toFixed(2) })
  }
  // 统计：近白像素（lum>215 且 低饱和）比例、高亮点聚类
  // R7v2：只统计画面垂直 55%~96% 的"设备区"（排除天空/太阳光晕干扰）
  const res = []
  for (let k = 0; k < 12; k++) {
    const img = decodePNG(bufs[k])
    const { w, h, ch, data } = img
    let white = 0, bright = 0, n = 0
    const y0 = Math.floor(h * 0.55), y1 = Math.floor(h * 0.96)
    for (let y = y0; y < y1; y += 2) for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * ch
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255
      n++
      if (lum > 215 && sat < 0.22) white++
      if (lum > 200) bright++
    }
    res.push({ k: rows[k].k, angleDeg: Math.round(rows[k].a * 180 / Math.PI), whitePct: +(100 * white / n).toFixed(2), brightPct: +(100 * bright / n).toFixed(2) })
  }
  console.log('=== 伴热管高光角度扫描（E-101 轨道 12 角度，设备区 55%~96% 统计）===')
  console.table(res)
  const worst = res.reduce((a, b) => (b.whitePct > a.whitePct ? b : a))
  console.log(`最刺眼角度: ${worst.angleDeg}° whitePct=${worst.whitePct}% clusters=${worst.clusters} → 保存图 g${String(worst.k).padStart(2, '0')}.png`)
  ws.close()
} finally {
  try { execFileSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { }
  try { rmSync(profile, { recursive: true, force: true }) } catch { }
}