import * as THREE from 'three'
import {
  jacketTexture, jacketNormal, paintedTexture, paintedNormal, brushedSteelTexture, brushedNormal,
  concreteTexture, concreteNormal, galvanizedTexture, rubberTexture, grimeRoughness, grimeAO,
} from './textures'

/**
 * PBR 材质库 v3 —— 全厂统一外观管理（黄昏工业风）
 * v3 升级：MeshStandardMaterial → MeshPhysicalMaterial
 *  - clearcoat 清漆层：工业漆面/不锈钢/球罐"外亮内糙"的双层反射（大厂质感核心）
 *  - anisotropy 各向异性：拉丝不锈钢沿拉丝方向的高光拉伸（替代贴图模拟）
 *  - specularIntensity/specularColor：非金属反射率物理校正
 *  + 法线贴图（微起伏）+ 污损粗糙度贴图（油渍/磨亮/风化，破除塑料感）
 * 所有材质共享同一份纹理/材质缓存，避免重复创建
 */
const cache = new Map<string, THREE.MeshPhysicalMaterial>()

function mat(key: string, params: THREE.MeshPhysicalMaterialParameters) {
  if (!cache.has(key)) cache.set(key, new THREE.MeshPhysicalMaterial(params))
  return cache.get(key)!
}

/** 污损粗糙度贴图基准灰 0.78：材质 roughness 需按 /0.78 补偿，保持平均粗糙度≈目标值 */
const GRIME_BASE = 0.784
const grimeR = grimeRoughness()
const grimeA = grimeAO()
grimeA.channel = 0 // aoMap 使用基础 UV（几何体无 uv1）

/** 不锈钢（塔体/换热器/管线裸露段）—— 高反射拉丝金属 + 各向异性高光拉伸 */
export const stainless = () => mat('stainless', {
  color: 0x9aa4ad, metalness: 0.92, roughness: 0.28,
  map: brushedSteelTexture(), normalMap: brushedNormal(), normalScale: new THREE.Vector2(0.35, 0.35),
  anisotropy: 0.55, anisotropyRotation: Math.PI / 2, // 拉丝方向高光拉伸（竖向拉丝纹理）
  envMapIntensity: 1.4,
})

/** 保温铝皮（塔身/罐体包覆层）—— 横纹波纹板 + 卷涂层面清漆
 *  R3：clearcoatRoughness 0.35→0.28（卷涂层更亮、反光更锐） */
export const insulation = () => mat('insulation', {
  color: 0xc2c8ce, metalness: 0.6, roughness: 0.55 / GRIME_BASE,
  map: jacketTexture(), normalMap: jacketNormal(), normalScale: new THREE.Vector2(0.45, 0.45),
  roughnessMap: grimeR, aoMap: grimeA, aoMapIntensity: 0.3,
  clearcoat: 0.45, clearcoatRoughness: 0.28, // 铝皮卷涂层：弱清漆，破除"裸金属"单调
  envMapIntensity: 1.0,
})

/** 碳钢漆面（反应器/罐体，可按色定制）—— 工程漆橘皮 + 清漆层（设备漆质感核心）
 *  R9（N2-PBR 铁律复核）：metalness 0.18 → 0.06 —— 漆膜 = 非金属（F0≈0.04 电介质），
 *  光泽全部由 clearcoat 0.85 承担（大厂 PBR 二值化：金属 ≈1、非金属 ≈0，杜绝"半金属"） */
export const paintedSteel = (color = 0x2e6e5e) => mat(`painted_${color}`, {
  color, metalness: 0.06, roughness: 0.52 / GRIME_BASE,
  map: paintedTexture(color), normalMap: paintedNormal(), normalScale: new THREE.Vector2(0.28, 0.28),
  roughnessMap: grimeR, aoMap: grimeA, aoMapIntensity: 0.28,
  clearcoat: 0.85, clearcoatRoughness: 0.22, // 工程漆：漆膜亮层覆盖粗糙橘皮底
  clearcoatNormalMap: paintedNormal(), clearcoatNormalScale: new THREE.Vector2(0.1, 0.1),
  envMapIntensity: 0.9,
})

