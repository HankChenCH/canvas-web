/**
 * dragTo 拖动吸附集成（ruler-guides-snap 工单 01，ADR 0012）：
 * - 吸附修正落在拖动位置事务内（同一 mergeKey，一次拖动 = 一步历史）；
 * - 源轴：其他可见根层盒 L/C/R + T/M/B、画布水平/垂直中轴、参考线轴；
 *   隐藏层与拖动层自身不供轴；
 * - 屏幕 6px 阈值按当前缩放换算场景值；
 * - 「当次命中吸附轴」只读查询：拖动中有值、松手即清空（吸附线呈现消费）。
 */
import { describe, expect, it } from 'vitest'

import type { Canvas, Layer } from '@hankchen/canvas'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import { textLayer } from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

const docWith = (...layers: Layer[]): Canvas => ({ width: 800, height: 600, layers })

const makeSession = (layers: Layer[]): EditorSession => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument(docWith(...layers))
    return session
}

/** 两个 100×50 根层：index 0 是吸附源（盒 100,100 起）、index 1 是拖动层（盒 0,0 起） */
const makePairSession = (): { session: EditorSession; dragPath: ['layers', 1] } => {
    const session = makeSession([
        textLayer({ priority: 20, position: { anchor: 'top-left', x: 100, y: 100 } }),
        textLayer({ priority: 10, position: { anchor: 'top-left', x: 0, y: 0 } }),
    ])
    return { session, dragPath: ['layers', 1] }
}

