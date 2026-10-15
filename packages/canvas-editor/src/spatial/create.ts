/**
 * 画拉建层橡皮筋求位几何（drag-create 工单 01，术语见根 CONTEXT.md「画拉建层」
 * 「武装」词条）。
 *
 * 拖拽期两点正规化出橡皮筋矩形（x = min、width = |dx|，y 同，反向拖不翻转）；
 * QrCodeLayer 钳 height := width（高随宽从动保持方形，八柄缩放「QR 从动轴不
 * 采纳」同门）；可选 ratio（image-ratio-preset 工单 01）长轴驱动钳制橡皮筋到
 * 目标宽高比；橡皮筋左右/上下缘各两点进 resolveSnapPoints——吸附数学零新增，
 * 命中修正整矩形平移并入几何（两点正规化、QR 方形与比例钳在修正后原样保持）。
 * 死区常量屏幕像素口径同 SNAP_THRESHOLD_SCREEN_PX（场景阈值 = 阈值 / zoom，缩放
 * 无关）。全模块纯函数、无 DOM；会话编排（武装/落库/解除）在会话门面。
 */
import type { LayerType } from '@hankchen/canvas'

import type { Point } from './camera'
import { resolveSnapPoints, type SnapAxis, type SnapBoxGeometry } from './snap'

/** 画拉死区阈值（css 像素，缩放无关；场景阈值 = 阈值 / zoom）：位移不越过即视作
 *  点击，endCreate 回落「缺省尺寸、左上角对准点击点」，不产生零尺寸层 */
export const CREATE_DEAD_ZONE_SCREEN_PX = 4

/** 橡皮筋求位结果：并入吸附修正后的矩形 + 命中轴（至多一垂直 + 一水平） */
export interface CreateRectResult {
    readonly rect: SnapBoxGeometry
    readonly axes: readonly SnapAxis[]
}

/**
 * 画拉橡皮筋求位：两点正规化（起点场景坐标 + 当前点 → 左上角原点矩形）→
 * QR 钳 height := width / ratio 长轴驱动钳（两者互斥：QR 层忽略 ratio，恒方
 * 语义不动——调用缝只对 ImageLayer 传 ratio）→ 左右/上下缘各两点对轴集合求位
 * （已有已对齐 delta=0 也回显命中轴的语义，dragTo/resizeTo 同门）→ 修正整矩形
 * 平移并入。钳先于吸附——QR 的方边与比例钳的派生边才是真实的吸附位点。
 *
 * ratio 钳（image-ratio-preset 工单 01，spec 决策 3）长轴驱动：|Δx| ≥ |Δy| 时
 * 宽驱动（height = round(width × h ÷ w)，Math.round 对正数 half-up），否则高
 * 驱动（width = round(height × w ÷ h)）；钳制在正规化后，反向拖取绝对值镜像
 * 天然覆盖。
 */
export function createRubberBandRect(
    type: LayerType,
    start: Point,
    current: Point,
    axes: readonly SnapAxis[],
    threshold: number,
    ratio?: { w: number; h: number } | null,
): CreateRectResult {
    const x = Math.min(start.x, current.x)
    const y = Math.min(start.y, current.y)
    const dx = Math.abs(current.x - start.x)
    const dy = Math.abs(current.y - start.y)
    let width = dx
    let height = dy
    if (type === 'QrCodeLayer') {
        height = width
    } else if (ratio) {
        if (dx >= dy) {
            height = Math.round((dx * ratio.h) / ratio.w)
        } else {
            width = Math.round((dy * ratio.w) / ratio.h)
        }
    }
    const resolution = resolveSnapPoints(
        { vertical: [x, x + width], horizontal: [y, y + height] },
        axes,
        threshold,
    )
    return {
        rect: { x: x + resolution.dx, y: y + resolution.dy, width, height },
        axes: resolution.axes,
    }
}
