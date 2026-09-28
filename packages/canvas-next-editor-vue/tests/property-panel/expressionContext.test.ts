/**
 * 补全上下文判定 + 候选源适配测试（content-completion 工单 05，spec §1/§2）。
 *
 * 上下文判定语义对齐 PHP 权威（CanvasHydrator）：行上下文只在模板表实例化
 * 子树内（rowNamespace 注入点），V1 rows 格内容求值走根上下文——row. 行外
 * 是 expression_row_outside_loop 硬错误，候选不给。行 schema 沿路径的每个
 * template 段逐级解析 rowsPath（嵌套模板表行相对取数同门）。
 *
 * Node 无 DOM 纯函数测试（fieldSchema.test.ts 同款环境）；模板文档经内核
 * createTemplateTable 工厂造数（跨包 fixture 直引 @hankchen/canvas-next 在
 * pnpm 隔离下不可解析——decodeGraph 不进本包测试）。
 */
import { describe, expect, it } from 'vitest'

import {
    createTemplateTable,
    parseExpressionSchema,
    type Canvas,
    type ExpressionSchemaNode,
    type LayerPath,
} from '@hankchen/canvas-next-editor'

import { cellLayer, rowLayer, tableLayer, textLayer } from '../../../canvas-next-editor/tests/support/fixtures'
import {
    expressionCompletionSource,
    expressionFieldContext,
} from '../../src/property-panel/expressionContext'

/* ---------------------------------------------------------------- 造数 */

/** 载荷形态 schema（D1：声明即 data 载荷形状）；items 行含嵌套数组 lines 供嵌套表解析 */
const RAW_PAYLOAD_SCHEMA = {
    type: 'object',
    properties: {
        orderNo: { type: 'string', description: '订单编号' },
        order: {
            type: 'object',
            properties: {
                items: {
                    type: 'array',
                    description: '订单行明细',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: '商品名称' },
                            quantity: { type: 'number', description: '数量' },
                            lines: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: { sku: { type: 'string', description: 'SKU' } },
                                },
                            },
                        },
                    },
                },
                totalAmount: { type: 'number', description: '总金额' },
            },
        },
    },
}

function schemaOf(raw: unknown): ExpressionSchemaNode {
    const parsed = parseExpressionSchema(raw)
    if (!parsed.ok) throw new Error(parsed.detail)
    return parsed.schema
}

const SCHEMA = schemaOf(RAW_PAYLOAD_SCHEMA)

/** 根层标记文本 + 模板表（rowsPath = order.items，内核工厂造数） */
const TEMPLATE_DOC: Canvas = {
    width: 800,
    height: 600,
    layers: [textLayer({ text: '{{orderNo}}', expression: '{{orderNo}}' }), createTemplateTable({ rowsPath: 'order.items' })],
}

const TEMPLATE_CONTENT_PATH: LayerPath = ['layers', 1, 'template', 'cells', 0, 'content']
const V1_CONTENT_PATH: LayerPath = ['layers', 0, 'rows', 0, 'cells', 0, 'content']

/* ---------------------------------------------------------------- 上下文判定 */

