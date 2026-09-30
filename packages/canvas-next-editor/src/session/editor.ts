/**
 * EditorSession：headless 编辑会话——store 之上的渲染调度面（工单 05）。
 *
 * 职责（impl 研究文档 §2.1 的「双 canvas + 单 rAF 合帧 + 脏标」）：
 * - store 订阅 → 分层脏标（doc/视口 → 双层；后续工单的选择/gizmo 只脏覆盖层）
 *   → 注入的帧调度器合帧，每屏帧至多一次重绘；rAF 由绑定层注入，内核保持无 DOM。
 * - 内容层重绘驱动五原语模板（renderCanvas），视口变换喂给后端的可选能力口；
 * - 覆盖层（gizmo）绘制经 OverlayPainter 缝交给宿主：入参是与内容层一致的
 *   呈现视口（已对齐物理像素），由宿主自行施加变换后绘制；本层只保证
 *   「覆盖层脏不触发内容层」与两侧视口的一致性。
 * - 相机动作全部经 camera.ts 纯函数落到 store.ui.viewport（不进历史）。
 */
import {
    docPathToViewPath,
    lineHeightPx,
    renderCanvas,
    textOrigin,
    viewPathToDocPath,
    withTemplatePreview,
    type Canvas,
    type HorizontalAlign,
    type Padding,
    type RenderBackend,
    type TextLayoutPolicies,
    type TextLayer,
    type VerticalAlign,
} from '@hankchen/canvas-next'
import type { PreviewViewportTransform, ViewportAwareBackend } from '@hankchen/canvas-next-browser-renderer'
import type { Draft } from 'immer'
import {
    DEFAULT_ZOOM_BOUNDS,
    fitRect,
    fitViewport,
    nextZoomByWheel,
    panBy,
    screenToScene,
    snapViewportToPhysicalPixels,
    zoomAtPoint,
    type Point,
    type Size,
    type Viewport,
    type ZoomBounds,
} from '../spatial/camera'
import type { LayerBox, Layer, LayerType, ImageLayer } from '@hankchen/canvas-next'
import { hitTest as hitTestAt } from '../spatial/hitTest'
import {
    resolveSnap,
    snapAxesFromBoxes,
    snapThresholdScene,
    visibleRootBoxes,
    type Guide,
    type GuideOrientation,
    type SnapAxis,
} from '../spatial/snap'
import {
    isTemplateSubtreePath,
    layerBoxByPath,
    isRootLayerPath,
    pathStartsWith,
    pathsEqual,
    remapPathAfterSplice,
    resolveLayer,
    selectionParentPath,
    type LayerPath,
} from '../shared/layerPath'
import { normalizeExpressionSchemaSource } from '../shared/expressionSchema'
import {
    ALIGN_CORNER_MARGIN_PX,
    alignToCanvasTarget,
    type AlignToCanvasMode,
    type AlignToCanvasOptions,
} from '../editing/alignCanvas'
import {
    PASTE_OFFSET_PX,
    canCopyLayerAt,
    cloneLayerSubtree,
    prepareRootPaste,
} from '../editing/clipboard'
import {
    addRootLayerInDraft,
    createTemplateTable,
    deleteLayerInDraft,
    insertRootLayerInDraft,
    moveRootLayerInDraft,
    moveTableRowInDraft,
    type DeletedLayerRef,
} from '../editing/layerPanel'
import {
    addTableCellInDraft,
    addTableRowInDraft,
    addTemplateCellInDraft,
    canonicalizeTableSyncInDraft,
    convertTableToRowsInDraft,
    convertTableToTemplateInDraft,
    moveTableCellInDraft,
    moveTableCellToRowInDraft,
    moveTableRowToTableInDraft,
    setCellAutoHeightInDraft,
    type MovedSubtreeRef,
} from '../editing/tableEditing'
import { EditorStore, type EditorChange, type TransactOptions } from './store'
import type { EditorShortcutAction } from './shortcuts'
import { FontCatalog, type FontCatalogEntry } from '../editing/fontCatalog'
import { UploadHandlerMissingError, uploadDisplayName, type UploadFile, type UploadHandler } from '../editing/upload'

/** transact 回调向外传值的容器：TS 会把闭包内赋值的 let 窄化回初值类型，盒属性访问不受影响 */
type TxOut<T> = { v: T }

/** 沿字段路径下降写入（中间段悬空即放弃；尾段原位赋值，immer draft 语义下生效） */
function writeSpecField(target: Record<string, unknown>, key: readonly string[], value: unknown): void {
    let node = target
    for (let i = 0; i < key.length - 1; i += 1) {
        const next: unknown = node[key[i]!]
        if (next === null || typeof next !== 'object') return
        node = next as Record<string, unknown>
    }
    node[key[key.length - 1]!] = value
}

/** 帧调度器：返回取消函数（绑定层注入 requestAnimationFrame 的包装） */
export type FrameScheduler = (callback: () => void) => () => void

/** 覆盖层绘制缝的入参：viewport 已对齐物理像素（与内容层同一呈现视口） */
export interface OverlayPaintArgs {
    viewport: Viewport
    dpr: number
    doc: Canvas | null
}

export type OverlayPainter = (args: OverlayPaintArgs) => void

export type InvalidateTarget = 'content' | 'overlay' | 'both'

/**
 * 文本编辑 overlay 的布局描述（textEditLayout 的产物）：场景坐标系的盒几何与
 * 排版字段。CSS 换算（transform 缩放/字体族解析/行盒模型）归绑定层，内核保持
 * 无 CSS 语义。
 */
export interface TextEditLayout {
    /** 编辑中图层的绝对盒（场景坐标；textarea 覆盖整盒，文字按 padding 内缩） */
    box: LayerBox
    /** 进入编辑时的文档文本（textarea 初值） */
    text: string
    /** 原始字体引用（空串/纯数字 = 内置默认字体；URL 由绑定层解析注册族名） */
    font: string
    fontColor: string
    /** 场景字号（textarea 字号固定取它，缩放交给 CSS transform——字号视觉恒定） */
    fontSize: number
    /** 行高像素 = ceil(fontSize × lineHeight)，与布局层同式 */
    lineHeightPx: number
    padding: Padding
    horizontalAlign: HorizontalAlign
    verticalAlign: VerticalAlign
    /**
     * 首行绘制锚点相对内容盒顶部的偏移（textOrigin.y，与 canvas 绘制同一数值）。
     * 锚点语义随 verticalAlign：top = 字形盒顶、center = 字形盒心、bottom = 字形盒底
     * （渲染端以字体 metrics 消化基线差，绑定层的 CSS 行盒换算须按同一语义折算，
     * 不能直接当 padding-top 用——否则 center/bottom 会差半行/一行）。
     */
    verticalAnchorY: number
    /** autowrap = textarea  pre-wrap 软换行，否则 pre 单行（断行允许与预览不同，决策 A） */
    autowrap: boolean
}

/** 拖动事务的合并键：一次拖动的全部 pointermove 并成一步历史 */
const DRAG_MERGE_KEY = 'drag'

export interface EditorSessionOptions {
    scheduleFrame: FrameScheduler
    /** 缩放范围（可配置，缺省 5%–800%） */
    zoomBounds?: ZoomBounds
    /** 适应画布时的屏幕像素内缩（缺省 0：画布边贴视口边） */
    fitMargin?: number
    /** 文本布局策略（断行/度量注入缝，缺省启发式对齐版） */
    textPolicies?: TextLayoutPolicies
    /**
     * 上传实现注入点（工单 13）：本机资源 → 可物化引用。core 不内置任何实现；
     * 未注入时 canUpload 为 false、上传动作抛 UploadHandlerMissingError（宿主
     * 据此做降级提示），生产宿主接自己的存储，playground 以 data URL 兜底。
     */
    uploadHandler?: UploadHandler
    /** 内置字体清单（URL 列表可配置；缺省空清单，清单 ≠ 物化，加载走渲染端管线） */
    fontCatalog?: readonly FontCatalogEntry[]
}

