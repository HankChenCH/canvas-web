/**
 * 路径选择器候选模型（resource-expression-single-ref 工单 05）：逐层取数 +
 * kind === 'path' 过滤（函数桶不进资源面）+ 可下钻判定。桩源覆盖枚举器在
 * 选择器调用形态（空串头部层 / 尾点下钻层）下不产函数桶的缝隙——过滤契约
 * 本身用显式 kind 桩钉住（ADR 0020：资源面按显式分桶判别，不用启发式）。
 *
 * 终点形态分叉（rows-path-picker 工单 02）：mode 决定可激活/可下钻判定矩阵
 * ——resource 探层推断（现状缺省零改动）；rowsPath 按终点形态标记判定（候选
 * 由源预剪枝，不滤数组条目、不做探层推断）。
 */
import { describe, expect, it } from 'vitest'

import type { CompletionItem, CompletionSource } from '../../src/shared/completion'
import {
    pathPickerEntries,
    pathPickerParentPrefix,
    type PathPickerEntry,
} from '../../src/shared/pathPickerModel'

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

/** 条目矩阵视图：[path, activatable, drillable] */
function matrix(entries: readonly PathPickerEntry[]): Array<[string, boolean, boolean]> {
    return entries.map((entry) => [entry.path, entry.activatable, entry.drillable])
}

describe('pathPickerEntries：终点形态分叉（rows-path-picker 工单 02，spec D3）', () => {
    // rowsPath 形态桩源：候选由源预剪枝（通往行数组的路径），数组终点带 type
    // 'array' 语义标记（rowsPathPickerSource 同款契约），对象中间站无标记。
    // meta 故意探层为空（'meta.' 无键）——钉「rowsPath 按标记判定、不做探层推断」
    const forkedSource = stubSource({
        '': [
            { path: 'order', segment: 'order', kind: 'path' },
            { path: 'meta', segment: 'meta', kind: 'path' },
            { path: 'rows', segment: 'rows', kind: 'path', type: 'array' },
        ],
        'order.': [{ path: 'order.items', segment: 'items', kind: 'path', type: 'array' }],
        // meta./rows. 无键：探层空（前者是剪枝异常形态，后者是数组不展开）
    })

    it('缺省 mode = resource：现状矩阵（探层推断，数组收敛为叶子）零改动', () => {
        expect(matrix(pathPickerEntries(forkedSource, ''))).toEqual([
            ['order', false, true],
            ['meta', true, false],
            ['rows', true, false],
        ])
    })

    it('resource 显式传参与缺省同款', () => {
        expect(pathPickerEntries(forkedSource, '', 'resource')).toEqual(pathPickerEntries(forkedSource, ''))
    })

    it('rowsPath：矩阵按终点形态标记——数组可激活不可下钻（不滤数组条目）、对象只可下钻（探层空也下钻）', () => {
        expect(matrix(pathPickerEntries(forkedSource, '', 'rowsPath'))).toEqual([
            ['order', false, true],
            ['meta', false, true],
            ['rows', true, false],
        ])
    })

    it('rowsPath：下钻层取数同款（尾点形态），子层数组终点可激活', () => {
        expect(matrix(pathPickerEntries(forkedSource, 'order.', 'rowsPath'))).toEqual([
            ['order.items', true, false],
        ])
    })
})

describe('pathPickerParentPrefix：菜单行面包屑前缀（rows-path-picker 工单 06）', () => {
    it('下钻行 = 已积累路径去尾段（点选途中全路径可见的呈现面）', () => {
        expect(pathPickerParentPrefix('order.items')).toBe('order')
        expect(pathPickerParentPrefix('order.items.deep')).toBe('order.items')
        expect(pathPickerParentPrefix('row.name')).toBe('row')
        expect(pathPickerParentPrefix('$root.order')).toBe('$root')
    })

    it('根层行（无父段）= 空串：组件不渲染前缀，呈现维持纯段名不变', () => {
        expect(pathPickerParentPrefix('rows')).toBe('')
        expect(pathPickerParentPrefix('$root')).toBe('')
        expect(pathPickerParentPrefix('')).toBe('')
    })
})
