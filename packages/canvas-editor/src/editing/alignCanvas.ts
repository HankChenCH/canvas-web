/**
 * 对齐画布 action 族的几何核（layer-align-snap 工单 01，ADR 0011）：
 * 「对齐画布/贴边/贴角」是把选中图层盒整体对齐到画布几何的通用动作——与属性
 * 面板的盒内对齐（写图层 spec 的 align 字段，移动盒内内容）是两类动作，并存
 * 不回退；不绑定任何具体图层或文档数据（专属贴角预设不做，ADR 0011）。
 *
 * 几何语义：目标盒坐标按 mode 公式确定——贴边零边距、贴角统一边距（缺省
 * ALIGN_CORNER_MARGIN_PX）、居中取精确中点；盒大于画布不钳位（领域语义：
 * position 偏移可为负、溢出摆放），公式原样落位。调用方（alignToCanvas）以
 * layerBoxAt 解析的图层盒为唯一几何来源，把「目标盒坐标 − 当前盒坐标」的位移
 * 写进 position 偏移（anchor 不动——盒坐标对 position 线性，anchorOffset 不
 * 参与差值）。全模块纯函数、无 DOM。
 */
import type { LayerBox } from '@hankchen/canvas'

/** 对齐画布 mode：居中×2 + 贴边×4 + 贴角×4 */
export type AlignToCanvasMode =
    | 'left'
    | 'right'
    | 'top'
    | 'bottom'
    | 'h-center'
    | 'v-center'
    | 'corner-tl'
    | 'corner-tr'
    | 'corner-bl'
    | 'corner-br'

/** alignToCanvas 的可选参数：贴角系统一边距 */
export interface AlignToCanvasOptions {
    /** 贴角边距（四角同一取值）；缺省 ALIGN_CORNER_MARGIN_PX */
    margin?: number
}

/** 贴角缺省边距（像素，ADR 0011 钉定的通用缺省，不做每图层可配置面） */
export const ALIGN_CORNER_MARGIN_PX = 40

/** 目标盒坐标的几何入参（LayerBox 的位置尺寸切片） */
export type AlignBoxGeometry = Pick<LayerBox, 'x' | 'y' | 'width' | 'height'>

/**
 * mode → 对齐后的目标盒左上坐标（mode 只动一个轴时另一轴保持原值）：贴边零边距
 * （left x=0、right x=画布宽−盒宽……）、居中 = (画布尺寸−盒尺寸)/2（精确值不
 * 取整）、贴角 = 统一边距。盒大于画布不钳位，负值即向反侧溢出。未知 mode 返回
 * null（运行时垃圾输入的空转面；TS 层由联合类型收窄）。
 */
export function alignToCanvasTarget(
    mode: AlignToCanvasMode,
    box: AlignBoxGeometry,
    canvasWidth: number,
    canvasHeight: number,
    margin: number,
): { x: number; y: number } | null {
    switch (mode) {
        case 'left':
            return { x: 0, y: box.y }
        case 'right':
            return { x: canvasWidth - box.width, y: box.y }
        case 'top':
            return { x: box.x, y: 0 }
        case 'bottom':
            return { x: box.x, y: canvasHeight - box.height }
        case 'h-center':
            return { x: (canvasWidth - box.width) / 2, y: box.y }
        case 'v-center':
            return { x: box.x, y: (canvasHeight - box.height) / 2 }
        case 'corner-tl':
            return { x: margin, y: margin }
        case 'corner-tr':
            return { x: canvasWidth - box.width - margin, y: margin }
        case 'corner-bl':
            return { x: margin, y: canvasHeight - box.height - margin }
        case 'corner-br':
            return { x: canvasWidth - box.width - margin, y: canvasHeight - box.height - margin }
        default:
            return null
    }
}
