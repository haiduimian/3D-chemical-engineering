# 参考基准：大厂级 3D 工业可视化视觉规范（Web 调研）

> 供本项目（plant3d：Vue 3 + three.js 0.180 化工厂数字孪生）进行视觉调参的直接依据。
> 元信息：调研方式 = web_search（NVIDIA Omniverse / AVEVA / Bentley / Epic UE5 / three.js 官方文档 / 中文大屏设计社区 / 玻璃拟态与 PBR 社区）；日期 = 2026-09；适用引擎 = three.js r180 + MeshPhysicalMaterial + EffectComposer(SSAO+Bloom+分级+AgX)。
> 约定：表中"经验值"为行业中位数参考区间，落地时以本场景实测（screenshot 回看）为准；"本项目现状"列引用实际源码位置。

## 0. 五条速览（TL;DR）

| # | 结论 | 影响文件 |
|---|------|----------|
| 1 | 工业数字孪生大屏 = 深蓝黑基底 + 青/橙双强调色 + 低饱和灰阶设备色；黄昏场景 = 天空橙蓝渐变 + 暖主光 + 冷补光（青橙互补是核心） | `src/env/*`、UI |
| 2 | PBR 铁律：金属 metalness→0.9–1.0、非金属（漆面/混凝土/玻璃）→0.0；本项目的 paintedSteel 0.18 / insulation 0.6 偏"半金属"，大厂规范倾向用 clearcoat+specularIntensity 替代中间金属度 | `src/materials/pbr.ts` |
| 3 | 阴影贴图分级：主光 4096²、局部光 2048²、点光 1024²；相机包围盒收缩到"刚好容纳"是纹素密度第一杠杆；PCSS/PCFSoft 才是软阴影正确姿势（radius 对 PCFSoft 无效） | `src/scene/PlantScene.ts`、`src/env/environment.ts` |
| 4 | 三点光比 key:fill:rim ≈ 3–4 : 1 : 2（低补光电影对比）；自发光/Bloom 分两层：细节亮度 < 阈值（如 <1.5）、点缀光晕 ≥ 阈值（如 6–9） | `environment.ts`、`PlantScene.ts` |
| 5 | 大屏 UI：顶部场景工具栏 + 右(左)侧信息卡 + 底部功能条；深色玻璃拟态 = rgba(8–16, 16–32, 48–64, 0.5–0.75) + blur(14–24px) + 1px rgba(255,255,255,0.08–0.12) 边框 + 12–16px 圆角 | `src/App.vue` |

---

## 1. 配色（Color Palette）

### 1.1 大屏 UI 深色基底（中文大屏设计社区共识）

