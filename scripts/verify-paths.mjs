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

// src/connectors/path.ts
import * as THREE2 from "three";

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
function resolvePipePath(def) {
  const viaY = def.viaY ?? 6;
  const pts = [];
  const push = (x, y, z) => {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.x - x) < 1e-3 && Math.abs(last.y - y) < 1e-3 && Math.abs(last.z - z) < 1e-3) return;
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

// scripts/verify-paths.ts
function buildCylinders() {
  const out = [];
  for (const e of EQUIPMENTS) {
    const p = e.params ?? {};
    switch (e.type) {
      case "tank":
        out.push({ id: e.id, x: e.x, z: e.z, r: p.radius ?? 4, y0: 0, y1: (p.height ?? 6) + 2.5 });
        break;
      case "sphere":
        out.push({ id: e.id, x: e.x, z: e.z, r: (p.radius ?? 6) * 1.02, y0: 0, y1: (p.radius ?? 6) * 2.6 });
        break;
      case "reactor":
        out.push({ id: e.id, x: e.x, z: e.z, r: p.radius ?? 1.8, y0: 0, y1: (p.height ?? 9) + 5 });
        break;
      case "column":
        out.push({ id: e.id, x: e.x, z: e.z, r: p.radius ?? 1.5, y0: 0, y1: (p.height ?? 16) + 4 });
        break;
      case "exchanger":
        out.push({ id: e.id, x: e.x, z: e.z, r: 1.2, y0: 0.6, y1: 2.9 });
        break;
      case "mixer":
        out.push({ id: e.id, x: e.x, z: e.z, r: 0.8, y0: 0.8, y1: 1.6 });
        break;
      case "inhibitorTank":
        out.push({ id: e.id, x: e.x, z: e.z, r: p.radius ?? 1.2, y0: 0, y1: (p.height ?? 2) + 2 });
        break;
      default:
        break;
    }
  }
  return out;
}
var cyls = buildCylinders();
var issues = 0;
for (const pipe of PIPES) {
  const pts = resolvePipePath(pipe);
  const fromDev = pipe.from.match(/^([A-Z]+\d*-\d+)/)?.[0] ?? "";
  const toDev = pipe.to.match(/^([A-Z]+\d*-\d+)/)?.[0] ?? "";
  const exclude = /* @__PURE__ */ new Set([fromDev, toDev]);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    for (let s = 1; s <= 4; s++) {
      const pt = a.clone().lerp(b, s / 4);
      for (const c of cyls) {
        if (exclude.has(c.id)) continue;
        if (pt.y < c.y0 - 0.2 || pt.y > c.y1 + 0.2) continue;
        const dx = pt.x - c.x, dz = pt.z - c.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < c.r + pipe.diameter / 2 + 0.25) {
          console.log(`\u26A0 ${pipe.id} \u6BB5 ${i} \u91C7\u6837\u70B9 (${pt.x.toFixed(1)},${pt.y.toFixed(1)},${pt.z.toFixed(1)}) \u7A7F\u5165 ${c.id}\uFF08\u8DDD\u79BB ${dist.toFixed(2)} < ${c.r.toFixed(2)}+\uFF09`);
          issues++;
          break;
        }
      }
    }
  }
  console.log(`\u2713 ${pipe.id} \u2192 ${pts.length} \u70B9`);
}
console.log(issues === 0 ? "\n\u2705 \u5168\u90E8\u7BA1\u7EBF\u65E0\u7A7F\u8D8A" : `
\u274C \u53D1\u73B0 ${issues} \u5904\u7A7F\u8D8A`);
