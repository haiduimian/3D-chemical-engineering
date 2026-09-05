/**
 * 模拟工况数据源 + tag→设备映射
 * 环绕工艺稳态值加噪声，1s 一帧；
 * 同时输出设备运行状态（泵 RUN/STOP/FAULT + 管线阀门开度）
 * 支持：点位表外置加载（points.json）、历史帧录制与回放
 */
import { PIPES } from '../layout/plantLayout'

export interface TagDef {
  elementId: string
  slot: number
  min: number
  max: number
  unit: string
  label: string
  alarmHigh?: number
  /** 稳态值 + 波动幅度 */
  steady: number
  noise: number
}

export let TAG_MAP: Record<string, TagDef> = {
  'TI-R101':  { elementId: 'R-101', slot: 0, min: 60, max: 120, unit: '℃',  label: '反应温度', steady: 90,  noise: 3,   alarmHigh: 100 },
  'PI-R101':  { elementId: 'R-101', slot: 1, min: 0,  max: 0.6, unit: 'MPa', label: '反应压力', steady: 0.4, noise: 0.03, alarmHigh: 0.5 },
  'TI-T101T': { elementId: 'T-101', slot: 0, min: 60, max: 120, unit: '℃',  label: '塔顶温度', steady: 82,  noise: 2,   alarmHigh: 100 },
  'TI-T101B': { elementId: 'T-101', slot: 1, min: 100, max: 180, unit: '℃', label: '塔釜温度', steady: 140, noise: 4 },
  'TI-T102T': { elementId: 'T-102', slot: 0, min: 40, max: 100, unit: '℃',  label: '塔顶温度', steady: 65,  noise: 2 },
  'TI-T102B': { elementId: 'T-102', slot: 1, min: 80, max: 140, unit: '℃',  label: '塔釜温度', steady: 105, noise: 3 },
  'TI-T103T': { elementId: 'T-103', slot: 0, min: 60, max: 120, unit: '℃',  label: '塔顶温度', steady: 78,  noise: 2 },
  'TI-T103B': { elementId: 'T-103', slot: 1, min: 100, max: 160, unit: '℃', label: '塔釜温度', steady: 120, noise: 3 },
  'LI-V105':  { elementId: 'V-105', slot: 0, min: 0,  max: 100, unit: '%',  label: '球罐液位', steady: 62,  noise: 0.5 },
  'AI-301':   { elementId: 'V-105', slot: 1, min: 90, max: 100, unit: '%',  label: '产品纯度', steady: 97.3, noise: 0.3 },
  'FI-101':   { elementId: 'M-101', slot: 0, min: 0,  max: 20,  unit: 'm³/h', label: '进料流量', steady: 12, noise: 0.8 },
}

/** 外置点位表加载（points.json），与内置点位合并 */
export function loadTagMap(json: Record<string, TagDef>) {
  if (json && Object.keys(json).length) TAG_MAP = { ...TAG_MAP, ...json }
}

/** 泵/搅拌器运行状态 */
export type DeviceStatus = 'RUN' | 'STOP' | 'FAULT'

export interface DeviceState {
  status: DeviceStatus
  /** 管线阀门开度 0~100 */
  valveOpen: number
}

/** 泵设备清单 */
export const PUMP_IDS = ['P-101', 'P-102', 'P-103', 'P-104', 'P-105']

export type TickCallback = (points: Record<string, number>, alarms: string[], states: Record<string, DeviceState>) => void

export interface HistoryFrame {
  t: number
  points: Record<string, number>
  alarms: string[]
  states: Record<string, DeviceState>
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export class MockDataSource {
  private timer: ReturnType<typeof setInterval> | null = null
  private replayTimer: ReturnType<typeof setInterval> | null = null
  private cbs: TickCallback[] = []
  private prevStates: Record<string, DeviceState> = {}
  /** 滚动历史窗口（最近 300 帧） */
  private frames: HistoryFrame[] = []
  private replayIdx = -1

  onTick(cb: TickCallback) { this.cbs.push(cb) }

  private emit() {
    const points: Record<string, number> = {}
    const alarms: string[] = []
    for (const [tag, def] of Object.entries(TAG_MAP)) {
      const v = def.steady + (Math.random() - 0.5) * 2 * def.noise
      points[tag] = Math.round(v * 100) / 100
      if (def.alarmHigh !== undefined && v > def.alarmHigh) alarms.push(tag)
    }

    // 设备状态：泵三态（小概率切换）+ 阀门开度（缓慢漂移）
    // v10 修复"闪烁 bug"：v1 每泵每秒 1.5% 故障概率 → 5 台泵平均 ~13s 就有一台
    // 开始红闪，画面上总在随机位置闪红灯（像 bug 而非工况）。
    // 降为 0.3%（平均 ~5.5 分钟一台），FAULT 恢复概率提高，常态画面稳定、
    // 演示时偶发故障仍有教学价值
    const states: Record<string, DeviceState> = {}
    for (const id of PUMP_IDS) {
      const prev = this.prevStates[id]?.status ?? 'RUN'
      let status = prev
      const roll = Math.random()
      if (prev === 'RUN' && roll < 0.003) status = 'FAULT'
      else if (prev === 'FAULT' && roll < 0.5) status = 'RUN'
      else if (prev === 'FAULT') status = 'STOP'
      states[id] = { status, valveOpen: 55 + Math.random() * 40 }
    }
    for (const p of PIPES) {
      const key = `valve:${p.id}`
      const prev = this.prevStates[key]?.valveOpen ?? 85
      states[key] = { status: 'RUN', valveOpen: clamp(prev + (Math.random() - 0.5) * 10, 0, 100) }
    }
    this.prevStates = states

    // 录制历史帧（滚动窗口）
    const frame: HistoryFrame = { t: Date.now(), points, alarms, states }
    this.frames.push(frame)
    if (this.frames.length > 300) this.frames.shift()

    this.cbs.forEach(cb => cb(points, alarms, states))
  }

  start(intervalMs = 1000) {
    if (this.timer) return
    this.emit() // 首帧
    this.timer = setInterval(() => this.emit(), intervalMs)
  }

  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null } }

  /** 历史帧访问（回放/趋势图） */
  getHistory(): HistoryFrame[] { return this.frames }

  /** 回放历史帧：暂停实时，按 intervalMs 推进；返回 false 表示无数据 */
  startPlayback(cb: TickCallback, intervalMs = 800): boolean {
    if (!this.frames.length) return false
    this.stop()
    this.stopPlayback()
    this.replayIdx = 0
    const step = () => {
      if (this.replayIdx >= this.frames.length) { this.stopPlayback(); return }
      const f = this.frames[this.replayIdx++]
      this.cbs.forEach(c => c(f.points, f.alarms, f.states))
      // 同步给外部回调（回放专用）
      cb(f.points, f.alarms, f.states)
    }
    step()
    this.replayTimer = setInterval(step, intervalMs)
    return true
  }

  stopPlayback() {
    if (this.replayTimer) { clearInterval(this.replayTimer); this.replayTimer = null }
    this.replayIdx = -1
  }
}

/** 归一化到 0~100 */
export function norm(raw: number, def: TagDef): number {
  const v = ((raw - def.min) / (def.max - def.min)) * 100
  return Math.max(2, Math.min(100, v))
}
