// @vitest-environment jsdom
/**
 * useDropdownMenu 单测（editor-top-toolbar 工单 02）：下拉菜单开合底座的逻辑面。
 * - 开合：初始关、toggle 翻转、openMenu/closeMenu 直设；
 * - 点外收：开态下容器外 pointerdown 收起，容器内（触发钮/菜单本体）不收——
 *   触发钮的收合归 click 翻转（状态栏缩放菜单先例的封装版，免 .stop 约定）；
 * - Esc 收（window keydown）；非 Esc 不收；
 * - 开态才挂监听：收起即摘除（行为可观察——摘除后派发不再驱动开合态）；
 * - 卸载兜底：开态卸载后监听已摘除（onScopeDispose）；
 * - 菜单键盘导航落点 nextEnabledItemIndex 纯函数（issues/04）：↑↓ 循环跳置灰、
 *   Home/End 首尾、全置灰返回 -1（调用方回焦菜单根）；
 * - 焦点落点判定 focusTargetOnOpen / focusTargetOnSubmenuClose /
 *   focusTargetOnMenuClose 三纯函数（canvas-web-preset-submenu 评审整改 F5，自
 *   呈现件 DropdownMenu.vue 抽入）：开入首启用项兜底容器根、收二级回 ▸、收菜单
 *   回触发钮——DOM 只读判形，focus() 副作用留呈现件。
 */
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'

import {
    focusTargetOnMenuClose,
    focusTargetOnOpen,
    focusTargetOnSubmenuClose,
    nextEnabledItemIndex,
    nextOpenSubmenu,
    placeSubmenuInViewport,
    submenuKeyAction,
    useDropdownMenu,
    type DropdownMenuController,
} from '../../src/shared/useDropdownMenu'

/** 测试挂载壳：setup 内消费 composable，容器 ref 绑到根 div（真实使用路径） */
let controller: DropdownMenuController | null = null
let containerEl: HTMLElement | null = null

const Harness = defineComponent({
    setup() {
        const container = ref<HTMLElement | null>(null)
        controller = useDropdownMenu({ container })
        return () => h('div', { ref: container }, 'trigger')
    },
})

const mountHarness = () => {
    const wrapper = mount(Harness, { attachTo: document.body })
    containerEl = wrapper.element as HTMLElement
    return wrapper
}

/** 容器外元素（document.body 直挂）：点外收的派发目标 */
const dispatchOutsidePointerDown = (): void => {
    const outsider = document.createElement('div')
    document.body.appendChild(outsider)
    outsider.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    outsider.remove()
}

describe('useDropdownMenu：开合', () => {
    it('初始关；toggle 翻转；openMenu/closeMenu 直设', () => {
        const wrapper = mountHarness()
        expect(controller?.open.value).toBe(false)

        controller?.toggle()
        expect(controller?.open.value).toBe(true)
        controller?.toggle()
        expect(controller?.open.value).toBe(false)

        controller?.openMenu()
        expect(controller?.open.value).toBe(true)
        controller?.closeMenu()
        expect(controller?.open.value).toBe(false)
        wrapper.unmount()
    })
})

describe('useDropdownMenu：点外收', () => {
    it('开态点容器外收起', async () => {
        const wrapper = mountHarness()
        controller?.openMenu()
        await nextTick()

        dispatchOutsidePointerDown()
        expect(controller?.open.value).toBe(false)
        wrapper.unmount()
    })

    it('容器内 pointerdown（触发钮/菜单本体）不收——收合归触发钮 click 翻转', async () => {
        const wrapper = mountHarness()
        controller?.openMenu()
        await nextTick()

        containerEl?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
        expect(controller?.open.value).toBe(true)
        wrapper.unmount()
    })
})

