// 逐像素时间方差分析（纯 Node PNG 解码，无外部依赖）
// 用法：node scripts/pngdiff.mjs .shots/frames-r0 .shots/frames-r1
// 输出：每个 run 的像素级时间 std 热区 + run 间差异
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import zlib from 'node:zlib'

// ── 极简 PNG 解码（8-bit RGB/RGBA） ──
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
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) throw new Error(`unsupported png bitDepth=${bitDepth} colorType=${colorType}`)
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

function analyzeRun(dir, out) {
  const files = readdirSync(dir).filter(n => /^f\d+\.png$/.test(n)).sort()
  if (!files.length) throw new Error('no frames in ' + dir)
  const first = decodePNG(readFileSync(join(dir, files[0])))
  const W = first.w, H = first.h
  // 缩小到分析分辨率（~320x180）
  const AW = 320, AH = Math.round(H * AW / W)
  const sx = AW / W, sy = AH / H
  const sum = new Float64Array(AW * AH)
  const sumSq = new Float64Array(AW * AH)
  const globalSums = []
  for (const f of files) {
    const img = decodePNG(readFileSync(join(dir, f)))
    let gsum = 0, n = 0
    for (let ay = 0; ay < AH; ay++) {
      const y = Math.min(H - 1, Math.floor(ay / sy))
      const row = y * img.w * img.ch
      for (let ax = 0; ax < AW; ax++) {
        const x = Math.min(W - 1, Math.floor(ax / sx))
        const i = row + x * img.ch
        const lum = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
        const p = ay * AW + ax
        sum[p] += lum; sumSq[p] += lum * lum
        gsum += lum; n++
      }
    }
    globalSums.push(gsum / n)
  }
  const N = files.length
  const meanG = globalSums.reduce((a, b) => a + b, 0) / N
  // std 图
  const stdMap = new Float64Array(AW * AH)
  let maxStd = 0
  for (let p = 0; p < AW * AH; p++) {
    const m = sum[p] / N
    const sd = Math.sqrt(Math.max(0, sumSq[p] / N - m * m))
    stdMap[p] = sd
    if (sd > maxStd) maxStd = sd
  }
  // 全局均值/方差（采样）
  const globStd = Math.sqrt(globalSums.reduce((a, v) => a + (v - meanG) ** 2, 0) / N)
  // 高方差聚类：把 std 图分成 8x5 块找能量
  const BX = 8, BY = 5
  const blocks = []
  for (let by = 0; by < BY; by++) for (let bx = 0; bx < BX; bx++) {
    let acc = 0, n = 0
    for (let ay = Math.floor(by * AH / BY); ay < Math.floor((by + 1) * AH / BY); ay++)
      for (let ax = Math.floor(bx * AW / BX); ax < Math.floor((bx + 1) * AW / BX); ax++) { acc += stdMap[ay * AW + ax]; n++ }
    blocks.push({ bx, by, stdEnergy: +(acc / n).toFixed(1) })
  }
  blocks.sort((a, b) => b.stdEnergy - a.stdEnergy)
  console.log(`\n=== ${dir} ===`)
  console.log(`frames=${N} globalMean=${meanG.toFixed(1)} globalStd=${globStd.toFixed(2)} maxPixelStd=${maxStd.toFixed(1)}`)
  console.log('top-10 std-energy blocks (8x5 grid):')
  blocks.slice(0, 10).forEach(b => console.log(`  bx=${b.bx} by=${b.by} e=${b.stdEnergy}`))
  // 峰值像素簇（固定阈值 30，跨 run 可比）
  const th = 30
  const hot = []
  for (let ay = 0; ay < AH; ay++) for (let ax = 0; ax < AW; ax++) if (stdMap[ay * AW + ax] > th) hot.push([ax, ay])
  let clusters = []
  if (hot.length) {
    // 简单聚类（网格去重）
    const clustersTmp = []
    for (const [hx, hy] of hot) {
      const c = clustersTmp.find(c => Math.abs(c.x - hx) < 12 && Math.abs(c.y - hy) < 12)
      if (c) { c.x = (c.x + hx) / 2; c.y = (c.y + hy) / 2; c.n++ } else clustersTmp.push({ x: hx, y: hy, n: 1 })
    }
    clusters = clustersTmp
  }
  if (hot.length) {
    clusters.sort((a, b) => b.n - a.n)
    console.log(`hot-pixel clusters (std>${th}): ${hot.length} px`)
    clusters.slice(0, 8).forEach(c => console.log(`  center=(${Math.round(c.x * 4)},${Math.round(c.y * 4)}) @1280x720 px=${c.n}`))
  } else {
    console.log(`hot-pixel clusters (std>${th}): NONE`)
  }
  out.mean = meanG
  out.globStd = globStd
  out.maxStd = maxStd
  out.blocks = blocks
  out.hot = clusters
}

const d0 = process.argv[2], d1 = process.argv[3]
const r0 = {}, r1 = {}
analyzeRun(d0, r0)
analyzeRun(d1, r1)
console.log('\n=== R0 vs R1 差异 ===')
console.log(`globalMean: ${r0.mean.toFixed(2)} -> ${r1.mean.toFixed(2)} (${(r1.mean - r0.mean).toFixed(2)})`)
console.log(`globalStd:  ${r0.globStd.toFixed(3)} -> ${r1.globStd.toFixed(3)} (total temporal motion)`)
console.log(`maxPixelStd: ${r0.maxStd.toFixed(1)} -> ${r1.maxStd.toFixed(1)}`)
const diff = r0.blocks.map((b, i) => ({ ...b, e1: r1.blocks[i].stdEnergy, d: +(r1.blocks[i].stdEnergy - b.stdEnergy).toFixed(1) }))
console.log('per-block std-energy delta (top 6 by abs delta):')
diff.sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 6).forEach(b => console.log(`  bx=${b.bx} by=${b.by} e0=${b.stdEnergy} e1=${b.e1} d=${b.d}`))