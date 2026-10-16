/**
 * rowsPath 点选器候选源组装（rows-path-picker 工单 02）：工单 01 剪枝枚举件
 * （enumerateRowsPathPickerEntries，D5 剪枝至「通往行数组的路径」）包成
 * CompletionSource 注入缝，供 ExpressionPathPicker mode='rowsPath' 消费。无输入
 * 期概念（partial 恒 ''——纯点选不设手输缝，rows-path-picker 工单 05 已退役
 * rows-path-completion 的手输补全源）；数组终点以 **type 'array' 语义标记** 透传
 * ——可激活判定消费归 pathPickerModel rowsPath 矩阵，徽标文案归组件呈现层经
 * ROWS_PATH_ARRAY_BADGE 映射（文案不进数据契约，与内核枚举件的语义标记面一致）；
 * 漂移/畸形前缀/数组落点 = 空候选不 null（空态呈现归组件面，spec D6）。下钻层
 * 入参带补全尾点（CompletionSource 契约 `path.` 形态），剥尾点对齐枚举件「逐段
 * 全量已消费」前缀契约。起点 null = null 源（声明为门）。
 */
import {
    enumerateRowsPathCandidates,
    enumerateRowsPathPickerEntries,
    type ExpressionSchemaNode,
} from '@hankchen/canvas-editor'

import type { CompletionSource } from './completion'

/** 「行数组」徽标展示文案（rowsPath 面的展示词汇单点）：点选器组件徽标映射共用 */
export const ROWS_PATH_ARRAY_BADGE = '行数组'

export function rowsPathPickerSource(startSchema: ExpressionSchemaNode | null): CompletionSource | null {
    if (startSchema === null) return null
    return (input) => {
        const prefix = input.endsWith('.') ? input.slice(0, -1) : input
        const entries = enumerateRowsPathPickerEntries(startSchema, prefix)
        return {
            partial: '',
            candidates: entries.map((entry) => ({
                path: entry.path,
                segment: entry.segment,
                kind: 'path' as const,
                ...(entry.description !== undefined ? { description: entry.description } : {}),
                ...(entry.title !== undefined ? { title: entry.title } : {}),
                ...(entry.isArray ? { type: 'array' } : {}),
            })),
        }
    }
}

/**
 * 已提交 rowsPath 的漂移判定（rows-path-picker 工单 03，spec D2）：属性面板把
 * 「schema 变更后已选路径枚举不出」呈现为回显标红（菜单照常可开可重选），判定
 * 收口此纯函数（Node 可测）。语义按 spec 钉定面复用补全枚举器——
 * `enumerateRowsPathCandidates === null`（途经漂移/数组内下钻/畸形）或终点非数组
 * （标量/对象落点、空值、尾点残形——枚举候选里寻不到该路径的数组终点条目）。
 * 作用于已提交值，无输入期概念；起点 null（未绑声明/判别降级）= 门态不判漂移
 * （弱提示替代标红，D1）。
 */
export function rowsPathValueDrifts(startSchema: ExpressionSchemaNode | null, value: string): boolean {
    if (startSchema === null) return false
    const result = enumerateRowsPathCandidates(startSchema, value)
    if (result === null) return true
    return !result.candidates.some((candidate) => candidate.path === value && candidate.type === 'array')
}
