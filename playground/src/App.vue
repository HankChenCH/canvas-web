<script setup lang="ts">
// 工单 14 目验：剪贴板（Ctrl/Cmd+C/V/D 与右键「创建副本」）、快捷键注册表
// （useShortcuts 统一接键盘：让路规则见内核 classifyEditorShortcut）、右键菜单
// （删除/副本/置顶/置底）、状态栏（缩放/选中路径/物化进行数）。
// 工单 13 目验保留：保存/导出/上传/字体清单。工单 11/08/05 保留：文本编辑、相机导航。
import { computed, onBeforeUnmount, provide, ref } from 'vue'

import {
    Canvas2DBackend,
    Materializer,
    applyViewportTransform,
    drawResourceMarkers,
    exportPreviewPng,
} from '@hankchen/canvas-next-browser-renderer'
import type { ResourceState } from '@hankchen/canvas-next-browser-renderer'
import { EditorSession } from '@hankchen/canvas-next-editor'
import type { FontCatalogEntry, UploadFile } from '@hankchen/canvas-next-editor'
import {
    FONT_PICKER_KEY,
    StatusBar,
    formatLayerPath,
    uploadFileFromDom,
    useShortcuts,
    type FontPickerContext,
} from '@hankchen/canvas-next-editor-vue'
import { resolveLayer, type OverlayPainter } from '@hankchen/canvas-next-editor'
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
import { decodeGraph, encodeGraph } from '@hankchen/canvas-next'

import { DEMO_GRAPH_JSON } from './demoGraph'
import { buildVisualCheckGraph } from './visualCheckGraph'

// 缩放范围可配置（缺省即 5%–800%）；适应画布留 48px 呼吸边。
// 上传注入点：playground 以 data URL 兜底（文件内联进 graph，可离线演示；生产
// 宿主接自己的存储返回 URL）。字体清单：内置清单可配置（清单 ≠ 物化，加载仍走
// 渲染端物化管线），自定义字体上传后追加。
const editor = new EditorSession({
    scheduleFrame: createRafScheduler(),
    fitMargin: 48,
    uploadHandler: uploadToDataUrl,
    fontCatalog: [{ label: 'Open Sans（演示字体）', ref: '/fonts/open-sans.ttf' }],
})

/** data URL 兜底上传：本机字节 → 内联引用（物化管线可装载，无需网络） */
async function uploadToDataUrl(file: UploadFile): Promise<string> {
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < file.bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...file.bytes.subarray(i, i + chunkSize))
    }
    const base64 = btoa(binary)
    const mime = file.mime || 'application/octet-stream'
    return `data:${mime};base64,${base64}`
}

// 字体清单 → FontField 控件的注入缝：entries 随 catalog 订阅联动（上传追加实时
// 进下拉），退订随组件卸载
const fontCatalogEntries = ref<readonly FontCatalogEntry[]>(editor.fontCatalog.entries)
const unsubscribeCatalog = editor.fontCatalog.subscribe((entries) => {
    fontCatalogEntries.value = entries
})
provide(FONT_PICKER_KEY, {
    entries: fontCatalogEntries,
    canUpload: editor.canUpload,
    uploadFont: (file) => editor.uploadFont(file),
} satisfies FontPickerContext)

// 隐藏文件入口的触发 refs（打开 graph JSON / 本机选图）
const openInput = ref<HTMLInputElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
function onOpenClick(): void {
    openInput.value?.click()
}
function onUploadImageClick(): void {
    imageInput.value?.click()
}

const viewport = useViewport(editor)
const zoomPercent = computed(() => Math.round(viewport.value.zoom * 100))
const { canUndo, canRedo } = useHistory(editor)
// 快捷键注册表的绑定桥（工单 14）：撤销/重做/复制/粘贴/副本/删除走集中注册表；
// Ctrl/Cmd+S 保存是宿主职责，仍在下方 onKeydown 自理。让路规则（文本编辑态/
// 输入框/输入法）由内核分类器裁决，textarea 与属性面板输入框原生编辑优先。
useShortcuts(editor)

