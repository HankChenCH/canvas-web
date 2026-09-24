import browserslistToEsbuild from 'browserslist-to-esbuild'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// 浏览器基线由仓库根 .browserslistrc（桌面 evergreen）驱动，构建 target 与之接线
export default defineConfig({
    plugins: [vue()],
    build: {
        target: browserslistToEsbuild(),
    },
})
