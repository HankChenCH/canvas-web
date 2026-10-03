// @vitest-environment jsdom
/**
 * DropdownMenu 组件集成测试（editor-top-toolbar 工单 02）：开合底座的契约面。
 * - a11y 对齐状态栏缩放菜单先例：触发钮 aria-haspopup="menu" + :aria-expanded，
 *   菜单 role="menu" + 项 role="menuitem"；
 * - 菜单项渲染：label / shortcut 右侧灰字键位 / disabled + title（置灰原因）/
 *   分隔符（'separator' 条目）；
 * - 行为：分发即收（选中动作后菜单收）、点外收、Esc 收、容器内点击不误收
 *   （收合归触发钮 click 翻转，逻辑面详见 useDropdownMenu.test.ts）；
 * - 键盘导航（issues/04）：开时焦点入菜单（首个启用项，全置灰落菜单根）、
 *   ↑↓ 循环跳置灰、Home/End 首尾、Enter/Space 显式激活（preventDefault 抑制
 *   原生 click 防双跑）、Esc/Tab 收起回焦触发钮、触发钮 ↓ 开菜单。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
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

/** 首项置灰 fixture：开时焦点必须跳过它落首个启用项 */
const SKIP_FIRST_ITEMS: DropdownMenuEntry[] = [
    { label: '置灰首项', disabled: true, run: () => void runs.push('disabled-first') },
    { label: '可用项', run: () => void runs.push('enabled') },
]

/** 全置灰 fixture（排列▾ 无选中同型）：焦点兜底落菜单根 */
const ALL_DISABLED_ITEMS: DropdownMenuEntry[] = [
    { label: '前移一层', disabled: true, run: () => void runs.push('forward') },
    { label: '后移一层', disabled: true, run: () => void runs.push('back') },
]

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
/** 菜单项元素列表（DOM 序，与 items 非 separator 条目对齐） */
const itemEls = (wrapper: ReturnType<typeof mountMenu>): HTMLElement[] =>
    Array.from(menuEl(wrapper)?.querySelectorAll('[data-dropdown-item]') ?? []) as HTMLElement[]

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
        await flushPromises()
        await nextTick()
        const firstTop = (menuEl(wrapper)?.style.top ?? '')
        await trigger.trigger('click')
        await flushPromises()
        expect(menuEl(wrapper)).toBeUndefined()
        await trigger.trigger('click')
        await flushPromises()
        await nextTick()
        expect(menuEl(wrapper)?.style.top).toBe(firstTop)
        wrapper.unmount()
    })
})

