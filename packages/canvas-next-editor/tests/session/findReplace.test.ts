/**
 * 查找替换会话（canvas-web-find-replace 工单 01）：find 会话住 store.ui 分支、
 * matches 派生不驻留、replaceOne/replaceAll 各成一步历史、openDocument 重置、
 * ⌘F 分派口。扫描/替换纯函数语义见 tests/editing/findReplace.test.ts。
 */
import { describe, expect, it, vi } from 'vitest'

import type { Canvas, TableLayer } from '@hankchen/canvas-next'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import { EditorStore } from '../../src/session/store'
import { cellLayer, rowLayer, rowTemplateLayer, tableLayer, textLayer } from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

const openSession = (layers: Canvas['layers']): EditorSession => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument({ width: 800, height: 600, layers })
    return session
}

describe('store.ui find 分支：会话态族', () => {
    it('初始态：关、空查找词、空替换词、游标 0', () => {
        const store = new EditorStore()
        expect(store.ui.find).toEqual({ open: false, query: '', replacement: '', cursor: 0 })
    })

    it('setFind 按 {scope: ui, branch: find} 通知且不进历史；同值写入短路', () => {
        const store = new EditorStore()
        store.openDocument({ width: 100, height: 80, layers: [] })
        const listener = vi.fn()
        store.subscribe(listener)

        store.setFind({ open: true, query: '春', replacement: '秋', cursor: 0 })
        expect(store.ui.find).toEqual({ open: true, query: '春', replacement: '秋', cursor: 0 })
        expect(listener).toHaveBeenCalledTimes(1)
        expect(store.history).toHaveLength(0)

        store.setFind({ open: true, query: '春', replacement: '秋', cursor: 0 })
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it('openDocument 重置 find 会话（换文档带旧查询词开面板反而怪，会话态族同门）', () => {
        const store = new EditorStore()
        store.openDocument({ width: 100, height: 80, layers: [] })
        store.setFind({ open: true, query: '春', replacement: '秋', cursor: 3 })

        store.openDocument({ width: 200, height: 160, layers: [] })
        expect(store.ui.find).toEqual({ open: false, query: '', replacement: '', cursor: 0 })
    })
})

describe('find 会话：beginFind/closeFind 与输入写入', () => {
    it('beginFind 开会话；无文档空转返回 false（⌘F 无文档空转）', () => {
        const bare = new EditorSession({ scheduleFrame: nullScheduler })
        expect(bare.store.doc).toBeNull()
        expect(bare.beginFind()).toBe(false)
        expect(bare.store.ui.find.open).toBe(false)
    })

    it('beginFind 置 open 并返回 true；已开再开值等短路零通知（重复 ⌘F 不惊动订阅方）', () => {
        const session = openSession([textLayer({ text: '春' })])
        const listener = vi.fn()
        session.subscribe(listener)

        expect(session.beginFind()).toBe(true)
        expect(session.store.ui.find.open).toBe(true)
        expect(listener).toHaveBeenCalledTimes(1)

        expect(session.beginFind()).toBe(true)
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it('closeFind 仅翻开合面、查询词与替换词保留（重开恢复，同文档连续改字）', () => {
        const session = openSession([textLayer({ text: '春季' })])
        session.beginFind()
        session.setFindQuery('春季')
        session.setFindReplacement('秋季')
        session.setFindCursor(0)

        session.closeFind()
        expect(session.store.ui.find).toEqual({ open: false, query: '春季', replacement: '秋季', cursor: 0 })

        session.beginFind()
        expect(session.store.ui.find.open).toBe(true)
        expect(session.store.ui.find.query).toBe('春季')
    })

    it('setFindQuery 写查找词并重置游标（旧下标对新命中集无意义）；同词不重置', () => {
        const session = openSession([textLayer({ text: '春季春季' })])
        session.beginFind()
        session.setFindQuery('春季')
        session.setFindCursor(1)
        expect(session.store.ui.find.cursor).toBe(1)

        session.setFindQuery('春')
        expect(session.store.ui.find.cursor).toBe(0)

        session.setFindCursor(1)
        session.setFindQuery('春')
        expect(session.store.ui.find.cursor).toBe(1)
    })

    it('游标读侧钳位：越界落末处、负值落首处、空命中为 0', () => {
        const session = openSession([textLayer({ text: '春季春季' })])
        session.beginFind()
        session.setFindQuery('春季')
        expect(session.findCursor).toBe(0)

        session.setFindCursor(99)
        expect(session.findCursor).toBe(1)

        session.setFindCursor(-3)
        expect(session.findCursor).toBe(0)

        session.setFindQuery('秋')
        expect(session.listFindMatches()).toEqual([])
        expect(session.findCursor).toBe(0)
    })

    it('listFindMatches 派生不驻留：文档变更后从新 doc 现算', () => {
        const session = openSession([textLayer({ text: '春季班' })])
        session.beginFind()
        session.setFindQuery('春季')
        expect(session.listFindMatches()).toHaveLength(1)

        session.updateData(['layers', 0], '秋季班')
        expect(session.listFindMatches()).toEqual([])

        session.undo()
        expect(session.listFindMatches()).toHaveLength(1)
    })
})

describe('replaceOne：替换当前命中（一步历史 + 自动跳下一处）', () => {
    it('替换游标处命中：text 直写、expression 保持 null、一步历史、undo 全回', () => {
        const session = openSession([textLayer({ text: '2026 春季班' })])
        session.beginFind()
        session.setFindQuery('春季')
        session.setFindReplacement('秋季')

        expect(session.replaceOne()).toBe(true)
        expect((session.store.doc!.layers[0] as { text: string }).text).toBe('2026 秋季班')
        expect((session.store.doc!.layers[0] as { expression: string | null }).expression).toBeNull()
        expect(session.store.history).toHaveLength(1)

        session.undo()
        expect((session.store.doc!.layers[0] as { text: string }).text).toBe('2026 春季班')
    })

    it('替换后游标原地指向下一处（派生列表在被替换处缩一位）', () => {
        const session = openSession([
            textLayer({ priority: 10, text: '春季甲' }),
            textLayer({ priority: 20, text: '春季乙' }),
        ])
        session.beginFind()
        session.setFindQuery('春季')
        session.setFindReplacement('秋')
        expect(session.listFindMatches()[0]!.path).toEqual(['layers', 1])

        expect(session.replaceOne()).toBe(true)
        expect((session.store.doc!.layers[1] as { text: string }).text).toBe('秋乙')
        expect(session.findCursor).toBe(0)
        expect(session.listFindMatches()[0]!.path).toEqual(['layers', 0])

        expect(session.replaceOne()).toBe(true)
        expect((session.store.doc!.layers[0] as { text: string }).text).toBe('秋甲')
        expect(session.store.history).toHaveLength(2)
    })

    it('空替换串 = 删除命中串（合法语义）', () => {
        const session = openSession([textLayer({ text: '你好世界' })])
        session.beginFind()
        session.setFindQuery('世界')
        session.setFindReplacement('')

        expect(session.replaceOne()).toBe(true)
        expect((session.store.doc!.layers[0] as { text: string }).text).toBe('你好')
    })

    it('空转返回 false 且零历史步：无文档 / 空 query / 无命中', () => {
        const bare = new EditorSession({ scheduleFrame: nullScheduler })
        expect(bare.replaceOne()).toBe(false)

        const session = openSession([textLayer({ text: '春季' })])
        expect(session.replaceOne()).toBe(false) // 空 query

        session.setFindQuery('秋季')
        expect(session.replaceOne()).toBe(false)
        expect(session.store.history).toHaveLength(0)
    })
})

describe('replaceAll：全部替换（原文快照定位，一次事务 = 一步历史）', () => {
    it('跨层多命中一次事务：undo 一次全回；返回应用处数', () => {
        const session = openSession([
            textLayer({ priority: 10, text: '春季甲春季乙' }),
            textLayer({ priority: 20, text: '春季丙' }),
        ])
        session.beginFind()
        session.setFindQuery('春季')
        session.setFindReplacement('秋季')

        expect(session.replaceAll()).toBe(3)
        expect((session.store.doc!.layers[0] as { text: string }).text).toBe('秋季甲秋季乙')
        expect((session.store.doc!.layers[1] as { text: string }).text).toBe('秋季丙')
        expect(session.store.history).toHaveLength(1)

        session.undo()
        expect((session.store.doc!.layers[0] as { text: string }).text).toBe('春季甲春季乙')
        expect((session.store.doc!.layers[1] as { text: string }).text).toBe('春季丙')
    })

    it('快照定位不死循环：replacement 含查询串时一次应用（产物不重扫）', () => {
        const session = openSession([textLayer({ text: '春' })])
        session.beginFind()
        session.setFindQuery('春')
        session.setFindReplacement('春季')

        expect(session.replaceAll()).toBe(1)
        expect((session.store.doc!.layers[0] as { text: string }).text).toBe('春季')
        expect(session.store.history).toHaveLength(1)
    })

    it('标记字段零触碰：text 与 expression 镜像在替换与 undo 后均不动', () => {
        const session = openSession([
            textLayer({ priority: 30, text: '姓名{{row.name}}', expression: '姓名{{row.name}}' }),
            textLayer({ priority: 10, text: '春季班' }),
        ])
        const markedBefore = structuredClone(session.store.doc!.layers[0])
        session.beginFind()
        session.setFindQuery('春季')
        session.setFindReplacement('秋季')

        expect(session.replaceAll()).toBe(1)
        expect(session.store.doc!.layers[0]).toEqual(markedBefore)

        session.undo()
        expect(session.store.doc!.layers[0]).toEqual(markedBefore)
        expect((session.store.doc!.layers[1] as { text: string }).text).toBe('春季班')
    })

    it('模板格静态文本替换生效（影响全部展开行，正是需求本身）', () => {
        const session = openSession([
            tableLayer([], {
                rowsPath: 'data.rows',
                template: rowTemplateLayer([cellLayer(textLayer({ text: '第2026期' }))]),
            }),
        ])
        session.beginFind()
        session.setFindQuery('2026')
        session.setFindReplacement('2027')

        expect(session.replaceAll()).toBe(1)
        const table = session.store.doc!.layers[0] as TableLayer
        expect((table.template!.cells[0]!.content as { text: string }).text).toBe('第2027期')
        expect(session.store.history).toHaveLength(1)

        session.undo()
        expect(
            ((session.store.doc!.layers[0] as TableLayer).template!.cells[0]!.content as { text: string }).text,
        ).toBe('第2026期')
    })

    it('空转返回 0 且零历史步：无文档 / 空 query / 无命中', () => {
        const bare = new EditorSession({ scheduleFrame: nullScheduler })
        expect(bare.replaceAll()).toBe(0)

        const session = openSession([textLayer({ text: '春季' })])
        expect(session.replaceAll()).toBe(0)

        session.setFindQuery('秋季')
        expect(session.replaceAll()).toBe(0)
        expect(session.store.history).toHaveLength(0)
    })
})

describe('⌘F 分派口（注册表 findReplace）', () => {
    it('executeShortcut 分派 beginFind；开合是会话态不进历史', () => {
        const session = openSession([textLayer({ text: '春' })])
        expect(session.executeShortcut('findReplace')).toBe(true)
        expect(session.store.ui.find.open).toBe(true)
        expect(session.store.history).toHaveLength(0)

        session.closeFind()
        expect(session.executeShortcut('findReplace')).toBe(true)
        expect(session.store.ui.find.open).toBe(true)
    })

    it('无文档时 ⌘F 空转返回 false', () => {
        const session = new EditorSession({ scheduleFrame: nullScheduler })
        expect(session.executeShortcut('findReplace')).toBe(false)
        expect(session.store.ui.find.open).toBe(false)
    })

    it('表格 V1 rows 格内容命中同样可经会话替换（对象面两形态端到端）', () => {
        const session = openSession([
            tableLayer([rowLayer([cellLayer(textLayer({ text: '姓名甲' }))])]),
        ])
        session.beginFind()
        session.setFindQuery('甲')
        session.setFindReplacement('乙')

        expect(session.replaceOne()).toBe(true)
        const table = session.store.doc!.layers[0] as TableLayer
        expect((table.rows[0]!.cells[0]!.content as { text: string }).text).toBe('姓名乙')
    })
})
