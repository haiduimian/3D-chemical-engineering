// firecrawl 视觉调研脚本（N1：大厂 3D 视觉规范——配色/材质/阴影/光效/布局/样式）
// keyless：firecrawl_search / firecrawl_scrape 免费，按 IP 限频
// 用法：node scripts/firecrawl-visual.mjs --out docs/research/firecrawl-visual-raw.json
// 通过 stdio JSON-RPC 与 firecrawl-mcp 通信。
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'

const outFile = process.argv[process.argv.indexOf('--out') + 1] ?? 'docs/research/firecrawl-visual-raw.json'

const child = spawn('npx', ['firecrawl-mcp'], { shell: true })
let buf = ''
const pending = new Map()
let nextId = 1
const logs = []

child.stdout.on('data', (d) => {
  buf += d.toString()
  let idx
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim()
    buf = buf.slice(idx + 1)
    if (!line) continue
    let m
    try { m = JSON.parse(line) } catch { logs.push('UNPARSE: ' + line.slice(0, 200)); continue }
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      if (m.error) reject(new Error(JSON.stringify(m.error)))
      else resolve(m.result)
    } else if (m.method === 'logMessage') {
      logs.push(m.params?.message ?? '')
    }
  }
})
child.stderr.on('data', (d) => logs.push('STDERR: ' + d.toString().slice(0, 300)))

const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++
  pending.set(id, { resolve, reject })
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
})

await call('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'dsh-visual-research', version: '1.0' },
})
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')

const tools = await call('tools/list')
console.log('TOOLS:', (tools.tools ?? []).map(t => t.name).join(', '))

const results = {}
// N1 专项：大厂 3D 可视化视觉规范——配色/材质/阴影/光效/布局/样式/昼夜氛围
const queries = [
  { q: 'NVIDIA Omniverse industrial digital twin realistic lighting material tips color grading', n: 5 },
  { q: 'Bentley iTwin AVEVA 3D chemical plant visualization visual style color palette lighting', n: 5 },
  { q: 'three.js webgl realistic industrial scene dusk night lighting art direction practices', n: 5 },
  { q: 'Blender Cycles industrial environment art direction warm lighting material roughness metal workflow', n: 5 },
  { q: '3D 可视化大屏 化工 数字孪生 配色方案 夜间模式 灯光 风格', n: 5 },
  { q: 'Unreal Engine 5 industrial scene lighting guide warm contrast teal orange color palette', n: 5 },
]

for (const { q, n } of queries) {
  try {
    const r = await call('tools/call', {
      name: 'firecrawl_search',
      arguments: { query: q, limit: n },
    })
    const txt = (r.content ?? []).map(c => c.text ?? '').join('\n')
    results['search:' + q] = txt
    console.log('SEARCH OK:', q.slice(0, 60))
  } catch (e) {
    results['search:' + q] = 'ERROR: ' + e.message
    console.log('SEARCH FAIL:', q.slice(0, 60), e.message.slice(0, 150))
  }
  await new Promise(r => setTimeout(r, 1200))
}

const urlRe = /https?:\/\/[^\s"'<>)\]]+/g
const urlCandidates = []
for (const v of Object.values(results)) {
  for (const m of String(v).matchAll(urlRe)) {
    const u = m[0]
    if (!/firecrawl|mcp\.|github\.com\/firecrawl/.test(u) && urlCandidates.length < 60) urlCandidates.push(u)
  }
}
const prefers = urlCandidates
  .filter(u => /unrealengine|unity|omniverse|aveva|bentley|blender|threejs|digital.?twin|artstation|polycount|zhihu|csdn|bilibili/.test(u))
  .slice(0, 6)
console.log('SCRAPE CANDIDATES:', prefers.length)
for (const u of prefers) {
  try {
    const r = await call('tools/call', {
      name: 'firecrawl_scrape',
      arguments: { url: u, formats: ['markdown'], onlyMainContent: true, maxDepth: 0, timeout: 20000 },
    })
    const txt = (r.content ?? []).map(c => c.text ?? '').join('\n')
    results['scrape:' + u] = txt.length > 12000 ? txt.slice(0, 12000) + '\n...[TRUNCATED]' : txt
    console.log('SCRAPE OK:', u.slice(0, 90))
  } catch (e) {
    results['scrape:' + u] = 'ERROR: ' + e.message
    console.log('SCRAPE FAIL:', u.slice(0, 90), e.message.slice(0, 150))
  }
  await new Promise(r => setTimeout(r, 1500))
}

mkdirSync('docs/research', { recursive: true })
writeFileSync(outFile, JSON.stringify({ log: logs.slice(-30), results }, null, 2), 'utf8')
console.log('WROTE:', outFile)
child.kill()
process.exit(0)