/**
 * 快捷键注册表（工单 14）：键位→action 的**集中声明**。
 *
 * 注册表即数据（声明式 combo → action 条目），分类器只做匹配与让路；撤销/重做
 * 快捷键自工单 08 的 historyShortcut 并入此表（单表声明，消除双分类器）。缺省集
 * 跟随 excalidraw 惯例并按 v1 单选裁剪：工具切换/全选不可用（单选无对象），剪切
 * 未纳入（工单范围 = 复制/粘贴/副本/删除/撤销/重做）；置顶/置底走右键菜单无键位。
 * 重命名 F2 自 layer-panel-ux 工单 09 入表（分派到选中根层的重命名编辑会话）。
 *
 * 让路规则（绑定层折算输入，分类器统一裁决——全部有测试锁定）：
 * - 输入法合成中（isComposing || keyCode 229 折算为 composing）：候选窗里的按键
 *   属输入法内部编辑；
 * - 文本编辑态（ui.editing ≠ null 折算为 editing）：焦点路由进 textarea——Delete
 *   不得删图层、Ctrl/Cmd+Z 撤「输入」而非文档（原生 undo）；
 * - 焦点在可编辑元素（input/textarea/select/contentEditable 折算为
 *   editableTarget）：属性面板/工具栏输入框的原生编辑优先（Delete 删的是输入框
 *   里的字符，不是图层）——重命名输入框内按键同样由此让路。
 *
 * 本模块无 DOM：KeyboardEvent → 输入的折算归绑定层（useShortcuts）。
 */

/** 快捷键动作（会话分派面 executeShortcut 的入参域） */
export type EditorShortcutAction =
    | 'undo'
    | 'redo'
    | 'copy'
    | 'paste'
    | 'duplicate'
    | 'delete'
    | 'rename'
    | 'toggleRulers'
    | 'toggleLayerLock'
    | 'toggleLayerVisibility'

/** 键位组合声明：key 为 KeyboardEvent.key 的小写归一形态；mod/shift 精确匹配 */
export interface ShortcutCombo {
    key: string
    /** Ctrl（Windows/Linux）或 Cmd（macOS），两平台等价 */
    mod: boolean
    shift: boolean
}

/** 注册表条目：键位组合 → 动作 */
export interface EditorShortcutBinding {
    readonly combo: ShortcutCombo
    readonly action: EditorShortcutAction
}

/**
 * 缺省注册表（excalidraw 惯例、v1 单选裁剪）。undo 与 redo 只差 shift，故
 * shift 精确匹配（不能忽略）。
 */
export const DEFAULT_EDITOR_SHORTCUTS: readonly EditorShortcutBinding[] = [
    { combo: { key: 'z', mod: true, shift: false }, action: 'undo' },
    { combo: { key: 'z', mod: true, shift: true }, action: 'redo' },
    { combo: { key: 'y', mod: true, shift: false }, action: 'redo' },
    { combo: { key: 'c', mod: true, shift: false }, action: 'copy' },
    { combo: { key: 'v', mod: true, shift: false }, action: 'paste' },
    { combo: { key: 'd', mod: true, shift: false }, action: 'duplicate' },
    { combo: { key: 'delete', mod: false, shift: false }, action: 'delete' },
    { combo: { key: 'backspace', mod: false, shift: false }, action: 'delete' },
    { combo: { key: 'f2', mod: false, shift: false }, action: 'rename' },
    // 标尺显隐（ruler-guides-snap 工单 01）：裸键 + shift（mod 变体不占用，
    // 不抢浏览器刷新等既有语义）
    { combo: { key: 'r', mod: false, shift: true }, action: 'toggleRulers' },
    // 锁定 ⇧⌘L / 显隐 ⇧⌘H（canvas-web-layer-lock 工单 02，显隐键位系 feature-status
    // §一挂账补位）：行业趋同（Figma/Sketch 同款）；mod+shift 组合不抢浏览器
    // ⌘L 地址栏、⌘H 历史页既有语义
    { combo: { key: 'l', mod: true, shift: true }, action: 'toggleLayerLock' },
    { combo: { key: 'h', mod: true, shift: true }, action: 'toggleLayerVisibility' },
]

/** 快捷键输入：绑定层从 KeyboardEvent 与会话状态折算（本类型不出现任何 DOM 类型） */
export interface EditorShortcutInput {
    /** KeyboardEvent.key（大小写随 Shift 与大小写锁定，分类器归一） */
    key: string
    mod: boolean
    shift: boolean
    /** 输入法合成中：isComposing || keyCode === 229 由绑定层折算 */
    composing: boolean
    /** 文本编辑态（ui.editing ≠ null）：全部文档快捷键让路给 textarea */
    editing: boolean
    /** 焦点在可编辑元素（输入框/可编辑节点）：让路给原生编辑 */
    editableTarget: boolean
}

/**
 * 键位 → 动作分类：让路规则优先（合成中/编辑态/输入态一律 null），再按注册表
 * 匹配（key 小写归一后与 combo 全等比较）。未命中返回 null。绑定集可注入
 * （宿主扩展键位；缺省 DEFAULT_EDITOR_SHORTCUTS）。
 */
export function classifyEditorShortcut(
    input: EditorShortcutInput,
    bindings: readonly EditorShortcutBinding[] = DEFAULT_EDITOR_SHORTCUTS,
): EditorShortcutAction | null {
    if (input.composing || input.editing || input.editableTarget) return null
    const key = input.key.toLowerCase()
    for (const binding of bindings) {
        if (
            binding.combo.key === key &&
            binding.combo.mod === input.mod &&
            binding.combo.shift === input.shift
        ) {
            return binding.action
        }
    }
    return null
}
