// scripts/verify-all.ts
import * as THREE3 from "three";

// src/layout/plantLayout.ts
var EQUIPMENTS = [
  // ── 北区：罐区 ─────────────────────────────
  {
    id: "V-101",
    name: "\u4E19\u70EF\u9178\u50A8\u7F50",
    type: "tank",
    x: -55,
    z: -32,
    info: { desc: "\u65B0\u9C9C\u4E19\u70EF\u9178\u539F\u6599\u7ACB\u5F0F\u50A8\u7F50", conditions: "\u4F4E\u6E29\u50A8\u5B58 <25\u2103", material: "\u4E0D\u9508\u94A2" },
    params: { radius: 4, height: 6, color: 15263976, band: 13777980 }
  },
  {
    id: "V-102",
    name: "\u7532\u9187\u50A8\u7F50",
    type: "tank",
    x: -40,
    z: -32,
    info: { desc: "\u7532\u9187\u539F\u6599\u7ACB\u5F0F\u5185\u6D6E\u9876\u50A8\u7F50", conditions: "\u6C2E\u5C01\u50A8\u5B58", material: "\u78B3\u94A2" },
    params: { radius: 4, height: 6, color: 14080992, band: 3112928 }
  },
  {
    id: "V-105",
    name: "\u4EA7\u54C1\u7403\u7F50",
    type: "sphere",
    x: 55,
    z: -32,
    info: { desc: "\u4E19\u70EF\u9178\u7532\u916F(MA)\u4EA7\u54C1\u7403\u7F50", conditions: "\u4EA7\u54C1\u7EAF\u5EA6 \u226597%", material: "\u4F4E\u5408\u91D1\u94A2" },
    params: { radius: 6, legs: 6 }
  },
  {
    id: "V-104",
    name: "\u963B\u805A\u5242\u6EB6\u89E3\u7F50",
    type: "inhibitorTank",
    x: 8,
    z: -20,
    info: { desc: "\u5BF9\u82EF\u4E8C\u915A(HQ)\u963B\u805A\u5242\u914D\u5236\u7F50", conditions: "\u5E38\u6E29\u5E38\u538B", material: "\u4E0D\u9508\u94A2" },
    params: { radius: 1.2, height: 2 }
  },
  // ── 南区：反应区（自西向东） ────────────────
  {
    id: "M-101",
    name: "\u9759\u6001\u6DF7\u5408\u5668",
    type: "mixer",
    x: -46,
    z: 18,
    info: { desc: "\u4E19\u70EF\u9178\u4E0E\u5FAA\u73AF\u7532\u9187\u9759\u6001\u6DF7\u5408", material: "\u4E0D\u9508\u94A2" },
    params: { radius: 0.5, length: 3 }
  },
  {
    id: "E-101",
    name: "\u8FDB\u6599\u9884\u70ED\u5668",
    type: "exchanger",
    x: -36,
    z: 18,
    info: { desc: "\u7BA1\u58F3\u5F0F\u8FDB\u6599\u9884\u70ED\u5668\uFF08\u84B8\u6C7D\u52A0\u70ED\u81F3 80~95\u2103\uFF09", conditions: "\u58F3\u7A0B 0.4MPa \u84B8\u6C7D", material: "\u78B3\u94A2" },
    params: { radius: 1, length: 5 }
  },
  {
    id: "R-101",
    name: "\u56FA\u5B9A\u5E8A\u53CD\u5E94\u5668",
    type: "reactor",
    x: -24,
    z: 18,
    info: {
      desc: "\u5217\u7BA1\u5F0F\u56FA\u5B9A\u5E8A\u53CD\u5E94\u5668\uFF0C\u88C5\u586B\u5F3A\u9178\u6027\u9633\u79BB\u5B50\u4EA4\u6362\u6811\u8102\u50AC\u5316\u5242",
      conditions: "80~100\u2103 / 0.3~0.5 MPa \u6DB2\u76F8",
      material: "\u4E19\u70EF\u9178 + \u7532\u9187 \u21CC \u4E19\u70EF\u9178\u7532\u916F + \u6C34"
    },
    params: { radius: 1.8, height: 9 }
  },
  // ── 南区：塔区（品字排开） ────────────────
  {
    id: "T-101",
    name: "\u9178\u5206\u79BB\u5854",
    type: "column",
    x: -6,
    z: 22,
    info: { desc: "\u7B2C\u4E00\u5206\u79BB\uFF1A\u56DE\u6536\u672A\u53CD\u5E94\u4E19\u70EF\u9178\uFF08\u5854\u91DC\u91C7\u51FA\u5FAA\u73AF\u56DE\u53CD\u5E94\u5668\uFF09", conditions: "\u5854\u91DC\u9AD8\u6E29\u4F4D", material: "\u9AD8\u6CB8\u70B9\u7EC4\u5206\u5206\u79BB" },
    params: { radius: 1.6, height: 18 }
  },
  {
    id: "T-102",
    name: "\u7532\u9187\u56DE\u6536\u5854",
    type: "column",
    x: 10,
    z: 22,
    info: { desc: "\u7B2C\u4E8C\u5206\u79BB\uFF1A\u5854\u9876\u5206\u51FA\u7532\u9187\u5FAA\u73AF\u56DE\u53CD\u5E94\u5668\uFF08\u7EF4\u6301\u8FC7\u91CF\u7532\u9187\u63A8\u52A8\u5E73\u8861\uFF09", conditions: "\u5854\u9876\u4F4E\u6E29\u4F4D", material: "\u4F4E\u6CB8\u70B9\u7EC4\u5206\u5206\u79BB" },
    params: { radius: 1.4, height: 16 }
  },
  {
    id: "T-103",
    name: "\u916F\u7CBE\u5236\u5854",
    type: "column",
    x: 26,
    z: 22,
    info: { desc: "\u5171\u6CB8\u7CBE\u998F\u8131\u6C34\u8131\u91CD\u7EC4\u5206\uFF0C\u5854\u91DC\u91C7\u51FA\u9AD8\u7EAF\u4EA7\u54C1", conditions: "\u4EA7\u54C1\u7EAF\u5EA6 \u226597%", material: "\u6210\u54C1\u7CBE\u5236" },
    params: { radius: 1.5, height: 14 }
  },
  // ── 泵棚 ────────────────────────────────
  { id: "P-101", name: "\u4E19\u70EF\u9178\u8FDB\u6599\u6CF5", type: "pump", x: -55, z: -14, info: { desc: "\u4E19\u70EF\u9178\u8F93\u9001\u6CF5" } },
  { id: "P-102", name: "\u7532\u9187\u8FDB\u6599\u6CF5", type: "pump", x: -40, z: -14, info: { desc: "\u7532\u9187\u8F93\u9001\u6CF5" } },
  { id: "P-103", name: "\u53CD\u5E94\u8FDB\u6599\u6CF5", type: "pump", x: -46, z: 27, info: { desc: "\u6DF7\u5408\u7269\u6599\u52A0\u538B\u8FDB\u53CD\u5E94\u5668" } },
  { id: "P-104", name: "\u9178\u5FAA\u73AF\u6CF5", type: "pump", x: -6, z: 34, info: { desc: "\u5854\u91DC\u4E19\u70EF\u9178\u5FAA\u73AF\u56DE\u53CD\u5E94\u5668" } },
  { id: "P-105", name: "\u963B\u805A\u5242\u8BA1\u91CF\u6CF5", type: "pump", x: 8, z: -14, info: { desc: "\u5BF9\u82EF\u4E8C\u915A\u8FDE\u7EED\u8BA1\u91CF\u6CE8\u5165" } }
];
var PIPES = [
  // 原料线：罐区 → 泵 → 混合器（经管廊）
  {
    id: "pipe-aa",
    color: "acrylicAcid",
    diameter: 0.35,
    flow: 0.8,
    from: "V101-OUT-1",
    to: "M101-IN-AA",
    via: [{ pump: "P-101" }]
  },
  {
    id: "pipe-meoh",
    color: "methanol",
    diameter: 0.4,
    flow: 1,
    from: "V102-OUT-1",
    to: "M101-IN-MEOH",
    via: [{ pump: "P-102" }]
  },
  // 混合器 → 预热器 → 反应器（地面低架，带管托支撑）
  {
    id: "pipe-mix-pre",
    color: "methanol",
    diameter: 0.4,
    flow: 0.9,
    from: "M101-OUT",
    to: "E101-IN",
    viaY: 2.8
  },
  {
    id: "pipe-pre-r",
    color: "reactorOut",
    diameter: 0.4,
    flow: 0.9,
    from: "E101-OUT",
    to: "R101-IN",
    via: [{ pump: "P-103" }],
    viaY: 3.6
  },
  // 反应器 → 酸分离塔（绕 T-101 东侧 z=26 外侧接入，避免穿塔）
  {
    id: "pipe-r-t101",
    color: "reactorOut",
    diameter: 0.4,
    flow: 0.9,
    from: "R101-OUT",
    to: "T101-IN",
    via: [{ x: -21.7, z: 26 }, { x: -6, z: 26 }]
  },
  // 酸循环：T-101 塔釜 → P-104 → 反应器第二进料口（红线，经管廊返回）
  {
    id: "pipe-acid-recycle",
    color: "acrylicAcid",
    diameter: 0.3,
    flow: 0.7,
    from: "T101-BOT",
    to: "R101-IN2",
    via: [{ pump: "P-104" }]
  },
  // T-101 塔顶 → T-102 进料（高位层，从塔上方跨过）
  {
    id: "pipe-t101-t102",
    color: "overhead",
    diameter: 0.35,
    flow: 0.8,
    from: "T101-TOP",
    to: "T102-IN",
    viaY: 17
  },
  // 甲醇循环：T-102 塔顶 → 混合器第二甲醇口（蓝线，经管廊返回）
  {
    id: "pipe-meoh-recycle",
    color: "methanol",
    diameter: 0.35,
    flow: 0.8,
    from: "T102-TOP",
    to: "M101-IN-MEOH2",
    viaY: 8,
    via: [{ x: -46, z: -6 }]
  },
  // T-102 塔釜 → T-103
  {
    id: "pipe-t102-t103",
    color: "overhead",
    diameter: 0.35,
    flow: 0.8,
    from: "T102-BOT",
    to: "T103-IN"
  },
  // 成品：T-103 塔釜 → 球罐（黄线，经管廊 z=28 东段）
  {
    id: "pipe-product",
    color: "product",
    diameter: 0.35,
    flow: 0.6,
    from: "T103-BOT",
    to: "V105-IN-1",
    via: [{ x: 42, z: 28 }, { x: 48, z: -6 }]
  },
  // 阻聚剂：V-104 → P-105（主管）→ 三路支管分送三塔塔顶（错开高度层，避免重叠/穿塔）
  {
    id: "pipe-hq-main",
    color: "inhibitor",
    diameter: 0.16,
    flow: 0.35,
    from: "V104-OUT-1",
    to: "P105-OUT",
    via: [{ pump: "P-105" }]
  },
  {
    id: "pipe-hq-t101",
    color: "inhibitor",
    diameter: 0.12,
    flow: 0.3,
    from: "P105-OUT",
    to: "T101-TOP",
    via: [{ x: -16, z: 24 }],
    viaY: 14
  },
  {
    id: "pipe-hq-t102",
    color: "inhibitor",
    diameter: 0.12,
    flow: 0.3,
    from: "P105-OUT",
    to: "T102-TOP",
    viaY: 20
  },
  {
    id: "pipe-hq-t103",
    color: "inhibitor",
    diameter: 0.12,
    flow: 0.3,
    from: "P105-OUT",
    to: "T103-TOP",
    viaY: 18
  }
];

