// @vitest-environment jsdom
/**
 * HelpDialog 组件集成测试（kbd-nav 工单 04）：帮助面板两组内容与开合。
 * - 开合态来自 useShortcutsHelp() 单例（⌘/ 与状态栏按钮双入口共享）；
 * - 内容两组：注册表动作（缺省读内核注册表、按 group 分节、新条目自动出现）+
 *   内置交互静态清单；
 * - 键位符号按平台两形态（platform 注入缝：mac ⌘⇧ / win Ctrl+Shift）；
 * - 三路关闭：✕ / 遮罩点击 / Escape。浮层经 Teleport 挂 body，断言绕过 wrapper
 *   直接查 document（expressionCompletion.mount.test.ts 先例）。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

import { DEFAULT_EDITOR_SHORTCUTS, type EditorShortcutAction } from '@hankchen/canvas-next-editor'

import HelpDialog from '../../src/shared/HelpDialog.vue'
import { useShortcutsHelp } from '../../src/shared/useShortcutsHelp'

const dialogEl = (): HTMLElement | null => document.body.querySelector('[data-help-dialog]')
const rows = (selector: string): string[] =>
    Array.from(document.body.querySelectorAll(selector)).map((el) => el.textContent?.trim() ?? '')

beforeEach(() => {
    document.body.innerHTML = ''
    useShortcutsHelp().close()
})

const mountDialog = (props: Record<string, unknown> = {}) => mount(HelpDialog, { props, attachTo: document.body })

describe('HelpDialog：开合态（useShortcutsHelp 单例）', () => {
    it('关闭态不渲染；show 开、close 关', async () => {
        const wrapper = mountDialog()
        expect(dialogEl()).toBeNull()

        useShortcutsHelp().show()
        await wrapper.vm.$nextTick()
        expect(dialogEl()).not.toBeNull()
        expect(dialogEl()?.getAttribute('role')).toBe('dialog')
        expect(dialogEl()?.getAttribute('aria-modal')).toBe('true')

        useShortcutsHelp().close()
        await wrapper.vm.$nextTick()
        expect(dialogEl()).toBeNull()
        wrapper.unmount()
    })
})

describe('HelpDialog：内容两组', () => {
    it('注册表动作按 group 分节（节内含键位与中文短句），内置交互清单恒在', async () => {
        const wrapper = mountDialog({ platform: 'win' })
        useShortcutsHelp().show()
        await wrapper.vm.$nextTick()

        const sectionGroups = Array.from(document.body.querySelectorAll('[data-help-group]')).map(
            (el) => el.getAttribute('data-help-group'),
        )
        // 缺省注册表六组齐现（history/clipboard/layer/text/view/help 各有条目）
        expect(sectionGroups).toEqual(['history', 'clipboard', 'layer', 'text', 'view', 'help'])
        // 图层节含前移一层（kbd-nav 工单 01 条目）；键位行带 data-help-shortcut
        const layerRows = rows('[data-help-group="layer"] [data-help-shortcut]')
        expect(layerRows.some((row) => row.includes('前移一层'))).toBe(true)
        // 内置交互静态清单：滚轮缩放/空格平移/双击编辑/Esc/方向键微调/Tab 循环
        const interactions = rows('[data-help-interactions] [data-help-interaction]').join('\n')
        for (const fragment of ['滚轮', '空格', '双击', 'Esc', '方向键', 'Tab']) {
            expect(interactions.includes(fragment)).toBe(true)
        }
        wrapper.unmount()
    })

    it('注册表驱动渲染：kbd-nav 工单 03 的 Tab 条目自动入面板（注册表即数据，零改面板）', async () => {
        // 立票时的「未来动作」selectNextLayer/selectPrevLayer 已入缺省注册表——
        // 本例钉住「新条目零改面板自动出现」承诺的兑现形态
        const wrapper = mountDialog({ platform: 'win' })
        useShortcutsHelp().show()
        await wrapper.vm.$nextTick()
        const layerRows = rows('[data-help-group="layer"] [data-help-shortcut]').join('\n')
        expect(layerRows.includes('循环选下一层')).toBe(true)
        expect(layerRows.includes('Tab')).toBe(true)
        expect(layerRows.includes('Shift+Tab')).toBe(true)
        wrapper.unmount()
    })

    it('注入缝新条目自动入面板（宿主扩展零改面板；只渲染声明的 combo，不脑补变体）', async () => {
        // 注册表是唯一事实源：绑定注入缝追加的条目自动入面板。工单 03 落地后
        // 动作联合已无「未来动作」可用，以「既有动作 + 宿主新键位」钉同一注入缝
        // （面板只消费 combo/label/group，不感知动作语义）
        const injected = {
            combo: { key: 'k', mod: false, shift: false },
            action: 'duplicate' as EditorShortcutAction,
            label: '创建副本（宿主键位）',
            group: 'clipboard' as const,
        }
        const wrapper = mountDialog({
            platform: 'win',
            bindings: [...DEFAULT_EDITOR_SHORTCUTS, injected],
        })
        useShortcutsHelp().show()
        await wrapper.vm.$nextTick()
        const clipboardRows = rows('[data-help-group="clipboard"] [data-help-shortcut]').join('\n')
        expect(clipboardRows.includes('创建副本（宿主键位）')).toBe(true)
        expect(clipboardRows.includes('Shift+K')).toBe(false) // 只渲染注入的那条，不脑补变体
        wrapper.unmount()
    })
})

describe('HelpDialog：键位符号两形态（platform 注入缝）', () => {
    it('mac 形态：⇧⌘L / ⌘Z / ⌥⌘]', async () => {
        const wrapper = mountDialog({ platform: 'mac' })
        useShortcutsHelp().show()
        await wrapper.vm.$nextTick()
        const all = rows('[data-help-shortcut]').join('\n')
        expect(all.includes('⇧⌘L')).toBe(true)
        expect(all.includes('⌘Z')).toBe(true)
        expect(all.includes('⌥⌘]')).toBe(true)
        expect(all.includes('Ctrl')).toBe(false)
        wrapper.unmount()
    })

    it('win 形态：Ctrl+Shift+L / Ctrl+Z / Ctrl+Alt+]', async () => {
        const wrapper = mountDialog({ platform: 'win' })
        useShortcutsHelp().show()
        await wrapper.vm.$nextTick()
        const all = rows('[data-help-shortcut]').join('\n')
        expect(all.includes('Ctrl+Shift+L')).toBe(true)
        expect(all.includes('Ctrl+Z')).toBe(true)
        expect(all.includes('Ctrl+Alt+]')).toBe(true)
        expect(all.includes('⌘')).toBe(false)
        wrapper.unmount()
    })
})

describe('HelpDialog：三路关闭', () => {
    it('✕ 钮关闭', async () => {
        const wrapper = mountDialog()
        useShortcutsHelp().show()
        await wrapper.vm.$nextTick()
        document.body.querySelector<HTMLButtonElement>('[data-help-close]')?.click()
        await wrapper.vm.$nextTick()
        expect(dialogEl()).toBeNull()
        wrapper.unmount()
    })

    it('遮罩点击关闭（面板自身点击不关）', async () => {
        const wrapper = mountDialog()
        useShortcutsHelp().show()
        await wrapper.vm.$nextTick()
        const overlay = document.body.querySelector<HTMLElement>('[data-help-overlay]')
        overlay?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
        await wrapper.vm.$nextTick()
        expect(dialogEl()).toBeNull()

        // 再开：面板内 pointerdown 不关（.self 修饰只认遮罩自身）
        useShortcutsHelp().show()
        await wrapper.vm.$nextTick()
        dialogEl()?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
        await wrapper.vm.$nextTick()
        expect(dialogEl()).not.toBeNull()
        wrapper.unmount()
    })

    it('Escape 关闭', async () => {
        const wrapper = mountDialog()
        useShortcutsHelp().show()
        await wrapper.vm.$nextTick()
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        await wrapper.vm.$nextTick()
        expect(dialogEl()).toBeNull()
        wrapper.unmount()
    })
})
