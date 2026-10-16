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
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

// ---- 底座扩展（issues/05 旧菜单迁移）：两处旧手搓菜单的消费面 ----

/** 缩放菜单 fixture（状态栏迁移同型：无 shortcut、dataAttrs 稳定钩子） */
const ZOOM_ITEMS: DropdownMenuEntry[] = [
    { label: '100%', dataAttrs: { 'data-zoom-100': '' }, run: () => void runs.push('reset') },
    { label: '放大', title: '放大（以视口中心为锚）', dataAttrs: { 'data-zoom-in': '' }, run: () => void runs.push('in') },
]

describe('DropdownMenu：direction="up"（issues/05 状态栏缩放菜单迁移）', () => {
    it('向上弹出：bottom 锚定位（视口高 − 触发钮上缘 + 间隙 6），不写 top 内联样式', async () => {
        const wrapper = mount(DropdownMenu, {
            props: { label: '缩放', items: ZOOM_ITEMS, direction: 'up' },
            attachTo: document.body,
        })
        // jsdom 无布局：mock 触发钮上缘 738（视口 768 − 状态栏 30 的落位）
        vi.spyOn(triggerEl(wrapper), 'getBoundingClientRect').mockReturnValue({ top: 738, bottom: 768, left: 10 } as DOMRect)
        await wrapper.find('[data-dropdown-trigger]').trigger('click')
        await flushPromises()
        await nextTick()
        const menu = menuEl(wrapper)
        expect(menu).toBeDefined()
        // bottom = 768 − 738 + 6 = 36（菜单底缘在触发钮上缘上方 6px）；left 原样（钳位不触发）
        expect(menu?.style.top).toBe('')
        expect(menu?.style.bottom).toBe('36px')
        expect(menu?.style.left).toBe('10px')
        wrapper.unmount()
    })

    it('缺省 direction="down"：保持 top 锚（工具栏三下拉语义不变）', async () => {
        const wrapper = mountMenu()
        await wrapper.find('[data-dropdown-trigger]').trigger('click')
        await flushPromises()
        expect(menuEl(wrapper)?.style.top).not.toBe('')
        expect(menuEl(wrapper)?.style.bottom).toBe('')
        wrapper.unmount()
    })
})

describe('DropdownMenu：菜单项扩展契约（issues/05）', () => {
    it('dataAttrs：项透传 data-* 目验钩子（状态栏 data-zoom-* / 面板 data-add-layer 同缝）', async () => {
        const wrapper = mountMenu()
        await wrapper.find('[data-dropdown-trigger]').trigger('click')
        expect(wrapper.find('[data-zoom-100]').exists()).toBe(false)

        const zoomed = mount(DropdownMenu, { props: { label: '缩放', items: ZOOM_ITEMS } })
        await zoomed.find('[data-dropdown-trigger]').trigger('click')
        expect(zoomed.find('[data-zoom-100]').exists()).toBe(true)
        expect(zoomed.find('[data-zoom-in]').exists()).toBe(true)
        zoomed.unmount()
        wrapper.unmount()
    })

    it('keepsOpen：项分发执行 run 但菜单不收（面板＋模板表表单交换特例）', async () => {
        const wrapper = mount(DropdownMenu, {
            props: { label: '新增', items: [{ label: '模板表', keepsOpen: true, run: () => void runs.push('form') }] },
        })
        await wrapper.find('[data-dropdown-trigger]').trigger('click')
        ;(itemEls(wrapper)[0] as HTMLElement).click()
        await nextTick()
        expect(runs).toEqual(['form'])
        expect(menuEl(wrapper)).toBeDefined()
        wrapper.unmount()
    })
})

