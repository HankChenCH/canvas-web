/**
 * 对齐画布 action 族（layer-align-snap 工单 01）：内核 alignToCanvas。
 *
 * - 十种 mode 的盒坐标断言：贴边零边距、贴角统一边距（缺省 40）、居中 = 精确
 *   中点公式；盒坐标一律经 session.layerBoxAt(path) 解析（与 gizmo/命中同一
 *   几何来源），画布尺寸取 doc.canvas；
 * - 几何语义：盒坐标对 position 线性，对齐写 position 偏移、anchor 不动；
 *   盒大于画布不钳位（偏移可为负的领域语义），公式原样落位；
 * - 历史步进：一次调用 = 一步历史（无 mergeKey，连续点击不合并）；已对齐
 *   （零位移）空转不进历史；文档未打开/路径不可解析/未知 mode 空转。
 */
import { describe, expect, it, vi } from 'vitest'

import type { AlignToCanvasMode } from '../../src'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import {
    cellLayer,
    imageLayer,
    qrLayer,
    rowLayer,
    tableLayer,
    textLayer,
} from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

const makeSession = (
    layers: Parameters<EditorSession['openDocument']>[0]['layers'],
    width = 800,
    height = 600,
) => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument({ width, height, layers })
    return session
}

describe('alignToCanvas：十种 mode 的盒坐标（贴边=0、贴角=margin、居中=居中公式）', () => {
    // 画布 800×600,盒 100×50 @ (300, 200)
    const cases: ReadonlyArray<[AlignToCanvasMode, number, number]> = [
        ['left', 0, 200],
        ['right', 700, 200],
        ['top', 300, 0],
        ['bottom', 300, 550],
        ['h-center', 350, 200],
        ['v-center', 300, 275],
        ['corner-tl', 40, 40],
        ['corner-tr', 660, 40],
        ['corner-bl', 40, 510],
        ['corner-br', 660, 510],
    ]

    it.each(cases)('mode %s：盒落位 (%i, %i)，另一轴不动', (mode, x, y) => {
        const session = makeSession([qrLayer({ position: { x: 300, y: 200 } })])

        session.alignToCanvas(['layers', 0], mode)

        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x, y })
    })

    it('贴角自定义边距：opts.margin 覆盖缺省 40', () => {
        const session = makeSession([qrLayer({ position: { x: 300, y: 200 } })])

        session.alignToCanvas(['layers', 0], 'corner-tr', { margin: 20 })

        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 680, y: 20 })
    })

    it('居中取精确中点：不取整（(795−100)/2 = 347.5）', () => {
        const session = makeSession([qrLayer({ position: { x: 0, y: 0 } })], 795, 600)

        session.alignToCanvas(['layers', 0], 'h-center')

        expect(session.layerBoxAt(['layers', 0])!.x).toBe(347.5)
    })
})

describe('alignToCanvas：几何语义（anchor 不动、位移写偏移）', () => {
    it('非 top-left 锚点同样落位：target−current 位移写 position，anchor 保持原值', () => {
        // anchor center：初始盒 = (trunc(700/2), trunc(550/2)) = (350, 275)
        const session = makeSession([imageLayer({ position: { anchor: 'center', x: 0, y: 0 } })])
        const listener = vi.fn()
        session.subscribe(listener)

        session.alignToCanvas(['layers', 0], 'left')

        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 0, y: 275 })
        const layer = session.store.doc!.layers[0]!
        expect(layer.position.anchor).toBe('center')
        expect(layer.position.x).toBe(-350)
        // patch 只落 position 偏移（x 一轴），锚点设定不进 patch
        expect(listener).toHaveBeenCalledWith(
            expect.objectContaining({
                scope: 'doc',
                patches: [expect.objectContaining({ path: ['layers', 0, 'position', 'x'] })],
            }),
        )
    })
})

describe('alignToCanvas：边界情形（盒大于画布不钳位）', () => {
    // 画布 800×600,盒 1000×800 @ (50, 30)
    const cases: ReadonlyArray<[AlignToCanvasMode, number, number]> = [
        ['left', 0, 30],
        ['right', -200, 30],
        ['h-center', -100, 30],
        ['v-center', 50, -100],
        ['bottom', 50, -200],
        ['corner-tl', 40, 40],
        ['corner-br', -240, -240],
    ]

    it.each(cases)('盒大于画布 mode %s：公式原样落位 (%i, %i)', (mode, x, y) => {
        const session = makeSession(
            [imageLayer({ shape: { width: 1000, height: 800 }, position: { x: 50, y: 30 } })],
        )

        session.alignToCanvas(['layers', 0], mode)

        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x, y })
    })
})