describe('useDropdownMenu：Esc 收', () => {
    it('开态 Esc 收起', async () => {
        const wrapper = mountHarness()
        controller?.openMenu()
        await nextTick()

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        expect(controller?.open.value).toBe(false)
        wrapper.unmount()
    })

    it('非 Esc 键不收', async () => {
        const wrapper = mountHarness()
        controller?.openMenu()
        await nextTick()

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
        expect(controller?.open.value).toBe(true)
        wrapper.unmount()
    })
})

describe('useDropdownMenu：开态才挂监听', () => {
    it('收起即摘除：派发不再驱动开合态（关态 Esc/点外零副作用）', async () => {
        const wrapper = mountHarness()
        controller?.openMenu()
        await nextTick()
        controller?.closeMenu()
        await nextTick()

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        dispatchOutsidePointerDown()
        expect(controller?.open.value).toBe(false)
        wrapper.unmount()
    })
})

describe('useDropdownMenu：卸载兜底', () => {
    it('开态卸载后监听已摘除（Esc/点外不再驱动开合态，onScopeDispose）', async () => {
        const wrapper = mountHarness()
        controller?.openMenu()
        await nextTick()
        wrapper.unmount()

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        dispatchOutsidePointerDown()
        expect(controller?.open.value).toBe(true)
    })
})

describe('nextEnabledItemIndex：菜单键盘导航落点（issues/04）', () => {
    it('ArrowDown 从菜单根（current=-1）落首个启用项；ArrowUp 落末个启用项', () => {
        expect(nextEnabledItemIndex([true, true, true], -1, 'ArrowDown')).toBe(0)
        expect(nextEnabledItemIndex([true, true, true], -1, 'ArrowUp')).toBe(2)
    })

    it('循环移动：末项 ↓ 绕回首项、首项 ↑ 绕回末项', () => {
        expect(nextEnabledItemIndex([true, true, true], 2, 'ArrowDown')).toBe(0)
        expect(nextEnabledItemIndex([true, true, true], 0, 'ArrowUp')).toBe(2)
    })

    it('跳过置灰项：可达集合只含启用项（排列▾ 同型——0/2 启用、1 置灰）', () => {
        expect(nextEnabledItemIndex([true, false, true], 0, 'ArrowDown')).toBe(2)
        expect(nextEnabledItemIndex([true, false, true], 2, 'ArrowUp')).toBe(0)
        // 置灰成段时跨段直落下一个启用项
        expect(nextEnabledItemIndex([false, true, false, true], 1, 'ArrowDown')).toBe(3)
        expect(nextEnabledItemIndex([false, true, false, true], 1, 'ArrowUp')).toBe(3)
    })

    it('Home/End 落首/末启用项（与当前焦点无关）', () => {
        expect(nextEnabledItemIndex([false, true, true, false], 2, 'Home')).toBe(1)
        expect(nextEnabledItemIndex([false, true, true, false], 1, 'End')).toBe(2)
        expect(nextEnabledItemIndex([false, true, true, false], -1, 'Home')).toBe(1)
    })

    it('全置灰返回 -1（调用方回焦菜单根）；唯一启用项 ↑↓ 停在自身', () => {
        expect(nextEnabledItemIndex([false, false], 0, 'ArrowDown')).toBe(-1)
        expect(nextEnabledItemIndex([false, false], -1, 'End')).toBe(-1)
        expect(nextEnabledItemIndex([true, false, false], 0, 'ArrowDown')).toBe(0)
        expect(nextEnabledItemIndex([true, false, false], 0, 'ArrowUp')).toBe(0)
    })
})

// ---- submenu 两段式条目底座（canvas-web-preset-submenu 工单 02）：纯函数面 ----
// 开合态以条目引用为键（身份等价，免下标簿记）；单测用 number 代条目钉语义。

