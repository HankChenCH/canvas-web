/**
 * rowsPath 点选器候选源组装（rows-path-picker 工单 02）：内核剪枝枚举件
 * enumerateRowsPathPickerEntries → CompletionSource 契约的适配面。枚举语义
 * （D5 剪枝/前缀下钻/空态）归内核件单测（工单 01），此处只钉契约映射——
 * 尾点下钻入参归一、kind 'path' 路径桶、数组终点 type 'array' 语义标记
 * （徽标文案「行数组」归组件呈现层，不进数据契约）、元信息透传、null 起点
 * = null 源、漂移/畸形前缀 = 空候选（空态呈现归组件面）。
 */
import { describe, expect, it } from 'vitest'

import { parseExpressionSchema, type ExpressionSchemaNode } from '@hankchen/canvas-editor'

import { rowsPathPickerSource } from '../../src/shared/rowsPathCompletionSource'

function schemaOf(raw: unknown): ExpressionSchemaNode {
    const parsed = parseExpressionSchema(raw)
    if (!parsed.ok) throw new Error(parsed.detail)
    return parsed.schema
}

const RAW_SCHEMA = {
    type: 'object',
    properties: {
        orderNo: { type: 'string', description: '订单编号' },
        meta: {
            type: 'object',
            title: '元信息',
            properties: { author: { type: 'string' } }, // 无可达数组：D5 剪枝不出现
        },
        rows: {
            type: 'array',
            description: '数据行',
            items: { type: 'object', properties: { name: { type: 'string' } } },
        },
        order: {
            type: 'object',
            properties: {
                items: {
                    type: 'array',
                    items: { type: 'object', properties: { id: { type: 'string' } } },
                },
            },
        },
    },
}

describe('rowsPathPickerSource：契约映射', () => {
    it('null 起点 = null 源（声明为门）', () => {
        expect(rowsPathPickerSource(null)).toBeNull()
    })

    it('头部层（空串）：D5 剪枝候选，kind path 桶 + 数组终点 type array 标记 + 元信息透传', () => {
        const result = rowsPathPickerSource(schemaOf(RAW_SCHEMA))!('')
        expect(result).not.toBeNull()
        expect(result!.partial).toBe('')
        expect(result!.candidates.map((c) => [c.path, c.kind, c.type])).toEqual([
            ['rows', 'path', 'array'],
            ['order', 'path', undefined],
        ])
        expect(result!.candidates[0]!.description).toBe('数据行')
    })

    it('下钻层入参 = 补全尾点形态（order.）：剥尾点对齐枚举件「逐段全量已消费」前缀契约', () => {
        const result = rowsPathPickerSource(schemaOf(RAW_SCHEMA))!('order.')!
        expect(result.candidates.map((c) => [c.path, c.type])).toEqual([['order.items', 'array']])
    })

    it('漂移/数组落点（不展开）/畸形前缀 = 空候选不 null（空态呈现归组件面）', () => {
        const source = rowsPathPickerSource(schemaOf(RAW_SCHEMA))!
        expect(source('drift.')!.candidates).toEqual([])
        expect(source('rows.')!.candidates).toEqual([])
        expect(source('a..b')!.candidates).toEqual([])
    })
})