export class EditorSession {
    readonly store: EditorStore

    private readonly scheduleFrame: FrameScheduler
    private readonly zoomBounds: ZoomBounds
    private readonly fitMargin: number
    /**
     * 生效的文本布局策略（构造注入值，缺省 undefined = 启发式对齐版）：公开只读，
     * 供导出等旁路面复用同一注入值——导出与编辑画布的断行/盒高才不分叉（工单 13）。
     */
    readonly textPolicies?: TextLayoutPolicies
    private readonly uploadHandler: UploadHandler | null
    private readonly fontCatalogValue: FontCatalog

    private backend: RenderBackend | null = null
    private overlayPainter: OverlayPainter | null = null
    private dpr = 1
    private surfaceSize: Size = { width: 0, height: 0 }
    private dirty = { content: false, overlay: false }
    private frameQueued = false
    private cancelFrame: (() => void) | null = null
    private readonly unsubscribeStore: () => void
    /**
     * 预览视图 memo（决策 2026-09）：模板态表格实例化一行预览行的文档衍生画布，
     * 画布渲染/命中/导出消费，永不写回 graph（红线 3 延伸）。Canvas 不可变 +
     * 结构共享，doc 引用相等即视图仍有效（与 skipContent 的引用比较同纪律）。
     */
    private previewSource: Canvas | null = null
    private previewValue: Canvas | null = null
    /**
     * 会话级剪贴板（工单 14）：复制源的子树深拷贝快照 + 复制时点绝对盒（粘贴落位
     * 基准，格内容的格内相对 position 据此换算画布绝对落位）+ 连续粘贴计数。
     * 不跨会话、不碰 OS 剪贴板；openDocument 不清空——粘贴进另一份文档是合法用法
     * （条目是与源树断开引用的普通对象）。
     */
    private clipboardEntry: { layer: Layer; sourceBox: LayerBox; pasteCount: number } | null = null
    /** 参考线 id 自增序（会话内唯一即可，不持久化——参考线不写 graph） */
    private guideIdSeq = 0

    constructor(options: EditorSessionOptions) {
        this.scheduleFrame = options.scheduleFrame
        this.zoomBounds = options.zoomBounds ?? DEFAULT_ZOOM_BOUNDS
        this.fitMargin = options.fitMargin ?? 0
        this.textPolicies = options.textPolicies
        this.uploadHandler = options.uploadHandler ?? null
        this.fontCatalogValue = new FontCatalog(options.fontCatalog)
        this.store = new EditorStore()
        this.unsubscribeStore = this.store.subscribe((change) => this.onStoreChange(change))
    }

    // ---- 组装与呈现参数（DOM 侧由绑定层调用） ----

    attachContentBackend(backend: RenderBackend): void {
        this.backend = backend
        this.invalidate('content')
    }

    setOverlayPainter(painter: OverlayPainter | null): void {
        this.overlayPainter = painter
        this.invalidate('overlay')
    }

    /** 解绑绘制面（surface 卸载时）；挂起帧 flush 空转，可重新挂载 */
    detachSurfaces(): void {
        this.backend = null
        this.overlayPainter = null
    }

    setDevicePixelRatio(dpr: number): void {
        if (dpr === this.dpr) return
        this.dpr = dpr
        // 物理缓冲语义变更：内容与覆盖层缓冲都需重设后重绘
        this.invalidate('both')
    }

    setSurfaceSize(width: number, height: number): void {
        if (width === this.surfaceSize.width && height === this.surfaceSize.height) return
        this.surfaceSize = { width, height }
        this.invalidate('both')
    }

    getSurfaceSize(): Readonly<Size> {
        return this.surfaceSize
    }

    // ---- 相机动作（视口 {x, y, zoom} 走 ui 分支，不进历史） ----

    /** 打开/替换文档（转发 store；解码在宿主侧完成，内核只消费领域结构） */
    openDocument(canvas: Canvas): void {
        this.store.openDocument(canvas)
    }

    /**
     * 预览视图（只读衍生）：模板态表格在视图中获得一行预览行（文本格 = 表达式
     * 原文、标记图片/二维码格走占位盒），渲染/命中/导出据此呈现「一行输出效果」；
     * 文档本身不被改写。宿主（如导出）与内核内部共用同一 memo。
     */
    get previewCanvas(): Canvas | null {
        const doc = this.store.doc
        if (doc === null) return null
        if (doc !== this.previewSource) {
            this.previewValue = withTemplatePreview(doc, this.textPolicies)
            this.previewSource = doc
        }
        return this.previewValue
    }

    /** 平移：屏幕位移按 zoom 折算 */
    panBy(deltaScreenX: number, deltaScreenY: number): void {
        this.store.setViewport(panBy(this.store.ui.viewport, deltaScreenX, deltaScreenY))
    }

    /** 缩放至指定倍率，以屏幕点（视口坐标系的 css 像素）为锚 */
    zoomAt(screenX: number, screenY: number, nextZoom: number): void {
        this.store.setViewport(zoomAtPoint(this.store.ui.viewport, screenX, screenY, nextZoom, this.zoomBounds))
    }

    /** 滚轮/捏合：曲线见 camera.nextZoomByWheel，缩放以指针为中心 */
    zoomByWheel(screenX: number, screenY: number, deltaY: number): void {
        const viewport = this.store.ui.viewport
        const nextZoom = nextZoomByWheel(viewport.zoom, deltaY, this.zoomBounds)
        this.store.setViewport(zoomAtPoint(viewport, screenX, screenY, nextZoom, this.zoomBounds))
    }

    /** 一键适应画布：整页可见、居中（表面尺寸未知时 no-op） */
    fitToSurface(): void {
        const doc = this.store.doc
        if (!doc || this.surfaceSize.width <= 0 || this.surfaceSize.height <= 0) return
        this.store.setViewport(fitViewport(doc, this.surfaceSize, this.zoomBounds, this.fitMargin))
    }

    /**
     * 路径处图层盒：模板子树路径经预览视图解析（auto 高在视图里合成，文档侧
     * 声明高为零），其余路径直接解析文档——非模板子树结构共享，两棵树同盒。
     * gizmo/命中/适应选区/文本编辑 overlay 共用，与绘制不漂移。
     */
    private boxByPath(path: LayerPath): LayerBox | null {
        const doc = this.store.doc
        if (!doc) return null
        if (isTemplateSubtreePath(path)) {
            const view = this.previewCanvas
            const viewPath = view ? docPathToViewPath(doc, path) : null
            return view && viewPath ? layerBoxByPath(view, viewPath as LayerPath, this.textPolicies) : null
        }
        return layerBoxByPath(doc, path, this.textPolicies)
    }

    /** 自适应选区视图：视口适配选中盒；无选择/退化盒回落适应画布 */
    fitToSelection(): void {
        const doc = this.store.doc
        if (!doc) return
        const selection = this.store.ui.selection
        const box = selection ? this.boxByPath(selection) : null
        if (!box || box.width <= 0 || box.height <= 0 || this.surfaceSize.width <= 0 || this.surfaceSize.height <= 0) {
            this.fitToSurface()
            return
        }
        this.store.setViewport(fitRect(box, this.surfaceSize, this.zoomBounds, this.fitMargin))
    }

    // ---- 选择与拖动（工单 06）：命中/选择/拖动几何全部经内核纯函数 ----

    /** 屏幕（css 像素）→ 场景：绑定层的唯一坐标入口（zoom 折算收口在此） */
    toScenePoint(screenX: number, screenY: number): Point {
        return screenToScene(this.store.ui.viewport, screenX, screenY)
    }

    /**
     * 场景点命中查询（不产生副作用）：在预览视图上执行——模板态表格的预览行
     * 可命中，命中路径经视图→文档映射落回模板子树身份（选中/属性编辑写文档）。
     */
    hitTest(sceneX: number, sceneY: number): LayerPath | null {
        const view = this.previewCanvas
        if (!view) return null
        const hit = hitTestAt(view, sceneX, sceneY, this.textPolicies)
        if (hit === null) return null
        const docPath = viewPathToDocPath(view, hit)
        return docPath ? (docPath as LayerPath) : null
    }

