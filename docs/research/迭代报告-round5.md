# 3D 工厂场景迭代报告 · Round 5（R5 · 收尾轮）

> 完成时间：R4 之后｜状态：✅ 完成并验证 —— 迭代目标达成

## R5 改动摘要

| 文件 | 改动参数 | 目的 |
|---|---|---|
| `src/env/environment.ts` | ① 管廊新增**电缆桥架**：顶层上方两侧纵向电缆槽（沿两段管廊全长）+ 每 8m 一道托架横撑；② 罐区围堰外新增 **3 组灭火器箱**（红色箱体 + 灭火器瓶 + 绿色提压头） | 建模密集度收尾（大厂工艺建模"密而不乱"） |

## R5 验证结果

- 回归防线：静态规则 PASS；运行时采样 beacons 6.10~8.20 / city 5.40~7.20 / flame 6.85~10.18 —— **全部单侧于阈值** ✅
- 像素级：globalMean 101.25→101.27（新细节件不影响亮度基调）、globalStd 0.009（画面稳定）、热点 std ~33-36（呼吸量级不变）✅
- `vite build` 通过（1,649KB，+0.06%）

---

# R0→R5 总交付一览

## 一、参考基准（R0）
- `docs/research/参考基准-firecrawl.md`：天（firecrawl 实抓 threejs/Babylon/AVEVA 等）→ 五维基准（布局/材质/光线/阴影/氛围）+ 差距排序
- context7：three.js r180 EffectComposer/SSAO/UnrealBloom/OutputPass、阴影、MeshPhysicalMaterial（clearcoat/anisotropy/iridescence）API 核对

## 二、闪烁 bug（R1 根因 + R4 防回归）
**根因**：动态自发光强度穿越 UnrealBloomPass 阈值（5.0）→ 光晕瞬爆瞬灭 = 持续闪烁（实测证据：信标 4.0↔8.5、城区灯 2.8↔6.4、报警灯 5.0↔0.25 方波 + 共享材质串扰 + 火焰光随机抖动）
**修复**：
- 信标/城区灯全程 > 阈值（光晕常驻平滑呼吸）；报警灯平滑斜坡；灯珠按设备克隆材质；火焰光平滑化
- 接触阴影盘抬升防 z-fighting；管线脉冲/箭头去卡通（低自发光）
**防回归**：`emissionInvariants.ts` 规则表（15 项）静态断言 + 截帧工具运行时 8s 采样校验 —— **每轮构建自动执行，双通道 PASS**

## 三、大厂级视觉（R1-R5 逐轮落地，全部像素级验证）
| 维度 | 落地内容 |
|---|---|
| 布局 | 厂界灌木带/分区界面、管廊电缆桥架、灭火器箱、围堰安全设施、配套区（中控楼/仓库/消防站/停车/门诊）、城区远景 + 航空灯 |
| 材质 | MeshPhysicalMaterial（clearcoat/anisotropy/**iridescence**）+ 程序化法线/粗糙度/污损贴图；保温铝皮 512px+雨渍锈蚀；混凝土 512px 3倍纹素密度；铭牌 512px |
| 光线 | Preetham 物理天空（暖晕增强）+ IBL 一致环境、落日主光/冷补光/**暖 rim**、路灯点光、**God Rays 体积光**（屏外斜射光型）、vignette 收拢 |
| 阴影 | PCFSoft 4096² 收紧至 ±115 + **次级 2048² 核心光**（2.3× 密度）+ 接触阴影 + z-fighting 全规避 |
| 氛围 | 双层云（暖亮+暗云）、蒸汽/浮尘/火光、双层地平线暖光带、青橙分级 + ACES/AgX + 微晕影 |

## 四、指标链（像素级，20 帧×10s）
| 指标 | R0 | R1 | R2 | R3 | R4 | R5 |
|---|---|---|---|---|---|---|
| 全局帧均值 | 100.4 | 100.36 | 100.28 | 101.04 | 101.0 | 101.27 |
| 全局时间方差 | 0.008 | 0.006 | 0.008 | 0.015 | — | 0.009 |
| 热点像素 max std | 47.6 | 36.9 | 35.7 | 36.8 | 32.8 | 36.1 |
| 阈值单侧约束 | ✗穿越 | ✓ | ✓ | ✓ | ✓ | ✓（运行时采样） |

## 五、涉及文件清单（全部改动）
src：`scene/PlantScene.ts`、`scene/emissionInvariants.ts`（新）、`env/environment.ts`、`env/sky.ts`、`materials/pbr.ts`、`materials/textures.ts`、`shapes/plantShapes.ts`、`shapes/valves.ts`、`connectors/pipes.ts`、`layout/plantLayout.ts`、`effects/safety.ts`
scripts：`capture-frames.mjs`（新，截帧+回归+近景验收）、`pngdiff.mjs`（新）、`probe-runtime.mjs`（新）、`godrays-test.mjs`（新）、`firecrawl-research.mjs`（新）
docs：`research/参考基准-firecrawl.md`、`research/迭代报告-round1~5.md`、`research/firecrawl-raw.json`

## 六、人工复核指引（真实 GPU）
1. `npm run dev` → http://localhost:5180/3D-chemical-engineering/
2. 默认视角 5 秒观察塔顶信标/火炬火苗：应为**平滑呼吸的红晕**（无忽明忽灭），城区远景航空灯同
3. 点"自动漫游"巡航 6 机位，近景检查：混凝土地面纹理、塔身铝皮雨渍锈蚀、球罐高光虹彩、管廊桥架
4. 触发"模拟着火"：火焰光应低频闪烁无噪声颗粒
5. 巡视 60s，确认帧率 ≥50fps（中端机）/ ≥30fps（弱机自动降级）
6. `git commit` 归档本轮全部改动（见文件清单）；`npm run build` + GitHub Pages 部署预览可直接使用 dist

> 结论：五轮迭代后，场景在布局、材质、光线、阴影、氛围五个维度均达到参考基准目标；闪烁 bug 已定位根因、彻底修复并内置回归防线。目标达成。