// src/layout/ports.ts
import * as THREE from "three";
function pumpPorts(id) {
  const n = id.replace("P-", "P");
  return {
    [`${n}-IN`]: { id: `${n}-IN`, elementId: id, offset: [-0.62, 0.72, 0.45], dir: [0, 0, 1], diameter: 0.26, kind: "pumpIn" },
    [`${n}-OUT`]: { id: `${n}-OUT`, elementId: id, offset: [-0.62, 1.68, 0], dir: [0, 1, 0], diameter: 0.22, kind: "pumpOut" }
  };
}
var PORTS = {
  // ── 罐区 ──
  "V101-OUT-1": { id: "V101-OUT-1", elementId: "V-101", offset: [-2, 0.85, 4], dir: [0, 0, 1], diameter: 0.35, kind: "nozzle" },
  "V101-IN-1": { id: "V101-IN-1", elementId: "V-101", offset: [4, 1.15, -1.6], dir: [1, 0, 0], diameter: 0.35, kind: "nozzle" },
  "V102-OUT-1": { id: "V102-OUT-1", elementId: "V-102", offset: [-2, 0.85, 4], dir: [0, 0, 1], diameter: 0.35, kind: "nozzle" },
  "V102-IN-1": { id: "V102-IN-1", elementId: "V-102", offset: [4, 1.15, -1.6], dir: [1, 0, 0], diameter: 0.35, kind: "nozzle" },
  // 球罐进料口（西侧球面外，面向管廊来向）
  "V105-IN-1": { id: "V105-IN-1", elementId: "V-105", offset: [-6.6, 6, 0], dir: [1, 0, 0], diameter: 0.35, kind: "nozzle" },
  // 阻聚剂溶解罐出料（z+ 侧）
  "V104-OUT-1": { id: "V104-OUT-1", elementId: "V-104", offset: [0, 0.9, 1.2], dir: [0, 0, 1], diameter: 0.16, kind: "nozzle" },
  // ── 反应区 ──
  "M101-IN-AA": { id: "M101-IN-AA", elementId: "M-101", offset: [0, 1.15, 1.6], dir: [0, 0, 1], diameter: 0.35, kind: "flange" },
  "M101-IN-MEOH": { id: "M101-IN-MEOH", elementId: "M-101", offset: [-0.65, 1.15, 0], dir: [-1, 0, 0], diameter: 0.35, kind: "flange" },
  "M101-IN-MEOH2": { id: "M101-IN-MEOH2", elementId: "M-101", offset: [-0.65, 1.15, 0.65], dir: [-1, 0, 0], diameter: 0.32, kind: "flange" },
  "M101-OUT": { id: "M101-OUT", elementId: "M-101", offset: [0, 1.15, -1.6], dir: [0, 0, -1], diameter: 0.4, kind: "flange" },
  "E101-IN": { id: "E101-IN", elementId: "E-101", offset: [-2.95, 1.8, 0], dir: [1, 0, 0], diameter: 0.4, kind: "nozzle" },
  "E101-OUT": { id: "E101-OUT", elementId: "E-101", offset: [2.95, 1.8, 0], dir: [-1, 0, 0], diameter: 0.4, kind: "nozzle" },
  "R101-IN": { id: "R101-IN", elementId: "R-101", offset: [1.8, 4.9, 0], dir: [1, 0, 0], diameter: 0.4, kind: "nozzle" },
  "R101-IN2": { id: "R101-IN2", elementId: "R-101", offset: [1.8, 4.9, 0.9], dir: [1, 0, 0], diameter: 0.3, kind: "nozzle" },
  "R101-OUT": { id: "R101-OUT", elementId: "R-101", offset: [1.8, 9.22, 0], dir: [1, 0, 0], diameter: 0.4, kind: "nozzle" },
  // ── 塔区（IN 管口均位于塔 z+ 侧表面，dir 朝外，避免外延点插入塔体） ──
  "T101-IN": { id: "T101-IN", elementId: "T-101", offset: [0, 4.8, 1.7], dir: [0, 0, 1], diameter: 0.4, kind: "nozzle" },
  "T101-TOP": { id: "T101-TOP", elementId: "T-101", offset: [0, 20.8, 1.6], dir: [0, 0, 1], diameter: 0.35, kind: "tankTop" },
  "T101-BOT": { id: "T101-BOT", elementId: "T-101", offset: [0, 1.5, 1.6], dir: [0, 0, 1], diameter: 0.3, kind: "tankBottom" },
  "T102-IN": { id: "T102-IN", elementId: "T-102", offset: [0, 4.8, 1.5], dir: [0, 0, 1], diameter: 0.35, kind: "nozzle" },
  "T102-TOP": { id: "T102-TOP", elementId: "T-102", offset: [0, 18.9, 1.4], dir: [0, 0, 1], diameter: 0.35, kind: "tankTop" },
  "T102-BOT": { id: "T102-BOT", elementId: "T-102", offset: [0, 1.5, 1.4], dir: [0, 0, 1], diameter: 0.3, kind: "tankBottom" },
  "T103-IN": { id: "T103-IN", elementId: "T-103", offset: [0, 4.8, 1.6], dir: [0, 0, 1], diameter: 0.35, kind: "nozzle" },
  "T103-TOP": { id: "T103-TOP", elementId: "T-103", offset: [0, 16.9, 1.5], dir: [0, 0, 1], diameter: 0.35, kind: "tankTop" },
  "T103-BOT": { id: "T103-BOT", elementId: "T-103", offset: [0, 1.5, 1.5], dir: [0, 0, 1], diameter: 0.3, kind: "tankBottom" },
  // ── 泵（管线中途串接） ──
  ...pumpPorts("P-101"),
  ...pumpPorts("P-102"),
  ...pumpPorts("P-103"),
  ...pumpPorts("P-104"),
  ...pumpPorts("P-105")
};
function portWorldPos(id) {
  const p = PORTS[id];
  const e = EQUIPMENTS.find((e2) => e2.id === p.elementId);
  return new THREE.Vector3(e.x + p.offset[0], p.offset[1], e.z + p.offset[2]);
}
function portEnd(id, extend = 0.5) {
  const p = PORTS[id];
  const w = portWorldPos(id);
  return new THREE.Vector3(
    w.x + p.dir[0] * extend,
    w.y + p.dir[1] * extend,
    w.z + p.dir[2] * extend
  );
}

