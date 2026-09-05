import * as THREE from 'three'

/**
 * 程序化纹理库 v2 —— CanvasTexture 生成，零外部资源
 * 新增：污损贴图（油渍/划痕/氧化斑）、法线贴图生成器（高度图→切线空间法线）
 * 所有纹理按 key 缓存复用；wrap 均设为 RepeatWrapping
 */

const cache = new Map<string, THREE.CanvasTexture>()

function canvasTex(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, rx = 1, ry = 1) {
  if (cache.has(key)) return cache.get(key)!
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  draw(ctx, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(rx, ry)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8 // 各向异性过滤：斜视角下地面纹理不发糊
  cache.set(key, tex)
  return tex
}

/** 线性色彩空间纹理（roughness/法线贴图专用，不可 sRGB） */
function linearTex(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, rx = 1, ry = 1) {
  if (cache.has(key)) return cache.get(key)!
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  draw(ctx, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(rx, ry)
  tex.colorSpace = THREE.LinearSRGBColorSpace
  tex.anisotropy = 8
  cache.set(key, tex)
  return tex
}

/**
 * 高度图 → 切线空间法线贴图（Sobel 差分）
 * drawHeight 在灰度上绘制高度信息，转换后输出 RGB 法线
 */
export function normalFromHeight(key: string, w: number, h: number, drawHeight: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, strength = 1.5, rx = 1, ry = 1): THREE.CanvasTexture {
  const cacheKey = `normal_${key}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)!
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  drawHeight(ctx, w, h)
  const src = ctx.getImageData(0, 0, w, h)
  const out = ctx.createImageData(w, h)
  const hAt = (x: number, y: number) => src.data[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (hAt(x - 1, y) - hAt(x + 1, y)) * strength
      const dy = (hAt(x, y - 1) - hAt(x, y + 1)) * strength
      const len = Math.sqrt(dx * dx + dy * dy + 1)
      const i = (y * w + x) * 4
      out.data[i] = ((dx / len) * 0.5 + 0.5) * 255
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255
      out.data[i + 3] = 255
    }
  }
  ctx.putImageData(out, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(rx, ry)
  tex.colorSpace = THREE.LinearSRGBColorSpace
  tex.anisotropy = 8
  cache.set(cacheKey, tex)
  return tex
}

/** 保温铝皮横纹（塔身/罐体包覆层）：浅灰底 + 波纹横条 + 竖向拼缝 + 金属噪点
 *  R3：256→512px；新增雨渍竖痕 + 锈蚀斑（做旧层次） */
export function jacketTexture(): THREE.CanvasTexture {
  return canvasTex('jacket', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#aeb6bd'
    ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 32) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)'
      ctx.fillRect(0, y, w, 6)
      ctx.fillStyle = 'rgba(60,68,78,0.14)'
      ctx.fillRect(0, y + 6, w, 6)
    }
    ctx.fillStyle = 'rgba(70,78,88,0.35)'
    for (let x = 64; x < w; x += 128) ctx.fillRect(x, 0, 3, h)
    ctx.fillStyle = 'rgba(120,128,138,0.6)'
    for (let x = 48; x < w; x += 128) {
      for (let y = 16; y < h; y += 64) {
        ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill()
      }
    }
    // 雨渍竖痕（环氧涂层顺流的水渍，略亮）
    for (let i = 0; i < 10; i++) {
      const x = Math.random() * w
      const len = 60 + Math.random() * 220
      ctx.strokeStyle = `rgba(220,228,236,${0.10 + Math.random() * 0.10})`
      ctx.lineWidth = 2 + Math.random() * 4
      ctx.beginPath(); ctx.moveTo(x, Math.random() * h)
      ctx.lineTo(x + (Math.random() - 0.5) * 12, Math.min(h, (Math.random() * h) + len))
      ctx.stroke()
    }
    // 锈蚀斑（保温铝皮包角/拼缝处氧化，暖褐）
    for (let i = 0; i < 6; i++) {
      const x = Math.random() * w, y = Math.random() * h
      const r = 14 + Math.random() * 44
      const g = ctx.createRadialGradient(x, y, 0, x, y, r)
      g.addColorStop(0, `rgba(150,98,58,${0.10 + Math.random() * 0.12})`)
      g.addColorStop(1, 'rgba(150,98,58,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
    for (let i = 0; i < 8800; i++) {
      const v = 170 + Math.random() * 70 | 0
      ctx.fillStyle = `rgba(${v},${v + 4},${v + 8},${0.05 + Math.random() * 0.08})`
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1)
    }
  }, 3, 4)
}

/** 保温铝皮法线贴图（波纹横条起伏 + 搭接缝凹槽） */
export function jacketNormal(): THREE.CanvasTexture {
  return normalFromHeight('jacket', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#808080'
    ctx.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 32) {
      ctx.fillStyle = '#a0a0a0'
      ctx.fillRect(0, y, w, 6)
      ctx.fillStyle = '#606060'
      ctx.fillRect(0, y + 6, w, 6)
    }
    ctx.fillStyle = '#484848'
    for (let x = 64; x < w; x += 128) ctx.fillRect(x, 0, 4, h)
  }, 2.0, 3, 4)
}

/** 工程漆面（反应器/泵/罐体）：底色 + 细噪点 + 轻微扫掠光斑 */
export function paintedTexture(baseColor: number): THREE.CanvasTexture {
  const hex = '#' + baseColor.toString(16).padStart(6, '0')
  return canvasTex(`painted_${baseColor}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = hex
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 5000; i++) {
      const light = Math.random() > 0.5
      ctx.fillStyle = light ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.05)'
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4)
    }
    const grad = ctx.createLinearGradient(0, 0, w, 0)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(0.45, 'rgba(255,255,255,0.06)')
    grad.addColorStop(0.55, 'rgba(255,255,255,0)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  }, 2, 3)
}

