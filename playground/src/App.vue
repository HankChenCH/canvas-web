<script setup lang="ts">
// 工单 14 目验：剪贴板（Ctrl/Cmd+C/V/D 与右键「创建副本」）、快捷键注册表
// （useShortcuts 统一接键盘：让路规则见内核 classifyEditorShortcut）、右键菜单
// （删除/副本/置顶/置底）、状态栏（缩放/选中路径/物化进行数；工单 01 起状态栏
// 收编全部读数：坐标尺寸/资源/保存/schema/反馈段；工单 02 拆除头部四行读数，
// 全部读数仅状态栏一处归口）。
// 工单 13 目验保留：保存/上传/字体清单。工单 11/08/05 保留：文本编辑、相机导航。
// 工单 02：头栏一行化（文档名 + 未保存点 + 画布规格徽标｜帮助 + 导出主按钮）+
// 宿主级帮助抽屉（使用说明区 = legend 原样迁移；开发者区 = 工票长文 + 目验样图
// + schema 三键，data-* 钩子原位保留）。
// 工单 03：工具栏语义分组——文件（打开/保存/上传图片）｜历史（撤销/重做）｜插入
// （＋文本/＋图片/＋二维码/＋表格，直调 editor.addRootLayer，与图层面板头「＋」
// 同款动作并存保留，新层置顶并自动选中）。
// 工单 04：缩放浮条——画布右下角宿主级悬浮条浮于 CanvasSurface 之上（− / %只读 /
// ＋ / 适应画布 / 适应选区 / 1:1），工具栏缩放控件整组摘除：全壳缩放入口唯一
// （浮条）、缩放读数唯一归状态栏；ctrl/cmd+滚轮缩放不变。
// 工单 05：全视口暗色工作台壳——.stage 100vh 四行网格（头栏 48 / 工具栏 44 /
// 工作台 1fr / 状态栏 auto≈30），页面零滚动；去 1240px 锁宽（四行全宽、画布区
// 垂直撑满）；壳层暗色统一（#070d18 页底 + #0b1220 面板族令牌，工具栏钮 ghost
// 形态、主按钮 accent、画布桌面底暗色渐变、帮助抽屉换肤），editor-vue 面板与
// StatusBar 令牌零改动，两面板宽度 232/288 与交互不动。
import { computed, nextTick, onBeforeUnmount, provide, ref, watch } from 'vue'

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
import type { OverlayPainter } from '@hankchen/canvas-next-editor'
import { decodeGraph, encodeGraph } from '@hankchen/canvas-next'

import { DEMO_GRAPH_JSON } from './demoGraph'
import { INVALID_DATASET_SCHEMA, SAMPLE_DATASET_SCHEMA } from './sampleDatasetSchema'
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

// 数据源 schema 声明（content-completion 工单 03，D2 宿主随会话注入）：playground
// 以宿主身份在会话建立即注入样例载荷 schema。声明只进编辑器会话态（store ui 分支），
// 不进 graph、不落 localStorage、不动 wire；三键目验收进帮助抽屉开发者区（工单 02），
// 注入/非法降级/清除，声明态读数归状态栏 schema 段。
editor.setDataSourceSchema(SAMPLE_DATASET_SCHEMA)

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
/** 文档操作读数（保存/打开/导出/上传的状态与预览语义标注；状态栏反馈段显示） */
const docNote = ref('')
/** 物化在途计数（状态栏「物化中」段）：Materializer 住渲染端包，订阅后注入 StatusBar */
const pendingCount = ref(0)

// ---- 头栏（工单 02）：一行化 topbar 的徽标读数与帮助抽屉开关 ----

/** 画布规格徽标：doc 宽×高 + 横竖版派生（高>宽 竖版 / 宽>高 横版 / 相等 方版）；
 *  空文档降级为隐藏（badge 为 null，v-if 不渲染）。文档维度只随 doc 通知变化，
 *  本地订阅即可（useDoc 切片桥是 status-bar 域内部件，不在 editor-vue 出口面）。 */
const canvasSize = ref<{ width: number; height: number } | null>(null)
function syncCanvasSize(): void {
    const doc = editor.store.doc
    canvasSize.value = doc ? { width: doc.width, height: doc.height } : null
}
const unsubscribeCanvasBadge = editor.subscribe((change) => {
    if (change.scope === 'doc') syncCanvasSize()
})
syncCanvasSize()
const canvasBadge = computed(() => {
    const size = canvasSize.value
    if (!size) return null
    const orientation = size.height > size.width ? '竖版' : size.width > size.height ? '横版' : '方版'
    return `${size.width} × ${size.height} · ${orientation}`
})