    /** 路径处图层的绝对盒（gizmo 选择框与后续面板共用；与命中同一布局策略） */
    layerBoxAt(path: LayerPath): LayerBox | null {
        return this.boxByPath(path)
    }

    /** 点选：命中即选中并返回路径，未中清空选择（画布与后续面板同源） */
    selectAt(sceneX: number, sceneY: number): LayerPath | null {
        const path = this.hitTest(sceneX, sceneY)
        this.store.setSelection(path)
        return path
    }

    /** 直接设置选择（面板/键盘入口） */
    setSelection(path: LayerPath | null): void {
        this.store.setSelection(path)
    }

    /** Escape 升级：沿归属链 cell→row→table 逐级取父，链尽清空选择 */
    escapeSelection(): void {
        const selection = this.store.ui.selection
        if (!selection) return
        this.store.setSelection(selectionParentPath(selection))
    }

    /** 悬停命中（指针移动时调用；离场传 null 或用 setHovered） */
    hoverAt(sceneX: number, sceneY: number): void {
        this.store.setHovered(this.hitTest(sceneX, sceneY))
    }

    /** 设置悬停路径 */
    setHovered(path: LayerPath | null): void {
        this.store.setHovered(path)
    }

    /**
     * 开始拖动会话：记录目标路径、起点场景坐标、起始 position 偏移与起始盒
     * （吸附求位基准，ui 分支）。已在拖动中、路径或盒几何无法解析时返回 false。
     */
    beginDrag(path: LayerPath, sceneX: number, sceneY: number): boolean {
        if (this.store.ui.drag) return false
        const doc = this.store.doc
        const layer = doc ? resolveLayer(doc, path) : null
        if (!layer) return false
        const box = this.boxByPath(path)
        if (!box) return false
        this.store.setDrag({
            path,
            startScene: { x: sceneX, y: sceneY },
            startPosition: { x: layer.position.x, y: layer.position.y },
            startBox: box,
        })
        return true
    }

    /**
     * 拖动进行中：position = 起点 + 场景位移，再按吸附修正（工单 01，ADR 0012）。
     * 吸附求位：暂定盒（startBox + 本步位移）九点对轴集合——其他可见根层盒缘与
     * 中心、画布水平/垂直中轴、参考线轴——屏幕 6px 阈值按当前缩放换算场景值，
     * 多轴取最近，至多一垂直 + 一水平；修正并入同一位置事务（同一 mergeKey，
     * 跟随拖动既有历史合并语义）。命中的吸附轴回写会话态供吸附线呈现（瞬时
     * 回显，endDrag 清空）。九锚点一视同仁——锚点偏移不动，只累加 x/y（x += dx/
     * zoom 的 zoom 折算已由 toScenePoint 收口）；一次拖动的全部位移经同 mergeKey
     * 事务并成一步历史，属性面板读同一文档数据即联动。
     */
    dragTo(sceneX: number, sceneY: number): void {
        const drag = this.store.ui.drag
        if (!drag) return
        // 拖动中图层被结构编辑移除的边缘态：整个求位空转（不发事务、不发布命中轴）
        const doc = this.store.doc
        if (!doc || resolveLayer(doc, drag.path) === null) return
        const dx = sceneX - drag.startScene.x
        const dy = sceneY - drag.startScene.y
        const resolution = resolveSnap(
            {
                x: drag.startBox.x + dx,
                y: drag.startBox.y + dy,
                width: drag.startBox.width,
                height: drag.startBox.height,
            },
            this.snapAxesForDrag(drag.path),
            snapThresholdScene(this.store.ui.viewport.zoom),
        )
        this.store.transact((draft) => {
            const layer = resolveLayer(draft, drag.path)
            if (!layer) return
            // immer draft 原位写 position；类型层的 readonly 由 draft 语义解除
            const position = layer.position as { x: number; y: number }
            position.x = drag.startPosition.x + dx + resolution.dx
            position.y = drag.startPosition.y + dy + resolution.dy
        }, { mergeKey: DRAG_MERGE_KEY })
        this.store.setSnapAxes(resolution.axes)
    }

    /** 结束拖动：闭合合并事务（下一步历史定格），会话态与命中轴回显清空 */
    endDrag(): void {
        if (!this.store.ui.drag) return
        this.store.setDrag(null)
        this.store.setSnapAxes([])
        this.store.closeMerge(DRAG_MERGE_KEY)
    }

    /**
     * 拖动层可用的吸附轴集合（dragTo 每步重算，几何与其余消费同源）：可见根层盒
     * （hitTest 同款 visible 过滤）排除拖动层自身根 + 画布中轴 + 当前参考线。
     */
    private snapAxesForDrag(dragPath: LayerPath): readonly SnapAxis[] {
        const doc = this.store.doc
        if (!doc) return []
        const excludeRootIndex = dragPath[1]
        if (typeof excludeRootIndex !== 'number') return []
        return snapAxesFromBoxes(
            doc.width,
            doc.height,
            visibleRootBoxes(doc, excludeRootIndex, this.textPolicies),
            this.store.ui.guides,
        )
    }

    /** 当次拖动命中的吸附轴（只读查询，吸附线呈现消费）；非拖动态/未命中为空 */
    listSnapAxes(): readonly SnapAxis[] {
        return this.store.ui.snapAxes
    }

    // ---- 参考线与标尺（ruler-guides-snap 工单 01）：会话态住 ui 分支，零契约面 ----

    /**
     * 新增参考线（标尺拖出落线的写入口，工单 03 消费）：水平/垂直轴、场景坐标。
     * 住 ui 分支——不进历史、不写 graph（ADR 0012）；id 会话内自增供删除寻址。
     * 非有限坐标空转返回 null（绑定层异常输入防御，不产生通知）。
     */
    addGuide(guide: { orientation: GuideOrientation; position: number }): Guide | null {
        if (!Number.isFinite(guide.position)) return null
        const stored: Guide = { id: ++this.guideIdSeq, orientation: guide.orientation, position: guide.position }
        this.store.setGuides([...this.store.ui.guides, stored])
        return stored
    }

    /** 删除参考线（拖回标尺语义）：按 id 移除；未知 id 空转返回 false */
    removeGuide(id: number): boolean {
        const guides = this.store.ui.guides
        const next = guides.filter((guide) => guide.id !== id)
        if (next.length === guides.length) return false
        this.store.setGuides(next)
        return true
    }

    /** 参考线列表（只读查询，呈现与吸附供轴同源） */
    listGuides(): readonly Guide[] {
        return this.store.ui.guides
    }

    /** 标尺显隐开关（⇧R 分派口）：翻转 ui 偏好，不进历史 */
    toggleRulers(): void {
        this.store.setRulersVisible(!this.store.ui.rulersVisible)
    }

    // ---- 对齐画布（layer-align-snap 工单 01）：图层盒整体对齐画布几何 ----