/** 漆面法线贴图（喷涂橘皮颗粒微起伏） */
export function paintedNormal(): THREE.CanvasTexture {
  return normalFromHeight('painted', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#808080'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 2600; i++) {
      const v = 110 + Math.random() * 60 | 0
      ctx.fillStyle = `rgb(${v},${v},${v})`
      ctx.beginPath()
      ctx.arc(Math.random() * w, Math.random() * h, 0.6 + Math.random() * 1.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }, 0.8, 2, 3)
}

/** 拉丝不锈钢（换热器/裸露管段）：浅底 + 竖向拉丝微痕 */
export function brushedSteelTexture(): THREE.CanvasTexture {
  return canvasTex('brushed', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#a4adb5'
    ctx.fillRect(0, 0, w, h)
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = `rgba(${140 + Math.random() * 60 | 0},${148 + Math.random() * 60 | 0},${158 + Math.random() * 60 | 0},0.16)`
      ctx.fillRect(x, 0, 1, h)
    }
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    ctx.fillRect(0, h * 0.35, w, 2)
  }, 3, 3)
}

/** 拉丝钢法线贴图（竖向拉丝痕） */
export function brushedNormal(): THREE.CanvasTexture {
  return normalFromHeight('brushed', 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#808080'
    ctx.fillRect(0, 0, w, h)
    for (let x = 0; x < w; x++) {
      const v = 116 + Math.random() * 24 | 0
      ctx.fillStyle = `rgb(${v},${v},${v})`
      ctx.fillRect(x, 0, 1, h)
    }
  }, 0.6, 3, 3)
}

/** 混凝土：浅灰底 + 骨料颗粒 + 接缝 + 少量油渍（整洁工业地坪，明亮不压暗）
 *  v11：256→512px、repeat 6x4→10x6 —— 单 tile 由 ~36m 缩至 ~22m，纹素密度
 *  提升 3 倍+（7px/m → 23px/m），消除拉远/俯视时地面"糊"（大厂统一纹素密度基准） */
export function concreteTexture(): THREE.CanvasTexture {
  return canvasTex('concrete', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#8d939a' // 浅灰底（提亮，避免黄昏下地面发黑）
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 10000; i++) {
      const v = 120 + Math.random() * 60 | 0
      ctx.fillStyle = `rgba(${v},${v},${v + 3},${0.10 + Math.random() * 0.12})`
      ctx.beginPath()
      ctx.arc(Math.random() * w, Math.random() * h, 0.8 + Math.random() * 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
    // 少量油渍暗斑（保留使用痕迹但控制面积/深度）
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * w, y = Math.random() * h
      const r = 10 + Math.random() * 34
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, `rgba(52,56,62,${0.08 + Math.random() * 0.08})`)
      grad.addColorStop(1, 'rgba(52,56,62,0)')
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
    // 模板分缝（浅色，不挖黑）+ 随机细裂缝（做旧）
    ctx.strokeStyle = 'rgba(70,76,84,0.4)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(8, 8, w - 16, h - 16)
    ctx.strokeStyle = 'rgba(60,66,74,0.25)'
    ctx.lineWidth = 1
    for (let i = 0; i < 6; i++) {
      const x = Math.random() * w, y = Math.random() * h
      ctx.beginPath(); ctx.moveTo(x, y)
      ctx.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60)
      ctx.stroke()
    }
  }, 10, 6)
}

