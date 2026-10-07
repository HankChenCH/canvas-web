/**
 * 滚轮意图分类（工单 05，三态）。纯函数：输入只取事件修饰键快照，
 * 由绑定层（CanvasSurface）把 WheelEvent 映射进来后在内核判定。
 *
 * 语义（spec 拍板）：ctrl/cmd + wheel 与触控板双指捏合 = 缩放（浏览器把
 * pinch 一律派发为 ctrl+wheel）、plain wheel = 平移、shift + wheel = 横向平移。
 */

export type WheelIntent = 'zoom' | 'pan' | 'pan-x'

/** WheelEvent 的语义字段快照（内核不持有 DOM 事件类型） */
export interface WheelInput {
    ctrlKey: boolean
    metaKey: boolean
    shiftKey: boolean
}

export function classifyWheel(input: WheelInput): WheelIntent {
    // 缩放优先于 shift：捏合手势（ctrl+wheel）不因 shift 串台为横移
    if (input.ctrlKey || input.metaKey) return 'zoom'
    if (input.shiftKey) return 'pan-x'
    return 'pan'
}
