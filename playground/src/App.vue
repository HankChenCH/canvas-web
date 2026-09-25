<script setup lang="ts">
// 工单 06 目验：选择与拖动——左键点选（视觉最上层优先）/拖动（九锚点一视同仁）、
// hover 高亮、表格 cell→row→table 的 Escape 级联、一次拖动一步历史、适应选区。
// 工单 08 目验：撤销/重做——顶栏按钮（可用态随历史栈联动）与 Ctrl/Cmd+Z、
// Ctrl/Cmd+Shift+Z（或 Ctrl+Y）快捷键；输入法合成中不触发（isComposing/229 守卫）。
// 工单 05 的相机目验（平移/滚轮三态/缩放至指针/适应画布）全部保留；
// 重绘由会话内 rAF 合帧驱动，覆盖层 = 资源物化标识 + 选区 gizmo（分层结构演示）。
import { computed, onBeforeUnmount, ref } from 'vue'

import {
    Canvas2DBackend,
    Materializer,
    applyViewportTransform,
    drawResourceMarkers,
} from '@hankchen/canvas-next-browser-renderer'
import type { ResourceState } from '@hankchen/canvas-next-browser-renderer'
import { EditorSession, classifyHistoryShortcut } from '@hankchen/canvas-next-editor'
import { resolveLayer, type LayerPath, type OverlayPainter } from '@hankchen/canvas-next-editor'
import {
    CanvasSurface,
    createRafScheduler,
    drawSelectionGizmo,
    LayerPanel,
    PropertyPanel,
    useHistory,
    useViewport,
    type CanvasSurfaceReady,
} from '@hankchen/canvas-next-editor-vue'
import { decodeGraph } from '@hankchen/canvas-next'

import { DEMO_GRAPH_JSON } from './demoGraph'

// 缩放范围可配置（缺省即 5%–800%）；适应画布留 48px 呼吸边
const editor = new EditorSession({ scheduleFrame: createRafScheduler(), fitMargin: 48 })

const viewport = useViewport(editor)
const zoomPercent = computed(() => Math.round(viewport.value.zoom * 100))
const { canUndo, canRedo } = useHistory(editor)

const assetsNote = ref('资源物化中…')
const selectionNote = ref('未选中图层（左键点选，Esc 逐级升级）')

let materializer: Materializer | null = null
let overlayCtx: CanvasRenderingContext2D | null = null
let unsubscribeAssets: (() => void) | null = null
let unsubscribeSelection: (() => void) | null = null

/** 覆盖层画笔：资源状态标识（工单 04）+ 选区 gizmo（工单 06）。与内容层同一
 *  呈现变换（场景坐标，经共享的 applyViewportTransform 施加），但重绘入口独立
 *  （选择/悬停只脏覆盖层）。 */
const overlayPainter: OverlayPainter = (args) => {
    const ctx = overlayCtx
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    if (!args.doc) return
    applyViewportTransform(ctx, { dpr: args.dpr, zoom: args.viewport.zoom, x: args.viewport.x, y: args.viewport.y })
    drawResourceMarkers(ctx, args.doc, (materializer?.state ?? {}) as ResourceState)
    drawSelectionGizmo(ctx, editor, args)
}

function assetsStatus(state: ResourceState, pendingCount: number): string {
    const failed = Object.values(state).filter((e) => e.status === 'failed')
    if (pendingCount > 0) return `资源物化中（在途 ${pendingCount}）…`
    if (failed.length > 0) return `部分资源物化失败（占位 + 红叉标识）：${failed.length} 项`
    return '资源就绪，已渲染'
}

/** 路径的领域读法：['layers', 1, 'rows', 0, …] → 图层 1 · 行0 · … */
function describePath(path: LayerPath): string {
    let label = `图层 ${String(path[1])}`
    for (let i = 2; i < path.length; i += 2) {
        const key = String(path[i])
        if (key === 'content') label += ' · 格内容'
        else if (key === 'rows') label += ` · 行${String(path[i + 1])}`
        else if (key === 'cells') label += ` · 格${String(path[i + 1])}`
    }
    return label
}

/** 选中读数（拖动中随文档事务实时联动——属性面板将来读同一数据） */
function syncSelectionNote(): void {
    const doc = editor.store.doc
    const path = editor.store.ui.selection
    if (!doc || !path) {
        selectionNote.value = '未选中图层（左键点选，Esc 逐级升级）'
        return
    }
    const layer = resolveLayer(doc, path)
    if (!layer) {
        selectionNote.value = describePath(path)
        return
    }
    selectionNote.value = `${describePath(path)}｜${layer.type} · 锚点 ${layer.position.anchor} · x=${layer.position.x} y=${layer.position.y}`
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

    unsubscribeSelection = editor.subscribe((change) => {
        // 选择变更与拖动中的文档事务都刷新选中读数
        if (change.scope === 'doc' || (change.scope === 'ui' && change.branch === 'selection')) {
            syncSelectionNote()
        }
    })

    const doc = decodeGraph(JSON.parse(DEMO_GRAPH_JSON))
    editor.openDocument(doc)
    materializer.materialize(doc)
    editor.fitToSurface() // 初始进入：整页 fit-min 语义
    syncSelectionNote()
}

