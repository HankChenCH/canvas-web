// @vitest-environment jsdom
/**
 * GuidesOverlay 组件集成测试（ruler-guides-snap 工单 03）：
 * - 参考线呈现：读内核 listGuides 画贯穿画布细线，data-guide-* 钩子（id/取向/
 *   位置）与几何（位置=场景→屏幕换算，线体贯穿 doc 边界）随 ui.viewport 联动；
 *   removeGuide/换文档随内核消线；
 * - 拖出预览与落线：宿主把 Ruler 的 guide-drag-* 四事件转发到 defineExpose 的
 *   同名四方法——预览线随 begin/move 呈现、自身吸附（复用内核吸附数学）、end 落
 *   线（addGuide）、cancel 丢弃中断手势、落点恰在既有同向参考线轴上不重复落线；
 * - 拖回删除：参考线命中条上按下抓取、线随指针原语跟随（不吸附——删除手势不是
 *   再定位）、落点在标尺条上（elementFromPoint 命中 data-ruler-*）调 removeGuide、
 *   落在别处原线复原、pointercancel 保留；
 * - 吸附线呈现：读内核命中轴查询（ui.snapAxes 分支）——拖动会话命中时呈现
 *   data-snap-* 瞬时线（带取向/位置/来源），endDrag 清空即消失；与参考线类名互异
 *   （瞬时回显不驻留，视觉可区分）。
 *
 * jsdom 无布局/无 PointerEvent：几何全由场景→屏幕换算给出（挂载契约根铺满挂载
 * 点，getBoundingClientRect 为零矩形即场景=client 坐标）；指针手势经 MouseEvent
 * 按类型派发；标尺落点判定面经 document.elementFromPoint 桩。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'

import { EditorSession, type FrameScheduler } from '@hankchen/canvas-next-editor'

import GuidesOverlay from '../../src/canvas/GuidesOverlay.vue'
import type { RulerGuideGesture } from '../../src/canvas/Ruler.vue'
import { textLayer } from '../../../canvas-next-editor/tests/support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

function makeEditor(): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({
        width: 800,
        height: 600,
        layers: [textLayer({ position: { x: 200, y: 100 } }), textLayer({ position: { x: 500, y: 300 } })],
    })
    return editor
}

const mountOverlay = (editor: EditorSession): VueWrapper =>
    mount(GuidesOverlay, { props: { editor }, attachTo: document.body })

/** defineExpose 的手势方法面（宿主转发 Ruler 四事件的对接缝） */
interface OverlayExposed {
    beginGuideDrag(gesture: RulerGuideGesture): void
    moveGuideDrag(gesture: RulerGuideGesture): void
    endGuideDrag(gesture: RulerGuideGesture): void
    cancelGuideDrag(): void
}

const exposed = (wrapper: VueWrapper): OverlayExposed => wrapper.vm as unknown as OverlayExposed

/** 按指针事件类型派发（jsdom 无 PointerEvent：MouseEvent 按类型直发） */
function dispatchPointer(el: Element, type: string, init: MouseEventInit = {}): void {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }))
}

// ---- 标尺落点判定面桩：elementFromPoint 返回 data-ruler-* 元素 ----

type FromPoint = (x: number, y: number) => Element | null
const originalFromPoint = (document as { elementFromPoint?: FromPoint }).elementFromPoint
let rulerBar: HTMLDivElement | null = null

function ensureRulerBar(): HTMLDivElement {
    if (rulerBar === null) {
        rulerBar = document.createElement('div')
        rulerBar.setAttribute('data-ruler-top', '')
        document.body.appendChild(rulerBar)
    }
    return rulerBar
}

function stubElementFromPoint(el: Element | null): void {
    ;(document as { elementFromPoint: FromPoint }).elementFromPoint = () => el
}

afterEach(() => {
    ;(document as { elementFromPoint?: FromPoint }).elementFromPoint = originalFromPoint
    rulerBar?.remove()
    rulerBar = null
})

