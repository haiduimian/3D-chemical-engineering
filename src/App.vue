<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { PlantScene } from './scene/PlantScene'
import { EQUIPMENTS, CAMERA_TOURS, PIPES } from './layout/plantLayout'
import { PORTS } from './layout/ports'
import { TAG_MAP, loadTagMap, type DeviceState } from './data/processData'
import { SopEngine, SOP_STARTUP, SOP_SHUTDOWN } from './training/sop'

const container = ref<HTMLDivElement>()
const mode = ref<'VIEW' | 'ANALYZE'>('VIEW')
const selectedId = ref<string | null>(null)
const liveValues = ref<Record<string, number>>({})
const alarms = ref<string[]>([])
const deviceStates = ref<Record<string, DeviceState>>({})
let scene: PlantScene | null = null

// 功能面板状态
const showHazard = ref(false)
const heatOn = ref(false)
const patrolOn = ref(false)
const patrolMsg = ref('')
const patrolDone = ref(0)
const scenarioMsg = ref('')
const playing = ref(false)
const tourOn = ref(false)
const searchId = ref('')
const trendValues = ref<number[]>([])
const trendCanvas = ref<HTMLCanvasElement>()
const trendTag = ref('')

// SOP 培训
const sopPanel = ref<null | { title: string; step: string; msg: string; done: boolean; score: number | null; progress: string }>(null)
let sopEngine: SopEngine | null = null

// Edge 检测：右键手势（前进/返回）为浏览器进程级功能，网页无法阻止；若右键旋转受干扰需关闭手势
const isEdge = /Edg\//.test(navigator.userAgent)
const edgeTip = ref(isEdge ? 'Edge 检测：右键拖拽可能触发浏览器手势（前进/返回）。若右键旋转失灵，请在 edge://settings/mouseGesture 关闭「鼠标手势」后刷新' : '')

const selected = computed(() => EQUIPMENTS.find(e => e.id === selectedId.value) ?? null)
const selectedTags = computed(() => Object.entries(TAG_MAP).filter(([, d]) => d.elementId === selectedId.value))
const selectedStatus = computed(() => selectedId.value ? deviceStates.value[selectedId.value]?.status ?? null : null)
const connectedPipes = computed(() => {
  if (!selectedId.value) return []
  const id = selectedId.value
  return PIPES.filter(p => PORTS[p.from]?.elementId === id || PORTS[p.to]?.elementId === id || (p.via ?? []).some(v => v.pump === id))
})

onMounted(() => {
  if (!container.value) return
  scene = new PlantScene(container.value)
  scene.onModeChange = m => (mode.value = m)
  scene.onSelect = id => (selectedId.value = id)
  scene.onData = (points, alarmTags, states) => {
    liveValues.value = points
    alarms.value = alarmTags
    deviceStates.value = states
    // 趋势图数据（选中设备首个 tag）
    if (selectedId.value) {
      const tag = Object.keys(TAG_MAP).find(t => TAG_MAP[t].elementId === selectedId.value)
      if (tag && points[tag] !== undefined) {
        trendTag.value = tag
        trendValues.value.push(points[tag])
        if (trendValues.value.length > 40) trendValues.value.shift()
        drawTrend()
      }
    }
  }
  scene.onScenario = (type, dev) => {
    scenarioMsg.value = `⚠ 模拟${type === 'leak' ? '气体泄漏' : '着火'}：${dev}，请按应急预案处置！`
  }
  scene.onScenarioEnd = () => { scenarioMsg.value = '✅ 事故演练已复位' }
  scene.onPatrolLock = locked => { if (!locked) { patrolOn.value = false; patrolMsg.value = '已退出巡检模式' } }
  scene.onPatrolCheck = (_, name) => {
    patrolDone.value++
    patrolMsg.value = `✓ 巡检点「${name}」打卡完成（${patrolDone.value}/3）`
  }
  scene.onTourStop = () => { tourOn.value = false }
  scene.start()
  // 外置点位表加载（points.json，走 Vite base 前缀以兼容子路径部署）
  fetch(import.meta.env.BASE_URL + 'points.json').then(r => r.json()).then(d => { if (d?.tags) loadTagMap(d.tags) }).catch(() => {})
})

function setMode(m: 'VIEW' | 'ANALYZE') { scene?.setMode(m) }