describe('expressionFieldContext：根/行上下文判定（spec §1 生效面）', () => {
    it('根层三字段 → 根上下文', () => {
        const context = expressionFieldContext(SCHEMA, TEMPLATE_DOC, ['layers', 0])
        expect(context.kind).toBe('root')
        expect(context.rowSchema).toBeNull()
    })

    it('模板格内容层 → 行上下文，rowSchema = rowsPath 数组 items 键树', () => {
        const context = expressionFieldContext(SCHEMA, TEMPLATE_DOC, TEMPLATE_CONTENT_PATH)
        expect(context.kind).toBe('row')
        const segments = context.rowSchema?.properties ? [...context.rowSchema.properties.keys()] : []
        expect(segments).toEqual(['name', 'quantity', 'lines'])
    })

    it('V1 rows 格内容层 → 根上下文（行上下文只在模板实例化子树；row. 行外是填充期硬错误）', () => {
        const v1Doc: Canvas = {
            width: 800,
            height: 600,
            layers: [tableLayer([rowLayer([cellLayer(textLayer())])])],
        }
        const context = expressionFieldContext(SCHEMA, v1Doc, V1_CONTENT_PATH)
        expect(context.kind).toBe('root')
        expect(context.rowSchema).toBeNull()
    })

    it('模板格（非内容层）→ 根上下文（数据字段不渲染，判定兜底一致）', () => {
        const context = expressionFieldContext(SCHEMA, TEMPLATE_DOC, ['layers', 1, 'template', 'cells', 0])
        expect(context.kind).toBe('root')
        expect(context.rowSchema).toBeNull()
    })

    it('rowsPath 无 items 声明 → 行上下文但 rowSchema null（结构头 row 仍给，walker 不抛错）', () => {
        const bare = schemaOf({ type: 'object', properties: { orderNo: { type: 'string' } } })
        const context = expressionFieldContext(bare, TEMPLATE_DOC, TEMPLATE_CONTENT_PATH)
        expect(context.kind).toBe('row')
        expect(context.rowSchema).toBeNull()
    })

    it('doc/path/schema 缺席 → 根上下文（画布级目标无行上下文）', () => {
        expect(expressionFieldContext(SCHEMA, null, ['layers', 0]).kind).toBe('root')
        expect(expressionFieldContext(SCHEMA, TEMPLATE_DOC, null).kind).toBe('root')
    })

    it('嵌套模板表：内层 rowsPath 相对当前行 schema 逐级解析（行相对取数同门）', () => {
        const innerTable = createTemplateTable({ rowsPath: 'lines' })
        const outerTable = createTemplateTable({ rowsPath: 'order.items' })
        // 领域只读面：模板格内容换嵌套表，经铸造收窄后写新建对象的数组位（fixture 造数，非文档编辑路径）
        ;(outerTable.template as unknown as { cells: unknown[] }).cells = [cellLayer(innerTable)]
        const nestedDoc: Canvas = { width: 800, height: 600, layers: [outerTable] }
        const context = expressionFieldContext(
            SCHEMA,
            nestedDoc,
            ['layers', 0, 'template', 'cells', 0, 'content', 'template', 'cells', 0, 'content'],
        )
        expect(context.kind).toBe('row')
        const segments = context.rowSchema?.properties ? [...context.rowSchema.properties.keys()] : []
        expect(segments).toEqual(['sku'])
    })
})

/* ---------------------------------------------------------------- 候选源适配 */

describe('expressionCompletionSource：枚举器适配（CompletionSource 契约）', () => {
    it('schema null → null 源（声明未注入/被拒 = 无补全态）', () => {
        const context = expressionFieldContext(null, TEMPLATE_DOC, TEMPLATE_CONTENT_PATH)
        expect(expressionCompletionSource(null, context)).toBeNull()
    })

    it('根上下文：头部候选 = 载荷顶层键 + $root（无 row/$index）；row. 空候选不给', () => {
        const source = expressionCompletionSource(SCHEMA, expressionFieldContext(SCHEMA, TEMPLATE_DOC, ['layers', 0]))!
        const head = source('')!
        expect(head.partial).toBe('')
        expect(head.candidates.map((c) => c.segment)).toEqual(['orderNo', 'order', '$root'])
        // row. 行外：枚举器给空候选（浮层不开）——不给写得出来但填充期必炸的表达式
        expect(source('row.')!.candidates).toEqual([])
    })

    it('行上下文：头部候选含 row/$index；row. 下钻 items 键树；partial 恒为 expr 后缀', () => {
        const source = expressionCompletionSource(
            SCHEMA,
            expressionFieldContext(SCHEMA, TEMPLATE_DOC, TEMPLATE_CONTENT_PATH),
        )!
        const head = source('')!
        expect(head.candidates.map((c) => c.segment)).toEqual(['orderNo', 'order', '$root', 'row', '$index'])

        const drill = source('row.')!
        expect(drill.partial).toBe('')
        expect(drill.candidates.map((c) => c.path)).toEqual(['row.name', 'row.quantity', 'row.lines'])

        const typing = source('row.na')!
        expect(typing.partial).toBe('na')
        expect(typing.candidates.map((c) => c.segment)).toEqual(['name', 'quantity', 'lines'])
    })

    it('元信息透出：description + 类型徽标（schema 声明原样）', () => {
        const source = expressionCompletionSource(SCHEMA, expressionFieldContext(SCHEMA, TEMPLATE_DOC, ['layers', 0]))!
        const drill = source('order.')!
        const items = drill.candidates.find((c) => c.segment === 'items')
        expect(items).toMatchObject({ path: 'order.items', segment: 'items', description: '订单行明细', type: 'array' })
    })

    it('语法错误片段 → null（无补全态，浮层不开）', () => {
        const source = expressionCompletionSource(SCHEMA, expressionFieldContext(SCHEMA, TEMPLATE_DOC, ['layers', 0]))!
        expect(source('order..')).toBeNull()
    })
})
