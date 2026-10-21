// @vitest-environment jsdom
/**
 * Tooltip 组件集成测试（edit-toolbar-declutter 工票 01）：悬停/聚焦延迟气泡的
 * 外部行为契约（只测外部行为，几何数学归 popupPosition 单测，此处不重复）。
 * - 延迟档：假定时器钉「hover 满 delay 才出气泡」（缺省 300ms、props 可调），
 *   label 文案正确；
 * - 隐藏三路：mouseleave / pointerdown / focusout；focusin 触发显示（键盘路径
 *   不等延迟，即时出）；
 * - pointerdown 隐藏监听挂 wrapper capture 段：按钮类控件由父级拦 pointerdown
 *   （工具条 root.prevent 形态）、输入件类 stop 放行（下拉触发钮同门形态），
 *   两种形态下气泡都隐藏；
 * - 无障碍接线：气泡 role=tooltip + 稳定 id；显示时被包裹控件（wrapper 首个
 *   元素子节点）获 aria-describedby、隐藏时摘除；
 * - 定位消费接线（popupPosition 纯函数已有单测）：jsdom rect 恒 0 钉「量不到
 *   尺寸不误翻转」降级路径（锚点下方 + 间隙）；mock rect 钉翻转 + 钳位走通；
 * - attrs 透传：class / data-* 落 wrapper（消费方布局适配，如面板宫格 flex-1）。
 * 气泡 Teleport 到 body——断言绕过 wrapper 直查 document（HelpDialog 先例）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

import Tooltip from '../../src/shared/Tooltip.vue'

/** 气泡（Teleport 到 body，不在 wrapper 子树内） */
const bubbleEl = (): HTMLElement | null => document.body.querySelector<HTMLElement>('[data-tooltip]')
/** 被包裹控件（wrapper 首个元素子节点） */
const controlEl = (wrapper: ReturnType<typeof mountTooltip>): HTMLElement =>
    wrapper.find('[data-wrapped-control]').element as HTMLElement

const mountTooltip = (props: { label: string; delay?: number } = { label: '复制图层' }) =>
    mount(Tooltip, {
        props,
        slots: { default: '<button type="button" data-wrapped-control>复制</button>' },
        attachTo: document.body,
    })

/** wrapper 元素（attachTo 挂载下 wrapper.element 是 VTU 应用容器——组件事件/
 *  属性断言一律落在 .cn-tooltip 真身，DropdownMenu 用例同式） */
const hostEl = (wrapper: ReturnType<typeof mountTooltip>): ReturnType<typeof wrapper.find> =>
    wrapper.find('.cn-tooltip')

/** hover 出泡（假定时器走满缺省延迟档 + 等 Vue flush） */
const hoverAndAwait = async (wrapper: ReturnType<typeof mountTooltip>): Promise<void> => {
    hostEl(wrapper).trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(300)
    await nextTick()
}

