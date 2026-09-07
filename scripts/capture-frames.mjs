// CDP 截帧 + 像素分析工具：无头 Edge + DevTools Protocol
// 用法：
//   node scripts/capture-frames.mjs --url http://localhost:5180/3D-chemical-engineering/ --out .shots/frames [--frames 20] [--interval 450] [--clean] [--fast]
// 输出：
//   f000.png..f0NN.png   帧序列
//   scene-snapshot.json  场景光照/材质/发光参数快照
//   analysis.json        全局统计 + 分块时间抖动（闪烁定位）结果
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d }
const url = get('url', 'http://localhost:5180/3D-chemical-engineering/')
const outDir = get('out', join(here, '..', '.shots', 'frames'))
const frames = parseInt(get('frames', '20'), 10)
const interval = parseInt(get('interval', '450'), 10)
const clean = args.includes('--clean')
const fast = args.includes('--fast') // 小视口 + 关 SSAO（软件渲染提速，保留 bloom 供闪烁分析）
const tourshots = args.includes('--tourshots') // 近景多机位截帧验收（替代常规 20 帧主循环）
const VW = fast ? 1280 : 1600
const VH = fast ? 720 : 900

/** 与 src/layout/plantLayout.ts CAMERA_TOURS 保持同步的机位表 */
const TOURS = [
  { name: '全厂总览', pos: [70, 110, -150], target: [0, 5, 0] },
  { name: '罐区', pos: [-50, 25, -8], target: [-47, 4, -30] },
  { name: '反应区', pos: [-38, 16, 36], target: [-26, 5, 18] },
  { name: '塔区', pos: [4, 20, 46], target: [8, 9, 22] },
  { name: '产品球罐', pos: [44, 18, -14], target: [55, 5, -32] },
  { name: '配套区', pos: [-60, 32, 62], target: [-80, 6, 15] },
]

const EDGE = process.env.EDGE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
// 每轮运行独立 profile 目录 + 独立端口，避免残留 zombie Edge 抢占
const userData = join(here, '..', '.shots', `edge-profile-${process.pid}`)
mkdirSync(userData, { recursive: true })
mkdirSync(outDir, { recursive: true })