// src/connectors/path.ts
import * as THREE2 from "three";
function resolvePipePath(def) {
  const viaY = def.viaY ?? 6;
  const pts = [];
  const push = (x, y, z) => {
    const last2 = pts[pts.length - 1];
    if (last2 && Math.abs(last2.x - x) < 1e-3 && Math.abs(last2.y - y) < 1e-3 && Math.abs(last2.z - z) < 1e-3) return;
    pts.push(new THREE2.Vector3(x, y, z));
  };
  const P0 = portEnd(def.from, 0.5);
  const P1 = portEnd(def.to, 0.5);
  push(P0.x, P0.y, P0.z);
  if (Math.abs(P0.y - viaY) > 0.05) push(P0.x, viaY, P0.z);
  for (const v of def.via ?? []) {
    if (v.pump) {
      const base = v.pump.replace("P-", "P");
      const pin = portEnd(`${base}-IN`, 0.3);
      const pout = portEnd(`${base}-OUT`, 0.3);
      const cur2 = pts[pts.length - 1];
      push(pin.x, cur2.y, cur2.z);
      push(pin.x, cur2.y, pin.z);
      push(pin.x, pin.y, pin.z);
      push(pout.x, pout.y, pout.z);
      if (`${base}-OUT` !== def.to) push(pout.x, viaY, pout.z);
    } else {
      const cur2 = pts[pts.length - 1];
      const tx = v.x !== void 0 ? v.x : cur2.x;
      const tz = v.z !== void 0 ? v.z : cur2.z;
      const ty = v.y !== void 0 ? v.y : viaY;
      push(tx, ty, cur2.z);
      push(tx, ty, tz);
    }
  }
  const cur = pts[pts.length - 1];
  push(P1.x, cur.y, cur.z);
  push(P1.x, cur.y, P1.z);
  push(P1.x, P1.y, P1.z);
  return pts;
}
function roundedPolyline(pts, r2 = 1.2) {
  if (pts.length < 3) return pts.slice();
  const out = [pts[0].clone()];
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
    const d1 = p1.clone().sub(p0), d2 = p2.clone().sub(p1);
    const l1 = d1.length(), l2 = d2.length();
    if (l1 < 1e-4 || l2 < 1e-4) {
      out.push(p1.clone());
      continue;
    }
    const u1 = d1.clone().normalize(), u2 = d2.clone().normalize();
    const cosA = Math.max(-1, Math.min(1, u1.dot(u2)));
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    if (sinA < 1e-3) {
      out.push(p1.clone());
      continue;
    }
    const rr = Math.max(0.35, Math.min(r2, l1 / 2, l2 / 2));
    const halfA = Math.acos(cosA) / 2;
    const tanLen = rr / Math.tan(halfA);
    const t1 = p1.clone().addScaledVector(u1, -tanLen);
    const t2 = p1.clone().addScaledVector(u2, tanLen);
    const bisect = u2.clone().sub(u1).normalize();
    const center = p1.clone().addScaledVector(bisect, rr / Math.sin(halfA));
    const normal = u1.clone().cross(u2).normalize();
    const v1 = t1.clone().sub(center).normalize();
    const v2 = t2.clone().sub(center).normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, v1.dot(v2))));
    const n = Math.max(3, Math.ceil(angle / (Math.PI / 14)));
    out.push(t1.clone());
    for (let k = 1; k < n; k++) {
      const a = k / n * angle;
      out.push(center.clone().addScaledVector(v1.clone().applyAxisAngle(normal, a), rr));
    }
    out.push(t2.clone());
  }
  out.push(pts[pts.length - 1].clone());
  return out;
}