/** 帮助抽屉开关：头栏「帮助」开；✕ / 点遮罩 / Esc 关 */
const helpOpen = ref(false)
const helpDrawer = ref<HTMLElement | null>(null)
watch(helpOpen, (open) => {
    if (open) nextTick(() => helpDrawer.value?.focus())
})
/** 输入法合成中的按键不触发文档级快捷键（Ctrl+S 与抽屉 Esc 同守卫） */
function isImeComposing(event: KeyboardEvent): boolean {
    return event.isComposing || event.keyCode === 229
}

/** Esc 关抽屉：capture 相先于 useShortcuts 的冒泡监听，拦下 Esc 不让编辑器同时
 *  处理（选区逐级升级）；输入法合成中不拦。常驻监听、helpOpen 门控。 */
function onDrawerKeydown(event: KeyboardEvent): void {
    if (!helpOpen.value || event.key !== 'Escape') return
    if (isImeComposing(event)) return
    event.stopPropagation()
    helpOpen.value = false
}
window.addEventListener('keydown', onDrawerKeydown, { capture: true })

let materializer: Materializer | null = null
let contentBackend: Canvas2DBackend | null = null
let overlayCtx: CanvasRenderingContext2D | null = null
let unsubscribeAssets: (() => void) | null = null
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

// ---- 数据源 schema 注入入口（工单 03 目验）：宿主随会话注入的三态演示 ----

/** 注入样例声明：载荷形态（D1），顶层键 = 根上下文候选（补全浮层呈现归工单 04/05） */
function injectSampleSchema(): void {
    editor.setDataSourceSchema(SAMPLE_DATASET_SCHEMA)
    docNote.value = '已注入样例数据源 schema（载荷顶层键 = 根上下文候选；浮层呈现归工单 04/05）'
}

/** 注入非法声明（根级保留键 row）：降级无候选 + console 警告，不弹错不抛错 */
function injectInvalidSchema(): void {
    editor.setDataSourceSchema(INVALID_DATASET_SCHEMA)
    docNote.value = '已注入非法声明（根级保留键 row）→ 降级无候选；警告走 console.warn，不弹错'
}

/** 清除声明：未注入 = 无候选（清除不告警） */
function clearDataSourceSchema(): void {
    editor.setDataSourceSchema(null)
    docNote.value = '已清除数据源 schema 声明（未注入 = 无候选）'
}

// ---- 导出（工单 13，ADR 0004）：浏览器 PNG 是预览图，非终图 ----

const exporting = ref(false)

async function exportPreview(): Promise<void> {
    const doc = editor.store.doc
    // 导出消费预览视图（决策 2026-09）：模板态表格以一行预览行出图，与画布所见一致
    const view = editor.previewCanvas
    if (!doc || !view || !contentBackend || !materializer || exporting.value) return
    exporting.value = true
    docNote.value = '导出预览：等待全部资源物化…'
    try {
        materializer.materialize(doc) // 兜底补调度（面板改 URL 后的增量引用）
        const state = await materializer.whenSettled()
        const failed = Object.values(state).filter((e) => e.status === 'failed').length
        // 文本布局策略与编辑会话同一注入值：导出与画布的断行/盒高不分叉
        const result = await exportPreviewPng(view, contentBackend, { textPolicies: editor.textPolicies })
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

    const doc = decodeGraph(JSON.parse(DEMO_GRAPH_JSON))
    editor.openDocument(doc)
    markCleanBaseline(doc, graphFileName.value)
    materializer.materialize(doc)
    editor.fitToSurface() // 初始进入：整页 fit-min 语义
}

// 缩放浮条（工单 04）：以当前视口中心为锚做倍率/复位，平移不跳变
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
        if (isImeComposing(event)) return
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
    window.removeEventListener('keydown', onDrawerKeydown, { capture: true })
    window.removeEventListener('beforeunload', onBeforeUnload)
    unsubscribeAssets?.()
    unsubscribeDoc?.()
    unsubscribeCanvasBadge()
    unsubscribeCatalog()
    editor.dispose()
})
</script>

