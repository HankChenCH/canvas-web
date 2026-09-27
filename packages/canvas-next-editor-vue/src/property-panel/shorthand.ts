/**
 * 内边距/边框简写的模式纯函数（layer-panel-ux 工单 04）：CSS 风格 1/2/4 值模式
 * 的推导与收缩规整。纯 UI 派生——只吃/吐领域 Padding/Border 值对象，不触碰
 * 图层与提交管线（wire 数据面不变，提交仍是完整四边对象）；零 Vue 依赖，
 * 同 fieldSchema 先例在 Node 无 DOM 环境测试。
 *
 * 模式语义：
 * - 1 值：四边共用（代表值 = 上）；2 值：上下 | 左右（代表值 = 上 | 左）；
 * - 推导「初始模式」：数据最规整的能表达形态（全等→1，成对→2，否则→4）；
 * - 收缩（4→2→1）取代表值立即写回规整，数据不因纯 UI 操作失去一致性；
 * - 展开（1→2→4）无需改数据——完整四边对象本就覆盖高模式的表达。
 */
import type { Border, BorderSide, Padding } from '@hankchen/canvas-next-editor'

/** 简写值模式：1 = 四边一框、2 = 上下|左右两框、4 = 四边各一框 */
export type ShorthandMode = 1 | 2 | 4

/** 边名（Padding/Border 四键同名，两域共用一张框布局表） */
export type SideName = 'top' | 'bottom' | 'left' | 'right'

/** 一框 = 代表边（显示与输入取值）+ 收编边清单（提交时同写代表边值） */
export interface ShorthandBox {
    readonly label: string
    readonly rep: SideName
    readonly sides: readonly SideName[]
}

/** 各模式的框布局：1 = 四边一框（代表值上）；2 = 上下|左右（代表值上|左）；4 = 四框 */
export const SHORTHAND_BOXES: Record<ShorthandMode, readonly ShorthandBox[]> = {
    1: [{ label: '四边', rep: 'top', sides: ['top', 'bottom', 'left', 'right'] }],
    2: [
        { label: '上下', rep: 'top', sides: ['top', 'bottom'] },
        { label: '左右', rep: 'left', sides: ['left', 'right'] },
    ],
    4: [
        { label: '上', rep: 'top', sides: ['top'] },
        { label: '下', rep: 'bottom', sides: ['bottom'] },
        { label: '左', rep: 'left', sides: ['left'] },
        { label: '右', rep: 'right', sides: ['right'] },
    ],
}

/** 循环次序 1→2→4→1（单按钮循环的唯一合法迁移） */
export function nextShorthandMode(mode: ShorthandMode): ShorthandMode {
    return mode === 1 ? 2 : mode === 2 ? 4 : 1
}

// ---- 内边距（四边全数值） ----

/** 四值全等→1；上===下 且 左===右→2；否则→4（严格相等，浮点按原值比较） */
export function derivePaddingMode(padding: Padding): ShorthandMode {
    if (padding.top === padding.bottom && padding.bottom === padding.left && padding.left === padding.right) {
        return 1
    }
    if (padding.top === padding.bottom && padding.left === padding.right) return 2
    return 4
}

/** 收缩写回规整：取代表值（上/左）折叠到目标模式的规整形态；4 = 原样 */
export function shrinkPadding(padding: Padding, to: ShorthandMode): Padding {
    if (to === 1) {
        const { top } = padding
        return { top, bottom: top, left: top, right: top }
    }
    if (to === 2) {
        const { top, left } = padding
        return { top, bottom: top, left, right: left }
    }
    return padding
}

export function samePadding(a: Padding, b: Padding): boolean {
    return a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right
}

// ---- 边框（某边 null = 该边关；null 参与相等比较） ----

function sameSide(a: BorderSide | null, b: BorderSide | null): boolean {
    if (a === null || b === null) return a === b
    return a.width === b.width && a.color === b.color
}

/** 四边全 null 或全等→1；上下等且左右等（含 null 相等比较）→2；否则→4 */
export function deriveBorderMode(border: Border): ShorthandMode {
    const { top, bottom, left, right } = border
    if (
        (top === null && bottom === null && left === null && right === null) ||
        (top !== null && sameSide(top, bottom) && sameSide(top, left) && sameSide(top, right))
    ) {
        return 1
    }
    if (sameSide(top, bottom) && sameSide(left, right)) return 2
    return 4
}

/**
 * 收缩写回规整：上下取上、左右取左；收缩到 1 全取上——上为 null 即全 null
 * （无边框）。每边发独立对象副本，不共享引用。
 */
export function shrinkBorder(border: Border, to: ShorthandMode): Border {
    const copy = (side: BorderSide | null): BorderSide | null => (side === null ? null : { ...side })
    if (to === 1) {
        const top = copy(border.top)
        return { top, bottom: copy(top), left: copy(top), right: copy(top) }
    }
    if (to === 2) {
        const top = copy(border.top)
        const left = copy(border.left)
        return { top, bottom: copy(top), left, right: copy(left) }
    }
    return border
}

export function sameBorder(a: Border, b: Border): boolean {
    return (
        sameSide(a.top, b.top) &&
        sameSide(a.bottom, b.bottom) &&
        sameSide(a.left, b.left) &&
        sameSide(a.right, b.right)
    )
}