// src/training/sop.ts
var SOP_STARTUP = [
  { id: "s1", desc: "\u786E\u8BA4 P-101 \u5C31\u7EEA\uFF0C\u542F\u52A8\u4E19\u70EF\u9178\u8FDB\u6599\u6CF5", target: "P-101", action: "start", targetLabel: "P-101 \u4E19\u70EF\u9178\u8FDB\u6599\u6CF5" },
  { id: "s2", desc: "\u6253\u5F00\u4E19\u70EF\u9178\u8FDB\u6599\u7EBF\u9600\u95E8", target: "pipe-aa", action: "open", targetLabel: "\u4E19\u70EF\u9178\u8FDB\u6599\u7EBF pipe-aa" },
  { id: "s3", desc: "\u542F\u52A8\u7532\u9187\u8FDB\u6599\u6CF5 P-102", target: "P-102", action: "start", targetLabel: "P-102 \u7532\u9187\u8FDB\u6599\u6CF5" },
  { id: "s4", desc: "\u6253\u5F00\u7532\u9187\u8FDB\u6599\u7EBF\u9600\u95E8", target: "pipe-meoh", action: "open", targetLabel: "\u7532\u9187\u8FDB\u6599\u7EBF pipe-meoh" },
  { id: "s5", desc: "\u542F\u52A8\u53CD\u5E94\u8FDB\u6599\u6CF5 P-103", target: "P-103", action: "start", targetLabel: "P-103 \u53CD\u5E94\u8FDB\u6599\u6CF5" },
  { id: "s6", desc: "\u786E\u8BA4\u53CD\u5E94\u5668\u6E29\u5EA6\u7A33\u5B9A\u5728 80~95\u2103", target: "R-101", action: "check", targetLabel: "R-101 \u53CD\u5E94\u5668" }
];
var SOP_SHUTDOWN = [
  { id: "h1", desc: "\u505C\u6B62\u4E19\u70EF\u9178\u8FDB\u6599\u6CF5 P-101", target: "P-101", action: "stop", targetLabel: "P-101 \u8FDB\u6599\u6CF5" },
  { id: "h2", desc: "\u5173\u95ED\u4E19\u70EF\u9178\u8FDB\u6599\u7EBF\u9600\u95E8", target: "pipe-aa", action: "close", targetLabel: "\u4E19\u70EF\u9178\u8FDB\u6599\u7EBF" },
  { id: "h3", desc: "\u505C\u6B62\u7532\u9187\u8FDB\u6599\u6CF5 P-102", target: "P-102", action: "stop", targetLabel: "P-102 \u8FDB\u6599\u6CF5" },
  { id: "h4", desc: "\u5173\u95ED\u7532\u9187\u8FDB\u6599\u7EBF\u9600\u95E8", target: "pipe-meoh", action: "close", targetLabel: "\u7532\u9187\u8FDB\u6599\u7EBF" },
  { id: "h5", desc: "\u505C\u6B62\u53CD\u5E94\u8FDB\u6599\u6CF5 P-103", target: "P-103", action: "stop", targetLabel: "P-103 \u53CD\u5E94\u6CF5" },
  { id: "h6", desc: "\u786E\u8BA4\u53CD\u5E94\u5668\u964D\u6E29\u3001\u7CFB\u7EDF\u6CC4\u538B\u5B8C\u6210", target: "R-101", action: "check", targetLabel: "R-101 \u53CD\u5E94\u5668" }
];
var SopEngine = class {
  steps;
  idx = 0;
  startTime = 0;
  mistakes = 0;
  done = false;
  title;
  constructor(steps, title) {
    this.steps = steps;
    this.title = title;
  }
  begin() {
    this.idx = 0;
    this.mistakes = 0;
    this.startTime = Date.now();
    this.done = false;
  }
  get current() {
    return this.done || this.idx >= this.steps.length ? null : this.steps[this.idx];
  }
  get progress() {
    return `${this.idx}/${this.steps.length}`;
  }
  /** 用户操作目标（设备/管线）与动作是否匹配当前步骤 */
  handle(target, action) {
    const cur = this.current;
    if (!cur) return { ok: false, msg: "SOP \u672A\u5F00\u59CB\u6216\u5DF2\u5B8C\u6210" };
    if (cur.target === target && cur.action === action) {
      this.idx++;
      if (this.idx >= this.steps.length) {
        this.done = true;
        const secs = Math.round((Date.now() - this.startTime) / 1e3);
        const score = Math.max(60, Math.round(100 - this.mistakes * 8 - Math.max(0, secs - 90) * 0.2));
        return { ok: true, msg: `\u2705 \u5B8C\u6210\u300C${this.title}\u300D\uFF1A\u7528\u65F6 ${secs}s\uFF0C\u8BEF\u64CD\u4F5C ${this.mistakes} \u6B21\uFF0C\u5F97\u5206 ${score}`, finished: true, score };
      }
      return { ok: true, msg: `\u2713 \u6B63\u786E\uFF0C\u8FDB\u5165\u7B2C ${this.idx + 1} \u6B65\uFF1A${this.current.desc}` };
    }
    this.mistakes++;
    return { ok: false, msg: `\u2717 \u64CD\u4F5C\u4E0D\u5BF9\uFF08\u5DF2\u8BB0 ${this.mistakes} \u6B21\u8BEF\u64CD\u4F5C\uFF09\uFF0C\u5F53\u524D\u5E94\uFF1A${cur.desc}` };
  }
};

