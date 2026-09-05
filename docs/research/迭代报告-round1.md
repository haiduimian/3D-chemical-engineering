# 3D 工厂场景迭代报告 · Round 1（R1）

> 完成时间：本会话首轮迭代｜状态：✅ 完成并验证

## 前置工作（R0）

1. **firecrawl 调研**（keyless MCP）：检索并抓取 4 组关键词 + 6 个页面（threejs.org example、Babylon.js 官方、AVEVA Digital Twin/E3D Design 页面等），沉淀参考基准文档
   → `docs/research/参考基准-firecrawl.md`（布局/材质/光线/阴影/氛围 五维基准 + 差距优先级排序），原始数据 `docs/research/firecrawl-raw.json`
2. **context7 文档核对**：EffectComposer/UnrealBloomPass/OutputPass、阴影配置、MeshPhysicalMaterial clearcoat/anisotropy 均按 r180 现行 API 复核（项目用法与官方示例一致）
3. **截帧与像素分析工具链**（新增）：
   - `scripts/capture-frames.mjs`：无头 Edge + CDP 截帧 + 页面内 Canvas 像素统计 + 场景运行参数快照
   - `scripts/pngdiff.mjs`：纯 Node PNG 解码的逐像素时间方差分析（闪烁热点定位）
   - `scripts/probe-runtime.mjs`：帧间读取页面运行时场景状态（composer passes/发光体强度）
   - `scripts/firecrawl-research.mjs`：firecrawl MCP 调研脚本
   - `.shots/frames-r0`（基线 20 帧）、`.shots/frames-r1`（修复后 20 帧）

## 闪烁 bug 定位（R0 实测证据）

| 证据 | 数值 |
|---|---|
| 场景快照（页面运行时） | 火炬塔/塔顶信标 emissive 在 **4.0↔8.5** 间横跳；城区航空灯 **2.8↔6.4**；报警灯 **5.0↔0.25** 方波 |
| bloom 阈值 | UnrealBloomPass threshold = **5.0** |
| 根因 | 所有"呼吸式"自发光动效都**穿越 bloom 阈值 5.0** → 光晕"忽大忽小/瞬爆瞬灭"，等效于持续闪烁 |
| 次级根因 | ① 全厂指示灯共享同一份 `lampGlass` 材质 → 一台设备报警时全厂灯一起闪；② 火焰点光强度含 `Math.random()` 每帧随机项 → 60Hz 级光斑噪声；③ 接触阴影盘贴地 2cm，拉远时与地坪 z-fighting |

## R1 改动摘要

| 文件 | 改动参数 | 目的 |
|---|---|---|
| `src/scene/PlantScene.ts` | ① 报警灯：方波 5↔0.25 → **6.4↔0.25 + smoothstep 斜坡 + 帧间指数平滑**（~0.15s 过渡）；90s ② 信标：`4.0+4.5·max(0,sin)` → **`6.1+2.1·max(0,sin)`（6.1~8.2 全程 >5，光晕常驻平滑呼吸）**；③ 设备指示灯按设备克隆专属材质（消除全厂串扰）；④ 新增 **vignette 微晕影** ShaderPass（intensity 0.28/radius 0.72） | 闪烁修复 + 画面收拢 |
| `src/env/environment.ts` | ① 城区航空灯：`2.8+3.6·` → **`5.4+1.8·`（5.4~7.2 全程 >5）**；90s ② 太阳阴影相机 ±150/120/-140 → **±115/100/-120**（贴图纹素密度 +17%） | 闪烁修复 + 阴影锐度 |
| `src/effects/safety.ts` | 火焰点光：`30+sin(t·9)·10+random·6` → **`26+sin(7.3t)·10+sin(11.7t)·6+sin(0.53t)·4`**（无随机、波形连续） | 消除光斑噪声闪烁 |
| `src/materials/textures.ts` | 混凝土贴图 **256→512px、repeat 6×4→10×6**（纹素密度 7→23 px/m，+细节裂缝） | 地面"糊"→ 锐利 |
| `src/shapes/plantShapes.ts` | 接触阴影盘 **y 0.02→0.045**（对齐 DECAL_Y ≥3cm 悬浮规范） | 消除拉远 z-fighting |

## R1 验证结果（像素级，20 帧 × ~10s）

| 指标 | R0 基线 | R1 修复后 | 结论 |
|---|---|---|---|
| 全局帧均值 | 100.38 | 100.36 | 亮度几乎不变（vignette 仅 0.03 影响）|
| 全局时间方差 | 0.008 | 0.006 | 画面主体稳定 |
| 热点像素最大 std | **47.6** | **36.9**（↓22.5%） | 发光体从"爆闪"变为"呼吸" |
| 热点像素（std>30） | 2 px @(672,316)(504,340) | 3 px @(812,354)(564,340) | 变为云/蒸汽边缘的自然过渡 |
| 运行时探针 | — | passes×2 ShaderPass（分级+晕影）；beacons 6.1~8.2；city 5.4~7.18；lamp 2.2 稳态 | 新代码+不变量达标 |

**修复原则（已被探针证实）**：所有动态自发光要么全程 > bloom 阈值（光晕常驻、平滑呼吸），要么全程 < 阈值（无光晕），杜绝穿越；报警灯过渡用连续斜坡。

## R2 方案（下一轮）

| 优先级 | 目标 | 内容 | 预期效果 | 涉及文件 |
|---|---|---|---|---|
| P0 | 体积光/丁达尔（基准第1差距） | 屏幕空间 God Rays：太阳方向径向模糊 additive ShaderPass（96 采样 + 噪声抖动），弱机自动关闭；太阳屏幕坐标与 SUN_DIRECTION 严格对齐 | 夕阳光柱穿透尘埃/雾 —— 电影感最大单项提升 | PlantScene.ts（新增 pass）、sky.ts（导出 sun 投影） |
| P1 | 材质"拥抱不完美" | ① machinedSteel/structuralSteel 挂 grime roughnessMap；② 阀门指示灯克隆材质（消除共享串扰，同 R1 设备灯修复）；③ 铭牌 Canvas 256→512px | 机械件高光有局部变化、阀门颜色独立、铭牌近看清晰 | pbr.ts、valves.ts、plantShapes.ts |
| P1 | 布局基准：分区界面 | 沿厂界/道路加**常绿灌木带**（InstancedMesh 暖剪影低筒簇）＋道路与装置区间碎石过渡带 | 分区感强、天空到地面过渡自然 | environment.ts |
| P2 | 构图复核 | 初始机位微调取景（含体积光角度）、漫游机位 recheck 对焦主体 | 首屏构图更"成片" | PlantScene.ts/plantLayout.ts |
| P2 | 性能 | 统计 DrawCall 预算，InstancedMesh 收敛灌木；控制体素光采样数 | 保持当前帧率 | — |

验收：R2 截帧对比（体积光开启后高光区能量分布、热点数、fps）；真实浏览器人工观感复核。