// ── N1 时段切换（午后/黄昏/夜景，0.8s 平滑过渡） ──
const timeOfDay = ref<'afternoon' | 'dusk' | 'night'>('dusk')
function setTimeOfDay(t: 'afternoon' | 'dusk' | 'night') {
  timeOfDay.value = t
  scene?.setTimeOfDay(t)
}

// ── R9 性能面板（FPS/DrawCall/三角形/画质档，1s 节流采样） ──
const showPerf = ref(false)
const perf = ref({ fps: 0, calls: 0, tris: 0, textures: 0, tier: '-' })
function togglePerf() {
  showPerf.value = !showPerf.value
  if (showPerf.value) {
    perfTimer = window.setInterval(() => {
      if (scene) Object.assign(perf.value, scene.perfStats)
    }, 1000)
  } else if (perfTimer) {
    clearInterval(perfTimer)
    perfTimer = 0
  }
}
let perfTimer = 0
onUnmounted(() => { if (perfTimer) clearInterval(perfTimer) })
function flyTo(i: number) { scene?.stopTour(false); tourOn.value = false; scene?.flyTo(CAMERA_TOURS[i].pos as [number, number, number], CAMERA_TOURS[i].target as [number, number, number]) }
function resetView() { flyTo(0) }
function focusPipe(id: string) { scene?.focusPipe(id) }

// ── 自动漫游（沿导览机位巡航，拖拽即中断） ──
function toggleTour() {
  if (tourOn.value) {
    tourOn.value = false
    scene?.stopTour(false)
  } else {
    tourOn.value = true
    scene?.startTour()
  }
}

// ── 安全（开关式：默认全部关闭，可自由开/关） ──
const scenarioOn = ref<'leak' | 'fire' | null>(null)
function toggleScenario(t: 'leak' | 'fire') {
  if (scenarioOn.value === t) {
    scenarioOn.value = null
    scene?.stopScenario()
  } else {
    scenarioOn.value = t
    scene?.triggerScenario(t, 'R-101')
  }
}
function stopScenario() { scenarioOn.value = null; scene?.stopScenario() }
function toggleHazard() { showHazard.value = !showHazard.value; scene?.setHazardZonesVisible(showHazard.value) }
function toggleHeat() { heatOn.value = !heatOn.value; scene?.setHeatEnabled(heatOn.value) }

// ── 巡检 ──
function enterPatrol() {
  patrolOn.value = true
  patrolDone.value = 0
  scene?.resetPatrol()
  scene?.setFirstPerson(true)
  patrolMsg.value = '已进入巡检 · WASD 移动 / 鼠标转向 / 按 E 退出'
}
function exitPatrol() { patrolOn.value = false; scene?.setFirstPerson(false) }

// ── 培训 SOP ──
function startSop(kind: 'startup' | 'shutdown') {
  sopEngine = new SopEngine(kind === 'startup' ? SOP_STARTUP : SOP_SHUTDOWN, kind === 'startup' ? '开车操作' : '停车操作')
  sopEngine.begin()
  sopPanel.value = {
    title: sopEngine.title,
    step: sopEngine.current?.desc ?? '',
    msg: '开始执行，请按步骤操作',
    done: false, score: null, progress: sopEngine.progress,
  }
}
function execStep() {
  if (!sopEngine || !sopPanel.value) return
  const cur = sopEngine.current
  if (!cur) return
  scene?.operate(cur.target, cur.action)
  const r = sopEngine.handle(cur.target, cur.action)
  sopPanel.value.step = sopEngine.current?.desc ?? '—'
  sopPanel.value.progress = sopEngine.progress
  sopPanel.value.msg = r.msg
  if (r.finished) {
    sopPanel.value.done = true
    sopPanel.value.score = r.score ?? 0
    sopEngine = null
  }
}
function stopSop() { sopEngine = null; sopPanel.value = null }

// ── 回放 ──
function togglePlayback() {
  if (!playing.value) {
    playing.value = scene?.startPlayback(() => {}) ?? false
    if (playing.value) scenarioMsg.value = '▶ 历史数据回放中…'
  } else {
    playing.value = false
    scene?.resumeRealtime()
    scenarioMsg.value = '已恢复实时数据'
  }
}

// ── 搜索 ──
function searchGo() {
  const v = searchId.value.trim().toUpperCase()
  if (v) scene?.focusTarget(v)
}

