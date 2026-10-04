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
import { enumerateRowsPathCandidates, type ExpressionSchemaNode } from '@hankchen/canvas-next-editor'

import type { CompletionSource } from './completion'

export function rowsPathCompletionSource(startSchema: ExpressionSchemaNode | null): CompletionSource | null {
    if (startSchema === null) return null
    return (input) => {
        const result = enumerateRowsPathCandidates(startSchema, input)
        if (result === null) return null
        return {
            partial: result.partial,
            candidates: result.candidates.map((candidate) =>
                candidate.type === 'array' ? { ...candidate, type: '行数组' } : candidate,
            ),
            ...(result.open === true ? { open: true } : {}),
        }
    }
}
