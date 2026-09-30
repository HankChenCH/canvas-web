/**
 * 快捷键注册表（工单 14）：键位→action 的**集中声明**。
 *
 * 注册表即数据（声明式 combo → action 条目），分类器只做匹配与让路；撤销/重做
 * 快捷键自工单 08 的 historyShortcut 并入此表（单表声明，消除双分类器）。缺省集
 * 跟随 excalidraw 惯例并按 v1 单选裁剪：工具切换/全选不可用（单选无对象）。重命
 * 名 F2 自 layer-panel-ux 工单 09 入表（分派到选中根层的重命名编辑会话）。z 序与
 * 缩放键位自 kbd-nav 工单 01 入表（⌘]/⌘[ 前移/后移、⌥⌘]/⌥⌘[ 置顶/置底——Canva/
 * Sketch 同构，弃 Excalidraw ⌘⇧ 系 Safari 换 tab 键位拦截不可靠；⌘0 复位 100%、
 * ⇧1/⇧2 适应画布/选区）。条目携带 label（中文短句）/ group（展示归组）元数据：
 * 注册表是键位的唯一事实源，帮助面板（kbd-nav 工单 04）直读渲染，后续动作自动
 * 入面板。
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
 * 键匹配双通道：缺省按 KeyboardEvent.key（小写归一）匹配；声明 code 的条目改按
 * KeyboardEvent.code（物理键）匹配——mac ⌥ 修饰下 key 是变体字符（US 布局 ⌥]
 * 非 ']'）、Shift+数字是标点变体（US 布局 ⇧1 为 '!'），key 不可靠。mod/shift/alt
 * 全部精确匹配（undo/redo 只差 shift 的先例扩展到 alt：⌘] 条目不吞 ⌥⌘] 按键，
 * 让路给 code 条目）。
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
    | 'bringForward'
    | 'sendBackward'
    | 'bringToFront'
    | 'sendToBack'
    | 'zoomReset'
    | 'fitToSurface'
    | 'fitToSelection'

/**
 * 帮助面板的展示归组（kbd-nav 工单 04）：分节渲染的键位归类。展示名归 Vue，
 * 这里只定枚举域。
 */
export type EditorShortcutGroup = 'history' | 'clipboard' | 'layer' | 'view' | 'help'

/**
 * 键位组合声明：key 为 KeyboardEvent.key 的小写归一形态；mod/shift/alt 精确匹配。
 * 声明 code 时改按 KeyboardEvent.code（物理键）匹配（⌥/⇧ 变体字符场景），key 降级
 * 为条目自述；未声明 code 的条目按 key 匹配、code 不参与。
 */
export interface ShortcutCombo {
    key: string
    /** Ctrl（Windows/Linux）或 Cmd（macOS），两平台等价 */
    mod: boolean
    shift: boolean
    /** ⌥（两平台等价）；缺省 false 与输入精确匹配（带 ⌥ 的按键不失配到无 ⌥ 条目） */
    alt?: boolean
    /** KeyboardEvent.code：声明即改物理键匹配（mac ⌥ 变体字符 / ⇧ 数字变体） */
    code?: string
}

/** 注册表条目：键位组合 → 动作（label/group 是帮助面板的展示元数据） */
export interface EditorShortcutBinding {
    readonly combo: ShortcutCombo
    readonly action: EditorShortcutAction
    /** 中文短句（帮助面板直读，如「前移一层」） */
    readonly label: string
    /** 展示归组（帮助面板分节） */
    readonly group: EditorShortcutGroup
}

/**
 * 缺省注册表。undo 与 redo 只差 shift，故 shift 精确匹配（不能忽略）；⌥⌘]/⌥⌘[ 与
 * ⇧1/⇧2 按 code 匹配（变体字符），其余条目按 key 匹配。
 */
