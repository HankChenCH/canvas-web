/**
 * docVersion 单调递增文档版本号（spec 0001 实现决策 3，工单 0001 内核唯一增量）：
 * EditorSession 暴露单调计数器，作为智能体侧 stale state rejection（过期版本
 * 提交被拒）的新鲜度凭据。只加计数器，不改其他语义：
 * - 任何已提交事务（transact 有 patch）+1；零变更事务不计（没有可提交的内容，
 *   transact 本就空转）；
 * - undo / redo 回放各 +1（文档内容变化，智能体持有的旧版本随即过期）；
 * - openDocument 替换文档 +1 且跨文档不清零——版本号是会话级单调序数，旧文档
 *   的版本（哪怕同为 0）在新文档上不得复用为新鲜凭据。故打开文档后版本从 1 起。
 */
import { describe, expect, it } from 'vitest'

import type { Canvas } from '@hankchen/canvas'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import { textLayer } from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

const makeSession = (layers: Canvas['layers'] = [textLayer()]): EditorSession => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument({ width: 800, height: 600, background: null, layers })
    return session
}

describe('docVersion：已提交事务与回放各 +1、跨文档单调不清零', () => {
    it('打开文档即起步（=1），一次已提交事务再 +1（=2）', () => {
        const session = makeSession()
        expect(session.docVersion).toBe(1)

        session.updateSpec(['layers', 0], ['text'], '改过的文本')

        expect(session.docVersion).toBe(2)
    })

    it('零变更事务不计步：写回同值时版本不动', () => {
        const session = makeSession([textLayer({ text: '原文' })])
        expect(session.docVersion).toBe(1)

        session.updateSpec(['layers', 0], ['text'], '原文')

        expect(session.docVersion).toBe(1)
    })

    it('undo 回放 +1', () => {
        const session = makeSession([textLayer({ text: '原文' })])
        session.updateSpec(['layers', 0], ['text'], '改过')
        expect(session.docVersion).toBe(2)

        session.undo()

        expect(session.docVersion).toBe(3)
    })

    it('redo 回放 +1', () => {
        const session = makeSession([textLayer({ text: '原文' })])
        session.updateSpec(['layers', 0], ['text'], '改过')
        session.undo()
        expect(session.docVersion).toBe(3)

        session.redo()

        expect(session.docVersion).toBe(4)
    })

    it('openDocument 替换文档 +1，换文档后版本继续单调、不清零', () => {
        const session = makeSession()
        session.updateSpec(['layers', 0], ['text'], '旧文档改动')
        const beforeSwitch = session.docVersion

        session.openDocument({ width: 400, height: 300, background: null, layers: [textLayer()] })

        expect(session.docVersion).toBe(beforeSwitch + 1)
        session.updateSpec(['layers', 0], ['text'], '新文档改动')
        expect(session.docVersion).toBe(beforeSwitch + 2)
    })
})