describe('nextOpenSubmenu：二级开合切换（工单 02）', () => {
    it('open 换开：▸ 悬停/键盘 → 恒开指定行——异行换开（A 开 → open B 收 A 开 B）、同行保持', () => {
        expect(nextOpenSubmenu(0, { type: 'open', target: 2 })).toBe(2)
        expect(nextOpenSubmenu(2, { type: 'open', target: 2 })).toBe(2)
    })

    it('toggle 同行翻转（▸ 点击）：已开收起、未开打开；异行点击换开', () => {
        expect(nextOpenSubmenu(2, { type: 'toggle', target: 2 })).toBeNull()
        expect(nextOpenSubmenu(null, { type: 'toggle', target: 2 })).toBe(2)
        expect(nextOpenSubmenu(0, { type: 'toggle', target: 2 })).toBe(2)
    })

    it('close 收起（移出菜单/菜单随收/子项分发）：任一态都落全关', () => {
        expect(nextOpenSubmenu(1, { type: 'close' })).toBeNull()
        expect(nextOpenSubmenu(null, { type: 'close' })).toBeNull()
    })
})

describe('placeSubmenuInViewport：二级翻转判定与钳位（工单 02）', () => {
    /** 视口 1024×768（jsdom 同值），留白 2、间隙 6 与组件常量同语 */
    const anchor = { top: 100, bottom: 124, left: 10, right: 200 }
    const place = (anchorBox: { top: number; bottom: number; left: number; right: number }, width: number, height: number) =>
        placeSubmenuInViewport({ anchor: anchorBox, flyoutWidth: width, flyoutHeight: height, viewportWidth: 1024, viewportHeight: 768 })

    it('右缘放得下：弹触发行右侧（左缘 = 行右缘 + 间隙 6、顶缘对齐行顶缘）', () => {
        expect(place(anchor, 150, 120)).toEqual({ left: 206, top: 100, side: 'right' })
    })

    it('右缘放不下翻左侧：右缘贴行左缘 − 间隙 6（图层面板停靠左缘、二级向右弹的主路径反例）', () => {
        const nearRight = { top: 100, bottom: 124, left: 950, right: 1020 }
        // 右侧：1020 + 6 + 150 = 1176 > 1022 → 翻左：950 − 6 − 150 = 794
        expect(place(nearRight, 150, 120)).toEqual({ left: 794, top: 100, side: 'left' })
    })

    it('翻左仍越左缘（钳不出正位）：左缘压回视口留白 2', () => {
        const wide = { top: 100, bottom: 124, left: 100, right: 1020 }
        // 左 = 100 − 6 − 150 = −56 → 钳回 2
        const placed = place(wide, 150, 120)
        expect(placed.side).toBe('left')
        expect(placed.left).toBe(2)
    })

    it('垂直钳位：行顶贴视口下缘时收回（下缘不越 766）、行顶越上缘时压回留白', () => {
        const lowRow = { top: 720, bottom: 744, left: 10, right: 200 }
        // 720 + 120 = 840 > 766 → top = 768 − 2 − 120 = 646
        expect(place(lowRow, 150, 120).top).toBe(646)
        const highRow = { top: -10, bottom: 14, left: 10, right: 200 }
        expect(place(highRow, 150, 120).top).toBe(2)
    })

    it('尺寸量不到（宽/高 0——首帧未渲染）：不翻转不移动，首帧锚点原样', () => {
        expect(place(anchor, 0, 0)).toEqual({ left: 206, top: 100, side: 'right' })
    })
})

describe('submenuKeyAction：二级键盘动作判定（工单 02）', () => {
    it('↑↓/Home/End → 二级内推进（落点仍归 nextEnabledItemIndex）', () => {
        expect(submenuKeyAction('ArrowDown')).toEqual({ type: 'move', key: 'ArrowDown' })
        expect(submenuKeyAction('ArrowUp')).toEqual({ type: 'move', key: 'ArrowUp' })
        expect(submenuKeyAction('Home')).toEqual({ type: 'move', key: 'Home' })
        expect(submenuKeyAction('End')).toEqual({ type: 'move', key: 'End' })
    })

    it('← 与 Esc → 收二级（菜单留场，两段收的第一段）', () => {
        expect(submenuKeyAction('ArrowLeft')).toEqual({ type: 'close' })
        expect(submenuKeyAction('Escape')).toEqual({ type: 'close' })
    })

    it('Enter/Space → 激活焦点子项；Tab → 收整个菜单（沿现状）；其余 none（模态吞掉）', () => {
        expect(submenuKeyAction('Enter')).toEqual({ type: 'activate' })
        expect(submenuKeyAction(' ')).toEqual({ type: 'activate' })
        expect(submenuKeyAction('Tab')).toEqual({ type: 'close-menu' })
        expect(submenuKeyAction('a')).toEqual({ type: 'none' })
    })
})

