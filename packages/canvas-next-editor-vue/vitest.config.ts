import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// 包出口含 .vue SFC（CanvasSurface），barrel 测试需要 vue 插件解析
export default defineConfig({
    plugins: [vue()],
})
