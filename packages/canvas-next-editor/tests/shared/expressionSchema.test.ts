import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    normalizeExpressionSchemaSource,
    parseExpressionSchema,
    resolveRowSchema,
    schemaChildEntries,
    schemaNodeAtPath,
    type ExpressionSchemaNode,
} from '../../src/shared/expressionSchema'

/**
 * 数据源 schema 子集 walker（content-completion 工单 02，spec §2）：
 * 仅 properties/items/type/description 四关键词，零依赖、不引 ajv，校验关键词忽略。
 * 声明期校验：根级键 row/$ 前缀 = reserved_root_key 拒绝（前移填充期硬错误，
 * CanvasHydrator::assertReservedRootKeys）；形态非法 = invalid_schema 降级信号。
 * D3 钉定：数组类型节点 items 键树下钻（与行上下文候选同一机制）。
 */

/** 端上常用声明样例（载荷形态，D1：schema 声明即 data 载荷形状） */
const payloadSchema = {
    type: 'object',
    properties: {
        orderNo: { type: 'string', description: '订单号' },
        customer: {
            type: 'object',
            description: '客户信息',
            properties: {
                name: { type: 'string', description: '客户姓名' },
                address: { type: 'object', properties: { city: { type: 'string', description: '所在城市' } } },
            },
        },
        tags: { type: 'array', description: '标签列表', items: { type: 'object', properties: { label: { type: 'string', description: '标签名' } } } },
        remark: { description: '备注（任意值，无 properties）' },
    },
}

describe('parseExpressionSchema（声明期校验 + 归一化）', () => {
    it('合法声明归一化为节点树：properties 成为 Map（保留声明序），type/description 透传', () => {
        const parsed = parseExpressionSchema(payloadSchema)
        if (!parsed.ok) throw new Error(`应解析通过：${parsed.reason}`)
        const root = parsed.schema
        expect([...(root.properties?.keys() ?? [])]).toEqual(['orderNo', 'customer', 'tags', 'remark'])
        expect(root.type).toBe('object')
        expect(root.properties?.get('orderNo')).toMatchObject({ type: 'string', description: '订单号' })
        expect(root.properties?.get('tags')?.items?.properties?.get('label')).toMatchObject({
            type: 'string',
            description: '标签名',
        })
    })

    it('type 数组形态归一为主类型（首个非 null；未声明为 undefined）', () => {
        const parsed = parseExpressionSchema({
            properties: {
                a: { type: ['null', 'string'] },
                b: { type: ['string', 'number'] },
                c: { type: 'number' },
                d: {},
                e: { type: [''] },
            },
        })
        if (!parsed.ok) throw new Error('应解析通过')
        expect(parsed.schema.properties?.get('a')?.type).toBe('string')
        expect(parsed.schema.properties?.get('b')?.type).toBe('string')
        expect(parsed.schema.properties?.get('c')?.type).toBe('number')
        expect(parsed.schema.properties?.get('d')?.type).toBeUndefined()
        expect(parsed.schema.properties?.get('e')?.type).toBeUndefined() // 空串类型不出口成徽标
    })

    it('校验关键词（required/additionalProperties/format 等）忽略不报错', () => {
        const parsed = parseExpressionSchema({
            type: 'object',
            required: ['orderNo'],
            additionalProperties: false,
            properties: {
                orderNo: { type: 'string', minLength: 3, format: 'uuid', description: '订单号' },
            },
        })
        expect(parsed.ok).toBe(true)
    })

    describe('reserved_root_key 拒绝（根级键 row / $ 前缀，前移填充期硬错误）', () => {
        it('根级键恰为 row', () => {
            const parsed = parseExpressionSchema({ properties: { row: { type: 'string' } } })
            expect(parsed).toMatchObject({ ok: false, reason: 'reserved_root_key' })
            if (!parsed.ok) expect(parsed.detail).toContain('row')
        })

        it('根级键 $ 前缀（$index/$root/自定义 $ 名）', () => {
            for (const key of ['$index', '$root', '$order']) {
                const parsed = parseExpressionSchema({ properties: { [key]: { type: 'string' } } })
                expect(parsed).toMatchObject({ ok: false, reason: 'reserved_root_key' })
            }
        })

        it('嵌套层同名键合法（仅根级保留，对齐 assertReservedRootKeys 只查根）', () => {
            const parsed = parseExpressionSchema({
                properties: { meta: { type: 'object', properties: { row: { type: 'string' }, $deep: { type: 'number' } } } },
            })
            expect(parsed.ok).toBe(true)
        })
    })

    describe('invalid_schema（形态非法 → 降级信号，宿主自行 console 警告收口）', () => {
        it('非对象根：null/数组/字符串/数字/布尔', () => {
            for (const raw of [null, [], 'schema', 42, true]) {
                expect(parseExpressionSchema(raw)).toMatchObject({ ok: false, reason: 'invalid_schema' })
            }
        })

        it('根缺 properties 层级（spec §2：缺 properties 层级 = 形态非法）', () => {
            expect(parseExpressionSchema({ type: 'object' })).toMatchObject({ ok: false, reason: 'invalid_schema' })
            expect(parseExpressionSchema({})).toMatchObject({ ok: false, reason: 'invalid_schema' })
        })

        it('根 properties 非对象', () => {
            expect(parseExpressionSchema({ properties: 'garbage' })).toMatchObject({ ok: false, reason: 'invalid_schema' })
        })

        it('嵌套 property 值非对象（properties 层级断裂）', () => {
            expect(parseExpressionSchema({ properties: { broken: 'not-a-node' } })).toMatchObject({
                ok: false,
                reason: 'invalid_schema',
            })
        })

        it('items / type / description 关键词形态非法', () => {
            expect(parseExpressionSchema({ properties: { a: { items: 'x' } } })).toMatchObject({ ok: false, reason: 'invalid_schema' })
            expect(parseExpressionSchema({ properties: { a: { type: 3 } } })).toMatchObject({ ok: false, reason: 'invalid_schema' })
            expect(parseExpressionSchema({ properties: { a: { type: [1, 2] } } })).toMatchObject({ ok: false, reason: 'invalid_schema' })
            expect(parseExpressionSchema({ properties: { a: { description: 9 } } })).toMatchObject({ ok: false, reason: 'invalid_schema' })
        })
    })
})

