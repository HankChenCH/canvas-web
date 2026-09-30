/**
 * 参考线与标尺会话态（ruler-guides-snap 工单 01，ADR 0012）：
 * - 参考线 addGuide/removeGuide/listGuides 住 ui 分支——不进历史、不写 graph、
 *   openDocument 换文档重置（当次编辑会话语义）；
 * - 标尺显隐 toggleRulers：缺省常显，翻转不产生历史步。
 */
import { describe, expect, it } from 'vitest'

import type { Canvas } from '@hankchen/canvas-next'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import { textLayer } from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

const doc = (): Canvas => ({
    width: 800,
    height: 600,
    layers: [
        textLayer({ priority: 20, position: { anchor: 'top-left', x: 100, y: 100 } }),
        textLayer({ priority: 10, position: { anchor: 'top-left', x: 300, y: 200 } }),
    ],
})

const makeSession = (): EditorSession => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument(doc())
    return session
}

describe('参考线 API（addGuide/removeGuide/listGuides）', () => {
    it('新增参考线：id 会话内自增，listGuides 回读方向与场景坐标', () => {
        const session = makeSession()
        const g1 = session.addGuide({ orientation: 'vertical', position: 205 })
        const g2 = session.addGuide({ orientation: 'horizontal', position: 721 })
        expect(g1).toEqual({ id: 1, orientation: 'vertical', position: 205 })
        expect(g2).toEqual({ id: 2, orientation: 'horizontal', position: 721 })
        expect(session.listGuides()).toEqual([g1, g2])
    })

    it('删除参考线：按 id 移除返回 true；未知 id 返回 false 且列表不动', () => {
        const session = makeSession()
        const g1 = session.addGuide({ orientation: 'vertical', position: 205 })!
        session.addGuide({ orientation: 'horizontal', position: 721 })
        expect(session.removeGuide(g1.id)).toBe(true)
        expect(session.listGuides()).toHaveLength(1)
        expect(session.listGuides()[0]).toMatchObject({ orientation: 'horizontal' })
        expect(session.removeGuide(999)).toBe(false)
        expect(session.listGuides()).toHaveLength(1)
    })

    it('非有限坐标空转：返回 null 不入列表（绑定层异常输入防御）', () => {
        const session = makeSession()
        expect(session.addGuide({ orientation: 'vertical', position: Number.NaN })).toBeNull()
        expect(session.addGuide({ orientation: 'vertical', position: Number.POSITIVE_INFINITY })).toBeNull()
        expect(session.listGuides()).toEqual([])
    })
})

describe('历史隔离（ADR 0012：不进历史、不写 graph）', () => {
    it('参考线增删不产生历史步', () => {
        const session = makeSession()
        const g = session.addGuide({ orientation: 'vertical', position: 205 })!
        session.addGuide({ orientation: 'horizontal', position: 721 })
        session.removeGuide(g.id)
        expect(session.canUndo).toBe(false)
        expect(session.store.history).toHaveLength(0)
    })

    it('undo/redo 只回放文档 patch，参考线保持不动', () => {
        const session = makeSession()
        session.addGuide({ orientation: 'vertical', position: 205 })
        session.store.transact((draft) => {
            draft.layers[1]!.priority = 99
        })
        expect(session.canUndo).toBe(true)
        session.addGuide({ orientation: 'horizontal', position: 721 })
        const guidesAfterAdd = session.listGuides()

        session.undo()
        expect(session.store.doc!.layers[1]!.priority).toBe(10) // 文档回退
        expect(session.listGuides()).toEqual(guidesAfterAdd) // 参考线不回退

        session.redo()
        expect(session.store.doc!.layers[1]!.priority).toBe(99)
        expect(session.listGuides()).toEqual(guidesAfterAdd)
    })

    it('参考线不写 graph：doc 引用保持原值、图层零改动', () => {
        const session = makeSession()
        const before = session.store.doc
        const g = session.addGuide({ orientation: 'vertical', position: 205 })!
        session.removeGuide(g.id)
        expect(session.store.doc).toBe(before)
        expect(session.store.doc!.layers.map((l) => l.priority)).toEqual([20, 10])
    })

    it('openDocument 换文档重置参考线（当次会话语义）', () => {
        const session = makeSession()
        session.addGuide({ orientation: 'vertical', position: 205 })
        session.openDocument(doc())
        expect(session.listGuides()).toEqual([])
    })
})

describe('标尺显隐（toggleRulers）', () => {
    it('缺省常显，toggle 翻转；不产生历史步', () => {
        const session = makeSession()
        expect(session.store.ui.rulersVisible).toBe(true)
        session.toggleRulers()
        expect(session.store.ui.rulersVisible).toBe(false)
        session.toggleRulers()
        expect(session.store.ui.rulersVisible).toBe(true)
        expect(session.canUndo).toBe(false)
        expect(session.store.history).toHaveLength(0)
    })

    it('openDocument 换文档保留标尺偏好（与视口同款的面板偏好语义）', () => {
        const session = makeSession()
        session.toggleRulers()
        session.openDocument(doc())
        expect(session.store.ui.rulersVisible).toBe(false)
    })
})
