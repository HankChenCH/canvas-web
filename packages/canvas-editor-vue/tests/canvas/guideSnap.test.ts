/**
 * snapGuideAxis 单元测试（ruler-guides-snap 工单 03）：
 * 标尺拖出参考线自身的吸附——复用内核同一吸附数学（snapAxesFromBoxes +
 * resolveSnap + 屏幕 6px 阈值按缩放换算）：源 = 可见根层盒缘与中心 + 画布
 * 中轴 + 已有参考线，对象 = 参考线自身位置点（零尺寸盒九点重合）。
 *
 * 纯内核编排无 DOM，Node 环境直跑；几何断言对 editor.layerBoxAt 取值，
 * 不硬编码布局内部。
 */
import { describe, expect, it } from 'vitest'

import { EditorSession, type FrameScheduler } from '@hankchen/canvas-editor'

import { snapGuideAxis } from '../../src/canvas/guideSnap'
import { textLayer } from '../../../canvas-editor/tests/support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

function makeEditor(): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({
        width: 800,
        height: 600,
        layers: [textLayer({ position: { x: 200, y: 100 } })],
    })
    return editor
}

describe('snapGuideAxis：层盒缘与中心供轴', () => {
    it('垂直参考线吸到根层盒左缘（203 → 200）', () => {
        const editor = makeEditor()
        const edge = editor.layerBoxAt(['layers', 0])!.x
        expect(snapGuideAxis(editor, 'vertical', edge + 3)).toBe(edge)
    })

    it('吸到右缘与中心（297 → 300、246 → 250）', () => {
        const editor = makeEditor()
        const box = editor.layerBoxAt(['layers', 0])!
        expect(snapGuideAxis(editor, 'vertical', box.x + box.width - 3)).toBe(box.x + box.width)
        expect(snapGuideAxis(editor, 'vertical', box.x + box.width / 2 - 4)).toBe(
            box.x + box.width / 2,
        )
    })

    it('超出阈值不吸（208 → 208）', () => {
        const editor = makeEditor()
        const edge = editor.layerBoxAt(['layers', 0])!.x
        expect(snapGuideAxis(editor, 'vertical', edge + 8)).toBe(edge + 8)
    })

    it('阈值边界：恰在 6px 屏幕换算值上命中，超出即不命中（zoom 1）', () => {
        const editor = makeEditor()
        const edge = editor.layerBoxAt(['layers', 0])!.x
        expect(snapGuideAxis(editor, 'vertical', edge + 6)).toBe(edge)
        expect(snapGuideAxis(editor, 'vertical', edge + 6.5)).toBe(edge + 6.5)
    })

    it('放大收紧场景阈值（zoom 2 → 3px）：2.5 命中、4 不命中', () => {
        const editor = makeEditor()
        editor.store.setViewport({ x: 0, y: 0, zoom: 2 })
        const edge = editor.layerBoxAt(['layers', 0])!.x
        expect(snapGuideAxis(editor, 'vertical', edge + 2.5)).toBe(edge)
        expect(snapGuideAxis(editor, 'vertical', edge + 4)).toBe(edge + 4)
    })

    it('水平参考线同理吸 y 轴（97 → 盒顶 100）', () => {
        const editor = makeEditor()
        const edge = editor.layerBoxAt(['layers', 0])!.y
        expect(snapGuideAxis(editor, 'horizontal', edge - 3)).toBe(edge)
    })
})

describe('snapGuideAxis：画布中轴与参考线供轴', () => {
    it('吸到画布垂直中轴（797 → 400）', () => {
        const editor = makeEditor()
        expect(snapGuideAxis(editor, 'vertical', 800 / 2 - 3)).toBe(400)
    })

    it('已有参考线供轴（新线吸到旧线轴上，208 → 205）', () => {
        const editor = makeEditor()
        expect(editor.addGuide({ orientation: 'vertical', position: 205 })).not.toBeNull()
        expect(snapGuideAxis(editor, 'vertical', 208)).toBe(205)
    })
})

describe('snapGuideAxis：排除与回退', () => {
    it('隐藏根层不供轴（visible=false 后 203 不再吸 200）', () => {
        const editor = makeEditor()
        editor.store.transact((draft) => {
            draft.layers[0]!.visible = false
        })
        const edge = editor.layerBoxAt(['layers', 0])!.x
        expect(snapGuideAxis(editor, 'vertical', edge + 3)).toBe(edge + 3)
    })

    it('无文档回退原位', () => {
        const editor = new EditorSession({ scheduleFrame: nullScheduler })
        expect(snapGuideAxis(editor, 'vertical', 123)).toBe(123)
    })
})