<template>
    <main class="stage">
        <!-- 头栏一行化（playground-canvas-first 工单 02，spec 决策 1）：48px 单行。
             左格 = 文档名 + 未保存点（●/○）+ 画布规格徽标（宽×高 · 横竖版派生，
             空文档隐藏；「模板」态标记不做——模板语义内核能力未立项）；右格 =
             「帮助」ghost 钮（开帮助抽屉）+「导出预览 PNG」主按钮（导出中禁用态
             与预览图/非终图语义保留）。头部旧四行读数已拆：缩放/选中/坐标/schema
             由 StatusBar 组件内部直读，资源/保存/反馈经下方 prop 注入。 -->
        <header class="topbar" aria-label="文档头栏">
            <div class="topbar-doc">
                <span
                    class="dirty-dot"
                    :class="{ 'is-dirty': isDirty }"
                    data-dirty-mark
                    :title="isDirty ? '未保存（文档与最近一次保存/打开基线不一致）' : '已保存'"
                >{{ isDirty ? '●' : '○' }}</span>
                <span class="doc-name" data-doc-name>{{ graphFileName }}</span>
                <span v-if="canvasBadge" class="canvas-badge" data-canvas-badge>{{ canvasBadge }}</span>
            </div>
            <div class="topbar-actions">
                <button type="button" class="ghost" data-help title="打开帮助抽屉（使用说明 + 开发者目验区）" @click="helpOpen = true">？ 帮助</button>
                <!-- editor.store.doc 是非响应式读数，按钮可用态不做文档门（处理器自守卫），
                     导出中状态走响应式 exporting -->
                <button type="button" class="primary" data-export title="导出浏览器预览 PNG（预览图，非终图；先等待全量物化）" :disabled="exporting" @click="exportPreview">
                    {{ exporting ? '导出中…' : '导出预览 PNG' }}
                </button>
            </div>
        </header>

        <!-- 工具栏语义分组（playground-canvas-first 工单 03，spec 决策 3）：文件
             （打开/保存/上传图片）｜历史（撤销/重做）｜插入（＋文本/＋图片/＋二维码/
             ＋表格，直调 editor.addRootLayer——与图层面板头「文/图/码/表」同款动作
             并存保留，就近补充不回退既有能力；新层置顶 priority = min−1 并自动选中，
             一次调用 = 一步历史）。上传图片维持 uploadHandler 管线与 data-upload-image
             钩子。分组视觉用分隔线语义（toolbar-divider 延伸），按钮 ghost 形态随
             工单 05 暗色壳统一落定（插入组亮色引导高频动作）。缩放控件已整组摘除
             归画布右下浮条（工单 04）；目验样图
             与 schema 三键已在工单 02 迁入帮助抽屉、标尺/网格不出现（⑥ 范围外，
             不放死按钮）。 -->
        <section class="toolbar" aria-label="编辑器工具栏">
            <!-- 文件组：打开 / 保存 / 上传图片 -->
            <button type="button" data-open title="打开 graph JSON（解码回编辑器）" @click="onOpenClick">打开</button>
            <button type="button" data-save title="保存 graph JSON（Ctrl/Cmd+S）" @click="saveGraph">保存</button>
            <button type="button" data-upload-image title="本机选图 → 上传（data URL 兜底）→ 新建图片图层（宿主未注入上传实现时禁用）" :disabled="!editor.canUpload" @click="onUploadImageClick">上传图片</button>
            <span class="toolbar-divider" aria-hidden="true"></span>
            <!-- 历史组：撤销 / 重做 -->
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
            <!-- 插入组：直调 addRootLayer（与图层面板头同款动作，自守卫无文档空转），
                 新层置顶并自动选中；＋图片建空层，本机选图上传走「上传图片」 -->
            <button type="button" class="tb-ins" data-insert-text title="新增文本层（置顶并自动选中，一步历史可撤销；与图层面板头「＋」同款动作）" @click="editor.addRootLayer('TextLayer')">＋文本</button>
            <button type="button" class="tb-ins" data-insert-image title="新增图片层（置顶并自动选中，一步历史可撤销；本机选图上传建层用「上传图片」）" @click="editor.addRootLayer('ImageLayer')">＋图片</button>
            <button type="button" class="tb-ins" data-insert-qrcode title="新增二维码层（置顶并自动选中，一步历史可撤销；与图层面板头「＋」同款动作）" @click="editor.addRootLayer('QrCodeLayer')">＋二维码</button>
            <button type="button" class="tb-ins" data-insert-table title="新增表格层（置顶并自动选中，一步历史可撤销；与图层面板头「＋」同款动作）" @click="editor.addRootLayer('TableLayer')">＋表格</button>
            <!-- 隐藏文件入口：打开 graph JSON / 本机选图 -->
            <input ref="openInput" type="file" accept=".json,application/json" class="hidden" @change="onOpenGraphFile" />
            <input ref="imageInput" type="file" accept="image/*" class="hidden" @change="onImageFile" />
        </section>

        <section class="workbench" aria-label="画布与面板">
            <LayerPanel :editor="editor" />
            <!-- canvas-area：浮条的宿主级定位上下文（工单 04）。浮条是 CanvasSurface
                 的兄弟而非子元素——画布事件桥全部挂在 .cn-surface 上，浮条点击不会
                 透进画布（不触发点选/平移），画布右下角浮条外的点击照常命中画布。 -->
            <div class="canvas-area">
                <CanvasSurface class="surface" :editor="editor" @ready="onReady" />
                <!-- 缩放浮条（playground-canvas-first 工单 04，spec 决策 5）：画布右下角
                     呼吸边悬浮条，就近鼠标工作区。键序 − / %（只读，等宽字体）/ ＋ /
                     适应画布 / 适应选区 / 1:1，全部沿用现有视口语义：± 以视口中心为锚
                     （zoomBy）、适应画布 = fitToSurface、适应选区 = fitToSelection、
                     1:1 = zoomTo100；ctrl/cmd+滚轮缩放不变（CanvasSurface 事件桥）。
                     % 是操作组旁的只读伴随显示（原型 FIG.2 同款），全壳读数归口仍唯一
                     在状态栏（data-zoom 钩子只在状态栏）；工具栏缩放控件本单摘除。
                     暗色按原型配色内联（#0b1220 族 = 状态栏 --cn-bg 同源令牌），壳层
                     统一归工单 05。 -->
                <div class="zoom-float" role="toolbar" aria-label="缩放" data-zoom-float>
                    <span class="zoom-float__group">
                        <button type="button" class="zoom-float__key" data-zoom-out title="缩小（以视口中心为锚）" @click="zoomBy(1 / 1.25)">−</button>
                        <span class="zoom-float__pct">{{ zoomPercent }}%</span>
                        <button type="button" class="zoom-float__key" data-zoom-in title="放大（以视口中心为锚）" @click="zoomBy(1.25)">＋</button>
                    </span>
                    <span class="zoom-float__group">
                        <button type="button" class="zoom-float__key zoom-float__key--text" data-zoom-fit title="视口适配整幅画布（留 fit 呼吸边）" @click="fitToCanvas">适应画布</button>
                        <button type="button" class="zoom-float__key zoom-float__key--text" data-zoom-fit-selection title="视口适配当前选中的图层盒" @click="fitToSelection">适应选区</button>
                    </span>
                    <span class="zoom-float__group">
                        <button type="button" class="zoom-float__key zoom-float__key--text" data-zoom-100 title="缩放复位 100%（以视口中心为锚）" @click="zoomTo100">1:1</button>
                    </span>
                </div>
            </div>
            <PropertyPanel :editor="editor" />
        </section>

        <!-- 状态栏收编全部读数（playground-canvas-first 工单 01，工单 02 起头部读数
             已拆、此处是唯一读数归口）：组件内直读的缩放/选中路径/坐标尺寸/schema
             声明态之外，资源/保存/反馈三段由宿主注入（物化状态订阅 assetsNote、
             dirty 基线 isDirty、动作读数 docNote）。 -->
        <StatusBar
            class="statusbar"
            :editor="editor"
            :pending-count="pendingCount"
            :resource-note="assetsNote"
            :save-state="isDirty ? 'dirty' : 'clean'"
            :feedback="docNote"
        />

        <!-- 帮助抽屉（playground-canvas-first 工单 02，spec 决策 2）：头栏「帮助」开
             的宿主级浮层，Teleport 到 body（fixed 定位不占文档流，不破工单 05 的
             全视口零滚动）。两个分区：
             使用说明区 = 原 legend 全量条目原样迁移（文案不改写，spec 范围外）；
             开发者区 = 原 header 工票长文原样 + 目验样图 + schema 注入/非法/清除三键
             （行为与 data-visual-check / data-schema-* 钩子不变，仅落位迁移）。 -->
        <Teleport to="body">
            <div v-if="helpOpen" class="help-overlay" @click.self="helpOpen = false">
                <aside
                    ref="helpDrawer"
                    class="help-drawer"
                    role="dialog"
                    aria-modal="true"
                    aria-label="帮助"
                    data-help-drawer
                    tabindex="-1"
                >
                    <div class="help-head">
                        <h2>帮助</h2>
                        <button type="button" class="help-close" data-help-close title="关闭帮助（Esc）" @click="helpOpen = false">✕</button>
                    </div>
                    <div class="help-body">
                        <section class="help-section" aria-label="使用说明">
                            <h3>使用说明</h3>
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
                                <li><b>属性面板</b>：点选图层后右侧按字段注册表自动生成表单——数值（X/Y/宽高/字号）逐键实时生效、change/blur 收口为一步历史；改背景色（取色器拖动实时）、文本内容（逐键实时，输入法合成中不误提交）、九宫锚点（点击即一步历史）；<b>内边距/边框 = CSS 风格简写控件（工单 04）</b>：方钮循环 1→2→4 值模式（单框/上下｜左右/四框），初始模式随数据推导、数据一变即重推导；展开不改数据、收缩立即取代表值（上/左）规整入一步历史（边框上为 null 收缩到 1 = 全 null 无边框）；边框宽+色共享模式，宽度 0 = 关、无边框空显示；未选中时显示画布宽/高；行宽/格内容宽高等被解码强同步的字段不出现（权威字段过滤）</li>
                                <li><b>撤销/重做</b>：顶栏按钮随历史栈自动可用/禁用；快捷键 <b>Ctrl/Cmd+Z</b> 撤销、<b>Ctrl/Cmd+Shift+Z</b>（或 Ctrl+Y）重做；上限 100 步、不跨会话，撤销后的新变更弃用重做分支（对齐 Figma）；面板连续输入合并为一步，blur 收口</li>
                                <li><b>点选</b>：左键点击图层（视觉最上层优先，负溢出画布外也可命中）；点表格选中格，<b>Esc 逐级升级 格→行→表</b>，再按清空；<b>点空白（含全幅底图）取消选中，底图经面板操作</b></li>
                                <li><b>拖动</b>：左键按住拖动，位置实时跟随（九锚点一视同仁，只改 x/y 增量）；<b>一次拖动 = 一步历史</b>（mergeKey 事务合并，撤销一次回到拖动前）；<b>左键拖空白（含全幅底图）= 平移画布</b></li>
                                <li><b>hover</b>：指针扫过的图层有淡蓝高亮，选中层蓝框常显（都画在 gizmo 覆盖层，不触发内容层重绘）</li>
                                <li><b>适应选区</b>：视口适配选中图层盒（表格可适配到行/格）；无选中时同「适应画布」</li>
                                <li>平移：空格（或中键）拖拽、<b>左键拖空白（含全幅底图）= 平移画布</b>、plain 滚轮上下左右、<b>shift + 滚轮横向</b>；缩放 <b>ctrl/cmd + 滚轮</b>以指针为中心，范围 5%–800%</li>
                                <li>顶部读数显示选中路径与 x/y/锚点（拖动时数值联动，与属性面板读同一文档数据）</li>
                                <li>工单 02–04 目验样例保留：priority 叠放 / cover / 中文禁则断行 / 表格 / 失败资源（右上红框）/ QR 固定选项（右下，贴角负边距）</li>
                                <li><b>目验样图（工单 15）</b>：工具栏「目验样图」一键载入 <b>php-canvas-image-renderer visual-check 同场景</b>（400×400）——头图色块 + 居中标题、长中文段落（<b>禁则</b>：行首不出现句号/逗号等收尾标点、英文词边界断行）、三行两列<b>表格</b>（表头底色 + 全边框）、<b>QR</b>（纠错 High/无静区/黑白）、双色图片条与页脚；<b>priority 叠放</b>（白底 11 → 头图 10 → 标题 5 → 内容层 4）。人工核对预览观感：预览断行允许与终图不同（决策 A），位置与盒尺寸应一致</li>
                                <li><b>表格模板态与表达式标记（TableLayer V2，工票 03）</b>：中列 V2 目验区自上而下——<b>标记图片</b>（src 为表达式镜像字面 <span v-pre>{{assets.banner}}</span>，按字面引用装载失败 → 占位 + 红叉，不崩渲染）、<b>标记二维码</b>（内容为字面 <span v-pre>{{orderNo}}</span>，按字面出码）、<b>标记文本</b>（显示镜像字面 <span v-pre>订单 {{orderNo}} · 共 {{$count}} 件</span>，编辑器不求值——终图由服务端展开求值）、<b>模板态表格</b>（<b>空壳渲染</b>：表壳 bg/border 照画、行区零高——rows 为空、模板行不实例化）；模板子树不进大纲/不可选中/不参与物化，双击或面板编辑标记文本即解除标记回字面（保存后需重打标，spec §3.7）</li>
                                <li><b>数据源 schema 注入缝（content-completion 工单 03）</b>：<b>宿主随会话注入</b>（D2）——本页建立会话即注入样例载荷 schema，工具栏三键可重演：<b>注入 schema</b>（载荷形态，D1：声明即 <code>compile(canvas, dataset)</code> 的 data 载荷形状，顶层键 = 根上下文候选；键树与演示 graph 表达式对齐，description 全中文供浮层元信息目验）、<b>注入非法 schema</b>（根级保留键 <code>row</code> → 声明被拒：<b>降级无候选 + console.warn 警告，不弹错不抛错</b>，前移填充期 reserved_root_key 硬错误）、<b>清除声明</b>（未注入 = 无候选，清除不告警）；声明只进编辑器会话态（store ui 分支）——<b>不进 graph、不落 localStorage、不动 wire</b>，换文档不重置；页头读数显示声明态（已注入键数 / 无候选）</li>
                                <li><b>表达式路径补全三字段接线（content-completion 工单 05）</b>：<b>仅表达式态生效</b>（ValueTypeSegmented 表达式段点亮）——选中标记文本/图片/二维码层，在 内容/资源地址 输入框键入 <code v-pre>{{</code> 自动弹出候选浮层（portal 到 body，不破 288px 面板）；<b>上下文感知</b>：根层 = 根候选集（载荷顶层键 + <code>$root</code>），模板表格<b>格内容层</b> = 行候选集（+ <code>row.*</code> / <code>$index</code>，<code>row.</code> 下钻 items 键树）；片段内 <code>.</code> 刷新候选、↑↓ 移动、Enter/Tab 接受（补全剩余路径段）、鼠标点选同效；接受 = 文本替换走既有 input/change 提交——<b>表达式 + 镜像同改、一步历史</b>，Ctrl/Cmd+Z 撤销一步恢复镜像；Esc/失焦/点外/<code v-pre>}}</code> 关闭；静态态与未注入声明零补全；中文输入法合成期按键不误触发（IME 守卫）；全角 <code>｛｛</code> 不触发属已知限制（Ctrl/Cmd+Space 手动触发兜底）</li>
                            </ul>
                        </section>
                        <section class="help-section" aria-label="开发者">
                            <h3>开发者</h3>
                            <p class="help-ticket">工票 03：TableLayer V2 目验样例——模板态表格空壳渲染、表达式标记镜像字面与按字面物化降级（中列）。工单 15：加固与契约——contextlost 可恢复重绘、DPR 变更即时适配、布局快照 fixture 三端契约钉死（v1 + 预期差异白名单 + 同步校验）、点位取样补全（priority 叠加/QR 角点）；工具栏「目验样图」一键载入 php visual-check 同场景。工单 03（content-completion）：数据源 schema 注入缝——工具栏三键目验 注入/非法降级/清除，声明只进会话态。工单 14/13 与更早目验保留</p>
                            <div class="help-dev-actions">
                                <button
                                    type="button"
                                    data-visual-check
                                    title="载入目验样图（php visual-check 同场景：中文禁则断行/表格/QR/priority 叠放）"
                                    @click="loadVisualCheckGraph"
                                >
                                    目验样图
                                </button>
                                <button
                                    type="button"
                                    data-schema-sample
                                    title="注入样例数据源 schema（载荷形态，中文 description；宿主随会话注入，工单 03）"
                                    @click="injectSampleSchema"
                                >
                                    注入 schema
                                </button>
                                <button
                                    type="button"
                                    data-schema-invalid
                                    title="注入非法声明（根级保留键 row）→ 降级无候选 + console 警告，不弹错"
                                    @click="injectInvalidSchema"
                                >
                                    注入非法 schema
                                </button>
                                <button
                                    type="button"
                                    data-schema-clear
                                    title="清除数据源 schema 声明（未注入 = 无候选，清除不告警）"
                                    @click="clearDataSourceSchema"
                                >
                                    清除声明
                                </button>
                            </div>
                        </section>
                    </div>
                </aside>
            </div>
        </Teleport>
    </main>