数据可视化大屏早期以"深蓝紫背景+渐变星空"为主流，近年向"深蓝黑 + 弱玻璃拟态 + 强强调色"收敛（[知乎·大屏风格调研](https://zhuanlan.zhihu.com/p/352388346)、[优设·深蓝科技感大屏](https://www.uisdc.com/group/634948.html)、[亿信ABI·大屏配色教程](https://m.esenabi.com/industry-news/data-visualization-2668.html)）。

| 语义 | 经验值（hex） | 备注 |
|------|--------------|------|
| 背景基底（科技深蓝黑） | `#0A1930` / `#081A33` / `#0F1D3D` | 明度 L≈8–16%，不可用纯黑，需带蓝相 |
| 背景渐变层（蓝紫） | `#101C33 → #1B2B52` | 自上而下渐暗或渐亮皆可 |
| 面板底（玻璃） | `rgba(12, 24, 48, 0.55–0.75)` | 见 §5.2 |
| 主强调色（青/蓝绿） | `#00D4FF` / `#2EABFF` / `#3DD9C8` | 数据高亮、选中、交互 |
| 副强调色（暖橙/金） | `#FFB03A` / `#FF8C42` | 告警次级、火焰、太阳 |
| 告警红 | `#FF4D4F` / `#E23D3D` | 高频闪烁需配合低频呼吸（本项目已做） |
| 主文字 | `#E6F1FF` / `#D8E2F0` | 85–92% 白 |
| 次级文字 | `rgba(214, 226, 244, 0.55–0.65)` | 说明性文本 |
| 网格/分隔线 | `rgba(0, 212, 255, 0.12–0.18)` 或 `rgba(255,255,255,0.06)` | 弱网格不必 1px 实线 |

### 1.2 黄昏 / 暖色工业风场景色板（本主题核心）

黄昏工业风的本质 = **低角度暖橙主光 + 高空冷蓝天光 + 橙色地平线 + 深色剪影前景**（[ArtStation·Atmospheric Lighting](https://www.artstation.com/artwork/dWwG3)、[ArtStation·Dynamic Lighting & Environment Composition](https://www.artstation.com/blogs/joetaylorart/0jq6/dynamic-lighting-environment-composition-part-2)）。

| 元素 | 经验值（hex） | 本项目现状 | 备注/出处 |
|------|--------------|-----------|----------|
| 天顶天空（余晖散射后） | `#2C3E6E`~`#3A4F8F` | Preetham 物理天空，turbidity 4.2 / rayleigh 0.95 | 天顶不可过紫，灰蓝为佳 |
| 地平线暖橙带 | `#FF9A5C` / `#FFB066` / `#F0B27A` | 云层/雾带/haze 均用 `0xf0b27a`、太阳 `0xffd2a0` | 全场景暖色家族必须同源（同一 hue 带） |
| 太阳盘 | `#FFD9A8` ~ `#FFF3DF` | Sky 太阳盘 + sunBoost 增益 | HDR 亮度远超 bloom 阈值，需钳制（本项目 uSkyClamp） |
| 雾色 | `#B5886A`（暖灰橙） | `new THREE.Fog(0xb5886a, 160, 780)` | 雾色取值 = 地平线均值，方向一致性 |
| 补光/天光冷色 | `#8FA2C8` / `#9DB2D8` | hemi `0x8fa2c8`、fill `0x9db2d8` | 冷暖对比锚定"黄昏" |
| 轮廓光暖色 | `#FFB37A` | rim `0xffb37a` | 反主光方向勾边 |
| 地面反弹（IBL 下半球） | `#8A6A4C`（乘 0.4–0.6） | bounceGround `0x8a6a4c * 0.5` | 防止金属下表面反射"无源冷光" |
| 绿化剪影 | 树干 `#3D3227`、树冠 `#57492F`、灌丛 `#453A28` | 已实现 | 黄昏植被统一"暖褐剪影"，不得偏绿发亮 |
| 道路/沥青 | `#4A4F55`（中灰，勿纯黑） | 已实现 `0x4a4f55` | 黑沥青在黄昏光下死黑，需 18% 灰以上 |
| 水泥地坪 | `#A2A8AE`（线性 0.51 → sRGB ≈ `#BCBCBC` 参考） | concrete `0xa2a8ae` | 参考 [physicallybased.info](https://physicallybased.info/)（Concrete base ≈ 0.51 线性） |

### 1.3 夜景模式色板

| 元素 | 经验值（hex） | 备注/出处 |
|------|--------------|----------|
| 夜空 | `#0A1128` / `#0C1445`（[Pinterest 夜空色板](https://www.pinterest.com/pin/night-sky-colors-palette--24629129207326095/)、[SchemeColor Night Sky](https://www.schemecolor.com/night-sky-color-palette.php)） | 带蓝紫相，勿纯黑；月相影响可见度 |
| 星空 | `#DFE8FF`（冷白） | 半透明点精灵，opacity 0.6–0.9 |
| 月光/冷补光 | `#A5B4D8` / `#B0C4DE` | 低强度（相对白天 5–10%） |
| 路灯/窗光（自发光） | `#FFB066` / `#FFC37A` | 暖色压过冷夜，湾区感来源 |
| 园区地灯/指示 | `#2EABFF`（冷青） | 只要少量冷点缀，主体仍暖 |
| 剪影（前景设备） | 明度压缩至 12–18% 的材质同色 | 大厂夜景用"剪影 + 局部灯"而非全场景提亮 |
| 闪光警示/航空灯 | `#FF2222` 红 | emissive 呼吸 5.4–7.2（跨越 bloom 阈值不稳，本项目已修正） |

### 1.4 化工语义色（安全与物料）

化工/工业大屏的行业语义色必须稳定（GB/T 7231 管线色 / 安全色习惯）：红 = 消防/紧急/放空、黄/黄黑 = 警戒、蓝 = 水/仪表、绿 = 安全出口/环保、紫 = 特殊介质。项目 `PIPE_COLORS` 已符合（红/蓝/黄/橙/紫）。

### 🔧 对本项目的调参建议（§1）

1. 保留现有"青橙互补"路线：UI 强调色建议收敛为 2 个（`#00D4FF` + `#FFB03A`），告警红只出现在状态类元素——检查 App.vue 是否出现第 3、4 种高饱和色，若有则降为灰阶。
2. 夜景档（sky.ts 预设）检查：夜空取 `#0A1128` 量级、月光 fill 强度压到白天 5–10%、路灯 `#FFB066` 自发光保持 6 左右、星层 opacity 0.6–0.9；天空三段式 uniform（skyScale/sunBoost/skyClamp）夜景需 skyClamp 极低（防太阳盘残留）。
3. 全场景暖色坐标统一：凡"黄昏暖"元素（窗光/路灯/火炬/雾/云/haze）应取同一 hue≈28–35° 的色带（`#FFB066`→`#F0B27A`→`#FF9A5C`），避免个别元素偏红/偏黄产生廉价感。
4. 地面居中对齐：雾色 `0xb5886a` 与地平线均值同步；若调太阳方向（`SUN_DIRECTION`）需同步改 haze/sunBand 偏移（environment.ts 中 hardcode 了 -35）。

---

## 2. 材质（Material，PBR）

### 2.1 Metal/Roughness 工作流铁律（UE5 官方 PBR 指南 + Adobe PBR Guide）

- **metalness 是二值的**：导体金属 ≈ 1（或 0.9–1.0），非金属（漆、混凝土、玻璃、橡胶、塑料）= 0。中间值（0.2–0.8）在 PBR 中物理上不存在，只用于"脏污金属"混合或烘焙伪相（[UE5 PBR 文档](https://dev.epicgames.com/documentation/unreal-engine/physically-based-materials-in-unreal-engine?lang=zh-CN)、[The PBR Guide Part 2（Adobe/Substance）](https://www.adobe.com/learn/substance-3d-designer/web/the-pbr-guide-part-2)）。
- **涂层/漆膜 = 非金属**：即使底材是钢，喷漆后白模的 metalness 应 ≈ 0，光泽由 roughness + clearcoat 控制（工程漆 = 高 clearcoat 0.5–1.0 + 中低 clearcoatRoughness）。
- **反照率（BaseColor）用 sRGB 贴图，roughness/metalness/AO 是线性灰度**；非金属反照率明度上限 ~0.9（白漆 0.85–0.9），金属反照率是"颜色信息"且可很暗（铁 ~0.53 线性，参考 [physicallybased.info](https://physicallybased.info/)）。
- **法线贴图**：8bit 切线空间即可，strong 0.2–0.5（本项目 normalScale 0.25–0.45 符合）；clearcoat 可叠加极弱 clearcoatNormal（0.05–0.15）。

### 2.2 常用工业材质参数表（业界经验区间）

| 材质 | metalness | roughness | clearcoat | 备注 |
|------|-----------|-----------|-----------|------|
| 抛光不锈钢/镜面罐 | 0.92–1.0 | 0.05–0.2 | 0.3–1.0（ccRough 0.05–0.15） | envMapIntensity 1.2–1.6 |
| 拉丝不锈钢 | 0.9–1.0 | 0.25–0.45 | 0–0.3 | anisotropy 0.3–0.8 沿拉丝方向 |
| 镀锌结构钢（管廊/护栏） | 0.7–0.9 | 0.35–0.5 | 0 | 锌花=局部 roughness 噪声 |
| 机加工钢（法兰/螺栓） | 0.8–0.95 | 0.3–0.45 | 0 | 接触面局部磨亮 0.2 |
| 工程漆漆面（罐/泵/电机） | **0–0.2** | 0.5–0.7（橘皮底）+ ccRough 0.15–0.3 | 0.5–1.0 | 大厂质感核心：clearcoat 双层反射 |
| 银色保温铝皮 | 0.5–0.7 | 0.45–0.6 | 0.3–0.5 | 卷涂层弱清漆 |
| 混凝土（地坪/基础） | 0 | 0.85–0.98 | 0 | 骨料法线 0.3–0.5；F0 微菲涅尔（specularIntensity 0.4–0.6） |
| 沥青路面 | 0 | 0.9–0.97 | 0 | 18% 灰以上，勿黑 |
| 玻璃（观察窗/液位计） | 0 | 0.02–0.15 | 0–0.2 | IOR 1.45–1.52，transmission 0.85–0.95 |
| 磨砂玻璃罩 | 0–0.1 | 0.3–0.5 | 0 | 自发光由场景叠加 |
| 橡胶/密封 | 0–0.1 | 0.8–1.0 | 0 | 哑光吸光 |
| 深色电气件 | 0.1–0.3 | 0.6–0.8 | 0 | 避免纯黑（反射死区） |

### 2.3 三贴图（Albedo / Normal / Roughness）做法

大厂资产管线统一三贴图 + 可选 Metalness/AO（首推：[The PBR Guide Part 2](https://www.adobe.com/learn/substance-3d-designer/web/the-pbr-guide-part-2)）：

| 贴图 | 色彩空间 | 分辨率建议 | 备注 |
|------|---------|-----------|------|
| Albedo（BaseColor） | sRGB | 设备 UV 密度 ≤ 512px/大件 | 不含光照/阴影信息 |
| Normal | 线性 | 与 Albedo 同尺寸 | 切线空间，强度 0.2–0.5 |
| Roughness | 线性灰度 | 同尺寸 | 单一通道；项目以"基准灰 0.784 + 污损贴图"实现，需按 /0.784 补偿（已做，GRIME_BASE） |
| Metalness | 线性灰度 | 可 256px 共享 | 同一厂区共用一张即可 |
| AO | 线性灰度 | 可 256px | 用于接触的暗缝/夹层，intensity 0.2–0.4 即可（本项目 0.25–0.3 符合） |
| Height/Bump | — | 可选 | 细部（锌花/橘皮）用 bumpScale 0.01–0.02 微扰代替位移 |

### 2.4 程序化污损（Procedural Grunge）

项目已实现 grimeRoughness + grimeAO（抹布级污损），大厂的做法补充：用 1–2 张高频 grunge 灰度贴图做 **roughness 混合**（磨亮区 roughness 降 30–50%，积灰区升 10–20%）+ **AO 暗角**（焊缝/螺栓/法兰根 0.2–0.4 增益），污损强度按"使用频率"分级：地坪/阀门手轮 > 罐体/塔体 > 新建设施。

### 🔧 对本项目的调参建议（§2，对照 `src/materials/pbr.ts`）

1. **paintedSteel metalness 0.18 → 0.0–0.1**：漆面是涂层非金属，0.18 会让高光偏"金属硬点"；同时 roughness 0.52 已符合橘皮，clearcoat 0.85 保留——这是最贴近大厂规范的一处改动。
2. **insulation metalness 0.6 属"银铝皮"可保留**（0.5–0.7 区间内），但注意它的高光依赖 envMapIntensity 1.0；若要更真实可降到 0.55 并让 clearcoat 承担光泽。
3. **stainless / sphereTank（0.92 / 0.9, rough 0.28 / 0.22）符合区间**；抛光球罐 roughness 可压到 0.1–0.15 + iridescence 0.25 已是大厂级细节（NVIDIA 类金属薄膜效果）。
4. **traceTube / rubber / electricHousing** 已符合（低金属高粗糙）。`pipeMaterial` metalness 0.65：环氧涂装管 → 按漆面规范压到 0.1–0.2，加 clearcoat 0.3–0.5 更真实。
5. **玻璃**：`glassMaterial` roughness 0.12 / IOR 1.5 / transmission 0.92 已在大厂区间；建议透明玻璃另开一份 roughness 0.05 的高清版用于"观察窗"特写。
6. **Metalness 贴图化**：若后续要精细，可为全厂烘焙共享 256px metalness/AO 贴图（当前统一参数够用，属可选项）。

---

## 3. 阴影（Shadow）

### 3.1 阴影贴图尺寸分级原则

参考 [Unity Shadow Mapping 手册](https://docs.unity3d.com/2019.3/Documentation/Manual/shadow-mapping.html)（4096 超高 / 2048 默认 / 1024 低配）与 [three.js LightShadow.mapSize](https://threejs.org/docs/#api/lights/shadows/LightShadow.mapSize)（默认 512，必须 2 的幂），分级按"光的重要性 × 覆盖面积"：

| 光类型 | 贴图尺寸 | 场景 |
|--------|---------|------|
| 室外主光（太阳） | 4096² | 全场长影，唯一主投影 |
| 局部影子光（辅助方向光/聚光） | 2048² | 核心装置区局部细节阴影 |
| 点光（每盏 6 面） | 1024²（移动/弱机 512²） | 6×1024² 已是较重开销；数量从严 |
| 聚光（路灯类） | 1024²–2048² | 角度小可降 |
| 景深无关的远处/装饰 | 512² | 树冠/远景 |

**纹素密度第一杠杆 = 收缩阴影相机包围盒**（[GPU Gems 11 章·阴影走样](https://developer.nvidia.com/gpugems/gpugems/part-ii-lighting-and-shadows/chapter-11-shadow-map-antialiasing) + three.js 社区实践 [shadow 优化讨论](https://discourse.threejs.org/t/how-to-optimize-shadow-rendering-in-three-js-for-better-performance/64681)）：4096² 摊在 500m 上只有 ~8px/m，收缩到 250m 即翻倍。本项目 v11 已收紧 ±15% 并保留长影方向——方向正确。

### 3.2 软阴影：PCF 家族与 PCSS

| 方案 | 原理 | 软边质量 | 性能 | 操控 |
|------|------|---------|------|------|
| BasicShadowMap | 硬边 | 无 | 最快 | — |
| PCFShadowMap | 固定 3×3 | 一般 | 快 | `shadow.radius > 1` 可加大模糊（会带状） |
| PCFSoftShadowMap | 随机采样近似 | 较好（three.js 默认推荐） | 中 | **`radius` 对其无效**（[three.js 文档](https://threejs.org/docs/#api/lights/shadows/LightShadow.radius)） |
| VSM（Variance） | 方差滤波 | 平滑 | 中高（需 blur） | `blurSamples` 2–16 |
| PCSS（Contact/Penumbra） | 按遮挡距离动态模糊 | 电影级 | 高（多次采样） | 社区实现（[reddit threejs PCSS](https://www.reddit.com/r/threejs/comments/11f53ve/new_realistic_pcss_soft_shadow_implementation/)）；three.js 官方 example 备注"shadows are not affected by light radius"的场景可用 PCSS 替代 |
| 烘焙 AO/光照贴图 | 离线 | 高 | 快 | 静态场景可选 |

UE5 软阴影对应参数：**DirectionalLight.Source Angle**（越大越软，0.5° 默认偏锐，工业黄昏 1–2° 常用，[UE 论坛·Shadow Softness](https://forums.unrealengine.com/t/shadow-softness/145795)）。three.js 下"低角度太阳长影 + 柔和边缘"的正确组合是 PCFSoftShadowMap + 足够 mapSize + PCSS（若需 radius 控制软度）。

### 3.3 接触阴影（Contact Shadow）

接触阴影 = 小范围近距离 AO 式阴影，防止"漂浮感"：r3f drei `ContactShadows` 常用 `resolution 512, blur 2–4, opacity 0.3–0.5, far 5–10`；three.js 原生可用 SSAO（本项目已挂 SSAO pass）叠加 `blurSamples`。原则：接触阴影只负责"贴地"感（1–10m 尺度），长影交给主光阴影。

### 3.4 偏差与痤疮（Bias / Normal Bias）

低角度光长影极易自遮挡痤疮（acne）与 peter-panning：行业经验 `bias -0.0001 ~ -0.001`（负值防 peter-panning 偏移）、`normalBias 0.01–0.05`（越大越消痤疮、越丢细节）。本项目 sun.shadow.bias -0.0005 / normalBias 0.02 处于推荐区间。

### 🔧 对本项目的调参建议（§3，对照 `PlantScene.ts` + `environment.ts`）

1. 主光 4096² + 相机已收紧 → 达到"大厂高配"；如需帧率预算，可把 **shadow 相机 far 从 500 压到 ~320**（当前覆盖多余），纹素密度再加 ~20%。
2. 项目 `(renderer.shadowMap).blurSamples = 8`：该属性在官方 WebGLShadowMap 上不存在（应属 VSM 专用/历史遗留）；既然用的是 PCFSoftShadowMap，soft 由 mapSize 决定——要更软只能 PCSS 或加大 mapSize。建议：要么实测确认无效果后删除，要么评估 [PCSS 实现](https://www.reddit.com/r/threejs/comments/11f53ve/new_realistic_pcss_soft_shadow_implementation/) 替换主光。
3. 阴影分级现状 = 主光 4096 + 次级 2048（仅±50m）——符合表 3.1；路灯点光**不开 castShadow**（规范做法，点光阴影 6 面开销大收益低）。
4. 接触阴影：SSAO 已存在，若低角度视角仍有"设备漂浮"，检查 SSAO intensity（典型 0.5–1.5）与 radius（典型 0.1–1），或给地坪增加 1 张烘焙 AO 贴图。

---

## 4. 光效（Lighting）

### 4.1 三点光（Key / Fill / Rim）强度比

电影与产品可视化的通用比例（[Morphic·三点布光](https://morphic.com/zh/ai-glossary/three-point-lighting)）：主光为基准 100%，补光 25–50%（硬光下可更低），轮廓光 50–150%（暖色反向、用于勾边）。

| 光位 | 经典电影比 | 工业黄昏推荐 | 本项目现状（环境 v9/v10） | 评估 |
|------|-----------|-------------|--------------------------|------|
| 主光 Key（落日） | 1.0 | 1.0（3–4 强度，取决于 IBL 底） | sun 3.4（0xffd2a0） | 符合 |
| 补光 Fill（天光） | 0.25–0.5 | **0.2–0.35**（黄昏可压低保对比） | hemi 0.18 + fill 0.26 | 符合（v10 已刻意"只补不填"） |
| 轮廓光 Rim | 0.5–1.5 | 0.6–1.2（暖逆光） | rim 0.72（0xffb37a） | 符合 |
| IBL/环境 | — | 金属 1.2–1.6 / 非金属 0.5–0.9 | envMapIntensity 0.45–1.6 分材质 | 符合 |
| 特效/衰减距离 | — | decay 2 物理衰减 | 路灯 PointLight 60/30/2 | 见 4.5 |

经验：**补光强度 > 主光 50% 时代"影感"消失**（本项目 v9 曾因 4.6+0.7+IBL0.55 灰白，v10 压补光恢复明暗比——这正是大厂"低补光电影对比"路线）。

### 4.2 IBL 环境光强度（物理单位与直觉）

- 物理照度参考（[NVIDIA Omniverse 物理光照文档](https://docs.omniverse.nvidia.com/materials-and-rendering/latest/lighting.html)）：月光 0.01–0.3 lux、昏暗室内 10–100 lux、阴天 ~1,000 lux、晴天直射 10,000–100,000 lux。物理单位引擎（UE5 Lux/cd/lm，见 [UE5 物理光照单位](https://dev.epicgames.com/documentation/unreal-engine/using-physical-lighting-units-in-unreal-engine?lang=zh-CN)、[知乎·UE 物理光照单位](https://zhuanlan.zhihu.com/p/671555810)）按此定值；three.js 非物理单位（intensity 直觉制）只需保证 **IBL 与直接光同源共比例**（本项目 PMREM 烘焙自同一天空——正确）并按经验：环境光贡献 ≈ 场景总照度 20–40%。
- `scene.environmentIntensity` / 各材质 `envMapIntensity`：金属（反射主导）1.0–1.6，非金属（漫反射主导）0.5–0.9；夜景环境 0.1–0.3。

### 4.3 Bloom（阈值 / 强度 / 半径）

[three.js UnrealBloomPass](https://threejs.org/docs/pages/UnrealBloomPass.html) 参数：`(resolution, strength, radius, threshold)`，官方 example 默认 strength 1 / radius 0.5 / threshold 0（[webgl_postprocessing_unreal_bloom](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_postprocessing_unreal_bloom.html)）。

| 场景风格 | threshold | strength | radius | 说明 |
|----------|-----------|----------|--------|------|
| 柔和 HDR 电影 | 0.8–1.2 | 0.2–0.4 | 0.3–0.6 | 只让高亮泛光，工业大屏首选 |
| 强霓虹/科幻 | 0.2–0.6 | 0.5–1.0 | 0.4–0.8 | 大面积自发光 |
| 本项目现状 | 5.0 | 0.3 | 0.35 | 物理天空 HDR 亮度高，阈值必须 > 天空峰值，5.0 合理（配合 skyClamp） |

阈值逻辑（本项目已深度实践并踩坑，v10/v11 注释为证）：**细节自发光必须 < 阈值一半（不糊光斑），装饰性光晕必须 ≥ 阈值（稳定泛光，且动画亮度不可反复穿越阈值——否则频闪）**。

### 4.4 体积光（Volumetric / God Rays）

大厂做法（UE：Exponential Height Fog + Volumetric Fog density 0.01–0.1；Omniverse：体积散射关卡）；three.js 生态：社区 GodRays 后处理或 raymarch 体积雾。本项目已移除"加法混合长平面假光柱"（显廉价），正确决策；若要落日体积光，可用屏幕空间 GodRays 后用 **dust 粒子 + 暖 haze 平面** 代替（现状已是该替代方案）。

### 4.5 夜间路灯 / 自发光点缀（Emissive 强度分层）

| 元素类型 | emissiveIntensity（Bloom 阈值 T=5 时） | 射灯衰减 | 说明 |
|----------|--------------------------------------|---------|------|
| 细节指示（液位窗/小指示灯） | 0.7（< T/2） | — | 可见不发糊（项目 lampGlass 0.7） |
| 窗光/远处亮窗 | 1.2–1.6 | — | 低于阈值，只见暖色方块（项目 winLit 1.6 / city 1.2） |
| 路灯灯头 | 6–10（≥ T） | PointLight 60 cd / 30m / decay 2，中央 3–5 盏挂真实光 | 光晕点缀 + 局部照射（项目 lampMat 6 + 60/30/2） |
| 火炬/警示闪光 | 8–10 + 呼吸 ±10%，低频（<1Hz） | — | 常驻光晕、不闪烁（项目 flare 9、beacon 5.4–7.2） |
| 航空障碍灯 | 5–9 平滑呼吸 | — | 相位错开（项目已修） |

（项目 `environment.ts` / `PlantScene.ts` 的 v10/v11 注释已系统化该分层——与本表一致，属大厂做法。）

### 🔧 对本项目的调参建议（§4）

1. 三点光比例**保持现状**（3.4 / 0.18+0.26 / 0.72 ≈ 13:1.6:2.7，电影级低补光）；若夜景档补光仍偏亮，可先试 hemi 0.06–0.1。
2. Bloom 阈值 5.0 在 AgX 输出下验证过即可；若要更"电影"可微调 strength 0.25–0.35 区间试探，radius 0.35 保持（过大糊字）。
3. 夜景路灯：保持"7 盏灯头只有 3 盏挂 PointLight"的策略（大厂也控点光数）；若发现罐体/塔体夜景太黑，优先加 **2–3 盏园区泛光（PointLight 暖 30–60 cd，远距 60–100m）** 而不是抬高全局 IBL。
4. 体积光：不引入 GodRays 时，把 dust 粒子 + haze 平面参数作为"体积感"预算（现状已达标）；若要升级，先做屏幕空间 GodRays 单 pass 试验（预算敏感）。
5. 夜景 IBL：`scene.environmentIntensity` 0.15–0.25 + envMapIntensity 全材质按倍率收缩（可全局乘 0.3），保证金属在夜景下仍有"冷月反射"而不死黑。

---

## 5. 布局（Layout）与样式（Style）

### 5.1 大屏 / 数字孪生 UI 布局习惯

综合：火山引擎数字大屏（顶部工具栏为核心编辑区）、51AES WDP（顶部工具栏）、数字冰雹指挥中心大屏（态势面板）、ThingJS 优锘（场景+面板分区）、知乎大屏制作流程（[zhuanlan 559950878](https://zhuanlan.zhihu.com/p/559950878)）：

| 区域 | 内容 | 经验 |
|------|------|------|
| 顶部工具栏（通栏） | 场景名/厂名、保存、模式切换（查看/分析）、搜索、昼夜切换、帮助 | 高 48–64px；半透明深色条 |
| 左侧（可选） | 目录树/设备列表/图例/图层开关 | 宽 240–320px，可收起 |
| 右侧信息卡 | 选中设备详情、实时点位、趋势图、告警列表、管线关系 | 宽 300–360px；选中弹出，未选中隐藏/收起 |
| 底部功能条 | 视角预设、漫游、演练/场景、巡检、截图 | 高 56–72px；居中或左下 |
| 悬浮胶囊 | 告警条、操作提示、统计徽标 | 右上角堆叠，不遮挡设备区 |

本项目 App.vue：顶部模式栏（VIEW/ANALYZE）+ 右侧信息卡（设备详情/趋势）+ 底部功能条（视角/演练/巡检）已符合大厂布局；建议补齐"可收起"与"选中态高亮联动"。

### 5.2 深色玻璃拟态（Glassmorphism on dark）参数

大厂暗色玻璃 = 半透明深色层 + 背景模糊 + 极细高光描边 + 柔和投影（[Glassmorphism 2026 教程](https://theplusaddons.com/blog/glassmorphism/)、[css.glass 生成器](https://css.glass/)）：亮色玻璃白 15–20% 透明 + blur 5–16px + 1px 白 30% 边框；**暗色版**把底色换成深蓝黑并降描边亮度：

| 属性 | 亮色示例（css.glass） | 暗色大屏推荐 | 说明 |
|------|----------------------|--------------|------|
| background | rgba(255,255,255,0.15–0.2) | `rgba(10, 18, 36, 0.55–0.75)`（或 `linear-gradient(180deg, rgba(16,28,52,0.7), rgba(8,16,36,0.55))`） | 暗色不透明可略高，保证可读 |
| backdrop-filter | blur(5–16px) | **blur(14–24px) + saturate(140–180%)** | saturate 提"玻璃折射"彩色感 |
| border | 1px solid rgba(255,255,255,0.3) | `1px solid rgba(255,255,255,0.08–0.12)`（暗色版描边必须很弱，太亮=廉价） | 可加内发光 `inset 0 0 20px rgba(0,212,255,0.05)` |
| border-radius | 16px | 8–16px（信息卡 12–16，按钮 6–10） | 大屏大卡用 12–16px |
| box-shadow | 0 8px 32px rgba(0,0,0,0.18) | `0 8px 32px rgba(0,0,0,0.35)` 或两层 | 深色底投影需更深才有层次 |
| 文字 | — | 主 `#E6F1FF`、次 rgba(214,226,244,0.6) | 对比度 ≥ 4.5:1 |

性能注意：backdrop-filter 会强制 GPU 合成层；大屏多面板同时开 blur 有成本，可接受（面板少）或降级为"纯半透明底色"（无 blur）模式。

### 5.3 昼夜切换交互模式

主流做法（[山海鲸·一个按钮完成场景昼夜切换](https://www.cnblogs.com/shanhaibi/p/19714803) + 国内外大屏惯例）：

| 模式 | 交互 | 过渡 |
|------|------|------|
| 双档（日/夜） | 右上角太阳/月亮图标按钮，图标随状态切换 | 2–3s 插值（本项目 N1 已实现预设插值） |
| 三档（日/黄昏/夜） | 分段选择器或滑杆（左夜右日） | 每档切换 2–3s；滑杆可连续（本项目 SkyRig uniform 插值已支持连续） |
| 自动（时间驱动） | 按本地时间/固定时钟自动走档 | 黄昏-夜过渡最慢（15–30s）体现"点火灯"过程 |
| 联动 | 切换后 UI 主题色同步微调（如夜间 UI 暗一档、强调色不变） | — |

### 🔧 对本项目的调参建议（§5，对照 `src/App.vue`）

1. 布局已合规；建议增加：顶部工具栏 48px 半透明 + 右侧信息卡 320px + 底部功能条 56px 的**统一 glass 变量**（CSS 变量集中管理），避免散落。
2. 玻璃拟态落地参数建议起手式：`background: rgba(10,18,36,0.66); backdrop-filter: blur(16px) saturate(160%); border: 1px solid rgba(255,255,255,0.10); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.35)`——在 Vue 面板样式里替换后截图对比。
3. 昼夜切换：当前时段系统（SkyRig + 预设插值）支持三档；UI 缺"太阳/月亮"按钮角色提示——建议加图标 + 档位文字，并默认落在黄昏档。
4. UI 强调色与场景联动：夜间模式下可将告警色/高亮色保持 `#00D4FF` 不变（冷色在夜景上对比更清晰），仅压暗面板底色。

---

## 6. 综合速查表（经验值 → 本项目现状 → 动作）

| 维度 | 大厂经验值 | 本项目现状 | 首要动作 |
|------|-----------|-----------|---------|
| UI 底色 | #0A1930 系 + rgba(10,18,36,0.55–0.75) 玻璃 | 待查 App.vue 样式 | 统一 glass 变量 |
| 强调色 | 青 #00D4FF + 橙 #FFB03A（≤2 个高饱和） | PIPE_COLORS 语义色多 | UI 层收敛，3D 语义色保留 |
| 黄昏天空 | 天顶蓝 #2C3E6E / 地平线 #FF9A5C / 太阳 #FFD2A0 | Preetham 物理天空一致 | 无需改 |
| 夜景 | 夜空 #0A1128 / 月光 #A5B4D8 5–10% / 路灯 #FFB066 | 已实现 + 星空 | 验证预设参数 |
| 金属 metalness | 0.9–1.0 | stainless 0.92 / sphere 0.9 | 符合 |
| 漆面 metalness | **0–0.2** | paintedSteel 0.18 / pipe 0.65 | paintedSteel→0–0.1；pipe→0.15–0.2 |
| 混凝土 | metalness 0 / rough 0.85–0.98 | 0 / 0.88 符合 | 无 |
| 玻璃 | rough 0.02–0.15 / IOR 1.5 | 0.12 / 1.5 符合 | 可选特写高清玻璃 |
| 阴影 | 主光 4096² / 局部 2048² / 点光不开 | 4096+2048 符合 | shadow far 500→320 |
| 软阴影 | PCFSoft / PCSS；radius 对 PCFSoft 无效 | PCFSoft + blurSamples 8（应属无效） | 清理 blurSamples；评估 PCSS |
| 三点光比 | key:fill:rim ≈ 3–4:1:2 | 3.4:0.44:0.72 ≈ 13:1.7:2.8 | 符合，夜景再压补光 |
| Bloom | threshold 0.8–1.2（电影）或高阈值防天空糊 | 5.0 / 0.3 / 0.35 | 保持；微调 strength |
| 自发光分层 | 细节 < T/2，光晕 ≥ T，动画不穿越 T | 全面落地（v10/v11） | 保持 |
| 玻璃拟态 | blur 14–24 + saturate 160% + 1px 白 10% | 待查 | 用 §5.2 起手式 |
| 昼夜切换 | 图标按钮 + 2–3s 插值 + 三档 | SkyRig 已支持 | 补 UI 控件与图标 |

---

## 7. 来源链接列表

### NVIDIA / Omniverse
- [GTC25 S73051：Photorealistic Digital Twin at Scale in Product Design](https://www.nvidia.com/en-us/on-demand/session/gtc25-s73051/)
- [NVIDIA Omniverse 官网（物理 AI / 数字孪生）](https://www.nvidia.com/en-us/omniverse/)
- [Omniverse Materials and Rendering — Lights（物理光照与 lux 表）](https://docs.omniverse.nvidia.com/materials-and-rendering/latest/lighting.html)
- [NVIDIA 博客：在 XR 中体验数字孪生（Omniverse Spatial Streaming）](https://developer.nvidia.cn/blog/experience-digital-twins-in-xr-with-nvidia-omniverse-spatial-streaming/)
- [Simio × NVIDIA Omniverse 数字双胞胎集成介绍](https://www.simio.com/zh-cn/nvidia-omniverse-digital-twin-integration)

### AVEVA / Bentley（工业数字孪生平台）
- [AVEVA Industrial Digital Twin 平台](https://www.aveva.com/en/solutions/digital-transformation/digital-twin/)
- [Bentley iTwin Platform](https://www.bentley.com/en/products/itwin-platform/)

### Unreal Engine / Epic
- [UE5 PBR 材质文档（中文，metalness/roughness 最佳实践）](https://dev.epicgames.com/documentation/unreal-engine/physically-based-materials-in-unreal-engine?lang=zh-CN)
- [UE5 物理光照单位（lux/cd/lm，中文）](https://dev.epicgames.com/documentation/unreal-engine/using-physical-lighting-units-in-unreal-engine?lang=zh-CN)
- [UE5 Color Grading Panel 教程（YouTube）](https://www.youtube.com/watch?v=Ms2UpyehvTY)
- [UE 论坛：Shadow Softness（Source Angle 与软阴影）](https://forums.unrealengine.com/t/shadow-softness/145795)

### three.js（示例与文档）
- [three.js docs：LightShadow.mapSize](https://threejs.org/docs/#api/lights/shadows/LightShadow.mapSize)
- [three.js docs：LightShadow.radius（PCFSoft 下无效）](https://threejs.org/docs/#api/lights/shadows/LightShadow.radius)
- [three.js docs：PointLight.distance / decay](https://threejs.org/docs/#api/en/lights/PointLight.distance)
- [three.js docs：UnrealBloomPass](https://threejs.org/docs/pages/UnrealBloomPass.html)
- [three.js example：webgl_postprocessing_unreal_bloom](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_postprocessing_unreal_bloom.html)
- [three.js 论坛：如何优化阴影渲染](https://discourse.threejs.org/t/how-to-optimize-shadow-rendering-in-three-js-for-better-performance/64681)
- [three.js 论坛：可用的高性能软阴影](https://discourse.threejs.org/t/performant-soft-shadows-three-js/27777)
- [Reddit r/threejs：PCSS 软阴影实现](https://www.reddit.com/r/threejs/comments/11f53ve/new_realistic_pcss_soft_shadow_implementation/)
- [StackOverflow：three.js 物理光照 decay/distance](https://stackoverflow.com/questions/52107064/decay-and-distance-with-physically-correct-lighting-in-three-js)

### 引擎光照/阴影底层
- [Unity 手册：Shadow Mapping（分辨率分级）](https://docs.unity3d.com/2019.3/Documentation/Manual/shadow-mapping.html)
- [NVIDIA GPU Gems 11 章：阴影图抗锯齿（相机收缩/纹素密度）](https://developer.nvidia.com/gpugems/gpugems/part-ii-lighting-and-shadows/chapter-11-shadow-map-antialiasing)
- [Real-Time Rendering：灯光物理单位](https://www.realtimerendering.com/blog/physical-units-for-lights/)

### PBR 数据与材质
- [physicallybased.info —— PBR 材质值数据库（混凝土/玻璃/铁等）](https://physicallybased.info/)
- [Adobe / Substance 3D：The PBR Guide - Part 2（Metal/Roughness 工作流）](https://www.adobe.com/learn/substance-3d-designer/web/the-pbr-guide-part-2)

### 中文大屏设计 / 数字孪生产品
- [知乎：设计师必备——可视化大屏的风格调研指南](https://zhuanlan.zhihu.com/p/352388346)
- [知乎：酷炫交互式可视化大屏保姆级制作流程](https://zhuanlan.zhihu.com/p/559950878)
- [知乎：数字孪生技术引领 UI 前端设计新方向](https://zhuanlan.zhihu.com/p/1921896954633388802)
- [知乎：UE 引擎中的物理光照单位 Lux/cd/lm](https://zhuanlan.zhihu.com/p/671555810)
- [优设：9 组高级感配色方案合集 + Hex 色值](https://www.uisdc.com/group/626956.html)
- [优设：6 大行业深蓝科技感数据大屏登录页合集](https://www.uisdc.com/group/634948.html)
- [亿信ABI：数据大屏设计配色教程](https://m.esenabi.com/industry-news/data-visualization-2668.html)
- [飞致云：数据大屏配色设计指南](https://blog.fit2cloud.com/?p=5290)
- [火山引擎：数字大屏概述（顶部工具栏布局）](https://docs.volcengine.com/docs/4726/122791)
- [51AES WDP：数字孪生编辑器（顶部工具栏）](https://wdp.51aes.com/documentation/docs/list/bbs.51aes.com)
- [山海鲸：一个按钮完成场景昼夜切换](https://www.cnblogs.com/shanhaibi/p/19714803)
- [ThingJS / UINO 优锘：物联网 3D 可视化平台](http://www.thingjs.com/)
- [数字冰雹：指挥中心大屏可视化决策系统](https://www.digihail.com/technology/szlsjs.html)
- [Unity 中文社区：2024 年工业数字孪生发展趋势](https://developer.unity.cn/projects/66f3b912edbc2a5bbc187627)

### 氛围 / 玻璃拟态 / 夜景
- [ArtStation:Atmospheric Lighting in Environment Building](https://www.artstation.com/artwork/dWwG3)
- [ArtStation Blog: Dynamic Lighting & Environment Composition (Part 2)](https://www.artstation.com/blogs/joetaylorart/0jq6/dynamic-lighting-environment-composition-part-2)
- [Glassmorphism in 2026（+暗色实践）（theplusaddons）](https://theplusaddons.com/blog/glassmorphism/)
- [css.glass —— 玻璃拟态 CSS 生成器（参数示例）](https://css.glass/)
- [HYPE4 Glassmorphism CSS Generator](https://hype4.academy/tools/glassmorphism-generator)
- [SchemeColor：Night Sky 色板](https://www.schemecolor.com/night-sky-color-palette.php)
- [Pinterest：Night Sky 色板（#0C1445/#4C408E/#5C54A4/#38285C）](https://www.pinterest.com/pin/night-sky-colors-palette--24629129207326095/)
- [3D溜溜：城市路灯材质贴图经验](https://www.3d66.com/topic-material/chengshiludeng.html)
- [Clip Studio TIPS：夜景城市景观照明技巧](https://tips.clip-studio.com/zh-tw/articles/8822)
- [Morphic：三点布光（Three-Point Lighting）](https://morphic.com/zh/ai-glossary/three-point-lighting)