// 工具栏：以当前视口中心为锚做倍率/复位，平移不跳变
function zoomBy(factor: number): void {
    const { width, height } = editor.getSurfaceSize()
    editor.zoomAt(width / 2, height / 2, viewport.value.zoom * factor)
}

/** 撤销/重做快捷键：意图分类在内核纯函数（可测），这里只做事件解码。
 *  文本编辑中（工单 11）键盘事件路由进 textarea：Ctrl+Z 撤「输入」而非文档。 */
function onKeydown(event: KeyboardEvent): void {
    if (editor.store.ui.editing !== null) return
    const shortcut = classifyHistoryShortcut({
        key: event.key,
        mod: event.ctrlKey || event.metaKey,
        shift: event.shiftKey,
        // 输入法合成中（含 keyCode 229 兼容位）不触发文档撤销/重做
        composing: event.isComposing || event.keyCode === 229,
    })
    if (shortcut === 'undo') editor.undo()
    else if (shortcut === 'redo') editor.redo()
}
window.addEventListener('keydown', onKeydown)

function zoomTo100(): void {
    const { width, height } = editor.getSurfaceSize()
    editor.zoomAt(width / 2, height / 2, 1)
}

function fitToCanvas(): void {
    editor.fitToSurface()
}

function fitToSelection(): void {
    editor.fitToSelection()
}

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    unsubscribeAssets?.()
    unsubscribeSelection?.()
    editor.dispose()
})
</script>

