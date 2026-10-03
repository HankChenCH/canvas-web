// @vitest-environment jsdom
/**
 * DropdownMenu 组件集成测试（editor-top-toolbar 工单 02）：开合底座的契约面。
 * - a11y 对齐状态栏缩放菜单先例：触发钮 aria-haspopup="menu" + :aria-expanded，
 *   菜单 role="menu" + 项 role="menuitem"；
 * - 菜单项渲染：label / shortcut 右侧灰字键位 / disabled + title（置灰原因）/
 *   分隔符（'separator' 条目）；
 * - 行为：分发即收（选中动作后菜单收）、点外收、Esc 收、容器内点击不误收
 *   （收合归触发钮 click 翻转，逻辑面详见 useDropdownMenu.test.ts）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { DropdownMenuEntry } from '../../src/shared/useDropdownMenu'

import DropdownMenu from '../../src/shared/DropdownMenu.vue'

const runs: string[] = []

const ARRANGE_ITEMS: DropdownMenuEntry[] = [
    { label: '前移一层', shortcut: '⌘]', run: () => void runs.push('forward') },
    { label: '置顶', shortcut: '⌥⌘]', title: '仅根图层可排列', disabled: true, run: () => void runs.push('front') },
    'separator',
    { label: '锁定', shortcut: '⇧⌘L', run: () => void runs.push('lock') },
]

const mountMenu = () =>
    mount(DropdownMenu, {
        props: { label: '排列', items: ARRANGE_ITEMS, title: '排列菜单（z 序/锁定/显隐）' },
    })

beforeEach(() => {
    runs.length = 0
})

const triggerEl = (wrapper: ReturnType<typeof mountMenu>): HTMLElement =>
    wrapper.find('[data-dropdown-trigger]').element as HTMLElement
/** 菜单元素（v-if 未渲染返回 undefined；VTU 空包装访问 .element 会抛错，先查 exists） */
const menuEl = (wrapper: ReturnType<typeof mountMenu>): HTMLElement | undefined => {
    const found = wrapper.find('[data-dropdown-menu]')
    return found.exists() ? (found.element as HTMLElement) : undefined
}

describe('DropdownMenu：开合与 a11y', () => {
    it('关态只有触发钮；点击开合，aria-haspopup/aria-expanded 随动', async () => {
        const wrapper = mountMenu()
        const trigger = triggerEl(wrapper)
        expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
        expect(trigger.getAttribute('aria-expanded')).toBe('false')
        expect(trigger.textContent).toContain('排列')
        expect(trigger.getAttribute('title')).toBe('排列菜单（z 序/锁定/显隐）')
        expect(menuEl(wrapper)).toBeUndefined()

        await wrapper.find('[data-dropdown-trigger]').trigger('click')
        const menu = menuEl(wrapper)
        expect(menu).toBeDefined()
        expect(menu?.getAttribute('role')).toBe('menu')
        expect(menu?.getAttribute('aria-label')).toBe('排列')
        expect(trigger.getAttribute('aria-expanded')).toBe('true')

        // 再点触发钮收合（容器内 pointerdown 不误收，收合归 click 翻转）
        menu?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
        await wrapper.find('[data-dropdown-trigger]').trigger('click')
        expect(menuEl(wrapper)).toBeUndefined()
        wrapper.unmount()
    })
})

describe('DropdownMenu：菜单项渲染', () => {
    it('label/shortcut/disabled+title 齐全，分隔符入列，项带 role=menuitem', async () => {
        const wrapper = mountMenu()
        await wrapper.find('[data-dropdown-trigger]').trigger('click')

        const items = Array.from(menuEl(wrapper)?.querySelectorAll('[data-dropdown-item]') ?? [])
        expect(items).toHaveLength(3)
        expect(items.every((el) => el.getAttribute('role') === 'menuitem')).toBe(true)
        expect(items[0]?.textContent).toContain('前移一层')
        expect(items[0]?.textContent).toContain('⌘]')
        // 置灰 + title 统一先例（ContextMenu.vue）：disabled 属性 + 原因文案
        expect(items[1]?.hasAttribute('disabled')).toBe(true)
        expect(items[1]?.getAttribute('title')).toBe('仅根图层可排列')
        // 分隔符（排列▾/视图▾ 分段用）
        expect(menuEl(wrapper)?.querySelector('[data-dropdown-separator]')).not.toBeNull()
        wrapper.unmount()
    })
})

describe('DropdownMenu：收起三路', () => {
    it('分发即收：点击可用项执行 run 并收起', async () => {
        const wrapper = mountMenu()
        await wrapper.find('[data-dropdown-trigger]').trigger('click')

        const items = Array.from(menuEl(wrapper)?.querySelectorAll('[data-dropdown-item]') ?? [])
        ;(items[0] as HTMLElement).click()
        await nextTick()
        expect(runs).toEqual(['forward'])
        expect(menuEl(wrapper)).toBeUndefined()
        wrapper.unmount()
    })

    it('点外收（容器外 pointerdown）', async () => {
        const wrapper = mountMenu()
        await wrapper.find('[data-dropdown-trigger]').trigger('click')
        expect(menuEl(wrapper)).toBeDefined()

        const outsider = document.createElement('div')
        document.body.appendChild(outsider)
        outsider.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
        outsider.remove()
        await nextTick()
        expect(menuEl(wrapper)).toBeUndefined()
        wrapper.unmount()
    })

    it('Esc 收（window keydown）', async () => {
        const wrapper = mountMenu()
        await wrapper.find('[data-dropdown-trigger]').trigger('click')
        expect(menuEl(wrapper)).toBeDefined()

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        await nextTick()
        expect(menuEl(wrapper)).toBeUndefined()
        wrapper.unmount()
    })
})

describe('DropdownMenu：fixed 弹层定位（editor-top-toolbar 工单 03）', () => {
    it('开态菜单内联视口坐标（fixed 归样式表；jsdom 无布局 rect 全零：top = 触发钮下缘 + 间隙 6、left 经钳位下限 2）', async () => {
        const wrapper = mountMenu()
        await wrapper.find('[data-dropdown-trigger]').trigger('click')
        await nextTick()
        const menu = menuEl(wrapper)
        expect(menu).toBeDefined()
        // 内联坐标随开态同步写入（首帧即落位，不依赖 CSS 相对偏移）；fixed 定位
        // 由组件 scoped 样式持有（jsdom 不算样式表，不可断言）
        expect(menu?.style.top).toBe('6px')
        expect(menu?.style.left).toBe('2px')
        wrapper.unmount()
    })

    it('再开重定位：收起后重开仍按触发钮现 rect 重算（不残留上次坐标）', async () => {
        const wrapper = mountMenu()
        const trigger = wrapper.find('[data-dropdown-trigger]')
        await trigger.trigger('click')
        await nextTick()
        const firstTop = (menuEl(wrapper)?.style.top ?? '')
        await trigger.trigger('click')
        expect(menuEl(wrapper)).toBeUndefined()
        await trigger.trigger('click')
        await nextTick()
        expect(menuEl(wrapper)?.style.top).toBe(firstTop)
        wrapper.unmount()
    })
})
