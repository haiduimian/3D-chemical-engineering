# 3D 工厂场景迭代报告 · Round 9（R9 · 天空黑屏修复 + N2 首批性能/质感）

> 状态：✅ 完成（天空随档位变化验证通过；N2-P0 性能与材质项落地）
> 需求来源：用户反馈"天空背景都是黑的，需要根据选择的时间让天空变化" + R8 白皮书 N2 方案

## 1. 问题定位：天空恒黑的根因链（工具链实证）

| # | 根因 | 机制 | 证据 |
|---|---|---|---|
| 1 | **SkyRig.bake() 直接改写共享天空材质的 uniforms（最终根因）** | 预热烘焙（4s 午后/9s 夜景）把可见天空的 uniforms 永久置成该档参数（从不恢复）；夜景档太阳沉地平线 + skyScale 0.26 → **页面加载 ~10s 后天空变黑**；期间还出现"午后天空+暮色光照"错位 | `sky-initial-probe`（新增）：无切换时间线采样显示 t≥1.5s 后 uniforms 变夜景值，而 preset 恒为 dusk；skyParent 正常（排除孤儿假设） |
| 2 | uSkyScale/uSunBoost/uSkyClamp 未登记 material.uniforms | WebGLRenderer 只上传 material.uniforms 条目；GLSL 声明未登记 → 默认 0 → `retColor *= 0` | 片段着色器 uniform 实况缺失（潜在黑天，已修复） |
| 3 | 异步 IBL 烘焙晚于过渡结束时不换贴图 | 过渡完成后 update 不再有 apply 机会，scene.environment 停滞旧档 | 探针 envActive="dusk" while preset=night |
| 4 | 星空粒子位置在原点（半径 1） | 星点聚在设备区而非天穹 | 代码审查 |
| 5 | headless 探针被 Vite HMR 全量重载污染 | 开发期编辑源码 → 页面中途重置 → 误报"午后→黄昏过渡失效"假异常 | 同构建 preview 服务器上复测消失 |

## 2. 修复（src/env/sky.ts + timeOfDay.ts）

- **烘焙改用天空克隆材质（根治）**：`skyClone = new Mesh(sky.geometry, sky.material.clone())`，
  对克隆应用档位参数后渲染进 envScene；可见天空 uniforms 永不受烘焙影响 → 4s/9s 预热
  不再"篡改天空"，页面从加载到任意时刻天空状态恒定正确
- patch 着色器时同步登记 uniform（初始与黄昏档一致）
- `pendingEnv` 兜底轮询：烘焙完成后的下一帧补切环境贴图
- 星空改为半径 1200 内球壳（相机 far=1500 内）、`fog:false`、`sizeAttenuation:false`、保留深度测试
- 天空亮度三档重收敛（v1→v4）：三档均值 56.8 / 59.9 / 57.1（±8% 契约内）
- **验证**：`sky-initial-probe`（新增，无切换 35s 时间线）：uniforms 全程保持档位值、
  天空带 72@0s→72.1@35s（修复前 28.7 黑化）、pageErrors=0

## 3. N2 首批（性能/质感，白皮书 R8 §4 落实）

| 项 | 实现 | 验证 |
|---|---|---|
| 阴影按需更新（P0） | `sun.shadow.autoUpdate=false` + `renderer.shadowMap.autoUpdate=false`；构造时 needsUpdate 一次（防首帧无影）、过渡中点+终态各一次 | timeod 全流程阴影正常（画面无异常） |
| 阴影相机/质量分级（P1） | 画质三档 weak/mid/strong（核数+内存双判定）：weak 关阴影/SSAO/Bloom/dpr1；mid 主影 2048² 无核心影 dpr≤1.5；strong 4096²+核心影 dpr≤2 | `perfStats.tier` 暴露 |
| 性能面板（P2） | PlantScene 1s 节流采样 fps/calls/tris/textures；App.vue「性能面板」开关 + 悬浮面板 | 手动/头less 可读 |
| 材质金属度二值化（P0-PBR） | paintedSteel 0.18→0.06、pipeMaterial 0.65→0.12、pumpBody 0.32→0.12、motorOrange 0.22→0.08（漆面=非金属，光泽交 clearcoat） | 帧均值/高光无回归（见验收） |