/** 混凝土地坪法线贴图（骨料微凸 + 分缝凹槽，低强度保持平整感） */
export function concreteNormal(): THREE.CanvasTexture {
  return normalFromHeight('concrete', 512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#808080'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 5600; i++) {
      const v = 118 + Math.random() * 28 | 0
      ctx.fillStyle = `rgb(${v},${v},${v})`
      ctx.beginPath()
      ctx.arc(Math.random() * w, Math.random() * h, 0.8 + Math.random() * 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = '#5c5c5c'
    ctx.lineWidth = 2
    ctx.strokeRect(8, 8, w - 16, h - 16)
  }, 0.55, 10, 6)
}

/** 镀锌结构钢：灰底 + 锌花斑驳 */
export function galvanizedTexture(): THREE.CanvasTexture {
  return canvasTex('galvanized', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#7d838a'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 1200; i++) {
      const v = 110 + Math.random() * 60 | 0
      ctx.fillStyle = `rgba(${v + 10},${v + 8},${v},${0.10 + Math.random() * 0.14})`
      ctx.beginPath()
      ctx.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }, 2, 2)
}

/** 耐磨橡胶（联轴器护罩/密封圈）：近黑细纹 */
export function rubberTexture(): THREE.CanvasTexture {
  return canvasTex('rubber', 64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#23262b'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.10)'
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1)
    }
  })
}

/**
 * 污损粗糙度贴图（roughnessMap）：0.78 灰基准 + 油渍磨亮（光滑）+ 风化斑（粗糙）
 * 叠加到材质上后，表面出现局部粗糙度变化 → 破除"刚出厂"的塑料感
 */
export function grimeRoughness(key = 'grime'): THREE.CanvasTexture {
  return linearTex(`grime_${key}`, 256, 256, (ctx, w, h) => {
    // 基准 0.78 灰：材质 roughness 参数按 /0.78 补偿，使平均粗糙度≈设定值
    ctx.fillStyle = '#c8c8c8'
    ctx.fillRect(0, 0, w, h)
    // 油渍（更光滑 → 深灰，油腻反光感）
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * w, y = Math.random() * h
      const r = 6 + Math.random() * 30
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, `rgba(96,96,96,${0.3 + Math.random() * 0.3})`)
      grad.addColorStop(1, 'rgba(96,96,96,0)')
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
    // 磨亮划痕（更光滑 → 浅灰）
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = `rgba(150,150,150,${0.12 + Math.random() * 0.15})`
      ctx.lineWidth = 0.8 + Math.random() * 1.2
      const x = Math.random() * w, y = Math.random() * h
      const a = Math.random() * Math.PI
      const len = 10 + Math.random() * 40
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len)
      ctx.stroke()
    }
    // 顶部风化粗糙带（更粗糙 → 近白）
    for (let i = 0; i < 12; i++) {
      const x = Math.random() * w, y = Math.random() * h * 0.5
      const r = 8 + Math.random() * 20
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, `rgba(245,245,245,${0.15 + Math.random() * 0.2})`)
      grad.addColorStop(1, 'rgba(245,245,245,0)')
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
    // 底部积灰带（重力方向脏污，底部略光滑）
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, 'rgba(150,150,150,0)')
    grad.addColorStop(1, 'rgba(140,140,140,0.25)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  }, 2, 2)
}

/** 污损 AO 贴图（aoMap）：轻度积灰暗化（低强度，避免地面/设备整体发黑） */
export function grimeAO(key = 'grime'): THREE.CanvasTexture {
  return linearTex(`grimeao_${key}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 12; i++) {
      const x = Math.random() * w, y = Math.random() * h
      const r = 10 + Math.random() * 30
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, `rgba(170,170,170,${0.10 + Math.random() * 0.12})`)
      grad.addColorStop(1, 'rgba(170,170,170,0)')
      ctx.fillStyle = grad
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
    }
    // 底部轻度积灰
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, 'rgba(180,180,180,0)')
    grad.addColorStop(1, 'rgba(170,170,170,0.18)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  }, 2, 2)
}
