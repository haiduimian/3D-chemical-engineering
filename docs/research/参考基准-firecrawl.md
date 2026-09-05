# 3D 工厂场景参考基准（firecrawl 联网调研汇总）

> 调研时间：本轮迭代 R0 ｜ 工具：Firecrawl MCP（keyless 模式，firecrawl_search / firecrawl_scrape）
> 来源：threejs.org examples、Babylon.js 官方首页（大厂 Web3D 标杆）、AVEVA Digital Twin / E3D Design（工业数字孪生标杆）、LinkedIn 行业对比文、中文社区数字孪生技术文
> 用途：作为本项目后续每轮迭代的视觉验收基准（对照"大厂级"该做到什么程度）

## 1. 布局规划基准（AVEA E3D / 工业数字孪生实践）

来源：https://www.aveva.com/en/products/e3d-design/ 、https://www.aveva.com/en/solutions/digital-transformation/digital-twin/

| 维度 | 大厂做法 | 本项目对照 |
|---|---|---|
| 功能分区 | 生产核心区（反应/分离）＋储运罐区＋公用工程（冷却塔/变电）＋行政生活区（中控楼/办公楼/食堂）＋消防应急（消防站），界限分明 | ✅ 已有分区，需强化分区界面（道路/围界/绿化带分隔） |
| 空间层级 | 设备-管线-管廊-平台-建筑形成 3~4 层"垂直密度"，视线有聚焦点（最大设备/最高塔） | ✅ 塔区/球罐为主视觉焦点 |
| 配套完整度 | 激光扫描现实网格做背景（reality mesh），厂界、大门、警示标识、路灯、停车 | ✅ 已具备，远景城区可再加强雾中层次 |
| 数据可视化融合 | 数字孪生以真实运维数据驱动高亮/报警（不破坏模型真实感） | ✅ 数据柱/面板/联动高亮已集成 |

## 2. 材质表现基准（Web3D 标杆：Babylon.js 官方 + three.js examples）

来源：https://www.babylonjs.com/ 、https://threejs.org/examples/

| 技术点 | 大厂做法 | 本项目对照 |
|---|---|---|
| PBR 物理材质 | OpenPBR 支持：clearcoat 清漆双层反射、anisotropy 各向异性拉丝、iridescence、透射厚度（物理玻璃） | ✅ MeshPhysicalMaterial + clearcoat + anisotropy 已用；可加强 iridescence/透射细节 |
| 环境反射 | IBL 必须与可见天空**物理一致**（此处天空即环境，金属反射"对得上天"） | ✅ PMREM 烘焙自 Preetham 天空 |
| 表面不完美 | 污渍/划痕/风化/积灰驱动 roughness/AO 局部变化，"拥抱不完美" | ✅ grimeRoughness/grimeAO 已用；可加强有机污渍形态 |
| 纹素密度一致 | 全场景统一纹理 repeat 与世界尺度匹配，避免近看糊远看花 | ⚠️ 地面 256px 纹理铺 220m 过稀，需提升分辨率/密度 |
| 玻璃真实 | transmission+roughness 物理透射，不靠自发光 | ✅ 液位计玻璃已用 transmission |

## 3. 光线基准（日落/黄昏电影光）

| 技术点 | 大厂做法 | 本项目对照 |
|---|---|---|
| 天空光照 | 物理大气散射（Preetham/Rayleigh-Mie），太阳/天空/影子/IBL 四者方向自洽 | ✅ Sky + SUN_DIRECTION 统一 |
| 光型组合 | 主光（低角度暖）＋冷补光＋**轮廓光 rim**＋天光 IBL；软硬结合 | ✅ 已有；rim 强度可复核 |
| 体积光 | 夕阳光柱/丁达尔（God Rays / volumetric light shafts）是"电影感"关键 | ⚠️ 已移除假光柱，无真体积光；计划引入屏幕空间体积光（低成本方案） |
| 动态光照 | 聚光/点光数量受控（clustered lighting），避免每灯一 DrawCall | ✅ 路灯仅 3 盏真光 |

## 4. 阴影基准

| 技术点 | 大厂做法 | 本项目对照 |
|---|---|---|
| 软阴影 | PCFSoft + 大采样、落日长影方向统一 | ✅ PCFSoft + radius 4 + 4096² |
| 接触阴影 | 设备/管线足底密实接地阴影（contact shadows），无"悬浮" | ✅ ShadowMaterial 圆盘 0.65 |
| 烘焙/静态优先 | 静态物仅一次更新，动态物小范围阴影 | ⚠️ 全场景单方向光 4096²，远处建筑摊薄——可按重要性分级 |

## 5. 环境氛围基准

| 技术点 | 大厂做法 | 本项目对照 |
|---|---|---|
| 大气透视 | 远景减饱和/偏冷/降对比 + 雾与地平线同色 | ✅ Fog 对齐地平线色 |
| 氛围粒子 | 浮尘承接光柱、蒸汽、云层慢漂 | ✅ 有蒸汽/尘埃/云 |
| 后期分级 | Bloom 只作用于真光源；暗部提青高光提橙（teal-orange）；vignette 抗边缘干扰 | ⚠️ Bloom 阈值穿越问题（见闪烁 bug 分析）；缺 vignette 微晕影 |
| 城市远景 | 雾中楼群 + 航空灯，街区感 | ✅ 有亮窗城区 + 信标 |

## 6. 关键差距排序（对照基准 → 迭代优先级）

1. **P0 闪烁 bug**：所有"呼吸式"自发光在 bloom 阈值 5.0 两侧穿越 → 光晕忽大忽小（火炬塔信标/塔顶信标/背景城区航空灯/报警灯）。修复原则：动态自发光要么全程 > 阈值（光晕常驻、平滑呼吸），要么全程 < 阈值（无光晕）；杜绝穿越。
2. **P1 体积光/丁达尔**：低成本屏幕空间 God Rays（太阳方向 radial blur + additive），或强化尘埃承接感。
3. **P1 地面纹素密度**：混凝土纹理 256→512/1024、repeat 提升，消除"糊"。
4. **P1 后期 vignette + 色温统一**：微晕影 + 现有 teal-orange 分级复核。
5. **P2 材质不完美强化**：有机污渍形态、锈蚀边缘、保温铝皮做旧。
6. **P2 阴影分级**：近处设备阴影密度 vs 远处建筑：可给太阳阴影加第二级小范围补充光源或提升 normalBias 分层。

## 附：来源链接

- https://www.babylonjs.com/ （volumetric lighting / clustered lighting / OpenPBR / dynamic IBL shadows）
- https://www.aveva.com/en/products/e3d-design/
- https://www.aveva.com/en/solutions/digital-transformation/digital-twin/
- https://threejs.org/examples/
- https://www.linkedin.com/pulse/hexagon-vs-aveva-bentley-lng-epc-digital-platform-benedict-dimayuga-pqqdc
- https://zhuanlan.zhihu.com/p/1932122259113383820 （数字孪生 8 步超写实，工具链为 Unity/Twinmotion，方法论可借鉴）
- https://www.thingjs.com/ 、http://www.thingjs.com/

（原始抓取数据见 `docs/research/firecrawl-raw.json`）