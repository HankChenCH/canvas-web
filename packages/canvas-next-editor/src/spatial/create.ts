/**
 * 画拉建层橡皮筋求位几何（drag-create 工单 01，术语见根 CONTEXT.md「画拉建层」
 * 「武装」词条）。
 *
 * 拖拽期两点正规化出橡皮筋矩形（x = min、width = |dx|，y 同，反向拖不翻转）；
 * QrCodeLayer 钳 height := width（高随宽从动保持方形，八柄缩放「QR 从动轴不
 * 采纳」同门）；橡皮筋左右/上下缘各两点进 resolveSnapPoints——吸附数学零新增，
 * 命中修正整矩形平移并入几何（两点正规化与 QR 方形在修正后原样保持）。死区常量
 * 屏幕像素口径同 SNAP_THRESHOLD_SCREEN_PX（场景阈值 = 阈值 / zoom，缩放无关）。
 * 全模块纯函数、无 DOM；会话编排（武装/落库/解除）在会话门面。
 */
import type { LayerType } from '@hankchen/canvas-next'

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
 * QR 钳 height := width → 左右/上下缘各两点对轴集合求位（已有已对齐 delta=0
 * 也回显命中轴的语义，dragTo/resizeTo 同门）→ 修正整矩形平移并入。钳方先于
 * 吸附——QR 的方边（y + width）才是真实的下缘吸附位点。
 */
export function createRubberBandRect(
    type: LayerType,
    start: Point,
    current: Point,
    axes: readonly SnapAxis[],
    threshold: number,
): CreateRectResult {
    const x = Math.min(start.x, current.x)
    const y = Math.min(start.y, current.y)
    const width = Math.abs(current.x - start.x)
    const height = type === 'QrCodeLayer' ? width : Math.abs(current.y - start.y)
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
