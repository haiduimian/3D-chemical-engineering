// 验证 GitHub Pages 部署是否正常
const base = 'https://haiduimian.github.io/3D-chemical-engineering/'
const r = await fetch(base)
const t = await r.text()
console.log('index status =', r.status)
const js = t.match(/src="([^"]+\.js)"/)
console.log('js ref:', js ? js[1] : 'NONE')
if (js) {
  const r2 = await fetch('https://haiduimian.github.io' + js[1])
  console.log('js status =', r2.status, ' size =', (await r2.arrayBuffer()).byteLength)
}
const css = t.match(/href="([^"]+\.css)"/)
if (css) {
  const r3 = await fetch('https://haiduimian.github.io' + css[1])
  console.log('css status =', r3.status)
}
const r4 = await fetch(base + 'points.json')
console.log('points.json status =', r4.status)