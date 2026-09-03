/**
 * 设备接口注册表 —— 管线连接的唯一事实来源
 * 所有端口坐标 = 设备原点(EQUIPMENTS.x/z) + offset，方向 dir 为管口外延方向
 * 必须与 src/shapes/plantShapes.ts 中各设备的管口建模位置保持一致
 */
import * as THREE from 'three'
import { EQUIPMENTS } from './plantLayout'

export interface PortDef {
  id: string
  elementId: string
  /** 相对设备地面原点的偏移 [dx, dy, dz]（y 为世界高度） */
  offset: [number, number, number]
  /** 管口外延方向（决定管线起段/末段朝向） */
  dir: [number, number, number]
  diameter: number
  kind: 'nozzle' | 'flange' | 'tankTop' | 'tankBottom' | 'pumpIn' | 'pumpOut'
}

/** 泵端口模板（5 台离心泵同构） */
function pumpPorts(id: string): Record<string, PortDef> {
  const n = id.replace('P-', 'P')
  return {
    [`${n}-IN`]: { id: `${n}-IN`, elementId: id, offset: [-0.62, 0.72, 0.45], dir: [0, 0, 1], diameter: 0.26, kind: 'pumpIn' },
    [`${n}-OUT`]: { id: `${n}-OUT`, elementId: id, offset: [-0.62, 1.68, 0], dir: [0, 1, 0], diameter: 0.22, kind: 'pumpOut' },
  }
}

