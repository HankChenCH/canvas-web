import { defineConfig } from 'tsup'

// ESM 单出口;dependencies(qrcode/@hankchen/canvas)由 tsup 自动 external
export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'es2022',
})