describe('GuidesOverlay：参考线呈现（读 listGuides）', () => {
    it('空会话渲染根钩子，无参考线/吸附线/预览', () => {
        const editor = makeEditor()
        const wrapper = mountOverlay(editor)
        expect(wrapper.find('[data-guide-overlay]').exists()).toBe(true)
        expect(wrapper.find('[data-guide-line]').exists()).toBe(false)
        expect(wrapper.find('[data-snap-line]').exists()).toBe(false)
        expect(wrapper.find('[data-guide-preview]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('addGuide 后呈现贯穿细线：id/取向/位置钩子齐备，线体贯穿 doc 边界', async () => {
        const editor = makeEditor()
        const wrapper = mountOverlay(editor)
        editor.addGuide({ orientation: 'vertical', position: 205 })
        editor.addGuide({ orientation: 'horizontal', position: 300 })
        await wrapper.vm.$nextTick()

        const vertical = wrapper.find('[data-guide-line="1"]')
        expect(vertical.exists()).toBe(true)
        expect(vertical.attributes('data-guide-orientation')).toBe('vertical')
        expect(vertical.attributes('data-guide-position')).toBe('205')
        expect(vertical.attributes('style')).toContain('left: 205px')
        expect(vertical.attributes('style')).toContain('top: 0px')
        expect(vertical.attributes('style')).toContain('height: 600px')

        const horizontal = wrapper.find('[data-guide-line="2"]')
        expect(horizontal.attributes('data-guide-orientation')).toBe('horizontal')
        expect(horizontal.attributes('data-guide-position')).toBe('300')
        expect(horizontal.attributes('style')).toContain('top: 300px')
        expect(horizontal.attributes('style')).toContain('left: 0px')
        expect(horizontal.attributes('style')).toContain('width: 800px')
        wrapper.unmount()
    })

    it('位置随视口联动（平移/缩放同内容层换算）', async () => {
        const editor = makeEditor()
        const wrapper = mountOverlay(editor)
        editor.addGuide({ orientation: 'vertical', position: 205 })
        editor.addGuide({ orientation: 'horizontal', position: 300 })
        await wrapper.vm.$nextTick()

        editor.store.setViewport({ x: 100, y: 50, zoom: 1 })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-line="1"]').attributes('style')).toContain('left: 105px')
        // 线体起点=场景 0：视口下移后顶缘越出挂载点（贯穿画布按 doc 边界计）
        expect(wrapper.find('[data-guide-line="1"]').attributes('style')).toContain('top: -50px')
        expect(wrapper.find('[data-guide-line="2"]').attributes('style')).toContain('top: 250px')

        editor.store.setViewport({ x: 100, y: 50, zoom: 2 })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-line="1"]').attributes('style')).toContain('left: 210px')
        wrapper.unmount()
    })

    it('removeGuide 后消线；换文档（openDocument）清空全部参考线', async () => {
        const editor = makeEditor()
        const wrapper = mountOverlay(editor)
        editor.addGuide({ orientation: 'vertical', position: 205 })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-line="1"]').exists()).toBe(true)

        editor.removeGuide(1)
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-line]').exists()).toBe(false)

        editor.addGuide({ orientation: 'vertical', position: 300 })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-line]').exists()).toBe(true)
        editor.openDocument({ width: 400, height: 300, layers: [textLayer()] })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-line]').exists()).toBe(false)
        wrapper.unmount()
    })
})

