import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

// 发布产物构建（lib mode,含 .vue SFC）。开发期 exports 指向 src 源码直出,
// publishConfig.exports 在 pnpm publish 时切换到本构建产出的 dist。
// JS 按出口名平铺（dist/<name>.js）;dts 镜像 src 目录结构（dist/<域>/index.d.ts）。
export default defineConfig({
    plugins: [
        vue(),
        dts({
            tsconfigPath: './tsconfig.json',
            entryRoot: 'src',
            cleanVueFileName: true,
            include: ['src/**/*.ts', 'src/**/*.vue'],
        }),
    ],
    build: {
        lib: {
            entry: {
                index: 'src/index.ts',
                canvas: 'src/canvas/index.ts',
                'property-panel': 'src/property-panel/index.ts',
                'layer-panel': 'src/layer-panel/index.ts',
                'status-bar': 'src/status-bar/index.ts',
                shared: 'src/shared/index.ts',
            },
            formats: ['es'],
            // SFC 样式统一抽到 dist/style.css,经出口 ./style.css 暴露
            cssFileName: 'style',
        },
        rollupOptions: {
            output: {
                entryFileNames: '[name].js',
            },
        },
    },
})
