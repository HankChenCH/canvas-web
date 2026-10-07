// @vitest-environment jsdom
/**
 * Ruler 组件集成测试（ruler-guides-snap 工单 02）：
 * - 双条存在性：顶+左两条刻度条 + 角块，常显缺省（内核 rulersVisible 缺省 true），
 *   data-ruler-* 目验钩子（工单 04 自动化锚点）与 title/aria 无障碍属性；
 * - ⇧R 开关联动：开关态只读内核——executeShortcut('toggleRulers')（宿主
 *   useShortcuts 的分派面）走 store ui 分支通知，组件随显随隐；
 * - 刻度随缩放自适应：px 刻度密度按缩放换档（1-2-5 阶梯）、0 点=画布左上、
 *   刻度值随视口偏移联动；
 * - 拖出参考线手势起点：顶条 → 垂直参考线、左条 → 水平参考线（方向判定），
 *   场景坐标随 zoom/视口偏移换算，非左键不触发；落线（addGuide）归工单 03。
 *
 * jsdom 无 ResizeObserver/无布局：尺寸经 defineProperty 桩 clientWidth/
 * clientHeight 后手动触发 RO 回调（组件在回调里重读 clientWidth/Height）；
 * 指针手势经 MouseEvent 按类型派发（jsdom 无 PointerEvent/活跃指针表）。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import { EditorSession, type FrameScheduler } from '@hankchen/canvas-editor'

import Ruler from '../../src/canvas/Ruler.vue'
import { textLayer } from '../../../canvas-editor/tests/support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

// ---- jsdom 环境桩 ----

/** ResizeObserver 桩：登记构造回调，测试手动触发（真机由浏览器在尺寸变化时回调） */
let fireResize: (() => void) | null = null
class ResizeObserverStub {
    constructor(callback: ResizeObserverCallback) {
        fireResize = () => callback([] as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver)
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

function makeEditor(): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, layers: [textLayer({ priority: 10 })] })
    return editor
}

const mountRuler = (editor: EditorSession) =>
    mount(Ruler, { props: { editor }, attachTo: document.body })

/** 桩两条的可见长度（jsdom 无布局）并触发 RO 重测 */
function setBarSize(wrapper: ReturnType<typeof mountRuler>, width: number, height: number): void {
    const top = wrapper.find('[data-ruler-top]').element as HTMLElement
    const left = wrapper.find('[data-ruler-left]').element as HTMLElement
    Object.defineProperty(top, 'clientWidth', { configurable: true, value: width })
    Object.defineProperty(left, 'clientHeight', { configurable: true, value: height })
    fireResize?.()
}

/** 按指针事件类型派发（jsdom 无 PointerEvent：MouseEvent 按类型直发） */
function dispatchPointer(el: Element, type: string, init: MouseEventInit = {}): void {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }))
}

afterEach(() => {
    fireResize = null
})

describe('Ruler：双条存在性（常显）', () => {
    it('缺省渲染：根 + 顶/左两条 + 角块，data-ruler-* 钩子齐备', () => {
        const editor = makeEditor()
        const wrapper = mountRuler(editor)
        expect(wrapper.find('[data-ruler]').exists()).toBe(true)
        expect(wrapper.find('[data-ruler]').isVisible()).toBe(true)
        expect(wrapper.find('[data-ruler-top]').exists()).toBe(true)
        expect(wrapper.find('[data-ruler-left]').exists()).toBe(true)
        expect(wrapper.find('[data-ruler-corner]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('两条 title + aria-label 齐备（水平/垂直语义可辨）', () => {
        const editor = makeEditor()
        const wrapper = mountRuler(editor)
        const top = wrapper.find('[data-ruler-top]')
        const left = wrapper.find('[data-ruler-left]')
        expect(top.attributes('title')).toBeTruthy()
        expect(top.attributes('aria-label')).toBeTruthy()
        expect(left.attributes('title')).toBeTruthy()
        expect(left.attributes('aria-label')).toBeTruthy()
        expect(top.attributes('aria-label')).not.toBe(left.attributes('aria-label'))
        wrapper.unmount()
    })
})

describe('Ruler：⇧R 开关联动（读内核）', () => {
    it('executeShortcut(toggleRulers) 后隐藏，再切回显示', async () => {
        const editor = makeEditor()
        const wrapper = mountRuler(editor)
        expect(wrapper.find('[data-ruler]').isVisible()).toBe(true)

        // 宿主 useShortcuts 的分派面：⇧R → executeShortcut → 内核 ui 分支通知
        editor.executeShortcut('toggleRulers')
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-ruler]').isVisible()).toBe(false)

        editor.executeShortcut('toggleRulers')
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-ruler]').isVisible()).toBe(true)
        wrapper.unmount()
    })
})

