// @vitest-environment jsdom
/**
 * GuidesOverlay 组件集成测试（ruler-guides-snap 工单 03）：
 * - 参考线呈现：读内核 listGuides 画横跨可视窗口的满幅细线（自标尺条底下起线），
 *   data-guide-* 钩子（id/取向/位置）与几何（轴向位置=场景→屏幕换算，线体沿轴
 *   向满幅 top/left 0 + 100%，不随视口平移伸缩）随 ui.viewport 联动；
 *   removeGuide/换文档随内核消线；
 * - 拖出预览与落线：宿主把 Ruler 的 guide-drag-* 四事件转发到 defineExpose 的
 *   同名四方法——预览线随 begin/move 呈现、自身吸附（复用内核吸附数学）、end 落
 *   线（addGuide）、cancel 丢弃中断手势、落点恰在既有同向参考线轴上不重复落线；
 * - 拖动再定位与拖回删除：参考线命中条上按下抓取、线随指针吸附跟随（复用拖出
 *   落线同一吸附数学、排除自身轴防原位粘滞）、落点在标尺条上（elementFromPoint
 *   命中 data-ruler-*）调 removeGuide、落点恰在既有同向参考线轴上合并删除（防
 *   同轴双线同门）、其余落点 updateGuide 再定位、原位松手同位空转、
 *   pointercancel 保留；
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

import { EditorSession, type FrameScheduler } from '@hankchen/canvas-editor'

import GuidesOverlay from '../../src/canvas/GuidesOverlay.vue'
import type { RulerGuideGesture } from '../../src/canvas/Ruler.vue'
import { textLayer } from '../../../canvas-editor/tests/support/fixtures'

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

    it('addGuide 后呈现贯穿细线：id/取向/位置钩子齐备，线体满幅贯穿挂载点', async () => {
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
        // 满幅：自挂载点顶/左缘（标尺条底下）起，铺满可视窗口，不再按 doc 边界体裁
        expect(vertical.attributes('style')).toContain('top: 0px')
        expect(vertical.attributes('style')).toContain('height: 100%')

        const horizontal = wrapper.find('[data-guide-line="2"]')
        expect(horizontal.attributes('data-guide-orientation')).toBe('horizontal')
        expect(horizontal.attributes('data-guide-position')).toBe('300')
        expect(horizontal.attributes('style')).toContain('top: 300px')
        expect(horizontal.attributes('style')).toContain('left: 0px')
        expect(horizontal.attributes('style')).toContain('width: 100%')
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
        // 线体满幅自挂载点顶缘起：视口平移只动轴向定位，线体不随视口越出/伸缩
        expect(wrapper.find('[data-guide-line="1"]').attributes('style')).toContain('top: 0px')
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

describe('GuidesOverlay：拖动再定位与拖回删除', () => {
    it('抓取拖动线随指针吸附跟随（再定位语义），落点在标尺条上删除（removeGuide）', async () => {
        const editor = makeEditor()
        const wrapper = mountOverlay(editor)
        editor.addGuide({ orientation: 'vertical', position: 205 })
        await wrapper.vm.$nextTick()
        const line = wrapper.find('[data-guide-line="1"]')

        stubElementFromPoint(ensureRulerBar())
        dispatchPointer(line.element, 'pointerdown', { clientX: 205, clientY: 10, button: 0 })
        // 203 在层盒缘 200 的吸附阈内：跟随呈吸附位（与拖出落线同一吸附数学）
        dispatchPointer(line.element, 'pointermove', { clientX: 203, clientY: 12 })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-line="1"]').attributes('data-guide-position')).toBe('200')
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

    it('落在别处（非标尺）再定位：updateGuide 落位、内核列表同步、不删除', async () => {
        const editor = makeEditor()
        const wrapper = mountOverlay(editor)
        editor.addGuide({ orientation: 'vertical', position: 205 })
        await wrapper.vm.$nextTick()
        const line = wrapper.find('[data-guide-line="1"]')

        stubElementFromPoint(null)
        dispatchPointer(line.element, 'pointerdown', { clientX: 205, clientY: 10, button: 0 })
        // 230 出全部吸附阈（层缘 200 距 30、中轴 400 距 170）：呈原针位
        dispatchPointer(line.element, 'pointermove', { clientX: 230, clientY: 12 })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-line="1"]').attributes('data-guide-dragging')).toBeDefined()
        expect(wrapper.find('[data-guide-line="1"]').attributes('data-guide-position')).toBe('230')
        expect(wrapper.find('[data-guide-line="1"]').classes()).not.toContain(
            'cn-guides__guide--will-delete',
        )

        dispatchPointer(wrapper.find('[data-guide-line="1"]').element, 'pointerup', {
            clientX: 230,
            clientY: 12,
        })
        await wrapper.vm.$nextTick()
        expect(editor.listGuides()).toEqual([{ id: 1, orientation: 'vertical', position: 230 }])
        expect(wrapper.find('[data-guide-line="1"]').attributes('data-guide-position')).toBe('230')
        expect(wrapper.find('[data-guide-line="1"]').attributes('data-guide-dragging')).toBeUndefined()
        wrapper.unmount()
    })

    it('自身轴不供吸附（拖离原位不被拉回）：微移 208 停在 208', async () => {
        const editor = makeEditor()
        editor.addGuide({ orientation: 'vertical', position: 205 })
        const wrapper = mountOverlay(editor)
        await wrapper.vm.$nextTick()
        const line = wrapper.find('[data-guide-line="1"]')

        stubElementFromPoint(null)
        dispatchPointer(line.element, 'pointerdown', { clientX: 205, clientY: 10, button: 0 })
        // 208 距层缘 200 已出阈（8 > 6）：若无自身轴排除会被原位 205 粘回
        dispatchPointer(wrapper.find('[data-guide-line="1"]').element, 'pointermove', {
            clientX: 208,
            clientY: 12,
        })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-line="1"]').attributes('data-guide-position')).toBe('208')

        dispatchPointer(wrapper.find('[data-guide-line="1"]').element, 'pointerup', {
            clientX: 208,
            clientY: 12,
        })
        await wrapper.vm.$nextTick()
        expect(editor.listGuides()).toEqual([{ id: 1, orientation: 'vertical', position: 208 }])
        wrapper.unmount()
    })

    it('拖到既有同向参考线轴上松手合并（防同轴双线同门）：被拖线删除、留既有线', async () => {
        const editor = makeEditor()
        editor.addGuide({ orientation: 'horizontal', position: 310 })
        editor.addGuide({ orientation: 'horizontal', position: 420 })
        const wrapper = mountOverlay(editor)
        await wrapper.vm.$nextTick()
        const line = wrapper.find('[data-guide-line="1"]')

        stubElementFromPoint(null)
        dispatchPointer(line.element, 'pointerdown', { clientX: 300, clientY: 310, button: 0 })
        // 423 在既有线 420 吸附阈内（水平向：画布中轴 300 距 123 已出阈）
        dispatchPointer(wrapper.find('[data-guide-line="1"]').element, 'pointermove', {
            clientX: 302,
            clientY: 423,
        })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-guide-line="1"]').attributes('data-guide-position')).toBe('420')

        dispatchPointer(wrapper.find('[data-guide-line="1"]').element, 'pointerup', {
            clientX: 302,
            clientY: 423,
        })
        await wrapper.vm.$nextTick()
        expect(editor.listGuides()).toEqual([{ id: 2, orientation: 'horizontal', position: 420 }])
        expect(wrapper.find('[data-guide-line="1"]').exists()).toBe(false)
        expect(wrapper.find('[data-guide-line="2"]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('原位松手（点击不拖）同位空转：位置不动、不产生内核通知', async () => {
        const editor = makeEditor()
        editor.addGuide({ orientation: 'vertical', position: 205 })
        const wrapper = mountOverlay(editor)
        await wrapper.vm.$nextTick()
        const line = wrapper.find('[data-guide-line="1"]')

        stubElementFromPoint(null)
        const changes: unknown[] = []
        editor.subscribe((change) => changes.push(change))
        // 205 距层缘 200 在吸附阈内：未拖动不得触发吸附再定位（落位取抓取途中
        // 最后吸附位，未动即内核位，松手不重复求位）
        dispatchPointer(line.element, 'pointerdown', { clientX: 205, clientY: 10, button: 0 })
        dispatchPointer(wrapper.find('[data-guide-line="1"]').element, 'pointerup', {
            clientX: 205,
            clientY: 10,
        })
        await wrapper.vm.$nextTick()
        expect(changes).toEqual([])
        expect(editor.listGuides()).toEqual([{ id: 1, orientation: 'vertical', position: 205 }])
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
