// firecrawl MCP 调研脚本（keyless：firecrawl_search / firecrawl_scrape 免费，按 IP 限频）
// 用法：node scripts/firecrawl-research.mjs --out docs/research/firecrawl-raw.json
// 通过 stdio JSON-RPC 与 firecrawl-mcp 通信，搜索知名厂商 3D 工业/工厂可视化作品
// 并抓取代表性页面，输出原始结果供分析。

import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'

const outFile = process.argv[process.argv.indexOf('--out') + 1] ?? 'docs/research/firecrawl-raw.json'

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
  clientInfo: { name: 'dsh-research', version: '1.0' },
})
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')

const tools = await call('tools/list')
const toolNames = (tools.tools ?? []).map(t => t.name)
console.log('TOOLS:', toolNames.join(', '))

const results = {}
const queries = [
  { q: 'three.js industrial 3D scene realistic lighting shadows materials showcase', n: 5 },
  { q: 'chemical plant digital twin 3D visualization case AVEVA Hexagon Bentley showcase', n: 5 },
  { q: 'Unity Unreal Engine industrial environment art direction lighting reference', n: 5 },
  { q: '3D 化工厂 数字孪生 可视化 案例 效果图 材质 光影', n: 5 },
]

for (const { q, n } of queries) {
  try {
    const r = await call('tools/call', {
      name: 'firecrawl_search',
      arguments: { query: q, limit: n },
    })
    const txt = (r.content ?? []).map(c => c.text ?? '').join('\n')
    results['search:' + q] = txt
    console.log('SEARCH OK:', q)
  } catch (e) {
    results['search:' + q] = 'ERROR: ' + e.message
    console.log('SEARCH FAIL:', q, e.message.slice(0, 200))
  }
  await new Promise(r => setTimeout(r, 1200)) // 限频礼让
}

// 从搜索结果中挑出合适 URL 抓取（若上述搜索有结果，正则抽 URL）
const urlCandidates = []
const urlRe = /https?:\/\/[^\s"'<>)\]]+/g
for (const v of Object.values(results)) {
  for (const m of String(v).matchAll(urlRe)) {
    const u = m[0]
    if (!/firecrawl|mcp\.|github\.com\/firecrawl/.test(u) && urlCandidates.length < 40) urlCandidates.push(u)
  }
}
const prefers = urlCandidates.filter(u => /threejs|three\.js|unrealengine|unity|omniverse|aveva|hexagon|bentley|digital.?twin|visio|twin|3d/.test(u)).slice(0, 6)
console.log('SCRAPE CANDIDATES:', prefers.length)
for (const u of prefers) {
  try {
    const r = await call('tools/call', {
      name: 'firecrawl_scrape',
      arguments: { url: u, formats: ['markdown'], onlyMainContent: true, maxDepth: 0, timeout: 20000 },
    })
    const txt = (r.content ?? []).map(c => c.text ?? '').join('\n')
    // 截断超长内容（保留前 12k 字符）
    results['scrape:' + u] = txt.length > 12000 ? txt.slice(0, 12000) + '\n...[TRUNCATED]' : txt
    console.log('SCRAPE OK:', u)
  } catch (e) {
    results['scrape:' + u] = 'ERROR: ' + e.message
    console.log('SCRAPE FAIL:', u, e.message.slice(0, 200))
  }
  await new Promise(r => setTimeout(r, 1500))
}

mkdirSync('docs/research', { recursive: true })
writeFileSync(outFile, JSON.stringify({ log: logs.slice(-30), results }, null, 2), 'utf8')
console.log('WROTE:', outFile)
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name: 'echo', arguments: {} } }) + '\n')
child.kill()
process.exit(0)