export const PORTS: Record<string, PortDef> = {
  // ── 罐区 ──
  'V101-OUT-1': { id: 'V101-OUT-1', elementId: 'V-101', offset: [-2, 0.85, 4], dir: [0, 0, 1], diameter: 0.35, kind: 'nozzle' },
  'V101-IN-1':  { id: 'V101-IN-1', elementId: 'V-101', offset: [4, 1.15, -1.6], dir: [1, 0, 0], diameter: 0.35, kind: 'nozzle' },
  'V102-OUT-1': { id: 'V102-OUT-1', elementId: 'V-102', offset: [-2, 0.85, 4], dir: [0, 0, 1], diameter: 0.35, kind: 'nozzle' },
  'V102-IN-1':  { id: 'V102-IN-1', elementId: 'V-102', offset: [4, 1.15, -1.6], dir: [1, 0, 0], diameter: 0.35, kind: 'nozzle' },
  // 球罐进料口（西侧球面外，面向管廊来向）
  'V105-IN-1':  { id: 'V105-IN-1', elementId: 'V-105', offset: [-6.6, 6.0, 0], dir: [1, 0, 0], diameter: 0.35, kind: 'nozzle' },
  // 阻聚剂溶解罐出料（z+ 侧）
  'V104-OUT-1': { id: 'V104-OUT-1', elementId: 'V-104', offset: [0, 0.9, 1.2], dir: [0, 0, 1], diameter: 0.16, kind: 'nozzle' },

  // ── 反应区 ──
  'M101-IN-AA':   { id: 'M101-IN-AA', elementId: 'M-101', offset: [0, 1.15, 1.6], dir: [0, 0, 1], diameter: 0.35, kind: 'flange' },
  'M101-IN-MEOH': { id: 'M101-IN-MEOH', elementId: 'M-101', offset: [-0.65, 1.15, 0], dir: [-1, 0, 0], diameter: 0.35, kind: 'flange' },
  'M101-IN-MEOH2': { id: 'M101-IN-MEOH2', elementId: 'M-101', offset: [-0.65, 1.15, 0.65], dir: [-1, 0, 0], diameter: 0.32, kind: 'flange' },
  'M101-OUT':     { id: 'M101-OUT', elementId: 'M-101', offset: [0, 1.15, -1.6], dir: [0, 0, -1], diameter: 0.4, kind: 'flange' },
  'E101-IN':  { id: 'E101-IN', elementId: 'E-101', offset: [-2.95, 1.8, 0], dir: [1, 0, 0], diameter: 0.4, kind: 'nozzle' },
  'E101-OUT': { id: 'E101-OUT', elementId: 'E-101', offset: [2.95, 1.8, 0], dir: [-1, 0, 0], diameter: 0.4, kind: 'nozzle' },
  'R101-IN':  { id: 'R101-IN', elementId: 'R-101', offset: [1.8, 4.9, 0], dir: [1, 0, 0], diameter: 0.4, kind: 'nozzle' },
  'R101-IN2': { id: 'R101-IN2', elementId: 'R-101', offset: [1.8, 4.9, 0.9], dir: [1, 0, 0], diameter: 0.3, kind: 'nozzle' },
  'R101-OUT': { id: 'R101-OUT', elementId: 'R-101', offset: [1.8, 9.22, 0], dir: [1, 0, 0], diameter: 0.4, kind: 'nozzle' },

  // ── 塔区（IN 管口均位于塔 z+ 侧表面，dir 朝外，避免外延点插入塔体） ──
  'T101-IN':  { id: 'T101-IN', elementId: 'T-101', offset: [0, 4.8, 1.7], dir: [0, 0, 1], diameter: 0.4, kind: 'nozzle' },
  'T101-TOP': { id: 'T101-TOP', elementId: 'T-101', offset: [0, 20.8, 1.6], dir: [0, 0, 1], diameter: 0.35, kind: 'tankTop' },
  'T101-BOT': { id: 'T101-BOT', elementId: 'T-101', offset: [0, 1.5, 1.6], dir: [0, 0, 1], diameter: 0.3, kind: 'tankBottom' },
  'T102-IN':  { id: 'T102-IN', elementId: 'T-102', offset: [0, 4.8, 1.5], dir: [0, 0, 1], diameter: 0.35, kind: 'nozzle' },
  'T102-TOP': { id: 'T102-TOP', elementId: 'T-102', offset: [0, 18.9, 1.4], dir: [0, 0, 1], diameter: 0.35, kind: 'tankTop' },
  'T102-BOT': { id: 'T102-BOT', elementId: 'T-102', offset: [0, 1.5, 1.4], dir: [0, 0, 1], diameter: 0.3, kind: 'tankBottom' },
  'T103-IN':  { id: 'T103-IN', elementId: 'T-103', offset: [0, 4.8, 1.6], dir: [0, 0, 1], diameter: 0.35, kind: 'nozzle' },
  'T103-TOP': { id: 'T103-TOP', elementId: 'T-103', offset: [0, 16.9, 1.5], dir: [0, 0, 1], diameter: 0.35, kind: 'tankTop' },
  'T103-BOT': { id: 'T103-BOT', elementId: 'T-103', offset: [0, 1.5, 1.5], dir: [0, 0, 1], diameter: 0.3, kind: 'tankBottom' },

  // ── 泵（管线中途串接） ──
  ...pumpPorts('P-101'),
  ...pumpPorts('P-102'),
  ...pumpPorts('P-103'),
  ...pumpPorts('P-104'),
  ...pumpPorts('P-105'),
}

/** 端口 → 世界坐标 */
export function portWorldPos(id: string): THREE.Vector3 {
  const p = PORTS[id]
  const e = EQUIPMENTS.find(e => e.id === p.elementId)!
  return new THREE.Vector3(e.x + p.offset[0], p.offset[1], e.z + p.offset[2])
}

/** 端口的管口外延点（管线起/末点） */
export function portEnd(id: string, extend = 0.5): THREE.Vector3 {
  const p = PORTS[id]
  const w = portWorldPos(id)
  return new THREE.Vector3(
    w.x + p.dir[0] * extend,
    w.y + p.dir[1] * extend,
    w.z + p.dir[2] * extend,
  )
}

/** 设备关联端口（供详情面板/联动高亮使用） */
export function portsOfElement(elementId: string): PortDef[] {
  return Object.values(PORTS).filter(p => p.elementId === elementId)
}
