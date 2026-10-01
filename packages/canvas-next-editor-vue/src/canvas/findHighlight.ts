/// <reference lib="dom" />

/**
 * findHighlight：查找命中的 overlay 轮廓画笔（canvas-web-find-replace 工单 03，
 * spec 决策 6）。消费内核派生口（listFindMatches + findCursor 读侧钳位）与
 * layerBoxAt（模板子树路径盒经预览视图解析——内核 boxByPath 同源，gizmo/命中
 * 同一套布局策略），逐命中画轮廓框，当前命中 accent 强调（加粗 + 淡填充）。
 *
 * 与 gizmo 画笔的两处分立（都是 spec 决策的刻意语义，勿「对齐」）：
 * - 隐藏层命中照画——隐藏是渲染排除语义非保护语义（spec 决策 1），gizmo 的
 *   hidden 过滤兜的是「框悬空画在不可见层上误导」，命中高亮恰是「这些层里
 *   也有」的告知面；
 * - 查找会话关闭（ui.find.open）不画——closeFind 后高亮即撤，查询词保留是
 *   会话态语义、不是高亮语义。
 *
 * 调用契约与 drawSelectionGizmo 同门：ctx 已由宿主施加呈现变换（场景坐标，
 * scale = dpr×zoom、平移 = -cam×scale）；清屏与变换归宿主组合的画笔序
 * （playground overlayPainter 先例——资源标识 → 命中高亮 → 选区 gizmo，
 * 当前命中与选区框重叠时选区框压上）。
 */
import type { EditorSession, OverlayPaintArgs } from '@hankchen/canvas-next-editor'

export interface FindHighlightOptions {
    /** 非当前命中轮廓色（缺省琥珀 #f59e0b——与选择框蓝分色） */
    matchColor?: string
    /** 当前命中轮廓色（缺省 accent 天蓝 #38bdf8，浮层令牌 --cn-accent 同值） */
    currentColor?: string
    /** 当前命中淡填充（缺省 rgba(56, 189, 248, 0.12)；空串关闭填充） */
    currentFill?: string
    /** 轮廓线宽（css 像素，屏幕观感恒定；当前命中取其 1.5 倍） */
    lineWidth?: number
}

const DEFAULT_OPTIONS: Required<FindHighlightOptions> = {
    matchColor: '#f59e0b',
    currentColor: '#38bdf8',
    currentFill: 'rgba(56, 189, 248, 0.12)',
    lineWidth: 2,
}

export function drawFindMatches(
    ctx: CanvasRenderingContext2D,
    editor: EditorSession,
    args: OverlayPaintArgs,
    options?: FindHighlightOptions,
): void {
    if (!args.doc || !editor.store.ui.find.open) return
    const opts = { ...DEFAULT_OPTIONS, ...options }
    const matches = editor.listFindMatches()
    if (matches.length === 0) return
    const cursor = editor.findCursor
    for (let i = 0; i < matches.length; i += 1) {
        const box = editor.layerBoxAt(matches[i]!.path)
        if (!box) continue
        const isCurrent = i === cursor
        if (isCurrent && opts.currentFill) {
            ctx.fillStyle = opts.currentFill
            ctx.fillRect(box.x, box.y, box.width, box.height)
        }
        ctx.strokeStyle = isCurrent ? opts.currentColor : opts.matchColor
        ctx.lineWidth = (isCurrent ? opts.lineWidth * 1.5 : opts.lineWidth) / args.viewport.zoom
        ctx.strokeRect(box.x, box.y, box.width, box.height)
    }
}