describe('alignToCanvas：非根路径（格/格内容层统一位移语义）', () => {
    it('格内容层按画布几何对齐：内容盒位移，表与格不动', () => {
        const content = textLayer({ shape: { width: 50, height: 50 }, position: { x: 0, y: 0 } })
        const cell = cellLayer(content, { shape: { width: 300, height: 200 } })
        const session = makeSession([
            tableLayer([rowLayer([cell], { shape: { width: 300, height: 200 } })], {
                position: { x: 100, y: 100 },
                shape: { width: 300, height: 200 },
            }),
        ])
        const contentPath = ['layers', 0, 'rows', 0, 'cells', 0, 'content'] as const
        // 格内容与格同原点 → 内容盒 (100, 100)
        expect(session.layerBoxAt(contentPath)).toMatchObject({ x: 100, y: 100 })

        session.alignToCanvas(contentPath, 'h-center')

        expect(session.layerBoxAt(contentPath)).toMatchObject({ x: 375, y: 100 })
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 100, y: 100 })
        expect(session.layerBoxAt(['layers', 0, 'rows', 0, 'cells', 0])).toMatchObject({ x: 100, y: 100 })
    })

    it('格自身对齐：格盒按画布几何位移（容器路径不例外）', () => {
        const cell = cellLayer(null, { shape: { width: 300, height: 200 } })
        const session = makeSession([
            tableLayer([rowLayer([cell], { shape: { width: 300, height: 200 } })], {
                position: { x: 100, y: 100 },
                shape: { width: 300, height: 200 },
            }),
        ])

        session.alignToCanvas(['layers', 0, 'rows', 0, 'cells', 0], 'left')

        expect(session.layerBoxAt(['layers', 0, 'rows', 0, 'cells', 0])).toMatchObject({ x: 0, y: 100 })
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 100, y: 100 })
    })
})

describe('alignToCanvas：历史步进（一次点击一步、不合并）', () => {
    it('连续两次点击 = 两步历史（无 mergeKey 不合并），逐步可撤销可重做', () => {
        const session = makeSession([qrLayer({ position: { x: 300, y: 200 } })])

        session.alignToCanvas(['layers', 0], 'left')
        session.alignToCanvas(['layers', 0], 'v-center')

        expect(session.store.history).toHaveLength(2)
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 0, y: 275 })

        session.undo()
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 0, y: 200 })
        session.undo()
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 300, y: 200 })

        session.redo()
        session.redo()
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 0, y: 275 })
    })

    it('已对齐（零位移）再点 = 空转：无历史步、文档不动', () => {
        const session = makeSession([qrLayer({ position: { x: 300, y: 200 } })])

        session.alignToCanvas(['layers', 0], 'left')
        expect(session.store.history).toHaveLength(1)
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 0, y: 200 })

        session.alignToCanvas(['layers', 0], 'left')
        expect(session.store.history).toHaveLength(1)
    })
})

describe('alignToCanvas：空转面（无历史步、不抛错）', () => {
    it('文档未打开空转', () => {
        const session = new EditorSession({ scheduleFrame: nullScheduler })
        expect(() => session.alignToCanvas(['layers', 0], 'left')).not.toThrow()
        expect(session.store.history).toHaveLength(0)
    })

    it('不可解析路径空转：越界下标与文档引用不动', () => {
        const session = makeSession([qrLayer({ position: { x: 300, y: 200 } })])
        const before = session.store.doc

        session.alignToCanvas(['layers', 9], 'left')
        session.alignToCanvas(['layers'], 'left')

        expect(session.store.doc).toBe(before)
        expect(session.store.history).toHaveLength(0)
    })

    it('未知 mode（运行时垃圾输入）空转', () => {
        const session = makeSession([qrLayer({ position: { x: 300, y: 200 } })])
        const before = session.store.doc

        session.alignToCanvas(['layers', 0], 'diagonal' as unknown as AlignToCanvasMode)

        expect(session.store.doc).toBe(before)
        expect(session.store.history).toHaveLength(0)
    })
})