// ---- 焦点落点判定三纯函数（canvas-web-preset-submenu 评审整改 F5）：DOM 只读
// 判形（querySelector/closest/hasAttribute），focus() 写副作用留呈现件 ----

/** 菜单项形元素（data-dropdown-item 可选 disabled） */
const menuItemEl = (disabled = false): HTMLElement => {
    const el = document.createElement('button')
    el.setAttribute('data-dropdown-item', '')
    if (disabled) el.setAttribute('disabled', '')
    return el
}

describe('focusTargetOnOpen：开焦点落点（评审整改 F5）', () => {
    it('条目 DOM 序首个启用项：前置置灰项跳过（菜单开入/二级键盘开入共用判定）', () => {
        const container = document.createElement('div')
        const disabled = menuItemEl(true)
        const enabled = menuItemEl(false)
        container.append(disabled, enabled)
        expect(focusTargetOnOpen([disabled, enabled], container)).toBe(enabled)
        expect(focusTargetOnOpen([enabled, disabled], container)).toBe(enabled)
    })

    it('全置灰或空清单回落容器根（菜单根/二级浮层根 tabindex=-1 可编程聚焦）', () => {
        const container = document.createElement('div')
        expect(focusTargetOnOpen([menuItemEl(true), menuItemEl(true)], container)).toBe(container)
        expect(focusTargetOnOpen([], container)).toBe(container)
    })
})

describe('focusTargetOnSubmenuClose：收二级回焦 ▸ 落点（评审整改 F5）', () => {
    /** 两段式行宿主（data-dropdown-submenu-host + 主体 + ▸ 钮） */
    const submenuHost = (): { host: HTMLElement; main: HTMLElement; arrow: HTMLElement } => {
        const host = document.createElement('div')
        host.setAttribute('data-dropdown-submenu-host', '')
        const main = menuItemEl(false)
        const arrow = document.createElement('button')
        arrow.setAttribute('data-dropdown-submenu-arrow', '')
        host.append(main, arrow)
        document.body.appendChild(host)
        return { host, main, arrow }
    }

    it('焦点在两段式行内（主体或 ▸）→ 该行 ▸ 钮（APG「关子菜单回父项」惯例）', () => {
        const { main, arrow } = submenuHost()
        expect(focusTargetOnSubmenuClose(main)).toBe(arrow)
        expect(focusTargetOnSubmenuClose(arrow)).toBe(arrow)
    })

    it('多行嵌套各回各的 ▸：closest 最近宿主，不串行', () => {
        submenuHost()
        const { main, arrow } = submenuHost()
        expect(focusTargetOnSubmenuClose(main)).toBe(arrow)
    })

    it('焦点不在行内（body/无 active）→ null = 不迁焦（只收不追焦）', () => {
        expect(focusTargetOnSubmenuClose(document.body)).toBeNull()
        expect(focusTargetOnSubmenuClose(null)).toBeNull()
    })
})

describe('focusTargetOnMenuClose：收菜单回焦触发钮落点（评审整改 F5）', () => {
    it('触发钮在场 → 回焦该钮；#trigger 自绘钮未接 triggerRef 的退化（null）→ 不迁焦', () => {
        const trigger = document.createElement('button')
        expect(focusTargetOnMenuClose(trigger)).toBe(trigger)
        expect(focusTargetOnMenuClose(null)).toBeNull()
    })
})
