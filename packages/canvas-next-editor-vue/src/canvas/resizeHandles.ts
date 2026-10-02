/**
 * 八柄光标映射（工单 07）：柄 → 指针光标的呈现语义。
 *
 * 柄的可用集合与命中测试都在内核（EditorSession.resizeHandlesAt /
 * resizeHandleAt——角色权威过滤 + 锁定折叠 + 屏幕半径折算一条缝），本模块只做
 * 光标呈现。纯数据、无 DOM。
 */
import type { ResizeHandle } from '@hankchen/canvas-next-editor'

/** 柄 → 指针光标（对角同轴同向） */
export const RESIZE_HANDLE_CURSORS: Record<ResizeHandle, string> = {
    nw: 'nwse-resize',
    se: 'nwse-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
}
