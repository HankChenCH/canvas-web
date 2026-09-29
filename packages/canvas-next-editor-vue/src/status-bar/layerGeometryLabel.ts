/**
 * 状态栏坐标尺寸段的展示格式化（playground-canvas-first 工单 01，纯函数）：
 * `x=… y=… · 宽×高 · 锚点 …`——x/y/锚点读文档 position，宽×高读解析盒
 * （autoWidth/autoHeight 的实测盒，非 shape 声明值）；小数取整保读数稳定
 * （拖动中 position 为浮点场景位移，原型 mockup 同为整数读数）。
 */
import type { Anchor } from '@hankchen/canvas-next-editor'

/** 锚点中文徽标：九宫行×列命名（原型 mockup「左上锚」同族，「锚」后缀由格式化拼接） */
const ANCHOR_LABELS: Record<Anchor, string> = {
    'top-left': '左上',
    top: '中上',
    'top-right': '右上',
    left: '左中',
    center: '正中',
    right: '右中',
    'bottom-left': '左下',
    bottom: '中下',
    'bottom-right': '右下',
}

/** 坐标段入参的最小结构：文档 position（LayerPosition 的 position 字段子集） */
export interface GeometryPosition {
    readonly x: number
    readonly y: number
    readonly anchor: Anchor
}

/** 坐标段入参的最小结构：解析盒（LayerBox 子集，只消费宽高） */
export interface GeometryBox {
    readonly width: number
    readonly height: number
}

export function formatLayerGeometry(position: GeometryPosition, box: GeometryBox): string {
    return `x=${Math.round(position.x)} y=${Math.round(position.y)} · ${Math.round(box.width)}×${Math.round(box.height)} · ${ANCHOR_LABELS[position.anchor]}锚`
}