    /**
     * 对齐画布 action 族（对齐画布/贴边/贴角，ADR 0011）：把 path 处图层盒整体
     * 对齐到画布几何——mode 十种：贴边 left/right/top/bottom（零边距）、居中
     * h-center/v-center、贴角 corner-tl/tr/bl/br（opts.margin 统一边距，缺省
     * ALIGN_CORNER_MARGIN_PX）。与属性面板「盒内对齐」（写 align 字段移动盒内
     * 内容）是两类动作，并存不回退。
     * 几何以 layerBoxAt(path) 解析的图层盒为唯一来源、画布尺寸取 doc.canvas；
     * 盒坐标对 position 线性（box = origin + anchorOffset + position），「目标
     * 盒坐标 − 当前盒坐标」的位移原样写 position 偏移、anchor 不动；盒大于画布
     * 不钳位（偏移可为负的领域语义，溢出侧按公式确定）。一次调用 = 一步历史
     * （无 mergeKey，连续点击不合并）；已对齐（零位移）经 store 空 patch 短路
     * 不进历史；文档未打开/路径不可解析/未知 mode 空转（无历史步）。
     */
    alignToCanvas(path: LayerPath, mode: AlignToCanvasMode, options: AlignToCanvasOptions = {}): void {
        const doc = this.store.doc
        if (!doc) return
        const box = this.boxByPath(path)
        if (!box) return
        const target = alignToCanvasTarget(
            mode,
            box,
            doc.width,
            doc.height,
            options.margin ?? ALIGN_CORNER_MARGIN_PX,
        )
        if (!target) return
        const dx = target.x - box.x
        const dy = target.y - box.y
        this.store.transact((draft) => {
            const layer = resolveLayer(draft, path)
            if (!layer) return
            // draft 语义解除 readonly；盒位移与 position 位移一一对应（斜率 1）
            const position = layer.position as { x: number; y: number }
            position.x += dx
            position.y += dy
        })
    }

    // ---- 文本编辑会话（工单 11）：会话住 ui 分支，提交经漏斗一次性落文档 ----

    /**
     * 进入文本编辑：路径必须解析到 TextLayer。会话只进 ui 分支（不进历史），
     * live 文本住在绑定层的 textarea，内容层随即跳绘该层文本（防重影）。
     */
    beginTextEdit(path: LayerPath): boolean {
        if (this.textLayerAt(path) === null) return false
        const current = this.store.ui.editing
        if (current && pathsEqual(current.path, path)) return true
        this.store.setEditing({ path })
        return true
    }

    /**
     * 提交漏斗的统一出口：Esc / Ctrl+Enter / blur / 点画布他处四条退出路径都收拢
     * 到这里。先清会话再落文档——退出路径可能级联触发（画布点按的 pointerdown
     * 提交与随后 blur 竞态），会话清空后后续调用幂等，保证一次退出恰一步历史。
     *
     * - 文本与文档一致：不进历史（进出编辑零噪声），返回 false；
     * - 空文本：删除该图层（复用 deleteLayer 的 splice/重映射语义），一步历史可撤销；
     * - 其余：一次无 mergeKey 事务写入 text（独立步，不并入开启中的拖动/滑杆合并）。
     */
    commitTextEdit(text: string): boolean {
        const editing = this.store.ui.editing
        if (!editing) return false
        this.store.setEditing(null)

        const layer = this.textLayerAt(editing.path)
        if (!layer) return false
        if (text === layer.text) return false
        if (text === '') {
            this.deleteLayer(editing.path)
            return true
        }
        this.updateData(editing.path, text)
        return true
    }

    /**
     * 编辑 overlay 的布局描述：与绘制/命中同一套布局策略求出的盒几何与排版字段
     * （textarea 以盒左上对位、盒尺寸占位，字号/行高/内边距按场景像素交给 CSS
     * transform 缩放）。verticalAnchorY 按进入编辑时的文档文本计算，编辑中保持
     * 稳定不随键入跳动。非文本层/路径失效返回 null。
     */
    textEditLayout(path: LayerPath): TextEditLayout | null {
        const layer = this.textLayerAt(path)
        const doc = this.store.doc
        if (!layer || !doc) return null
        const box = this.boxByPath(path)
        if (!box) return null
        return {
            box,
            text: layer.text,
            font: layer.font,
            fontColor: layer.fontColor,
            fontSize: layer.fontSize,
            lineHeightPx: lineHeightPx(layer),
            padding: layer.shape.padding,
            horizontalAlign: layer.align.horizontal,
            verticalAlign: layer.align.vertical,
            verticalAnchorY: textOrigin(layer, this.textPolicies).y,
            autowrap: layer.autowrap,
        }
    }

    /** 编辑会话的目标图层查询：路径须解析到 TextLayer，其余（含无文档）返回 null */
    private textLayerAt(path: LayerPath): TextLayer | null {
        const doc = this.store.doc
        const layer = doc ? resolveLayer(doc, path) : null
        return layer && layer.type === 'TextLayer' ? layer : null
    }

    // ---- 属性写入（工单 09）：面板零直改，一切文档字段编辑经这三个 action ----

    /**
     * 更新图层 spec 子树字段（属性面板的权威写入口）：key 为图层内字段路径
     * （领域形态，如 ['shape','backgroundColor']、['position','x']、单段 ['fontSize']），
     * 拼上图层路径即 patch path。数值收整/钳位等取值策略由注册表层负责，内核透传。
     * 路径无法解析或字段悬空时静默空转；连续输入经 mergeKey 合并为一步历史。
     *
     * 表格子树的权威收口（工单 12）：格 autoHeight 是带重算的切换（采纳内容动态高
     * 并固化，非裸标志写）；其余写入后按解码强同步的不变量重断言（行宽=表宽、
     * 内容宽/高重同步、行高取最高格）——往返恒等在任何字段编辑后不破。
     */
    updateSpec(path: LayerPath, key: readonly string[], value: unknown, options: TransactOptions = {}): void {
        this.store.transact((draft) => {
            const layer = resolveLayer(draft, path)
            if (!layer) return
            // 模板格跳过采纳语义（决策 2026-09）：模板态高度耦合全豁免（ADR 0006，
            // 解码对声明高/autoHeight 原样保留、仅 auto 标志清零声明高），下方裸写 +
            // 归一即解码同门；非模板格的带重算切换不适用
            if (
                layer.type === 'TableCellLayer'
                && !isTemplateSubtreePath(path)
                && key.length === 2
                && key[0] === 'shape'
                && key[1] === 'autoHeight'
            ) {
                setCellAutoHeightInDraft(draft, path, Boolean(value), this.textPolicies)
                return
            }
            // draft 语义解除 readonly；字段形态由注册表与领域类型把关，内核透传
            writeSpecField(layer as unknown as Record<string, unknown>, key, value)
            // 解码不变量：autoHeight 置位即声明高归零（decodeBase 对 auto 标志恒清零，
            // PHP setHeight('auto') 同门；文本层由布局按行数×行高+padding 动态求高，
            // 其余类型按各自兜底）——否则保存再打开声明高被清，往返恒等破。
            // 格的 autoHeight 写入已在上方拦截（采纳/固化语义），不会走到这里。
            if ((layer as { shape?: { autoHeight?: boolean } }).shape?.autoHeight === true) {
                ;(layer as { shape: { height: number } }).shape.height = 0
            }
            canonicalizeTableSyncInDraft(draft, path, key, this.textPolicies)
        }, options)
    }

    /**
     * 更新图层数据字段（wire data.value 的领域展开，按 type 分派）：
     * TextLayer → text、ImageLayer → src、QrCodeLayer → value；
     * 空串/null 归空语义与解码逐条对齐（Image null、Text/Qr 空串）。
     * 字面写解除标记（工票 02，镜像 PHP 三内容层 setter）：写值即置 expression =
     * null，值与标记的镜像关系随之解除——标记态文档经字面编辑退化为字面态，
     * 不可自动恢复属预期（spec §3.7 兼容面）。
     * 表/行/格无数据字段，空转。
     */
    updateData(path: LayerPath, value: string | null, options: TransactOptions = {}): void {
        this.store.transact((draft) => {
            const layer = resolveLayer(draft, path) as Draft<Layer> | null
            if (!layer) return
            switch (layer.type) {
                case 'TextLayer':
                    layer.text = value == null ? '' : String(value)
                    layer.expression = null
                    break
                case 'ImageLayer':
                    layer.src = value == null || value === '' ? null : String(value)
                    layer.expression = null
                    break
                case 'QrCodeLayer':
                    layer.value = value == null ? '' : String(value)
                    layer.expression = null
                    break
                default:
                    break
            }
        }, options)
    }

