// 调试脚本：定位页面加载后 window.__ps 未设置的原因
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const profile = `.shots\\dbg-profile-${process.pid}`
mkdirSync(profile, { recursive: true })
const port = 9400 + (process.pid % 500)
const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--window-size=1280,720', '--force-device-scale-factor=1',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-first-run', '--disable-extensions',
  'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (r.ok) {
        const l = await r.json()
        const p = l.find(t => t.type === 'page')
        if (p) return p
      }
    } catch { }
    await sleep(400)
  }
  throw new Error('no CDP')
}
try {
  const target = await getTarget()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)
  let id = 0
  const pend = new Map()
  const logs = []
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data)
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); return }
    if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text ?? '').slice(0, 800))
    else if (m.method === 'Runtime.consoleAPICalled') { const t = m.params.args.map(a => a.value ?? a.description ?? '').join(' '); logs.push(`${m.params.type}: ` + t.slice(0, 300)) }
    else if (m.method === 'Log.entryAdded') logs.push('LOG: ' + (m.params.entry.text ?? '').slice(0, 300))
  }
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs=[];addEventListener('error',e=>window.__errs.push('ERR:'+(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__errs.push('REJ:'+String(e.reason)));` })
  await send('Page.navigate', { url: 'http://localhost:5180/3D-chemical-engineering/' })
  await sleep(15000)
  console.log('STATE:', await ev(`JSON.stringify({ hasScene: !!window.__ps, errs: (window.__errs||[]).slice(0,10), bodyLen: document.body.innerHTML.length, hasViteErr: !!document.querySelector('vite-error-overlay') })`))
  // 手动触发 App 挂载后检查场景构造函数
  console.log('CHECK scene prop:', await ev(`JSON.stringify({ ps: window.__ps ? 'yes' : 'no' })`))
  logs.slice(0, 30).forEach(l => console.log(l))
  ws.close()
} finally {
  try { execFileSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { }
  try { rmSync(profile, { recursive: true, force: true }) } catch { }
}