describe('normalizeExpressionSchemaSource（注入缝收口：拒绝/降级 → null + console 警告，不抛错）', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('合法声明原样归一化', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const node = normalizeExpressionSchemaSource(payloadSchema)
        expect(node?.properties?.has('orderNo')).toBe(true)
        expect(warn).not.toHaveBeenCalled()
    })

    it('非法形态 → null + console.warn（含原因；不抛错）', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        expect(normalizeExpressionSchemaSource('garbage')).toBeNull()
        expect(warn).toHaveBeenCalledTimes(1)
        expect(String(warn.mock.calls[0]?.[0])).toContain('invalid_schema')
    })

    it('reserved_root_key → null + console.warn（消息含保留键名）', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        expect(normalizeExpressionSchemaSource({ properties: { row: { type: 'string' } } })).toBeNull()
        expect(warn).toHaveBeenCalledTimes(1)
        expect(String(warn.mock.calls[0]?.[0])).toContain('reserved_root_key')
        expect(String(warn.mock.calls[0]?.[0])).toContain('row')
    })
})

describe('schemaNodeAtPath（点路径下钻 walker）', () => {
    const parsed = parseExpressionSchema(payloadSchema)
    if (!parsed.ok) throw new Error('样例 schema 应合法')
    const schema: ExpressionSchemaNode = parsed.schema

    it('空 segments = 节点本身', () => {
        expect(schemaNodeAtPath(schema, [])).toBe(schema)
    })

    it('逐段下钻 properties 树', () => {
        expect(schemaNodeAtPath(schema, ['customer', 'address', 'city'])).toMatchObject({
            type: 'string',
            description: '所在城市',
        })
    })

    it('未声明段 / 叶子继续下钻 = null（该分支终止，不抛错）', () => {
        expect(schemaNodeAtPath(schema, ['ghost'])).toBeNull()
        expect(schemaNodeAtPath(schema, ['customer', 'ghost'])).toBeNull()
        expect(schemaNodeAtPath(schema, ['orderNo', 'deeper'])).toBeNull() // 标量叶子
        expect(schemaNodeAtPath(schema, ['remark', 'deeper'])).toBeNull() // 无 properties 的任意值节点
    })

    it('D3：数组节点 items 键树下钻（与行上下文同一机制）', () => {
        expect(schemaNodeAtPath(schema, ['tags', 'label'])).toMatchObject({ type: 'string', description: '标签名' })
    })

    it('properties 已声明但段未命中不回退 items（对象形态声明优先）', () => {
        const parsed2 = parseExpressionSchema({
            properties: {
                mixed: {
                    type: 'object',
                    properties: { known: { type: 'string' } },
                    items: { properties: { fromItems: { type: 'string' } } },
                },
            },
        })
        if (!parsed2.ok) throw new Error('应解析通过')
        expect(schemaNodeAtPath(parsed2.schema, ['mixed', 'ghost'])).toBeNull()
        expect(schemaNodeAtPath(parsed2.schema, ['mixed', 'known'])).not.toBeNull()
    })
})

