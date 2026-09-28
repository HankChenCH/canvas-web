import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Canvas } from '@hankchen/canvas-next'

import { enumerateExpressionCandidates } from '../../src/shared/expressionCandidates'
import { resolveRowSchema } from '../../src/shared/expressionSchema'
import { EditorStore, type EditorChange } from '../../src/session/store'
import { EditorSession, type FrameScheduler } from '../../src/session/editor'

/**
 * 载荷形态样例（D1：schema 声明 = compile(canvas, dataset) 收到的 data 载荷形状）。
 * 键树对齐 playground 演示 graph 的表达式（{{orderNo}}/{{assets.banner}}、行上下文
 * {{row.name}} 等，rowsPath = order.items），供注入缝 → 枚举器链路断言。
 */
const sampleSchema = {
    type: 'object',
    properties: {
        orderNo: { type: 'string', description: '订单编号' },
        assets: {
            type: 'object',
            description: '静态资源表',
            properties: { banner: { type: 'string', description: '头图 URL' } },
        },
        order: {
            type: 'object',
            description: '订单聚合对象',
            properties: {
                items: {
                    type: 'array',
                    description: '行明细数组（rowsPath 指向）',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: '商品名' },
                            avatar: { type: 'string', description: '商品图' },
                            code: { type: 'string', description: '条码' },
                        },
                    },
                },
            },
        },
    },
}

const doc = (): Canvas => ({ width: 100, height: 80, layers: [] })

/** 手动帧调度器：捕获回调不入队执行，观察「是否调度过帧」 */
function manualScheduler(): FrameScheduler & { pending: () => boolean } {
    let queued: (() => void) | null = null
    return Object.assign(
        (cb: () => void) => {
            queued = cb
            return () => {
                queued = null
            }
        },
        { pending: () => queued !== null },
    )
}

describe('EditorStore ui 分支：dataSourceSchema（content-completion 工单 03）', () => {
    it('初始为 null（未注入声明 = 无候选降级态）', () => {
        const store = new EditorStore()
        expect(store.ui.dataSourceSchema).toBeNull()
    })

    it('setDataSourceSchema 替换声明并以 {scope: ui, branch: dataSourceSchema} 通知', () => {
        const store = new EditorStore()
        const node = { properties: new Map() }
        const changes: EditorChange[] = []
        store.subscribe((c) => changes.push(c))

        store.setDataSourceSchema(node)
        expect(store.ui.dataSourceSchema).toBe(node)
        expect(changes).toEqual([{ scope: 'ui', branch: 'dataSourceSchema' }])
    })

    it('同引用短路不通知（重复注入同一归一产物不惊动订阅方）', () => {
        const store = new EditorStore()
        const node = { properties: new Map() }
        store.setDataSourceSchema(node)
        const listener = vi.fn()
        store.subscribe(listener)

        store.setDataSourceSchema(node)
        expect(listener).not.toHaveBeenCalled()
    })

    it('openDocument 换文档不重置声明（会话级声明随会话，不随文档）', () => {
        const store = new EditorStore()
        const node = { properties: new Map() }
        store.setDataSourceSchema(node)

        store.openDocument(doc())
        expect(store.ui.dataSourceSchema).toBe(node)
    })
})

describe('EditorSession.setDataSourceSchema 注入缝（D2 宿主随会话注入）', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('合法声明经 normalizeExpressionSchemaSource 收口为归一节点并通知', () => {
        const session = new EditorSession({ scheduleFrame: manualScheduler() })
        session.setDataSourceSchema(sampleSchema)

        const schema = session.store.ui.dataSourceSchema
        expect(schema).not.toBeNull()
        expect([...schema!.properties!.keys()]).toEqual(['orderNo', 'assets', 'order'])
        expect(schema!.properties!.get('orderNo')?.description).toBe('订单编号')
    })

    it('保留键声明（reserved_root_key）降级为 null + console 警告，不抛错', () => {
        const session = new EditorSession({ scheduleFrame: manualScheduler() })
        expect(() => session.setDataSourceSchema({ properties: { row: { type: 'object' } } })).not.toThrow()

        expect(session.store.ui.dataSourceSchema).toBeNull()
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('reserved_root_key'))
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('row'))
    })

    it('形态非法声明（缺 properties 层级）降级为 null + console 警告', () => {
        const session = new EditorSession({ scheduleFrame: manualScheduler() })
        session.setDataSourceSchema({ type: 'object' })

        expect(session.store.ui.dataSourceSchema).toBeNull()
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('invalid_schema'))
    })

    it('null/undefined = 清除声明，不告警', () => {
        const session = new EditorSession({ scheduleFrame: manualScheduler() })
        session.setDataSourceSchema(sampleSchema)
        expect(session.store.ui.dataSourceSchema).not.toBeNull()

        session.setDataSourceSchema(null)
        expect(session.store.ui.dataSourceSchema).toBeNull()
        expect(console.warn).not.toHaveBeenCalled()
    })

    it('注入不落文档：doc 引用不变、零 doc 通知、零历史步（声明态零写文档）', () => {
        const session = new EditorSession({ scheduleFrame: manualScheduler() })
        const document = doc()
        session.openDocument(document)
        const changes: EditorChange[] = []
        session.subscribe((c) => changes.push(c))

        session.setDataSourceSchema(sampleSchema)
        expect(session.store.doc).toBe(document)
        expect(changes.every((c) => c.scope === 'ui')).toBe(true)
        expect(session.canUndo).toBe(false)
    })

    it('注入不触发重绘（声明不触达像素，补全候选归绑定层消费）', () => {
        const scheduler = manualScheduler()
        const session = new EditorSession({ scheduleFrame: scheduler })
        session.setDataSourceSchema(sampleSchema)
        expect(scheduler.pending()).toBe(false)
    })
})

describe('注入缝 → 候选枚举器链路（store 声明态即枚举入参）', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('注入样例声明后，根上下文头部候选 = 载荷顶层键（声明序）+ $root', () => {
        const session = new EditorSession({ scheduleFrame: manualScheduler() })
        session.setDataSourceSchema(sampleSchema)

        const result = enumerateExpressionCandidates(session.store.ui.dataSourceSchema, { context: 'root', expr: '' })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.candidates.map((c) => c.path)).toEqual(['orderNo', 'assets', 'order', '$root'])
        expect(result.candidates[0]?.description).toBe('订单编号')
    })

    it('行上下文按 rowsPath 下钻：row.items 键树 + $index，description 透出', () => {
        const session = new EditorSession({ scheduleFrame: manualScheduler() })
        session.setDataSourceSchema(sampleSchema)
        const schema = session.store.ui.dataSourceSchema!
        const rowSchema = resolveRowSchema(schema, 'order.items')

        const result = enumerateExpressionCandidates(schema, { context: 'row', expr: 'row.', rowSchema })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.candidates.map((c) => c.path)).toEqual(['row.name', 'row.avatar', 'row.code'])
        expect(result.candidates[0]?.description).toBe('商品名')
    })

    it('非法声明注入后枚举恒无候选（降级态全程不惊动调用方）', () => {
        const session = new EditorSession({ scheduleFrame: manualScheduler() })
        session.setDataSourceSchema({ properties: { row: { type: 'object' } } })
        expect(console.warn).toHaveBeenCalled()

        const result = enumerateExpressionCandidates(session.store.ui.dataSourceSchema, { context: 'root', expr: '' })
        expect(result).toEqual({ ok: true, prefix: '', partial: '', candidates: [] })
    })
})