    /**
     * 数据字段表达式标记写入口（打标/解标，spec：canvas-web-expression-marking §1；
     * 镜像 PHP 三内容层 setExpression 与 decode 标记/未标记分支）：
     * - expression 非 null = 打标：expression 原文 + 值字段恒镜像原文（Text.text /
     *   Image.src / QrCode.value）；标记态不做空串 →null 归一（decodeImageLayer
     *   标记分支同门）。
     * - expression = null = 解标：值字段保持现值退字面，`expression = null`；
     *   字面态空值归一交给 updateData/decode 分支（这里不清值，字面接管语义）。
     * - 仅三内容层生效，表/行/格/行模板空转（与 updateData 同门）。
     * - updateData 语义不变：字面写解除标记仍成立（spec §1 明示两者并排）。
     */
    updateDataExpression(path: LayerPath, expression: string | null, options: TransactOptions = {}): void {
        this.store.transact((draft) => {
            const layer = resolveLayer(draft, path) as Draft<Layer> | null
            if (!layer) return
            switch (layer.type) {
                case 'TextLayer':
                    layer.expression = expression == null ? null : String(expression)
                    if (layer.expression !== null) layer.text = layer.expression
                    break
                case 'ImageLayer':
                    layer.expression = expression == null ? null : String(expression)
                    if (layer.expression !== null) layer.src = layer.expression
                    break
                case 'QrCodeLayer':
                    layer.expression = expression == null ? null : String(expression)
                    if (layer.expression !== null) layer.value = layer.expression
                    break
                default:
                    break
            }
        }, options)
    }

    /** 更新画布级字段（未选中图层时面板的宽/高写入口）；键由类型收窄为 width/height */
    updateCanvasProp(key: 'width' | 'height', value: number, options: TransactOptions = {}): void {
        this.store.transact((draft) => {
            draft[key] = value
        }, options)
    }

    // ---- 数据源 schema 声明（content-completion 工单 03）：D2 宿主随会话注入 ----

    /**
     * 注入数据源 schema 声明（载荷形态，D1 钉定：声明即 compile(canvas, dataset)
     * 收到的 data 载荷形状，根上下文候选 = 载荷顶层键）。声明期校验经
     * normalizeExpressionSchemaSource 一次性收口——根级保留键（row/$ 前缀，前移
     * 填充期 reserved_root_key）或形态非法降级为无候选 + console 警告，不抛错不
     * 弹错（辅助声明不作权威）；null/undefined = 清除声明。声明只住 store ui 分支：
     * 不进 graph、不落 localStorage、不进 wire；openDocument 换文档不重置，
     * 重注入/清除走同一入口。
     */
    setDataSourceSchema(raw: unknown): void {
        this.store.setDataSourceSchema(
            raw === null || raw === undefined ? null : normalizeExpressionSchemaSource(raw),
        )
    }

    // ---- 上传（工单 13）：本机资源 → 可物化引用，实现经 uploadHandler 注入 ----

    /** 上传可用性：未注入 uploadHandler 时为 false（宿主据此隐藏/禁用上传入口） */
    get canUpload(): boolean {
        return this.uploadHandler !== null
    }

    /** 字体清单（内置可配置 + 自定义上传追加；清单 ≠ 物化，加载走渲染端物化管线） */
    get fontCatalog(): FontCatalog {
        return this.fontCatalogValue
    }

    /**
     * 本机图片 → 新增图片图层并写入可物化引用（全流程 = 一步历史）：上传经注入
     * 实现，引用与 addRootLayerInDraft 落同一事务（撤销一次即回退整个上传建层），
     * 完成后自动选中新层。文档未打开直接返回 null（不产生上传副作用——字节不离开
     * 本机）；上传失败异常上抛、文档不动。
     */
    async uploadImageAsLayer(file: UploadFile): Promise<LayerPath | null> {
        if (!this.store.doc) return null
        const ref = await this.requireUpload(file)
        const index: TxOut<number> = { v: -1 }
        this.store.transact((draft) => {
            index.v = addRootLayerInDraft(draft, 'ImageLayer')
            if (index.v < 0) return
            ;(draft.layers[index.v] as Draft<ImageLayer>).src = ref
        })
        if (index.v < 0) return null
        const path: LayerPath = ['layers', index.v]
        this.store.setSelection(path)
        return path
    }

    /**
     * 本机字体 → 可物化引用并加入字体清单（自定义条目，上传后即可选可用）。
     * 不写文档：引用落到哪个文本层由宿主/绑定层决定（属性面板字体控件）。
     */
    async uploadFont(file: UploadFile): Promise<string> {
        const ref = await this.requireUpload(file)
        this.fontCatalogValue.addCustom({ label: uploadDisplayName(file), ref })
        return ref
    }

    private requireUpload(file: UploadFile): Promise<string> {
        if (this.uploadHandler === null) return Promise.reject(new UploadHandlerMissingError())
        return this.uploadHandler(file)
    }

    // ---- 图层面板结构编辑（工单 10）：重排/增删走单一 action，重排两套语义分立 ----

    /**
     * 根层重排（图层面板拖动）：面板坐标（0 = 视觉最上层），to 为 insert-before
     * 落点。数组序 splice + 移动层 priority 中点插值（保持「数组按 priority 降序」
     * 的契约语义，保存再打开顺序不变），一次调用 = 一步历史。语义细节见
     * layerPanel.moveRootLayerInDraft。
     */
    moveRootLayer(fromPanel: number, toPanel: number): void {
        if (!this.store.doc) return
        const moved: TxOut<{ from: number; to: number } | null> = { v: null }
        this.store.transact((draft) => {
            moved.v = moveRootLayerInDraft(draft, fromPanel, toPanel)
        })
        if (moved.v === null) return
        this.remapPathSlices([], 'layers', moved.v.from, moved.v.to)
    }

    /**
     * 表格行重排（图层面板行拖动）：直接改 rows 数组序（容器内嵌套数组序语义，
     * priority 不参与，与根层语义分立），一次调用 = 一步历史。行内后代的选择/
     * 悬停路径随行重映射。
     */
    moveTableRow(tablePath: LayerPath, fromRow: number, toRow: number): void {
        if (!this.store.doc) return
        const moved: TxOut<{ from: number; to: number } | null> = { v: null }
        this.store.transact((draft) => {
            moved.v = moveTableRowInDraft(draft, tablePath, fromRow, toRow)
        })
        if (moved.v === null) return
        this.remapPathSlices(tablePath, 'rows', moved.v.from, moved.v.to)
    }

    /**
     * 新增根层（图层面板「新增」入口）：工厂缺省形态 + 置顶 priority = min − 1
     * （空画布 0），push 到数组尾（视觉最上层）并自动选中新层；一次调用 = 一步历史。
     */
    addRootLayer(type: LayerType): void {
        if (!this.store.doc) return
        const index: TxOut<number> = { v: -1 }
        this.store.transact((draft) => {
            index.v = addRootLayerInDraft(draft, type)
        })
        if (index.v >= 0) this.store.setSelection(['layers', index.v])
    }

    /**
     * 删除图层（含子树）：根层整删、行/格 splice、格内容置 null（语义见
     * layerPanel.deleteLayerInDraft）；选中/悬停落在被删子树内即清空，其余路径
     * 平移重映射。一次调用 = 一步历史。
     * 模板子树删除面（spec §3.2）：cells/content 两级放行（内核两型 union），
     * 仅行模板替身（template 收尾路径）拦截——删行模板 = 表退出模板态，归转换
     * 入口（convertTableToRows），不混入删除。
     */
    deleteLayer(path: LayerPath): void {
        if (!this.store.doc || path[path.length - 1] === 'template') return
        const removed: TxOut<DeletedLayerRef | null> = { v: null }
        this.store.transact((draft) => {
            removed.v = deleteLayerInDraft(draft, path)
        })
        if (removed.v === null) return
        if (removed.v.kind === 'list') {
            this.remapPathSlices(removed.v.containerPath, removed.v.key, removed.v.index, removed.v.index)
            return
        }
        // 格内容删除：无下标平移，命中该路径的选择/悬停清空
        if (pathsEqual(this.store.ui.selection, removed.v.path)) this.store.setSelection(null)
        if (pathsEqual(this.store.ui.hovered, removed.v.path)) this.store.setHovered(null)
    }