/** 球罐银白 —— 高光镜面（产品罐维护良好，洁净高反射 + 硬清漆）
 *  R3：iridescence 0.25 —— 抛光罐体高光边缘的薄膜虹彩（大厂级金属层次细节） */
export const sphereTank = () => mat('sphere', {
  color: 0xd6dbe0, metalness: 0.9, roughness: 0.22,
  map: brushedSteelTexture(), normalMap: brushedNormal(), normalScale: new THREE.Vector2(0.25, 0.25),
  clearcoat: 1.0, clearcoatRoughness: 0.08, // 抛光罐体：镜面清漆
  anisotropy: 0.3, anisotropyRotation: Math.PI / 2,
  iridescence: 0.25, iridescenceIOR: 1.3,
  envMapIntensity: 1.6,
})

/** 混凝土地坪/基础 —— 明亮浅灰 + 低强度骨料法线（整洁工业地坪，不发黑） */
export const concrete = () => mat('concrete', {
  color: 0xa2a8ae, metalness: 0.0, roughness: Math.min(1, 0.88 / GRIME_BASE),
  map: concreteTexture(), normalMap: concreteNormal(), normalScale: new THREE.Vector2(0.35, 0.35),
  aoMap: grimeA, aoMapIntensity: 0.25,
  // 非金属混凝土：菲涅尔反射物理校正（掠射角反射增强，地坪不再"哑光死板"）
  specularIntensity: 0.5,
  envMapIntensity: 0.6,
})

/** 结构钢（管廊/平台/护栏/爬梯，镀锌灰）
 *  R2：叠加污损 roughnessMap —— 锌花局部磨亮/积灰，高光有变化（拥抱不完美） */
export const structuralSteel = () => mat('steel', {
  color: 0x6a7076, metalness: 0.75, roughness: 0.42 / GRIME_BASE,
  map: galvanizedTexture(), bumpMap: galvanizedTexture(), bumpScale: 0.015,
  roughnessMap: grimeR,
  envMapIntensity: 1.05,
})

/** 机加工钢（法兰/螺栓/鞍座等机械件）—— 深灰、微反射
 *  R2：叠加污损 roughnessMap（接触面磨亮/缝隙积灰） */
export const machinedSteel = () => mat('machined', {
  color: 0x4d535a, metalness: 0.85, roughness: 0.38 / GRIME_BASE,
  map: galvanizedTexture(), bumpMap: galvanizedTexture(), bumpScale: 0.018,
  roughnessMap: grimeR,
  envMapIntensity: 1.15,
})

/** 伴热管（R7）—— 哑光氧化铝皮。
 *  原用 stainless()（metalness 0.92 / envMapIntensity 1.4 / anisotropy 0.55）：
 *  细管在特定视角形成整条镜面白带（实测 brightPct 1.6~2.9% 的刺眼放射白光）。
 *  工艺上伴热管带铝皮保温层 → 低金属感、高粗糙、弱环境反射 */
export const traceTube = () => mat('trace', {
  color: 0xa9afb5, metalness: 0.5, roughness: 0.62,
  map: galvanizedTexture(), normalMap: jacketNormal(), normalScale: new THREE.Vector2(0.3, 0.3),
  roughnessMap: grimeR,
  clearcoat: 0.2, clearcoatRoughness: 0.5,
  envMapIntensity: 0.45,
})

/** 泵体蓝（R9：metalness 0.32 → 0.12 —— 设备漆面非金属化） */
export const pumpBody = () => mat('pump', {
  color: 0x1e5fa8, metalness: 0.12, roughness: 0.46 / GRIME_BASE,
  map: paintedTexture(0x1e5fa8), normalMap: paintedNormal(), normalScale: new THREE.Vector2(0.4, 0.4),
  roughnessMap: grimeR,
  clearcoat: 0.7, clearcoatRoughness: 0.25, // 设备漆面
  envMapIntensity: 0.85,
})