describe('Ruler：刻度随缩放自适应', () => {
    it('zoom 1、宽 500：0 点在条左缘，主刻度 50 一档带读数，副刻度更密', async () => {
        const editor = makeEditor()
        const wrapper = mountRuler(editor)
        setBarSize(wrapper, 500, 400)
        await wrapper.vm.$nextTick()

        const labels = wrapper.findAll('[data-ruler-top] .cn-ruler__label')
        expect(labels.map((l) => l.text())).toEqual(
            ['0', '50', '100', '150', '200', '250', '300', '350', '400', '450', '500'],
        )
        // 0 点=画布左上：视口原点（场景 0）落在条左缘（left 0px）；位置在刻度元
        // 素上，读数是其子 span
        const zeroTick = wrapper
            .findAll('[data-ruler-top] .cn-ruler__tick')
            .find((t) => t.text() === '0')
        expect(zeroTick?.attributes('style')).toContain('left: 0px')
        // 副刻度比主刻度密（一档主刻度间有多枚副刻度）
        const ticks = wrapper.findAll('[data-ruler-top] .cn-ruler__tick')
        expect(ticks.length).toBeGreaterThan(labels.length)
        wrapper.unmount()
    })

    it('放大（zoom 2）档距减半：副刻度 5px 场景一档、读数 25 一档', async () => {
        const editor = makeEditor()
        const wrapper = mountRuler(editor)
        setBarSize(wrapper, 500, 400)
        await wrapper.vm.$nextTick()
        editor.store.setViewport({ x: 0, y: 0, zoom: 2 })
        await wrapper.vm.$nextTick()

        const labels = wrapper.findAll('[data-ruler-top] .cn-ruler__label')
        // 可见场景范围 0..250，读数 0,25,…,250（密度随放大提高）
        expect(labels[0]!.text()).toBe('0')
        expect(labels.map((l) => l.text())).toContain('25')
        expect(labels.map((l) => l.text())).not.toContain('500')
        wrapper.unmount()
    })

    it('缩小（zoom 0.1）档距放大：读数 500 一档，稀疏化', async () => {
        const editor = makeEditor()
        const wrapper = mountRuler(editor)
        setBarSize(wrapper, 500, 400)
        await wrapper.vm.$nextTick()
        editor.store.setViewport({ x: 0, y: 0, zoom: 0.1 })
        await wrapper.vm.$nextTick()

        const labels = wrapper.findAll('[data-ruler-top] .cn-ruler__label')
        expect(labels[0]!.text()).toBe('0')
        expect(labels.map((l) => l.text())).toContain('500')
        expect(labels.map((l) => l.text())).toContain('5000')
        expect(labels.map((l) => l.text())).not.toContain('50')
        wrapper.unmount()
    })

    it('0 点随视口偏移联动：viewport.x=100 后场景 100 落在条左缘', async () => {
        const editor = makeEditor()
        const wrapper = mountRuler(editor)
        setBarSize(wrapper, 500, 400)
        await wrapper.vm.$nextTick()
        editor.store.setViewport({ x: 100, y: 0, zoom: 1 })
        await wrapper.vm.$nextTick()

        const labels = wrapper.findAll('[data-ruler-top] .cn-ruler__label')
        expect(labels[0]!.text()).toBe('100')
        const firstTick = wrapper
            .findAll('[data-ruler-top] .cn-ruler__tick')
            .find((t) => t.text() === '100')
        expect(firstTick?.attributes('style')).toContain('left: 0px')
        expect(labels.map((l) => l.text())).not.toContain('0')
        wrapper.unmount()
    })

    it('左条同理读 y 轴：viewport.y=50 后场景 50 在条顶缘', async () => {
        const editor = makeEditor()
        const wrapper = mountRuler(editor)
        setBarSize(wrapper, 500, 400)
        await wrapper.vm.$nextTick()
        editor.store.setViewport({ x: 0, y: 50, zoom: 1 })
        await wrapper.vm.$nextTick()

        const labels = wrapper.findAll('[data-ruler-left] .cn-ruler__label')
        expect(labels[0]!.text()).toBe('50')
        const firstTick = wrapper
            .findAll('[data-ruler-left] .cn-ruler__tick')
            .find((t) => t.text() === '50')
        expect(firstTick?.attributes('style')).toContain('top: 0px')
        wrapper.unmount()
    })
})