    /**
     * 重命名根图层（layer-panel-ux 工单 09）：一次调用 = 一步历史（可撤销）。
     * 仅根图层——行/格是容器内结构（显示层「行 N / 格 N」派生标签），路径非根
     * 或不可解析一律空转（无历史步）；空名 = 回退缺省（文档 name 归空串，
     * wire 键随之省略，显示层回落派生标签）。不改结构与 priority，选择/悬停
     * 路径不受影响。
     */
    renameLayer(path: LayerPath, name: string): void {
        if (!this.store.doc || !isRootLayerPath(path)) return
        this.store.transact((draft) => {
            const layer = resolveLayer(draft, path) as Draft<Layer> | null
            if (!layer) return
            layer.name = name
        })
    }

    /**
     * 开始重命名会话（图层面板双击/铅笔/F2 的统一入口）：路径必须解析到根图层。
     * 会话只进 ui 分支（不进历史），输入框的草稿文本住绑定层，提交经
     * commitRename 漏斗一次性落文档。
     */
    beginRename(path: LayerPath | null): boolean {
        if (path === null || !this.store.doc || !isRootLayerPath(path)) return false
        if (resolveLayer(this.store.doc, path) === null) return false
        this.store.setRenaming(path)
        return true
    }

    /**
     * 重命名提交漏斗的统一出口：Enter / blur 两条退出路径都收拢到这里。先清
     * 会话再落文档——退出路径可能级联触发（Enter 提交后 input 卸载的 blur），
     * 会话清空后后续调用幂等，保证一次退出恰一步历史。空名直传 renameLayer
     * （回退缺省语义在内核）；与现名相同不产生历史步（进出编辑零噪声）。
     */
    commitRename(name: string): boolean {
        const renaming = this.store.ui.renaming
        if (renaming === null) return false
        this.store.setRenaming(null)
        const layer = this.store.doc ? resolveLayer(this.store.doc, renaming) : null
        if (!layer || layer.name === name) return false
        this.renameLayer(renaming, name)
        return true
    }

    /** 取消重命名会话：清 ui 态不落文档（Esc 语义） */
    cancelRename(): void {
        this.store.setRenaming(null)
    }

    /**
     * 切换根图层显示/隐藏（layer-panel-ux 工单 10）：一次调用 = 一步历史（可撤销）。
     * 仅根图层——visible 在 LayerBase 面（渲染端整层跳过，行/格是容器内结构无独立
     * 可见性），路径非根或不可解析一律空转（无历史步），与 renameLayer 同门。
     * 隐藏的下游语义：渲染跳过（工单 01 契约）+ 命中/gizmo 过滤（spatial/hitTest、
     * 绑定层 gizmo），编辑器 UI 只消费这里的写入口。
     */
    toggleLayerVisibility(path: LayerPath): void {
        if (!this.store.doc || !isRootLayerPath(path)) return
        this.store.transact((draft) => {
            const layer = resolveLayer(draft, path) as Draft<Layer> | null
            if (!layer) return
            layer.visible = !layer.visible
        })
    }

    // ---- 剪贴板与置顶/置底（工单 14）：子树深拷贝语义见 clipboard.ts ----

    /**
     * 复制当前选中层：子树深拷贝快照进会话剪贴板（重置连续粘贴计数），并捕获
     * 复制时点的绝对盒（粘贴落位基准）。源须为可落根层的类型（行/格是容器内
     * 结构，v1 不可复制）；无选择/不可复制为 false。
     */
    copySelection(): boolean {
        if (!this.canCopySelection) return false
        const path = this.store.ui.selection!
        const doc = this.store.doc!
        const box = this.boxByPath(path)
        if (!box) return false
        this.clipboardEntry = {
            layer: cloneLayerSubtree(resolveLayer(doc, path)!),
            sourceBox: box,
            pasteCount: 0,
        }
        return true
    }

    /** 复制可用态（右键菜单「副本」的可用判定与 copySelection 同一语义） */
    get canCopySelection(): boolean {
        const path = this.store.ui.selection
        const doc = this.store.doc
        return path !== null && doc !== null && canCopyLayerAt(doc, path)
    }

    /**
     * 粘贴剪贴板：子树深拷贝插入根层——置顶（priority = min−1）、落位 = 复制时点
     * 绝对盒 + 按粘贴次数递增的偏移（+20、+40…，多份粘贴互不重叠）、自动选中
     * 新层；一次调用 = 一步历史。空剪贴板为 null。每次粘贴从剪贴板快照重新克隆：
     * 粘贴产物之间以及与源文档都不共享引用。
     */
    pasteFromClipboard(): LayerPath | null {
        const entry = this.clipboardEntry
        if (!entry || !this.store.doc) return null
        const pasteIndex = entry.pasteCount + 1
        const offset = PASTE_OFFSET_PX * pasteIndex
        const prepared = prepareRootPaste(
            entry.layer,
            entry.sourceBox,
            this.store.doc.width,
            this.store.doc.height,
            offset,
            offset,
        )
        const path = this.insertRootCopy(prepared)
        if (path !== null) entry.pasteCount = pasteIndex
        return path
    }

    /**
     * 创建副本 = 复制当前选中层 + 固定一格偏移（+20）+ 置顶 + 自动选中，一步历史。
     * 落位以当前绝对盒为基准（连续副本基于选中的副本链式偏移，天然不重叠）。
     * **不覆盖剪贴板**（先复制 A 再副本 B，粘贴仍出 A）。无选择/不可复制为 null。
     */
    duplicateSelection(): LayerPath | null {
        const path = this.store.ui.selection
        const doc = this.store.doc
        if (!path || !doc || !canCopyLayerAt(doc, path)) return null
        const box = this.boxByPath(path)
        if (!box) return null
        const prepared = prepareRootPaste(
            resolveLayer(doc, path)!,
            box,
            doc.width,
            doc.height,
            PASTE_OFFSET_PX,
            PASTE_OFFSET_PX,
        )
        return this.insertRootCopy(prepared)
    }

    /** 粘贴/副本的公共落库尾：根层置顶插入 + 自动选中新层；一次调用 = 一步历史 */
    private insertRootCopy(prepared: Layer): LayerPath | null {
        const index: TxOut<number> = { v: -1 }
        this.store.transact((draft) => {
            index.v = insertRootLayerInDraft(draft, prepared as Draft<Layer>)
        })
        if (index.v < 0) return null
        const path: LayerPath = ['layers', index.v]
        this.store.setSelection(path)
        return path
    }

    /**
     * 置顶/置底（右键菜单语义）：根层重排到面板两端（priority 中点插值同款——
     * 置顶 = min−1、置底 = max+1，数组序保持 priority 降序不变量），v1 只作用
     * 根层（行/格是数组序语义）。复用 moveRootLayer（含选择路径重映射）；已在
     * 端点为无操作（不产生历史步）。
     */
    bringToFront(): void {
        const panel = this.selectedRootPanelIndex()
        if (panel === null || panel === 0) return
        this.moveRootLayer(panel, 0)
    }

    sendToBack(): void {
        const panel = this.selectedRootPanelIndex()
        const count = this.store.doc?.layers.length ?? 0
        if (panel === null || panel === count - 1) return
        this.moveRootLayer(panel, count)
    }

    /** 选中根层的面板序号（0 = 视觉最上层）；非根层选择/无文档为 null */
    private selectedRootPanelIndex(): number | null {
        const path = this.store.ui.selection
        const doc = this.store.doc
        if (!path || !doc || !isRootLayerPath(path)) return null
        return doc.layers.length - 1 - (path[1] as number)
    }

    // ---- 快捷键分派（工单 14）：注册表分类（shortcuts.ts）→ 这里执行 ----

