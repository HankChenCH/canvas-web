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
import { renderCanvas, type Canvas, type RenderBackend, type TextLayoutPolicies } from '@hankchen/canvas-next'
import type { PreviewViewportTransform, ViewportAwareBackend } from '@hankchen/canvas-next-browser-renderer'

import {
    DEFAULT_ZOOM_BOUNDS,
    fitViewport,
    nextZoomByWheel,
    panBy,
    snapViewportToPhysicalPixels,
    zoomAtPoint,
    type Size,
    type Viewport,
    type ZoomBounds,
} from './camera'
import { EditorStore, type EditorChange } from './store'

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

    private onStoreChange(change: EditorChange): void {
        if (change.scope === 'doc') this.invalidate('both')
        else if (change.branch === 'viewport') this.invalidate('both')
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
        renderCanvas(doc, this.backend, this.textPolicies)
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
