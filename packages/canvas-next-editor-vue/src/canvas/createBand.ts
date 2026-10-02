/// <reference lib="dom" />

/**
 * 画拉建层橡皮筋覆盖层画笔（drag-create 工单 02）：半透明底 + 虚线矩形 +
 * W×H 尺寸气泡。gizmo 同缝——场景空间绘制，宿主组合进 overlayPainter 时施加
 * 与内容层同一呈现变换（视口变换同公式，见 gizmo.ts 模块头），会话态直读内核
 * ui.create（drag-create 工单 01：rect 是 createTo 求位产物——两点正规化 +
 * QR 钳方 + 吸附修正已并入，此处零求位零命中查询）。吸附线回显不走这里：
 * 命中轴在 ui.snapAxes，GuidesOverlay 既有通道回显（零新呈现代码）。
 *
 * 屏幕观感恒定口径同 gizmo 柄：线宽/虚线段/间隙/圆角/字号皆 css px / zoom
 * 折算场景单位，任意缩放下屏幕读数不变。零尺寸矩形（按下未动）不画——不出现
 * 「0 × 0」气泡噪声；死区内微位移照画（瞬时态，endCreate 落库分流在内核）。
 */
import type { EditorSession, OverlayPaintArgs } from '@hankchen/canvas-next-editor'

/** 橡皮筋描边色（gizmo 选中框同族蓝）与半透明底 */
const BAND_COLOR = '#2563eb'
const BAND_FILL = 'rgba(37, 99, 235, 0.08)'
/** 虚线段/间隔与线宽（css px，屏幕恒定；场景值 = 值 / zoom） */
const BAND_DASH_PX = [4, 3]
const BAND_WIDTH_PX = 1
/** 气泡：暗底白字胶囊（drop-hint/ContextMenu 同族 #0b1220 底），挂矩形右下角 */
const BUBBLE_BG = 'rgba(11, 18, 32, 0.9)'
const BUBBLE_TEXT = '#ffffff'
const BUBBLE_FONT_PX = 11
const BUBBLE_PAD_X_PX = 6
const BUBBLE_PAD_Y_PX = 3
const BUBBLE_RADIUS_PX = 3
const BUBBLE_GAP_PX = 6

/**
 * 绘制画拉橡皮筋（供组合画笔复用：调用的前提是 ctx 已施加呈现变换）。
 * 无会话或零尺寸矩形（按下未动）零笔画。
 */
export function drawCreateRubberBand(
    ctx: CanvasRenderingContext2D,
    editor: EditorSession,
    args: OverlayPaintArgs,
): void {
    const gesture = editor.store.ui.create
    if (!gesture) return
    const { x, y, width, height } = gesture.rect
    if (width === 0 && height === 0) return
    const zoom = args.viewport.zoom

    // 橡皮筋：半透明底 + 虚线矩形（线宽/虚线屏幕恒定同 gizmo 线宽口径）
    ctx.fillStyle = BAND_FILL
    ctx.fillRect(x, y, width, height)
    ctx.strokeStyle = BAND_COLOR
    ctx.lineWidth = BAND_WIDTH_PX / zoom
    ctx.setLineDash(BAND_DASH_PX.map((segment) => segment / zoom))
    ctx.strokeRect(x, y, width, height)
    ctx.setLineDash([])

    // W×H 尺寸气泡：暗底胶囊挂矩形右下角外侧，屏幕观感恒定（字号/留白 / zoom）
    const fontPx = BUBBLE_FONT_PX / zoom
    const padX = BUBBLE_PAD_X_PX / zoom
    const padY = BUBBLE_PAD_Y_PX / zoom
    ctx.font = `${fontPx}px system-ui, sans-serif`
    const label = `${Math.round(width)} × ${Math.round(height)}`
    const boxWidth = ctx.measureText(label).width + padX * 2
    const boxHeight = fontPx + padY * 2
    const boxX = x + width + BUBBLE_GAP_PX / zoom
    const boxY = y + height + BUBBLE_GAP_PX / zoom
    ctx.fillStyle = BUBBLE_BG
    ctx.beginPath()
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, BUBBLE_RADIUS_PX / zoom)
    ctx.fill()
    ctx.fillStyle = BUBBLE_TEXT
    ctx.textBaseline = 'middle'
    ctx.fillText(label, boxX + padX, boxY + boxHeight / 2)
}
