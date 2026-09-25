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
    lineHeightPx,
    renderCanvas,
    textOrigin,
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
} from './camera'
import type { LayerBox, Layer, LayerType } from '@hankchen/canvas-next'
import { hitTest as hitTestAt } from './hitTest'
import {
    layerBoxByPath,
    pathsEqual,
    remapPathAfterSplice,
    resolveLayer,
    selectionParentPath,
    type LayerPath,
} from './layerPath'
import {
    addRootLayerInDraft,
    deleteLayerInDraft,
    moveRootLayerInDraft,
    moveTableRowInDraft,
    type DeletedLayerRef,
} from './layerPanel'
import { EditorStore, type EditorChange, type TransactOptions } from './store'

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
}

export class EditorSession {
    readonly store: EditorStore

    private readonly scheduleFrame: FrameScheduler
    private readonly zoomBounds: ZoomBounds
    private readonly fitMargin: number
    private readonly textPolicies?: TextLayoutPolicies

    private backend: RenderBackend | null = null
    private overlayPainter: OverlayPainter | null = null
    private dpr = 1
    private surfaceSize: Size = { width: 0, height: 0 }
    private dirty = { content: false, overlay: false }
    private frameQueued = false
    private cancelFrame: (() => void) | null = null
    private readonly unsubscribeStore: () => void

    constructor(options: EditorSessionOptions) {
        this.scheduleFrame = options.scheduleFrame
        this.zoomBounds = options.zoomBounds ?? DEFAULT_ZOOM_BOUNDS
        this.fitMargin = options.fitMargin ?? 0
        this.textPolicies = options.textPolicies
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

    /** 自适应选区视图：视口适配选中盒；无选择/退化盒回落适应画布 */
    fitToSelection(): void {
        const doc = this.store.doc
        if (!doc) return
        const selection = this.store.ui.selection
        const box = selection ? layerBoxByPath(doc, selection, this.textPolicies) : null
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

    /** 场景点命中查询（不产生副作用） */
    hitTest(sceneX: number, sceneY: number): LayerPath | null {
        const doc = this.store.doc
        return doc ? hitTestAt(doc, sceneX, sceneY, this.textPolicies) : null
    }

    /** 路径处图层的绝对盒（gizmo 选择框与后续面板共用；与命中同一布局策略） */
    layerBoxAt(path: LayerPath): LayerBox | null {
        const doc = this.store.doc
        return doc ? layerBoxByPath(doc, path, this.textPolicies) : null
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
     * 开始拖动会话：记录目标路径、起点场景坐标与起始 position 偏移（ui 分支）。
     * 已在拖动中或路径无法解析时返回 false。
     */
    beginDrag(path: LayerPath, sceneX: number, sceneY: number): boolean {
        if (this.store.ui.drag) return false
        const doc = this.store.doc
        const layer = doc ? resolveLayer(doc, path) : null
        if (!layer) return false
        this.store.setDrag({
            path,
            startScene: { x: sceneX, y: sceneY },
            startPosition: { x: layer.position.x, y: layer.position.y },
        })
        return true
    }

    /**
     * 拖动进行中：position = 起点 + 场景位移。九锚点一视同仁——锚点偏移不动，
     * 只累加 x/y（x += dx/zoom 的 zoom 折算已由 toScenePoint 收口）；一次拖动的
     * 全部位移经同 mergeKey 事务并成一步历史，属性面板读同一文档数据即联动。
     */
    dragTo(sceneX: number, sceneY: number): void {
        const drag = this.store.ui.drag
        if (!drag) return
        const dx = sceneX - drag.startScene.x
        const dy = sceneY - drag.startScene.y
        this.store.transact((draft) => {
            const layer = resolveLayer(draft, drag.path)
            if (!layer) return
            // immer draft 原位写 position；类型层的 readonly 由 draft 语义解除
            const position = layer.position as { x: number; y: number }
            position.x = drag.startPosition.x + dx
            position.y = drag.startPosition.y + dy
        }, { mergeKey: DRAG_MERGE_KEY })
    }

    /** 结束拖动：闭合合并事务（下一步历史定格），会话态清空 */
    endDrag(): void {
        if (!this.store.ui.drag) return
        this.store.setDrag(null)
        this.store.closeMerge(DRAG_MERGE_KEY)
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
        const box = layerBoxByPath(doc, path, this.textPolicies)
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
     */
    updateSpec(path: LayerPath, key: readonly string[], value: unknown, options: TransactOptions = {}): void {
        this.store.transact((draft) => {
            const layer = resolveLayer(draft, path)
            if (!layer) return
            // draft 语义解除 readonly；字段形态由注册表与领域类型把关，内核透传
            writeSpecField(layer as unknown as Record<string, unknown>, key, value)
        }, options)
    }

    /**
     * 更新图层数据字段（wire data.value 的领域展开，按 type 分派）：
     * TextLayer → text、ImageLayer → src、QrCodeLayer → value；
     * 空串/null 归空语义与解码逐条对齐（Image null、Text/Qr 空串）。
     * 表/行/格无数据字段，空转。
     */
    updateData(path: LayerPath, value: string | null, options: TransactOptions = {}): void {
        this.store.transact((draft) => {
            const layer = resolveLayer(draft, path) as Draft<Layer> | null
            if (!layer) return
            switch (layer.type) {
                case 'TextLayer':
                    layer.text = value == null ? '' : String(value)
                    break
                case 'ImageLayer':
                    layer.src = value == null || value === '' ? null : String(value)
                    break
                case 'QrCodeLayer':
                    layer.value = value == null ? '' : String(value)
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
     */
    deleteLayer(path: LayerPath): void {
        if (!this.store.doc) return
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

    // ---- 撤销/重做（工单 08）：双栈语义全在 store，会话只透传查询与动作 ----

    get canUndo(): boolean {
        return this.store.canUndo
    }

    get canRedo(): boolean {
        return this.store.canRedo
    }

    undo(): void {
        this.store.undo()
    }

    redo(): void {
        this.store.redo()
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
     * 结构变更后重映射 ui 分支的路径态（选择/悬停）：路径是数组下标身份，
     * 容器 splice 后按 remapPathAfterSplice 平移，被移出子树的路径落地为清除。
     * ui 整体替换、不进历史；值未变的路径 set* 内部值等短路。
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
    }

    private onStoreChange(change: EditorChange): void {
        if (change.scope === 'doc') this.invalidate('both')
        else if (change.branch === 'viewport') this.invalidate('both')
        // 编辑会话开始/结束切换内容层的文本跳绘（textarea 接管该层呈现），双层都要重绘
        else if (change.branch === 'editing') this.invalidate('both')
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
        if (!doc || !this.backend) return
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
        // 盒（背景/边框）照常绘制，进出编辑视觉连续。图层引用来自同一棵不可变
        // 文档树，引用比较即精确判定，无需逐层比对路径。
        const editing = this.store.ui.editing
        const editingLayer = editing ? resolveLayer(doc, editing.path) : null
        renderCanvas(doc, this.backend, this.textPolicies, editingLayer
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