// ── 趋势图（带横纵坐标轴） ──
function drawTrend() {
  const cv = trendCanvas.value
  if (!cv) return
  const ctx = cv.getContext('2d')!
  const W = cv.width, H = cv.height
  const padL = 42, padR = 8, padT = 10, padB = 20
  const plotW = W - padL - padR, plotH = H - padT - padB
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = 'rgba(10,16,22,0.85)'
  ctx.fillRect(0, 0, W, H)
  const vals = trendValues.value
  if (vals.length < 2) {
    ctx.fillStyle = '#5a6470'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('等待数据…', W / 2, H / 2)
    return
  }
  const def = trendTag.value ? TAG_MAP[trendTag.value] : null
  const unit = def?.unit ?? ''
  let min = Math.min(...vals), max = Math.max(...vals)
  if (max - min < 1e-6) { min -= 0.5; max += 0.5 }
  const span = max - min
  // 网格 + 纵轴刻度
  ctx.font = '9px sans-serif'
  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH - (i / 4) * plotH
    ctx.strokeStyle = 'rgba(255,255,255,0.09)'
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke()
    ctx.fillStyle = '#8fa3b8'
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    ctx.fillText((min + (i / 4) * span).toFixed(1), padL - 4, y)
  }
  // 横轴刻度（相对时间，1 帧 = 1s）
  const N = vals.length
  for (let i = 0; i <= 4; i++) {
    const x = padL + (i / 4) * plotW
    ctx.strokeStyle = 'rgba(255,255,255,0.09)'
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke()
    ctx.fillStyle = '#8fa3b8'
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    ctx.fillText(`-${Math.round(((4 - i) / 4) * N)}s`, x, H - padB + 2)
  }
  // 轴标签（顶部：位号 + 单位；横轴：时间）
  ctx.fillStyle = '#9fb0c0'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  ctx.fillText(`${trendTag.value ?? ''} (${unit})`, padL + 4, 2)
  ctx.textAlign = 'right'
  ctx.fillText('时间', W - padR, H - 9)
  // 折线
  ctx.strokeStyle = '#4fc3f7'
  ctx.lineWidth = 2
  ctx.beginPath()
  vals.forEach((v, i) => {
    const x = padL + (i / (N - 1)) * plotW
    const y = padT + plotH - ((v - min) / span) * plotH
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  })
  ctx.stroke()
  // 最新值点
  const lx = padL + plotW, ly = padT + plotH - ((vals[N - 1] - min) / span) * plotH
  ctx.fillStyle = '#4fc3f7'
  ctx.beginPath(); ctx.arc(lx, ly, 2.5, 0, Math.PI * 2); ctx.fill()
}

onUnmounted(() => { scene?.dispose(); scene = null })
</script>

