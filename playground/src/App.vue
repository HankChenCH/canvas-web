<script setup lang="ts">
// 工单 05 目验：相机与视口——2400×1500 大画布上空格/中键拖拽平移、
// plain/shift 滚轮、ctrl/捏合以指针为中心缩放、一键适应画布、缩放百分比显示。
// 重绘由会话内 rAF 合帧驱动；双层 canvas 分离内容层与 gizmo 覆盖层
// （资源物化标识画在覆盖层，演示「覆盖层重绘不触发内容层」的分层结构）。
import { computed, onBeforeUnmount, ref } from 'vue'

import {
    Canvas2DBackend,
    Materializer,
    applyViewportTransform,
    drawResourceMarkers,
} from '@hankchen/canvas-next-browser-renderer'
import type { ResourceState } from '@hankchen/canvas-next-browser-renderer'
import { EditorSession } from '@hankchen/canvas-next-editor'
import type { OverlayPainter } from '@hankchen/canvas-next-editor'
import {
    CanvasSurface,
    createRafScheduler,
    useViewport,
    type CanvasSurfaceReady,
} from '@hankchen/canvas-next-editor-vue'
import { decodeGraph } from '@hankchen/canvas-next'

import { DEMO_GRAPH_JSON } from './demoGraph'

// 缩放范围可配置（缺省即 5%–800%）；适应画布留 48px 呼吸边
const editor = new EditorSession({ scheduleFrame: createRafScheduler(), fitMargin: 48 })

const viewport = useViewport(editor)
const zoomPercent = computed(() => Math.round(viewport.value.zoom * 100))

const assetsNote = ref('资源物化中…')

let materializer: Materializer | null = null
let overlayCtx: CanvasRenderingContext2D | null = null
let unsubscribeAssets: (() => void) | null = null

/** 覆盖层画笔：工单 04 的资源状态标识。与内容层同一呈现变换（场景坐标，
 *  经共享的 applyViewportTransform 施加），但重绘入口独立（invalidate('overlay')），
 *  验证分层结构。 */
const overlayPainter: OverlayPainter = (args) => {
    const ctx = overlayCtx
    if (!ctx || !args.doc) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    applyViewportTransform(ctx, { dpr: args.dpr, zoom: args.viewport.zoom, x: args.viewport.x, y: args.viewport.y })
    drawResourceMarkers(ctx, args.doc, (materializer?.state ?? {}) as ResourceState)
}

function assetsStatus(state: ResourceState, pendingCount: number): string {
    const failed = Object.values(state).filter((e) => e.status === 'failed')
    if (pendingCount > 0) return `资源物化中（在途 ${pendingCount}）…`
    if (failed.length > 0) return `部分资源物化失败（占位 + 红叉标识）：${failed.length} 项`
    return '资源就绪，已渲染'
}

function onReady({ contentCanvas, overlayCanvas }: CanvasSurfaceReady) {
    const contentCtx = contentCanvas.getContext('2d')
    overlayCtx = overlayCanvas.getContext('2d')
    if (!contentCtx || !overlayCtx) return

    const backend = new Canvas2DBackend(contentCtx)
    // 跨域资源可经 new Materializer(backend, { imageProxy }) 注入代理改写；
    // 本页资源全部同源，无需代理。
    materializer = new Materializer(backend)

    editor.attachContentBackend(backend)
    editor.setOverlayPainter(overlayPainter)

    unsubscribeAssets = materializer.subscribe(() => {
        assetsNote.value = assetsStatus(materializer!.state, materializer!.pendingCount)
        editor.invalidate('content') // 物化状态只脏内容层（覆盖层标识另经 overlay 分支）
    })

    const doc = decodeGraph(JSON.parse(DEMO_GRAPH_JSON))
    editor.openDocument(doc)
    materializer.materialize(doc)
    editor.fitToSurface() // 初始进入：整页 fit-min 语义
}