    /**
     * 执行快捷键动作（注册表分类的出口）：undo/redo/delete/copy/paste/duplicate/
     * rename 的统一分派面。让路规则在分类器（classifyEditorShortcut）裁决，到达
     * 这里的动作不再重复判态；动作为空转（无选择/空剪贴板/非根层）返回 false，
     * 其余 true。rename 开选中根层的重命名会话（F2，工单 09），不直接写文档。
     */
    executeShortcut(action: EditorShortcutAction): boolean {
        switch (action) {
            case 'undo':
                this.undo()
                return true
            case 'redo':
                this.redo()
                return true
            case 'copy':
                return this.copySelection()
            case 'paste':
                return this.pasteFromClipboard() !== null
            case 'duplicate':
                return this.duplicateSelection() !== null
            case 'rename':
                return this.beginRename(this.store.ui.selection)
            case 'toggleRulers':
                this.toggleRulers()
                return true
            case 'delete': {
                const path = this.store.ui.selection
                if (!path) return false
                this.deleteLayer(path)
                return true
            }
        }
    }

    // ---- 表格容器结构编辑（工单 12）：重建路径与 graph 解码同一套 add 同步语义 ----

    /**
     * 新增表格行（面板「加行」入口）：缺省行 + 缺省格（带文本内容）走重建路径
     * （行宽=表宽、内容宽=格宽、固定格压平内容高、行高取最高格——语义见
     * tableEditing.addTableRowInDraft），并自动选中新行；一次调用 = 一步历史。
     */
    addTableRow(tablePath: LayerPath): void {
        if (!this.store.doc) return
        const index: TxOut<number> = { v: -1 }
        this.store.transact((draft) => {
            index.v = addTableRowInDraft(draft, tablePath) ?? -1
        })
        if (index.v >= 0) this.store.setSelection([...tablePath, 'rows', index.v])
    }

    /**
     * 新增表格单元格（面板「加格」入口）：缺省格 + 缺省文本内容走重建路径
     * （内容宽=格宽、固定格压平内容高、行高取最高格），并自动选中新格；
     * 一次调用 = 一步历史。
     */
    addTableCell(rowPath: LayerPath): void {
        if (!this.store.doc) return
        const index: TxOut<number> = { v: -1 }
        this.store.transact((draft) => {
            index.v = addTableCellInDraft(draft, rowPath) ?? -1
        })
        if (index.v >= 0) this.store.setSelection([...rowPath, 'cells', index.v])
    }

    /**
     * 新增模板表（「+」选择器入口，spec §2.1）：createTemplateTable 缺省形态 +
     * 置顶 + 自动选中；一次调用 = 一步历史。rowsPath 必填（解码 rows_path_missing
     * 硬约束的对齐兜底，表单校验前置），空串 no-op。
     */
    addTemplateTable(rowsPath: string): void {
        if (!this.store.doc || rowsPath === '') return
        const index: TxOut<number> = { v: -1 }
        this.store.transact((draft) => {
            index.v = insertRootLayerInDraft(draft, createTemplateTable({ rowsPath }) as Draft<Layer>)
        })
        if (index.v >= 0) this.store.setSelection(['layers', index.v])
    }

    /**
     * 模板行加格（spec §3.1）：addTemplateCellInDraft 重建路径（末格宽/首格行宽、
     * 零高度耦合），自动选中新格；一次调用 = 一步历史。非模板态 no-op。
     */
    addTemplateCell(tablePath: LayerPath): void {
        if (!this.store.doc) return
        const index: TxOut<number> = { v: -1 }
        this.store.transact((draft) => {
            index.v = addTemplateCellInDraft(draft, tablePath) ?? -1
        })
        if (index.v >= 0) this.store.setSelection([...tablePath, 'template', 'cells', index.v])
    }

    /**
     * V1→V2 转换（spec §2.3）：rowsPath 必填（空串 no-op，表单校验前置）；rows
     * 子树内的选择/悬停回落表路径（rows 已清空不悬空）。一次调用 = 一步历史。
     */
    convertTableToTemplate(tablePath: LayerPath, rowsPath: string): void {
        if (!this.store.doc || rowsPath === '') return
        const done: TxOut<boolean> = { v: false }
        this.store.transact((draft) => {
            done.v = convertTableToTemplateInDraft(draft, tablePath, rowsPath) === true
        })
        if (done.v) this.clampSubtreeSelection(tablePath)
    }

    /**
     * V2→V1 逆向转换（spec §2.3）：模板实例化为单行（V1 归一重断言——auto 格
     * 采纳/固化、行高取最高格）；模板子树内的选择/悬停回落表路径。一次调用 =
     * 一步历史。
     */
    convertTableToRows(tablePath: LayerPath): void {
        if (!this.store.doc) return
        const done: TxOut<boolean> = { v: false }
        this.store.transact((draft) => {
            done.v = convertTableToRowsInDraft(draft, tablePath, this.textPolicies) === true
        })
        if (done.v) this.clampSubtreeSelection(tablePath)
    }

    /** 子树内选择/悬停回落到子树根（容器清空后不悬空）；子树外原样不动 */
    private clampSubtreeSelection(rootPath: LayerPath): void {
        const selection = this.store.ui.selection
        if (selection !== null && selection.length > rootPath.length && pathStartsWith(selection, rootPath)) {
            this.store.setSelection(rootPath)
        }
        const hovered = this.store.ui.hovered
        if (hovered !== null && hovered.length > rootPath.length && pathStartsWith(hovered, rootPath)) {
            this.store.setHovered(rootPath)
        }
    }

    /**
     * 单元格移动：落点为「insert-before 原始序号」的目标行 + 序号。同行退化为
     * 数组序重排（与行重排同款 moveGuard 语义），跨行走重建路径（目标行高取
     * 最高格、内容层归属随格重同步）。一次调用 = 一步历史。
     */
    moveTableCellToRow(cellPath: LayerPath, targetRowPath: LayerPath, toCell: number): void {
        if (!this.store.doc) return
        const sourceRowPath = cellPath.slice(0, -2)
        if (pathsEqual(sourceRowPath, targetRowPath)) {
            const from = cellPath[cellPath.length - 1]
            if (typeof from === 'number') this.moveTableCell(sourceRowPath, from, toCell)
            return
        }
        const moved: TxOut<MovedSubtreeRef | null> = { v: null }
        this.store.transact((draft) => {
            moved.v = moveTableCellToRowInDraft(draft, cellPath, targetRowPath, toCell, this.textPolicies)
        })
        if (moved.v !== null) this.remapMovedSubtree(moved.v)
    }

    /** 同行单元格重排（直接改 cells 数组序，容器内嵌套数组序语义） */
    moveTableCell(rowPath: LayerPath, fromCell: number, toCell: number): void {
        if (!this.store.doc) return
        const moved: TxOut<{ from: number; to: number } | null> = { v: null }
        this.store.transact((draft) => {
            moved.v = moveTableCellInDraft(draft, rowPath, fromCell, toCell)
        })
        if (moved.v === null) return
        this.remapPathSlices(rowPath, 'cells', moved.v.from, moved.v.to)
    }

    /**
     * 行移动：落点为「insert-before 原始序号」的目标表 + 序号。同表退化为数组序
     * 重排（moveTableRow），跨表走重建路径（行宽同步目标表宽——addRow 副作用）。
     * 一次调用 = 一步历史。
     */
    moveTableRowToTable(rowPath: LayerPath, targetTablePath: LayerPath, toRow: number): void {
        if (!this.store.doc) return
        const sourceTablePath = rowPath.slice(0, -2)
        if (pathsEqual(sourceTablePath, targetTablePath)) {
            const from = rowPath[rowPath.length - 1]
            if (typeof from === 'number') this.moveTableRow(sourceTablePath, from, toRow)
            return
        }
        const moved: TxOut<MovedSubtreeRef | null> = { v: null }
        this.store.transact((draft) => {
            moved.v = moveTableRowToTableInDraft(draft, rowPath, targetTablePath, toRow)
        })
        if (moved.v !== null) this.remapMovedSubtree(moved.v)
    }