export const DEFAULT_EDITOR_SHORTCUTS: readonly EditorShortcutBinding[] = [
    { combo: { key: 'z', mod: true, shift: false }, action: 'undo', label: '撤销', group: 'history' },
    { combo: { key: 'z', mod: true, shift: true }, action: 'redo', label: '重做', group: 'history' },
    { combo: { key: 'y', mod: true, shift: false }, action: 'redo', label: '重做', group: 'history' },
    { combo: { key: 'c', mod: true, shift: false }, action: 'copy', label: '复制', group: 'clipboard' },
    { combo: { key: 'v', mod: true, shift: false }, action: 'paste', label: '粘贴', group: 'clipboard' },
    { combo: { key: 'd', mod: true, shift: false }, action: 'duplicate', label: '创建副本', group: 'clipboard' },
    { combo: { key: 'delete', mod: false, shift: false }, action: 'delete', label: '删除图层', group: 'layer' },
    { combo: { key: 'backspace', mod: false, shift: false }, action: 'delete', label: '删除图层', group: 'layer' },
    { combo: { key: 'f2', mod: false, shift: false }, action: 'rename', label: '重命名图层', group: 'layer' },
    // 标尺显隐（ruler-guides-snap 工单 01）：裸键 + shift（mod 变体不占用，
    // 不抢浏览器刷新等既有语义）
    { combo: { key: 'r', mod: false, shift: true }, action: 'toggleRulers', label: '标尺显隐', group: 'view' },
    // 锁定 ⇧⌘L / 显隐 ⇧⌘H（canvas-web-layer-lock 工单 02，显隐键位系 feature-status
    // §一挂账补位）：行业趋同（Figma/Sketch 同款）；mod+shift 组合不抢浏览器
    // ⌘L 地址栏、⌘H 历史页既有语义
    { combo: { key: 'l', mod: true, shift: true }, action: 'toggleLayerLock', label: '锁定/解锁图层', group: 'layer' },
    {
        combo: { key: 'h', mod: true, shift: true },
        action: 'toggleLayerVisibility',
        label: '显示/隐藏图层',
        group: 'layer',
    },
    // z 序四件套（kbd-nav 工单 01）：⌘]/⌘[ 前移/后移一格，⌥⌘]/⌥⌘[ 置顶/置底
    // （Canva/Sketch 同构）；⌥ 变体字符下 key 不可靠，置顶/置底按物理键 code 匹配
    { combo: { key: ']', mod: true, shift: false }, action: 'bringForward', label: '前移一层', group: 'layer' },
    { combo: { key: '[', mod: true, shift: false }, action: 'sendBackward', label: '后移一层', group: 'layer' },
    {
        combo: { key: ']', mod: true, shift: false, alt: true, code: 'BracketRight' },
        action: 'bringToFront',
        label: '置顶',
        group: 'layer',
    },
    {
        combo: { key: '[', mod: true, shift: false, alt: true, code: 'BracketLeft' },
        action: 'sendToBack',
        label: '置底',
        group: 'layer',
    },
    // 缩放（kbd-nav 工单 01）：⌘0 复位 100%（视口中心为锚；浏览器吞键时的降级
    // 预案 = Figma 纯 shift ⇧0/1/2，宿主注入亦可覆盖）；⇧1/⇧2 适应画布/选区，
    // 数字行按 code 匹配（US 布局 ⇧1 的 key 是 '!'，法国布局是 '1'，code 恒
    // Digit1 两边通吃）
    { combo: { key: '0', mod: true, shift: false }, action: 'zoomReset', label: '缩放复位 100%', group: 'view' },
    { combo: { key: '1', mod: false, shift: true, code: 'Digit1' }, action: 'fitToSurface', label: '适应画布', group: 'view' },
    {
        combo: { key: '2', mod: false, shift: true, code: 'Digit2' },
        action: 'fitToSelection',
        label: '适应选区',
        group: 'view',
    },
]

/**
 * 快捷键输入：绑定层从 KeyboardEvent 与会话状态折算（本类型不出现任何 DOM 类型）。
 * alt/code 为可选——未折算的宿主按缺省（无 ⌥、无 code）参与匹配。
 */
export interface EditorShortcutInput {
    /** KeyboardEvent.key（大小写随 Shift 与大小写锁定，分类器归一） */
    key: string
    mod: boolean
    shift: boolean
    /** KeyboardEvent.altKey 折算；缺省（未折算）视作 false */
    alt?: boolean
    /** KeyboardEvent.code 折算；声明 code 的注册表条目只认它，缺省（未折算）恒不命中 */
    code?: string
    /** 输入法合成中：isComposing || keyCode === 229 由绑定层折算 */
    composing: boolean
    /** 文本编辑态（ui.editing ≠ null）：全部文档快捷键让路给 textarea */
    editing: boolean
    /** 焦点在可编辑元素（输入框/可编辑节点）：让路给原生编辑 */
    editableTarget: boolean
}

/**
 * 键位 → 动作分类：让路规则优先（合成中/编辑态/输入态一律 null），再按注册表
 * 匹配——声明 code 的条目按 input.code 全等（mod/shift/alt 精确），其余按 key
 * 小写归一后全等。未命中返回 null。绑定集可注入（宿主扩展键位；缺省
 * DEFAULT_EDITOR_SHORTCUTS）。
 */
export function classifyEditorShortcut(
    input: EditorShortcutInput,
    bindings: readonly EditorShortcutBinding[] = DEFAULT_EDITOR_SHORTCUTS,
): EditorShortcutAction | null {
    if (input.composing || input.editing || input.editableTarget) return null
    const key = input.key.toLowerCase()
    const alt = input.alt ?? false
    for (const binding of bindings) {
        const keyMatches = binding.combo.code !== undefined ? binding.combo.code === input.code : binding.combo.key === key
        if (
            keyMatches &&
            binding.combo.mod === input.mod &&
            binding.combo.shift === input.shift &&
            (binding.combo.alt ?? false) === alt
        ) {
            return binding.action
        }
    }
    return null
}
