/**
 * 培训考核：开停车 SOP 状态机 + 评分
 * 操作对象：设备（P-xxx 泵 启/停）或管线（pipe-xxx 开/关阀门）
 * 校验规则：必须按步骤顺序操作，误操作扣分，超时降分
 */

export interface SopStep {
  id: string
  desc: string
  target: string        // 设备 ID 或管线 ID（'pipe-xxx'）
  action: 'start' | 'stop' | 'open' | 'close' | 'check'
  targetLabel: string
}

/** 开车（启动）操作序列 */
export const SOP_STARTUP: SopStep[] = [
  { id: 's1', desc: '确认 P-101 就绪，启动丙烯酸进料泵', target: 'P-101', action: 'start', targetLabel: 'P-101 丙烯酸进料泵' },
  { id: 's2', desc: '打开丙烯酸进料线阀门', target: 'pipe-aa', action: 'open', targetLabel: '丙烯酸进料线 pipe-aa' },
  { id: 's3', desc: '启动甲醇进料泵 P-102', target: 'P-102', action: 'start', targetLabel: 'P-102 甲醇进料泵' },
  { id: 's4', desc: '打开甲醇进料线阀门', target: 'pipe-meoh', action: 'open', targetLabel: '甲醇进料线 pipe-meoh' },
  { id: 's5', desc: '启动反应进料泵 P-103', target: 'P-103', action: 'start', targetLabel: 'P-103 反应进料泵' },
  { id: 's6', desc: '确认反应器温度稳定在 80~95℃', target: 'R-101', action: 'check', targetLabel: 'R-101 反应器' },
]

/** 停车（关停）操作序列 */
export const SOP_SHUTDOWN: SopStep[] = [
  { id: 'h1', desc: '停止丙烯酸进料泵 P-101', target: 'P-101', action: 'stop', targetLabel: 'P-101 进料泵' },
  { id: 'h2', desc: '关闭丙烯酸进料线阀门', target: 'pipe-aa', action: 'close', targetLabel: '丙烯酸进料线' },
  { id: 'h3', desc: '停止甲醇进料泵 P-102', target: 'P-102', action: 'stop', targetLabel: 'P-102 进料泵' },
  { id: 'h4', desc: '关闭甲醇进料线阀门', target: 'pipe-meoh', action: 'close', targetLabel: '甲醇进料线' },
  { id: 'h5', desc: '停止反应进料泵 P-103', target: 'P-103', action: 'stop', targetLabel: 'P-103 反应泵' },
  { id: 'h6', desc: '确认反应器降温、系统泄压完成', target: 'R-101', action: 'check', targetLabel: 'R-101 反应器' },
]

export interface SopResult {
  ok: boolean
  msg: string
  finished?: boolean
  score?: number
}

export class SopEngine {
  steps: SopStep[]
  idx = 0
  startTime = 0
  mistakes = 0
  done = false
  title: string

  constructor(steps: SopStep[], title: string) {
    this.steps = steps
    this.title = title
  }

  begin() {
    this.idx = 0
    this.mistakes = 0
    this.startTime = Date.now()
    this.done = false
  }

  get current(): SopStep | null {
    return this.done || this.idx >= this.steps.length ? null : this.steps[this.idx]
  }

  get progress() { return `${this.idx}/${this.steps.length}` }

  /** 用户操作目标（设备/管线）与动作是否匹配当前步骤 */
  handle(target: string, action: string): SopResult {
    const cur = this.current
    if (!cur) return { ok: false, msg: 'SOP 未开始或已完成' }
    if (cur.target === target && cur.action === action) {
      this.idx++
      if (this.idx >= this.steps.length) {
        this.done = true
        const secs = Math.round((Date.now() - this.startTime) / 1000)
        const score = Math.max(60, Math.round(100 - this.mistakes * 8 - Math.max(0, secs - 90) * 0.2))
        return { ok: true, msg: `✅ 完成「${this.title}」：用时 ${secs}s，误操作 ${this.mistakes} 次，得分 ${score}`, finished: true, score }
      }
      return { ok: true, msg: `✓ 正确，进入第 ${this.idx + 1} 步：${this.current!.desc}` }
    }
    this.mistakes++
    return { ok: false, msg: `✗ 操作不对（已记 ${this.mistakes} 次误操作），当前应：${cur.desc}` }
  }
}