<template>
    <main class="stage">
        <header class="header">
            <h1>canvas-web playground</h1>
            <p>文本编辑（工单 11）：双击文本层就地编辑（中文输入法原生可用），Esc / Ctrl+Enter / 点画布其他处 / 失焦退出并一步入历史，清空文本提交即删层</p>
            <p class="assets-note">{{ assetsNote }}</p>
            <p class="selection-note" data-selection>{{ selectionNote }}</p>
        </header>

        <section class="toolbar" aria-label="视图工具栏">
            <button
                type="button"
                data-undo
                title="撤销（Ctrl/Cmd+Z）"
                :disabled="!canUndo"
                @click="editor.undo()"
            >
                撤销
            </button>
            <button
                type="button"
                data-redo
                title="重做（Ctrl/Cmd+Shift+Z 或 Ctrl+Y）"
                :disabled="!canRedo"
                @click="editor.redo()"
            >
                重做
            </button>
            <span class="toolbar-divider" aria-hidden="true"></span>
            <button type="button" title="缩小（以视口中心为锚）" @click="zoomBy(1 / 1.25)">−</button>
            <span class="zoom-value" data-zoom>{{ zoomPercent }}%</span>
            <button type="button" title="放大（以视口中心为锚）" @click="zoomBy(1.25)">＋</button>
            <button type="button" @click="zoomTo100">100%</button>
            <button type="button" class="fit" @click="fitToCanvas">适应画布</button>
            <button type="button" class="fit" title="视口适配当前选中的图层盒" @click="fitToSelection">适应选区</button>
        </section>

        <section class="workbench" aria-label="画布与面板">
            <LayerPanel :editor="editor" />
            <CanvasSurface class="surface" :editor="editor" @ready="onReady" />
            <PropertyPanel :editor="editor" />
        </section>

        <section class="legend">
            <ul>
                <li><b>文本编辑</b>：<b>双击文本层</b>就地编辑（textarea overlay 精确对位图层盒，CSS transform 缩放——缩放中字号视觉恒定、光标不丢）；中文输入法原生可用（候选窗里的 Esc/Enter 只操作候选不误提交）；<b>Esc / Ctrl+Enter / 点画布其他处 / 失焦</b>退出并一次性入一步历史（进入编辑不进历史）；清空文本提交 = 删除该图层，可撤销；编辑中该层文字由 textarea 呈现（内容层跳绘防重影），退出后恢复预览断行（断行允许与编辑态不同，决策 A）</li>
                <li><b>点属性面板不误提交</b>：编辑中点面板/工具栏（画布外指针交互）的失焦被豁免，编辑会话保持——调完字号点回文本层继续写，文本仍是一步历史；编辑期间 Ctrl/Cmd+Z 撤「输入」而非文档（快捷键路由进 textarea）</li>
                <li><b>图层面板</b>：左侧树形大纲<b>顶部 = 视觉最上层</b>（图层数组尾，priority 越大越垫底不反直觉）；表格展开三层嵌套（表 → 行 → 格/格内容）；点选行 = 画布选中、行悬停 = 画布高亮（双向联动，画布点选后行也高亮）</li>
                <li><b>拖动重排</b>：根层拖行上半/下半落位，画布叠放<b>即时变化</b>，priority 走中点插值（保存再打开顺序不变）；表格行拖动直接改数组序（行 0 恒在视觉顶部，行 priority 不参与），格拖动同款数组序语义；两套语义分立</li>
                <li><b>增删</b>：面板头「文/图/码/表」新增图层（置顶 priority = min−1 并自动选中）；行尾 ✕ 删除（根层含整棵子树，行/格/格内容分别 splice/置空）；重排与删除均为一步历史，Ctrl/Cmd+Z 可撤销</li>
                <li><b>表格编辑</b>：表节点悬停 <b>+行</b>（缺省行+格+文本，行宽=表宽）、行节点悬停 <b>+格</b>（缺省格+文本，行高取最高格）；<b>行可跨表拖动、格可跨行拖动</b>（重建路径与 graph 解码同一套 add 同步语义——跨表行宽重同步、跨行行高取最高格）；选中格后在属性面板开「高自适应」= 按<b>行数×行高+padding</b> 采纳内容动态高（autowrap 文本）；双击格内文本直接编辑（复用文本编辑 overlay）；建表→加行→改单元格文本→移动行，全程一步一撤销</li>
                <li><b>属性面板</b>：点选图层后右侧按字段注册表自动生成表单——数值（X/Y/宽高/字号）逐键实时生效、change/blur 收口为一步历史；改背景色（取色器拖动实时）、文本内容（逐键实时，输入法合成中不误提交）、九宫锚点（点击即一步历史）；四键内边距、四边边框（宽度 0 = 关闭该边）；未选中时显示画布宽/高；行宽/格内容宽高等被解码强同步的字段不出现（权威字段过滤）</li>
                <li><b>撤销/重做</b>：顶栏按钮随历史栈自动可用/禁用；快捷键 <b>Ctrl/Cmd+Z</b> 撤销、<b>Ctrl/Cmd+Shift+Z</b>（或 Ctrl+Y）重做；上限 100 步、不跨会话，撤销后的新变更弃用重做分支（对齐 Figma）；面板连续输入合并为一步，blur 收口</li>
                <li><b>点选</b>：左键点击图层（视觉最上层优先，负溢出画布外也可命中）；点表格选中格，<b>Esc 逐级升级 格→行→表</b>，再按清空；点空白处取消选择</li>
                <li><b>拖动</b>：左键按住拖动，位置实时跟随（九锚点一视同仁，只改 x/y 增量）；<b>一次拖动 = 一步历史</b>（mergeKey 事务合并，撤销一次回到拖动前）</li>
                <li><b>hover</b>：指针扫过的图层有淡蓝高亮，选中层蓝框常显（都画在 gizmo 覆盖层，不触发内容层重绘）</li>
                <li><b>适应选区</b>：视口适配选中图层盒（表格可适配到行/格）；无选中时同「适应画布」</li>
                <li>平移：空格（或中键）拖拽、plain 滚轮上下左右、<b>shift + 滚轮横向</b>；缩放 <b>ctrl/cmd + 滚轮</b>以指针为中心，范围 5%–800%</li>
                <li>顶部读数显示选中路径与 x/y/锚点（拖动时数值联动，与属性面板读同一文档数据）</li>
                <li>工单 02–04 目验样例保留：priority 叠放 / cover / 中文禁则断行 / 表格 / 失败资源（右上红框）/ QR 固定选项（右下，贴角负边距）</li>
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

.selection-note {
    margin-top: 2px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: #2563eb;
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

.toolbar button:disabled {
    color: #cbd5e1;
    cursor: not-allowed;
    border-color: #f1f5f9;
}

.toolbar button:disabled:hover {
    border-color: #f1f5f9;
}

.toolbar-divider {
    width: 1px;
    height: 18px;
    margin: 0 2px;
    background: #e5e7eb;
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

/* 工单 09：画布 + 属性面板并排的工作台布局 */
.workbench {
    display: flex;
    align-items: stretch;
    gap: 12px;
    width: min(1240px, calc(100vw - 32px));
    height: max(420px, calc(100vh - 320px));
}

.workbench .surface {
    flex: 1;
    min-width: 0;
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