    /**
     * 格 autoHeight 切换：开且带内容 = 采纳内容动态高（autowrap 文本即
     * 「行数×行高+padding」）并固化（解码对带内容的格恒归一为固定高）；开且空格 =
     * 置标志；关 = 清标志。采纳可能增高，行高随之取最高格。一次调用 = 一步历史。
     */
    setCellAutoHeight(cellPath: LayerPath, on: boolean): void {
        if (!this.store.doc) return
        const applied: TxOut<boolean> = { v: false }
        this.store.transact((draft) => {
            applied.v = setCellAutoHeightInDraft(draft, cellPath, on, this.textPolicies)
        })
        if (applied.v) this.pruneDanglingPaths()
    }

    // ---- 撤销/重做（工单 08）：双栈语义全在 store，会话只透传查询与动作 ----

    get canUndo(): boolean {
        return this.store.canUndo
    }

    get canRedo(): boolean {
        return this.store.canRedo
    }

    undo(): void {
        this.store.undo()
        // 历史回放不携带 ui 路径态：撤销后选择/悬停可能指向已消失的图层（如撤销
        // 新增行），按「路径可解析」清理悬空态（工单 12 选择协同）
        this.pruneDanglingPaths()
    }

    redo(): void {
        this.store.redo()
        this.pruneDanglingPaths()
    }

    // ---- 订阅与失效 ----

    subscribe(listener: (change: EditorChange) => void): () => void {
        return this.store.subscribe(listener)
    }

    /** 外部脏源入口（如资源物化完成 → 'content'） */
    invalidate(target: InvalidateTarget = 'both'): void {
        if (target === 'content') this.dirty.content = true
        else if (target === 'overlay') this.dirty.overlay = true
        else {
            this.dirty.content = true
            this.dirty.overlay = true
        }
        this.requestFrame()
    }

    /** 取消挂起帧、退订 store、解绑绘制面 */
    dispose(): void {
        if (this.cancelFrame) this.cancelFrame()
        this.cancelFrame = null
        this.frameQueued = false
        this.unsubscribeStore()
        this.detachSurfaces()
    }

    // ---- 内部：合帧与重绘 ----

    /**
     * 结构变更后重映射 ui 分支的路径态（选择/悬停/重命名会话）：路径是数组下标
     * 身份，容器 splice 后按 remapPathAfterSplice 平移，被移出子树的路径落地为
     * 清除。ui 整体替换、不进历史；值未变的路径 set* 内部值等短路。
     */
    private remapPathSlices(
        containerPath: LayerPath,
        key: 'layers' | 'rows' | 'cells',
        from: number,
        to: number,
    ): void {
        const remap = (path: LayerPath | null): LayerPath | null =>
            path === null ? null : remapPathAfterSplice(path, containerPath, key, from, to)
        const selection = remap(this.store.ui.selection)
        if (selection !== this.store.ui.selection) this.store.setSelection(selection)
        const hovered = remap(this.store.ui.hovered)
        if (hovered !== this.store.ui.hovered) this.store.setHovered(hovered)
        const renaming = remap(this.store.ui.renaming)
        if (renaming !== this.store.ui.renaming) this.store.setRenaming(renaming)
    }

    /**
     * 跨容器移动后的选择/悬停重映射（工单 12）：先做源容器纯删除与目标容器纯
     * 插入的索引平移（移动子树内的路径在源删除步被置 null，不参与平移），再把
     * 移动前落在移动子树内的路径按前缀重挂到新位置（子树内部相对结构不变，
     * 仅容器段整体替换）。
     */
    private remapMovedSubtree(moved: MovedSubtreeRef): void {
        const selectionBefore = this.store.ui.selection
        const hoveredBefore = this.store.ui.hovered
        this.remapPathSlices(moved.source.containerPath, moved.source.key, moved.source.from, moved.source.to)
        this.remapPathSlices(moved.target.containerPath, moved.target.key, moved.target.from, moved.target.to)
        const rebase = (before: LayerPath | null): LayerPath | null => {
            if (before === null || !pathStartsWith(before, moved.fromPath)) return null
            return [...moved.toPath, ...before.slice(moved.fromPath.length)] as LayerPath
        }
        const selection = rebase(selectionBefore)
        if (selection !== null && !pathsEqual(this.store.ui.selection, selection)) {
            this.store.setSelection(selection)
        }
        const hovered = rebase(hoveredBefore)
        if (hovered !== null && !pathsEqual(this.store.ui.hovered, hovered)) {
            this.store.setHovered(hovered)
        }
    }

    /** 悬空路径清理：选择/悬停/重命名会话指向已不存在的图层即清空（撤销/重做与采纳类收口共用） */
    private pruneDanglingPaths(): void {
        const doc = this.store.doc
        if (!doc) return
        const { selection, hovered, renaming } = this.store.ui
        if (selection !== null && resolveLayer(doc, selection) === null) this.store.setSelection(null)
        if (hovered !== null && resolveLayer(doc, hovered) === null) this.store.setHovered(null)
        if (renaming !== null && resolveLayer(doc, renaming) === null) this.store.setRenaming(null)
    }

    private onStoreChange(change: EditorChange): void {
        if (change.scope === 'doc') this.invalidate('both')
        else if (change.branch === 'viewport') this.invalidate('both')
        // 编辑会话开始/结束切换内容层的文本跳绘（textarea 接管该层呈现），双层都要重绘
        else if (change.branch === 'editing') this.invalidate('both')
        // schema 声明不触达像素（候选消费在绑定层补全面），不参与重绘脏标
        else if (change.branch === 'dataSourceSchema') return
        // 选择/悬停/拖动会话只影响 gizmo（拖动中的图层位移走 doc 分支另触发双层）
        else this.invalidate('overlay')
    }

    private requestFrame(): void {
        if (this.frameQueued) return
        this.frameQueued = true
        this.cancelFrame = this.scheduleFrame(() => this.flush())
    }

    private flush(): void {
        this.frameQueued = false
        this.cancelFrame = null
        const { content, overlay } = this.dirty
        this.dirty = { content: false, overlay: false }
        if (content) this.repaintContent()
        if (overlay) this.repaintOverlay()
    }

    private presentedViewport(): Viewport {
        return snapViewportToPhysicalPixels(this.store.ui.viewport, this.dpr)
    }

    private repaintContent(): void {
        const doc = this.store.doc
        const view = this.previewCanvas
        if (!doc || !view || !this.backend) return
        const viewport = this.presentedViewport()
        const transform: PreviewViewportTransform = {
            dpr: this.dpr,
            zoom: viewport.zoom,
            x: viewport.x,
            y: viewport.y,
        }
        // 视口变换是 Canvas2D 后端的可选能力；后端契约本身保持五原语不变
        ;(this.backend as Partial<ViewportAwareBackend>).setViewportTransform?.(transform)
        // 编辑中的文本层跳绘内容（textarea 接管该层文字呈现，防两侧断行叠加重影）；
        // 盒（背景/边框）照常绘制，进出编辑视觉连续。跳绘判定按预览视图中的图层
        // 引用：模板子树在视图里是新实例，经路径映射取视图侧对象才能命中同一引用
        // （非模板子树结构共享，两棵树同引用）。
        const editing = this.store.ui.editing
        let editingLayer: Layer | null = null
        if (editing) {
            const viewPath = docPathToViewPath(doc, editing.path)
            editingLayer = viewPath ? resolveLayer(view, viewPath as LayerPath) : null
        }
        renderCanvas(view, this.backend, this.textPolicies, editingLayer
            ? { skipContent: (layer) => layer === editingLayer }
            : undefined)
    }

    private repaintOverlay(): void {
        if (!this.overlayPainter) return
        this.overlayPainter({
            viewport: this.presentedViewport(),
            dpr: this.dpr,
            doc: this.store.doc,
        })
    }
}
