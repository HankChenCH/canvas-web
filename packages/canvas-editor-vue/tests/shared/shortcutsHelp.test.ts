// @vitest-environment jsdom
/**
 * 快捷键帮助面板展示侧纯函数（kbd-nav 工单 04）：
 * - 键位符号按平台两形态：mac ⌥⇧⌘ 符号系（⌘ 贴键）/ win Ctrl+Shift+Alt 文本系；
 * - 非打印键显示映射（方向键/退格/Del/Esc/Tab/F2）；
 * - 分组展示名与分节顺序归本包（内核只定 group 枚举域）；
 * - 平台侦测回落（jsdom navigator.platform 为空 → win 文本系）。
 */
import { describe, expect, it } from 'vitest'

import type { ShortcutCombo } from '@hankchen/canvas-editor'

import {
    SHORTCUT_GROUP_LABELS,
    SHORTCUT_GROUP_ORDER,
    detectShortcutPlatform,
    shortcutActionLabel,
    shortcutKeyLabel,
} from '../../src/shared/shortcutsHelp'

const combo = (overrides: Partial<ShortcutCombo>): ShortcutCombo => ({
    key: 'z',
    mod: false,
    shift: false,
    ...overrides,
})

describe('shortcutKeyLabel：mac 符号系（⌥⇧⌘，⌘ 贴键）', () => {
    it('裸键/⌘/⇧⌘/⌥⌘ 四形态', () => {
        expect(shortcutKeyLabel(combo({ key: 'z' }), 'mac')).toBe('Z')
        expect(shortcutKeyLabel(combo({ key: 'z', mod: true }), 'mac')).toBe('⌘Z')
        expect(shortcutKeyLabel(combo({ key: 'l', mod: true, shift: true }), 'mac')).toBe('⇧⌘L')
        expect(shortcutKeyLabel(combo({ key: ']', mod: true, alt: true, code: 'BracketRight' }), 'mac')).toBe('⌥⌘]')
    })

    it('⇧1（code 匹配条目）展示 ⇧1', () => {
        expect(shortcutKeyLabel(combo({ key: '1', shift: true, code: 'Digit1' }), 'mac')).toBe('⇧1')
    })
})

describe('shortcutKeyLabel：win 文本系（Ctrl/Shift/Alt，Microsoft 惯例序）', () => {
    it('裸键/⌘/⇧⌘/⌥⌘ 四形态', () => {
        expect(shortcutKeyLabel(combo({ key: 'z' }), 'win')).toBe('Z')
        expect(shortcutKeyLabel(combo({ key: 'z', mod: true }), 'win')).toBe('Ctrl+Z')
        expect(shortcutKeyLabel(combo({ key: 'l', mod: true, shift: true }), 'win')).toBe('Ctrl+Shift+L')
        expect(shortcutKeyLabel(combo({ key: ']', mod: true, alt: true, code: 'BracketRight' }), 'win')).toBe(
            'Ctrl+Alt+]',
        )
    })

    it('⇧1（code 匹配条目）展示 Shift+1', () => {
        expect(shortcutKeyLabel(combo({ key: '1', shift: true, code: 'Digit1' }), 'win')).toBe('Shift+1')
    })
})

describe('shortcutKeyLabel：非打印键显示映射（注册表存 key 小写归一形态）', () => {
    it('方向键/退格/Del/Esc/Tab/F2 两平台同映射', () => {
        expect(shortcutKeyLabel(combo({ key: 'arrowup' }), 'mac')).toBe('↑')
        expect(shortcutKeyLabel(combo({ key: 'arrowdown' }), 'mac')).toBe('↓')
        expect(shortcutKeyLabel(combo({ key: 'arrowleft' }), 'mac')).toBe('←')
        expect(shortcutKeyLabel(combo({ key: 'arrowright', shift: true }), 'mac')).toBe('⇧→')
        expect(shortcutKeyLabel(combo({ key: 'backspace' }), 'mac')).toBe('⌫')
        expect(shortcutKeyLabel(combo({ key: 'delete' }), 'win')).toBe('Del')
        expect(shortcutKeyLabel(combo({ key: 'escape' }), 'win')).toBe('Esc')
        expect(shortcutKeyLabel(combo({ key: 'tab', shift: true }), 'win')).toBe('Shift+Tab')
        expect(shortcutKeyLabel(combo({ key: 'f2' }), 'mac')).toBe('F2')
    })
})

describe('分组展示名与分节顺序（归本包：内核只定枚举域）', () => {
    it('六组中文展示名齐全；顺序 = 历史/剪贴板/图层/文本/视图/帮助（text 自 find-replace 工单 01）', () => {
        expect(SHORTCUT_GROUP_ORDER).toEqual(['history', 'clipboard', 'layer', 'text', 'view', 'help'])
        expect(SHORTCUT_GROUP_LABELS).toEqual({
            history: '历史',
            clipboard: '剪贴板',
            layer: '图层',
            text: '文本',
            view: '视图',
            help: '帮助',
        })
    })
})

describe('shortcutActionLabel：注册表动作 → 平台键位符号（提示文案直查注册表，不另抄键位）', () => {
    it('帮助面板 ⌘/ 与 Ctrl+/ 两平台', () => {
        expect(shortcutActionLabel('helpShortcuts', 'mac')).toBe('⌘/')
        expect(shortcutActionLabel('helpShortcuts', 'win')).toBe('Ctrl+/')
    })

    it('复制样式 ⌥⌘C 与 Ctrl+Alt+C 两平台（⌥ 变体条目按 code 匹配，展示走 key 形态）', () => {
        expect(shortcutActionLabel('copyStyle', 'mac')).toBe('⌥⌘C')
        expect(shortcutActionLabel('copyStyle', 'win')).toBe('Ctrl+Alt+C')
    })

    it('锁定/解锁 ⇧⌘L 与 Ctrl+Shift+L 两平台', () => {
        expect(shortcutActionLabel('toggleLayerLock', 'mac')).toBe('⇧⌘L')
        expect(shortcutActionLabel('toggleLayerLock', 'win')).toBe('Ctrl+Shift+L')
    })
})

describe('detectShortcutPlatform：navigator 侦测回落', () => {
    const stubNavigator = (platform: string, userAgent = '', userAgentData?: { platform?: string }): void => {
        Object.defineProperty(window, 'navigator', { value: { platform, userAgent, userAgentData }, configurable: true })
    }

    it('Mac 平台形态 → mac；Windows/未知（含 jsdom 空串）→ win', () => {
        stubNavigator('MacIntel')
        expect(detectShortcutPlatform()).toBe('mac')
        stubNavigator('Intel Mac OS X 10_15_7', 'Mozilla/5.0 (Macintosh)')
        expect(detectShortcutPlatform()).toBe('mac')
        stubNavigator('Win32')
        expect(detectShortcutPlatform()).toBe('win')
        stubNavigator('', 'Mozilla/5.0 (X11; Linux x86_64)')
        expect(detectShortcutPlatform()).toBe('win')
        stubNavigator('')
        expect(detectShortcutPlatform()).toBe('win')
    })

    it('userAgentData.platform（Client Hints 新 API）参与侦测：macOS → mac、Windows → win', () => {
        stubNavigator('', '', { platform: 'macOS' })
        expect(detectShortcutPlatform()).toBe('mac')
        stubNavigator('', '', { platform: 'Windows' })
        expect(detectShortcutPlatform()).toBe('win')
    })
})