const assetsNote = ref('资源物化中…')
const selectionNote = ref('未选中图层（左键点选，Esc 逐级升级）')
/** 文档操作读数（保存/打开/导出/上传的状态与预览语义标注） */
const docNote = ref('')
/** 物化在途计数（状态栏「物化中」段）：Materializer 住渲染端包，订阅后注入 StatusBar */
const pendingCount = ref(0)

let materializer: Materializer | null = null
let contentBackend: Canvas2DBackend | null = null
let overlayCtx: CanvasRenderingContext2D | null = null
let unsubscribeAssets: (() => void) | null = null
let unsubscribeSelection: (() => void) | null = null
let unsubscribeDoc: (() => void) | null = null

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

// ---- 保存 / 打开（工单 13）：保存时机归宿主，core 只经 doc 订阅给变更信号 ----

/** 打开/保存的基线快照（canonical encode JSON）；文档 JSON 与它不同即「未保存」 */
const savedSnapshot = ref<string | null>(null)
const isDirty = ref(false)
const graphFileName = ref('canvas.graph.json')

function syncDirty(): void {
    const current = editor.store.doc ? JSON.stringify(encodeGraph(editor.store.doc)) : null
    isDirty.value = current !== null && current !== savedSnapshot.value
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
}

function saveGraph(): void {
    const doc = editor.store.doc
    if (!doc) return
    // 保存产物 = canonical graph JSON（文件美化缩进便于人读；基线比较用紧凑串）
    const json = JSON.stringify(encodeGraph(doc), null, 2)
    downloadBlob(new Blob([json], { type: 'application/json' }), graphFileName.value)
    markCleanBaseline(doc, graphFileName.value)
    docNote.value = `已保存 graph JSON（${graphFileName.value}）· 再次打开无损复原`
}

/** 打开/载入后的 clean 基线：canonical encode 快照（刚打开不算未保存）+ 文件名 + 标记复位 */
function markCleanBaseline(doc: ReturnType<typeof decodeGraph>, name: string): void {
    savedSnapshot.value = JSON.stringify(encodeGraph(doc))
    graphFileName.value = name
    syncDirty()
}

async function onOpenGraphFile(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement
    const file = inputEl.files?.[0]
    inputEl.value = ''
    if (!file) return
    try {
        const doc = decodeGraph(JSON.parse(await file.text()))
        editor.openDocument(doc)
        // 打开即 clean 基线：与保存同源（canonical encode）
        markCleanBaseline(doc, file.name)
        materializer?.materialize(doc)
        editor.fitToSurface()
        docNote.value = `已打开 ${file.name}（graph JSON 解码，未保存标记复位）`
    } catch (error) {
        docNote.value = `打开失败：${error instanceof Error ? error.message : String(error)}`
    }
}

/** 关闭前提醒：有未保存变更时弹浏览器通用确认（文案由浏览器定） */
function onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!isDirty.value) return
    event.preventDefault()
    event.returnValue = ''
}
window.addEventListener('beforeunload', onBeforeUnload)

// ---- 目验样图（工单 15）：php-canvas-image-renderer visual-check 同场景一键载入 ----

/** 一键打开目验样图：中文禁则断行/表格/QR/priority 叠放，人工核对预览观感 */
function loadVisualCheckGraph(): void {
    const doc = buildVisualCheckGraph()
    editor.openDocument(doc)
    markCleanBaseline(doc, 'visual-check.graph.json')
    materializer?.materialize(doc)
    editor.fitToSurface()
    docNote.value = '已载入目验样图（php visual-check 同场景：中文禁则/表格/QR/priority 叠放）'
}

// ---- 导出（工单 13，ADR 0004）：浏览器 PNG 是预览图，非终图 ----

const exporting = ref(false)