// src/data/processData.ts
var TAG_MAP = {
  "TI-R101": { elementId: "R-101", slot: 0, min: 60, max: 120, unit: "\u2103", label: "\u53CD\u5E94\u6E29\u5EA6", steady: 90, noise: 3, alarmHigh: 100 },
  "PI-R101": { elementId: "R-101", slot: 1, min: 0, max: 0.6, unit: "MPa", label: "\u53CD\u5E94\u538B\u529B", steady: 0.4, noise: 0.03, alarmHigh: 0.5 },
  "TI-T101T": { elementId: "T-101", slot: 0, min: 60, max: 120, unit: "\u2103", label: "\u5854\u9876\u6E29\u5EA6", steady: 82, noise: 2, alarmHigh: 100 },
  "TI-T101B": { elementId: "T-101", slot: 1, min: 100, max: 180, unit: "\u2103", label: "\u5854\u91DC\u6E29\u5EA6", steady: 140, noise: 4 },
  "TI-T102T": { elementId: "T-102", slot: 0, min: 40, max: 100, unit: "\u2103", label: "\u5854\u9876\u6E29\u5EA6", steady: 65, noise: 2 },
  "TI-T102B": { elementId: "T-102", slot: 1, min: 80, max: 140, unit: "\u2103", label: "\u5854\u91DC\u6E29\u5EA6", steady: 105, noise: 3 },
  "TI-T103T": { elementId: "T-103", slot: 0, min: 60, max: 120, unit: "\u2103", label: "\u5854\u9876\u6E29\u5EA6", steady: 78, noise: 2 },
  "TI-T103B": { elementId: "T-103", slot: 1, min: 100, max: 160, unit: "\u2103", label: "\u5854\u91DC\u6E29\u5EA6", steady: 120, noise: 3 },
  "LI-V105": { elementId: "V-105", slot: 0, min: 0, max: 100, unit: "%", label: "\u7403\u7F50\u6DB2\u4F4D", steady: 62, noise: 0.5 },
  "AI-301": { elementId: "V-105", slot: 1, min: 90, max: 100, unit: "%", label: "\u4EA7\u54C1\u7EAF\u5EA6", steady: 97.3, noise: 0.3 },
  "FI-101": { elementId: "M-101", slot: 0, min: 0, max: 20, unit: "m\xB3/h", label: "\u8FDB\u6599\u6D41\u91CF", steady: 12, noise: 0.8 }
};
var PUMP_IDS = ["P-101", "P-102", "P-103", "P-104", "P-105"];
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
var MockDataSource = class {
  timer = null;
  replayTimer = null;
  cbs = [];
  prevStates = {};
  /** 滚动历史窗口（最近 300 帧） */
  frames = [];
  replayIdx = -1;
  onTick(cb) {
    this.cbs.push(cb);
  }
  emit() {
    const points = {};
    const alarms = [];
    for (const [tag, def] of Object.entries(TAG_MAP)) {
      const v = def.steady + (Math.random() - 0.5) * 2 * def.noise;
      points[tag] = Math.round(v * 100) / 100;
      if (def.alarmHigh !== void 0 && v > def.alarmHigh) alarms.push(tag);
    }
    const states = {};
    for (const id of PUMP_IDS) {
      const prev = this.prevStates[id]?.status ?? "RUN";
      let status = prev;
      const roll = Math.random();
      if (prev === "RUN" && roll < 0.015) status = "FAULT";
      else if (prev === "FAULT" && roll < 0.25) status = "RUN";
      else if (prev === "FAULT") status = "STOP";
      states[id] = { status, valveOpen: 55 + Math.random() * 40 };
    }
    for (const p of PIPES) {
      const key = `valve:${p.id}`;
      const prev = this.prevStates[key]?.valveOpen ?? 85;
      states[key] = { status: "RUN", valveOpen: clamp(prev + (Math.random() - 0.5) * 10, 0, 100) };
    }
    this.prevStates = states;
    const frame = { t: Date.now(), points, alarms, states };
    this.frames.push(frame);
    if (this.frames.length > 300) this.frames.shift();
    this.cbs.forEach((cb) => cb(points, alarms, states));
  }
  start(intervalMs = 1e3) {
    if (this.timer) return;
    this.emit();
    this.timer = setInterval(() => this.emit(), intervalMs);
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  /** 历史帧访问（回放/趋势图） */
  getHistory() {
    return this.frames;
  }
  /** 回放历史帧：暂停实时，按 intervalMs 推进；返回 false 表示无数据 */
  startPlayback(cb, intervalMs = 800) {
    if (!this.frames.length) return false;
    this.stop();
    this.stopPlayback();
    this.replayIdx = 0;
    const step = () => {
      if (this.replayIdx >= this.frames.length) {
        this.stopPlayback();
        return;
      }
      const f = this.frames[this.replayIdx++];
      this.cbs.forEach((c) => c(f.points, f.alarms, f.states));
      cb(f.points, f.alarms, f.states);
    };
    step();
    this.replayTimer = setInterval(step, intervalMs);
    return true;
  }
  stopPlayback() {
    if (this.replayTimer) {
      clearInterval(this.replayTimer);
      this.replayTimer = null;
    }
    this.replayIdx = -1;
  }
};

// scripts/verify-all.ts
var pass = 0;
var fail = 0;
function check(name, cond, extra = "") {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log(`  \u274C ${name}${extra ? " \u2014 " + extra : ""}`);
  }
}
var sleep = (ms) => new Promise((r2) => setTimeout(r2, ms));
console.log("\u25A0 1. \u7AEF\u53E3\u5F15\u7528\u5B8C\u6574\u6027");
for (const p of PIPES) {
  const fp = PORTS[p.from], tp = PORTS[p.to];
  check(`${p.id}: from \u7AEF\u53E3\u5B58\u5728`, !!fp, `from=${p.from}`);
  check(`${p.id}: to \u7AEF\u53E3\u5B58\u5728`, !!tp, `to=${p.to}`);
  check(`${p.id}: from \u8BBE\u5907\u5B58\u5728`, !!EQUIPMENTS.find((e) => e.id === fp?.elementId));
  check(`${p.id}: to \u8BBE\u5907\u5B58\u5728`, !!EQUIPMENTS.find((e) => e.id === tp?.elementId));
  for (const v of p.via ?? []) {
    if (v.pump) {
      const base = v.pump.replace("P-", "P");
      check(`${p.id}: \u6CF5 ${v.pump} IN/OUT \u7AEF\u53E3`, !!PORTS[`${base}-IN`] && !!PORTS[`${base}-OUT`]);
    }
  }
}
console.log("\u25A0 2. \u7BA1\u7EBF\u8DEF\u5F84\uFF08NaN / \u6298\u8FD4 / \u7AEF\u70B9\u5438\u9644 / \u5355\u8F74\u6C34\u5E73\u6BB5\uFF09");
for (const p of PIPES) {
  const pts = resolvePipePath(p);
  check(`${p.id}: \u8DEF\u5F84\u70B9\u6570 \u2265 4`, pts.length >= 4, String(pts.length));
  let nan = false;
  for (const v of pts) if (!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) nan = true;
  check(`${p.id}: \u65E0 NaN`, !nan);
  let fold = false;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i].clone().sub(pts[i - 1]);
    const b = pts[i + 1].clone().sub(pts[i]);
    if (a.lengthSq() > 1e-6 && b.lengthSq() > 1e-6 && a.normalize().dot(b.normalize()) < -0.9) fold = true;
  }
  check(`${p.id}: \u65E0 180\xB0 \u6298\u8FD4`, !fold);
  const P0 = portEnd(p.from, 0.5), P1 = portEnd(p.to, 0.5);
  check(`${p.id}: \u8D77\u70B9\u5438\u9644\u7AEF\u53E3`, pts[0].distanceTo(P0) < 0.01);
  check(`${p.id}: \u7EC8\u70B9\u5438\u9644\u7AEF\u53E3`, pts[pts.length - 1].distanceTo(P1) < 0.01);
  for (let i = 1; i < pts.length; i++) {
    const dx = Math.abs(pts[i].x - pts[i - 1].x);
    const dz = Math.abs(pts[i].z - pts[i - 1].z);
    const dy = Math.abs(pts[i].y - pts[i - 1].y);
    if (dy < 0.05 && dx > 0.01 && dz > 0.01) {
      check(`${p.id}: \u6BB5${i} \u6C34\u5E73\u659C\u7EBF`, false);
      break;
    }
  }
}
console.log("\u25A0 3. \u5706\u89D2\u5F2F\u5934");
var corner = [new THREE3.Vector3(0, 0, 0), new THREE3.Vector3(10, 0, 0), new THREE3.Vector3(10, 0, 10), new THREE3.Vector3(0, 0, 10)];
var rounded = roundedPolyline(corner, 1.2);
check("\u5706\u89D2\u540E\u70B9\u6570\u589E\u52A0", rounded.length > corner.length, String(rounded.length));
var sharp = false;
for (let i = 1; i < rounded.length - 1; i++) {
  const a = rounded[i].clone().sub(rounded[i - 1]);
  const b = rounded[i + 1].clone().sub(rounded[i]);
  if (a.lengthSq() > 1e-6 && b.lengthSq() > 1e-6 && a.normalize().dot(b.normalize()) < -0.9) sharp = true;
}
check("\u5706\u89D2\u540E\u65E0\u9510\u89D2\u6298\u8FD4", !sharp);
console.log("\u25A0 4. SOP \u57F9\u8BAD");
var eng = new SopEngine(SOP_STARTUP, "\u5F00\u8F66");
eng.begin();
var r = eng.handle("P-101", "start");
check("S1 \u6B63\u786E\u64CD\u4F5C\u901A\u8FC7", r.ok, r.msg);
r = eng.handle("P-102", "start");
check("\u987A\u5E8F\u9519\u8BEF\u88AB\u62D2+\u6263\u5206", !r.ok);
r = eng.handle("pipe-aa", "open");
check("S2 \u901A\u8FC7", r.ok);
r = eng.handle("P-102", "start");
check("S3 \u901A\u8FC7", r.ok);
r = eng.handle("pipe-meoh", "open");
check("S4 \u901A\u8FC7", r.ok);
r = eng.handle("P-103", "start");
check("S5 \u901A\u8FC7", r.ok);
r = eng.handle("R-101", "check");
check("S6 \u5B8C\u6210", r.ok && r.finished === true, r.msg);
check("\u5F97\u5206 60~100", r.score !== void 0 && r.score >= 60 && r.score <= 100, String(r.score));
var eng2 = new SopEngine(SOP_SHUTDOWN, "\u505C\u8F66");
eng2.begin();
r = eng2.handle("R-101", "check");
check("\u505C\u8F66\u7B2C1\u6B65\u5FC5\u987B\u662F P-101 stop\uFF08\u8D8A\u7EA7\u88AB\u62D2\uFF09", !r.ok);
console.log("\u25A0 5. \u6570\u636E\u6E90\uFF08\u5B9E\u65F6/\u5F55\u5236/\u56DE\u653E\uFF09");
var ds = new MockDataSource();
var frames = 0;
ds.onTick(() => frames++);
ds.start(50);
await sleep(180);
ds.stop();
check("\u5B9E\u65F6\u5E27 \u2265 2", frames >= 2, String(frames));
var hist = ds.getHistory();
check("\u5386\u53F2\u5E27 1~300", hist.length >= 1 && hist.length <= 300, String(hist.length));
var last = hist[hist.length - 1];
check("\u5E27\u542B\u5168\u90E8 tag", last && Object.keys(last.points).length === Object.keys(TAG_MAP).length);
check("\u5E27\u542B 5 \u6CF5\u72B6\u6001", last && PUMP_IDS.every((id) => last.states[id]));
check("\u5E27\u542B\u9600\u95E8\u72B6\u6001", last && Object.keys(last.states).some((k) => k.startsWith("valve:")));
var replayFrames = 0;
var ok = ds.startPlayback(() => replayFrames++, 20);
check("\u56DE\u653E\u542F\u52A8\u6210\u529F", ok);
await sleep(130);
ds.stopPlayback();
check("\u56DE\u653E\u63A8\u8FDB \u2265 2 \u5E27", replayFrames >= 2, String(replayFrames));
console.log(`
\u2550\u2550\u2550 \u7ED3\u679C\uFF1A\u901A\u8FC7 ${pass} \u9879 / \u5931\u8D25 ${fail} \u9879 \u2550\u2550\u2550`);
process.exit(fail > 0 ? 1 : 0);
