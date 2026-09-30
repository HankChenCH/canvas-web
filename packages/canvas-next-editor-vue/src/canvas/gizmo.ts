/// <reference lib="dom" />

/**
 * gizmo 覆盖层画笔（工单 06）：选择框 + hover 高亮。
 *
 * 只依赖 editor 内核（红线：editor-vue 不得 import browser-renderer/canvas-next），
 * 视口变换在此按同一公式施加（scale = dpr×zoom，平移 = -cam×scale，与后端的
 * applyViewportTransform 保持一致——两侧消费同一呈现视口，不会漂移）。
 * 盒几何经 EditorSession.layerBoxAt 取自内核（与命中/绘制同一套布局策略），
 * 五原语后端与文档模型零感知（gizmo 不污染渲染契约）。
 *
 * 锁定锁样式（canvas-web-layer-lock 工单 02）：锁定的选中层**只画选中框**——
 * 「可定位、不可变换」的镜像（面板可选/属性可改，框照画）；锁定层上的 hover
 * 高亮不画（命中面已过滤锁定层，这里兜「先 hover 后锁定」的 ui 态残留，与
 * hidden 过滤同缝）。柄面：当前无八柄（resize feature 未立项），接入时柄随
 * 选中框按同一 locked 谓词折叠（工单 03 目验「有框无柄」；手势起点已有
 * beginDrag 的 isLocked 门，工单 01）。
 */
import type { EditorSession, OverlayPaintArgs, OverlayPainter } from '@hankchen/canvas-next-editor'
import { pathsEqual, rootLayerOf, type LayerPath } from '@hankchen/canvas-next-editor'

export interface GizmoOptions {
    /** 选中框颜色（缺省蓝 #2563eb） */
    selectionColor?: string
    /** hover 高亮颜色（缺省半透明蓝） */
    hoverColor?: string
    /** 选中框线宽（css 像素，屏幕观感恒定；hover 恒取其一半） */
    selectionWidth?: number
}

const DEFAULT_OPTIONS: Required<GizmoOptions> = {
    selectionColor: '#2563eb',
    hoverColor: 'rgba(37, 99, 235, 0.55)',
    selectionWidth: 2,
}

/**
 * 路径的根层是否隐藏（layer-panel-ux 工单 10 的 gizmo 过滤）：visible 住 LayerBase
 * 面，经内核 rootLayerOf 寻址原语取根层。隐藏层已退出命中面（hitTest 同门），这里
 * 兜住「面板隐藏了选中/悬停层」的 ui 态残留——框悬空画在不可见层上即是误导。
 */
function isRootHidden(doc: NonNullable<OverlayPaintArgs['doc']>, path: LayerPath): boolean {
    return rootLayerOf(doc, path)?.visible === false
}

/**
 * 场景空间绘制选区 gizmo（供组合画笔复用：调用的前提是 ctx 已施加呈现变换）。
 * 先 hover 后选中，选中框压在 hover 之上；hover 与选中同层不重复画。
 */
export function drawSelectionGizmo(
    ctx: CanvasRenderingContext2D,
    editor: EditorSession,
    args: OverlayPaintArgs,
    options?: GizmoOptions,
): void {
    const opts = { ...DEFAULT_OPTIONS, ...options }
    const { selection, hovered } = editor.store.ui
    const doc = args.doc
    if (!doc) return

    if (hovered && !pathsEqual(hovered, selection) && !isRootHidden(doc, hovered) && !editor.isLocked(hovered)) {
        const box = editor.layerBoxAt(hovered)
        if (box) {
            ctx.strokeStyle = opts.hoverColor
            ctx.lineWidth = opts.selectionWidth / 2 / args.viewport.zoom
            ctx.strokeRect(box.x, box.y, box.width, box.height)
        }
    }
    if (selection && !isRootHidden(doc, selection)) {
        const box = editor.layerBoxAt(selection)
        if (box) {
            ctx.strokeStyle = opts.selectionColor
            ctx.lineWidth = opts.selectionWidth / args.viewport.zoom
            ctx.strokeRect(box.x, box.y, box.width, box.height)
        }
    }
}

/**
 * 独立 gizmo 画笔工厂：清屏（设备空间）→ 施加呈现变换（与内容层同一呈现视口）
 * → 绘制选区 gizmo。ctx 由宿主在 surface ready 后传入并闭包持有；不需要资源
 * 标识等其它覆盖内容的宿主可直接用这一支。
 */
export function createGizmoOverlayPainter(
    editor: EditorSession,
    ctx: CanvasRenderingContext2D | null,
    options?: GizmoOptions,
): OverlayPainter {
    return (args) => {
        if (!ctx) return
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
        const scale = args.dpr * args.viewport.zoom
        ctx.setTransform(scale, 0, 0, scale, -args.viewport.x * scale, -args.viewport.y * scale)
        drawSelectionGizmo(ctx, editor, args, options)
    }
}