</template>

<style scoped>
/* 全视口暗色工作台壳（工单 05，spec 决策 6）：100vh 四行网格——头栏 48 / 工具栏
   44 / 工作台 1fr / 状态栏 auto（组件自然高 ≈30），页面零滚动。小视口降级：工作台
   行压缩（minmax(0,1fr)）+ 面板自内滚 + 工具栏横向内滚，不回退成页滚。壳层暗色
   令牌 = 原型 #070d18/#0b1220 族（与状态栏 --cn-bg 同源）；editor-vue 面板/状态栏
   令牌零改动。浮条随 .stage 级联取令牌；帮助抽屉 Teleport 出 body，自带一份同值
   令牌块（工单 04 内联字面量在此吸收）。 */
.stage {
    --shell-bg: #070d18;
    --shell-panel: #0b1220;
    --shell-panel-92: rgb(11 18 32 / 0.92);
    --shell-line: #1e2a40;
    --shell-line-strong: #2a3a58;
    --shell-hover: #16223a;
    --shell-fg: #e6edf7;
    --shell-fg-2: #c3cddd;
    --shell-fg-3: #aab6c8;
    --shell-muted: #7c8ca5;
    --shell-accent: #38bdf8;
    --shell-on-accent: #06202b;
    --shell-insert: #7dd3fc;
    --shell-font-mono: 'SF Mono', Menlo, Consolas, monospace;
    --shell-desktop: radial-gradient(1100px 600px at 50% 40%, #101b30 0%, #0a1120 70%);

    display: grid;
    grid-template-rows: 48px 44px minmax(0, 1fr) auto;
    height: 100vh;
    margin: 0;
    overflow: hidden;
    background: var(--shell-bg);
    font-family: system-ui, sans-serif;
    color: var(--shell-fg);
}

/* 头栏（工单 02 一行化 + 工单 05 暗色壳）：48px 全宽边条，面板底 + 下缘分隔线
   （去 1240px 锁宽与圆角卡片形态） */
.topbar {
    display: flex;
    align-items: center;
    gap: 14px;
    height: 48px;
    padding: 0 16px;
    background: var(--shell-panel);
    border-bottom: 1px solid var(--shell-line);
}

.topbar-doc {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
}

/* 未保存点：● 未保存 / ○ 已保存（与状态栏保存态段同语义，topbar 只出点） */
.dirty-dot {
    flex: none;
    font-size: 13px;
    line-height: 1;
    color: var(--shell-muted);
}

.dirty-dot.is-dirty {
    color: #f59e0b;
}

.doc-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    font-weight: 600;
    color: var(--shell-fg);
}

