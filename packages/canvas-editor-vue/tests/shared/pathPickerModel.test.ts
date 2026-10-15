/**
 * 路径选择器候选模型（resource-expression-single-ref 工单 05）：逐层取数 +
 * kind === 'path' 过滤（函数桶不进资源面）+ 可下钻判定。桩源覆盖枚举器在
 * 选择器调用形态（空串头部层 / 尾点下钻层）下不产函数桶的缝隙——过滤契约
 * 本身用显式 kind 桩钉住（ADR 0020：资源面按显式分桶判别，不用启发式）。
 */
import { describe, expect, it } from 'vitest'

import type { CompletionItem, CompletionSource } from '../../src/shared/completion'
import { pathPickerEntries } from '../../src/shared/pathPickerModel'

/** 桩源：手工清单（调用签名 → 候选），带 kind 维度全形态 */
function stubSource(levels: Record<string, readonly CompletionItem[]>): CompletionSource {
    return (expr) => {
        const candidates = levels[expr]
        if (candidates === undefined) return null
        return { partial: '', candidates }
    }
}

describe('pathPickerEntries：kind 过滤（函数桶不出现——验收项）', () => {
    const source = stubSource({
        '': [
            { path: 'orderNo', segment: 'orderNo', kind: 'path', type: 'string' },
            // 函数名建议（工单 12 形态）：资源面必须过滤
            { path: 'date()', segment: 'date()', kind: 'function', type: '函数' },
            // 形状分桶调用插入（工单 12 形态）：资源面必须过滤
            { path: 'ceil(amount)', segment: 'ceil(amount)', kind: 'function', filterKey: 'amount', type: '函数' },
            // date 格式快捷项（缺省桶）：同样不进资源面
            { path: 'Y-m-d', segment: 'Y-m-d', type: '格式' },
        ],
    })

    it('只留 kind === "path" 的候选', () => {
        expect(pathPickerEntries(source, '').map((entry) => entry.path)).toEqual(['orderNo'])
    })
})

describe('pathPickerEntries：取层与可下钻判定', () => {
    const source = stubSource({
        '': [
            { path: 'order', segment: 'order', kind: 'path', type: 'object' },
            { path: '$root', segment: '$root', kind: 'path' },
        ],
        'order.': [{ path: 'order.items', segment: 'items', kind: 'path', type: 'array' }],
        '$root.': [
            { path: 'orderNo', segment: 'orderNo', kind: 'path' },
            { path: 'order', segment: 'order', kind: 'path' },
        ],
        // 数组节点（枚举器 D9：收敛为叶子无具名子候选）
        'order.items.': [],
    })

    it('头部层（空串）取根候选，object/结构节点标 drillable', () => {
        const entries = pathPickerEntries(source, '')
        expect(entries.map((entry) => [entry.path, entry.drillable])).toEqual([
            ['order', true],
            ['$root', true],
        ])
    })

    it('下钻层（尾点）取子候选；叶子（数组/标量）drillable=false', () => {
        expect(pathPickerEntries(source, 'order.').map((entry) => [entry.path, entry.drillable])).toEqual([
            ['order.items', false],
        ])
        expect(pathPickerEntries(source, '$root.').map((entry) => entry.path)).toEqual(['orderNo', 'order'])
    })

    it('候选源 null 态（降级/语法错）= 空层不抛', () => {
        expect(pathPickerEntries(stubSource({}), 'nope.')).toEqual([])
    })
})
