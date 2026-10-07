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
    PAN_TO_BOX_MARGIN_PX,
    fitRect,
    fitViewport,
    nextZoomByWheel,
    panBy,
    panToBox as panToBoxViewport,
    screenToScene,
    snapViewportToPhysicalPixels,
    zoomAtPoint,
    type Point,
    type Rect,
    type Size,
    type Viewport,
    type ZoomBounds,
} from '../spatial/camera'
import type { LayerBox, Layer, LayerType, ImageLayer } from '@hankchen/canvas-next'
import { hitTest as hitTestAt } from '../spatial/hitTest'
import {
    resolveSnap,
    resolveSnapPoints,
    snapAxesFromBoxes,
    snapThresholdScene,
    visibleRootBoxes,
    type Guide,
    type GuideOrientation,
    type SnapAxis,
} from '../spatial/snap'
import { CREATE_DEAD_ZONE_SCREEN_PX, createRubberBandRect } from '../spatial/create'
import {
    handleResizesHeight,
    handleResizesWidth,
    resizeBox,
    resizeHandleAt as resizeHandleHit,
    resizeHandlesAt as resizeHandlesForPath,
    resizeSnapPoints,
    resizableAxesAt,
    RESIZE_HANDLES,
    type ResizeHandle,
} from '../spatial/resize'
import { anchorOffset, layerHeight, layerWidth } from '@hankchen/canvas-next'
import {
    isTemplateSubtreePath,
    isLockedPath,
    layerBoxByPath,
    isRootLayerPath,
    pathStartsWith,
    pathsEqual,
    remapPathAfterSplice,
    resolveLayer,
    rootLayerOf,
    selectionParentPath,
    type LayerPath,
} from '../shared/layerPath'
import { normalizeExpressionSchemaSource } from '../shared/expressionSchema'
import { scanExpressionFragments } from '../shared/expressionScan'
import {
    ALIGN_CORNER_MARGIN_PX,
    alignToCanvasTarget,
    type AlignToCanvasMode,
    type AlignToCanvasOptions,
} from '../editing/alignCanvas'
import {
    PASTE_OFFSET_PX,
    canCopyLayerAt as canCopyLayerAtPath,
    cloneLayerSubtree,
    pastePosition,
    prepareRootPaste,
    type ClipboardEntry,
} from '../editing/clipboard'
import {
    replaceHitsInDraft,
    scanTextMatches,
    type FindTextHit,
} from '../editing/findReplace'
import {
    addRootLayerInDraft,
    createDefaultLayer,
    createTemplateTable,
    deleteLayerInDraft,
    insertRootLayerAdjacentInDraft,
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
import { EditorStore, type DragGesture, type EditorChange, type TransactOptions } from './store'
import { ARM_CREATE_LAYER_TYPES, type EditorShortcutAction } from './shortcuts'
import { FontCatalog, type FontCatalogEntry } from '../editing/fontCatalog'
import {
    UploadHandlerMissingError,
    uploadDisplayName,
    type UploadFile,
    type UploadHandler,
    type UploadImagePlacement,
} from '../editing/upload'
import {
    STYLE_FIELD_KEYS_BY_TYPE,
    applyStyleFieldsInDraft,
    captureStyleSnapshot,
    type StyleSnapshot,
} from '../editing/styleClipboard'
import { writeSpecField } from '../shared/specField'

/** transact 回调向外传值的容器：TS 会把闭包内赋值的 let 窄化回初值类型，盒属性访问不受影响 */
type TxOut<T> = { v: T }

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
    /**
     * 内容类型会话模式（canvas-web-expression-editing 工单 01）：true = 表达式——
     * 绑定层 pill 激活态与补全 enabled 的消费面。取会话标志（编辑中 pill 切换
     * 实时跟随，不受层标记态影响——面板在会话窗口期显示的是提交前旧状态）；路径
     * 无活动会话时按层标记态回落（进入编辑即锚定同值）。
     */
    expressionMode: boolean
}

/** 拖动事务的合并键：一次拖动的全部 pointermove 并成一步历史 */
const DRAG_MERGE_KEY = 'drag'

/** 缩放事务的合并键（工单 07）：一次八柄手势的全部位移并成一步历史 */
const RESIZE_MERGE_KEY = 'resize'

/**
 * Alt+拖快速复制的死区（alt-drag-paste 工单 01，spec 决策 1）：屏幕 css 像素、
 * 缩放无关（场景阈值 = 阈值 / zoom，SNAP_THRESHOLD_SCREEN_PX 同风格）——首移
 * 越过死区才插入副本，死区内抬手退化为普通点选。
 */
export const ALT_DRAG_DEAD_ZONE_SCREEN_PX = 4

/** 微调步长（kbd-nav 工单 02）：基础步 1 场景 px，Shift 大步 10 px 固定 */
const NUDGE_STEP_PX = 1
const NUDGE_COARSE_STEP_PX = 10

/** 微调事务的合并键：含选中层路径（换层即换步）、方向无关（连按跨方向同串） */
const nudgeMergeKey = (path: LayerPath): string => `nudge:${path.join(':')}`

/** 查找游标钳位：派生命中列表内回落（末处/首处），空命中为 0（读侧收口） */
function clampFindCursor(cursor: number, count: number): number {
    if (count <= 0) return 0
    return Math.min(Math.max(cursor, 0), count - 1)
}

/**
 * 串含 ≥1 语法有效闭合片段（canvas-web-expression-editing 工单 01，spec 决策 3）：
 * `scanExpressionFragments` 切出 `kind: 'fragment'` 且 `error === null`——与求值器
 * `expression_syntax_error` 同码。未闭合 `{{` 是 open 片段（求值期字面直通）、
 * 空片段/路径空段带错误信号，均不算合法片段——表达式会话提交去向（标记写 vs
 * 字面回落）的判定原语，守住不变量「标记 ⟹ ≥1 合法片段」。
 */
function hasValidExpressionFragment(template: string): boolean {
    return scanExpressionFragments(template).parts.some(
        (part) => part.kind === 'fragment' && part.error === null,
    )
}

/**
 * 解码不变量重断言（updateSpec 与样式粘贴共用，写入口收口一处）：autoHeight
 * 置位即声明高归零（decodeBase 对 auto 标志恒清零声明高，PHP setHeight('auto')
 * 同门；文本层由布局按行数×行高+padding 动态求高，其余类型按各自兜底）——
 * 否则保存再打开声明高被清，往返恒等破。格的 autoHeight 写入另有采纳/固化
 * 语义（updateSpec 拦截分流），不会走到这里。参数收只读联合：draft 结构上
 * 兼容只读类型，写入经显式转型（字段形态由领域类型把关）。
 */
