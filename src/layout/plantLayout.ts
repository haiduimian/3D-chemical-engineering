/**
 * 全厂坐标布置数据（单位：场景米）
 * 总平面：北=罐区(z负)，中=管廊(z=0 东西向)，南=反应区+塔区(z正)
 * 物料总体自西向东（x 增大方向）流动
 */

export interface EquipmentDef {
  id: string
  name: string
  type: 'tank' | 'reactor' | 'exchanger' | 'column' | 'sphere' | 'pump' | 'mixer' | 'inhibitorTank'
  x: number
  z: number
  /** 设备静态信息（信息卡展示） */
  info: {
    desc: string
    conditions?: string
    material?: string
  }
  /** 建模参数 */
  params?: Record<string, number>
}

export const EQUIPMENTS: EquipmentDef[] = [
  // ── 北区：罐区 ─────────────────────────────
  {
    id: 'V-101', name: '丙烯酸储罐', type: 'tank', x: -55, z: -32,
    info: { desc: '新鲜丙烯酸原料立式储罐', conditions: '低温储存 <25℃', material: '不锈钢' },
    params: { radius: 4, height: 6, color: 0xe8e8e8, band: 0xd23c3c },
  },
  {
    id: 'V-102', name: '甲醇储罐', type: 'tank', x: -40, z: -32,
    info: { desc: '甲醇原料立式内浮顶储罐', conditions: '氮封储存', material: '碳钢' },
    params: { radius: 4, height: 6, color: 0xd6dbe0, band: 0x2f7fe0 },
  },
  {
    id: 'V-105', name: '产品球罐', type: 'sphere', x: 55, z: -32,
    info: { desc: '丙烯酸甲酯(MA)产品球罐', conditions: '产品纯度 ≥97%', material: '低合金钢' },
    params: { radius: 6, legs: 6 },
  },
  {
    id: 'V-104', name: '阻聚剂溶解罐', type: 'inhibitorTank', x: 8, z: -20,
    info: { desc: '对苯二酚(HQ)阻聚剂配制罐', conditions: '常温常压', material: '不锈钢' },
    params: { radius: 1.2, height: 2 },
  },

  // ── 南区：反应区（自西向东） ────────────────
  {
    id: 'M-101', name: '静态混合器', type: 'mixer', x: -46, z: 18,
    info: { desc: '丙烯酸与循环甲醇静态混合', material: '不锈钢' },
    params: { radius: 0.5, length: 3 },
  },
  {
    id: 'E-101', name: '进料预热器', type: 'exchanger', x: -36, z: 18,
    info: { desc: '管壳式进料预热器（蒸汽加热至 80~95℃）', conditions: '壳程 0.4MPa 蒸汽', material: '碳钢' },
    params: { radius: 1, length: 5 },
  },
  {
    id: 'R-101', name: '固定床反应器', type: 'reactor', x: -24, z: 18,
    info: {
      desc: '列管式固定床反应器，装填强酸性阳离子交换树脂催化剂',
      conditions: '80~100℃ / 0.3~0.5 MPa 液相',
      material: '丙烯酸 + 甲醇 ⇌ 丙烯酸甲酯 + 水',
    },
    params: { radius: 1.8, height: 9 },
  },

  // ── 南区：塔区（品字排开） ────────────────
  {
    id: 'T-101', name: '酸分离塔', type: 'column', x: -6, z: 22,
    info: { desc: '第一分离：回收未反应丙烯酸（塔釜采出循环回反应器）', conditions: '塔釜高温位', material: '高沸点组分分离' },
    params: { radius: 1.6, height: 18 },
  },
  {
    id: 'T-102', name: '甲醇回收塔', type: 'column', x: 10, z: 22,
    info: { desc: '第二分离：塔顶分出甲醇循环回反应器（维持过量甲醇推动平衡）', conditions: '塔顶低温位', material: '低沸点组分分离' },
    params: { radius: 1.4, height: 16 },
  },
  {
    id: 'T-103', name: '酯精制塔', type: 'column', x: 26, z: 22,
    info: { desc: '共沸精馏脱水脱重组分，塔釜采出高纯产品', conditions: '产品纯度 ≥97%', material: '成品精制' },
    params: { radius: 1.5, height: 14 },
  },

  // ── 泵棚 ────────────────────────────────
  { id: 'P-101', name: '丙烯酸进料泵', type: 'pump', x: -55, z: -14, info: { desc: '丙烯酸输送泵' } },
  { id: 'P-102', name: '甲醇进料泵', type: 'pump', x: -40, z: -14, info: { desc: '甲醇输送泵' } },
  { id: 'P-103', name: '反应进料泵', type: 'pump', x: -46, z: 27, info: { desc: '混合物料加压进反应器' } },
  { id: 'P-104', name: '酸循环泵', type: 'pump', x: -6, z: 34, info: { desc: '塔釜丙烯酸循环回反应器' } },
  { id: 'P-105', name: '阻聚剂计量泵', type: 'pump', x: 8, z: -14, info: { desc: '对苯二酚连续计量注入' } },
]