describe('GuidesOverlay：拖出预览与落线（宿主转发 Ruler 四事件）', () => {
    it('begin/move 呈现预览线，end 落线（addGuide）且预览消退', async () => {
        const editor = makeEditor()
        const wrapper = mountOverlay(editor)
        exposed(wrapper).beginGuideDrag({ orientation: 'vertical', position: 123 })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-preview]').exists()).toBe(true)
        expect(wrapper.find('[data-guide-preview]').attributes('data-guide-orientation')).toBe('vertical')
        expect(wrapper.find('[data-guide-preview]').attributes('data-guide-position')).toBe('123')

        exposed(wrapper).moveGuideDrag({ orientation: 'vertical', position: 130 })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-preview]').attributes('data-guide-position')).toBe('130')

        exposed(wrapper).endGuideDrag({ orientation: 'vertical', position: 130 })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-preview]').exists()).toBe(false)
        expect(editor.listGuides()).toEqual([{ id: 1, orientation: 'vertical', position: 130 }])
        wrapper.unmount()
    })

    it('拖出预览自身吸附：近层盒缘预览即吸（203 → 200），落线落吸附位', async () => {
        const editor = makeEditor()
        const wrapper = mountOverlay(editor)
        exposed(wrapper).beginGuideDrag({ orientation: 'vertical', position: 203 })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-preview]').attributes('data-guide-position')).toBe('200')

        exposed(wrapper).endGuideDrag({ orientation: 'vertical', position: 203 })
        expect(editor.listGuides()).toEqual([{ id: 1, orientation: 'vertical', position: 200 }])
        wrapper.unmount()
    })

    it('guide-drag-cancel（系统中断）丢弃手势：不落线、预览消退', async () => {
        const editor = makeEditor()
        const wrapper = mountOverlay(editor)
        exposed(wrapper).beginGuideDrag({ orientation: 'horizontal', position: 77 })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-preview]').exists()).toBe(true)

        exposed(wrapper).cancelGuideDrag()
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-preview]').exists()).toBe(false)
        expect(editor.listGuides()).toEqual([])
        wrapper.unmount()
    })

    it('落点恰在既有同向参考线轴上不重复落线（吸附贴合防双线）', () => {
        const editor = makeEditor()
        editor.addGuide({ orientation: 'vertical', position: 205 })
        const wrapper = mountOverlay(editor)
        exposed(wrapper).beginGuideDrag({ orientation: 'vertical', position: 205 })
        exposed(wrapper).endGuideDrag({ orientation: 'vertical', position: 205 })
        expect(editor.listGuides().length).toBe(1)
        wrapper.unmount()
    })

    it('孤立 end（未 begin）空转：不落线', () => {
        const editor = makeEditor()
        const wrapper = mountOverlay(editor)
        exposed(wrapper).endGuideDrag({ orientation: 'vertical', position: 205 })
        expect(editor.listGuides()).toEqual([])
        wrapper.unmount()
    })
})

describe('GuidesOverlay：拖回标尺删除', () => {
    it('抓取后线随指针原语跟随（不吸附），落点在标尺条上删除（removeGuide）', async () => {
        const editor = makeEditor()
        const wrapper = mountOverlay(editor)
        editor.addGuide({ orientation: 'vertical', position: 205 })
        await wrapper.vm.$nextTick()
        const line = wrapper.find('[data-guide-line="1"]')

        stubElementFromPoint(ensureRulerBar())
        dispatchPointer(line.element, 'pointerdown', { clientX: 205, clientY: 10, button: 0 })
        // 203 在层盒缘 200 的吸附阈内：跟随仍取原始指针位——删除手势不是再定位
        dispatchPointer(line.element, 'pointermove', { clientX: 203, clientY: 12 })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-line="1"]').attributes('data-guide-position')).toBe('203')
        expect(wrapper.find('[data-guide-line="1"]').attributes('data-guide-dragging')).toBeDefined()
        expect(wrapper.find('[data-guide-line="1"]').classes()).toContain('cn-guides__guide--will-delete')

        dispatchPointer(wrapper.find('[data-guide-line="1"]').element, 'pointerup', {
            clientX: 203,
            clientY: 12,
        })
        await wrapper.vm.$nextTick()
        expect(editor.listGuides()).toEqual([])
        expect(wrapper.find('[data-guide-line]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('落在别处（非标尺）原线复原：不删除、位置回原值', async () => {
        const editor = makeEditor()
        const wrapper = mountOverlay(editor)
        editor.addGuide({ orientation: 'vertical', position: 205 })
        await wrapper.vm.$nextTick()
        const line = wrapper.find('[data-guide-line="1"]')

        stubElementFromPoint(null)
        dispatchPointer(line.element, 'pointerdown', { clientX: 205, clientY: 10, button: 0 })
        dispatchPointer(line.element, 'pointermove', { clientX: 230, clientY: 12 })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-line="1"]').attributes('data-guide-dragging')).toBeDefined()
        expect(wrapper.find('[data-guide-line="1"]').classes()).not.toContain(
            'cn-guides__guide--will-delete',
        )

        dispatchPointer(wrapper.find('[data-guide-line="1"]').element, 'pointerup', {
            clientX: 230,
            clientY: 12,
        })
        await wrapper.vm.$nextTick()
        expect(editor.listGuides()).toEqual([{ id: 1, orientation: 'vertical', position: 205 }])
        expect(wrapper.find('[data-guide-line="1"]').attributes('data-guide-position')).toBe('205')
        expect(wrapper.find('[data-guide-line="1"]').attributes('data-guide-dragging')).toBeUndefined()
        wrapper.unmount()
    })

    it('pointercancel（系统接管指针）保留参考线', async () => {
        const editor = makeEditor()
        const wrapper = mountOverlay(editor)
        editor.addGuide({ orientation: 'vertical', position: 205 })
        await wrapper.vm.$nextTick()
        const line = wrapper.find('[data-guide-line="1"]')

        stubElementFromPoint(ensureRulerBar())
        dispatchPointer(line.element, 'pointerdown', { clientX: 205, clientY: 10, button: 0 })
        dispatchPointer(wrapper.find('[data-guide-line="1"]').element, 'pointercancel', {
            clientX: 300,
            clientY: 12,
        })
        await wrapper.vm.$nextTick()
        expect(editor.listGuides()).toEqual([{ id: 1, orientation: 'vertical', position: 205 }])
        expect(wrapper.find('[data-guide-line="1"]').attributes('data-guide-dragging')).toBeUndefined()
        wrapper.unmount()
    })

    it('非左键按下不抓取', async () => {
        const editor = makeEditor()
        const wrapper = mountOverlay(editor)
        editor.addGuide({ orientation: 'vertical', position: 205 })
        await wrapper.vm.$nextTick()
        const line = wrapper.find('[data-guide-line="1"]')

        dispatchPointer(line.element, 'pointerdown', { clientX: 205, clientY: 10, button: 2 })
        dispatchPointer(wrapper.find('[data-guide-line="1"]').element, 'pointermove', {
            clientX: 220,
            clientY: 12,
        })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-line="1"]').attributes('data-guide-dragging')).toBeUndefined()
        expect(editor.listGuides()).toEqual([{ id: 1, orientation: 'vertical', position: 205 }])
        wrapper.unmount()
    })
})

