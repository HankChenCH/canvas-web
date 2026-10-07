/**
 * 快捷键展示侧纯函数与常量（kbd-nav 工单 04）。
 *
 * 分组展示名与分节顺序归本包：内核注册表只定 group 枚举域（注册表即数据），
 * 中文展示名与分节序是 UI 关注点。键位符号按平台渲染两形态——mac 用 ⌥⇧⌘ 符号系
 * （惯例序 ⌥<⇧<⌘，⌘ 贴键），win 用 Ctrl/Shift/Alt 文本系（Microsoft 惯例序
 * Ctrl<Shift<Alt）；注册表存 KeyboardEvent.key 的小写归一形态，方向键/退格等
 * 非打印键在此翻成人可读键帽。无 DOM 依赖（侦测函数读 globalThis.navigator，
 * Node/测试环境空串回落 win）。除帮助面板外，散落组件的键位提示文案（状态栏
 * tooltip/右键菜单/图层面板）也经 shortcutActionLabel 直查注册表按平台渲染。
 */
import type { EditorShortcutAction, EditorShortcutGroup, ShortcutCombo } from '@hankchen/canvas-editor'
import { DEFAULT_EDITOR_SHORTCUTS } from '@hankchen/canvas-editor'

export type ShortcutPlatform = 'mac' | 'win'

/** 分节渲染顺序（条目在节内的顺序 = 注册表声明序） */
export const SHORTCUT_GROUP_ORDER: readonly EditorShortcutGroup[] = [
    'history',
    'clipboard',
    'layer',
    'text',
    'view',
    'help',
]

/** 分组中文展示名（归本包，帮助面板分节标题） */
export const SHORTCUT_GROUP_LABELS: Record<EditorShortcutGroup, string> = {
    history: '历史',
    clipboard: '剪贴板',
    layer: '图层',
    text: '文本',
    view: '视图',
    help: '帮助',
}

/** 非打印键键帽映射（key 小写归一形态 → 显示符号；字母键另行大写展示） */
const KEY_DISPLAY: Record<string, string> = {
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    backspace: '⌫',
    delete: 'Del',
    escape: 'Esc',
    tab: 'Tab',
    f2: 'F2',
}

/**
 * 键位组合 → 平台键位符号：mac ⌥⇧⌘ + 键帽（⇧⌘L）；win Ctrl+Shift+Alt + 键帽
 * （Ctrl+Shift+L）。字母键帽大写（⌘Z / Ctrl+Z），其余走映射表或缺省原样。
 */
export function shortcutKeyLabel(combo: ShortcutCombo, platform: ShortcutPlatform): string {
    const key = combo.key
    const cap = /^[a-z]$/.test(key) ? key.toUpperCase() : (KEY_DISPLAY[key] ?? key)
    if (platform === 'mac') {
        let label = ''
        if (combo.alt) label += '⌥'
        if (combo.shift) label += '⇧'
        if (combo.mod) label += '⌘'
        return label + cap
    }
    const parts: string[] = []
    if (combo.mod) parts.push('Ctrl')
    if (combo.shift) parts.push('Shift')
    if (combo.alt) parts.push('Alt')
    parts.push(cap)
    return parts.join('+')
}

/**
 * 注册表动作 → 平台键位符号（如 ⌘/ 与 Ctrl+/）：直查内核缺省注册表——注册表是
 * 键位唯一事实源，提示文案不另抄键位，改键位自动跟随。同动作多注册条目时取
 * 声明首条（多通道动作如 delete 的展示歧义归帮助面板，本口供无歧义提示用）。
 */
export function shortcutActionLabel(action: EditorShortcutAction, platform: ShortcutPlatform): string {
    const binding = DEFAULT_EDITOR_SHORTCUTS.find((entry) => entry.action === action)
    return binding ? shortcutKeyLabel(binding.combo, platform) : ''
}

/**
 * 武装建层的状态栏瞬时提示（canvas-web-drag-create 工单 03）：面板新增项与
 * T/G/Q/I 层型快捷键两入口共用同一句（LayerPanel 与 useShortcuts 直引此常量，
 * 文案单点维护）。瞬时语义 = show 后数秒自动清空（useTransientFeedback TTL），
 * 武装本身是待命态，不随解除主动撤提示。
 */
export const ARM_LAYER_CREATE_HINT = '画拉或点击落层，Esc 取消'

/**
 * 平台侦测：userAgentData.platform（Client Hints 新 API，Safari 尚无——三源拼串
 * 一次匹配）与 platform/userAgent 含 mac 形态 → mac；未知/其余 → win 文本系。
 * userAgentData 未进全量 TS DOM lib，结构化局部读取免随 lib 版本漂移。
 */
export function detectShortcutPlatform(): ShortcutPlatform {
    const nav = globalThis.navigator as
        | { platform?: string; userAgent?: string; userAgentData?: { platform?: string } }
        | undefined
    return /mac/i.test(`${nav?.userAgentData?.platform ?? ''} ${nav?.platform ?? ''} ${nav?.userAgent ?? ''}`)
        ? 'mac'
        : 'win'
}
