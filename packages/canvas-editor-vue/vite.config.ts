import vue from '@vitejs/plugin-vue'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
            // 宿主侧 TS bundler 解析会把 dist/index.d.ts 的裸域 barrel 引用
            // （from './canvas'）劫持到同名域 js（canvas.js）——d.ts 符号全丢。
            // 显式补 /index.js 后缀（映射到 canvas/index.d.ts）消解歧义。
            afterBuild: () => {
                const file = resolve(__dirname, 'dist/index.d.ts')
                const domainNames = ['canvas', 'property-panel', 'layer-panel', 'status-bar', 'shared']
                let source = readFileSync(file, 'utf8')
                for (const name of domainNames) {
                    source = source.replaceAll(`from './${name}'`, `from './${name}/index.js'`)
                }
                writeFileSync(file, source)
            },
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
