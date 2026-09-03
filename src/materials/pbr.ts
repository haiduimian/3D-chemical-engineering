import * as THREE from 'three'
import {
  jacketTexture, jacketNormal, paintedTexture, paintedNormal, brushedSteelTexture, brushedNormal,
  concreteTexture, concreteNormal, galvanizedTexture, rubberTexture, grimeRoughness, grimeAO,
} from './textures'

/**
 * PBR 材质库 v2 —— 全厂统一外观管理（黄昏工业风）
 * 升级：法线贴图（微起伏）+ 污损粗糙度贴图（油渍/磨亮/风化，破除塑料感）
 *       + 环境反射补强 + 真实玻璃材质
 * 所有材质共享同一份纹理/材质缓存，避免重复创建
 */
const cache = new Map<string, THREE.MeshStandardMaterial>()

function mat(key: string, params: THREE.MeshStandardMaterialParameters) {
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial(params))
  return cache.get(key)!
}

/** 污损粗糙度贴图基准灰 0.78：材质 roughness 需按 /0.78 补偿，保持平均粗糙度≈目标值 */
const GRIME_BASE = 0.784
const grimeR = grimeRoughness()
const grimeA = grimeAO()
grimeA.channel = 0 // aoMap 使用基础 UV（几何体无 uv1）

/** 不锈钢（塔体/换热器/管线裸露段）—— 高反射、拉丝贴图 + 拉丝法线 */
export const stainless = () => mat('stainless', {
  color: 0x9aa4ad, metalness: 0.92, roughness: 0.28,
  map: brushedSteelTexture(), normalMap: brushedNormal(), normalScale: new THREE.Vector2(0.35, 0.35),
  envMapIntensity: 1.4,
})

/** 保温铝皮（塔身/罐体包覆层）—— 横纹波纹板贴图 + 波纹法线 + 轻度污损 */
export const insulation = () => mat('insulation', {
  color: 0xc2c8ce, metalness: 0.6, roughness: 0.55 / GRIME_BASE,
  map: jacketTexture(), normalMap: jacketNormal(), normalScale: new THREE.Vector2(0.45, 0.45),
  roughnessMap: grimeR, aoMap: grimeA, aoMapIntensity: 0.3,
  envMapIntensity: 1.0,
})

/** 碳钢漆面（反应器/罐体，可按色定制）—— 工程漆噪点贴图 + 橘皮法线 + 轻度污损 */
export const paintedSteel = (color = 0x2e6e5e) => mat(`painted_${color}`, {
  color, metalness: 0.18, roughness: 0.52 / GRIME_BASE,
  map: paintedTexture(color), normalMap: paintedNormal(), normalScale: new THREE.Vector2(0.28, 0.28),
  roughnessMap: grimeR, aoMap: grimeA, aoMapIntensity: 0.28,
  envMapIntensity: 0.9,
})

/** 球罐银白 —— 高光镜面（产品罐维护良好，保持洁净高反射） */
export const sphereTank = () => mat('sphere', {
  color: 0xd6dbe0, metalness: 0.9, roughness: 0.22,
  map: brushedSteelTexture(), normalMap: brushedNormal(), normalScale: new THREE.Vector2(0.25, 0.25),
  envMapIntensity: 1.6,
})

/** 混凝土地坪/基础 —— 明亮浅灰 + 低强度骨料法线（整洁工业地坪，不发黑） */
export const concrete = () => mat('concrete', {
  color: 0xa2a8ae, metalness: 0.0, roughness: Math.min(1, 0.88 / GRIME_BASE),
  map: concreteTexture(), normalMap: concreteNormal(), normalScale: new THREE.Vector2(0.35, 0.35),
  aoMap: grimeA, aoMapIntensity: 0.25,
  envMapIntensity: 0.6,
})

/** 结构钢（管廊/平台/护栏/爬梯，镀锌灰） */
export const structuralSteel = () => mat('steel', {
  color: 0x6a7076, metalness: 0.75, roughness: 0.42,
  map: galvanizedTexture(), bumpMap: galvanizedTexture(), bumpScale: 0.015,
  envMapIntensity: 1.05,
})

/** 机加工钢（法兰/螺栓/鞍座等机械件）—— 深灰、微反射 */
export const machinedSteel = () => mat('machined', {
  color: 0x4d535a, metalness: 0.85, roughness: 0.38,
  map: galvanizedTexture(), bumpMap: galvanizedTexture(), bumpScale: 0.018,
  envMapIntensity: 1.15,
})

/** 泵体蓝 */
export const pumpBody = () => mat('pump', {
  color: 0x1e5fa8, metalness: 0.32, roughness: 0.46 / GRIME_BASE,
  map: paintedTexture(0x1e5fa8), normalMap: paintedNormal(), normalScale: new THREE.Vector2(0.4, 0.4),
  roughnessMap: grimeR,
  envMapIntensity: 0.85,
})

/** 电机橙 */
export const motorOrange = () => mat('motor', {
  color: 0xd97a1e, metalness: 0.22, roughness: 0.5 / GRIME_BASE,
  map: paintedTexture(0xd97a1e), normalMap: paintedNormal(), normalScale: new THREE.Vector2(0.4, 0.4),
  roughnessMap: grimeR,
  envMapIntensity: 0.7,
})

/** 电机深灰端盖 */
export const motorEndBell = () => mat('bell', {
  color: 0x3a3f45, metalness: 0.7, roughness: 0.5,
  map: galvanizedTexture(), bumpMap: galvanizedTexture(), bumpScale: 0.015,
  envMapIntensity: 1.05,
})

/** 管线材质（按物料颜色） */
export const pipeMaterial = (color: number, emissive = 0) =>
  mat(`pipe_${color}_${emissive}`, {
    color, metalness: 0.65, roughness: 0.35, emissive, emissiveIntensity: emissive ? 0.05 : 0,
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

/** 指示灯罩（磨砂玻璃，自发光由场景叠加） */
export const lampGlass = (color: number) => mat(`lamp_${color}`, {
  color, emissive: color, emissiveIntensity: 1.1, roughness: 0.25, metalness: 0.1,
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

/** 真实玻璃（液位计/观察窗）—— 透射 + 微粗糙反光（需 MeshPhysicalMaterial 才支持 transmission） */
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
