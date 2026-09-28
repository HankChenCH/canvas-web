import { describe, expect, it } from 'vitest'

import { parseExpressionSchema, type ExpressionSchemaNode } from '../../src/shared/expressionSchema'
import { enumerateExpressionCandidates } from '../../src/shared/expressionCandidates'

/**
 * 候选枚举器（content-completion 工单 02，spec §2 候选枚举规则表，逐条导出自
 * php-canvas-next 求值/填充语义）：
 * - 根上下文（根层三字段）头部候选 = 载荷顶层键（D1：schema 声明即 data 载荷
 *   形状）+ `$root`；行上下文（格内容层）追加 `row` + `$index`（`$index` 仅行
 *   上下文给——行外求值为空串，不给写得出来但无效的表达式）。
 * - 裸键在两种上下文都走根 schema（对齐 CanvasHydrator evaluateNode 的
 *   `$rowNamespace + $root` 合并 + reserved_root_key 无遮蔽保证）。
 * - `row.` 行外不给（求值期 expression_row_outside_loop）→ 空候选。
 * - `.` 下钻走 properties 树；无 properties 节点终止该分支；数组节点 items 键树
 *   下钻（D3，与行上下文同一机制）。
 * - schema null（声明被拒/降级）→ 全部无候选；行 schema 未声明 → 结构头 row
 *   仍在、行子树无候选（辅助声明不作权威）。
 */

const payloadSchemaRaw = {
    type: 'object',
    properties: {
        orderNo: { type: 'string', description: '订单号' },
        customer: {
            type: 'object',
            description: '客户信息',
            properties: {
                name: { type: ['null', 'string'], description: '客户姓名' },
            },
        },
        tags: {
            type: 'array',
            description: '标签列表',
            items: { type: 'object', properties: { label: { type: 'string', description: '标签名' } } },
        },
        remark: { description: '备注（任意值）' },
    },
}

const parsedPayload = parseExpressionSchema(payloadSchemaRaw)
if (!parsedPayload.ok) throw new Error('样例 payload schema 应合法')
const payloadSchema: ExpressionSchemaNode = parsedPayload.schema

const rowSchemaRaw = {
    type: 'object',
    description: '标签行',
    properties: { label: { type: 'string', description: '标签名' }, weight: { type: 'number', description: '权重' } },
}
const parsedRow = parseExpressionSchema(rowSchemaRaw)
if (!parsedRow.ok) throw new Error('样例 row schema 应合法')
const rowSchema: ExpressionSchemaNode = parsedRow.schema

describe('enumerateExpressionCandidates（头部候选分表）', () => {
    it('根上下文：载荷顶层键（声明序）+ $root；不给 row/$index', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr: '' })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.candidates.map((candidate) => candidate.segment)).toEqual([
            'orderNo',
            'customer',
            'tags',
            'remark',
            '$root',
        ])
        expect(result.prefix).toBe('')
        expect(result.partial).toBe('')
    })

    it('行上下文：追加 row + $index（$index 仅行上下文给）', () => {
        const result = enumerateExpressionCandidates(payloadSchema, {
            context: 'row',
            expr: '',
            rowSchema,
        })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.candidates.map((candidate) => candidate.segment)).toEqual([
            'orderNo',
            'customer',
            'tags',
            'remark',
            '$root',
            'row',
            '$index',
        ])
    })

    it('头部候选带 schema 元信息：description + 类型徽标（type 数组归一）', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr: '' })
        if (!result.ok) throw new Error('应枚举成功')
        const orderNo = result.candidates.find((candidate) => candidate.segment === 'orderNo')
        expect(orderNo).toMatchObject({ path: 'orderNo', description: '订单号', type: 'string' })
        const tags = result.candidates.find((candidate) => candidate.segment === 'tags')
        expect(tags).toMatchObject({ path: 'tags', description: '标签列表', type: 'array' })
        const remark = result.candidates.find((candidate) => candidate.segment === 'remark')
        expect(remark).toMatchObject({ path: 'remark', description: '备注（任意值）' })
        expect(remark?.type).toBeUndefined() // 未声明 type → 无徽标数据
    })

    it('头部部分段（如 {{tag）：prefix 为空、partial = 头部名，候选给全量由 UI 按前缀过滤', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'row', expr: 'tag', rowSchema })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.prefix).toBe('')
        expect(result.partial).toBe('tag')
        expect(result.candidates.map((candidate) => candidate.segment)).toContain('tags')
    })

    it('行 schema 未声明：结构头 row/$index 仍给（行数据存在不因声明缺失消失），行子树后续无候选', () => {
        const heads = enumerateExpressionCandidates(payloadSchema, { context: 'row', expr: '' })
        if (!heads.ok) throw new Error('应枚举成功')
        expect(heads.candidates.map((candidate) => candidate.segment)).toContain('row')
        const drill = enumerateExpressionCandidates(payloadSchema, { context: 'row', expr: 'row.' })
        if (!drill.ok) throw new Error('应枚举成功')
        expect(drill.candidates).toEqual([])
    })
})