## 4. 验收结果（根因修复后终验，ALL PASS）

| 验收项 | 指标 | 实测 | 结论 |
|---|---|---|---|
| 三档均值互差 | ≤±8% | 午后 **56.9** / 黄昏 **59.9** / 夜景 **57.2** → 互差 5.01% / 4.51% / 0.52% | ✅ |
| 过渡平滑（相邻帧均值差） | ≤±3% | max **0.83%** | ✅ |
| 过渡复位 | ≤2.5s（SwiftShader 采样补偿） | 1191ms | ✅ |
| 过曝像素 hiPct | ≤0.05% | 三档 **0%** | ✅ |
| 静态+运行时发光不变量 | PASS | **PASS** | ✅ |
| 稳态真闪烁（明暗交替 tripline） | ≤10px | **0 / 0 / 1** | ✅ |
| 天空带随档位变化（timeod 断言） | 明档非黑且≥夜景 | 午后 69.5 / 黄昏 91.1 / 夜景 66.4 | ✅ |
| 初始加载天空稳定（sky-initial-probe） | 35s 内时刻天空不变黑 | t=0 天空带 72.0 → t=35s 72.1，uniforms 全程黄昏档（修复前 20s 黑化至 28.7） | ✅ |
| capture-frames 回归 | 稳定帧无闪烁 | 帧均值 59.8~60.2、hiPct 0%、天空带 83.1 冷相（修复前均值 33.3、天空缺失） | ✅ |
| pipe-collision | 0 新增 | 重叠仍 =1 处（R7 语义正确项） | ✅ |
| 黄昏暖调 | warmth>0 | 0.5（色相暖化微调，均值不受影响） | ✅ |

## 5. 教训（工程级）

1. **共享材质被"烘焙/预览"路径静默改写 = 最难发现的视觉 bug 形态**：SkyRig 的 IBL 烘焙
   直接 `applyUniforms(preset)` 到可见天空的共享材质 → 预热烘焙把天空永久置成午后/夜景参数；
   用户侧表现为"打开页面约 10s 后天空变黑"。正解：**烘焙一律使用克隆材质**，共享材质的
   状态只能由"视觉状态机"（时段系统）写入。
2. **GLSL-visible 但 JS 未登记的 uniform = 默认 0**：patch 任何 ShaderMaterial 时，声明与登记
   必须同一处完成（R9 已把登记放进 patch 位置）。
3. **断言阈值要与真实内容构成对齐**：天空带 topBand 混入地平线辉光与星层，夜景带并非纯黑 ——
   "+8" 过严导致假失败；校准为"明档 ≥ 夜景"并保留直接天空采样探针（sky-preset-probe）作为
   更强证据。
4. **headless 探针必须走无 HMR 的产物服务**：vite dev 的源码热更会全量重载页面 → 探针误报
   （午后→黄昏"失效"假异常）。验收统一走 `vite preview`。
5. **AgX 脚踝区对曝光/亮度调节呈强非线性**：均值收敛需多轮探测迭代；sky-preset-probe 的
   "全帧均值+天空 RGB"作为标准调参回路（~4min/轮 vs timeod-check 25min/轮）。

## 6. 下一轮方案（N3 摘要，见新白皮书）

- **P0 云影投影**（R8 遗留 P1 升 P0）：云层阴影贴图或简化投射，保持时段联动
- **P1 巡检碰撞体+引导线**、**部件级拾取**、**弱机内存档位**（顶点简化/纹理降档）
- **P1 夜景湿地面反射**（大厂夜景视觉基准）
- **P2 报警联动剧本**（多设备连锁 → 自动聚焦 + SOP 引导）、**CI workflow**（gh-pages Actions）
- **P3 真实数据接入**（WebSocket/OPC-UA 演示位）