describe('dragTo 吸附：修正落位置事务', () => {
    it('拖近源层左缘（阈值内）吸到同缘，命中轴查询回显 layer 源', () => {
        const { session, dragPath } = makePairSession()
        expect(session.beginDrag(dragPath, 0, 0)).toBe(true)
        // 场景位移 104 → 暂定盒左缘 104，距源层左缘 100 在阈值 6 内 → 修正 −4
        session.dragTo(104, 10)
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 100, y: 10 })
        expect(session.listSnapAxes()).toEqual([{ orientation: 'vertical', position: 100, source: 'layer' }])
    })

    it('拖近源层中心吸到中心（九点中左缘对中心轴）', () => {
        const { session, dragPath } = makePairSession()
        session.beginDrag(dragPath, 0, 0)
        // 暂定左缘 146 距源层中心轴 150 在阈值内 → 修正 +4，盒左缘落 150
        session.dragTo(146, 0)
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 150, y: 0 })
        expect(session.listSnapAxes()).toEqual([{ orientation: 'vertical', position: 150, source: 'layer' }])
    })

    it('阈值外不吸附：位置精确跟随指针、无命中轴', () => {
        const { session, dragPath } = makePairSession()
        session.beginDrag(dragPath, 0, 0)
        session.dragTo(120, 0)
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 120, y: 0 })
        expect(session.listSnapAxes()).toEqual([])
    })

    it('屏幕 6px 阈值按缩放换算：zoom=2 时场景阈值收紧到 3', () => {
        const { session, dragPath } = makePairSession()
        session.store.setViewport({ x: 0, y: 0, zoom: 2 })
        session.beginDrag(dragPath, 0, 0)
        session.dragTo(104, 0) // 场景距 4 > 3 → 不吸
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 104 })
        session.dragTo(102, 0) // 场景距 2 ≤ 3 → 吸
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 100 })
    })

    it('一次拖动至多吸一垂直轴 + 一水平轴：双轴同时修正', () => {
        const session = makeSession([
            textLayer({ priority: 10, position: { anchor: 'top-left', x: 0, y: 0 } }),
        ])
        session.addGuide({ orientation: 'vertical', position: 320 })
        session.addGuide({ orientation: 'horizontal', position: 230 })
        session.beginDrag(['layers', 0], 0, 0)
        // 距垂直参考线 3（右缘距中轴 400 为 23）、水平参考线 3 → 双轴命中
        session.dragTo(323, 227)
        expect(session.store.doc!.layers[0]!.position).toMatchObject({ x: 320, y: 230 })
        expect(session.listSnapAxes()).toEqual([
            { orientation: 'vertical', position: 320, source: 'guide' },
            { orientation: 'horizontal', position: 230, source: 'guide' },
        ])
    })

    it('吸附到画布水平/垂直中轴（source=canvas-center）', () => {
        const session = makeSession([
            textLayer({ priority: 10, position: { anchor: 'top-left', x: 0, y: 0 } }),
        ])
        session.beginDrag(['layers', 0], 0, 0)
        session.dragTo(397, 0) // 盒左缘距垂直中轴 400 为 3
        expect(session.store.doc!.layers[0]!.position).toMatchObject({ x: 400 })
        expect(session.listSnapAxes()).toEqual([
            { orientation: 'vertical', position: 400, source: 'canvas-center' },
        ])
        session.endDrag()

        session.beginDrag(['layers', 0], 0, 0)
        session.dragTo(0, 297) // 盒上缘距水平中轴 300 为 3；左缘恰对垂直中轴（delta 0 回显）
        expect(session.store.doc!.layers[0]!.position).toMatchObject({ x: 400, y: 300 })
        expect(session.listSnapAxes()).toEqual([
            { orientation: 'vertical', position: 400, source: 'canvas-center' },
            { orientation: 'horizontal', position: 300, source: 'canvas-center' },
        ])
    })

    it('隐藏层不供轴：拖到隐藏层缘的阈值内不吸附', () => {
        const session = makeSession([
            textLayer({ priority: 20, visible: false, position: { anchor: 'top-left', x: 100, y: 100 } }),
            textLayer({ priority: 10, position: { anchor: 'top-left', x: 0, y: 0 } }),
        ])
        session.beginDrag(['layers', 1], 0, 0)
        session.dragTo(104, 0)
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 104 })
        expect(session.listSnapAxes()).toEqual([])
    })

    it('拖动层自身不供轴：单层文档拖动不吸自己的暂定缘', () => {
        const session = makeSession([
            textLayer({ priority: 10, position: { anchor: 'top-left', x: 100, y: 100 } }),
        ])
        session.beginDrag(['layers', 0], 0, 0)
        session.dragTo(103, 0) // 暂定左缘 203 若含自身轴必命中（delta 0 回显）
        expect(session.store.doc!.layers[0]!.position).toMatchObject({ x: 203 })
        expect(session.listSnapAxes()).toEqual([])
    })
    it('拖动中图层被结构编辑移除的边缘态：dragTo 整体空转、不发布命中轴', () => {
        const { session, dragPath } = makePairSession()
        session.beginDrag(dragPath, 0, 0)
        session.deleteLayer(dragPath)
        session.dragTo(104, 0)
        expect(session.listSnapAxes()).toEqual([])
        expect(session.canUndo).toBe(true) // 删除步在，拖动未产生新步
        expect(session.store.history).toHaveLength(1)
    })
})

describe('命中吸附轴查询的生命周期与历史语义', () => {
    it('拖动中逐次刷新、松手即清空（吸附线瞬时回显）', () => {
        const { session, dragPath } = makePairSession()
        expect(session.listSnapAxes()).toEqual([])
        session.beginDrag(dragPath, 0, 0)
        session.dragTo(104, 0)
        expect(session.listSnapAxes()).toHaveLength(1)
        session.dragTo(250, 0) // 拖离阈值 → 命中清空
        expect(session.listSnapAxes()).toEqual([])
        session.dragTo(104, 0) // 再次命中
        expect(session.listSnapAxes()).toHaveLength(1)
        session.endDrag()
        expect(session.listSnapAxes()).toEqual([])
    })

    it('吸附修正与位移同事务：一次拖动（多次 dragTo）= 一步历史，undo 整步回退', () => {
        const { session, dragPath } = makePairSession()
        session.beginDrag(dragPath, 0, 0)
        session.dragTo(104, 0)
        session.dragTo(103, 3)
        session.endDrag()
        expect(session.canUndo).toBe(true)
        expect(session.store.history).toHaveLength(1)
        session.undo()
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 0, y: 0 })
        expect(session.canUndo).toBe(false)
    })
})