describe('enumerateExpressionCandidates（点下钻刷新）', () => {
    it('row. → 行键树子候选，path 带 row. 前缀、元信息透出', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'row', expr: 'row.', rowSchema })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.prefix).toBe('row')
        expect(result.partial).toBe('')
        expect(result.candidates).toEqual([
            { path: 'row.label', segment: 'label', description: '标签名', type: 'string' },
            { path: 'row.weight', segment: 'weight', description: '权重', type: 'number' },
        ])
    })

    it('row 多层下钻 + 部分段：row.lab → prefix=row、partial=lab（行键树 label）', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'row', expr: 'row.lab', rowSchema })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.prefix).toBe('row')
        expect(result.partial).toBe('lab')
        expect(result.candidates.map((candidate) => candidate.segment)).toEqual(['label', 'weight'])
    })

    it('裸键下钻走 properties 树：customer. → 子键', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr: 'customer.' })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.candidates).toEqual([{ path: 'customer.name', segment: 'name', description: '客户姓名', type: 'string' }])
    })

    it('裸键在行上下文仍走根 schema（$rowNamespace + $root 合并语义）', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'row', expr: 'customer.', rowSchema })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.candidates.map((candidate) => candidate.path)).toEqual(['customer.name'])
    })

    it('$root. 下钻 = 载荷顶层键，path 带 $root. 前缀', () => {
        for (const context of ['root', 'row'] as const) {
            const result = enumerateExpressionCandidates(payloadSchema, { context, expr: '$root.', rowSchema })
            if (!result.ok) throw new Error('应枚举成功')
            expect(result.prefix).toBe('$root')
            expect(result.candidates.map((candidate) => candidate.path)).toEqual([
                '$root.orderNo',
                '$root.customer',
                '$root.tags',
                '$root.remark',
            ])
        }
    })

    it('D3：数组节点 items 键树下钻（tags. → label，与行上下文同一机制）', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr: 'tags.' })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.candidates).toEqual([{ path: 'tags.label', segment: 'label', description: '标签名', type: 'string' }])
    })

    it('无 properties 节点终止该分支（任意值/标量叶子下钻 = 空候选，不抛错）', () => {
        for (const expr of ['remark.', 'orderNo.', 'customer.name.']) {
            const result = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr })
            expect(result).toMatchObject({ ok: true, candidates: [] })
        }
    })

    it('$index 标量无子候选；头部部分段 $ind 仅行上下文给', () => {
        const drill = enumerateExpressionCandidates(payloadSchema, { context: 'row', expr: '$index.', rowSchema })
        expect(drill).toMatchObject({ ok: true, candidates: [] })
        const rootHeads = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr: '$ind' })
        if (!rootHeads.ok) throw new Error('应枚举成功')
        expect(rootHeads.candidates.map((candidate) => candidate.segment)).not.toContain('$index')
        const rowHeads = enumerateExpressionCandidates(payloadSchema, { context: 'row', expr: '$ind', rowSchema })
        if (!rowHeads.ok) throw new Error('应枚举成功')
        expect(rowHeads.candidates.map((candidate) => candidate.segment)).toContain('$index')
    })

    it('row. 行外不给（求值期 expression_row_outside_loop）→ 空候选', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr: 'row.' })
        expect(result).toMatchObject({ ok: true, candidates: [] })
        const deeper = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr: 'row.label' })
        expect(deeper).toMatchObject({ ok: true, candidates: [] })
    })

    it('partial 恒为 expr 的后缀（接受替换契约：尾点态空后缀、部分段即尾段）', () => {
        const queries = [
            { context: 'row', expr: 'row.', rowSchema },
            { context: 'row', expr: 'row.lab', rowSchema },
            { context: 'row', expr: 'lab', rowSchema },
            { context: 'row', expr: '', rowSchema },
            { context: 'root', expr: '$root.customer.' },
            { context: 'root', expr: '$root.customer.na' },
        ] as const
        for (const query of queries) {
            const result = enumerateExpressionCandidates(payloadSchema, query)
            if (!result.ok) throw new Error('应枚举成功')
            expect(query.expr.endsWith(result.partial), `${query.expr} 的 partial "${result.partial}" 应为后缀`).toBe(true)
        }
    })
})