/* 画布规格徽标：宽 × 高 · 竖版/横版（doc.canvas 派生，空文档隐藏） */
.canvas-badge {
    flex: none;
    padding: 2px 8px;
    border: 1px solid var(--shell-line);
    border-radius: 6px;
    font-family: var(--shell-font-mono);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    color: var(--shell-muted);
}

.topbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
}

.topbar .ghost {
    padding: 5px 12px;
    border: 1px solid var(--shell-line);
    border-radius: 8px;
    background: transparent;
    font-size: 13px;
    color: var(--shell-fg-3);
    cursor: pointer;
}

.topbar .ghost:hover {
    border-color: var(--shell-line-strong);
    color: var(--shell-fg);
}

/* 导出主按钮：一天工作的收束动作最显眼（spec 用户故事 4）；导出中禁用 */
.topbar .primary {
    padding: 6px 14px;
    border: none;
    border-radius: 8px;
    background: var(--shell-accent);
    font-size: 13px;
    font-weight: 600;
    color: var(--shell-on-accent);
    cursor: pointer;
}

.topbar .primary:hover {
    filter: brightness(1.12);
}

.topbar .primary:disabled {
    background: color-mix(in srgb, var(--shell-accent) 30%, transparent);
    color: color-mix(in srgb, var(--shell-on-accent) 70%, transparent);
    cursor: not-allowed;
}