describe('DropdownMenu：键盘导航（issues/04）', () => {
    /** 键盘导航挂载：attachTo 进文档——焦点断言（document.activeElement/focus()）
     *  只对在档元素生效（无 attachTo 挂载是游离树） */
    const mountNavMenu = (items: DropdownMenuEntry[] = ARRANGE_ITEMS) =>
        mount(DropdownMenu, { props: { label: '排列', items }, attachTo: document.body })

    /** 菜单内按键驱动：真实派发（bubbles 到菜单根处理器）+ 等 Vue flush */
    const fireKey = async (el: HTMLElement, key: string): Promise<KeyboardEvent> => {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
        el.dispatchEvent(event)
        await flushPromises()
        return event
    }

    /** 菜单项取用（noUncheckedIndexedAccess 收窄：索引访问带 undefined） */
    const itemAt = (wrapper: ReturnType<typeof mountNavMenu>, index: number): HTMLElement => {
        const el = itemEls(wrapper)[index]
        expect(el).toBeDefined()
        return el as HTMLElement
    }

    /** 点击开菜单并等焦点编排完成（focusIntoMenu 在 onToggle 定位之后一拍） */
    const openByClick = async (wrapper: ReturnType<typeof mountNavMenu>): Promise<void> => {
        await wrapper.find('[data-dropdown-trigger]').trigger('click')
        await flushPromises()
    }

    it('开时焦点入菜单——落首个启用项（首项置灰时跳过）', async () => {
        const wrapper = mountNavMenu(SKIP_FIRST_ITEMS)
        await openByClick(wrapper)
        expect(document.activeElement).toBe(itemAt(wrapper, 1))
        wrapper.unmount()
    })

    it('↑↓ 循环移动且跳过置灰项（0 启用/1 置灰/2 启用）', async () => {
        const wrapper = mountNavMenu()
        await openByClick(wrapper)
        expect(document.activeElement).toBe(itemAt(wrapper, 0))

        await fireKey(itemAt(wrapper, 0), 'ArrowDown')
        expect(document.activeElement).toBe(itemAt(wrapper, 2))
        await fireKey(itemAt(wrapper, 2), 'ArrowDown')
        expect(document.activeElement).toBe(itemAt(wrapper, 0))
        await fireKey(itemAt(wrapper, 0), 'ArrowUp')
        expect(document.activeElement).toBe(itemAt(wrapper, 2))
        await fireKey(itemAt(wrapper, 2), 'ArrowUp')
        expect(document.activeElement).toBe(itemAt(wrapper, 0))
        wrapper.unmount()
    })

    it('Home/End 落首/末启用项', async () => {
        const wrapper = mountNavMenu()
        await openByClick(wrapper)
        await fireKey(itemAt(wrapper, 0), 'End')
        expect(document.activeElement).toBe(itemAt(wrapper, 2))
        await fireKey(itemAt(wrapper, 2), 'Home')
        expect(document.activeElement).toBe(itemAt(wrapper, 0))
        wrapper.unmount()
    })

    it('Enter 激活焦点项：run 执行 + 收起 + 回焦触发钮；preventDefault 抑制原生 click 防双跑', async () => {
        const wrapper = mountNavMenu()
        await openByClick(wrapper)
        const event = await fireKey(itemAt(wrapper, 0), 'Enter')
        expect(event.defaultPrevented).toBe(true)
        expect(runs).toEqual(['forward'])
        expect(menuEl(wrapper)).toBeUndefined()
        expect(document.activeElement).toBe(triggerEl(wrapper))
        wrapper.unmount()
    })

    it('Space 同 Enter（key=" "）', async () => {
        const wrapper = mountNavMenu()
        await openByClick(wrapper)
        await fireKey(itemAt(wrapper, 0), ' ')
        expect(runs).toEqual(['forward'])
        expect(menuEl(wrapper)).toBeUndefined()
        expect(document.activeElement).toBe(triggerEl(wrapper))
        wrapper.unmount()
    })

    it('Esc（焦点在菜单内）收起并回焦触发钮', async () => {
        const wrapper = mountNavMenu()
        await openByClick(wrapper)
        await fireKey(itemAt(wrapper, 0), 'Escape')
        expect(menuEl(wrapper)).toBeUndefined()
        expect(document.activeElement).toBe(triggerEl(wrapper))
        wrapper.unmount()
    })

    it('Tab 关闭菜单、焦点先回触发钮（浏览器原生 Tab 随即自触发钮继续移焦，触发钮非终态）', async () => {
        const wrapper = mountNavMenu()
        await openByClick(wrapper)
        await fireKey(itemAt(wrapper, 0), 'Tab')
        expect(menuEl(wrapper)).toBeUndefined()
        expect(document.activeElement).toBe(triggerEl(wrapper))
        wrapper.unmount()
    })

    it('触发钮 ArrowDown 开菜单且焦点入菜单（键盘开菜单入口）', async () => {
        const wrapper = mountNavMenu()
        await wrapper.find('[data-dropdown-trigger]').trigger('keydown', { key: 'ArrowDown' })
        await flushPromises()
        expect(menuEl(wrapper)).toBeDefined()
        expect(document.activeElement).toBe(itemAt(wrapper, 0))

        // 再按 ↓ 在菜单内循环移动
        await fireKey(itemAt(wrapper, 0), 'ArrowDown')
        expect(document.activeElement).toBe(itemAt(wrapper, 2))
        wrapper.unmount()
    })

    it('全置灰：开时焦点兜底落菜单根（tabindex=-1），↑↓ 原地、Esc 收起回焦触发钮', async () => {
        const wrapper = mountNavMenu(ALL_DISABLED_ITEMS)
        await openByClick(wrapper)
        const menuRoot = menuEl(wrapper) as HTMLElement
        expect(menuRoot).toBeDefined()
        expect(document.activeElement).toBe(menuRoot)

        await fireKey(menuRoot, 'ArrowDown')
        await fireKey(menuRoot, 'ArrowUp')
        expect(document.activeElement).toBe(menuRoot)

        await fireKey(menuRoot, 'Escape')
        expect(menuEl(wrapper)).toBeUndefined()
        expect(document.activeElement).toBe(triggerEl(wrapper))
        wrapper.unmount()
    })
})
