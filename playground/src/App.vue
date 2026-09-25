<script setup lang="ts">
// 工单 04 目验：QR 与物化状态机——三类资源（图片/字体/QR）经 Materializer 异步物化，
// pending 灰叉占位、done 绘制真实内容、failed 红叉失败态；订阅驱动自动重绘，
// 物化状态只进资源切片、永不写 graph。内容盒虚线是目验辅助（画在覆盖层）。
import { onMounted, ref } from 'vue'

import { decodeGraph, forEachLayerBox, renderCanvas } from '@hankchen/canvas-next'
import type { Canvas as CanvasDoc } from '@hankchen/canvas-next'
import {
    Canvas2DBackend,
    Materializer,
    drawResourceMarkers,
} from '@hankchen/canvas-next-browser-renderer'
import type { ResourceState } from '@hankchen/canvas-next-browser-renderer'
import { PACKAGE_NAME as canvasNextName } from '@hankchen/canvas-next'
import { PACKAGE_NAME as rendererName } from '@hankchen/canvas-next-browser-renderer'
import { PACKAGE_NAME as editorName } from '@hankchen/canvas-next-editor'
import { PACKAGE_NAME as editorVueName } from '@hankchen/canvas-next-editor-vue'

import { DEMO_GRAPH_JSON } from './demoGraph'

const wiredPackages = [canvasNextName, rendererName, editorName, editorVueName]

const contentRef = ref<HTMLCanvasElement | null>(null)
const overlayRef = ref<HTMLCanvasElement | null>(null)
const assetsNote = ref('资源物化中…')

onMounted(() => {
    const contentEl = contentRef.value
    const overlayEl = overlayRef.value
    if (!contentEl || !overlayEl) return

    const doc = decodeGraph(JSON.parse(DEMO_GRAPH_JSON))
    contentEl.width = doc.width
    contentEl.height = doc.height
    overlayEl.width = doc.width
    overlayEl.height = doc.height

    const ctx = contentEl.getContext('2d')
    const overlayCtx = overlayEl.getContext('2d')
    if (!ctx || !overlayCtx) return

    const backend = new Canvas2DBackend(ctx)
    // 跨域资源可经 new Materializer(backend, { imageProxy }) 注入代理改写；
    // 本页资源全部同源，无需代理。
    const materializer = new Materializer(backend)

    const repaint = () => {
        renderCanvas(doc, backend)
        drawOverlay(overlayCtx, doc, materializer.state)
        assetsNote.value = assetsStatus(materializer)
    }

    // 物化状态变更 → 自动重绘（store 建立后由 ui 分支订阅 + rAF 合帧接管）
    materializer.subscribe(repaint)
    materializer.materialize(doc)
    repaint() // 首帧：物化完成前先画占位盒与 pending 标识
})

function assetsStatus(materializer: Materializer): string {
    const failed = Object.values(materializer.state).filter((e) => e.status === 'failed')
    if (materializer.pendingCount > 0) return `资源物化中（在途 ${materializer.pendingCount}）…`
    if (failed.length > 0) return `部分资源物化失败（占位 + 红叉标识）：${failed.length} 项`
    return '资源就绪，已渲染'
}

/** 目验辅助：复用渲染模板的同一遍历与几何画内容盒虚线，再叠物化状态标识 */
function drawOverlay(ctx: CanvasRenderingContext2D, doc: CanvasDoc, state: ResourceState): void {
    ctx.clearRect(0, 0, doc.width, doc.height)

    ctx.setLineDash([4, 3])
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.9)'
    forEachLayerBox(doc, (_layer, box) => {
        ctx.strokeRect(box.contentX + 0.5, box.contentY + 0.5, box.contentWidth - 1, box.contentHeight - 1)
    })

    ctx.setLineDash([])
    drawResourceMarkers(ctx, doc, state)
}
</script>

<template>
    <main class="stage">
        <header class="header">
            <h1>canvas-web playground</h1>
            <p>QR 与物化状态机（工单 04）：QR 固定选项生成 / 图片与字体物化 / 占位与失败态</p>
            <p class="assets-note">{{ assetsNote }}</p>
        </header>

        <section class="canvas-frame" aria-label="画布目验区">
            <div class="canvas-stack">
                <canvas ref="contentRef" class="canvas-layer"></canvas>
                <canvas ref="overlayRef" class="canvas-layer canvas-layer--overlay"></canvas>
            </div>
        </section>

        <section class="legend">
            <ul>
                <li>QR：固定选项（UTF-8、纠错 High、无静区、黑白）生成 PNG 后按盒宽缩放铺放；未声明高按宽兜底正方形（右下角，带白边框）</li>
                <li>物化状态机：pending → 覆盖层<span class="pending-mark">灰叉占位</span>；done → 内容层绘制真实资源；failed（含跨域失败）→ <span class="failed-mark">红叉 + 红框</span>（演示层引用了不存在的 /demo-missing.png）</li>
                <li>同引用只物化一次：缓存键 sha256(完整 URL)，同名不同 URL 不碰撞；状态变更自动重绘，物化状态永不写 graph</li>
                <li>跨域：默认图片装载强制 crossOrigin=anonymous（无 CORS 头的源物化即失败，不留到导出）；宿主可注入 imageProxy 改写 URL——本页资源同源，无需代理</li>
                <li>URL 字体 /fonts/open-sans.ttf 经 FontFace 注册生效；加载失败回落系统默认并标失败态</li>
                <li>叠放次序：priority 降序绘制（数组头先画垫底）——背景(100) → 图片(40) → 文字(30) → 段落(25) → 表格(15) → 失败演示(12) → QR(10) 最上</li>
                <li><span class="guide-mark">蓝色虚线</span>为 padding 内容盒（目验辅助，画在覆盖层）</li>
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

.canvas-layer--overlay {
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

.pending-mark {
    color: #64748b;
}

.failed-mark {
    color: #ef4444;
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
