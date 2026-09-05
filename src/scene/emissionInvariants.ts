/**
 * 发光不变量校验（R4）—— 闪烁 bug 的工程级回归防线
 *
 * 背景（R1 定位）：动态自发光穿越 UnrealBloomPass 阈值（5.0）会导致光晕
 * "瞬爆瞬灭"（用户报告的局部持续闪烁）。修复原则被固化为下述规则表：
 *   每个动态发光体的强度范围必须 全程 > 阈值（光晕常驻平滑呼吸）
 *   或 全程 < 阈值（无光晕）；仅"平滑斜坡"类允许穿越（报警灯 0.25↔6.4，
 *   0.15s 指数过渡，视觉上是明暗渐变而非闪烁）。
 *
 * 用法：构造函数调用 assertEmissionInvariants()，返回违规列表（空 = 通过）。
 * 修改任何发光参数时必须同步更新此表 —— 表格本身就是设计约束的文档。
 */

export const BLOOM_THRESHOLD = 5.0

export interface EmissionRule {
  name: string
  /** 动态强度范围（代码公式可推出的上下界） */
  min: number
  max: number
  /** true = 允许穿越阈值（仅限平滑斜坡类动效） */
  rampAllowed?: boolean
}

export const EMISSION_RULES: EmissionRule[] = [
  // ── 动态（呼吸/闪烁）──
  { name: 'warningBeacons 塔顶/火炬信标', min: 6.1, max: 8.2 },          // PlantScene.loop 6.1+2.1·max(0,sin)
  { name: 'cityBeacons 城区航空灯', min: 5.4, max: 7.2 },                // environment.animateCityBeacons 5.4+1.8·max(0,sin)
  { name: 'flareFlame 火炬火焰', min: 6.8, max: 10.4 },                  // environment.animateFlare 8.5±1.1±0.6
  { name: 'lampRUN 设备指示灯(RUN)', min: 2.2, max: 2.2 },               // PlantScene.applyLamps
  { name: 'lampSTOP 设备指示灯(STOP)', min: 0.25, max: 0.25 },           // PlantScene.applyLamps
  { name: 'lampALARM 设备指示灯(报警)', min: 0.25, max: 6.4, rampAllowed: true }, // 平滑斜坡（~0.15s 指数过渡）
  // ── 静态（常亮）──
  { name: 'valveIndicator 阀门指示灯', min: 1.8, max: 1.8 },             // valves.setOpen
  { name: 'streetLamp 路灯头', min: 6.0, max: 6.0 },                     // environment.buildStreetLights
  { name: 'windowLit 建筑亮窗', min: 1.2, max: 1.6 },                    // environment.makeBuilding / city
  { name: 'patrolLamp 护栏巡检灯', min: 1.2, max: 1.2 },                 // plantShapes
  { name: 'lampGlassBase 指示玻璃基座', min: 0.7, max: 0.7 },            // pbr.lampGlass
  { name: 'pipeFlow 管线流动自发光', min: 0.12, max: 0.55 },             // pipes.tubeMat（高亮联动）
  { name: 'pipePulse 管线脉冲粒', min: 0.35, max: 0.45 },                // pipes.pulse（R4 去卡通化）
  { name: 'pipeArrow 流向箭头', min: 0.3, max: 0.4 },                    // pipes.arrow（R4 去卡通化）
  { name: 'dataBar 数据柱', min: 0.6, max: 0.6 },                        // PlantScene.buildDataBars
]

/** 检查全部规则，返回违规列表（空数组 = 通过）。调用时机：场景构建完成后 */
export function assertEmissionInvariants(): string[] {
  const problems: string[] = []
  for (const r of EMISSION_RULES) {
    if (r.rampAllowed) continue
    const ok = r.max < BLOOM_THRESHOLD || r.min > BLOOM_THRESHOLD
    if (!ok) {
      problems.push(`[${r.name}] 强度范围 [${r.min}, ${r.max}] 穿越 Bloom 阈值 ${BLOOM_THRESHOLD} → 光晕忽大忽小（闪烁）`)
    }
  }
  if (problems.length) {
    console.error('⚠ EmissionInvariant 违规：', problems)
  } else {
    console.info('[EmissionInvariant] 全部动态发光体均满足阈值约束（不闪烁）')
  }
  return problems
}