/**
 * 撤销/重做快捷键意图分类（wheel.ts 同款模式：内核纯函数，绑定层解码 DOM 事件
 * 后喂入）。语义对齐主流编辑器：
 * - Ctrl/Cmd + Z          = 撤销（Shift 变体 = 重做，mac 的 Cmd+Shift+Z 同此）
 * - Ctrl/Cmd + Y          = 重做（Windows 惯例；key 归一化大小写后匹配）
 * - 输入法合成中不触发：候选窗里的快捷键属输入法内部编辑，不归文档历史——
 *   与工单 11 的 isComposing/keyCode 229 守卫协同，绑定层折算成 composing 喂入。
 */

/** 快捷键输入：绑定层从 KeyboardEvent 折算（本类型不出现任何 DOM 类型） */
export interface HistoryShortcutInput {
    /** KeyboardEvent.key（'z'/'Z'/'y'/'Y'，大小写随 Shift 与大小写锁定） */
    key: string
    /** Ctrl（Windows/Linux）或 Cmd（macOS），两平台等价处理 */
    mod: boolean
    shift: boolean
    /** 输入法合成中：isComposing || keyCode === 229 由绑定层折算 */
    composing: boolean
}

export type HistoryShortcut = 'undo' | 'redo'

export function classifyHistoryShortcut(input: HistoryShortcutInput): HistoryShortcut | null {
    if (input.composing) return null
    if (!input.mod) return null
    const key = input.key.toLowerCase()
    if (key === 'z') return input.shift ? 'redo' : 'undo'
    if (key === 'y') return 'redo'
    return null
}
