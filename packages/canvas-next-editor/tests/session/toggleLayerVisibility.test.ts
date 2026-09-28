/**
 * 图层显示/隐藏（layer-panel-ux 工单 10）：内核 toggleLayerVisibility。
 *
 * - 切换取反（visible 翻转）：一次调用 = 一步历史 transact，可撤销可重做；
 * - 仅根图层——行/格/内容是容器内结构（显隐语义只在 LayerBase 面），非根/
 *   悬空路径一律空转（无历史步），与 renameLayer 同门；
 * - wire 字节面（工单 01 契约）：隐藏才写 visible:false 键，可见态键省略
 *   （缺省态字节面与现状一致）；
 * - 渲染/命中侧的效果（画布不绘制/不可点选）分别在 render 契约（工单 01）与
 *   hitTest/gizmo 用例锁定，这里只锁内核写入口。
 */
import { describe, expect, it, vi } from 'vitest'

import { encodeGraph } from '@hankchen/canvas-next'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import { cellLayer, rowLayer, tableLayer, textLayer } from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

const makeSession = (layers: Parameters<EditorSession['openDocument']>[0]['layers']) => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument({ width: 800, height: 600, layers })
    return session
}

describe('toggleLayerVisibility：一步历史与撤销', () => {
    it('切换取反：visible → false，一次调用 = 一步历史，undo 恢复、redo 复现', () => {
        const session = makeSession([textLayer({ priority: 10 })])

        session.toggleLayerVisibility(['layers', 0])
        expect(session.store.doc!.layers[0]!.visible).toBe(false)
        expect(session.store.history).toHaveLength(1)

        session.undo()
        expect(session.store.doc!.layers[0]!.visible).toBe(true)
        session.redo()
        expect(session.store.doc!.layers[0]!.visible).toBe(false)
    })

    it('再切回可见：连切两次另起两步（无 mergeKey 不合并），undo×2 回到可见', () => {
        const session = makeSession([textLayer({ priority: 10 })])

        session.toggleLayerVisibility(['layers', 0])
        session.toggleLayerVisibility(['layers', 0])
        expect(session.store.doc!.layers[0]!.visible).toBe(true)
        expect(session.store.history).toHaveLength(2)

        session.undo()
        session.undo()
        expect(session.store.doc!.layers[0]!.visible).toBe(true)
    })

    it('已隐藏层再切换 = 转回可见（同门语义不限定方向）', () => {
        const session = makeSession([textLayer({ priority: 10, visible: false })])

        session.toggleLayerVisibility(['layers', 0])
        expect(session.store.doc!.layers[0]!.visible).toBe(true)
        expect(session.store.history).toHaveLength(1)
    })

    it('文档未打开空转：无历史步、不抛错', () => {
        const session = new EditorSession({ scheduleFrame: nullScheduler })
        expect(() => session.toggleLayerVisibility(['layers', 0])).not.toThrow()
        expect(session.store.history).toHaveLength(0)
    })
})

describe('toggleLayerVisibility：仅根图层（其余路径空转）', () => {
    it('可解析的行/格/内容路径一律空转：文档不动、无历史步', () => {
        const session = makeSession([
            tableLayer([rowLayer([cellLayer(textLayer({ text: '甲' }))])], { priority: 20 }),
            textLayer({ priority: 10 }),
        ])
        const before = session.store.doc

        session.toggleLayerVisibility(['layers', 0, 'rows', 0])
        session.toggleLayerVisibility(['layers', 0, 'rows', 0, 'cells', 0])
        session.toggleLayerVisibility(['layers', 0, 'rows', 0, 'cells', 0, 'content'])

        expect(session.store.doc).toBe(before)
        expect(session.store.history).toHaveLength(0)
    })

    it('悬空/怪形态路径空转：越界下标与缺段路径不产生历史步', () => {
        const session = makeSession([textLayer({ priority: 10 })])
        const before = session.store.doc

        session.toggleLayerVisibility(['layers', 9])
        session.toggleLayerVisibility(['layers'])

        expect(session.store.doc).toBe(before)
        expect(session.store.history).toHaveLength(0)
    })
})

describe('toggleLayerVisibility：wire 字节面（工单 01 键省略契约）', () => {
    it('隐藏写 visible:false 键；恢复可见后键省略（encode 输出无 visible 键）', () => {
        const session = makeSession([textLayer({ priority: 10 })])
        const visibleWire = JSON.stringify(JSON.parse(JSON.stringify(encodeGraph(session.store.doc!))))
        expect(visibleWire).not.toContain('"visible"')

        session.toggleLayerVisibility(['layers', 0])
        const hiddenWire = JSON.parse(JSON.stringify(encodeGraph(session.store.doc!)))
        expect((hiddenWire.layers as { visible?: boolean }[])[0]!.visible).toBe(false)

        session.toggleLayerVisibility(['layers', 0])
        const restoredWire = JSON.stringify(JSON.parse(JSON.stringify(encodeGraph(session.store.doc!))))
        expect(restoredWire).not.toContain('"visible"')
    })

    it('切换不扰动其它字段：结构与 priority/name 原样（patch 只落 visible）', () => {
        const session = makeSession([textLayer({ priority: 10, name: '封面' })])
        const before = session.store.doc!.layers[0]!
        if (before.type !== 'TextLayer') return
        const beforeText = before.text
        const beforePriority = before.priority

        session.toggleLayerVisibility(['layers', 0])
        const layer = session.store.doc!.layers[0]!
        if (layer.type !== 'TextLayer') return
        expect(layer.name).toBe('封面')
        expect(layer.text).toBe(beforeText)
        expect(layer.priority).toBe(beforePriority)
    })

    it('切换通知 doc 变更（驱动画布重绘的订阅面）', () => {
        const session = makeSession([textLayer({ priority: 10 })])
        const listener = vi.fn()
        session.subscribe(listener)

        session.toggleLayerVisibility(['layers', 0])

        expect(listener).toHaveBeenCalledWith(
            expect.objectContaining({ scope: 'doc', patches: [expect.objectContaining({ path: ['layers', 0, 'visible'] })] }),
        )
    })
})