describe('schemaChildEntries（一层子候选枚举）', () => {
    const parsed = parseExpressionSchema(payloadSchema)
    if (!parsed.ok) throw new Error('样例 schema 应合法')
    const schema = parsed.schema

    it('对象节点：properties 子项按声明序', () => {
        expect(schemaChildEntries(schema).map((entry) => entry.key)).toEqual(['orderNo', 'customer', 'tags', 'remark'])
    })

    it('D3：数组节点呈现 items 键树（行上下文同一机制）', () => {
        const tags = schemaNodeAtPath(schema, ['tags'])
        if (!tags) throw new Error('tags 节点应存在')
        expect(schemaChildEntries(tags).map((entry) => entry.key)).toEqual(['label'])
    })

    it('叶子（无 properties 无 items）= 无子候选', () => {
        const remark = schemaNodeAtPath(schema, ['remark'])
        if (!remark) throw new Error('remark 节点应存在')
        expect(schemaChildEntries(remark)).toEqual([])
        expect(schemaChildEntries(schemaNodeAtPath(schema, ['orderNo']) as ExpressionSchemaNode)).toEqual([])
    })

    it('items 本身也无 properties（数组的数组/任意元素）= 无子候选', () => {
        const parsed2 = parseExpressionSchema({ properties: { loose: { type: 'array', items: { type: 'string' } } } })
        if (!parsed2.ok) throw new Error('应解析通过')
        const loose = schemaNodeAtPath(parsed2.schema, ['loose'])
        if (!loose) throw new Error('loose 节点应存在')
        expect(schemaChildEntries(loose)).toEqual([])
        expect(schemaNodeAtPath(parsed2.schema, ['loose', 'anything'])).toBeNull()
    })

    it('数组的数组：items 链穿透对称——下钻与子候选枚举同一机制', () => {
        const parsed2 = parseExpressionSchema({
            properties: { matrix: { type: 'array', items: { type: 'array', items: { properties: { label: { type: 'string' } } } } } },
        })
        if (!parsed2.ok) throw new Error('应解析通过')
        const matrix = schemaNodeAtPath(parsed2.schema, ['matrix'])
        if (!matrix) throw new Error('matrix 节点应存在')
        expect(schemaChildEntries(matrix).map((entry) => entry.key)).toEqual(['label'])
        expect(schemaNodeAtPath(parsed2.schema, ['matrix', 'label'])?.type).toBe('string')
    })
})

describe('resolveRowSchema（rowsPath → 行键树，行上下文候选机制本体）', () => {
    const parsed = parseExpressionSchema(payloadSchema)
    if (!parsed.ok) throw new Error('样例 schema 应合法')
    const schema = parsed.schema

    it('rowsPath 指向数组节点 → 取其 items 为行键树', () => {
        const row = resolveRowSchema(schema, 'tags')
        expect(row).not.toBeNull()
        expect(row?.properties?.has('label')).toBe(true)
    })

    it('rowsPath 多段下钻', () => {
        const parsed2 = parseExpressionSchema({
            properties: { order: { type: 'object', properties: { lines: { type: 'array', items: { properties: { sku: { type: 'string' } } } } } } },
        })
        if (!parsed2.ok) throw new Error('应解析通过')
        expect(resolveRowSchema(parsed2.schema, 'order.lines')?.properties?.has('sku')).toBe(true)
    })

    it('rowsPath 指向非数组节点（无 items）/ 未命中 → null（行子树无候选）', () => {
        expect(resolveRowSchema(schema, 'orderNo')).toBeNull()
        expect(resolveRowSchema(schema, 'ghost')).toBeNull()
    })

    it('非法 rowsPath（空段）→ null', () => {
        expect(resolveRowSchema(schema, '')).toBeNull()
        expect(resolveRowSchema(schema, 'order..lines')).toBeNull()
        expect(resolveRowSchema(schema, '.lines')).toBeNull()
    })
})
