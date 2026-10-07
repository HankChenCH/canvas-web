/**
 * Alt+拖快速复制（alt-drag-paste 工单 01，spec 决策 1–4，CONTEXT「快速复制」词条）：
 * - copyMode 手势起点一次性判定（beginDrag 可选 copy 标记，会话内定死、无中途
 *   修饰键读数）；不可复制目标（行/格）静默忽略 Alt 走普通拖动；
 * - 死区 ALT_DRAG_DEAD_ZONE_SCREEN_PX = 4 屏幕像素（缩放无关）：未越阈零事务、
 *   源层不动（Alt+点击退化为普通点选，零历史零残留）；
 * - 首移越阈单事务 = 插入副本（紧邻源层）+ 副本自源盒起步位移，同 DRAG_MERGE_KEY；
 *   drag.path 重指向副本、startPosition 换基准（根层语义反解）、副本自动选中；
 * - 后续 move 同键合并，endDrag 照常 closeMerge——undo 一次副本整体消失；
 * - 吸附零改动接入：首移副本未入库、源层即吸附源；后续位移副本自身被排除。
 */
import { describe, expect, it } from 'vitest'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import {
    cellLayer,
    rowLayer,
    tableLayer,
    textLayer,
} from '../support/fixtures'
import type { Canvas, Layer } from '@hankchen/canvas'

const nullScheduler: FrameScheduler = () => () => {}

const makeSession = (layers: Layer[]): EditorSession => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument({ width: 800, height: 600, layers } satisfies Canvas)
    return session
}

/** 源层盒 (100,100,100,50)（p20）+ 远处第二层 (400,400)（p10）：插值/吸附的基准画布 */
const makePairSession = (): EditorSession =>
    makeSession([
        textLayer({ priority: 20, position: { anchor: 'top-left', x: 100, y: 100 } }),
        textLayer({ priority: 10, position: { anchor: 'top-left', x: 400, y: 400 } }),
    ])

describe('copyMode 死区（ALT_DRAG_DEAD_ZONE_SCREEN_PX = 4 屏幕像素，缩放无关）', () => {
    it('zoom=1：恰 4 场景 px（=4 屏幕 px）未越死区零事务；5 场景 px 越阈插入副本', () => {
        const session = makePairSession()
        expect(session.beginDrag(['layers', 0], 100, 100, { copy: true })).toBe(true)
        session.dragTo(104, 100) // 恰在死区边界（未越过）
        expect(session.store.history).toHaveLength(0)
        expect(session.store.doc!.layers).toHaveLength(2)
        expect(session.store.doc!.layers[0]!.position).toMatchObject({ x: 100, y: 100 }) // 源不动
        expect(session.listSnapAxes()).toEqual([]) // 死区内不发布吸附轴
        session.dragTo(105, 100) // 越阈（吸附可修正落点，此处只断言状态机）
        expect(session.store.history).toHaveLength(1)
        expect(session.store.doc!.layers).toHaveLength(3)
    })

    it('zoom=2：2 场景 px（=4 屏幕 px）仍在死区内，2.5 场景 px（5 屏幕 px）越阈', () => {
        const session = makePairSession()
        session.store.setViewport({ x: 0, y: 0, zoom: 2 })
        session.beginDrag(['layers', 0], 100, 100, { copy: true })
        session.dragTo(102, 100)
        expect(session.store.history).toHaveLength(0)
        expect(session.store.doc!.layers).toHaveLength(2)
        session.dragTo(102.5, 100)
        expect(session.store.history).toHaveLength(1)
        expect(session.store.doc!.layers).toHaveLength(3)
        expect(session.store.ui.drag!.path).toEqual(['layers', 1])
    })
})