.hidden {
    display: none;
}

/* 工具栏（工单 03 分组 + 工单 05 暗色壳）：44px 全宽边条，ghost 钮（无边框透明底
   + hover 面板亮色）；小视口横向内滚降级（页面零滚动不破）——内滚条不占行高
   （经典滚动条平台会裁切按钮），滚动能力保留（滚轮/触控板横扫） */
.toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 0 16px;
    overflow-x: auto;
    overflow-y: hidden;
    background: var(--shell-panel);
    border-bottom: 1px solid var(--shell-line);
    scrollbar-width: none;
}

.toolbar::-webkit-scrollbar {
    display: none;
}

.toolbar button {
    flex: none;
    padding: 5px 9px;
    border: none;
    border-radius: 6px;
    background: transparent;
    font-size: 13px;
    white-space: nowrap;
    color: var(--shell-fg-2);
    cursor: pointer;
}

.toolbar button:hover:not(:disabled) {
    background: var(--shell-hover);
}

.toolbar button:disabled {
    opacity: 0.55;
    color: var(--shell-muted);
    cursor: not-allowed;
}

/* 插入组（工单 03 前置直达）：亮色引导最高频动作 */
.toolbar button.tb-ins {
    color: var(--shell-insert);
}

.toolbar-divider {
    flex: none;
    width: 1px;
    height: 18px;
    margin: 0 2px;
    background: var(--shell-line);
}

