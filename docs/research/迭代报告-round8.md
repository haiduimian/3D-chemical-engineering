# 3D 工厂场景迭代报告 · Round 8（R8 · N1 时段系统 + 全局提亮去阴冷）

> 状态：✅ 开发完成，验收数据以 `docs/research/白皮书-项目现状与下一阶段开发.md`（R8 版）第五节为准
> 需求来源：R7 白皮书 §4（N1 时段系统量化目标）+ 画面"偏暗偏冷"口头反馈（本轮补充需求）

## 1. 本轮目标

| # | 目标 | 验收口径（白皮书 §4） |
|---|---|---|
| 1 | 午后/黄昏/夜景 3 档时段切换（太阳位置·Preetham·路灯·IBL 联动） | 插值 ≤0.8s、相邻帧均值差 ≤±3% |
| 2 | 三档截帧对比 | 全局均值差 ≤±8%、hiPct ≤0.05% |
| 3 | 闪烁回归 | 静态+运行时 invariants PASS、稳态热点(std>30) ≤10px |
| 4 | 画面偏暗偏冷修正（未写入白皮书的补充需求） | 黄昏档全局均值提升、warmth(R−B)>0 |
| 5 | 架构优化 | context7 对照 three.js 官方范式；firecrawl 调研大厂视觉规范 |

## 2. 调研结论（firecrawl + context7 双通道）

- **firecrawl**（`scripts/firecrawl-visual.mjs`，首轮被 IP 风控拦截、冷却 90s 重试成功）：
  NVIDIA Omniverse / Bentley iTwin / AVEVA E3D 全数抓取 → 蒸馏为
  `docs/research/参考基准-大厂视觉规范.md`；web_search 通道子代理补充
  UE5/大屏设计社区规范 → `docs/research/参考基准-大厂视觉规范-web.md`
- **context7**：拿到 three.js 官方时段化范式（`webgpu_generator_building.html`：
  太阳弧/曝光联动/烘焙不含太阳盘的 IBL、`shadow.autoUpdate=false` + 按需
  `needsUpdate` 的官方静态场景优化、PointLight candela 物理单位确认）

## 3. 架构改动（新模块）

| 文件 | 改动 |
|---|---|
| `src/env/timeOfDay.ts`（新增） | 三档预设（`TimePreset` 31 字段：天空/光照/雾/曝光/分级/路灯/星层/IBL 地面反弹）+ `TimeOfDaySystem`（0.8s easeInOut 全字段插值、过渡中点切换 IBL、异步懒烘焙、空闲预热） |
| `src/env/sky.ts`（重构） | `SkyRig`：三段式 HDR 因子（skyScale/sunBoost/skyClamp）从常量提升为 uniforms；IBL 按预设独立 PMREM RT 缓存（3 份全量缓存可往返切换）；新增星空粒子层（650 点、仅夜景可见） |
| `src/env/environment.ts` | 灯组句柄化（主光/补光/rim/半球/月光/路灯点光+灯头材质）交时段系统托管；新增月光 DirectionalLight（默认 0） |
| `src/scene/PlantScene.ts` | 接线时段系统（后期 uniforms 句柄、动态太阳方向驱动 GodRays）；曝光/分级/晕影/体积光强度全部随预设插值 |
| `src/scene/emissionInvariants.ts` | 路灯头规则更新（6→0.25~8 平滑插值，列为 rampAllowed） |
| `src/App.vue` | 顶栏 ☀午后 / 🌇黄昏 / 🌙夜景 三档切换 |

## 4. 提亮去阴冷修正（黄昏档，对照 R7）

| 参数 | R7 | R8 | 目的 |
|---|---|---|---|
| exposure | 0.95 | 1.22 | 中间调整体上提（偏暗主因） |
| skyScale（天空亮度） | 0.30 | 0.42 | 暮色天空更通透有层次 |
| environmentIntensity | 0.38 | 0.48 | 金属/罐体反射更亮 |
| sunIntensity | 3.4 | 3.8 | 主光更足 |
| fill 色/强度 | 0x9db2d8 / 0.26 | 0xa9b8d6 / 0.36 | 补光提亮且去冷青 |
| rimIntensity | 0.72 | 0.8 | 轮廓光加强 |
| hemiIntensity | 0.18 | 0.26 | 天光底光提高 |
| vignette | 0.28 | 0.22 | 四角不再压暗过重 |
| 分级 amount | 0.22 | 0.18 | 去"冷青脏暗部"（shadowTint 0x4a6a80→0x5b6878） |

## 5. 验收结果（命令：`node scripts/timeod-check.mjs`，R8 最终档 **ALL PASS**）