// 工具栏：以当前视口中心为锚做倍率/复位，平移不跳变
function zoomBy(factor: number): void {
    const { width, height } = editor.getSurfaceSize()
    editor.zoomAt(width / 2, height / 2, viewport.value.zoom * factor)
}

function zoomTo100(): void {
    const { width, height } = editor.getSurfaceSize()
    editor.zoomAt(width / 2, height / 2, 1)
}

function fitToCanvas(): void {
    editor.fitToSurface()
}

onBeforeUnmount(() => {
    unsubscribeAssets?.()
    editor.dispose()
})
</script>

<template>
    <main class="stage">
        <header class="header">
            <h1>canvas-web playground</h1>
            <p>相机与视口（工单 05）：2400×1500 大画布导航 / 滚轮三态 / 缩放至指针 / 一键适应 / DPR 物理缓冲</p>
            <p class="assets-note">{{ assetsNote }}</p>
        </header>

        <section class="toolbar" aria-label="视图工具栏">
            <button type="button" title="缩小（以视口中心为锚）" @click="zoomBy(1 / 1.25)">−</button>
            <span class="zoom-value" data-zoom>{{ zoomPercent }}%</span>
            <button type="button" title="放大（以视口中心为锚）" @click="zoomBy(1.25)">＋</button>
            <button type="button" @click="zoomTo100">100%</button>
            <button type="button" class="fit" @click="fitToCanvas">适应画布</button>
        </section>

        <section class="canvas-frame" aria-label="画布目验区">
            <CanvasSurface class="surface" :editor="editor" @ready="onReady" />
        </section>

        <section class="legend">
            <ul>
                <li>平移：空格（或中键）拖拽、plain 滚轮上下左右、<b>shift + 滚轮横向</b>；触控板双指滚动 = 平移</li>
                <li>缩放：<b>ctrl/cmd + 滚轮</b>（触控板双指捏合同义，浏览器恒派 ctrl+wheel）以<b>指针为中心</b>缩放，范围 5%–800%，工具栏可配倍率</li>
                <li>「适应画布」= 整页 fit-min 并居中（初始进入自动执行一次）</li>
                <li>双层 canvas：内容层渲染五原语，gizmo 覆盖层画<span class="marker">资源物化标识</span>（灰叉 pending / 红叉 failed）——覆盖层重绘不触发内容层</li>
                <li>DPR：物理缓冲 = 视口 × devicePixelRatio（换屏/页面缩放自动重设缓冲），相机平移对齐物理像素，高倍缩放依然清晰</li>
                <li>重绘经 rAF 合帧，每屏帧至多一次；视口 {x, y, zoom} 住 store 的 ui 分支，永不进历史</li>
                <li>工单 02–04 目验样例保留：priority 叠放 / cover / 中文禁则断行 / 表格 / 失败资源（右上红框）/ QR 固定选项（右下，负溢出贴角）</li>
            </ul>
        </section>
    </main>
</template>

<style scoped>
.stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    min-height: 100vh;
    margin: 0;
    padding: 20px 16px;
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

.toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
}

.toolbar button {
    min-width: 34px;
    padding: 4px 10px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fff;
    font-size: 13px;
    color: #374151;
    cursor: pointer;
}

.toolbar button:hover {
    border-color: #94a3b8;
}

.toolbar .fit {
    font-weight: 600;
}

.zoom-value {
    min-width: 56px;
    text-align: center;
    font-variant-numeric: tabular-nums;
    font-size: 14px;
    color: #0f172a;
}

.canvas-frame {
    width: min(1240px, calc(100vw - 32px));
    height: max(420px, calc(100vh - 320px));
    padding: 0;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #cbd5e1; /* 画布外的「桌面」底色：平移出界时清晰可辨 */
    overflow: hidden;
}

.surface {
    width: 100%;
    height: 100%;
    border-radius: 11px;
}

.legend {
    max-width: 980px;
}

.legend ul {
    margin: 0;
    padding: 0 0 0 18px;
    font-size: 12px;
    line-height: 1.9;
    color: #6b7280;
}

.marker {
    color: #ef4444;
}
</style>
