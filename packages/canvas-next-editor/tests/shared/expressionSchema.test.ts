import { afterEach, describe, expect, it, vi } from 'vitest'

import {
    normalizeExpressionSchemaSource,
    parseExpressionSchema,
    resolveRowSchema,
    schemaChildEntries,
    schemaNodeAtPath,
    type ExpressionSchemaNode,
    type ExpressionSchemaParse,
} from '../../src/shared/expressionSchema'

/** 断言编译通过并收窄 ok 分支（诊断面由各用例自行断言） */
function parseOk(raw: unknown): Extract<ExpressionSchemaParse, { ok: true }> {
    const parsed = parseExpressionSchema(raw)
    if (!parsed.ok) throw new Error(`应编译通过：${parsed.reason}: ${parsed.detail}`)
    return parsed
}

/**
 * 数据源 schema 方言编译器（content-completion 工单 02/08，spec §2 D6–D8）：
 * 注入边界一次性转译为内部形状树——结构（properties/items/type）+ 注解
 * （description/title/open）入树；$ref 注入期 deref（内部 #/ 指针，~0/~1/%25
 * 转义，definitions/$defs 命名池不进树）；未识别关键词宽松忽略。
 * 降级分级（D7）：整份拒绝仅根级结构性问题（根非对象/缺 properties 层级/
 * reserved_root_key）；局部故障（断链/外部指针/环引用/目标形态不符）该节点降
 * 叶子 + diagnostics 逐条记录，树其余部分照常服务。零依赖、不引 ajv、零 DOM。
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

    it('校验关键词（required/format/enum 等）与未识别键宽松忽略不报错（工单 08 钉测试防回归）', () => {
        const parsed = parseExpressionSchema({
            $schema: 'http://json-schema.org/draft-07/schema#',
            $id: 'urn:cert',
            type: 'object',
            required: ['orderNo'],
            additionalProperties: false,
            allOf: [{ required: ['x'] }],
            anyOf: [],
            oneOf: [],
            if: {},
            patternProperties: { '^x-': {} },
            properties: {
                orderNo: {
                    type: 'string',
                    minLength: 3,
                    format: 'uuid',
                    enum: ['a', 'b'],
                    const: 'a',
                    'x-vendor-key': { any: 'thing' },
                    description: '订单号',
                },
            },
        })
        expect(parsed.ok).toBe(true)
        if (parsed.ok) expect(parsed.diagnostics).toEqual([])
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

        it('根缺 properties 层级（spec §2：缺 properties 层级 = 形态非法；根级 $ref 不解引用，直接拒绝——拒绝面与现状全等）', () => {
            expect(parseExpressionSchema({ type: 'object' })).toMatchObject({ ok: false, reason: 'invalid_schema' })
            expect(parseExpressionSchema({})).toMatchObject({ ok: false, reason: 'invalid_schema' })
            expect(parseExpressionSchema({ $ref: '#/definitions/payload', definitions: { payload: { type: 'object', properties: {} } } })).toMatchObject({
                ok: false,
                reason: 'invalid_schema',
            })
        })

        it('根 properties 非对象', () => {
            expect(parseExpressionSchema({ properties: 'garbage' })).toMatchObject({ ok: false, reason: 'invalid_schema' })
        })

        // 工单 08 新语义（D7 降级分级）：整份拒绝仅保留根级结构性问题，深层识别
        // 关键词形态不符按宽松忽略处置（节点按剩余已识别字段归一，可能变叶子），
        // 不再整份 invalid_schema——以下两组由「拒绝」按新语义修订。
        it('深层识别关键词形态不符宽松忽略：节点按剩余字段归一（修订自 invalid_schema）', () => {
            const parsed = parseExpressionSchema({
                properties: {
                    a: { items: 'x', type: 'string', description: '仍保留的注解' },
                    b: { type: 3 },
                    c: { type: [1, 2] },
                    d: { description: 9 },
                    e: { title: true, description: '标题形态不符仅丢 title' },
                },
            })
            if (!parsed.ok) throw new Error('深层形态不符应宽松通过')
            expect(parsed.diagnostics).toEqual([]) // 宽松忽略不产诊断（局部故障四类专属）
            expect(parsed.schema.properties?.get('a')).toMatchObject({ type: 'string', description: '仍保留的注解' })
            expect(parsed.schema.properties?.get('a')?.items).toBeUndefined()
            expect(parsed.schema.properties?.get('b')?.type).toBeUndefined()
            expect(parsed.schema.properties?.get('c')?.type).toBeUndefined()
            expect(parsed.schema.properties?.get('d')?.description).toBeUndefined()
            expect(parsed.schema.properties?.get('e')?.title).toBeUndefined()
            expect(parsed.schema.properties?.get('e')?.description).toBe('标题形态不符仅丢 title')
        })

        it('深层 property 值非对象 / properties 非对象：宽松跳过该键（修订自 invalid_schema）', () => {
            const parsed = parseExpressionSchema({
                properties: {
                    broken: 'not-a-node',
                    kept: { type: 'string', description: '兄弟键照常编译' },
                    nested: { properties: 'garbage', description: '深层 properties 断裂降为叶子' },
                },
            })
            if (!parsed.ok) throw new Error('应宽松通过')
            expect(parsed.schema.properties?.has('broken')).toBe(false)
            expect(parsed.schema.properties?.get('kept')).toMatchObject({ type: 'string' })
            const nested = parsed.schema.properties?.get('nested')
            expect(nested?.properties).toBeUndefined()
            expect(nested?.description).toBe('深层 properties 断裂降为叶子')
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

    it('局部故障（D7）：编译成功返回节点树 + 汇总 warn 恰一次（多条诊断并入同一调用）', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const node = normalizeExpressionSchemaSource({
            properties: {
                broken: { $ref: '#/definitions/ghost' },
                outside: { $ref: 'https://example.com/schema.json' },
                kept: { type: 'string', description: '照常编译' },
            },
        })
        expect(node?.properties?.has('kept')).toBe(true) // 树其余部分照常服务
        expect(node?.properties?.get('broken')?.properties).toBeUndefined() // 断链节点降叶子
        expect(warn).toHaveBeenCalledTimes(1)
        const message = String(warn.mock.calls[0]?.[0])
        expect(message).toContain('2 条')
        expect(message).toContain('#/properties/broken')
        expect(message).toContain('broken_ref')
        expect(message).toContain('#/properties/outside')
        expect(message).toContain('external_ref')
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

describe('$ref 注入期 deref（工单 08，D6/D7：目标为基底，本地 description 覆盖）', () => {
    function compile(raw: unknown): ExpressionSchemaNode {
        const parsed = parseOk(raw)
        expect(parsed.diagnostics).toEqual([]) // deref 用例默认无诊断；故障面归降级组专测
        return parsed.schema
    }

    it('嵌套引用（定义内再引用）与内联等价', () => {
        const schema = compile({
            definitions: {
                inner: { type: 'string', description: '内层' },
                outer: { type: 'object', properties: { leaf: { $ref: '#/definitions/inner' } } },
            },
            properties: { org: { $ref: '#/definitions/outer' } },
        })
        expect(schemaNodeAtPath(schema, ['org', 'leaf'])).toMatchObject({ type: 'string', description: '内层' })
    })

    it('前向引用：目标声明在后照样命中（JSON Pointer 导航与声明序无关）', () => {
        const schema = compile({
            definitions: { later: { type: 'number', description: '后声明的定义' } },
            properties: { n: { $ref: '#/definitions/later' } },
        })
        expect(schemaNodeAtPath(schema, ['n'])).toMatchObject({ type: 'number' })
    })

    it('菱形引用：同一目标多处 deref 各自编译，结构与内联等价', () => {
        const schema = compile({
            definitions: { shared: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'number' } } } },
            properties: {
                x: { $ref: '#/definitions/shared' },
                y: { $ref: '#/definitions/shared', description: '第二落点' },
            },
        })
        expect(schemaNodeAtPath(schema, ['x', 'a'])).toMatchObject({ type: 'string' })
        expect(schemaNodeAtPath(schema, ['y', 'b'])).toMatchObject({ type: 'number' })
        expect(schemaNodeAtPath(schema, ['y'])?.description).toBe('第二落点')
    })

    it('转义解码：~1 → /、~0 → ~、%25 → %（先百分号解码再 ~ 反转义）', () => {
        const schema = compile({
            definitions: { 'a/b': { type: 'string' }, 'c~d': { type: 'number' }, 'e%f': { type: 'boolean' } },
            properties: {
                slash: { $ref: '#/definitions/a~1b' },
                tilde: { $ref: '#/definitions/c~0d' },
                percent: { $ref: '#/definitions/e%25f' },
            },
        })
        expect(schemaNodeAtPath(schema, ['slash'])?.type).toBe('string')
        expect(schemaNodeAtPath(schema, ['tilde'])?.type).toBe('number')
        expect(schemaNodeAtPath(schema, ['percent'])?.type).toBe('boolean')
    })

    it('本地 description 覆盖目标同名注解；目标无 description 时叠加', () => {
        const schema = compile({
            definitions: {
                withDesc: { type: 'string', description: '目标描述' },
                noDesc: { type: 'string' },
            },
            properties: {
                over: { $ref: '#/definitions/withDesc', description: '本地描述' },
                add: { $ref: '#/definitions/noDesc', description: '补位描述' },
                pure: { $ref: '#/definitions/withDesc' },
            },
        })
        expect(schemaNodeAtPath(schema, ['over'])).toMatchObject({ type: 'string', description: '本地描述' })
        expect(schemaNodeAtPath(schema, ['add'])).toMatchObject({ type: 'string', description: '补位描述' })
        expect(schemaNodeAtPath(schema, ['pure'])).toMatchObject({ type: 'string', description: '目标描述' })
    })

    it('兄弟结构关键词按 draft-07 语义忽略（仅 description 覆盖偏离）：目标为基底', () => {
        const schema = compile({
            definitions: {
                base: { type: 'object', title: '目标标题', properties: { fromBase: { type: 'string' } } },
            },
            properties: {
                refNode: {
                    $ref: '#/definitions/base',
                    title: '本地标题应被忽略',
                    type: 'string',
                    properties: { fromSibling: { type: 'number' } },
                },
            },
        })
        const node = schemaNodeAtPath(schema, ['refNode'])
        expect(node?.title).toBe('目标标题')
        expect(node?.type).toBe('object')
        expect(schemaNodeAtPath(schema, ['refNode', 'fromBase'])).toMatchObject({ type: 'string' })
        expect(schemaNodeAtPath(schema, ['refNode', 'fromSibling'])).toBeNull()
    })

    it('definitions/$defs 命名池不进候选树（properties 同名键除外）', () => {
        const schema = compile({
            $defs: { v12: { type: 'string' } },
            definitions: { d7: { type: 'string' } },
            properties: { real: { type: 'string' }, definitions: { type: 'string' } },
        })
        expect(schemaChildEntries(schema).map((entry) => entry.key)).toEqual(['real', 'definitions'])
        expect(schemaNodeAtPath(schema, ['d7'])).toBeNull()
        expect(schemaNodeAtPath(schema, ['v12'])).toBeNull()
    })
})

describe('局部故障降级（工单 08，D7：该节点降叶子 + diagnostics 逐条记录，树其余照常服务）', () => {
    it('断链（指针未命中 / 途经非对象）→ 叶子 + broken_ref 诊断', () => {
        const parsed = parseOk({
            definitions: { scalar: { type: 'string' } },
            properties: {
                ghost: { $ref: '#/definitions/ghost', description: '断链注解' },
                through: { $ref: '#/definitions/scalar/deeper' },
            },
        })
        expect(parsed.diagnostics.map((d) => [d.path, d.code] as const)).toEqual([
            ['#/properties/ghost', 'broken_ref'],
            ['#/properties/through', 'broken_ref'],
        ])
        const ghost = parsed.schema.properties?.get('ghost')
        expect(ghost).toMatchObject({ description: '断链注解' }) // 降叶子保留本地注解
        expect(ghost?.properties).toBeUndefined()
        expect(ghost?.items).toBeUndefined()
    })

    it('外部/远程指针（非 #/ 片段）→ external_ref 诊断 + 叶子', () => {
        const parsed = parseOk({
            properties: {
                remote: { $ref: 'https://example.com/schema.json#/definitions/x' },
                sibling: { $ref: 'other-file.json' },
            },
        })
        expect(parsed.diagnostics.map((d) => d.code)).toEqual(['external_ref', 'external_ref'])
        expect(parsed.diagnostics.every((d) => d.path.startsWith('#/properties/'))).toBe(true)
    })

    it('环引用（自引用 / 互引用 / 指向根）→ circular_ref 诊断 + 叶子，树其余照常', () => {
        const selfLoop = parseOk({
            definitions: { loop: { $ref: '#/definitions/loop', type: 'string' } },
            properties: { x: { $ref: '#/definitions/loop' }, ok: { type: 'number' } },
        })
        expect(selfLoop.diagnostics).toHaveLength(1)
        expect(selfLoop.diagnostics[0]).toMatchObject({ code: 'circular_ref' })
        expect(selfLoop.diagnostics[0]?.path).toContain('definitions/loop')
        expect(schemaNodeAtPath(selfLoop.schema, ['x'])?.type).toBe('string') // 降叶子但保留注解
        expect(schemaNodeAtPath(selfLoop.schema, ['ok'])?.type).toBe('number')

        const mutual = parseOk({
            definitions: {
                a: { $ref: '#/definitions/b' },
                b: { $ref: '#/definitions/a' },
            },
            properties: { p: { $ref: '#/definitions/a' } },
        })
        expect(mutual.diagnostics.map((d) => d.code)).toEqual(['circular_ref'])
        const pNode = schemaNodeAtPath(mutual.schema, ['p'])
        expect(pNode?.properties).toBeUndefined() // 互引用环节点降叶子
        expect(pNode?.items).toBeUndefined()

        const rootLoop = parseOk({
            properties: { deep: { properties: { back: { $ref: '#' } } } },
        })
        expect(rootLoop.diagnostics.map((d) => [d.code, d.path])).toEqual([['circular_ref', '#/properties/deep/properties/back']])
    })

    it('目标形态不符（目标非 schema 对象）→ target_shape_mismatch 诊断 + 叶子', () => {
        const parsed = parseOk({
            definitions: { num: 42, arr: [{ type: 'string' }] },
            properties: {
                toNum: { $ref: '#/definitions/num' },
                toArr: { $ref: '#/definitions/arr' },
                kept: { type: 'string', description: '兄弟照常' },
            },
        })
        expect(parsed.diagnostics.map((d) => d.code)).toEqual(['target_shape_mismatch', 'target_shape_mismatch'])
        expect(parsed.schema.properties?.get('kept')).toMatchObject({ type: 'string', description: '兄弟照常' })
    })

    it('非 string $ref 形态 → broken_ref 诊断 + 叶子', () => {
        const parsed = parseOk({ properties: { bad: { $ref: 42 } } })
        expect(parsed.diagnostics.map((d) => d.code)).toEqual(['broken_ref'])
        expect(parsed.schema.properties?.get('bad')?.properties).toBeUndefined()
    })

    it('环引用子树之外的引用照常 deref（活跃路径 seen-set 只判祖先链，菱形不误判）', () => {
        const parsed = parseOk({
            definitions: {
                leafDef: { type: 'string', description: '叶子定义' },
                looper: { $ref: '#/definitions/looper' },
            },
            properties: {
                diamond: { $ref: '#/definitions/leafDef' },
                broken: { $ref: '#/definitions/looper' },
                diamond2: { $ref: '#/definitions/leafDef' },
            },
        })
        expect(parsed.diagnostics.map((d) => d.code)).toEqual(['circular_ref'])
        expect(schemaNodeAtPath(parsed.schema, ['diamond'])?.type).toBe('string')
        expect(schemaNodeAtPath(parsed.schema, ['diamond2'])?.type).toBe('string')
    })
})

describe('title / open 入形状树（工单 08，D8/D10）', () => {
    it('title 透传入树；展示取 description ?? title 归浮层（工单 10）', () => {
        const parsed = parseOk({
            properties: {
                named: { type: 'string', title: '订单编号', description: '扫描件上的编号' },
                titleOnly: { type: 'string', title: '仅标题' },
            },
        })
        expect(parsed.schema.properties?.get('named')).toMatchObject({ title: '订单编号', description: '扫描件上的编号' })
        expect(parsed.schema.properties?.get('titleOnly')).toMatchObject({ title: '仅标题' })
    })

    it('additionalProperties: true 标记 open；false / schema 形态不标', () => {
        const parsed = parseOk({
            properties: {
                openMap: { type: 'object', additionalProperties: true },
                closedMap: { type: 'object', additionalProperties: false },
                schemaMap: { type: 'object', additionalProperties: { type: 'string' } },
                openWithKeys: { type: 'object', additionalProperties: true, properties: { known: { type: 'string' } } },
            },
        })
        expect(parsed.schema.properties?.get('openMap')?.open).toBe(true)
        expect(parsed.schema.properties?.get('closedMap')?.open).toBeUndefined()
        expect(parsed.schema.properties?.get('schemaMap')?.open).toBeUndefined()
        const openWithKeys = parsed.schema.properties?.get('openWithKeys')
        expect(openWithKeys?.open).toBe(true) // 已声明键与开放映射并存（D10：动态键由宿主合入 properties）
        expect(openWithKeys?.properties?.has('known')).toBe(true)
    })
})