function renormalizeAutoHeightInDraft(layer: Layer): void {
    if ((layer as { shape?: { autoHeight?: boolean } }).shape?.autoHeight === true) {
        ;(layer as { shape: { height: number } }).shape.height = 0
    }
}

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
     * 会话级剪贴板（工单 14；alt-drag-paste 工单 02 收窄）：复制源的子树深拷贝
     * 快照 + 复制时点绝对盒（粘贴落位基准，格内容的格内相对 position 据此换算
     * 画布绝对落位）+ 源路径（粘贴时紧邻插入的解析凭据）。不跨会话、不碰 OS
     * 剪贴板；openDocument 不清空——粘贴进另一份文档是合法用法（条目是与源树
     * 断开引用的普通对象；他文档 sourcePath 必失配 → 粘贴退化置顶）。
     */
    private clipboardEntry: ClipboardEntry | null = null
    /**
     * 样式剪贴板（canvas-web-style-paste 工单 01）：源类型 + 适用面逐字段值快照。
     * 与图层剪贴板**分立互不覆盖**（⌘C 与 ⌥⌘C 并存）；不碰 OS 剪贴板、不进历史
     * （剪贴板态不是文档态）；openDocument 不清空——跨文档粘贴样式合法（图层
     * 剪贴板同门，快照是与源树断开引用的普通对象）。
     */
    private styleClipboardEntry: StyleSnapshot | null = null
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

    /**
     * 缩放复位 100%（⌘0，kbd-nav 工单 01）：以视口中心为锚回到 1.0——中心场景点
     * 不动、平移不跳变（Sketch Actual Size 同构，playground zoomTo100 先例收编为
     * 内核面）；已在 100% 时 zoomAtPoint 恒等短路。视口走 ui 分支不进历史。
     */
    resetZoom(): void {
        const { width, height } = this.surfaceSize
        this.zoomAt(width / 2, height / 2, 1)
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

    /**
     * 保 zoom 平移入视（canvas-web-find-replace 工单 02，spec 决策 6）：查找导航
     * 的视口跟随——目标盒完全在视口内视口不动，出视才最小平移使整盒入视（入视
     * 小边距与盒大于视口对齐盒左上的边界语义在 camera.panToBox 纯函数内定死）。
     * 与 fitToSelection 分立不混用：那是变焦语义（fitRect），这是保 zoom 的跟随
     * 语义。盒几何由调用方解析（工单 03 命中导航经 layerBoxAt 同一解析缝，模板
     * 子树走预览视图）；视口走 ui 分支不进历史，视内不动经恒等短路零通知；表面
     * 尺寸未知 no-op（fitToSurface 同门）。
     */
    panToBox(box: Rect): void {
        if (this.surfaceSize.width <= 0 || this.surfaceSize.height <= 0) return
        const viewport = this.store.ui.viewport
        const next = panToBoxViewport(viewport, box, this.surfaceSize, PAN_TO_BOX_MARGIN_PX)
        if (next !== viewport) this.store.setViewport(next)
    }

    // ---- 选择与拖动（工单 06）：命中/选择/拖动几何全部经内核纯函数 ----

    /** 屏幕（css 像素）→ 场景：绑定层的唯一坐标入口（zoom 折算收口在此） */
    toScenePoint(screenX: number, screenY: number): Point {
        return screenToScene(this.store.ui.viewport, screenX, screenY)
    }

    /**
     * 场景点命中查询（不产生副作用）：在预览视图上执行——模板态表格的预览行
     * 可命中，命中路径经视图→文档映射落回模板子树身份（选中/属性编辑写文档）。
     * 锁定集合（canvas-web-layer-lock 工单 01）随 ui 分支传入纯函数：锁定的根层
     * 整子树退出命中面，selectAt/hoverAt/右键/双击全经此一条缝自动生效。
     */
    hitTest(sceneX: number, sceneY: number): LayerPath | null {
        const view = this.previewCanvas
        if (!view) return null
        const hit = hitTestAt(view, sceneX, sceneY, this.textPolicies, {
            lockedPaths: this.store.ui.lockedPaths,
        })
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

    /**
     * 循环选层（kbd-nav 工单 03，CONTEXT「循环选层」词条 / spec 决策 4）：Tab
     * 沿面板序朝更垫底方向移动选中（面板顶 = 视觉最上层 = 数组尾，故数组下标 −1），
     * ⇧Tab 反向（selectPrevLayer），端点 wrap 回绕；空选从视觉最上层（面板首行）
     * 开始（spec 决策 4 字面口径，⇧Tab 同一起点）；子层选中以根祖先为基准取相邻
     * 根层（不下钻表格，循环只落根路径）。跳过面与命中面同门（hitTest 同款判定）：
     * 隐藏根层整子树排除（visible=false 是排除语义非保护语义）、锁定根层整子树
     * 退出交互面（isLocked 谓词——Tab 是命中面的键盘投影，「画布挡误触」同门，
     * layer-lock 合入后随谓词自动生效）；全部根层被跳过时空转返回 false。
     * 选中变更走 setSelection（ui 分支零历史步；值等短路使单根层 wrap 自身无害
     * ——不通知）。返回是否落到选中（executeShortcut 可用态口径）。
     */
    selectNextLayer(): boolean {
        return this.cycleRootSelection(1)
    }

    /** ⇧Tab 反向循环选层（语义见 selectNextLayer） */
    selectPrevLayer(): boolean {
        return this.cycleRootSelection(-1)
    }

    /** 循环选层的共同游走：direction = 1 朝数组头（垫底）、−1 朝数组尾（最上），模 count 回绕 */
    private cycleRootSelection(direction: 1 | -1): boolean {
        const doc = this.store.doc
        const count = doc?.layers.length ?? 0
        if (doc === null || count === 0) return false
        // 基准根下标：任意深度的选中取根祖先（路径第 2 段即根下标）；悬空选中
        // （undo prune 窗口外的瞬态）视同空选按起点口径
        const selection = this.store.ui.selection
        const baseline =
            selection !== null && rootLayerOf(doc, selection) !== null ? (selection[1] as number) : null
        const startIndex = baseline === null ? count - 1 : baseline - direction
        for (let step = 0; step < count; step += 1) {
            const index = (((startIndex - direction * step) % count) + count) % count
            const path: LayerPath = ['layers', index]
            // 跳过面与命中面同门：visible=false 整子树排除；锁定经 isLocked 谓词收口
            if (doc.layers[index]!.visible === false || this.isLocked(path)) continue
            this.store.setSelection(path)
            return true
        }
        return false
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
     * （吸附求位基准，ui 分支）。已在拖动中、路径或盒几何无法解析时返回 false；
     * 路径落在锁定子树同样拒绝（canvas-web-layer-lock 工单 01：拖动是变更类
     * 动作的 guard 入口——画布命中面已过滤锁定层，此守卫兜住其余手势来源，
     * 缩放手势接入 resize feature 时同用此门）。
     *
     * Alt+拖快速复制（alt-drag-paste 工单 01）：options.copy 起手一次性判定——
     * 源不可复制（canCopyLayerAt 为 false：行/格等容器内结构）静默忽略 Alt 走
     * 普通拖动（spec 决策 1）；置位后 copyMode 会话内定死，首移越过死区才插入
     * 副本（dragTo 消费，见 ALT_DRAG_DEAD_ZONE_SCREEN_PX）。
     */
    beginDrag(path: LayerPath, sceneX: number, sceneY: number, options: { copy?: boolean } = {}): boolean {
        if (this.store.ui.drag || this.store.ui.resize || this.store.ui.create) return false
        if (this.isLocked(path)) return false
        const doc = this.store.doc
        const layer = doc ? resolveLayer(doc, path) : null
        if (!doc || !layer) return false
        const box = this.boxByPath(path)
        if (!box) return false
        const copy = options.copy === true && canCopyLayerAtPath(doc, path)
        this.store.setDrag({
            path,
            startScene: { x: sceneX, y: sceneY },
            startPosition: { x: layer.position.x, y: layer.position.y },
            startBox: box,
            ...(copy ? { copy: true, copyPending: true } : {}),
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
     *
     * Alt+拖 copyMode（alt-drag-paste 工单 01）：副本未插入前（copyPending）源层
     * 不动——未越死区零事务，首移越阈交 dragCopyFirstMove 单事务完成插入 + 位移，
     * 此后 path 已重指向副本、走普通拖动流程（吸附排除副本、源层供轴）。
     */
    dragTo(sceneX: number, sceneY: number): void {
        const drag = this.store.ui.drag
        if (!drag) return
        // 拖动中图层被结构编辑移除的边缘态：整个求位空转（不发事务、不发布命中轴）
        const doc = this.store.doc
        if (!doc || resolveLayer(doc, drag.path) === null) return
        if (drag.copy === true && drag.copyPending === true) {
            this.dragCopyFirstMove(drag, sceneX, sceneY)
            return
        }
        const dx = sceneX - drag.startScene.x
        const dy = sceneY - drag.startScene.y
        const resolution = resolveSnap(
            {
                x: drag.startBox.x + dx,
                y: drag.startBox.y + dy,
                width: drag.startBox.width,
                height: drag.startBox.height,
            },
            this.snapAxesForGesture(drag.path),
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

    /**
     * copyMode 首移（alt-drag-paste 工单 01，spec 决策 1/3）：先过死区——位移按
     * 屏幕 4px 阈值折算（缩放无关），未越阈零事务、源层不动（Alt+点击退化）；
     * 越阈则单事务完成「插入副本（紧邻源层）+ 副本自源盒起步位移」：副本 = 源
     * 子树深拷贝，落位按根层语义反解（pastePosition——根层源退化为 position +
     * 位移、格内容源把格内相对 position 换算画布绝对落位），与吸附修正一并写入，
     * mergeKey 沿用 DRAG_MERGE_KEY，后续 move 同键合并——undo 一次副本整体消失。
     * 吸附求位在副本入库前：吸附源 = 全部可见根层（副本尚不存在、源层天然在列
     * ——重叠起步，spec 决策 4）；插入后手势重指向副本（startPosition 换基准为
     * 副本起步位 = 源绝对盒的根层语义反解，startBox 即副本起步盒不变），副本自动
     * 选中，命中轴照常回显。
     */
    private dragCopyFirstMove(drag: DragGesture, sceneX: number, sceneY: number): void {
        const doc = this.store.doc
        if (!doc) return
        const source = resolveLayer(doc, drag.path)
        if (!source) return
        const dx = sceneX - drag.startScene.x
        const dy = sceneY - drag.startScene.y
        if (Math.hypot(dx, dy) <= ALT_DRAG_DEAD_ZONE_SCREEN_PX / this.store.ui.viewport.zoom) return
        const resolution = resolveSnap(
            {
                x: drag.startBox.x + dx,
                y: drag.startBox.y + dy,
                width: drag.startBox.width,
                height: drag.startBox.height,
            },
            this.snapAxesForGesture(null),
            snapThresholdScene(this.store.ui.viewport.zoom),
        )
        const copyIndex: TxOut<number> = { v: -1 }
        this.store.transact((draft) => {
            const sourceInDraft = resolveLayer(draft, drag.path)
            if (!sourceInDraft) return
            const prepared = prepareRootPaste(
                sourceInDraft,
                drag.startBox,
                doc.width,
                doc.height,
                dx + resolution.dx,
                dy + resolution.dy,
            )
            copyIndex.v = insertRootLayerAdjacentInDraft(draft, prepared as Draft<Layer>, drag.path) ?? -1
        }, { mergeKey: DRAG_MERGE_KEY })
        if (copyIndex.v < 0) return
        const copyPath: LayerPath = ['layers', copyIndex.v]
        this.store.setDrag({
            ...drag,
            path: copyPath,
            startPosition: pastePosition(drag.startBox, source.position.anchor, doc.width, doc.height, 0, 0),
            copyPending: false,
        })
        this.store.setSelection(copyPath)
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
     * 手势可用的吸附轴集合（dragTo/resizeTo 每步重算，几何与其余消费同源）：
     * 可见根层盒（hitTest 同款 visible 过滤）排除手势目标层自身根 + 画布中轴 +
     * 当前参考线。自身根排除对缩放同样正确——被缩放层的自缘不供轴（对缘与移动
     * 缘都在自身盒上，供轴只会命中自己）。gesturePath 传 null = 排除面为空
     * （copyMode 首移：副本未入库，源层供轴，alt-drag-paste 工单 01）。
     */
    private snapAxesForGesture(gesturePath: LayerPath | null): readonly SnapAxis[] {
        const doc = this.store.doc
        if (!doc) return []
        const excludeRootIndex = gesturePath === null ? null : gesturePath[1]
        if (excludeRootIndex !== null && typeof excludeRootIndex !== 'number') return []
        return snapAxesFromBoxes(
            doc.width,
            doc.height,
            visibleRootBoxes(doc, excludeRootIndex, this.textPolicies),
            this.store.ui.guides,
        )
    }

    /** 当次手势命中的吸附轴（只读查询，吸附线呈现消费）；非手势态/未命中为空 */
    listSnapAxes(): readonly SnapAxis[] {
        return this.store.ui.snapAxes
    }

    // ---- 八柄缩放（工单 07）：几何纯函数在 spatial/resize，写回/吸附/采纳在此收口 ----

    /**
     * 路径处图层当前可用的八柄集合（gizmo 柄渲染与手势起点同缝）：角色权威
     * 过滤（行宽=表宽、格内容尺寸强同步面不可经柄改，语义见
     * spatial/resize.resizableAxesAt）+ 锁定子树不出柄（锁定层只画选中框，
     * gizmo 同门——柄是变换入口，锁定=可定位不可变换）。
     */
    resizeHandlesAt(path: LayerPath | null): readonly ResizeHandle[] {
        const doc = this.store.doc
        if (!doc || path === null || this.isLocked(path)) return []
        return resizeHandlesForPath(doc, path)
    }

    /**
     * 场景点命中选中层的可用柄（hitTest/hoverAt 同门的意图级查询，画布接线
     * 与 gizmo 消费）：命中半径按屏幕 6px 常量折算（RESIZE_HANDLE_HIT_PX，随
     * zoom 收放）；无选中/盒不可解析/未命中返回 null。命中判定以当前可用柄
     * 集合为面——角色过滤与锁定折叠在此一条缝生效。
     */
    resizeHandleAt(sceneX: number, sceneY: number): ResizeHandle | null {
        const selection = this.store.ui.selection
        if (selection === null) return null
        const box = this.boxByPath(selection)
        if (!box) return null
        return resizeHandleHit(
            this.resizeHandlesAt(selection),
            box,
            sceneX,
            sceneY,
            this.store.ui.viewport.zoom,
        )
    }

    /**
     * 开始缩放会话：记录目标路径、柄、起点场景坐标与起始解析盒（ui 分支）。
     * 起点记录指针位置而非柄中心——位移以抓取点为基准，移动缘不跳到指针下
     * （与拖动保留抓取偏移同语义，两种主流做法中取不跳变侧）。
     * 已在手势中（拖动/缩放互斥）、路径或盒几何无法解析、路径落在锁定子树、
     * 柄的任一作用轴不在角色可缩放面内（行上拖 e/w、格内容上任意柄）时返回
     * false——gizmo 只渲染可用柄，此守卫兜其余手势来源（键盘/宿主直调）。
     */
    beginResize(path: LayerPath, handle: ResizeHandle, sceneX: number, sceneY: number): boolean {
        if (this.store.ui.drag || this.store.ui.resize || this.store.ui.create) return false
        if (this.isLocked(path)) return false
        if (!RESIZE_HANDLES.includes(handle)) return false
        const doc = this.store.doc
        if (!doc || resolveLayer(doc, path) === null) return false
        const axes = resizableAxesAt(doc, path)
        if (handleResizesWidth(handle) && !axes.width) return false
        if (handleResizesHeight(handle) && !axes.height) return false
        const box = this.boxByPath(path)
        if (!box) return false
        this.store.setResize({ path, handle, startScene: { x: sceneX, y: sceneY }, startBox: box })
        return true
    }

    /**
     * 缩放进行中（工单 07）：八柄几何求位 + 移动缘吸附 + 文档写回，一个 mergeKey
     * 事务合并成一步历史。
     *
     * 几何：移动缘 = 起始缘 + 场景位移，对缘固定，minSize 钳位不翻转
     * （resizeBox）；非本柄轴的位移分量忽略。
     * 吸附：移动缘位点（resizeSnapPoints，角柄双缘、边柄单缘；盒中心不参与缩放
     * 吸附）对轴集合求位——轴集合与拖动同源（snapAxesForGesture），屏幕 6px 阈值
     * 随 zoom 折算；修正施加在指针位移上、再进钳位，吸附不破「对缘固定 + minSize」
     * 语义，吸附结果只改坐标不改尺寸语义（auto 标志采纳是手势起点的轴选择，不随
     * 吸附翻转）。命中的吸附轴回写会话态供吸附线呈现（瞬时回显，endResize 清空）。
     * 写回（工单验收项 2 的语义收口）：被拖轴写声明尺寸并清 auto 标志——autoWidth/
     * autoHeight 图层首个位移事务把解析尺寸落地为声明值（「改尺寸标志」语义，
     * 属性面板 auto 前缀输入框的可编辑化同门）；未被拖的轴零接触——autoWidth
     * 文本层拖 s 柄后仍随文本自然宽、QR 拖 e 柄高随宽保持正方形（从动轴不采纳）。
     * 写后重断言（updateSpec 同门）：autoHeight⟹声明高归零的解码不变量 + 表格
     * 强同步 canonicalize（根表宽联动行宽、格内容宽同步、行高取最高格——行高缩到
     * 最高格以下被不变量顶回属预期）。position 按目标盒反解（锚点偏移随新尺寸
     * 重算，任意锚点/任意父级下落点都精确）：同步完成后以草稿内的解析尺寸与
     * 父级盒求锚点偏移，position = 目标盒坐标 − 偏移。
     *
     * 拖不动写不动的同门守卫：无会话、目标层被结构编辑移除（悬空路径）整体
     * 空转（不发事务、不发布命中轴）。
     */
    resizeTo(sceneX: number, sceneY: number): void {
        const gesture = this.store.ui.resize
        if (!gesture) return
        const doc = this.store.doc
        if (!doc || resolveLayer(doc, gesture.path) === null) return
        const dx = sceneX - gesture.startScene.x
        const dy = sceneY - gesture.startScene.y
        const widthActive = handleResizesWidth(gesture.handle)
        const heightActive = handleResizesHeight(gesture.handle)
        const resolution = resolveSnapPoints(
            resizeSnapPoints(gesture.startBox, gesture.handle, dx, dy),
            this.snapAxesForGesture(gesture.path),
            snapThresholdScene(this.store.ui.viewport.zoom),
        )
        const target = resizeBox(
            gesture.startBox,
            gesture.handle,
            widthActive ? dx + resolution.dx : dx,
            heightActive ? dy + resolution.dy : dy,
        )
        this.store.transact((draft) => {
            const layer = resolveLayer(draft, gesture.path)
            if (!layer) return
            // 被拖轴写声明尺寸并清 auto 标志（采纳）；未被拖的轴零接触。
            // draft 语义解除 readonly；字段形态由领域类型与可缩放面把关
            const shape = layer.shape as {
                width: number
                height: number
                autoWidth: boolean
                autoHeight: boolean
            }
            if (widthActive) {
                shape.width = target.width
                shape.autoWidth = false
            }
            if (heightActive) {
                shape.height = target.height
                shape.autoHeight = false
            }
            // 解码不变量重断言 + 表格强同步（updateSpec 同门）：先同步再反解
            // position——同步可能改写解析尺寸（格内容宽/行高）与父级盒（行高增长），
            // 反解必须以最终形态为准
            renormalizeAutoHeightInDraft(layer)
            canonicalizeTableSyncInDraft(
                draft,
                gesture.path,
                widthActive ? ['shape', 'width'] : ['shape', 'height'],
                this.textPolicies,
            )
            const resolvedWidth = layerWidth(layer, this.textPolicies)
            const resolvedHeight = layerHeight(layer, this.textPolicies)
            const parent = this.parentDimsInDraft(draft, gesture.path)
            const offset = anchorOffset(
                layer.position.anchor,
                parent.width,
                parent.height,
                resolvedWidth,
                resolvedHeight,
            )
            // draft 语义解除 readonly；position = 目标盒坐标 − 锚点偏移（任意锚点下盒精确落位）
            const position = layer.position as { x: number; y: number }
            position.x = target.x - offset.x
            position.y = target.y - offset.y
        }, { mergeKey: RESIZE_MERGE_KEY })
        this.store.setSnapAxes(resolution.axes)
    }

    /**
     * 结束缩放：闭合合并事务（下一步历史定格），会话态与命中轴回显清空。
     * 无会话空转（幂等，pointercancel 与 pointerup 双路同达）。
     */
    endResize(): void {
        if (!this.store.ui.resize) return
        this.store.setResize(null)
        this.store.setSnapAxes([])
        this.store.closeMerge(RESIZE_MERGE_KEY)
    }

    // ---- 画拉建层（drag-create 工单 01）：武装 + 橡皮筋纯视觉 + pointerup 落库 ----

    /**
     * 武装建层（面板新增项/层型快捷键的统一入口，CONTEXT「武装」词条）：置 ui
     * 分支待命层型，下一次画布按下即开画拉；建层提交或 Esc 即解除——一次性
     * 待命态，无粘性工具（spec 决策 2）。重复武装同型值等短路零通知。
     */
    armLayerCreate(type: LayerType): void {
        this.store.setArmedCreate(type)
    }

    /** 解除建层武装（取消入口）：仅清待命态，零副作用。 */
    cancelArmLayerCreate(): void {
        this.store.setArmedCreate(null)
    }

    /**
     * 开始画拉会话：须已武装（未武装空转防御——画布手势态机的分派前置，此守卫
     * 兜其余调用来源），与拖动/缩放会话互斥（手势起点一次性定死，beginDrag/
     * beginResize 同门），文档未打开空转。层型在起点一次性捕获进会话（spec
     * 决策 7：拖拽中改主意 = Esc 重武装，v1 不做拖拽中层型切换）。会话只进
     * ui 分支——拖拽期纯视觉、文档零变更（spec 决策 4）。
     */
    beginLayerCreate(sceneX: number, sceneY: number): boolean {
        const armed = this.store.ui.armedCreate
        if (armed === null || this.store.ui.drag || this.store.ui.resize || this.store.ui.create) return false
        if (!this.store.doc) return false
        const point = { x: sceneX, y: sceneY }
        this.store.setCreate({
            type: armed,
            startScene: point,
            currentScene: point,
            rect: { x: sceneX, y: sceneY, width: 0, height: 0 },
        })
        return true
    }

    /**
     * 画拉进行中：橡皮筋求位（spatial/create.createRubberBandRect——两点正规化
     * + QR 钳 height := width + 左右/上下缘各两点进 resolveSnapPoints，吸附数学
     * 零新增）写回会话 rect 供 overlay 直读（虚线矩形 + W×H 气泡），命中轴回写
     * ui.snapAxes 走 GuidesOverlay 既有通道回显（dragTo 同门）。吸附排除面为空
     * （snapAxesForGesture(null)——新层尚未入库，全部可见根层供轴，copyMode
     * 首移同门）。零文档事务：修正只进会话几何，落库在 endCreate。
     */
    createTo(sceneX: number, sceneY: number): void {
        const gesture = this.store.ui.create
        const doc = this.store.doc
        if (!gesture || !doc) return
        const resolution = createRubberBandRect(
            gesture.type,
            gesture.startScene,
            { x: sceneX, y: sceneY },
            this.snapAxesForGesture(null),
            snapThresholdScene(this.store.ui.viewport.zoom),
        )
        this.store.setCreate({
            ...gesture,
            currentScene: { x: sceneX, y: sceneY },
            rect: resolution.rect,
        })
        this.store.setSnapAxes(resolution.axes)
    }

    /**
     * 结束画拉：按死区分流落库（一次手势 = 一步历史，undo 整体回退落位 + 尺寸
     * + priority）。先清会话再落文档（commitTextEdit 同门——退出路径级联时幂等）：
     * - 死区外：单事务写入「createDefaultLayer 缺省形态 + position 左上角对准
     *   橡皮筋矩形（含吸附修正）+ shape.width/height」并 insertRootLayerInDraft
     *   置顶（priority min−1、push 数组尾）；
     * - 死区内（点击兜底，位移按 CREATE_DEAD_ZONE_SCREEN_PX 屏幕 px 随 zoom 折算，
     *   ALT_DRAG_DEAD_ZONE_SCREEN_PX 同门）：缺省尺寸、左上角对准点击点。
     * 落库后自动选中新层并解除武装；返回新层路径（绑定层消费：文本层据此自动
     * 进文本编辑，spec 决策 6）。无会话/无文档空转返回 null。点击兜底不产生
     * 零尺寸层（缺省形态自带可见尺寸）。
     */
    endCreate(): LayerPath | null {
        const gesture = this.store.ui.create
        if (!gesture) return null
        this.store.setCreate(null)
        this.store.setSnapAxes([])
        this.store.setArmedCreate(null)
        if (!this.store.doc) return null
        const dx = gesture.currentScene.x - gesture.startScene.x
        const dy = gesture.currentScene.y - gesture.startScene.y
        const deadZoneScene = CREATE_DEAD_ZONE_SCREEN_PX / this.store.ui.viewport.zoom
        const clicked = Math.hypot(dx, dy) <= deadZoneScene
        const index: TxOut<number> = { v: -1 }
        this.store.transact((draft) => {
            const layer = createDefaultLayer(gesture.type) as Draft<Layer>
            if (clicked) {
                // 点击兜底：缺省尺寸原样，position 左上角对准点击点（拖文件入画布
                // 「左上角对准释放点」同门，spec 决策 5）
                layer.position = { ...layer.position, x: gesture.startScene.x, y: gesture.startScene.y }
            } else {
                layer.position = { ...layer.position, x: gesture.rect.x, y: gesture.rect.y }
                layer.shape.width = gesture.rect.width
                layer.shape.height = gesture.rect.height
            }
            index.v = insertRootLayerInDraft(draft, layer)
        })
        if (index.v < 0) return null
        const path: LayerPath = ['layers', index.v]
        this.store.setSelection(path)
        return path
    }

    /**
     * 取消画拉（Esc 语义）：清橡皮筋会话、命中轴回显与武装态——零文档写入、
     * 零历史步（拖拽期纯视觉因此取消零回退成本，spec 决策 4）。幂等：无会话时
     * 仅解除武装（待命态 Esc 同走此口）。
     */
    cancelCreate(): void {
        this.store.setCreate(null)
        this.store.setSnapAxes([])
        this.store.setArmedCreate(null)
    }

    /**
     * 草稿内求缩放目标的父级盒尺寸（position 反解的锚点偏移入参）：根层 = 画布
     * 尺寸（resolveLayerBox 根层语义同参）；行/格取容器路径（rows/cells 段成对、
     * content 单段），经 layerBoxByPath 在草稿内解析——同步完成后的父级盒（行高
     * 增长等同步效应已含）。悬空回落画布尺寸（与根层同参，position 仍自洽）。
     */
    private parentDimsInDraft(draft: Draft<Canvas>, path: LayerPath): { width: number; height: number } {
        if (isRootLayerPath(path)) return { width: draft.width, height: draft.height }
        const parentPath =
            path[path.length - 1] === 'content' ? path.slice(0, -1) : path.slice(0, -2)
        const box = layerBoxByPath(draft, parentPath as LayerPath, this.textPolicies)
        return box ?? { width: draft.width, height: draft.height }
    }

    /**
     * 方向键微调（kbd-nav 工单 02）：选中层 position 按场景增量位移（注册表 8
     * 条目方向 × 步长归并到此，executeShortcut 传 ±1/±10）。作用面与拖动同门——
     * 选中什么微调什么，位置写法与 dragTo 同一语义（position 原位 += 增量）；
     * 拖不动的空转（无选择/无文档/路径不可解析）。**不吸附**：吸附是拖动过程的
     * 连续行为（CONTEXT「微调」词条边界），微调是可预测的定量位移，不走
     * resolveSnap、不回显命中轴。
     * 连续微调合并一条历史：mergeKey 含选中层路径、方向无关——同层连按（跨方向）
     * 并成一步，undo 一次回连按前；换层即换步（mergeKey 随路径变）；undo/redo
     * 走 store 既有断开规则（closeMerge）。断开是键控而非选择事件驱动：选择往返
     * （A→B→A 中途无文档变更）会并回 A 的原串，机制既有规则同款。拖动/缩放会话
     * 进行中空转（防插入事务拆分开放中的合并步，工单 07 缩放同门）。
     * 守卫（canvas-web-layer-lock 工单 01 挂账兑现）：锁定子树空转（isLocked
     * 谓词同门——微调是变更类动作）。空转返回 false（executeShortcut 可用态口径）。
     */
    nudge(deltaX: number, deltaY: number): boolean {
        const path = this.store.ui.selection
        if (path === null || this.store.ui.drag !== null || this.store.ui.resize !== null) return false
        if (this.isLocked(path)) return false
        const doc = this.store.doc
        if (!doc || resolveLayer(doc, path) === null) return false
        this.store.transact((draft) => {
            const layer = resolveLayer(draft, path)
            if (!layer) return
            // immer draft 原位写 position；类型层的 readonly 由 draft 语义解除
            const position = layer.position as { x: number; y: number }
            position.x += deltaX
            position.y += deltaY
        }, { mergeKey: nudgeMergeKey(path) })
        return true
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

    /**
     * 清空全部参考线（工具栏「清空参考线」写入口，工单 03 消费）：ui 分支整体置空，
     * 与 removeGuide 同型广播 guides 分支通知（覆盖层失效重绘）。会话级语义同门——
     * 不进历史、不写 graph（ADR 0012），不可撤销；无文档或已空时空转（不产生通知）。
     */
    clearGuides(): void {
        if (!this.store.doc) return
        if (this.store.ui.guides.length === 0) return
        this.store.setGuides([])
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
     *
     * 内容类型会话标志（canvas-web-expression-editing 工单 01，spec 决策 2）按
     * 进入瞬间 `layer.expression !== null` 锚定进会话快照——「进入时计、编辑中
     * 稳定」（verticalAnchorY 同门）：编辑中面板改标记不回写标志，提交去向由
     * 快照裁决（打标是显式动作，内容判定制已否决）。同路径重复进入短路（快照
     * 不重锚）；换层进入按新层现状重锚。
     */
    beginTextEdit(path: LayerPath): boolean {
        const layer = this.textLayerAt(path)
        if (layer === null) return false
        const current = this.store.ui.editing
        if (current && pathsEqual(current.path, path)) return true
        this.store.setEditing({ path, expression: layer.expression !== null })
        return true
    }

    /**
     * 提交漏斗的统一出口：Esc / Ctrl+Enter / blur / 点画布他处四条退出路径都收拢
     * 到这里。先清会话再落文档——退出路径可能级联触发（画布点按的 pointerdown
     * 提交与随后 blur 竞态），会话清空后后续调用幂等，保证一次退出恰一步历史。
     *
     * 提交矩阵（canvas-web-expression-editing 工单 01，spec 决策 3，空串判定先于
     * 片段判定）：
     * - 串与文档一致：不进历史（进出编辑零噪声），返回 false——对比对象随会话
     *   模式取：表达式会话对比 `layer.expression`、字面会话对比 `layer.text`（现行
     *   语义）；
     * - 空串：删除该图层（复用 deleteLayer 的 splice/重映射语义），任何模式同语义；
     * - 表达式会话且串含 ≥1 语法有效闭合片段（hasValidExpressionFragment）：
     *   updateDataExpression 标记写（保持标记、text 自动重镜像）；
     * - 其余（字面会话恒走此支；表达式会话无合法片段回落）：updateData 字面写、
     *   字面接管解标——含 `{{...}}` 按字面保留，杜绝无片段标记层。
     */
    commitTextEdit(text: string): boolean {
        const editing = this.store.ui.editing
        if (!editing) return false
        this.store.setEditing(null)

        const layer = this.textLayerAt(editing.path)
        if (!layer) return false
        if (editing.expression ? text === layer.expression : text === layer.text) return false
        if (text === '') {
            this.deleteLayer(editing.path)
            return true
        }
        if (editing.expression && hasValidExpressionFragment(text)) {
            this.updateDataExpression(editing.path, text)
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
        const editing = this.store.ui.editing
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
            expressionMode:
                editing !== null && pathsEqual(editing.path, path)
                    ? editing.expression
                    : layer.expression !== null,
        }
    }

    /** 编辑会话的目标图层查询：路径须解析到 TextLayer，其余（含无文档）返回 null */
    private textLayerAt(path: LayerPath): TextLayer | null {
        const doc = this.store.doc
        const layer = doc ? resolveLayer(doc, path) : null
        return layer && layer.type === 'TextLayer' ? layer : null
    }

    // ---- 查找替换（canvas-web-find-replace 工单 01）：会话态住 ui 分支，扫描/替换纯函数在 editing/findReplace ----

    /**
     * 打开查找会话（⌘F 分派口）：无文档空转返回 false；已开时值等短路零通知
     * （重复 ⌘F 的重新聚焦归绑定层）。查询词/替换词/游标跨关开保留（closeFind
     * →beginFind 同文档连续改字），openDocument 才整体重置。
     */
    beginFind(): boolean {
        if (!this.store.doc) return false
        this.store.setFind({ ...this.store.ui.find, open: true })
        return true
    }

    /** 关闭查找会话（Esc 归面板组件调用）：仅翻开合面，查询词与游标保留 */
    closeFind(): void {
        this.store.setFind({ ...this.store.ui.find, open: false })
    }

    /** 查找词写入（查找条输入即扫的源头）：查询词变更即重置游标（旧下标对新命中集无意义） */
    setFindQuery(query: string): void {
        const find = this.store.ui.find
        this.store.setFind({ ...find, query, cursor: find.query === query ? find.cursor : 0 })
    }

    /** 替换词写入 */
    setFindReplacement(replacement: string): void {
        this.store.setFind({ ...this.store.ui.find, replacement })
    }

    /** 游标写入（上一个/下一个导航口）：存原值，越界在读侧钳位 */
    setFindCursor(cursor: number): void {
        this.store.setFind({ ...this.store.ui.find, cursor })
    }

    /**
     * 派生命中列表（overlay 高亮与查找条计数同源消费）：每次从 doc + query 现算、
     * 不驻留（树小无压力，免 pruneDanglingPaths 式失配维护）；视觉序 = 数组尾→头
     * （hitTest 同门），命中 = path + 偏移对。
     */
    listFindMatches(): readonly FindTextHit[] {
        const doc = this.store.doc
        if (!doc) return []
        return scanTextMatches(doc, this.store.ui.find.query)
    }

    /** 当前游标（读侧钳位到派生命中列表：越界落末处/首处，空命中为 0） */
    get findCursor(): number {
        return clampFindCursor(this.store.ui.find.cursor, this.listFindMatches().length)
    }

    /**
     * 替换当前命中（查找条「替换」按钮）：一次无 mergeKey 事务 = 一步历史；游标
     * 原地不动——事务后派生列表在被替换处缩一位，原下标即「下一处」（「替换后
     * 自动跳下一处」靠派生天然成立，末处替换则钳位停在尾）。写值经 replaceHitsInDraft
     * 与文本编辑提交同门（text 直写 + expression 保持 null）。无文档/空 query/
     * 无命中空转返回 false。
     */
    replaceOne(): boolean {
        const doc = this.store.doc
        const query = this.store.ui.find.query
        if (!doc || query === '') return false
        const matches = scanTextMatches(doc, query)
        const hit = matches[clampFindCursor(this.store.ui.find.cursor, matches.length)]
        if (!hit) return false
        this.store.transact((draft) => {
            replaceHitsInDraft(draft, [hit], this.store.ui.find.replacement)
        })
        return true
    }

    /**
     * 全部替换（查找条「全部替换」按钮）：命中（path + 偏移对）在事务前按原文
     * 快照一次算定，单事务内按同字段偏移降序应用、替换产物不重扫（replacement
     * 含查询串不死循环）——一次调用 = 一步历史，undo 一次全回。返回应用处数
     * （计数反馈「已替换 N 处」）；无文档/空 query 空转返回 0。
     */
    replaceAll(): number {
        const doc = this.store.doc
        const query = this.store.ui.find.query
        if (!doc || query === '') return 0
        const hits = scanTextMatches(doc, query) // 原文快照：命中事务前一次算定
        if (hits.length === 0) return 0
        let applied = 0
        this.store.transact((draft) => {
            applied = replaceHitsInDraft(draft, hits, this.store.ui.find.replacement)
        })
        return applied
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
            writeSpecField(layer, key, value)
            // 解码不变量：autoHeight 置位即声明高归零（renormalizeAutoHeightInDraft
            // 收口），否则保存再打开声明高被清，往返恒等破。
            renormalizeAutoHeightInDraft(layer)
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

    // ---- 数据源 schema 声明（content-completion 工单 03/08）：D2 宿主随会话注入 ----

    /**
     * 注入数据源 schema 声明（载荷形态，D1 钉定：声明即 compile(canvas, dataset)
     * 收到的 data 载荷形状，根上下文候选 = 载荷顶层键）。声明经
     * normalizeExpressionSchemaSource 一次性编译收口——根级结构性问题（保留键
     * row/$ 前缀，前移填充期 reserved_root_key；根非对象/缺 properties 层级）降级
     * 为无候选 + console 警告，局部故障（$ref 断链/外部指针/环引用/目标形态不符）
     * 不拒绝：该节点降叶子 + 注入期汇总告警一次，树其余部分照常服务，不抛错不
     * 弹错（辅助声明不作权威）；null/undefined = 清除声明。声明只住 store ui 分支：
     * 不进 graph、不落 localStorage、不进 wire；openDocument 换文档不重置，
     * 重注入/清除走同一入口。签名与「注入即整体替换」语义不变（D6）。
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
     * 本机）；上传失败异常上抛、文档不动。placement（kbd-nav 工单 05）缺省 =
     * 编辑器缺省盒；`at` 图层盒左上角对准场景点、`size` 1:1 落盒不缩放（拖文件
     * 入画布语义，自然尺寸由绑定层解码传入——内核无 DOM）。
     */
    async uploadImageAsLayer(file: UploadFile, placement: UploadImagePlacement = {}): Promise<LayerPath | null> {
        if (!this.store.doc) return null
        const ref = await this.requireUpload(file)
        const index: TxOut<number> = { v: -1 }
        this.store.transact((draft) => {
            index.v = addRootLayerInDraft(draft, 'ImageLayer')
            if (index.v < 0) return
            const layer = draft.layers[index.v] as Draft<ImageLayer>
            layer.src = ref
            if (placement.at) layer.position = { ...layer.position, x: placement.at.x, y: placement.at.y }
            if (placement.size) {
                layer.shape.width = placement.size.width
                layer.shape.height = placement.size.height
            }
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
     * 锁定 guard（canvas-web-layer-lock 工单 01）：路径落在锁定子树（锁定的根层
     * 及其行/格/内容）即静默空转——Delete/⌫ 与面板删除按钮的权威挡点，无历史步。
     */
    deleteLayer(path: LayerPath): void {
        if (!this.store.doc || path[path.length - 1] === 'template') return
        if (this.isLocked(path)) return
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

    /**
     * 切换根图层锁定（canvas-web-layer-lock 工单 01）：会话级锁定态，ui 分支
     * 变更——不进历史、不写 graph、wire 零键（红线 3 同门），openDocument 重置。
     * 仅根图层——行/格是容器内结构（锁定语义只在 LayerBase 面），路径非根或
     * 不可解析一律空转（renameLayer/toggleLayerVisibility 同门）。
     * 下游语义：锁定层整子树退出画布命中面（hitTest 过滤）、拖动起点/删除在
     * 内核空转（方向键微调已随 kbd-nav 工单 02 接入同一谓词）；属性编辑/duplicate/
     * 显隐/改名/z 序等刻意通道不受限；⌘D 副本新路径天然无锁。
     */
    toggleLayerLock(path: LayerPath): void {
        if (!this.store.doc || !isRootLayerPath(path)) return
        if (resolveLayer(this.store.doc, path) === null) return
        const current = this.store.ui.lockedPaths
        const next = current.some((locked) => pathsEqual(locked, path))
            ? current.filter((locked) => !pathsEqual(locked, path))
            : [...current, path]
        this.store.setLockedPaths(next)
    }

    /**
     * 锁定谓词（canvas-web-layer-lock 工单 01，ui 分支读取口）：路径落在锁定
     * 子树即 true，判定收口 isLockedPath——hitTest 过滤、动作 guard、gizmo、
     * 面板投影共用，绑定层不得自行手写锁定路径比对。
     */
    isLocked(path: LayerPath | null): boolean {
        return path !== null && isLockedPath(path, this.store.ui.lockedPaths)
    }

    // ---- 剪贴板与置顶/置底（工单 14）：子树深拷贝语义见 clipboard.ts ----

    /**
     * 复制当前选中层：子树深拷贝快照进会话剪贴板，并捕获复制时点的绝对盒（粘贴
     * 落位基准）与源路径（sourcePath——粘贴时紧邻插入的解析凭据，alt-drag-paste
     * 工单 02）。源须为可落根层的类型（行/格是容器内结构，v1 不可复制）；无选择/
     * 不可复制为 false。
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
            sourcePath: path,
        }
        return true
    }

    /** 复制可用态（右键菜单「副本」的可用判定与 copySelection 同一语义） */
    get canCopySelection(): boolean {
        const path = this.store.ui.selection
        return path !== null && this.canCopyLayerAt(path)
    }

    /**
     * 路径处图层可复制（alt-drag-paste 工单 01，Alt+拖 copyMode 的绑定层判定面）：
     * 可解析且类型可落根层（canCopyLayerAt 同门——行/格是容器内结构不可复制，
     * 格内容可复制）。无文档为 false。
     */
    canCopyLayerAt(path: LayerPath): boolean {
        const doc = this.store.doc
        return doc !== null && canCopyLayerAtPath(doc, path)
    }

    /**
     * 粘贴剪贴板（alt-drag-paste 工单 02 真原位）：子树深拷贝插入根层——落点 =
     * 复制时点绝对盒、零偏移（重复粘贴同位叠放；锚点补偿保留：dx=0 时根层源
     * position 恒等原位、格内容源落其视觉位置）；z 序紧邻源层（sourcePath 解析
     * 与退化置顶见 insertRootCopy）；自动选中新层；一次调用 = 一步历史。空剪贴板
     * 为 null。每次粘贴从剪贴板快照重新克隆：粘贴产物之间以及与源文档都不共享
     * 引用。
     */
    pasteFromClipboard(): LayerPath | null {
        const entry = this.clipboardEntry
        const doc = this.store.doc
        if (!entry || !doc) return null
        const prepared = prepareRootPaste(entry.layer, entry.sourceBox, doc.width, doc.height, 0, 0)
        return this.insertRootCopy(prepared, entry.sourcePath)
    }

    /**
     * 创建副本 = 复制当前选中层 + 固定一格偏移（+20）+ 置顶 + 自动选中，一步历史。
     * 落位以当前绝对盒为基准（连续副本基于选中的副本链式偏移，天然不重叠）。
     * **不覆盖剪贴板**（先复制 A 再副本 B，粘贴仍出 A）。无选择/不可复制为 null。
     */
    duplicateSelection(): LayerPath | null {
        const path = this.store.ui.selection
        const doc = this.store.doc
        if (!path || !doc || !canCopyLayerAtPath(doc, path)) return null
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

    /**
     * 粘贴/副本的公共落库尾：根层插入 + 自动选中新层；一次调用 = 一步历史。
     * source 给定时先试紧邻源层（源仍可解析且为根层——alt-drag-paste 工单 02 的
     * ⌘V 紧邻消费；路径寻址尽力而为：删源后同下标兄弟层/他文档同下标层会顶替
     * 解析，紧邻彼层是可接受的近似，工单 Comments 记档）——原语返回 null 或条件
     * 不满足回落置顶；source 缺省恒置顶（⌘D 语义不动）。
     */
    private insertRootCopy(prepared: Layer, source?: LayerPath): LayerPath | null {
        const index: TxOut<number> = { v: -1 }
        this.store.transact((draft) => {
            index.v =
                source !== undefined && resolveLayer(draft, source) !== null && isRootLayerPath(source)
                    ? insertRootLayerAdjacentInDraft(draft, prepared as Draft<Layer>, source) ?? -1
                    : -1
            if (index.v < 0) index.v = insertRootLayerInDraft(draft, prepared as Draft<Layer>)
        })
        if (index.v < 0) return null
        const path: LayerPath = ['layers', index.v]
        this.store.setSelection(path)
        return path
    }

    // ---- 样式粘贴（canvas-web-style-paste 工单 01）：样式集/适用面常量与快照/落地纯函数在 editing/styleClipboard ----

    /**
     * 复制样式（⌥⌘C / 右键菜单）：按源类型适用面抓逐字段深拷贝快照进会话私有
     * 槽（{sourceType, values}）。源为**任意可解析路径**（根/行/格/格内容/模板
     * 子树皆可）；无文档/路径不可解析/源无样式面（行模板替身，适用面为空）空转
     * 返回 false——空快照不占槽，已拷贝的样式不被无样式源清掉。拷贝不进历史
     * （剪贴板态不是文档态）。
     */
    copyStyle(path: LayerPath): boolean {
        const doc = this.store.doc
        const layer = doc ? resolveLayer(doc, path) : null
        if (!layer) return false
        const snapshot = captureStyleSnapshot(layer)
        if (!snapshot) return false
        this.styleClipboardEntry = snapshot
        return true
    }

    /** 复制可用态（右键菜单）：有可解析选择且源类型有样式面 */
    get canCopyStyle(): boolean {
        const path = this.store.ui.selection
        const doc = this.store.doc
        if (path === null || doc === null) return false
        const layer = resolveLayer(doc, path)
        return layer !== null && STYLE_FIELD_KEYS_BY_TYPE[layer.type].length > 0
    }

    /**
     * 粘贴样式（⌥⌘V / 右键菜单）：按目标类型适用面 ∩ 快照逐字段 verbatim 覆盖
     * （null 即值、Border 整对象；快照没有的字段 = 源不适型，静默跳过）。目标为
     * **任意可解析路径**——模板子树与格内容放行（尺寸字段不在样式集，行/格/
     * 内容宽高强同步天然不冲突）；锁定语义天然放行（属性写通道，CONTEXT「锁定」
     * 词条）。单事务内循环写入 + autoHeight⟹height=0 断言 + canonicalizeTableSync
     * 一次收口（updateSpec 同门）——一次粘贴 = 一步历史，连续粘贴不合并（无
     * mergeKey）；全等字段跳写、整事务零变化经 store 空 patch 短路不进历史；
     * 无文档/空槽/路径不可解析空转返回 false。
     */
    pasteStyle(path: LayerPath): boolean {
        const entry = this.styleClipboardEntry
        if (!entry || !this.store.doc) return false
        const written: TxOut<readonly (readonly string[])[]> = { v: [] }
        this.store.transact((draft) => {
            const layer = resolveLayer(draft, path) as Draft<Layer> | null
            if (!layer) return
            const keys = applyStyleFieldsInDraft(layer, entry)
            if (keys.length === 0) return
            // 解码不变量重断言（updateSpec 同门，一次收口）：autoHeight⟹声明高归零
            // 经 renormalizeAutoHeightInDraft 收口；表格强同步按末写字段重断言——
            // 样式字段不触宽度耦合（根表分支天然空转），容器目标走内容/格/行
            // 重同步收口
            renormalizeAutoHeightInDraft(layer)
            canonicalizeTableSyncInDraft(draft, path, keys[keys.length - 1]!, this.textPolicies)
            written.v = keys
        })
        return written.v.length > 0
    }

    /** 粘贴可用态（右键菜单）：样式槽非空且有可解析选择；交集为零变化的空转在动作面兜底 */
    get canPasteStyle(): boolean {
        const path = this.store.ui.selection
        const doc = this.store.doc
        return this.styleClipboardEntry !== null && path !== null && doc !== null && resolveLayer(doc, path) !== null
    }

    /**
     * z 序四件套（右键菜单语义 + kbd-nav 工单 01 键位）：根层重排，v1 只作用根层
     * （行/格是数组序语义）。全部复用 moveRootLayer（priority 中点插值同款——
     * 置顶 = min−1、置底 = max+1、无整数间隙全表归一化兜底），一次调用 = 一步
     * 历史；已在目标端为无操作（不产生历史步）。返回是否发生移动（executeShortcut
     * 的可用态口径；右键菜单直调忽略返回值）。锁定层 z 序放行（锁定谓词的刻意
     * 通道，canvas-web-layer-lock 工单 01 同口径）。
     */
    bringToFront(): boolean {
        const panel = this.selectedRootPanelIndex()
        if (panel === null || panel === 0) return false
        this.moveRootLayer(panel, 0)
        return true
    }

    sendToBack(): boolean {
        const panel = this.selectedRootPanelIndex()
        const count = this.store.doc?.layers.length ?? 0
        if (panel === null || panel === count - 1) return false
        this.moveRootLayer(panel, count)
        return true
    }

    /**
     * 前移/后移一格（kbd-nav 工单 01）：面板序号 ±1 的单格重排——与置顶/置底、
     * 面板拖动同一 moveRootLayer 语义（中点插值优先、无间隙全表归一化兜底），仅
     * 根层（isRoot 同门），已最前/最后空转。连按各成一步历史（无 mergeKey，
     * shortcut action 不合步的先例）。落点按「insert-before 原始序号」折算：
     * 前移 = 插到原 panel−1 层之前（to = panel−1），后移 = 插到原 panel+1 层之后
     * （to = panel+2）。
     */
    bringForward(): boolean {
        const panel = this.selectedRootPanelIndex()
        if (panel === null || panel <= 0) return false
        this.moveRootLayer(panel, panel - 1)
        return true
    }

    sendBackward(): boolean {
        const panel = this.selectedRootPanelIndex()
        const count = this.store.doc?.layers.length ?? 0
        if (panel === null || panel >= count - 1) return false
        this.moveRootLayer(panel, panel + 2)
        return true
    }

    /** 选中根层的面板序号（0 = 视觉最上层）；非根层选择/无文档为 null */
    private selectedRootPanelIndex(): number | null {
        const path = this.store.ui.selection
        const doc = this.store.doc
        if (!path || !doc || !isRootLayerPath(path)) return null
        return doc.layers.length - 1 - (path[1] as number)
    }

    /**
     * 可分派的选中根层路径（⇧⌘L/⇧⌘H 分派口守卫，工单 02）：无选择/无文档/非根
     * 形状/悬空（不可解析）一律 null——分派口「空转返回 false」与内核 action 的
     * 静默空转同口径（悬空窗口来自 prune 之外的结构步，兜底裁定可用态）。
     */
    private selectableRootPath(): LayerPath | null {
        const path = this.store.ui.selection
        const doc = this.store.doc
        if (path === null || doc === null || !isRootLayerPath(path)) return null
        return resolveLayer(doc, path) === null ? null : path
    }

    // ---- 快捷键分派（工单 14）：注册表分类（shortcuts.ts）→ 这里执行 ----

    /**
     * 执行快捷键动作（注册表分类的出口）：undo/redo/delete/copy/paste/duplicate/
     * copyStyle/pasteStyle（⌥⌘C/⌥⌘V，canvas-web-style-paste 工单 01）/
     * rename/findReplace（⌘F，canvas-web-find-replace 工单 01）/
     * toggleRulers/toggleLayerLock/toggleLayerVisibility 的统一分派面，以及
     * z 序四件套与缩放三件（kbd-nav 工单 01：bringForward/sendBackward/
     * bringToFront/sendToBack/zoomReset/fitToSurface/fitToSelection）、微调八动作
     * （kbd-nav 工单 02：nudgeUp/Down/Left/Right + Coarse 变体，归并到同一 nudge
     * 实现）与循环选层两动作（kbd-nav 工单 03：selectNextLayer/selectPrevLayer）；
     * helpShortcuts（kbd-nav 工单 04）是 UI 面动作，由绑定层桥拦截路由
     * 帮助面板、不经此处。让路规则在
     * 分类器（classifyEditorShortcut）裁决，到达这里的动作不再重复判态；动作为
     * 空转（无选择/空剪贴板/非根层/已在端点）返回 false，其余 true。rename 开
     * 选中根层的重命名会话（F2，工单 09），不直接写文档；锁定/显隐作用于选中根层
     * （canvas-web-layer-lock 工单 02 + feature-status 显隐键位挂账补位），非根/
     * 无选择按可用态裁剪返回 false；相机三件不进历史、恒 true（surface 未知时
     * 内核静默空转，同 toggleRulers 的无条件口径）。
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
            case 'copyStyle': {
                // 样式粘贴（canvas-web-style-paste 工单 01）：⌥⌘C 分派口，无选择空转
                const path = this.store.ui.selection
                return path !== null && this.copyStyle(path)
            }
            case 'pasteStyle': {
                // ⌥⌘V 分派口：空槽/无选择空转（可用态口径与右键菜单 canPasteStyle 同源）
                const path = this.store.ui.selection
                return path !== null && this.pasteStyle(path)
            }
            case 'rename':
                return this.beginRename(this.store.ui.selection)
            case 'findReplace':
                // 查找替换（canvas-web-find-replace 工单 01）：⌘F 分派 beginFind——
                // 面板开合语义内核只持会话态（Esc 关归 Vue 面板组件，工单 03 接线）
                return this.beginFind()
            case 'armCreateText':
            case 'armCreateTable':
            case 'armCreateQrCode':
            case 'armCreateImage':
                // 画拉建层武装四条目（canvas-web-drag-create 工单 03）：T/G/Q/I 分派
                // 统一武装口——面板新增项与层型快捷键同缝（spec 决策 1）；武装只置
                // ui 待命态，落库在画拉 endCreate（此处恒 true，状态栏提示归绑定层桥；
                // 动作→层型映射与绑定层共用 ARM_CREATE_LAYER_TYPES 单一事实源）
                this.armLayerCreate(ARM_CREATE_LAYER_TYPES[action])
                return true
            case 'toggleRulers':
                this.toggleRulers()
                return true
            case 'toggleLayerLock': {
                const path = this.selectableRootPath()
                if (path === null) return false
                this.toggleLayerLock(path)
                return true
            }
            case 'toggleLayerVisibility': {
                const path = this.selectableRootPath()
                if (path === null) return false
                this.toggleLayerVisibility(path)
                return true
            }
            case 'bringForward':
                return this.bringForward()
            case 'sendBackward':
                return this.sendBackward()
            case 'bringToFront':
                return this.bringToFront()
            case 'sendToBack':
                return this.sendToBack()
            case 'nudgeUp':
                return this.nudge(0, -NUDGE_STEP_PX)
            case 'nudgeDown':
                return this.nudge(0, NUDGE_STEP_PX)
            case 'nudgeLeft':
                return this.nudge(-NUDGE_STEP_PX, 0)
            case 'nudgeRight':
                return this.nudge(NUDGE_STEP_PX, 0)
            case 'nudgeUpCoarse':
                return this.nudge(0, -NUDGE_COARSE_STEP_PX)
            case 'nudgeDownCoarse':
                return this.nudge(0, NUDGE_COARSE_STEP_PX)
            case 'nudgeLeftCoarse':
                return this.nudge(-NUDGE_COARSE_STEP_PX, 0)
            case 'nudgeRightCoarse':
                return this.nudge(NUDGE_COARSE_STEP_PX, 0)
            case 'selectNextLayer':
                return this.selectNextLayer()
            case 'selectPrevLayer':
                return this.selectPrevLayer()
            case 'zoomReset':
                this.resetZoom()
                return true
            case 'fitToSurface':
                this.fitToSurface()
                return true
            case 'fitToSelection':
                this.fitToSelection()
                return true
            case 'helpShortcuts':
                // UI 面动作（kbd-nav 工单 04）：绑定层桥拦截路由到帮助面板
                // （useShortcutsHelp），不会到达这里；case 仅为动作联合穷尽
                // （TS），防御性按不可用态口径返回 false
                return false
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

    /**
     * 挂起帧同步排空（canvas-web-render-perf 工单 01）：绑定层在「物理缓冲已被清空、
     * 需要背靠背补绘」的时机调用（CanvasSurface 的 resizeBuffers 赋 canvas.width 清屏
     * 后——ResizeObserver 回调在本帧 rAF 之后，等下帧重绘必现一帧空白）。有挂起帧即
     * 取消排定并按当前脏标立即 flush；无挂起帧空转幂等。内核保持无 DOM：只操作既有
     * cancelFrame/flush，不感知帧源（rAF 语义归绑定层注入的调度器）。
     */
    flushPendingFrames(): void {
        if (!this.frameQueued) return
        // 先摘排定再同步 flush（被取消的帧回调不得在排空后再次触发）；标志复位
        // 归 flush()，此处不重置
        this.cancelFrame?.()
        this.flush()
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
     * 结构变更后重映射 ui 分支的路径态（选择/悬停/重命名会话/锁定集合）：路径是
     * 数组下标身份，容器 splice 后按 remapPathAfterSplice 平移，被移出子树的路径
     * 落地为清除。ui 整体替换、不进历史；值未变的路径 set* 内部值等短路。
     * 锁定集合（canvas-web-layer-lock 工单 01）作为集合平移——锁「胶在层上」走过
     * splice（兄弟增删/根层重排后锁仍指原层），被移出容器的锁定路径落地解锁。
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
        this.store.setLockedPaths(this.remappedLocks(this.store.ui.lockedPaths, remap))
    }

    /**
     * 锁定集合经映射平移（canvas-web-layer-lock 工单 01）：逐路径过 map、滤除
     * 落地 null 的悬空路径；集合未变时 setLockedPaths 内容等短路（无锁/未变
     * 不通知）。remapPathSlices 的 splice 平移与 remapMovedSubtree 的前缀重挂
     * 共用同一形状——后者必须传移动前捕获的集合（源 splice 步已丢掉移动子树
     * 内的锁）。
     */
    private remappedLocks(
        paths: readonly LayerPath[],
        map: (path: LayerPath) => LayerPath | null,
    ): LayerPath[] {
        return paths.reduce<LayerPath[]>((kept, locked) => {
            const mapped = map(locked)
            if (mapped !== null) kept.push(mapped)
            return kept
        }, [])
    }

    /**
     * 跨容器移动后的选择/悬停/锁定集合重映射（工单 12 + canvas-web-layer-lock
     * 工单 01）：先做源容器纯删除与目标容器纯插入的索引平移（移动子树内的路径
     * 在源删除步被置 null，不参与平移），再把移动前落在移动子树内的路径按前缀
     * 重挂到新位置（子树内部相对结构不变，仅容器段整体替换）。锁定集合的重挂
     * 当前是不变量兜底——锁定恒为根层路径、跨容器移动的子树恒为行/格子树，两集
     * 天然不相交；将来锁面扩展或根层跨容器移动接入时语义已在。
     */
    private remapMovedSubtree(moved: MovedSubtreeRef): void {
        const selectionBefore = this.store.ui.selection
        const hoveredBefore = this.store.ui.hovered
        const lockedBefore = this.store.ui.lockedPaths
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
        const rebasedLocks = this.remappedLocks(lockedBefore, rebase)
        if (rebasedLocks.length > 0) {
            this.store.setLockedPaths([...this.store.ui.lockedPaths, ...rebasedLocks])
        }
    }

    /**
     * 悬空路径清理：选择/悬停/重命名会话指向已不存在的图层即清空（撤销/重做与
     * 采纳类收口共用）。锁定集合同门（canvas-web-layer-lock 工单 01）：锁定路径
     * 悬空即解锁。已知限制（spec §3 记档不修）：undo/redo 只有 prune 无平移——
     * 跨结构步撤销后锁可能错位（路径仍可解析、指到别的层）或清失，锁定钮常显
     * 可目视纠正；wire 持久化（锁长在层对象上）根治。
     */
    private pruneDanglingPaths(): void {
        const doc = this.store.doc
        if (!doc) return
        const { selection, hovered, renaming } = this.store.ui
        if (selection !== null && resolveLayer(doc, selection) === null) this.store.setSelection(null)
        if (hovered !== null && resolveLayer(doc, hovered) === null) this.store.setHovered(null)
        if (renaming !== null && resolveLayer(doc, renaming) === null) this.store.setRenaming(null)
        this.store.setLockedPaths(
            this.store.ui.lockedPaths.filter((locked) => resolveLayer(doc, locked) !== null),
        )
    }

    private onStoreChange(change: EditorChange): void {
        if (change.scope === 'doc') this.invalidate('both')
        else if (change.branch === 'viewport') this.invalidate('both')
        // 编辑会话开始/结束切换内容层的文本跳绘（textarea 接管该层呈现），双层都要重绘
        else if (change.branch === 'editing') this.invalidate('both')
        // 资源物化状态（placeholder-padding-hint 工单 02）：装载落定伴随内容像素
        // 变化（完成出图/失败占位），提示面在绑定层读 ui 切片——双层重绘
        else if (change.branch === 'resourceStatuses') this.invalidate('both')
        // schema 声明不触达像素（候选消费在绑定层补全面），不参与重绘脏标
        else if (change.branch === 'dataSourceSchema') return
        // 选择/悬停/拖动会话/重命名/锁定集合/查找会话（命中高亮随 query/游标变）
        // 只影响 gizmo（锁定不改渲染产物——命中面是事件侧语义；拖动中的图层位移
        // 走 doc 分支另触发双层）
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
