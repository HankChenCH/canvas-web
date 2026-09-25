<script setup lang="ts">
// 工单 02 目验：打开硬编码 graph → 解码 → 五原语模板画叠放矩形盒。
// 文本/图片/QR 本工单为占位盒（后续工单补真实绘制）；内容盒虚线是目验辅助，
// 画在覆盖层上，不属于渲染产物。
import { onMounted, ref } from 'vue'

import { decodeGraph, forEachLayerBox, renderCanvas } from '@hankchen/canvas-next'
import type { Canvas as CanvasDoc } from '@hankchen/canvas-next'
import { Canvas2DBackend } from '@hankchen/canvas-next-browser-renderer'
import { PACKAGE_NAME as canvasNextName } from '@hankchen/canvas-next'
import { PACKAGE_NAME as rendererName } from '@hankchen/canvas-next-browser-renderer'
import { PACKAGE_NAME as editorName } from '@hankchen/canvas-next-editor'
import { PACKAGE_NAME as editorVueName } from '@hankchen/canvas-next-editor-vue'

import { DEMO_GRAPH_JSON } from './demoGraph'

const wiredPackages = [canvasNextName, rendererName, editorName, editorVueName]

const contentRef = ref<HTMLCanvasElement | null>(null)
const guideRef = ref<HTMLCanvasElement | null>(null)

onMounted(() => {
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
    renderCanvas(doc, new Canvas2DBackend(ctx))

    const guideCtx = guideEl.getContext('2d')
    if (guideCtx) drawContentGuides(guideCtx, doc)
})

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
            <p>graph 打开与矩形盒渲染（工单 02）：文本/图片/QR 为占位盒，工单 03/04 接真实绘制</p>
        </header>

        <section class="canvas-frame" aria-label="画布目验区">
            <div class="canvas-stack">
                <canvas ref="contentRef" class="canvas-layer"></canvas>
                <canvas ref="guideRef" class="canvas-layer canvas-layer--guide"></canvas>
            </div>
        </section>

        <section class="legend">
            <ul>
                <li>叠放次序：priority 降序绘制（数组头先画垫底）——背景(100) → 表格(40) → QR(30) → 文本(20) → 半透明红盒(10) 最上</li>
                <li>负溢出不钳位：半透明红盒宽 560 &gt; 画布 480，锚点 top-right → x = -80，左侧溢出画布</li>
                <li>盒模型：背景色 + 四边 border；<span class="guide-mark">蓝色虚线</span>为 padding 内容盒（目验辅助）</li>
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

.canvas-frame {
    padding: 16px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #fff;
}

.canvas-stack {
    position: relative;
    width: 480px;
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
    max-width: 560px;
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