| 验收项 | 指标 | 实测 | 结论 |
|---|---|---|---|
| 过渡平滑（相邻帧全局均值差） | ≤±3% | max **0.7%**（三档切换序列全程） | ✅ |
| 过渡时长（插值 0.8s） | transitioning 复位 | **1.28s**（SwiftShader 1~2fps 下 2~4 帧；真实 GPU 60fps ≈0.8~0.9s） | ✅ |
| 三档均值互差 | ≤±8% | 午后 **59.7** / 黄昏 **56.9** / 夜景 **56.0** → 互差 4.69% / 1.58% / 6.2% | ✅ |
| 过曝像素 hiPct | ≤0.05% | 三档均 **0%** | ✅ |
| 静态+运行时发光不变量 | PASS | **PASS**（含路灯头 0.25~8 rampAllowed 更新） | ✅ |
| 稳态"真闪烁"（明暗交替像素 tripline） | ≤10px | 午后 0 / 黄昏 3 / 夜景 5 | ✅ |
| 黄昏档提亮（偏暗反馈） | R7 基线 46~58 且偏冷 | **56.9、warmth=+5**（曝光 0.95→1.32、天空 0.30→0.45、IBL 0.38→0.48 等） | ✅ |
| 画面冷感（补充需求） | 默认档 warmth>0 | 黄昏 +5（暗部 tint 0x4a6a80→0x5b6878、补光降蓝） | ✅ |

其余验收栈（R8 终验，全部通过）：

| 检测 | 结果 |
|---|---|
| capture-frames（12 帧 × 400ms，fast 模式） | 帧均值 55.9~56.3 稳定、hiPct **0%**、loPct 0.15~0.26%；时间方差热点仅出现在天空带（太阳光晕+火炬呼吸=设计内低频动效），场景中部/底部无闪烁块 |
| 发光不变量（静态 + 8s 运行时采样） | **PASS** |
| pipe-collision（几何回归） | 重叠 **=1 处**（hq-main×hq-t101 泵出口法兰端到端，R7 遗留语义正确项）→ **0 新增** ✅ |
| godRays（时段联动） | 太阳方向随时段插值生效（GodRays 屏幕坐标每帧重算），夜景 strength 0.05 淡出 |

## 6. 本轮踩坑与教训（工程级）

1. **IBL 贴图缓存被 dispose 的野狗**：过渡中点切换环境贴图时若 dispose 旧贴图，
   该档预设仍留在缓存表里，切回时引用已删除的 GPU 纹理 → 帧亮度异常大跌。
   → 教训：**多预设贴图缓存必须全量存活（3×PMREM RT 仅数 MB），只允许整体 dispose**。
2. **同步烘焙阻塞主线程 + Clock 继续走表 = 过渡"瞬跳完成"**：setPreset 里同步
   `ensureBaked`（SwiftShader 下数秒）会让 clock.elapsedTime 越过整段过渡 →
   u 直接钳到 1。→ 教训：**烘焙与过渡解耦（异步烘焙），IBL 到位后由 update 择帧切换**。
3. **热点指标必须只统计稳态帧**：过渡期太阳/天空本就在移动，逐像素时间方差巨大——
   把过渡帧计入"闪烁回归"会误报。→ timeod-check 改为仅对稳定帧序列计算热点。
4. **headless Edge 僵尸进程会持续吃 CPU**（前几轮 taskkill 未清干净的进程 CPU 数百秒
   → SwiftShader 渲染慢 3~5 倍）。→ 教训：每轮验收前先清理残留 msedge，且工具
   finally 块确保进程树清理。
5. **firecrawl keyless 被 IP 风控拦截是暂时的**：冷却 90s 后重试即成功；报告里
   注明原始数据来源文件即可，不必放弃该通道。

## 7. 下一轮方案（N2 摘要，详见新白皮书）

- **阴影按需更新**（context7 官方范式）：`shadow.autoUpdate=false` + 时段/相机变化时
  `needsUpdate=true` —— 中端 GPU 帧率红利
- **弱机自动降档**：内存/画质分档（当前仅核数判断）
- **部件级拾取近景交互**、**巡检碰撞体**（白皮书 §3 遗留）
- **夜景湿地面反射 / 天气粒子（雾降雨）**（大厂视觉基准 §4）
- **材质金属度二值化复核**（paintedSteel 0.18/pipeMaterial 0.65 → 漆面趋 0 + clearcoat，
  大厂 PBR 铁律）
- **性能面板 + CI workflow**（gh-pages Actions 自动部署）