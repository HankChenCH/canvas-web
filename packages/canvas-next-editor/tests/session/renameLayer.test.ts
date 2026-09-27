/**
 * 图层重命名（layer-panel-ux 工单 09）：内核 renameLayer 与重命名编辑会话。
 *
 * - renameLayer：仅根图层（非根/悬空路径空转）、一步历史 transact、可撤销；
 *   空名 = 回退缺省（文档 name 归空串，wire 键随之省略——「不落键」）。
 * - 编辑会话（beginRename/commitRename/cancelRename）：住 ui 分支（不进历史），
 *   提交经漏斗一次性落文档——先清会话再写名，Enter 与失焦的级联退出由会话幂等
 *   吸收，一次退出恰一步历史（commitTextEdit 同款语义）。
 * - 悬空路径清理照旧：撤销/结构变更后 renaming 与选择/悬停同款清理与重映射。
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

describe('renameLayer：一步历史与撤销', () => {
    it('写 name 落文档：一次调用 = 一步历史，undo 恢复旧名、redo 复现', () => {
        const session = makeSession([textLayer({ priority: 10 })])
        session.renameLayer(['layers', 0], '封面标题')
        expect(session.store.doc!.layers[0]!.name).toBe('封面标题')
        expect(session.store.history).toHaveLength(1)

        session.undo()
        expect(session.store.doc!.layers[0]!.name).toBe('')
        session.redo()
        expect(session.store.doc!.layers[0]!.name).toBe('封面标题')
    })

    it('连改两次名另起两步（无 mergeKey 不合并）：undo×2 回到未命名', () => {
        const session = makeSession([textLayer({ priority: 10 })])
        session.renameLayer(['layers', 0], '甲')
        session.renameLayer(['layers', 0], '乙')
        expect(session.store.history).toHaveLength(2)

        session.undo()
        session.undo()
        expect(session.store.doc!.layers[0]!.name).toBe('')
    })

    it('同名重命名无变化：不产生历史步、不通知（transact 空转语义）', () => {
        const session = makeSession([textLayer({ priority: 10, name: '原名' })])
        const listener = vi.fn()
        session.subscribe(listener)

        session.renameLayer(['layers', 0], '原名')

        expect(session.store.history).toHaveLength(0)
        expect(listener).not.toHaveBeenCalled()
    })
})

describe('renameLayer：空名回退缺省（不落键）', () => {
    it('空串写回缺省名：文档 name 归空串，encode 输出无 name 键', () => {
        const session = makeSession([textLayer({ priority: 10 })])
        session.renameLayer(['layers', 0], '临时名')
        session.renameLayer(['layers', 0], '')

        expect(session.store.doc!.layers[0]!.name).toBe('')
        const wire = JSON.parse(JSON.stringify(encodeGraph(session.store.doc!)))
        expect(JSON.stringify(wire)).not.toContain('"name"')
    })
})

describe('renameLayer：仅根图层（其余路径空转）', () => {
    it('可解析的行/格/内容路径一律空转：文档不动、无历史步', () => {
        const session = makeSession([
            tableLayer([rowLayer([cellLayer(textLayer({ text: '甲' }))])], { priority: 20 }),
            textLayer({ priority: 10 }),
        ])
        const before = session.store.doc

        session.renameLayer(['layers', 0, 'rows', 0], '行名')
        session.renameLayer(['layers', 0, 'rows', 0, 'cells', 0], '格名')
        session.renameLayer(['layers', 0, 'rows', 0, 'cells', 0, 'content'], '内容名')

        expect(session.store.doc).toBe(before)
        expect(session.store.history).toHaveLength(0)
    })

    it('悬空/怪形态路径空转：越界下标与缺段路径不产生历史步', () => {
        const session = makeSession([textLayer({ priority: 10 })])
        const before = session.store.doc

        session.renameLayer(['layers', 9], '幽灵')
        session.renameLayer(['layers'], '怪形态')
        session.renameLayer(['layers', 0, 'template', 'cells', 0], '模板格')

        expect(session.store.doc).toBe(before)
        expect(session.store.history).toHaveLength(0)
    })
})

describe('重命名编辑会话（ui 分支，不进历史）', () => {
    it('beginRename 仅根层可开：根层 true + ui.renaming；行/格/内容与无选择 false', () => {
        const session = makeSession([
            tableLayer([rowLayer([cellLayer(textLayer({ text: '甲' }))])], { priority: 20 }),
            textLayer({ priority: 10 }),
        ])

        expect(session.beginRename(['layers', 0, 'rows', 0])).toBe(false)
        expect(session.beginRename(['layers', 0, 'rows', 0, 'cells', 0, 'content'])).toBe(false)
        expect(session.beginRename(null)).toBe(false)
        expect(session.beginRename(['layers', 9])).toBe(false)
        expect(session.store.ui.renaming).toBeNull()

        expect(session.beginRename(['layers', 0])).toBe(true)
        expect(session.store.ui.renaming).toEqual(['layers', 0])
        expect(session.store.history).toHaveLength(0) // 会话不进历史
    })

    it('commitRename 漏斗：先清会话再落文档，级联的二次提交幂等（恰一步历史）', () => {
        const session = makeSession([textLayer({ priority: 10 })])
        session.beginRename(['layers', 0])

        expect(session.commitRename('新名')).toBe(true)
        expect(session.store.doc!.layers[0]!.name).toBe('新名')
        expect(session.store.ui.renaming).toBeNull()
        expect(session.store.history).toHaveLength(1)

        // Enter 提交后 input 卸载触发的 blur 再走一次提交：会话已清，空转
        expect(session.commitRename('新名')).toBe(false)
        expect(session.store.history).toHaveLength(1)
    })

    it('commitRename 空名 = 回退缺省；同名提交无历史步（进出编辑零噪声）', () => {
        const session = makeSession([textLayer({ priority: 10, name: '原名' })])

        session.beginRename(['layers', 0])
        session.commitRename('')
        expect(session.store.doc!.layers[0]!.name).toBe('')
        expect(session.store.history).toHaveLength(1) // 原名 → '' 是真变更，落一步

        // 同名提交（现名 '' → 提交 ''）：无变化不落步
        session.beginRename(['layers', 0])
        session.commitRename('')
        expect(session.store.history).toHaveLength(1)

        session.beginRename(['layers', 0])
        session.cancelRename()
        expect(session.store.ui.renaming).toBeNull()
        expect(session.store.doc!.layers[0]!.name).toBe('')
        expect(session.store.history).toHaveLength(1) // 取消不落文档
    })

    it('executeShortcut("rename") 分派 beginRename(选中)：F2 的分派面', () => {
        const session = makeSession([
            tableLayer([rowLayer([cellLayer(textLayer({ text: '甲' }))])], { priority: 20 }),
            textLayer({ priority: 10 }),
        ])

        expect(session.executeShortcut('rename')).toBe(false) // 无选择
        session.setSelection(['layers', 0, 'rows', 0]) // 行——非根层不可重命名
        expect(session.executeShortcut('rename')).toBe(false)
        session.setSelection(['layers', 1])
        expect(session.executeShortcut('rename')).toBe(true)
        expect(session.store.ui.renaming).toEqual(['layers', 1])
    })

    it('撤销使重命名路径悬空：会话随 pruneDanglingPaths 清理（悬空路径清理照旧）', () => {
        const session = makeSession([textLayer({ priority: 10 })])
        session.addRootLayer('TextLayer')
        session.beginRename(['layers', 1])
        expect(session.store.ui.renaming).toEqual(['layers', 1])

        session.undo() // 新层被撤，renaming 路径悬空
        expect(session.store.ui.renaming).toBeNull()
    })

    it('删除引发下标平移：重命名路径与选择/悬停同款重映射', () => {
        const session = makeSession([textLayer({ priority: 20, text: '甲' }), textLayer({ priority: 10, text: '乙' })])
        session.beginRename(['layers', 1]) // 乙

        session.deleteLayer(['layers', 0]) // 甲删 → 乙 1→0
        expect(session.store.ui.renaming).toEqual(['layers', 0])
    })
})
