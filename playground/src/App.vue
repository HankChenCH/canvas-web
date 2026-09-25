<script setup lang="ts">
// 工单 03 目验：文本与图片渲染——中文 autowrap + 禁则、家庭 emoji 字素簇、
// 图片 cover 居中裁切、URL 字体 FontFace 物化。渲染前预载资源（图片 → backend，
// 字体 → FontFace 注册）；失败回落占位盒/内置默认字体。
// 内容盒虚线是目验辅助，画在覆盖层上，不属于渲染产物。
import { onMounted, ref } from 'vue'

import { decodeGraph, forEachLayerBox, renderCanvas } from '@hankchen/canvas-next'
import type { Canvas as CanvasDoc } from '@hankchen/canvas-next'
import {
    Canvas2DBackend,
    isBuiltinFontRef,
    loadCanvasFont,
} from '@hankchen/canvas-next-browser-renderer'
import { PACKAGE_NAME as canvasNextName } from '@hankchen/canvas-next'
import { PACKAGE_NAME as rendererName } from '@hankchen/canvas-next-browser-renderer'
import { PACKAGE_NAME as editorName } from '@hankchen/canvas-next-editor'
import { PACKAGE_NAME as editorVueName } from '@hankchen/canvas-next-editor-vue'

import { DEMO_GRAPH_JSON } from './demoGraph'

const wiredPackages = [canvasNextName, rendererName, editorName, editorVueName]

const contentRef = ref<HTMLCanvasElement | null>(null)
const guideRef = ref<HTMLCanvasElement | null>(null)
const assetsNote = ref('资源预载中…')

onMounted(async () => {
    const contentEl = contentRef.value
    const guideEl = guideRef.value
    if (!contentEl || !guideEl) return

    const doc = decodeGraph(JSON.parse(DEMO_GRAPH_JSON))
    contentEl.width = doc.width
    contentEl.height = doc.height
    guideEl.width = doc.width
    guideEl.height = doc.height

    const ctx = contentEl.getContext('2d')
    if (!ctx) return
    const backend = new Canvas2DBackend(ctx)

    await preloadAssets(doc, backend)
    renderCanvas(doc, backend)
    assetsNote.value = '资源就绪，已渲染'

    const guideCtx = guideEl.getContext('2d')
    if (guideCtx) drawContentGuides(guideCtx, doc)
})

/** 渲染前资源预载：图片经 Image 解码回写 backend；URL 字体经 FontFace 注册 */
async function preloadAssets(doc: CanvasDoc, backend: Canvas2DBackend): Promise<void> {
    const srcs = new Set<string>()
    const fonts = new Set<string>()
    forEachLayerBox(doc, (layer) => {
        if (layer.type === 'ImageLayer' && layer.src !== null) srcs.add(layer.src)
        if (layer.type === 'TextLayer' && !isBuiltinFontRef(layer.font)) fonts.add(layer.font)
    })

    const failures: string[] = []
    await Promise.all([
        ...[...srcs].map(async (src) => {
            const image = new Image()
            image.src = src
            try {
                await image.decode()
            } catch {
                failures.push(src)
                return // 失败保占位盒
            }
            backend.setImage(src, image)
        }),
        ...[...fonts].map(async (font) => {
            try {
                backend.setFontFamily(font, await loadCanvasFont(font))
            } catch {
                failures.push(font) // 回落内置默认字体
            }
        }),
    ])
    if (failures.length > 0) assetsNote.value = `部分资源加载失败：${failures.join('、')}`
}

/** 目验辅助：复用渲染模板的同一遍历与几何，给每层的 padding 内容盒画虚线框 */
function drawContentGuides(ctx: CanvasRenderingContext2D, doc: CanvasDoc): void {
    ctx.setLineDash([4, 3])
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.9)'

    forEachLayerBox(doc, (_layer, box) => {
        ctx.strokeRect(box.contentX + 0.5, box.contentY + 0.5, box.contentWidth - 1, box.contentHeight - 1)
    })
}
</script>

<template>
    <main class="stage">
        <header class="header">
            <h1>canvas-web playground</h1>
            <p>文本与图片渲染（工单 03）：autowrap + 禁则 / 字素簇 / 图片 cover / URL 字体</p>
            <p class="assets-note">{{ assetsNote }}</p>
        </header>

        <section class="canvas-frame" aria-label="画布目验区">
            <div class="canvas-stack">
                <canvas ref="contentRef" class="canvas-layer"></canvas>
                <canvas ref="guideRef" class="canvas-layer canvas-layer--guide"></canvas>
            </div>
        </section>

        <section class="legend">
            <ul>
                <li>中文长段 autowrap：贪心逐簇断行 + 禁则（行首不见句读、行末不见起始标点）；显式换行的空行保留；autoHeight 随行数生长</li>
                <li>字素簇：家庭 emoji 👨‍👩‍👧‍👦 按单簇计宽断行（Intl.Segmenter，不拆碎）</li>
                <li>图片 cover：宽幅两色源图等比缩放居中裁切——中缝与圆标落在内容盒中线</li>
                <li>URL 字体：/fonts/open-sans.ttf 经 FontFace 注册后生效；加载失败回落系统默认</li>
                <li>叠放次序：priority 降序绘制（数组头先画垫底）——背景(100) → 图片(40) → 文字(30) → 段落(25) → 表格(15) → QR(10) 最上</li>
                <li>QR 仍为占位盒（二维码生成随物化在工单 04 接入）；<span class="guide-mark">蓝色虚线</span>为 padding 内容盒（目验辅助）</li>
            </ul>
        </section>

        <footer class="wiring">
            <ul>
                <li v-for="name in wiredPackages" :key="name">{{ name }}</li>
            </ul>
        </footer>
    </main>
</template>

<style scoped>
.stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    min-height: 100vh;
    margin: 0;
    padding: 24px 16px;
    background: #f5f6f8;
    font-family: system-ui, sans-serif;
    color: #374151;
}

.header {
    text-align: center;
}

.header h1 {
    margin: 0 0 4px;
    font-size: 20px;
}

.header p {
    margin: 0;
    font-size: 13px;
    color: #6b7280;
}

.assets-note {
    margin-top: 2px;
    font-size: 12px;
    color: #94a3b8;
}

.canvas-frame {
    padding: 16px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #fff;
}

.canvas-stack {
    position: relative;
    width: 560px;
    max-width: calc(100vw - 64px);
}

.canvas-layer {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 4px;
}

.canvas-layer--guide {
    position: absolute;
    inset: 0;
    pointer-events: none;
}

.legend {
    max-width: 640px;
}

.legend ul {
    margin: 0;
    padding: 0 0 0 18px;
    font-size: 12px;
    line-height: 1.9;
    color: #6b7280;
}

.guide-mark {
    color: #3b82f6;
}

.wiring ul {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.wiring li {
    padding: 2px 8px;
    border: 1px solid #e5e7eb;
    border-radius: 999px;
    font-size: 11px;
    color: #9ca3af;
}
</style>