/** 管线定义：端口引用式（from/to 为 src/layout/ports.ts 中的端口 ID） */
export interface PipeVia {
  /** 强制途经坐标点（水平段走 viaY 高度层） */
  x?: number
  y?: number
  z?: number
  /** 串接泵设备 ID：路径将从泵入口进入、泵出口离开 */
  pump?: string
}

export interface PipeDef {
  id: string
  color: keyof typeof import('../materials/pbr').PIPE_COLORS
  /** 管径（m）。缺省 = auto：autoDiameter(from,to) = max(两端端口口径) ——
   *  R10 口径一致性：管线粗细必须适应设备口径，禁止管细于设备管嘴 */
  diameter?: number
  flow: number          // 流速动画速度 0~1；>0 正向、<0 反向
  from: string          // 起点端口 ID（PORTS 注册表）
  to: string            // 终点端口 ID
  /** 水平段高度层（管廊高度，默认 6） */
  viaY?: number
  /** 中间途经点 / 串接泵 */
  via?: PipeVia[]
}

/** 管廊高度层 */
const RACK_Y = 6

export const PIPES: PipeDef[] = [
  // 原料线：罐区 → 泵 → 混合器（经管廊）
  {
    id: 'pipe-aa', color: 'acrylicAcid', diameter: 0.35, flow: 0.8,
    from: 'V101-OUT-1', to: 'M101-IN-AA', via: [{ pump: 'P-101' }],
  },
  {
    id: 'pipe-meoh', color: 'methanol', flow: 1.0, // R10: 0.4 → auto(两端 0.35/0.35)=0.35，粗细随设备口径
    from: 'V102-OUT-1', to: 'M101-IN-MEOH', via: [{ pump: 'P-102' }],
  },
  // 混合器 → 预热器 → 反应器（地面低架，带管托支撑）
  {
    id: 'pipe-mix-pre', color: 'methanol', diameter: 0.4, flow: 0.9,
    from: 'M101-OUT', to: 'E101-IN', viaY: 2.8,
  },
  {
    id: 'pipe-pre-r', color: 'reactorOut', diameter: 0.4, flow: 0.9,
    from: 'E101-OUT', to: 'R101-IN', via: [{ pump: 'P-103' }], viaY: 3.6,
  },
  // 反应器 → 酸分离塔（绕 T-101 东侧 z=26 外侧接入，避免穿塔）
  {
    id: 'pipe-r-t101', color: 'reactorOut', diameter: 0.4, flow: 0.9,
    from: 'R101-OUT', to: 'T101-IN', via: [{ x: -21.7, z: 26 }, { x: -6, z: 26 }],
  },
  // 酸循环：T-101 塔釜 → P-104 → 反应器第二进料口（红线，经管廊返回）
  // R7: viaY 6→5.4 —— 原 6.0 层与 pipe-r-t101 水平段交叉穿模（中心距 0.03m）；
  //     降到 5.4 层后与 r-t101(6.0) 间隔 0.6m > 半径和 0.35m
  {
    id: 'pipe-acid-recycle', color: 'acrylicAcid', diameter: 0.3, flow: 0.7,
    from: 'T101-BOT', to: 'R101-IN2', via: [{ pump: 'P-104' }], viaY: 5.4,
  },
  // T-101 塔顶 → T-102 进料（高位层，从塔上方跨过）
  {
    id: 'pipe-t101-t102', color: 'overhead', diameter: 0.35, flow: 0.8,
    from: 'T101-TOP', to: 'T102-IN', viaY: 17,
  },
  // 甲醇循环：T-102 塔顶 → 混合器第二甲醇口（蓝线，经管廊返回）
  // R7: viaY 8→17.5 —— 原 8.0 层竖直段在塔壁外侧与 t101-t102(17 层)正交交叉；
  //     改至 17.5 高位跨廊层：竖直段缩短为 1.4m、与 17.0 层水平段三维间距 0.7m（安全），
  //     水平段行走高度随"塔顶轻组分跨反应区"的工艺语义（高位放空/循环）
  {
    id: 'pipe-meoh-recycle', color: 'methanol', diameter: 0.35, flow: 0.8,
    from: 'T102-TOP', to: 'M101-IN-MEOH2', viaY: 17.5, via: [{ x: -46, z: -6 }],
  },
  // T-102 塔釜 → T-103
  // R7: viaY 6→4.0 —— 原 6.0 层水平段在 (10,·,23.4) 与 t101-t102 塔壁竖直段贴壁平行
  //     （中心距 0.15m < 半径和）；降至 4.0 后竖直段只到 4.0m，与 ≥4.8m 的
  //     塔壁竖直段最小间距 0.8m（安全）
  {
    id: 'pipe-t102-t103', color: 'overhead', diameter: 0.35, flow: 0.8,
    from: 'T102-BOT', to: 'T103-IN', viaY: 4.0,
  },
  // 成品：T-103 塔釜 → 球罐（黄线，经管廊 z=28 东段）
  {
    id: 'pipe-product', color: 'product', diameter: 0.35, flow: 0.6,
    from: 'T103-BOT', to: 'V105-IN-1', via: [{ x: 42, z: 28 }, { x: 48, z: -6 }],
  },
  // 阻聚剂：V-104 → P-105（主管）→ 三路支管分送三塔塔顶（错开高度层，避免重叠/穿塔）
  // R10: diameter 缺省 → auto=max(V104 0.16, P105-OUT 0.22)=0.22 —— 泵出口主管按出口口径加粗，
  //      V-104 端由大小头过渡（0.22→0.16），"粗细适应设备口径"（白皮书 N3-P0）
  {
    id: 'pipe-hq-main', color: 'inhibitor', flow: 0.35,
    from: 'V104-OUT-1', to: 'P105-OUT', via: [{ pump: 'P-105' }],
  },
  // R7: 三支管原共用 P105-OUT → 泵出口段完全重合；且支管与塔顶主流管线
  //     (t101-t102/meoh-recycle) 在 T101-TOP/T102-TOP 端口段重合 0m。
  //     修复：支管改接泵出口分流端口（±0.3m 错开）+ 塔顶副端口（z- 侧双注入口）
  {
    id: 'pipe-hq-t101', color: 'inhibitor', diameter: 0.12, flow: 0.3,
    from: 'P105-OUT', to: 'T101-TOP2', via: [{ x: -16, z: 24 }], viaY: 14,
  },
  {
    id: 'pipe-hq-t102', color: 'inhibitor', diameter: 0.12, flow: 0.3,
    from: 'P105-OUT3', to: 'T102-TOP2', viaY: 20,
  },
  {
    id: 'pipe-hq-t103', color: 'inhibitor', diameter: 0.12, flow: 0.3,
    from: 'P105-OUT2', to: 'T103-TOP2', viaY: 18,
  },
]

/** 相机导览机位（适配完整厂区：全厂总览拉远看全配套，面向落日逆光）
 *  R4：塔区/球罐机位微调为斜侧视角（3/4 构图，剪影+体积光可见） */
export const CAMERA_TOURS = [
  { name: '全厂总览', pos: [70, 110, -150], target: [0, 5, 0] },
  { name: '罐区', pos: [-50, 25, -8], target: [-47, 4, -30] },
  { name: '反应区', pos: [-38, 16, 36], target: [-26, 5, 18] },
  { name: '塔区', pos: [4, 20, 46], target: [8, 9, 22] },
  { name: '产品球罐', pos: [44, 18, -14], target: [55, 5, -32] },
  { name: '配套区', pos: [-60, 32, 62], target: [-80, 6, 15] },
] as const
