/**
 * 快捷键帮助面板的展示侧纯函数与常量（kbd-nav 工单 04）。
 *
 * 分组展示名与分节顺序归本包：内核注册表只定 group 枚举域（注册表即数据），
 * 中文展示名与分节序是 UI 关注点。键位符号按平台渲染两形态——mac 用 ⌥⇧⌘ 符号系
 * （惯例序 ⌥<⇧<⌘，⌘ 贴键），win 用 Ctrl/Shift/Alt 文本系（Microsoft 惯例序
 * Ctrl<Shift<Alt）；注册表存 KeyboardEvent.key 的小写归一形态，方向键/退格等
 * 非打印键在此翻成人可读键帽。无 DOM 依赖（侦测函数读 globalThis.navigator，
 * Node/测试环境空串回落 win）。
 */
import type { EditorShortcutGroup, ShortcutCombo } from '@hankchen/canvas-next-editor'

export type ShortcutPlatform = 'mac' | 'win'

/** 分节渲染顺序（条目在节内的顺序 = 注册表声明序） */
export const SHORTCUT_GROUP_ORDER: readonly EditorShortcutGroup[] = [
    'history',
    'clipboard',
    'layer',
    'view',
    'help',
]

/** 分组中文展示名（归本包，帮助面板分节标题） */
export const SHORTCUT_GROUP_LABELS: Record<EditorShortcutGroup, string> = {
    history: '历史',
    clipboard: '剪贴板',
    layer: '图层',
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

/** 平台侦测：navigator.platform/userAgent 含 mac 形态 → mac；未知/其余 → win 文本系 */
export function detectShortcutPlatform(): ShortcutPlatform {
    const nav = globalThis.navigator
    return /mac/i.test(`${nav?.platform ?? ''} ${nav?.userAgent ?? ''}`) ? 'mac' : 'win'
}
