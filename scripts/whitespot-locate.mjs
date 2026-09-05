// 白点闪烁定位：截 8 帧 → 时间高方差像素聚类 → 页面内 Raycast 反投影命中物体
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const here = dirname(fileURLToPath(import.meta.url))
const profile = join(here, '..', '.shots', `whitespot-${process.pid}`)
mkdirSync(profile, { recursive: true })
const outDir = join(here, '..', '.shots', 'whitespot')
mkdirSync(outDir, { recursive: true })
const port = 9700 + (process.pid % 200)

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
  await ev(`(() => { try { window.__ps.ssaoPass.enabled = false } catch(e){}; document.querySelectorAll('.toolbar,.panel,.func-bar,.hint,.legend,.trend').forEach(e => e.style.display = 'none'); return true })()`)
  await sleep(1500)
  // 截 8 帧（间隔 1s，覆盖蒸汽/脉冲周期）
  const bufs = []
  for (let k = 0; k < 8; k++) {
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    bufs.push(Buffer.from(shot.data, 'base64'))
    writeFileSync(join(outDir, `w${k}.png`), bufs[k])
    await sleep(1000)
  }
  // 全局帧均值 + 时间 std（Node 内解码，80x45 分析网格每像素）
  const AW = 320, AH = 180
  const imgs = bufs.map(b => decodePNG(b))
  const W = imgs[0].w, H = imgs[0].h
  const sum = new Float64Array(AW * AH), sumSq = new Float64Array(AW * AH)
  for (const img of imgs) {
    for (let ay = 0; ay < AH; ay++) {
      const y = Math.min(H - 1, Math.floor(ay * H / AH))
      for (let ax = 0; ax < AW; ax++) {
        const x = Math.min(W - 1, Math.floor(ax * W / AW))
        const i = (y * W + x) * img.ch
        const lum = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
        const p = ay * AW + ax
        sum[p] += lum; sumSq[p] += lum * lum
      }
    }
  }
  const N = imgs.length
  // 热点聚类
  const hot = []
  for (let ay = 0; ay < AH; ay++) for (let ax = 0; ax < AW; ax++) {
    const p = ay * AW + ax
    const m = sum[p] / N
    const sd = Math.sqrt(Math.max(0, sumSq[p] / N - m * m))
    if (sd > 18) hot.push({ ax, ay, sd, m })
  }
  const clusters = []
  for (const h of hot) {
    const c = clusters.find(c => Math.abs(c.ax - h.ax) < 10 && Math.abs(c.ay - h.ay) < 10)
    if (c) { c.ax = (c.ax + h.ax) / 2; c.ay = (c.ay + h.ay) / 2; c.n++; c.sd = Math.max(c.sd, h.sd) } else clusters.push({ ax: h.ax, ay: h.ay, n: 1, sd: h.sd })
  }
  clusters.sort((a, b) => b.sd - a.sd)
  console.log(`hot clusters(${hot.length} px):`, clusters.slice(0, 12).map(c => `(${Math.round(c.ax * 4)},${Math.round(c.ay * 4)}) sd=${c.sd.toFixed(0)} n=${c.n}`).join('  '))
  // 页面内 Raycast：对每个聚类中心反投影命中物体
  const hits = await ev(`(() => {
    const T = window.__THREE__, ps = window.__ps, cam = ps.diagram.camera
    const raycaster = new T.Raycaster()
    const ndc = new T.Vector2()
    const pts = ${JSON.stringify(clusters.slice(0, 12).map(c => [c.ax * 4, c.ay * 4]))}
    const out = []
    for (const [px, py] of pts) {
      ndc.set((px / 1280) * 2 - 1, -((py / 720) * 2 - 1))
      raycaster.setFromCamera(ndc, cam)
      const hits = raycaster.intersectObjects(ps.diagram.scene.children, true)
      if (!hits.length) { out.push({ px, py, hit: null }); continue }
      const o = hits[0].object
      let chain = []
      let cur = o
      while (cur && chain.length < 6) {
        chain.push({ t: cur.type, uid: cur.userData ? Object.fromEntries(Object.entries(cur.userData).filter(([k]) => ['elementId','isLamp','isBeacon','flip','fan','status'].includes(k))) : {}, geo: cur.geometry ? cur.geometry.type : null })
        cur = cur.parent
      }
      const mat = Array.isArray(o.material) ? o.material[0] : o.material
      out.push({
        px, py,
        objectType: o.type,
        geoType: o.geometry ? o.geometry.type : null,
        radius: o.geometry && o.geometry.parameters ? o.geometry.parameters.radius : null,
        mat: mat ? (mat.constructor.name + ' eI=' + (mat.emissiveIntensity ?? 'n/a') + ' color=' + (mat.color ? '#' + mat.color.getHexString() : '')) : null,
        pos: o.getWorldPosition(new T.Vector3()).toArray().map(v => +v.toFixed(1)),
        parentChain: chain,
      })
    }
    return JSON.stringify(out)
  })()`)
  writeFileSync(join(outDir, 'raycast-hits.json'), hits, 'utf8')
  console.log('--- raycast hits ---')
  for (const line of JSON.parse(hits)) {
    if (!line.hit && line.objectType) console.log(`(${line.px},${line.py}) ${line.objectType}/${line.geoType} r=${line.radius} ${line.mat} @${line.pos} chain=${line.parentChain.map(c => c.t + (c.uid.elementId ? ':' + c.uid.elementId : '')).join('>')}`)
    else console.log(`(${line.px},${line.py}) NO HIT`)
  }
  ws.close()
} finally {
  try { execFileSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { }
  try { rmSync(profile, { recursive: true, force: true }) } catch { }
}