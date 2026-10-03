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
 *   Home/End 首尾、全置灰返回 -1（调用方回焦菜单根）。
 */
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'

import { nextEnabledItemIndex, useDropdownMenu, type DropdownMenuController } from '../../src/shared/useDropdownMenu'

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
