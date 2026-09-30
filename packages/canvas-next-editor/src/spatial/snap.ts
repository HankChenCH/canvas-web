/**
 * 拖动吸附数学 + 参考线轴几何（ruler-guides-snap 工单 01，ADR 0012）。
 *
 * 吸附（snap）语义（术语见根 CONTEXT.md）：拖动图层时其盒缘与中心（九点）自动
 * 对齐到吸附源的编辑器行为——源为其他可见根层盒的缘与中心、画布水平/垂直中轴、
 * 参考线轴；画布四边不设轴（精确贴边归第一批对齐画布按钮，ADR 0011）。命中阈值
 * 按屏幕像素常量计（缩放无关，换算场景值后使用），多轴命中取最近，一次拖动至多
 * 吸一垂直轴 + 一水平轴。吸附是拖动过程的连续行为，与对齐画布的一次性动作分立。
 *
 * 参考线（guide）是使用者从标尺拖出的会话级对位轴：住内核 ui 分支——不进历史、
 * 不写 graph、保存零改动；本模块只定义其形态与「供轴」，增删动作在会话门面。
 * 全模块纯函数、无 DOM。
 */
import { resolveLayerBox, type Canvas, type LayerBox, type TextLayoutPolicies } from '@hankchen/canvas-next'

/** 轴向：vertical = 竖直线（修正 x）、horizontal = 水平线（修正 y），场景坐标 */
export type GuideOrientation = 'vertical' | 'horizontal'

/** 参考线：会话级对位轴（id 会话内自增，position 为场景坐标） */
export interface Guide {
    readonly id: number
    readonly orientation: GuideOrientation
    readonly position: number
}

/** 吸附轴来源：其他可见根层盒 / 画布中轴 / 参考线 */
export type SnapAxisSource = 'layer' | 'canvas-center' | 'guide'

/** 吸附轴：orientation 为线的方向，position 为场景坐标（源与命中同形） */
export interface SnapAxis {
    readonly orientation: GuideOrientation
    readonly position: number
    readonly source: SnapAxisSource
}

/** 吸附求位的盒几何入参（LayerBox 的位置尺寸切片） */
export type SnapBoxGeometry = Pick<LayerBox, 'x' | 'y' | 'width' | 'height'>

/** 吸附求位结果：两轴修正量 + 命中轴（至多一垂直 + 一水平，吸附线呈现消费） */
export interface SnapResolution {
    readonly dx: number
    readonly dy: number
    readonly axes: readonly SnapAxis[]
}

/** 拖动吸附屏幕阈值（css 像素，缩放无关；场景阈值 = 阈值 / zoom） */
export const SNAP_THRESHOLD_SCREEN_PX = 6

/** 屏幕阈值 → 场景阈值（放大时场景窗口收紧，屏幕手感恒定） */
export function snapThresholdScene(zoom: number): number {
    return SNAP_THRESHOLD_SCREEN_PX / zoom
}

/**
 * 吸附层盒来源：可见根层盒（渲染端整层跳过、命中测试整子树退出——同一 visible
 * 过滤，hitTest 同款），并排除拖动层自身根（自缘不供轴，防自身 delta 0 命中噪声）。
 */
export function visibleRootBoxes(
    doc: Canvas,
    excludeRootIndex: number,
    policies?: TextLayoutPolicies,
): LayerBox[] {
    const boxes: LayerBox[] = []
    for (let i = 0; i < doc.layers.length; i += 1) {
        if (i === excludeRootIndex) continue
        const layer = doc.layers[i]!
        if (layer.visible === false) continue
        boxes.push(resolveLayerBox(layer, 0, 0, doc.width, doc.height, policies))
    }
    return boxes
}

/**
 * 吸附轴集合：根层盒左/中/右 + 上/中/下缘（source=layer）+ 画布水平/垂直中轴
 * （source=canvas-center，四边不设轴）+ 参考线轴（source=guide）。集合次序即
 * 多轴平局时的取先次序：层盒 → 画布中轴 → 参考线。
 */
export function snapAxesFromBoxes(
    canvasWidth: number,
    canvasHeight: number,
    boxes: readonly LayerBox[],
    guides: readonly Guide[],
): SnapAxis[] {
    const axes: SnapAxis[] = []
    for (const box of boxes) {
        axes.push(
            { orientation: 'vertical', position: box.x, source: 'layer' },
            { orientation: 'vertical', position: box.x + box.width / 2, source: 'layer' },
            { orientation: 'vertical', position: box.x + box.width, source: 'layer' },
            { orientation: 'horizontal', position: box.y, source: 'layer' },
            { orientation: 'horizontal', position: box.y + box.height / 2, source: 'layer' },
            { orientation: 'horizontal', position: box.y + box.height, source: 'layer' },
        )
    }
    axes.push(
        { orientation: 'vertical', position: canvasWidth / 2, source: 'canvas-center' },
        { orientation: 'horizontal', position: canvasHeight / 2, source: 'canvas-center' },
    )
    for (const guide of guides) {
        axes.push({ orientation: guide.orientation, position: guide.position, source: 'guide' })
    }
    return axes
}

/**
 * 单轴求位：拖动盒在该轴向上的三点（左/中/右或上/中/下）对全部同向轴取
 * |delta| 最小且 ≤ 阈值的命中；无命中返回 null。平局取先遇到的轴（集合次序）。
 */
function nearestAxisHit(
    points: readonly number[],
    axes: readonly SnapAxis[],
    orientation: GuideOrientation,
    threshold: number,
): { delta: number; axis: SnapAxis } | null {
    let best: { delta: number; axis: SnapAxis } | null = null
    for (const axis of axes) {
        if (axis.orientation !== orientation) continue
        for (const point of points) {
            const delta = axis.position - point
            const distance = Math.abs(delta)
            if (distance > threshold) continue
            if (best === null || distance < Math.abs(best.delta)) best = { delta, axis }
        }
    }
    return best
}

/**
 * 拖动盒九点吸附求位：盒左/中/右三点对垂直轴、上/中/下三点对水平轴各取最近
 * 命中（已对齐 delta=0 也回显命中轴——吸附线呈现「已对齐」状态）；返回的修正量
 * 由调用方并入本次拖动的 position 写入（同一事务、同一历史步）。
 */
export function resolveSnap(
    box: SnapBoxGeometry,
    axes: readonly SnapAxis[],
    threshold: number,
): SnapResolution {
    const vertical = nearestAxisHit(
        [box.x, box.x + box.width / 2, box.x + box.width],
        axes,
        'vertical',
        threshold,
    )
    const horizontal = nearestAxisHit(
        [box.y, box.y + box.height / 2, box.y + box.height],
        axes,
        'horizontal',
        threshold,
    )
    return {
        dx: vertical ? vertical.delta : 0,
        dy: horizontal ? horizontal.delta : 0,
        axes: [
            ...(vertical ? [vertical.axis] : []),
            ...(horizontal ? [horizontal.axis] : []),
        ],
    }
}