<template>
  <div class="root">
    <div ref="container" class="canvas-host"></div>

    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <span class="title">丙烯酸甲酯装置 · 3D 数字工厂</span>
      <div class="seg">
        <button :class="{ on: mode === 'VIEW' }" @click="setMode('VIEW')">总览 VIEW</button>
        <button :class="{ on: mode === 'ANALYZE' }" @click="setMode('ANALYZE')">工况 ANALYZE</button>
      </div>
      <div class="seg" title="时段切换（天空/光照/路灯/环境反射联动）">
        <button class="t-noon" :class="{ on: timeOfDay === 'afternoon' }" @click="setTimeOfDay('afternoon')">☀ 午后</button>
        <button class="t-dusk" :class="{ on: timeOfDay === 'dusk' }" @click="setTimeOfDay('dusk')">🌇 黄昏</button>
        <button class="t-night" :class="{ on: timeOfDay === 'night' }" @click="setTimeOfDay('night')">🌙 夜景</button>
      </div>
      <button class="ghost" @click="resetView">复位视角</button>
      <button class="ghost" :class="{ on: tourOn }" @click="toggleTour">{{ tourOn ? '停止漫游' : '自动漫游' }}</button>
      <div class="search">
        <input v-model="searchId" placeholder="输入位号搜索，如 R-101" @keyup.enter="searchGo" />
        <button class="ghost" @click="searchGo">定位</button>
      </div>
    </div>

    <!-- 底部：功能面板（安全/视图/巡检/培训/回放） -->
    <div class="func-bar">
      <div class="func-group">
        <b>安全监控</b>
        <button class="warn" :class="{ on: scenarioOn === 'leak' }" @click="toggleScenario('leak')">模拟泄漏</button>
        <button class="warn" :class="{ on: scenarioOn === 'fire' }" @click="toggleScenario('fire')">模拟着火</button>
        <button @click="stopScenario">复位演练</button>
        <button :class="{ on: showHazard }" @click="toggleHazard">危险区</button>
      </div>
      <div class="func-group">
        <b>视图</b>
        <button :class="{ on: heatOn }" @click="toggleHeat">热力图</button>
        <button :class="{ on: showPerf }" @click="togglePerf">性能面板</button>
      </div>
      <div class="func-group">
        <b>巡检</b>
        <button v-if="!patrolOn" @click="enterPatrol">进入巡检</button>
        <button v-else class="on" @click="exitPatrol">退出巡检</button>
      </div>
      <div class="func-group">
        <b>培训</b>
        <button @click="startSop('startup')">开车 SOP</button>
        <button @click="startSop('shutdown')">停车 SOP</button>
      </div>
      <div class="func-group">
        <b>回放</b>
        <button :class="{ on: playing }" @click="togglePlayback">{{ playing ? '停止回放' : '历史回放' }}</button>
      </div>
    </div>

    <!-- 左：导览机位 -->
    <div class="panel tours">
      <div class="panel-title">导览机位</div>
      <button v-for="(t, i) in CAMERA_TOURS" :key="i" class="tour-btn" @click="flyTo(i)">{{ t.name }}</button>
    </div>

    <!-- 左下：管线图例 -->
    <div class="panel legend">
      <div class="panel-title">管线图例</div>
      <div class="lg"><i style="background:#d23c3c"></i>丙烯酸（酸循环）</div>
      <div class="lg"><i style="background:#2f7fe0"></i>甲醇（醇循环）</div>
      <div class="lg"><i style="background:#e08a3c"></i>反应产物</div>
      <div class="lg"><i style="background:#c9ced4"></i>塔顶轻组分</div>
      <div class="lg"><i style="background:#d9a521"></i>成品 MA ≥97%</div>
      <div class="lg"><i style="background:#9b59d0"></i>阻聚剂 HQ</div>
    </div>

    <!-- 左下二：趋势图 -->
    <div class="panel trend">
      <div class="panel-title">实时趋势（选中设备）</div>
      <canvas ref="trendCanvas" width="300" height="104"></canvas>
    </div>

    <!-- R9 性能面板 -->
    <div v-if="showPerf" class="panel perf">
      <div class="panel-title">性能（1s 采样）</div>
      <div class="perf-row"><b>{{ perf.fps }}</b><span>FPS</span></div>
      <div class="perf-row">{{ perf.calls }}<span>DrawCall</span></div>
      <div class="perf-row">{{ perf.tris.toLocaleString() }}<span>三角形</span></div>
      <div class="perf-row">{{ perf.textures }}<span>纹理</span></div>
      <div class="perf-row">{{ perf.tier }}<span>画质档</span></div>
    </div>

    <!-- 右下：操作提示 / 消息 -->
    <div class="hint">
      <div v-if="scenarioMsg" class="msg warn-msg">{{ scenarioMsg }}</div>
      <div v-if="patrolMsg" class="msg">{{ patrolMsg }}</div>
      <div class="tip">左键拖拽平移 · 右键拖拽旋转 · 滚轮缩放 · 点击设备查看信息</div>
      <div v-if="edgeTip" class="msg edge-tip">{{ edgeTip }}</div>
    </div>

    <!-- 右侧：设备信息卡 -->
    <div v-if="selected" class="panel info">
      <div class="info-head">
        <span class="tag">{{ selected.id }}</span>
        <span class="name">{{ selected.name }}</span>
        <span v-if="selectedStatus" class="badge" :class="selectedStatus.toLowerCase()">{{ selectedStatus }}</span>
      </div>
      <div class="info-desc">{{ selected.info.desc }}</div>
      <div v-if="selected.info.conditions" class="info-row"><b>操作条件</b>{{ selected.info.conditions }}</div>
      <div v-if="selected.info.material" class="info-row"><b>工艺说明</b>{{ selected.info.material }}</div>
      <div v-if="selectedTags.length" class="info-vals">
        <div v-for="[tag, def] in selectedTags" :key="tag" class="val-row">
          <span class="val-label">{{ def.label }}</span>
          <span class="val-num" :class="{ alarm: alarms.includes(tag) }">
            {{ liveValues[tag] ?? '--' }} <small>{{ def.unit }}</small>
          </span>
        </div>
      </div>
      <div v-if="alarms.length" class="alarm-bar">⚠ 报警中：{{ alarms.map(t => TAG_MAP[t].label).join('、') }}</div>
      <div v-if="connectedPipes.length" class="info-pipes">
        <div class="panel-title" style="margin-top:10px">连接管线</div>
        <button v-for="p in connectedPipes" :key="p.id" class="pipe-btn" @click="focusPipe(p.id)">
          <i :style="{ background: '#6fcf97' }"></i>{{ p.id }} <small>→</small>
        </button>
      </div>
    </div>

    <!-- 右侧二：SOP 培训面板 -->
    <div v-if="sopPanel" class="panel sop">
      <div class="panel-title">培训考核 · {{ sopPanel.title }}</div>
      <div class="sop-step">
        <b>步骤 {{ sopPanel.progress }}</b>
        <div class="sop-desc">{{ sopPanel.step }}</div>
      </div>
      <button v-if="!sopPanel.done" class="sop-exec" @click="execStep">▶ 执行当前步骤</button>
      <div class="sop-msg" :class="{ ok: sopPanel.msg.startsWith('✓') || sopPanel.msg.startsWith('✅'), bad: sopPanel.msg.startsWith('✗') }">
        {{ sopPanel.msg }}
      </div>
      <div v-if="sopPanel.done" class="sop-score">得分：<b>{{ sopPanel.score }}</b></div>
      <button class="ghost sop-close" @click="stopSop">结束</button>
    </div>
  </div>