describe('Ruler：拖出参考线手势起点', () => {
    it('顶条按下/移动/抬起：垂直方向手势，位置=场景 x', async () => {
        const editor = makeEditor()
        const wrapper = mountRuler(editor)
        const bar = wrapper.find('[data-ruler-top]')

        dispatchPointer(bar.element, 'pointerdown', { clientX: 123, clientY: 5, button: 0 })
        dispatchPointer(bar.element, 'pointermove', { clientX: 150, clientY: 8, button: 0 })
        dispatchPointer(bar.element, 'pointerup', { clientX: 150, clientY: 8, button: 0 })

        expect(wrapper.emitted('guide-drag-start')).toEqual([[{ orientation: 'vertical', position: 123 }]])
        expect(wrapper.emitted('guide-drag-move')).toEqual([[{ orientation: 'vertical', position: 150 }]])
        expect(wrapper.emitted('guide-drag-end')).toEqual([[{ orientation: 'vertical', position: 150 }]])
        wrapper.unmount()
    })

    it('左条：水平方向手势，位置=场景 y', () => {
        const editor = makeEditor()
        const wrapper = mountRuler(editor)
        const bar = wrapper.find('[data-ruler-left]')

        dispatchPointer(bar.element, 'pointerdown', { clientX: 5, clientY: 77, button: 0 })
        dispatchPointer(bar.element, 'pointerup', { clientX: 5, clientY: 77, button: 0 })

        expect(wrapper.emitted('guide-drag-start')).toEqual([[{ orientation: 'horizontal', position: 77 }]])
        expect(wrapper.emitted('guide-drag-end')).toEqual([[{ orientation: 'horizontal', position: 77 }]])
        wrapper.unmount()
    })

    it('位置按 zoom/视口偏移换算场景坐标（zoom 2、x=100：屏 23 → 场景 111.5）', async () => {
        const editor = makeEditor()
        const wrapper = mountRuler(editor)
        editor.store.setViewport({ x: 100, y: 0, zoom: 2 })
        await wrapper.vm.$nextTick()

        dispatchPointer(wrapper.find('[data-ruler-top]').element, 'pointerdown', {
            clientX: 23,
            clientY: 0,
            button: 0,
        })
        expect(wrapper.emitted('guide-drag-start')).toEqual([[{ orientation: 'vertical', position: 111.5 }]])
        wrapper.unmount()
    })

    it('pointercancel 单发 guide-drag-cancel（不与抬手落线混淆，供工单 03 丢弃中断手势）', () => {
        const editor = makeEditor()
        const wrapper = mountRuler(editor)
        const bar = wrapper.find('[data-ruler-top]')

        dispatchPointer(bar.element, 'pointerdown', { clientX: 30, clientY: 5, button: 0 })
        dispatchPointer(bar.element, 'pointercancel', { clientX: 40, clientY: 6 })

        expect(wrapper.emitted('guide-drag-cancel')).toEqual([
            [{ orientation: 'vertical', position: 40 }],
        ])
        expect(wrapper.emitted('guide-drag-end')).toBeUndefined()
        // 取消后手势已收束：后续移动不再发事件
        dispatchPointer(bar.element, 'pointermove', { clientX: 50, clientY: 6 })
        expect(wrapper.emitted('guide-drag-move')).toBeUndefined()
        wrapper.unmount()
    })

    it('非左键按下不触发手势', () => {
        const editor = makeEditor()
        const wrapper = mountRuler(editor)
        dispatchPointer(wrapper.find('[data-ruler-top]').element, 'pointerdown', {
            clientX: 10,
            clientY: 0,
            button: 2,
        })
        dispatchPointer(wrapper.find('[data-ruler-top]').element, 'pointermove', { clientX: 20, clientY: 0 })
        dispatchPointer(wrapper.find('[data-ruler-top]').element, 'pointerup', { clientX: 20, clientY: 0 })
        expect(wrapper.emitted('guide-drag-start')).toBeUndefined()
        expect(wrapper.emitted('guide-drag-move')).toBeUndefined()
        expect(wrapper.emitted('guide-drag-end')).toBeUndefined()
        wrapper.unmount()
    })
})