describe('GuidesOverlay：拖动吸附线（瞬时回显）', () => {
    it('拖动会话命中轴呈现吸附线（取向/位置/来源钩子），吸附修正落位置事务', async () => {
        const editor = makeEditor()
        const wrapper = mountOverlay(editor)

        editor.beginDrag(['layers', 1], 500, 300)
        editor.dragTo(206, 100)
        await wrapper.vm.$nextTick()

        // 内核吸附生效（工单 01）：拖动层盒吸到层 0 左缘/顶缘
        expect(editor.layerBoxAt(['layers', 1])!.x).toBe(200)
        const lines = wrapper.findAll('[data-snap-line]')
        expect(lines.map((l) => l.attributes('data-snap-orientation'))).toEqual(['vertical', 'horizontal'])
        expect(lines.map((l) => l.attributes('data-snap-position'))).toEqual(['200', '100'])
        expect(lines.map((l) => l.attributes('data-snap-source'))).toEqual(['layer', 'layer'])

        editor.endDrag()
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-snap-line]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('已对齐（delta 0）也回显命中轴', async () => {
        const editor = makeEditor()
        const wrapper = mountOverlay(editor)

        editor.beginDrag(['layers', 1], 500, 300)
        editor.dragTo(200, 100)
        await wrapper.vm.$nextTick()
        expect(wrapper.findAll('[data-snap-line]').length).toBe(2)
        editor.endDrag()
        wrapper.unmount()
    })

    it('吸附线与参考线视觉可区分：类名互异，瞬时回显不驻留', async () => {
        const editor = makeEditor()
        const wrapper = mountOverlay(editor)
        editor.addGuide({ orientation: 'vertical', position: 205 })
        editor.beginDrag(['layers', 1], 500, 300)
        editor.dragTo(206, 100)
        await wrapper.vm.$nextTick()

        const guide = wrapper.find('[data-guide-line="1"]')
        const snap = wrapper.find('[data-snap-line]')
        expect(guide.classes()).toContain('cn-guides__guide')
        expect(snap.classes()).toContain('cn-guides__snap')
        expect(guide.classes()).not.toEqual(snap.classes())
        editor.endDrag()
        await wrapper.vm.$nextTick()
        // 参考线驻留、吸附线随会话结束消失（瞬时回显语义）
        expect(wrapper.find('[data-guide-line="1"]').exists()).toBe(true)
        expect(wrapper.find('[data-snap-line]').exists()).toBe(false)
        wrapper.unmount()
    })
})
