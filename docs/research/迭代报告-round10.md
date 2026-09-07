# 3D 工厂场景迭代报告 · Round 10（R10 · 管线-设备口径体系 + 管廊完善 + 云影/碰撞）

> 状态：✅ 完成（验收数据见 §5）
> 需求来源：用户指定"管线与设备交界处：管线粗细适应设备口径 + 管廊完善"，其余按 R9 白皮书 N3 方案

## 1. 本轮核心改造

### 1.1 管线-设备口径体系（用户重点 1）
| 项 | 实现 |
|---|---|
| 口径推导 | `PipeDef.diameter` 改为可选；缺省 = `autoDiameter(from,to,via)` = **两端端口口径较大值 + 串接泵出入口**——管线粗细永远不小于所连设备管嘴 |
| 数据修正 | pipe-meoh 0.4→auto(0.35)；pipe-hq-main 删显式值→auto(0.22)（泵出口主管加粗，V-104 端 0.22→0.16 大小头过渡） |
| 交界法兰 | `addPortTransition` 增强：端口法兰盘（口径×1.85 扁圆柱，机加工钢）+ 短管 + 大小头；**泵端口也补法兰盘**（原跳过，模型统一） |
| 审计防线 | `auditPipePortSizes()`：管线直径 vs 端口推导差 >0.03 即报警（console.error + `__ps.sizeAudit` 供验收读取）；泵出口三通分配支管（hq-t101/102/103）工艺有意变径，入白名单 |
| 管廊托架 | 低架段原有管托；**管廊层（viaY 5.6~7.6 且水平段位于管廊 z±1.6）自动生成"管廊托架"**（短支柱+鞍座） |

### 1.2 管廊完善（用户重点 2）
- **柱基混凝土墩**（1.2×0.5×1.2，每柱）
- **X 斜撑**（每两跨一组，对角细柱交叉——钢结构承载语义）
- **公用工程管线层**：5 条贯穿小线（蒸汽白/冷却水蓝/仪表风灰/氮气/污水绿，Φ0.065~0.09）敷设于第二梁层上方 + 每 8m 管托横梁（InstancedMesh 单 DrawCall）+ 端部放空短管/封头
- 与 PIPES 拓扑零冲突（两档 Mean 稳定，见 §5）

### 1.3 云影投影（N3-P0）
- 每朵云挂地面软影贴片（径向渐变贴图、y=0.07 贴地、renderOrder 高层、fog:false）
- 云组整体旋转动画自动带动影子绕场心移动
- 时段联动：`cloudShadow` 预设字段 午后 0.22 / 黄昏 0.15 / 夜景 0.02，随过渡插值
- 弱机（weak）不生成云影贴片

### 1.4 巡检碰撞体（N3-P0）
- `firstPerson.ts`：`Collider` AABB 表 + `resolveCollision`（X/Z 轴滑移）+ `PLAYER_RADIUS 0.45`
- `buildPatrolColliders()`：15 设备 + 8 围堰墙段（**西/东墙留 4m 门洞**，巡检可进罐区）+ 32 管廊柱/墩
- PlantScene 注入 + `__ps.collisionResolve` 测试入口
- 验证脚本 `patrol-collide-check.mjs`：穿罐/贴柱滑移/空旷区/围堰 4 组断言

## 2. 过程踩坑（重要教训）

1. **`pipeMaterial` 使用前未 import**（environment.ts 管廊公用线引入）：ReferenceError 在构造早期抛出 →
   场景半成品（无设备无管线无碰撞体）且**无显式报错感知**（页面仍挂载、invariants 仍打印）。
   教训：**新引用模块成员必须同步 import；构造中断排查要靠"执行到哪一行"的二分探针**
   （perfStats.tier / equipmentGroups.length / console 捕获三件套）。
2. **审计误报被当成错误**：泵出口三通分配支管（0.12 < 泵出口 0.22）是工艺有意变径 → 审计加白名单
   （大小头/三通即工艺本身，不视为违规）。
3. **pwsh 改写 UTF-8 源码 = 灾难**（Set-Content 按 ANSI 读写 → 中文注释乱码，需 git 恢复）：
   4. 源码一律用 edit/write 工具；pwsh 只做构建/运行。

## 5. 验收结果

| 验收项 | 结果 |
|---|---|
| 三档均值（sky-preset-probe） | 午后 57.2 / 黄昏 60.3 / 夜景 58.1（管廊/法兰/云影未扰动亮度契约） |
| 时段全量（timeod-check） | **ALL PASS**：三档 56.9/59.8/57.5 互差 ≤4.85%、过渡 max 0.83%、复位 1365ms、hiPct 三档 0%、真闪烁 0/0/2、天空带断言 ✅ |
| 口径审计 | sizeAudit = 空（PASS；console 无 PipeSizeAudit 报错） |
| 碰撞专项（patrol-collide-check） | **59 碰撞体 ALL PASS**：V-101 拒穿、管廊柱滑移、空旷区自由、围堰阻挡+门洞 |
| capture-frames（R10 快照） | invariants PASS / runtime PASS / 帧均值 59.9~60.4 / hiPct 0 |
| pipe-collision | **0 重叠**（R7~R9 的 1 处泵出口端到端对接亦消解） |

## 6. 下一轮方案（N4 摘要，见新白皮书）
- P0 部件级拾取（阀门/仪表/法兰，raycast 分层 + 高亮）；P1 弱机内存档位（纹理/顶点降档表）；
- P1 报警联动剧本（连锁报警→自动聚焦+SOP 引导）；P2 夜景湿地面反射（大厂基准）；
- P2 性能基准入库 + CI workflow（gh-pages Actions 自动部署）；P3 真实数据接入（WebSocket/OPC-UA 演示位）