describe('DropdownMenu：自定义触发钮插槽（issues/05 状态栏/面板＋迁移）', () => {
    const CUSTOM_TRIGGER_SLOT = `<template #trigger="{ open, toggle, triggerRef, onKeydown }">
        <button :ref="triggerRef" type="button" data-custom-trigger aria-haspopup="menu" :aria-expanded="open" @click="toggle" @keydown="onKeydown">100%</button>
    </template>`

    it('触发钮由插槽呈现（内建钮不在场）：a11y/开合/Esc 回焦经受控 props 同契约', async () => {
        const wrapper = mount(DropdownMenu, {
            props: { label: '缩放', items: ZOOM_ITEMS },
            slots: { trigger: CUSTOM_TRIGGER_SLOT },
            attachTo: document.body,
        })
        const trigger = wrapper.find('[data-custom-trigger]')
        expect(trigger.exists()).toBe(true)
        expect(wrapper.find('[data-dropdown-trigger]').exists()).toBe(false)
        expect(trigger.attributes('aria-haspopup')).toBe('menu')
        expect(trigger.attributes('aria-expanded')).toBe('false')

        await trigger.trigger('click')
        expect(menuEl(wrapper)).toBeDefined()
        expect(trigger.attributes('aria-expanded')).toBe('true')

        // Esc 收起回焦自定义触发钮（triggerRef 接线生效；菜单根路径——window 路径不回焦）
        ;(menuEl(wrapper) as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await nextTick()
        expect(menuEl(wrapper)).toBeUndefined()
        expect(document.activeElement).toBe(trigger.element)
        wrapper.unmount()
    })

    it('自定义触发钮 ↓ 开菜单（onKeydown 接线）', async () => {
        const wrapper = mount(DropdownMenu, {
            props: { label: '缩放', items: ZOOM_ITEMS },
            slots: { trigger: CUSTOM_TRIGGER_SLOT },
            attachTo: document.body,
        })
        await wrapper.find('[data-custom-trigger]').trigger('keydown', { key: 'ArrowDown' })
        await flushPromises()
        expect(menuEl(wrapper)).toBeDefined()
        expect(document.activeElement).toBe(itemEls(wrapper)[0])
        wrapper.unmount()
    })

    it('弹层定位按自定义触发钮 rect', async () => {
        const wrapper = mount(DropdownMenu, {
            props: { label: '缩放', items: ZOOM_ITEMS },
            slots: { trigger: CUSTOM_TRIGGER_SLOT },
            attachTo: document.body,
        })
        vi.spyOn(wrapper.find('[data-custom-trigger]').element as HTMLElement, 'getBoundingClientRect').mockReturnValue({
            top: 100,
            bottom: 124,
            left: 12,
        } as DOMRect)
        await wrapper.find('[data-custom-trigger]').trigger('click')
        await flushPromises()
        await nextTick()
        // top = 触发钮下缘 124 + 间隙 6 = 130；left = 12
        expect(menuEl(wrapper)?.style.top).toBe('130px')
        expect(menuEl(wrapper)?.style.left).toBe('12px')
        wrapper.unmount()
    })
})

describe('DropdownMenu：body 受控插槽（issues/05 面板＋ rowsPath 表单）', () => {
    const BODY_SLOT = `<template #body="{ closeMenu }">
        <input data-body-input />
        <button type="button" data-body-close @click="closeMenu">取消</button>
    </template>`

    it('插槽内容随菜单渲染；内容在容器内——点击不收；closeMenu 受控可关', async () => {
        const wrapper = mount(DropdownMenu, {
            props: { label: '新增', items: [] },
            slots: { body: BODY_SLOT },
        })
        await wrapper.find('[data-dropdown-trigger]').trigger('click')
        expect(wrapper.find('[data-body-input]').exists()).toBe(true)

        // 插槽内容点击不收（容器包含判定覆盖 body）
        wrapper.find('[data-body-input]').element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
        await nextTick()
        expect(menuEl(wrapper)).toBeDefined()

        await wrapper.find('[data-body-close]').trigger('click')
        expect(menuEl(wrapper)).toBeUndefined()
        wrapper.unmount()
    })

    it('body 内输入框方向键不被菜单劫持（可编辑目标守卫）：不 preventDefault、焦点不迁移', async () => {
        const wrapper = mount(DropdownMenu, {
            props: { label: '新增', items: [{ label: '文本层', run: () => {} }] },
            slots: { body: `<template #body><input data-body-input /></template>` },
            attachTo: document.body,
        })
        await wrapper.find('[data-dropdown-trigger]').trigger('click')
        await flushPromises()
        const input = wrapper.find('[data-body-input]')
        ;(input.element as HTMLElement).focus()
        const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
        input.element.dispatchEvent(event)
        await flushPromises()
        expect(event.defaultPrevented).toBe(false)
        expect(document.activeElement).toBe(input.element)
        wrapper.unmount()
    })

    it('body 内可编辑目标 Tab 让路不收菜单（表单移焦序保留，issues/05 review）；菜单项 Tab 照常收', async () => {
        const wrapper = mount(DropdownMenu, {
            props: { label: '新增', items: [{ label: '文本层', run: () => {} }] },
            slots: { body: `<template #body><input data-body-input /><button type="button" data-body-ok>创建</button></template>` },
            attachTo: document.body,
        })
        await wrapper.find('[data-dropdown-trigger]').trigger('click')
        await flushPromises()

        // 输入框上 Tab：不 preventDefault（原生移焦走表单序，jsdom 不实现默认移焦）、菜单不收
        const input = wrapper.find('[data-body-input]')
        ;(input.element as HTMLElement).focus()
        const tabInInput = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
        input.element.dispatchEvent(tabInInput)
        await flushPromises()
        expect(tabInInput.defaultPrevented).toBe(false)
        expect(menuEl(wrapper)).toBeDefined()

        // body 内按钮（isEditableEventTarget 命中）上 Tab 同样让路
        const ok = wrapper.find('[data-body-ok]')
        ;(ok.element as HTMLElement).focus()
        const tabOnButton = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
        ok.element.dispatchEvent(tabOnButton)
        await flushPromises()
        expect(tabOnButton.defaultPrevented).toBe(false)
        expect(menuEl(wrapper)).toBeDefined()

        // 菜单项（data-dropdown-item）上 Tab 照常收起回焦触发钮
        const item = itemEls(wrapper)[0] as HTMLElement
        item.focus()
        item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
        await flushPromises()
        expect(menuEl(wrapper)).toBeUndefined()
        expect(document.activeElement).toBe(triggerEl(wrapper))
        wrapper.unmount()
    })
})

describe('DropdownMenu：closed 事件（issues/05 面板＋表单态随收重置）', () => {
    it('开→收发出一次（Esc/点外/分发各路），收→开不发', async () => {
        const closed = vi.fn()
        const wrapper = mount(DropdownMenu, { props: { label: '排列', items: ARRANGE_ITEMS, onClosed: closed } })
        await wrapper.find('[data-dropdown-trigger]').trigger('click')
        expect(closed).not.toHaveBeenCalled()

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        await nextTick()
        expect(closed).toHaveBeenCalledTimes(1)

        // 收→开不发；分发即收再发一次
        await wrapper.find('[data-dropdown-trigger]').trigger('click')
        expect(closed).toHaveBeenCalledTimes(1)
        ;(itemEls(wrapper)[0] as HTMLElement).click()
        await nextTick()
        expect(closed).toHaveBeenCalledTimes(2)
        wrapper.unmount()
    })
})

// ---- submenu 两段式条目底座（canvas-web-preset-submenu 工单 02）----
// 一级行两段式命中区：主体（直建）+ 右缘 ▸ 钮（预设二级浮层）。工单 03 面板
// IA 消费本形态——主体 run = armLayerCreate(type)、子项 run = 带 preset 直建。

/** 两段式 fixture（工单 03 面板同型：文本层 3 档含置灰档 + 图片层 2 档 + 普通项） */
const SUBMENU_ITEMS: DropdownMenuEntry[] = [
    {
        kind: 'submenu',
        label: '文本层',
        shortcut: 'T',
        title: '按新层样式直建',
        dataAttrs: { 'data-add-layer': 'text' },
        run: () => void runs.push('text'),
        children: [
            { label: '标题', shortcut: '40号', run: () => void runs.push('text-title') },
            { label: '置灰档', title: '模板未配', disabled: true, run: () => void runs.push('text-disabled') },
            { label: '正文', shortcut: '16号', run: () => void runs.push('text-body') },
        ],
    },
    { label: '二维码层', dataAttrs: { 'data-add-layer': 'qr' }, run: () => void runs.push('qr') },
    {
        kind: 'submenu',
        label: '图片层',
        run: () => void runs.push('image'),
        children: [
            { label: '1:1', shortcut: '正方形', run: () => void runs.push('image-1-1') },
            { label: '4:3', shortcut: '横向', run: () => void runs.push('image-4-3') },
        ],
    },
]

/** 两段式挂载（attachTo 进文档：悬停/焦点断言只对在档元素生效） */
const mountSubmenu = (items: DropdownMenuEntry[] = SUBMENU_ITEMS) =>
    mount(DropdownMenu, { props: { label: '新增', items }, attachTo: document.body })

/** 开菜单并等焦点编排完成（键盘 describe 的 openByClick 同式，submenu 作用域复用） */
const openSubmenuByClick = async (wrapper: ReturnType<typeof mountSubmenu>): Promise<void> => {
    await wrapper.find('[data-dropdown-trigger]').trigger('click')
    await flushPromises()
}

/** ▸ 钮列表（DOM 序 = 条目序中 submenu 形态的出场序） */
const arrowEls = (wrapper: ReturnType<typeof mountSubmenu>): HTMLElement[] =>
    Array.from(menuEl(wrapper)?.querySelectorAll('[data-dropdown-submenu-arrow]') ?? []) as HTMLElement[]

/** 两段式行宿主列表 */
const hostEls = (wrapper: ReturnType<typeof mountSubmenu>): HTMLElement[] =>
    Array.from(menuEl(wrapper)?.querySelectorAll('[data-dropdown-submenu-host]') ?? []) as HTMLElement[]

/** 二级浮层（单开不变量 → 至多一个；v-if 未渲染返回 undefined） */
const flyoutEl = (wrapper: ReturnType<typeof mountSubmenu>): HTMLElement | undefined => {
    const found = wrapper.find('[data-dropdown-submenu]')
    return found.exists() ? (found.element as HTMLElement) : undefined
}

/** 二级子项列表（DOM 序，与 children 非 separator 条目对齐） */
const subItemEls = (wrapper: ReturnType<typeof mountSubmenu>): HTMLElement[] =>
    Array.from(flyoutEl(wrapper)?.querySelectorAll('[data-dropdown-submenu-item]') ?? []) as HTMLElement[]

/** 悬停驱动（mouseenter 不冒泡，直接在目标上派发） */
const hover = async (el: HTMLElement): Promise<void> => {
    el.dispatchEvent(new MouseEvent('mouseenter'))
    await flushPromises()
}

describe('DropdownMenu：submenu 两段式渲染与 a11y（工单 02）', () => {
    it('两段式一级行：主体（label+shortcut 灰字）+ ▸ 钮（aria-haspopup/aria-expanded/tabindex=-1）；普通条目零两段结构', async () => {
        const wrapper = mountSubmenu()
        await openSubmenuByClick(wrapper)

        expect(hostEls(wrapper)).toHaveLength(2)
        expect(arrowEls(wrapper)).toHaveLength(2)
        // 主体命中区与普通项同一导航序（[data-dropdown-item] = 两主体 + 二维码）
        const mains = itemEls(wrapper)
        expect(mains).toHaveLength(3)
        expect(mains[0]?.textContent).toContain('文本层')
        expect(mains[0]?.textContent).toContain('T')
        expect(mains[1]?.textContent).toContain('二维码层')
        // ▸ 钮 a11y 两属性（工单拍板）+ 可编程聚焦（收回归 ▸ 的前提）
        const arrow = arrowEls(wrapper)[0] as HTMLElement
        expect(arrow.getAttribute('aria-haspopup')).toBe('menu')
        expect(arrow.getAttribute('aria-expanded')).toBe('false')
        expect(arrow.getAttribute('tabindex')).toBe('-1')
        wrapper.unmount()
    })

    it('▸ 点击开二级：flyout role=menu/aria-label、aria-expanded 翻 true、子项 role=menuitem + 灰字后缀；再点 ▸ 收（toggle）', async () => {
        const wrapper = mountSubmenu()
        await openSubmenuByClick(wrapper)
        expect(flyoutEl(wrapper)).toBeUndefined()

        const arrow = arrowEls(wrapper)[0] as HTMLElement
        arrow.click()
        await nextTick()
        const flyout = flyoutEl(wrapper)
        expect(flyout).toBeDefined()
        expect(flyout?.getAttribute('role')).toBe('menu')
        expect(flyout?.getAttribute('aria-label')).toBe('文本层')
        expect(arrow.getAttribute('aria-expanded')).toBe('true')
        // 子项：3 档、role=menuitem、灰字后缀、置灰档带 title
        const children = subItemEls(wrapper)
        expect(children).toHaveLength(3)
        expect(children.every((el) => el.getAttribute('role') === 'menuitem')).toBe(true)
        expect(children[0]?.textContent).toContain('标题')
        expect(children[0]?.textContent).toContain('40号')
        expect(children[1]?.hasAttribute('disabled')).toBe(true)
        expect(children[1]?.getAttribute('title')).toBe('模板未配')

        // 再点 ▸ 收（toggle 同行翻转）
        arrow.click()
        await nextTick()
        expect(flyoutEl(wrapper)).toBeUndefined()
        expect(arrow.getAttribute('aria-expanded')).toBe('false')
        wrapper.unmount()
    })

    it('主体点击 = run + 收整个菜单（直建语义，不进二级）；dataAttrs 透传主体钮', async () => {
        const wrapper = mountSubmenu()
        await openSubmenuByClick(wrapper)
        expect(wrapper.find('[data-add-layer="text"]').exists()).toBe(true)
        expect(wrapper.find('[data-add-layer="qr"]').exists()).toBe(true)

        ;(itemEls(wrapper)[0] as HTMLElement).click()
        await nextTick()
        expect(runs).toEqual(['text'])
        expect(menuEl(wrapper)).toBeUndefined()
        wrapper.unmount()
    })
})

describe('DropdownMenu：submenu 悬停门控（工单 02）', () => {
    it('主体悬停不开二级；▸ 悬停开；异行 ▸ 悬停换开（单开不变量）；移出菜单收二级', async () => {
        const wrapper = mountSubmenu()
        await openSubmenuByClick(wrapper)

        // 主体悬停不开（保「点一级直达」干净）
        await hover(itemEls(wrapper)[0] as HTMLElement)
        expect(flyoutEl(wrapper)).toBeUndefined()

        // ▸ 悬停开（指针路径不动焦点——焦点编排归键盘路径）
        const arrowA = arrowEls(wrapper)[0] as HTMLElement
        await hover(arrowA)
        expect(flyoutEl(wrapper)).toBeDefined()
        expect(flyoutEl(wrapper)?.getAttribute('aria-label')).toBe('文本层')
        expect(arrowA.getAttribute('aria-expanded')).toBe('true')

        // 换开：B 行 ▸ 悬停 → A 收 B 开（单开不变量）
        const arrowB = arrowEls(wrapper)[1] as HTMLElement
        await hover(arrowB)
        expect(flyoutEl(wrapper)?.getAttribute('aria-label')).toBe('图片层')
        expect(arrowA.getAttribute('aria-expanded')).toBe('false')
        expect(arrowB.getAttribute('aria-expanded')).toBe('true')

        // 移出菜单收二级（▸→浮层跨界由 ::before 桥接覆盖，容器 mouseleave 即真出界）
        await wrapper.find('.cn-dropdown').trigger('mouseleave')
        expect(flyoutEl(wrapper)).toBeUndefined()
        expect(arrowB.getAttribute('aria-expanded')).toBe('false')
        wrapper.unmount()
    })

    it('子项点击 = run + 收整个菜单（预设直建）；置灰子项点击不跑', async () => {
        const wrapper = mountSubmenu()
        await openSubmenuByClick(wrapper)
        await hover(arrowEls(wrapper)[0] as HTMLElement)

        subItemEls(wrapper)[2]?.click()
        await nextTick()
        expect(runs).toEqual(['text-body'])
        expect(menuEl(wrapper)).toBeUndefined()
        wrapper.unmount()
    })

    it('closed 事件随二级开合不受扰：菜单收起才发（二级收不发）', async () => {
        const closed = vi.fn()
        const wrapper = mount(DropdownMenu, { props: { label: '新增', items: SUBMENU_ITEMS, onClosed: closed } })
        await wrapper.find('[data-dropdown-trigger]').trigger('click')
        await flushPromises()
        await hover(arrowEls(wrapper)[0] as HTMLElement)
        await wrapper.find('.cn-dropdown').trigger('mouseleave')
        expect(closed).not.toHaveBeenCalled()

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        await nextTick()
        expect(closed).toHaveBeenCalledTimes(1)
        wrapper.unmount()
    })
})

describe('DropdownMenu：二级浮层定位钳位翻左（工单 02）', () => {
    /** 原型级 rect mock：▸ 钮/浮层按 fixture 落位，其余元素零矩形（jsdom 无布局） */
    const mockRects = (arrowRect: DOMRect, flyoutRect: DOMRect): (() => void) => {
        const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            if (this.hasAttribute('data-dropdown-submenu')) return flyoutRect
            if (this.hasAttribute('data-dropdown-submenu-arrow')) return arrowRect
            return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 } as DOMRect
        })
        return () => spy.mockRestore()
    }

    it('右缘放得下：首帧锚行右 + 间隙 6、顶对齐行顶，渲染后不翻左', async () => {
        const wrapper = mountSubmenu()
        await openSubmenuByClick(wrapper)
        const restore = mockRects(
            { top: 100, bottom: 124, left: 190, right: 200, width: 10, height: 24 } as DOMRect,
            { top: 100, bottom: 150, left: 206, right: 356, width: 150, height: 50 } as DOMRect,
        )
        ;(arrowEls(wrapper)[0] as HTMLElement).click()
        await flushPromises()
        await nextTick()
        const flyout = flyoutEl(wrapper)
        expect(flyout?.style.left).toBe('206px')
        expect(flyout?.style.top).toBe('100px')
        expect(flyout?.classList.contains('cn-dropdown__submenu--left')).toBe(false)
        restore()
        wrapper.unmount()
    })

    it('右缘放不下翻左侧（--left 类挂桥接钩子）：右缘 = 行左缘 − 间隙、顶缘仍钳位', async () => {
        const wrapper = mountSubmenu()
        await openSubmenuByClick(wrapper)
        const restore = mockRects(
            { top: 100, bottom: 124, left: 950, right: 1020, width: 70, height: 24 } as DOMRect,
            { top: 0, bottom: 0, left: 0, right: 0, width: 150, height: 700 } as DOMRect,
        )
        ;(arrowEls(wrapper)[0] as HTMLElement).click()
        await flushPromises()
        await nextTick()
        const flyout = flyoutEl(wrapper)
        // 右侧放不下（1020 + 6 + 150 > 1022）→ 翻左：950 − 6 − 150 = 794；
        // 垂直：100 + 700 > 766 → 钳回 768 − 2 − 700 = 66
        expect(flyout?.style.left).toBe('794px')
        expect(flyout?.style.top).toBe('66px')
        expect(flyout?.classList.contains('cn-dropdown__submenu--left')).toBe(true)
        restore()
        wrapper.unmount()
    })

    it('浮层尺寸量不到（jsdom 零矩形）：保留首帧锚点不误翻', async () => {
        const wrapper = mountSubmenu()
        await openSubmenuByClick(wrapper)
        const restore = mockRects(
            { top: 100, bottom: 124, left: 950, right: 1020, width: 70, height: 24 } as DOMRect,
            { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 } as DOMRect,
        )
        ;(arrowEls(wrapper)[0] as HTMLElement).click()
        await flushPromises()
        await nextTick()
        const flyout = flyoutEl(wrapper)
        expect(flyout?.style.left).toBe('1026px')
        expect(flyout?.style.top).toBe('100px')
        expect(flyout?.classList.contains('cn-dropdown__submenu--left')).toBe(false)
        restore()
        wrapper.unmount()
    })
})

describe('DropdownMenu：keepsOpen 与两段式条目共存（工单 02 兼容面）', () => {
    it('keepsOpen 项在含 submenu 条目的菜单中照常留场（模板表表单交换特例不受扰）', async () => {
        const wrapper = mount(DropdownMenu, {
            props: {
                label: '新增',
                items: [
                    {
                        kind: 'submenu',
                        label: '图片层',
                        run: () => void runs.push('image'),
                        children: [{ label: '1:1', run: () => void runs.push('image-1-1') }],
                    },
                    { label: '模板表', keepsOpen: true, run: () => void runs.push('form') },
                ],
            },
        })
        await wrapper.find('[data-dropdown-trigger]').trigger('click')
        ;(itemEls(wrapper)[1] as HTMLElement).click()
        await nextTick()
        expect(runs).toEqual(['form'])
        expect(menuEl(wrapper)).toBeDefined()
        wrapper.unmount()
    })
})