describe('enumerateExpressionCandidates（语法错误信号）', () => {
    it('路径空段（row..x）/ 孤点（.）→ ok:false expression_syntax_error', () => {
        for (const expr of ['row..x', '.', 'customer..name']) {
            expect(enumerateExpressionCandidates(payloadSchema, { context: 'row', expr, rowSchema })).toEqual({
                ok: false,
                reason: 'expression_syntax_error',
            })
        }
    })
})

describe('enumerateExpressionCandidates（降级态：声明被拒/非法 → 全部无候选）', () => {
    it('schema null：任何 expr 都空候选、不抛错', () => {
        for (const query of [
            { context: 'root', expr: '' },
            { context: 'row', expr: 'row.', rowSchema },
            { context: 'root', expr: '$root.customer.' },
        ] as const) {
            expect(enumerateExpressionCandidates(null, query)).toMatchObject({ ok: true, candidates: [] })
        }
    })

    it('schema 为空声明（properties: {}）：结构头仍在、无键候选', () => {
        const parsed = parseExpressionSchema({ properties: {} })
        if (!parsed.ok) throw new Error('应解析通过')
        const result = enumerateExpressionCandidates(parsed.schema, { context: 'root', expr: '' })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.candidates.map((candidate) => candidate.segment)).toEqual(['$root'])
    })
})

describe('宿主示例信封 schema 的载荷形态用例（评估文档 §1.1）', () => {
    /** SimpleMockDataSource 信封 {id, name, data}——若宿主把信封当 dataset 声明 */
    const envelopeRaw = (withDataProperties: boolean) => ({
        type: 'object',
        properties: {
            id: { type: 'string', description: '数据源 ID' },
            name: { type: 'string', description: '数据源名称' },
            data: withDataProperties
                ? {
                      type: 'object',
                      description: '业务载荷',
                      properties: {
                          orderNo: { type: 'string', description: '订单号' },
                          total: { type: 'number', description: '订单金额' },
                      },
                  }
                : { type: 'object', description: '业务载荷（未声明形状）' },
        },
    })

    it('data 位无 properties：根候选 = 信封三键，data. 之后无下钻（根上下文候选极薄）', () => {
        const parsed = parseExpressionSchema(envelopeRaw(false))
        if (!parsed.ok) throw new Error('应解析通过')
        const heads = enumerateExpressionCandidates(parsed.schema, { context: 'root', expr: '' })
        if (!heads.ok) throw new Error('应枚举成功')
        expect(heads.candidates.map((candidate) => candidate.path)).toEqual(['id', 'name', 'data', '$root'])
        const drill = enumerateExpressionCandidates(parsed.schema, { context: 'root', expr: 'data.' })
        expect(drill).toMatchObject({ ok: true, candidates: [] })
    })

    it('data 位声明具体 properties 后候选有实感：data. 给出载荷键树', () => {
        const parsed = parseExpressionSchema(envelopeRaw(true))
        if (!parsed.ok) throw new Error('应解析通过')
        const drill = enumerateExpressionCandidates(parsed.schema, { context: 'root', expr: 'data.' })
        if (!drill.ok) throw new Error('应枚举成功')
        expect(drill.candidates).toEqual([
            { path: 'data.orderNo', segment: 'orderNo', description: '订单号', type: 'string' },
            { path: 'data.total', segment: 'total', description: '订单金额', type: 'number' },
        ])
    })

    it('D1 推荐形态（载荷直传）：schema 根 = 载荷键，根上下文头部即业务键', () => {
        const parsed = parseExpressionSchema(payloadSchemaRaw)
        if (!parsed.ok) throw new Error('应解析通过')
        const heads = enumerateExpressionCandidates(parsed.schema, { context: 'root', expr: '' })
        if (!heads.ok) throw new Error('应枚举成功')
        expect(heads.candidates.map((candidate) => candidate.segment)).toEqual([
            'orderNo',
            'customer',
            'tags',
            'remark',
            '$root',
        ])
    })
})