beforeEach(() => {
    document.body.innerHTML = ''
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('Tooltip：延迟档与气泡呈现（工票 01）', () => {
    it('hover 满 delay（缺省 300ms）才出气泡：299ms 未出、300ms 出；label 文案与 role=tooltip 正确', async () => {
        const wrapper = mountTooltip()
        expect(bubbleEl()).toBeNull()

        await hostEl(wrapper).trigger('mouseenter')
        await vi.advanceTimersByTimeAsync(299)
        await nextTick()
        expect(bubbleEl()).toBeNull()

        await vi.advanceTimersByTimeAsync(1)
        await nextTick()
        const bubble = bubbleEl()
        expect(bubble).not.toBeNull()
        expect(bubble?.textContent).toBe('复制图层')
        expect(bubble?.getAttribute('role')).toBe('tooltip')
        wrapper.unmount()
    })

    it('delay props 可调档：delay 60 时 59ms 未出、60ms 出', async () => {
        const wrapper = mountTooltip({ label: '置顶', delay: 60 })
        await hostEl(wrapper).trigger('mouseenter')
        await vi.advanceTimersByTimeAsync(59)
        await nextTick()
        expect(bubbleEl()).toBeNull()

        await vi.advanceTimersByTimeAsync(1)
        await nextTick()
        expect(bubbleEl()?.textContent).toBe('置顶')
        wrapper.unmount()
    })

    it('稳定 id：同一实例两次显示 id 不变；不同实例 id 互不相同', async () => {
        const wrapper = mountTooltip()
        await hoverAndAwait(wrapper)
        const firstId = bubbleEl()?.getAttribute('id')
        expect(firstId).not.toBe('')
        expect(firstId).not.toBeNull()

        await hostEl(wrapper).trigger('mouseleave')
        await nextTick()
        await hoverAndAwait(wrapper)
        expect(bubbleEl()?.getAttribute('id')).toBe(firstId)
        wrapper.unmount()

        const another = mountTooltip()
        await hoverAndAwait(another)
        const anotherId = bubbleEl()?.getAttribute('id')
        expect(anotherId).not.toBe('')
        expect(anotherId).not.toBe(firstId)
        another.unmount()
    })
})

describe('Tooltip：隐藏三路（工票 01）', () => {
    it('mouseleave 隐藏（aria-describedby 随动摘除）；延迟未满即离开不残留定时器', async () => {
        const wrapper = mountTooltip()
        await hoverAndAwait(wrapper)
        expect(bubbleEl()).not.toBeNull()

        await hostEl(wrapper).trigger('mouseleave')
        await nextTick()
        expect(bubbleEl()).toBeNull()
        expect(controlEl(wrapper).hasAttribute('aria-describedby')).toBe(false)

        // 延迟未满即离开：定时器作废，之后不再出泡
        await hostEl(wrapper).trigger('mouseenter')
        await hostEl(wrapper).trigger('mouseleave')
        await vi.advanceTimersByTimeAsync(300)
        await nextTick()
        expect(bubbleEl()).toBeNull()
        wrapper.unmount()
    })

    it('focusin 即时出泡（键盘路径不等延迟档）', async () => {
        const wrapper = mountTooltip()
        await wrapper.find('[data-wrapped-control]').trigger('focusin')
        await nextTick()
        expect(bubbleEl()).not.toBeNull()
        wrapper.unmount()
    })
})

describe('Tooltip：pointerdown 隐藏挂 wrapper capture 段（工票 01）', () => {
    /** 按钮类形态：工具条 root 拦 pointerdown（root.prevent 路径，不夺焦） */
    const RootPreventHost = defineComponent({
        components: { Tooltip },
        template: `<div data-toolbar-root @pointerdown.prevent>
            <Tooltip label="加粗"><button type="button" data-wrapped-control>B</button></Tooltip>
        </div>`,
    })
    /** 输入件形态：控件自身 stop 放行夺焦（下拉触发钮同门） */
    const StopControlHost = defineComponent({
        components: { Tooltip },
        template: `<div>
            <Tooltip label="字号"><input data-wrapped-control @pointerdown.stop /></Tooltip>
        </div>`,
    })

    const mountRootPreventHost = () => mount(RootPreventHost, { attachTo: document.body })
    const mountStopControlHost = () => mount(StopControlHost, { attachTo: document.body })
    type HostWrapper = ReturnType<typeof mountRootPreventHost>

    /** hover 出泡后在被包裹控件上派发 pointerdown（事件路径含 wrapper capture 段） */
    const showThenPointerDown = async (host: HostWrapper): Promise<void> => {
        const wrapped = host.find('.cn-tooltip').element as HTMLElement
        wrapped.dispatchEvent(new MouseEvent('mouseenter'))
        await vi.advanceTimersByTimeAsync(300)
        await nextTick()
        expect(bubbleEl()).not.toBeNull()

        host.find('[data-wrapped-control]').element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
        await nextTick()
        expect(bubbleEl()).toBeNull()
    }

    it('按钮类（父级 @pointerdown.prevent 拦截）：气泡照常隐藏', async () => {
        const host = mountRootPreventHost()
        await showThenPointerDown(host)
        host.unmount()
    })

    it('输入件类（@pointerdown.stop 放行）：capture 段先于 stop，气泡照常隐藏', async () => {
        const host = mountStopControlHost()
        await showThenPointerDown(host)
        host.unmount()
    })
})

describe('Tooltip：aria-describedby 接线（工票 01）', () => {
    it('显示时被包裹控件获 aria-describedby = 气泡 id；隐藏时摘除（hover 路径同断言）', async () => {
        const wrapper = mountTooltip()
        await hoverAndAwait(wrapper)

        const control = controlEl(wrapper)
        const bubble = bubbleEl()
        expect(bubble).not.toBeNull()
        expect(control.getAttribute('aria-describedby')).toBe(bubble?.getAttribute('id'))

        await hostEl(wrapper).trigger('focusout')
        await nextTick()
        expect(bubbleEl()).toBeNull()
        expect(control.hasAttribute('aria-describedby')).toBe(false)
        wrapper.unmount()
    })
})

describe('Tooltip：定位消费接线（popupPosition 纯函数已有单测，此处只钉接线）', () => {
    /** 原型级 rect mock：wrapper / 气泡按类与钩子落位，其余元素零矩形 */
    const mockRects = (hostRect: DOMRect, bubbleRect: DOMRect): (() => void) => {
        const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
            this: HTMLElement,
        ) {
            if (this.hasAttribute('data-tooltip')) return bubbleRect
            if (this.classList.contains('cn-tooltip')) return hostRect
            return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 } as DOMRect
        })
        return () => spy.mockRestore()
    }

    it('jsdom rect 恒 0（量不到尺寸）：降级路径不误翻转——锚点下方 + 间隙', async () => {
        const wrapper = mountTooltip()
        await hoverAndAwait(wrapper)
        // anchor.bottom 0 + gap 4 = 4；anchor.left 0、popupWidth 0 按原锚放不移动
        expect(bubbleEl()?.style.top).toBe('4px')
        expect(bubbleEl()?.style.left).toBe('0px')
        wrapper.unmount()
    })

    it('mock rect：下方放不下上翻、翻转仍不足钳回视口内、横向右缘收口（接线走通 placePopupInViewport）', async () => {
        const wrapper = mountTooltip()
        const restore = mockRects(
            { top: 100, bottom: 124, left: 950, right: 960, width: 10, height: 24 } as DOMRect,
            { top: 0, bottom: 0, left: 0, right: 0, width: 150, height: 700 } as DOMRect,
        )
        await hoverAndAwait(wrapper)
        // 下方 128 + 700 > 764 → 翻转 100 − 4 − 700 < 4 → 钳回 768 − 4 − 700 = 64；
        // 左 950 收口到 1024 − 4 − 150 = 870
        expect(bubbleEl()?.style.top).toBe('64px')
        expect(bubbleEl()?.style.left).toBe('870px')
        restore()
        wrapper.unmount()
    })
})

describe('Tooltip：attrs 透传 wrapper（工票 01）', () => {
    it('class / data-* 落 wrapper（消费方布局适配），不渗到气泡', () => {
        const wrapper = mount(Tooltip, {
            props: { label: '复制图层' },
            attrs: { class: 'flex-1', 'data-grid-cell': '' },
            slots: { default: '<button type="button" data-wrapped-control>复制</button>' },
            attachTo: document.body,
        })
        const host = hostEl(wrapper)
        expect(host.classes()).toContain('flex-1')
        expect(host.classes()).toContain('cn-tooltip')
        expect(host.attributes('data-grid-cell')).toBe('')
        expect(bubbleEl()).toBeNull()
        wrapper.unmount()
    })
})