/** 电机橙（R9：metalness 0.22 → 0.08 —— 漆面非金属化） */
export const motorOrange = () => mat('motor', {
  color: 0xd97a1e, metalness: 0.08, roughness: 0.5 / GRIME_BASE,
  map: paintedTexture(0xd97a1e), normalMap: paintedNormal(), normalScale: new THREE.Vector2(0.4, 0.4),
  roughnessMap: grimeR,
  clearcoat: 0.65, clearcoatRoughness: 0.28,
  envMapIntensity: 0.7,
})

/** 电机深灰端盖 */
export const motorEndBell = () => mat('bell', {
  color: 0x3a3f45, metalness: 0.7, roughness: 0.5,
  map: galvanizedTexture(), bumpMap: galvanizedTexture(), bumpScale: 0.015,
  envMapIntensity: 1.05,
})

/** 管线材质（按物料颜色）—— 环氧涂装钢管：漆膜非金属化（R9 metalness 0.65 → 0.12；
 *  大厂 PBR 铁律：涂层钢管亮度来自 diffuse 基色 + clearcoat 清漆，而非金属反射） */
export const pipeMaterial = (color: number, emissive = 0) =>
  mat(`pipe_${color}_${emissive}`, {
    color, metalness: 0.12, roughness: 0.35, emissive, emissiveIntensity: emissive ? 0.05 : 0,
    clearcoat: 0.5, clearcoatRoughness: 0.3,
    envMapIntensity: 1.05,
  })

/** 阀门/法兰深灰 */
export const valveGray = () => mat('valve', {
  color: 0x3a3f45, metalness: 0.8, roughness: 0.42,
  map: galvanizedTexture(), bumpMap: galvanizedTexture(), bumpScale: 0.015,
  envMapIntensity: 0.95,
})

/** 深色橡胶（联轴器护罩/密封） */
export const rubber = () => mat('rubber', {
  color: 0x23262b, metalness: 0.05, roughness: 0.9,
  map: rubberTexture(),
})

/** 指示灯罩（磨砂玻璃，自发光由场景叠加）
 *  v10：基础 1.1 → 0.7 —— 液位计翻柱等指示件低于 bloom 阈值，远处不糊光斑 */
export const lampGlass = (color: number) => mat(`lamp_${color}`, {
  color, emissive: color, emissiveIntensity: 0.7, roughness: 0.25, metalness: 0.1,
})

/** 黑色电气件（仪表壳/接线盒） */
export const electricHousing = () => mat('housing', {
  color: 0x2b2f34, metalness: 0.15, roughness: 0.75,
  map: rubberTexture(),
})

/** 铭牌金属板 */
export const nameplateMetal = () => mat('nameplate', {
  color: 0xd8d3c8, metalness: 0.6, roughness: 0.45,
})

/** 真实玻璃（液位计/观察窗）—— 透射 + 微粗糙反光 */
const glassCache = new Map<string, THREE.MeshPhysicalMaterial>()
export const glassMaterial = () => {
  if (!glassCache.has('glass')) {
    glassCache.set('glass', new THREE.MeshPhysicalMaterial({
      color: 0xcfe4da, metalness: 0, roughness: 0.12,
      transmission: 0.92, thickness: 0.25, ior: 1.5,
      envMapIntensity: 1.2, transparent: true,
    }))
  }
  return glassCache.get('glass')!
}

/** 管线颜色语义表 */
export const PIPE_COLORS = {
  acrylicAcid: 0xd23c3c,   // 红 - 丙烯酸
  methanol: 0x2f7fe0,      // 蓝 - 甲醇
  product: 0xd9a521,       // 黄 - 成品 MA
  overhead: 0xc9ced4,      // 银灰 - 塔顶轻组分
  reactorOut: 0xe08a3c,    // 橙 - 反应产物
  inhibitor: 0x9b59d0,     // 紫 - 阻聚剂
} as const