describe('Alt+点击退化与首移事务（插入 + 位移同 mergeKey）', () => {
    it('死区内抬手：零历史步、零残留（层数/位置不变、无拖动会话、无吸附轴）', () => {
        const session = makePairSession()
        session.beginDrag(['layers', 0], 100, 100, { copy: true })
        session.dragTo(101, 103) // hypot(1,3) ≈ 3.16 < 4
        session.endDrag()
        expect(session.store.history).toHaveLength(0)
        expect(session.store.doc!.layers).toHaveLength(2)
        expect(session.store.doc!.layers[0]!.position).toMatchObject({ x: 100, y: 100 })
        expect(session.store.ui.drag).toBeNull()
        expect(session.listSnapAxes()).toEqual([])
    })

    it('首移越阈单事务：副本紧邻源层（中点插值）、自源盒起步位移、源层不动', () => {
        const session = makePairSession()
        session.beginDrag(['layers', 0], 100, 100, { copy: true })
        session.dragTo(160, 140) // 位移 (60,40)，离全部吸附轴远
        const doc = session.store.doc!
        expect(doc.layers).toHaveLength(3)
        expect(doc.layers[0]!.priority).toBe(20) // 源原地不动
        expect(doc.layers[0]!.position).toMatchObject({ x: 100, y: 100 })
        expect(doc.layers[1]!.priority).toBe(15) // 源(20)与其视觉上一层(10)的中点
        expect(doc.layers[1]!.position).toMatchObject({ x: 160, y: 140 }) // 源盒起步 + 位移
    })

    it('手势重指向副本 + 副本自动选中；事务 mergeKey 沿用 drag、endDrag 闭合', () => {
        const session = makePairSession()
        session.beginDrag(['layers', 0], 100, 100, { copy: true })
        session.dragTo(160, 140)
        expect(session.store.ui.drag!.path).toEqual(['layers', 1])
        expect(session.store.ui.selection).toEqual(['layers', 1])
        expect(session.store.history[0]!.mergeKey).toBe('drag')
        session.endDrag()
        expect(session.store.history[0]!.mergeKey).toBeNull()
        expect(session.store.ui.drag).toBeNull()
    })

    it('后续 move 同键合并：多次 dragTo 仍一步历史，undo 一次副本整体消失', () => {
        const session = makePairSession()
        session.beginDrag(['layers', 0], 100, 100, { copy: true })
        session.dragTo(160, 140)
        session.dragTo(180, 160)
        session.endDrag()
        expect(session.store.history).toHaveLength(1)
        session.undo()
        expect(session.store.doc!.layers).toHaveLength(2)
        expect(session.store.doc!.layers[0]!.position).toMatchObject({ x: 100, y: 100 })
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 400, y: 400 })
        expect(session.canUndo).toBe(false)
    })

    it('格内容源：副本落为根层（紧邻表的根祖先），起步位按根层语义反解、续拖按绝对基准', () => {
        const session = makeSession([
            tableLayer(
                [
                    rowLayer(
                        [cellLayer(textLayer({ text: '格内文本' }), { shape: { width: 300, height: 90 } })],
                        { shape: { width: 600, height: 90 } },
                    ),
                ],
                { shape: { width: 600, height: 200 }, priority: 30, position: { anchor: 'top-left', x: 50, y: 60 } },
            ),
        ])
        // 格内容与格同原点：绝对盒 (50,60)；格内相对 position (0,0) 不是根层语义
        session.beginDrag(['layers', 0, 'rows', 0, 'cells', 0, 'content'], 60, 70, { copy: true })
        session.dragTo(90, 80) // 位移 (30,10)
        let doc = session.store.doc!
        expect(doc.layers).toHaveLength(2)
        expect(doc.layers[1]!.type).toBe('TextLayer')
        expect(doc.layers[1]!.priority).toBe(29) // 源根（表）为视觉最顶 → source − 1
        expect(doc.layers[1]!.position).toMatchObject({ x: 80, y: 70 }) // 绝对盒 + 位移
        expect(session.store.ui.drag!.path).toEqual(['layers', 1])
        // 续拖按换基准后的绝对位置计：总位移 (60,25) → (110,85)
        session.dragTo(120, 95)
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 110, y: 85 })
        session.endDrag()
        session.undo()
        expect(session.store.doc!.layers).toHaveLength(1)
    })
})

describe('copyMode 边界（spec 决策 1/2）', () => {
    it('不可复制目标忽略 Alt：行/格路径携 copy 起手退化为普通拖动，首移不插副本', () => {
        const session = makeSession([
            tableLayer(
                [
                    rowLayer(
                        [cellLayer(textLayer({ text: '格内文本' }), { shape: { width: 300, height: 90 } })],
                        { shape: { width: 600, height: 90 } },
                    ),
                ],
                { shape: { width: 600, height: 200 }, priority: 30 },
            ),
        ])
        expect(session.beginDrag(['layers', 0, 'rows', 0], 0, 0, { copy: true })).toBe(true)
        expect(session.store.ui.drag!.copy).toBeFalsy()
        session.dragTo(50, 0) // 越阈：普通拖动语义
        expect(session.store.doc!.layers).toHaveLength(1) // 无副本
        expect(session.store.history).toHaveLength(1) // 位移照常进历史
        expect(session.store.ui.drag!.path).toEqual(['layers', 0, 'rows', 0]) // 未重指向

        session.endDrag()
        // 格路径同门（canCopyLayerAt = false 的同一分支）
        expect(session.beginDrag(['layers', 0, 'rows', 0, 'cells', 0], 0, 0, { copy: true })).toBe(true)
        expect(session.store.ui.drag!.copy).toBeFalsy()
        session.endDrag()
    })

    it('修饰键起点一次性判定：未携 copy 的会话首移走普通拖动（内核无中途触发面），源层自己位移', () => {
        const session = makePairSession()
        session.beginDrag(['layers', 0], 100, 100) // pointerdown 未按 Alt 的形态
        session.dragTo(160, 140)
        expect(session.store.doc!.layers).toHaveLength(2)
        expect(session.store.doc!.layers[0]!.position).toMatchObject({ x: 160, y: 140 })
        expect(session.store.history).toHaveLength(1)
        // 携 copy 的会话中途无取消面（spec 决策 2：中途松 Alt 副本照常落下）——
        // 由上两用例的「副本照常落地」与本用例的「无中途触发面」共同钉死
    })
})

describe('copyMode 吸附（spec 决策 4：完整参与、不豁免源层）', () => {
    it('首移副本未入库：源层是吸附源——副本左缘接近源中心轴即吸', () => {
        const session = makePairSession()
        session.beginDrag(['layers', 0], 100, 100, { copy: true })
        // dx=52：副本暂定左缘 152 距源中心 150 差 2（阈值内）→ 吸到 150；dy=8 避开水平轴
        session.dragTo(152, 108)
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 150, y: 108 })
        expect(session.listSnapAxes()).toEqual([{ orientation: 'vertical', position: 150, source: 'layer' }])
    })

    it('后续位移：副本自身被排除（同点重发不自吸 delta-0），源层仍供轴', () => {
        const session = makePairSession()
        session.beginDrag(['layers', 0], 100, 100, { copy: true })
        session.dragTo(160, 140) // 首移落副本（无吸附）
        session.dragTo(655, 460) // 拖到全部轴 6px 外
        session.dragTo(655, 460) // 同点重发：副本若自供轴必 delta-0 命中
        expect(session.listSnapAxes()).toEqual([])
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 655, y: 460 }) // 副本在源后一格
        session.dragTo(152, 460) // 拖回源中心轴附近照常吸
        expect(session.store.doc!.layers[1]!.position).toMatchObject({ x: 150 })
        expect(session.listSnapAxes()).toEqual([{ orientation: 'vertical', position: 150, source: 'layer' }])
    })
})
