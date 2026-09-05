// 快速天空亮度诊断：解码 PNG，输出顶部 45% 区域的灰度均值/均差对比
import { readFileSync } from 'node:fs'
import zlib from 'node:zlib'

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
      let x
      switch (f) {
        case 0: x = line[i]; break
        case 1: x = (line[i] + a) & 255; break
        case 2: x = (line[i] + b) & 255; break
        case 3: x = (line[i] + ((a + b) >> 1)) & 255; break
        case 4:
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
          x = (line[i] + pr) & 255; break
        default: throw new Error('filter ' + f)
      }
      cur[i] = x
    }
    prev = cur
  }
  return { w, h, ch, out }
}

const files = process.argv.slice(2)
for (const f of files) {
  const { w, h, ch, out } = decodePNG(readFileSync(f))
  // 顶部 45% / 中部 45~70% / 底部 70~100%
  const regions = [[0, 0.45], [0.45, 0.7], [0.7, 1]]
  const stats = regions.map(([y0, y1]) => {
    let sum = 0, n = 0, rSum = 0, bSum = 0
    for (let y = Math.floor(h * y0); y < Math.floor(h * y1); y++) {
      for (let x = 0; x < w; x += 2) {
        const p = (y * w + x) * ch
        const r = out[p], g = out[p + 1], b = out[p + 2]
        sum += 0.299 * r + 0.587 * g + 0.114 * b
        rSum += r; bSum += b; n++
      }
    }
    return { y0: y0.toFixed(2), mean: +(sum / n).toFixed(1), warmRB: +((rSum - bSum) / n).toFixed(1) }
  })
  console.log(f.split(/[\\/]/).slice(-2).join('/'), JSON.stringify(stats))
}