/* 工作台（工单 05）：1fr 行垂直撑满 + 去 1240px 锁宽全宽；水平 10px 呼吸沿原型。
   垂直零留白是验收基线的算术前提——1440×900 下画布区 = 900−48−44−30 = 778px，
   995×1464 fit（留 48 呼吸边）预览高 ≈682px（较 484px +41%）。min-height 0 允许
   小视口压缩：面板自内滚（组件自带 overflow-y-auto），画布缩小，页面不滚。 */
.workbench {
    display: flex;
    gap: 10px;
    min-width: 0;
    min-height: 0;
    padding: 0 10px;
}

/* 状态栏（工单 01 读数归口 + 工单 05 壳层）：全宽底边条（去 1240px 锁宽与浮动
   圆角），宿主只做几何——组件自带暗色令牌零改动 */
.statusbar {
    width: 100%;
    border-radius: 0;
    border-top: 1px solid var(--shell-line);
}

/* 工单 04：画布容器 = 缩放浮条的定位上下文。flex:1 从 .surface 移到本层，
   surface 以 100% 填满；浮条是 surface 的兄弟元素（见模板注释） */
.canvas-area {
    position: relative;
    flex: 1;
    min-width: 0;
}

.workbench .surface {
    border: 1px solid var(--shell-line);
    border-radius: 12px;
    background: var(--shell-desktop); /* 画布外的「桌面」暗底：平移出界可辨、纸面突出 */
    overflow: hidden;
}