async function exportPreview(): Promise<void> {
    const doc = editor.store.doc
    if (!doc || !contentBackend || !materializer || exporting.value) return
    exporting.value = true
    docNote.value = '导出预览：等待全部资源物化…'
    try {
        materializer.materialize(doc) // 兜底补调度（面板改 URL 后的增量引用）
        const state = await materializer.whenSettled()
        const failed = Object.values(state).filter((e) => e.status === 'failed').length
        // 文本布局策略与编辑会话同一注入值：导出与画布的断行/盒高不分叉
        const result = await exportPreviewPng(doc, contentBackend, { textPolicies: editor.textPolicies })
        const base = graphFileName.value.replace(/\.json$/i, '')
        downloadBlob(result.blob, `${base}-preview.png`)
        docNote.value =
            failed > 0
                ? `已导出预览 PNG（预览图，非终图；${failed} 项资源失败以占位出图）· ${result.width}×${result.height}`
                : `已导出预览 PNG（预览图，非终图）· ${result.width}×${result.height}`
    } catch (error) {
        docNote.value = `导出失败：${error instanceof Error ? error.message : String(error)}`
    } finally {
        exporting.value = false
    }
}

// ---- 上传（工单 13）：本机选图 → data URL 内联 → 新建图片图层 ----

async function onImageFile(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement
    const file = inputEl.files?.[0]
    inputEl.value = ''
    if (!file) return
    try {
        const path = await editor.uploadImageAsLayer(await uploadFileFromDom(file))
        docNote.value = path
            ? `已上传并新建图片图层：${describePath(path)} · ${file.name}（data URL 兜底，内联进保存产物）`
            : '上传完成但文档未打开（先打开一份 graph）'
    } catch (error) {
        docNote.value = `上传失败：${error instanceof Error ? error.message : String(error)}`
    }
}

/** 路径读数直接用绑定层的 formatLayerPath（与状态栏同一格式） */
const describePath = formatLayerPath

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
    contentBackend = backend
    // 跨域资源可经 new Materializer(backend, { imageProxy }) 注入代理改写；
    // 本页资源全部同源，无需代理。
    materializer = new Materializer(backend)

    editor.attachContentBackend(backend)
    editor.setOverlayPainter(overlayPainter)

    unsubscribeAssets = materializer.subscribe(() => {
        assetsNote.value = assetsStatus(materializer!.state, materializer!.pendingCount)
        pendingCount.value = materializer!.pendingCount
        // 双层都脏：内容层补绘新就绪资源，覆盖层的占位/失败标识随之消失或变色——
        // 标识画在覆盖层，只脏内容层会留灰叉残影（工单 15 修正）
        editor.invalidate('both')
    })

    // 文档变更 = 内核对宿主暴露的「文档已变更」信号：驱动物化补调度 + 未保存标记。
    // 编辑动作、撤销/重做、打开文档都以 doc 通知收口，这里统一消费。
    unsubscribeDoc = editor.subscribe((change) => {
        if (change.scope !== 'doc') return
        const doc = editor.store.doc
        if (doc) materializer?.materialize(doc)
        syncDirty()
    })

    unsubscribeSelection = editor.subscribe((change) => {
        // 选择变更与拖动中的文档事务都刷新选中读数
        if (change.scope === 'doc' || (change.scope === 'ui' && change.branch === 'selection')) {
            syncSelectionNote()
        }
    })

    const doc = decodeGraph(JSON.parse(DEMO_GRAPH_JSON))
    editor.openDocument(doc)
    markCleanBaseline(doc, graphFileName.value)
    materializer.materialize(doc)
    editor.fitToSurface() // 初始进入：整页 fit-min 语义
    syncSelectionNote()
}

// 工具栏：以当前视口中心为锚做倍率/复位，平移不跳变
function zoomBy(factor: number): void {
    const { width, height } = editor.getSurfaceSize()
    editor.zoomAt(width / 2, height / 2, viewport.value.zoom * factor)
}

/** 键盘：仅 Ctrl/Cmd+S（保存是宿主职责，不入内核注册表）。文本编辑中键盘路由
 *  进 textarea：Ctrl+Z 撤「输入」而非文档（useShortcuts 的让路规则同源裁决），
 *  保存同理不抢。其余快捷键（撤销/重做/复制/粘贴/副本/删除）已由 useShortcuts
 *  统一接注册表处理。 */
function onKeydown(event: KeyboardEvent): void {
    if (editor.store.ui.editing !== null) return
    const mod = event.ctrlKey || event.metaKey
    if (mod && !event.shiftKey && event.key.toLowerCase() === 's') {
        // 输入法合成中不触发文档级快捷键
        if (event.isComposing || event.keyCode === 229) return
        event.preventDefault()
        saveGraph()
    }
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
    window.removeEventListener('beforeunload', onBeforeUnload)
    unsubscribeAssets?.()
    unsubscribeSelection?.()
    unsubscribeDoc?.()
    unsubscribeCatalog()
    editor.dispose()
})
</script>

