/**
 * rowsPath 候选源组装（rows-path-completion 工单 03/04）：工单 01 枚举器
 * （enumerateRowsPathCandidates，全量合法子项不预过滤）包成 CompletionSource
 * 注入缝，「行数组」徽标文案在此置入（工单 02 钉定的 source 组装位——浮层零
 * 改动，表达式候选的 array 徽标不受牵连）。属性面板（工单 03：起点三分流判别件
 * 先行）与建表表单（工单 04：恒根起点直连）两入口共用同一份映射——工单 03 预留
 * 的抽公共合流点，第二处消费（建表表单）落地时收口至此。
 *
 * 起点 schema null（声明未注入/判别降级）= null 源（D7：静默不弹，手输不受阻）；
 * 枚举走不通（漂移/标量/数组落点）= null 结果，浮层关。
 */
import {
    enumerateRowsPathCandidates,
    enumerateRowsPathPickerEntries,
    type ExpressionSchemaNode,
} from '@hankchen/canvas-editor'

import type { CompletionSource } from './completion'

/** 「行数组」徽标展示文案（rowsPath 面的展示词汇单点）：手输补全源置入与点选器组件徽标映射共用 */
export const ROWS_PATH_ARRAY_BADGE = '行数组'

export function rowsPathCompletionSource(startSchema: ExpressionSchemaNode | null): CompletionSource | null {
    if (startSchema === null) return null
    return (input) => {
        const result = enumerateRowsPathCandidates(startSchema, input)
        if (result === null) return null
        return {
            partial: result.partial,
            candidates: result.candidates.map((candidate) =>
                candidate.type === 'array' ? { ...candidate, type: ROWS_PATH_ARRAY_BADGE } : candidate,
            ),
        }
    }
}

/**
 * rowsPath 点选器候选源组装（rows-path-picker 工单 02）：工单 01 剪枝枚举件
 * （enumerateRowsPathPickerEntries，D5 剪枝至「通往行数组的路径」）包成
 * CompletionSource 注入缝，供 ExpressionPathPicker mode='rowsPath' 消费。与
 * rowsPathCompletionSource（手输补全面）的分叉：无输入期概念（partial 恒 ''）；
 * 数组终点以 **type 'array' 语义标记** 透传——可激活判定消费归 pathPickerModel
 * rowsPath 矩阵，徽标文案归组件呈现层经 ROWS_PATH_ARRAY_BADGE 映射（文案不进
 * 数据契约，与内核枚举件的语义标记面一致）；漂移/畸形前缀/数组落点 = 空候选不
 * null（空态呈现归组件面，spec D6）。下钻层入参带补全尾点（CompletionSource
 * 契约 `path.` 形态），剥尾点对齐枚举件「逐段全量已消费」前缀契约。起点 null =
 * null 源（声明为门）。
 */
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
