import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'

/**
 * 物理大气散射天空 v1（Preetham 模型，three.js Sky）
 *
 * 替换原"屏幕空间 2×256 渐变纹理"方案。旧方案三大硬伤：
 *  1. 背景不随相机旋转 → 转动视角时天空纹丝不动（廉价感头号来源）
 *  2. 太阳是贴在世界坐标的生硬圆盘，与光照方向无物理关联
 *  3. 环境 IBL 用手工 Lightformer 拼凑，与可见天空不一致 → 金属反射"对不上天"
 *
 * 新方案：
 *  - 瑞利/米氏散射由物理公式给出：地平线红化、天顶冷蓝、太阳米氏光晕一体成型
 *  - 天空 + 地面反弹烘焙成 PMREM 环境贴图 → 金属反射的天空与肉眼所见完全一致
 *  - sunPosition 与 DirectionalLight 共用同一方向向量 → 光照/影子/天空物理自洽
 */

/** 黄昏太阳方向（单位向量）：西偏北低角度，与 environment.ts 主光保持一致
 *  v10：高度角 13°→22.7°——原角度过低导致散射完全主导（天空死灰无色彩）、
 *  影子拉过长到不可辨识（设备"漂浮感"）；22° 保留长影且明暗成型 */
export const SUN_DIRECTION = new THREE.Vector3(-100, 42, 80).normalize()

export function buildPhysicalSky(scene: THREE.Scene, renderer: THREE.WebGLRenderer): Sky {
  const sky = new Sky()
  // Sky 顶点着色器将 z 强制推到远平面（gl_Position.z = gl_Position.w），
  // 尺度只需保证包住相机与全部场景即可
  sky.scale.setScalar(10000)

  const u = sky.material.uniforms
  // 黄昏调参 v10f：rayleigh/turbidity 下调让天顶透出蓝灰、地平线保暖橙——
  // v9 的死灰白天墙会把设备剪影缝隙里的天空衬成"发光方块"伪 bug
  // R3：mieCoefficient 0.0038→0.0044（太阳周边暖晕稍强，ISO 发光锚点）、
  //     rayleigh 1.0→0.95（天顶略透蓝紫，与地平暖橙分层更明显）
  u.turbidity.value = 4.2
  u.rayleigh.value = 0.95
  u.mieCoefficient.value = 0.0044
  u.mieDirectionalG.value = 0.85
  u.sunPosition.value.copy(SUN_DIRECTION)

  // ── v10 关键修复：天空 HDR 重构（消除"画面中央白色光斑"+ 死白天墙）──
  // 根因链（实测定位）：Preetham 太阳盘 HDR 上万 → 任何阈值下都会被 bloom
  // 放大成块状伪影；而简单钳制会让"太阳:天空"对比坍缩 → 整片死白无层次
  // （设备剪影嵌在白墙上形成疑似"发光方块"的视觉焦点）。
  // 正解三段式：天空整体压暗出暮色 + 太阳盘恢复高亮亮盘 + 总钳制防 bloom 爆
  const frag = sky.material.fragmentShader.replace(
    'gl_FragColor = vec4( retColor, 1.0 );',
    `retColor *= 0.30;
			retColor += vec3( 3.6 ) * sundisk;
			retColor = vec3( 4.6 ) * ( 1.0 - exp( - retColor / 4.6 ) );
			gl_FragColor = vec4( retColor, 1.0 );`,
  )
  sky.material.fragmentShader = frag
  sky.material.needsUpdate = true

  // ── 烘焙环境贴图：天空 + 地面反弹 ──
  // PMREM 相机位于原点，下半球放暖色地面球补"大地余温"反射，
  // 否则金属下表面/罐体底部反射出无源冷光，显得飘
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envScene = new THREE.Scene()
  envScene.add(sky) // 临时移交给烘焙场景
  const bounceGround = new THREE.Mesh(
    new THREE.SphereGeometry(50, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8a6a4c).multiplyScalar(0.5), side: THREE.BackSide }),
  )
  envScene.add(bounceGround)
  scene.environment = pmrem.fromScene(envScene).texture
  pmrem.dispose()
  // Preetham 天空的太阳盘在 PMREM 中是极高亮 HDR 源，不压制会导致
  // 全场景 IBL 过曝 + AgX 高光去饱和 → 整体泛白（首轮实测教训）
  // v10：0.55 → 0.38 —— 配合直射光整体降档，恢复明暗比（环境光填太满 = 灰白蒙板根源）
  scene.environmentIntensity = 0.38

  // 天空归还主场景（作为可见背景）；清掉旧的 background 纹理引用
  scene.add(sky)
  scene.background = null
  return sky
}
