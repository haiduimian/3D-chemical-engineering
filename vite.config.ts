import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

// aurea-eden 的 exports 字段只开放了 "." 和 "./vue"，
// 这里用 alias 直通其 lib 源码目录（Deep Import 绕过 exports 限制）
const edenLib = fileURLToPath(new URL('./node_modules/aurea-eden/lib', import.meta.url))
// 强制 three 去重：aurea-eden 嵌套依赖 three@0.172，与根 three@0.180 形成双实例
// （控制台 "Multiple instances of Three.js" 警告），统一指向根副本
const threeRoot = fileURLToPath(new URL('./node_modules/three', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  // GitHub Pages 子路径部署：https://haiduimian.github.io/3D-chemical-engineering/
  base: '/3D-chemical-engineering/',
  resolve: {
    alias: {
      'aurea-eden/lib': edenLib,
      // three 子路径别名（包内 exports 映射），需先于 three 前缀映射
      'three/addons': `${threeRoot}/examples/jsm`,
      'three/tsl': `${threeRoot}/build/three.tsl.js`,
      'three/webgpu': `${threeRoot}/build/three.webgpu.js`,
      three: threeRoot,
    },
  },
  server: { port: 5180, host: true },
  build: { chunkSizeWarningLimit: 2000 },
})