<template>
    <main class="stage">
        <header class="header">
            <h1>canvas-web playground</h1>
            <p>工单 15：加固与契约——contextlost 可恢复重绘、DPR 变更即时适配、布局快照 fixture 三端契约钉死（v1 + 预期差异白名单 + 同步校验）、点位取样补全（priority 叠加/QR 角点）；工具栏「目验样图」一键载入 php visual-check 同场景。工单 14/13 与更早目验保留</p>
            <p class="assets-note">{{ assetsNote }}</p>
            <p class="selection-note" data-selection>{{ selectionNote }}</p>
            <p class="doc-note" data-doc-note>
                <span class="dirty-dot" data-dirty-mark>{{ isDirty ? '● 未保存' : '○ 已保存' }}</span>
                <span v-if="docNote">{{ docNote }}</span>
            </p>
        </header>

        <section class="toolbar" aria-label="文档与视图工具栏">
            <button type="button" data-open title="打开 graph JSON（解码回编辑器）" @click="onOpenClick">打开</button>
            <!-- editor.store.doc 是非响应式读数，按钮可用态不做文档门（处理器自守卫），
                 导出中状态走响应式 exporting -->
            <button type="button" data-save title="保存 graph JSON（Ctrl/Cmd+S）" @click="saveGraph">保存</button>
            <button type="button" data-export title="导出浏览器预览 PNG（预览图，非终图；先等待全量物化）" :disabled="exporting" @click="exportPreview">
                {{ exporting ? '导出中…' : '导出 PNG' }}
            </button>
            <button type="button" data-upload-image title="本机选图 → 上传（data URL 兜底）→ 新建图片图层（宿主未注入上传实现时禁用）" :disabled="!editor.canUpload" @click="onUploadImageClick">上传图片</button>
            <span class="toolbar-divider" aria-hidden="true"></span>
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
            <button
                type="button"
                data-visual-check
                title="载入目验样图（php visual-check 同场景：中文禁则断行/表格/QR/priority 叠放）"
                @click="loadVisualCheckGraph"
            >
                目验样图
            </button>
            <!-- 隐藏文件入口：打开 graph JSON / 本机选图 -->
            <input ref="openInput" type="file" accept=".json,application/json" class="hidden" @change="onOpenGraphFile" />
            <input ref="imageInput" type="file" accept="image/*" class="hidden" @change="onImageFile" />
        </section>

        <section class="workbench" aria-label="画布与面板">
            <LayerPanel :editor="editor" />
            <CanvasSurface class="surface" :editor="editor" @ready="onReady" />
            <PropertyPanel :editor="editor" />
        </section>

        <StatusBar class="statusbar" :editor="editor" :pending-count="pendingCount" />

        <section class="legend">
            <ul>
                <li><b>剪贴板（工单 14）</b>：选中图层后 <b>Ctrl/Cmd+C</b> 复制、<b>Ctrl/Cmd+V</b> 粘贴、<b>Ctrl/Cmd+D</b> 创建副本（右键菜单「创建副本」同款）；复制的是<b>整棵子树深拷贝</b>（表格连行/格/内容一起复制，复制后改原件不影响粘贴产物）；粘贴<b>置顶</b>（priority = min−1）且位置偏移 +20 不与原件重叠，连续粘贴偏移递增（+20、+40…）互不压叠；一次粘贴/副本 = 一步历史，Ctrl/Cmd+Z 可撤销；副本不覆盖剪贴板（复制 A → 副本 B → 粘贴仍出 A）；行/格不可复制（容器内结构），格内容可复制出表</li>
                <li><b>右键菜单（工单 14）</b>：画布上<b>右键点图层</b> = 选中并弹出最小菜单（创建副本/置顶/置底/删除）——按视口坐标定位（pan/zoom 不跟随、画布边缘自动钳位）；可用态随选择裁剪：置顶/置底只对根层生效（表格行/格是数组序语义），菜单上右键/点菜单外/Esc/执行动作即关；textarea 内右键仍是浏览器原生菜单</li>
                <li><b>快捷键（工单 14 注册表）</b>：Ctrl/Cmd+Z 撤销、Ctrl/Cmd+Shift+Z（或 Ctrl+Y）重做、Delete/Backspace 删除选中图层、Ctrl/Cmd+C/V/D 剪贴板三件套；<b>文本编辑态与输入框焦点自动让路</b>——编辑文本时 Delete/Backspace 只改文字不删图层、Ctrl/Cmd+Z 撤「输入」、属性面板输入框内原生编辑优先；输入法候选窗里的按键不误触发（isComposing/229 守卫）</li>
                <li><b>状态栏（工单 14）</b>：画布下方的暗色读数条 = <b>缩放百分比</b>（随 ctrl/cmd+滚轮实时更新）· <b>选中图层路径</b>（图层 N · 行 N · 格 N · 格内容，未选中回落文案）· <b>物化进行数</b>（在途资源装载 &gt; 0 时显示「物化中 N」，归零隐藏）</li>
                <li><b>保存 / 打开（工单 13）</b>：<b>保存</b>（Ctrl/Cmd+S 或顶栏按钮）= 导出 canonical graph JSON 文件；<b>打开</b> = 解码回编辑器，再次打开无损复原（编辑→保存→打开→再保存字节级恒等）；保存时机归宿主，内核只经 store 订阅暴露「文档已变更」信号——顶部 <b>● 未保存</b> 标记随文档变更点亮、保存/打开后复位（撤销回已保存状态同样复位）；关闭页面前有未保存变更会弹确认</li>
                <li><b>导出 PNG（预览图，非终图）</b>：顶栏「导出 PNG」先<b>等待全部资源物化</b>（慢资源在途时按钮显示「导出中…」、读数提示进行中），再全幅渲染下载；出图写入 PNG 元数据标注（tEXt: CanvasNext = preview render, not the final image）+ 文件名 <code>-preview.png</code> 后缀——<b>终图由服务端渲染端依据 graph JSON 权威产出</b>（ADR 0004），物化失败的资源以占位出图并在读数中注明</li>
                <li><b>上传（本机资源 → 可物化引用）</b>：顶栏「上传图片」选本机图片 → 内核 uploadHandler 注入点转成引用 → 自动新建图片图层并选中（上传+建层 = 一步历史可撤销）；playground 以 <b>data URL 兜底</b>实现（内联进保存产物，可离线演示；生产宿主接自己的存储返回 URL）；<b>core 不内置任何上传实现</b>——未注入时上传入口禁用、动作抛明确错误（降级提示）</li>
                <li><b>字体清单</b>：选中文本层 → 属性面板「字体」下拉 = 内置默认字体 + 清单条目（本页内置 Open Sans 演示项，URL 列表由宿主配置）；「上传」选本机字体文件（ttf/otf/woff）→ 加入清单（自定义条目，会话内可选）并落到当前文本层；清单 ≠ 物化，字体加载仍走渲染端物化管线；清单外引用原样保留在下拉（不静默改写）</li>
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
                <li><b>目验样图（工单 15）</b>：工具栏「目验样图」一键载入 <b>php-canvas-image-renderer visual-check 同场景</b>（400×400）——头图色块 + 居中标题、长中文段落（<b>禁则</b>：行首不出现句号/逗号等收尾标点、英文词边界断行）、三行两列<b>表格</b>（表头底色 + 全边框）、<b>QR</b>（纠错 High/无静区/黑白）、双色图片条与页脚；<b>priority 叠放</b>（白底 11 → 头图 10 → 标题 5 → 内容层 4）。人工核对预览观感：预览断行允许与终图不同（决策 A），位置与盒尺寸应一致</li>
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

.doc-note {
    margin-top: 2px;
    display: flex;
    justify-content: center;
    gap: 10px;
    font-size: 12px;
    color: #64748b;
}

.dirty-dot {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: #d97706;
}

.hidden {
    display: none;
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

/* 工单 14：状态栏（缩放/选中路径/物化进行数），与工作台同宽、圆角暗条 */
.statusbar {
    width: min(1240px, calc(100vw - 32px));
    border-radius: 8px;
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