</template>

<style scoped>
.root { position: relative; width: 100%; height: 100%; }
.canvas-host { position: absolute; inset: 0; }
.toolbar {
  position: absolute; top: 12px; left: 12px; right: 12px; z-index: 10;
  display: flex; align-items: center; gap: 16px;
  background: rgba(15, 21, 28, 0.82); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; padding: 8px 16px; color: #dfe6ee;
  backdrop-filter: blur(6px);
}
.title { font-size: 15px; font-weight: 500; letter-spacing: 1px; }
.seg { display: flex; gap: 0; border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; overflow: hidden; }
.seg button { background: transparent; color: #9fb0c0; border: none; padding: 6px 14px; cursor: pointer; font-size: 13px; }
.seg button.on { background: #185fa5; color: #fff; }
.ghost { background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #c6d2de; border-radius: 8px; padding: 6px 14px; cursor: pointer; font-size: 13px; }
.ghost:hover { background: rgba(24,95,165,0.4); }
.ghost.on { background: #185fa5; color: #fff; border-color: #185fa5; }
.search { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.search input { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #dfe6ee; border-radius: 6px; padding: 5px 10px; font-size: 12px; width: 180px; outline: none; }
.panel {
  position: absolute; z-index: 10; background: rgba(15, 21, 28, 0.85);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;
  padding: 12px 14px; color: #dfe6ee; backdrop-filter: blur(6px);
  font-size: 13px;
}
.panel-title { font-size: 12px; color: #8fa3b8; margin-bottom: 8px; letter-spacing: 1px; }
.tours { top: 70px; left: 12px; display: flex; flex-direction: column; gap: 6px; }
.tour-btn { text-align: left; background: rgba(255,255,255,0.06); border: none; color: #c6d2de; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px; }
.tour-btn:hover { background: rgba(24,95,165,0.5); color: #fff; }
.legend { bottom: 12px; left: 12px; }
.lg { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
.lg i { width: 22px; height: 5px; border-radius: 2px; display: inline-block; }
.trend { bottom: 12px; left: 190px; width: 320px; }
.trend canvas { width: 100%; border-radius: 6px; }
.perf { bottom: 12px; left: 530px; width: 150px; }
.perf-row { display: flex; justify-content: space-between; padding: 2px 0; font-family: monospace; font-size: 13px; color: #6fcf97; }
.perf-row b { font-size: 15px; }
.perf-row span { color: #8fa3b8; font-family: inherit; }
.info { top: 70px; right: 12px; width: 280px; max-height: calc(100vh - 160px); overflow-y: auto; }
.info-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
.tag { background: #185fa5; color: #fff; border-radius: 4px; padding: 2px 8px; font-size: 12px; font-family: monospace; }
.name { font-size: 15px; font-weight: 500; }
.info-desc { color: #9fb0c0; margin-bottom: 10px; line-height: 1.5; }
.info-row { display: flex; gap: 8px; padding: 3px 0; line-height: 1.5; }
.info-row b { color: #8fa3b8; font-weight: 500; flex-shrink: 0; }
.info-vals { margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px; }
.val-row { display: flex; justify-content: space-between; padding: 3px 0; }
.val-label { color: #9fb0c0; }
.val-num { font-family: monospace; font-size: 14px; color: #6fcf97; }
.val-num.alarm { color: #ff5b5b; animation: blink 1s infinite; }
.val-num small { color: #8fa3b8; }
.alarm-bar { margin-top: 10px; background: rgba(200,40,40,0.25); border: 1px solid rgba(255,80,80,0.4); color: #ff9b9b; border-radius: 6px; padding: 6px 10px; font-size: 12px; }
.badge { font-size: 11px; font-weight: 600; border-radius: 4px; padding: 2px 8px; letter-spacing: 0.5px; }
.badge.run { background: rgba(55,200,113,0.22); color: #6fcf97; border: 1px solid rgba(55,200,113,0.5); }
.badge.stop { background: rgba(140,148,156,0.2); color: #9aa4ad; border: 1px solid rgba(140,148,156,0.5); }
.badge.fault { background: rgba(226,75,74,0.25); color: #ff8f8f; border: 1px solid rgba(226,75,74,0.6); animation: blink 0.6s infinite; }
.info-pipes { display: flex; flex-direction: column; gap: 4px; margin-top: 2px; }
.pipe-btn { display: flex; align-items: center; gap: 6px; text-align: left; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #c6d2de; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; font-family: monospace; }
.pipe-btn:hover { background: rgba(24,95,165,0.5); color: #fff; }
.pipe-btn i { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

/* 底部功能栏 */
.func-bar {
  position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); z-index: 10;
  display: flex; gap: 10px; align-items: flex-start;
  background: rgba(15, 21, 28, 0.88); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px; padding: 8px 12px; backdrop-filter: blur(6px);
}
.func-group { display: flex; flex-direction: column; gap: 4px; padding: 0 8px; border-right: 1px solid rgba(255,255,255,0.08); }
.func-group:last-child { border-right: none; }
.func-group b { font-size: 11px; color: #8fa3b8; letter-spacing: 1px; margin-bottom: 2px; }
.func-group button {
  background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); color: #c6d2de;
  border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; white-space: nowrap;
}
.func-group button:hover { background: rgba(24,95,165,0.5); color: #fff; }
.func-group button.on { background: #185fa5; color: #fff; border-color: #185fa5; }
.func-group button.warn { border-color: rgba(226,75,74,0.5); color: #ff9b9b; }
.func-group button.warn:hover { background: rgba(226,75,74,0.3); }
.func-group button.warn.on { background: rgba(226,75,74,0.55); color: #fff; border-color: #ff6b6b; }

/* SOP 面板 */
.sop { top: 70px; right: 308px; width: 300px; }
.sop-step { margin: 6px 0; }
.sop-step b { color: #8fa3b8; }
.sop-desc { margin-top: 4px; color: #e8eef4; line-height: 1.5; }
.sop-exec { width: 100%; margin: 6px 0; background: #185fa5; color: #fff; border: none; border-radius: 6px; padding: 7px 0; cursor: pointer; font-size: 13px; }
.sop-msg { font-size: 12px; color: #ffd479; min-height: 32px; line-height: 1.5; }
.sop-msg.ok { color: #6fcf97; }
.sop-msg.bad { color: #ff8f8f; }
.sop-score { font-size: 14px; color: #6fcf97; margin: 4px 0; }
.sop-score b { font-size: 20px; }
.sop-close { margin-top: 6px; }

/* 消息 */
.hint { position: absolute; bottom: 12px; right: 12px; z-index: 10; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.msg { background: rgba(15,21,28,0.85); border: 1px solid rgba(255,255,255,0.12); color: #c6d2de; border-radius: 8px; padding: 6px 12px; font-size: 12px; max-width: 340px; }
.warn-msg { border-color: rgba(226,75,74,0.6); color: #ff9b9b; animation: blink 1s infinite; }
.edge-tip { border-color: rgba(240,180,41,0.5); color: #ffd479; }
.tip { color: rgba(200,214,226,0.45); font-size: 12px; }
@keyframes blink { 50% { opacity: 0.4; } }
</style>