const port = 9333 + (process.pid % 977)
const edge = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userData}`,
  '--window-size=' + VW + ',' + VH,
  '--force-device-scale-factor=1',
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--disable-gpu-sandbox',
  '--no-first-run',
  '--disable-extensions',
  '--mute-audio',
  'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (r.ok) return (await r.json()).find(t => t.type === 'page')
    } catch { /* retry */ }
    await sleep(500)
  }
  throw new Error('CDP endpoint not reachable')
}

const target = await waitForCdp()
const ws = await new Promise((resolve, reject) => {
  const sock = new WebSocket(target.webSocketDebuggerUrl)
  sock.onopen = () => resolve(sock)
  sock.onerror = (e) => reject(new Error('ws error ' + e.message))
})
let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id)
    pending.delete(m.id)
    if (m.error) reject(new Error(JSON.stringify(m.error)))
    else resolve(m.result)
  }
}
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq
  pending.set(id, { resolve, reject })
  ws.send(JSON.stringify({ id, method, params }))
})
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error('page eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 400))
  return r.result?.value
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url })
  console.log('navigated, waiting for scene...')
  let ready = false
  for (let i = 0; i < 120 && !ready; i++) {
    await sleep(500)
    ready = await evalJs(`!!(window.__ps && window.__ps.diagram && window.__ps.diagram.renderer && window.__ps.diagram.scene)`)
  }
  if (!ready) throw new Error('scene not ready in 60s')
  await sleep(2000)

  // 隐藏 UI 覆盖层（干净帧，用于画面/闪烁分析）
  if (clean) {
    await evalJs(`(() => { const els = document.querySelectorAll('.toolbar,.panel,.func-bar,.hint,.legend,.trend'); els.forEach(e => e.style.display = 'none'); return true })()`)
    await sleep(300)
  }
  // fast 模式：关闭 SSAO（软件渲染最贵的一档），保留 bloom 用于闪烁定位
  if (fast) {
    await evalJs(`(() => { const ps = window.__ps; try { if (ps.ssaoPass) ps.ssaoPass.enabled = false } catch(e){}; return true })()`)
  }

  // ── 场景快照 ──
  const snap = await evalJs(`(() => {
    const ps = window.__ps, d = ps.diagram
    const out = {}
    out.renderer = { toneMapping: d.renderer.toneMapping, exposure: d.renderer.toneMappingExposure, dpr: d.renderer.getPixelRatio(), shadowType: d.renderer.shadowMap.type, shadowEnabled: d.renderer.shadowMap.enabled }
    out.camera = { near: d.camera.near, far: d.camera.far, pos: d.camera.position.toArray(), target: d.controls.target.toArray() }
    out.fog = d.scene.fog ? { color: '#' + d.scene.fog.color.getHexString(), near: d.scene.fog.near, far: d.scene.fog.far } : null
    out.environmentIntensity = d.scene.environmentIntensity
    const lights = []
    d.scene.traverse(o => { if (o.isLight) lights.push({ type: o.type, color: '#' + o.color.getHexString(), intensity: o.intensity, castShadow: o.castShadow, pos: o.position.toArray(), shadow: o.shadow ? { mapSize: [o.shadow.mapSize.width, o.shadow.mapSize.height], bias: o.shadow.bias, normalBias: o.shadow.normalBias, left: o.shadow.camera.left, right: o.shadow.camera.right, top: o.shadow.camera.top, bottom: o.shadow.camera.bottom, radius: o.shadow.radius } : null }) })
    out.lights = lights
    const em = []
    d.scene.traverse(o => { if (o.isMesh) { const m = Array.isArray(o.material) ? o.material[0] : o.material; if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0) em.push({ tag: o.userData.isBeacon ? 'BEACON' : o.userData.isLamp ? 'LAMP' : 'mesh', ei: m.emissiveIntensity }) } })
    out.emissiveCount = em.length
    out.emissiveIntensities = em.map(e => e.tag + ':' + e.ei.toFixed(2))
    out.invariants = (typeof window.__ps.invariants !== 'undefined') ? window.__ps.invariants : 'n/a'
    out.sizeAudit = (typeof window.__ps.sizeAudit !== 'undefined') ? window.__ps.sizeAudit : 'n/a'
    return JSON.stringify(out)
  })()`)
  writeFileSync(join(outDir, 'scene-snapshot.json'), snap, 'utf8')
  console.log('snapshot saved')
  const snapObj = JSON.parse(snap)
  console.log('invariants:', snapObj.invariants?.length ? 'VIOLATIONS ' + JSON.stringify(snapObj.invariants) : 'PASS（全部发光体满足阈值约束）')

  // ── R4 运行时发光采样校验：8s 内采样各动态发光体 min/max，对照 bloom 阈值 5 ──
  const invSample = await evalJs(`(async () => {
    const ps = window.__ps
    const sample = () => ({
      beacons: ps.beacons.map(b => b.material.emissiveIntensity),
      city: ps.cityBeacons.map(b => b.material.emissiveIntensity),
      flame: ps.flame ? [ps.flame.material.emissiveIntensity] : [],
    })
    const mins = { beacons: [], city: [], flame: [] }
    const maxs = { beacons: [], city: [], flame: [] }
    for (let i = 0; i < 10; i++) {
      const s = sample()
      for (const k of ['beacons', 'city', 'flame']) {
        s[k].forEach((v, j) => { mins[k][j] = Math.min(mins[k][j] ?? 99, v); maxs[k][j] = Math.max(maxs[k][j] ?? 0, v) })
      }
      await new Promise(r => setTimeout(r, 600))
    }
    return JSON.stringify({ mins, maxs, now: sample() })
  })()`)
  writeFileSync(join(outDir, 'invariant-sample.json'), invSample, 'utf8')
  const inv = JSON.parse(invSample)
  const THR = 5.0
  const rows = []
  for (const k of ['beacons', 'city', 'flame']) {
    inv.mins[k].forEach((mn, j) => {
      const mx = inv.maxs[k][j]
      const safe = mx < THR || mn > THR
      rows.push(`${k}[${j}] min=${mn.toFixed(2)} max=${mx.toFixed(2)} ${safe ? 'OK(单侧)' : '✗ 穿越阈值!'}`)
    })
  }
  console.log('runtime emission sampling (8s):')
  rows.forEach(r => console.log('  ' + r))
  const bad = rows.filter(r => r.includes('✗'))
  console.log(bad.length ? `RUNTIME INVARIANT FAIL: ${bad.length}` : 'runtime invariants PASS')

  // ── fps 测量 ──
  const fps = await evalJs(`new Promise(res => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res((n / ((performance.now() - t0) / 1000)).toFixed(1)) }; requestAnimationFrame(tick) })`)
  console.log('fps ~', fps)

  // ── 逐帧截取 ──
  const t0 = Date.now()
  if (tourshots) {
    // R4 近景多机位验收：每机位飞入 → 3 帧 → 时间方差分析
    const tourNames = []
    for (let ti = 0; ti < TOURS.length; ti++) {
      const tor = TOURS[ti]
      await evalJs(`(() => { const ps = window.__ps; ps.flyTo(${JSON.stringify(tor.pos)}, ${JSON.stringify(tor.target)}); return true })()`)
      await sleep(4500)
      for (let k = 0; k < 3; k++) {
        const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
        writeFileSync(join(outDir, `t${String(ti).padStart(2, '0')}-${k}.png`), Buffer.from(shot.data, 'base64'))
        await sleep(1300)
      }
      tourNames.push(tor.name)
      console.log(`tour ${ti + 1}/${TOURS.length} ${tor.name} captured`)
    }
    // 时间方差（页面 Canvas 分析：3 帧/机位 → maxTemporalStd / 热点计数）
    const dataUrls = tourNames.map((_, ti) => [0, 1, 2].map(k =>
      'data:image/png;base64,' + readFileSync(join(outDir, `t${String(ti).padStart(2, '0')}-${k}.png`)).toString('base64')))
    const tourAnalysis = await evalJs(`(async () => {
      const groups = ${JSON.stringify(dataUrls)};
      const AW = ${Math.round(VW * 0.25)}, AH = ${Math.round(VH * 0.25)};
      const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
      const ctx = cv.getContext('2d');
      const out = [];
      for (const g3 of groups) {
        const gs = [];
        for (const u of g3) {
          const img = new Image();
          await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = u });
          ctx.drawImage(img, 0, 0, AW, AH);
          const d = ctx.getImageData(0, 0, AW, AH).data;
          const g = new Float32Array(AW * AH);
          for (let p = 0; p < AW * AH; p++) g[p] = 0.299 * d[p * 4 + 2] + 0.587 * d[p * 4 + 1] + 0.114 * d[p * 4];
          gs.push(g);
        }
        const a = gs[0], b = gs[1], c = gs[2];
        let mx = 0, sum = 0, n = 0, hot = 0;
        for (let p = 0; p < AW * AH; p++) {
          const m = (a[p] + b[p] + c[p]) / 3;
          const sd = Math.sqrt((a[p] * a[p] + b[p] * b[p] + c[p] * c[p]) / 3 - m * m);
          if (sd > mx) mx = sd;
          if (sd > 20) hot++;
          sum += m; n++;
        }
        out.push({ mean: +(sum / n).toFixed(1), maxTemporalStd: +mx.toFixed(1), hotPx20: hot });
      }
      return JSON.stringify(out);
    })()`)
    const tourFinal = JSON.parse(tourAnalysis).map((r, i) => ({ name: tourNames[i], ...r }))
    writeFileSync(join(outDir, 'tourshot-analysis.json'), JSON.stringify(tourFinal, null, 2), 'utf8')
    console.log('--- tourshot analysis（3帧×~2.6s，mean/maxTemporalStd/hotPx>20）---')
    console.table(tourFinal)
    console.log('DONE tourshots ->', outDir)
  } else {
  for (let i = 0; i < frames; i++) {
    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    writeFileSync(join(outDir, `f${String(i).padStart(3, '0')}.png`), Buffer.from(shot.data, 'base64'))
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    console.log(`frame ${i + 1}/${frames} t=${elapsed}s`)
    await sleep(interval)
  }
  console.log('captured. analyzing...')

  // ── 像素分析（页面内 Canvas 解码 PNG，Node 侧聚合） ──
  const pngs = readdirSync(outDir).filter(n => /^f\d+\.png$/.test(n)).sort()
  const dataUrls = pngs.map(n => 'data:image/png;base64,' + readFileSync(join(outDir, n)).toString('base64'))
  const SCALE = 0.25 // 分析分辨率（1280*0.25=320）
  const AW = Math.round(VW * SCALE), AH = Math.round(VH * SCALE)
  const BX = 16, BY = 9
  const analyzeFn = `(async () => {
    const urls = ${JSON.stringify(dataUrls)};
    const AW = ${AW}, AH = ${AH}, BX = ${BX}, BY = ${BY};
    const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
    const ctx = cv.getContext('2d');
    const bw = AW / BX, bh = AH / BY;
    const framesG = [];
    for (let f = 0; f < urls.length; f++) {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = urls[f] });
      ctx.drawImage(img, 0, 0, AW, AH);
      const d = ctx.getImageData(0, 0, AW, AH).data;
      const g = new Float32Array(AW * AH);
      for (let p = 0; p < AW * AH; p++) g[p] = 0.299 * d[p*4+2] + 0.587 * d[p*4+1] + 0.114 * d[p*4];
      framesG.push(g);
    }
    // 全局统计
    const glob = framesG.map((g, fi) => {
      let sum = 0, sumSq = 0, hi = 0, lo = 0, n = 0;
      for (let y = 0; y < AH; y += 2) for (let x = 0; x < AW; x += 2) {
        const v = g[y * AW + x]; sum += v; sumSq += v * v; n++;
        if (v > 250) hi++; if (v < 6) lo++;
      }
      const mean = sum / n;
      return { frame: fi, mean: +(mean).toFixed(1), std: +Math.sqrt(sumSq / n - mean * mean).toFixed(1), hiPct: +(100 * hi / n).toFixed(2), loPct: +(100 * lo / n).toFixed(2) };
    });
    // 分块时间抖动
    const blocks = [];
    for (let by = 0; by < BY; by++) for (let bx = 0; bx < BX; bx++) {
      let acc = 0, accSq = 0, n = 0, accMean = 0;
      for (const g of framesG) {
        for (let y = Math.floor(by * bh); y < Math.floor((by + 1) * bh); y += 2) {
          for (let x = Math.floor(bx * bw); x < Math.floor((bx + 1) * bw); x += 2) {
            const v = g[y * AW + x]; acc += v; accSq += v * v; accMean += v; n++;
          }
        }
      }
      const m = accMean / n;
      blocks.push({ bx, by, std: +Math.sqrt(accSq / n - m * m).toFixed(1), mean: +m.toFixed(1) });
    }
    blocks.sort((a, b) => b.std - a.std);
    return JSON.stringify({ glob, blocks });
  })()`
  const analysis = await evalJs(analyzeFn)
  writeFileSync(join(outDir, 'analysis.json'), analysis, 'utf8')
  const a = JSON.parse(analysis)
  console.log('--- global per-frame (mean/std/hi%/lo%) ---')
  console.table(a.glob)
  console.log('--- top-12 flicker blocks (std over time) ---')
  a.blocks.slice(0, 12).forEach(b => console.log(`bx=${b.bx} by=${b.by} std=${b.std} mean=${b.mean}`))
  console.log('saved analysis.json')
  console.log('DONE ->', outDir)
  }
} finally {
  try { ws.close() } catch { }
  // 进程树清理（Edge 子进程不随父进程退出），再删独有 profile
  try {
    execFileSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch { /* 已退出 */ }
  try { rmSync(userData, { recursive: true, force: true }) } catch { }
}