.surface {
    width: 100%;
    height: 100%;
    border-radius: 11px;
}

/* 缩放浮条（工单 04）：定位与点击隔离依据见模板注释（canvas-area 挂点）。
   暗色原为工单 04 按原型内联的字面量，工单 05 吸收为 .stage 级联令牌（同值），
   并补原型浮条的投影与毛玻璃（浮于暗色桌面上增加层次）。 */
.zoom-float {
    position: absolute;
    right: 14px;
    bottom: 14px;
    z-index: 10;
    display: flex;
    align-items: center;
    padding: 5px 8px;
    border: 1px solid var(--shell-line-strong);
    border-radius: 9px;
    background: var(--shell-panel-92);
    box-shadow: 0 10px 26px rgb(0 0 0 / 0.45);
    backdrop-filter: blur(4px);
    user-select: none;
}

/* 分组：缩放步进（− % ＋）/ 适应族（适应画布/适应选区）/ 复位（1:1），
   组间分隔线沿用原型 .float .fg 语义 */
.zoom-float__group {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 6px;
    border-right: 1px solid var(--shell-line-strong);
}

.zoom-float__group:last-child {
    border-right: 0;
}

.zoom-float__key {
    display: grid;
    place-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 2px;
    border: none;
    border-radius: 6px;
    background: transparent;
    font-size: 14px;
    line-height: 1;
    color: var(--shell-fg);
    cursor: pointer;
}

.zoom-float__key--text {
    padding: 0 8px;
    font-size: 12px;
}

.zoom-float__key:hover {
    background: var(--shell-hover);
}

/* 只读百分比：等宽字体 + 表格数字（与状态栏缩放段同一呈现口径） */
.zoom-float__pct {
    min-width: 46px;
    text-align: center;
    font-family: var(--shell-font-mono);
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    color: var(--shell-fg);
}

/* 帮助抽屉（工单 02）：宿主级浮层，右缘滑出面板 + 半透明遮罩；Teleport 到 body，
   fixed 定位不占文档流。工单 05 暗色统一落定：面板族令牌自带一份（Teleport 出
   .stage 不级联，同值块见 .stage 注释）。 */
.help-overlay {
    --shell-panel: #0b1220;
    --shell-line: #1e2a40;
    --shell-line-strong: #2a3a58;
    --shell-fg: #e6edf7;
    --shell-fg-2: #c3cddd;
    --shell-fg-3: #aab6c8;
    --shell-muted: #7c8ca5;

    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    justify-content: flex-end;
    background: rgb(2 6 23 / 0.6);
}

.help-drawer {
    display: flex;
    flex-direction: column;
    width: min(560px, 92vw);
    height: 100%;
    background: var(--shell-panel);
    border-left: 1px solid var(--shell-line);
    box-shadow: -12px 0 32px rgb(0 0 0 / 0.5);
    outline: none;
}

.help-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: none;
    padding: 10px 16px;
    border-bottom: 1px solid var(--shell-line);
}

.help-head h2 {
    margin: 0;
    font-size: 15px;
    color: var(--shell-fg);
}

.help-close {
    padding: 4px 10px;
    border: 1px solid var(--shell-line);
    border-radius: 8px;
    background: transparent;
    font-size: 13px;
    color: var(--shell-fg-3);
    cursor: pointer;
}

.help-close:hover {
    border-color: var(--shell-line-strong);
    color: var(--shell-fg);
}

.help-body {
    display: flex;
    flex-direction: column;
    gap: 22px;
    flex: 1;
    overflow-y: auto;
    padding: 14px 16px 28px;
}

.help-section h3 {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--shell-muted);
}

.help-section ul {
    margin: 0;
    padding: 0 0 0 18px;
    font-size: 12px;
    line-height: 1.9;
    color: var(--shell-fg-3);
}

.help-section b {
    color: var(--shell-fg-2);
}

.help-ticket {
    margin: 0 0 10px;
    font-size: 12px;
    line-height: 1.8;
    color: var(--shell-fg-3);
}

.help-dev-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.help-dev-actions button {
    padding: 4px 10px;
    border: 1px solid var(--shell-line);
    border-radius: 8px;
    background: transparent;
    font-size: 13px;
    color: var(--shell-fg-3);
    cursor: pointer;
}

.help-dev-actions button:hover {
    border-color: var(--shell-line-strong);
    color: var(--shell-fg);
}
</style>
