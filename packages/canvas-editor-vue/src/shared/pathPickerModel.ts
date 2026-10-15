/**
 * 路径选择器菜单的候选模型纯函数（resource-expression-single-ref 工单 05，
 * ADR 0020）：级联菜单逐层取候选的数据面——组件只做呈现，取数/过滤/可下钻
 * 判定收口本模块（Node 可测）。
 *
 * - 取层：`source(已积累路径)`。空串取上下文头部候选（枚举器契约：'' = 头部
 *   层）；非空带**单个补全尾点**（`row.` 形态——枚举器的下钻点标记）取该节点
 *   子候选。候选源即面板同款 CompletionSource（expressionContext 适配产物，
 *   根层/行上下文判定复用现成管线）。
 * - kind 过滤：只留 `kind === 'path'`（工单 03 的显式分桶）——函数名建议与
 *   形状分桶调用插入不进资源面（ADR 0020：格式化标量不是数据端备好的资源
 *   引用），不用 filterKey/含 ( 启发式（工单 12 内部约定不作契约）。
 * - 可下钻判定：候选 path 带尾点再取一层，非空 = object/结构节点（点选下钻）；
 *   空 = 叶子（点选提交）。数组节点收敛为叶子（枚举器 D9 语义：具名段下钻
 *   数组静默空串，不给写得出来而渲染空白的表达式）。
 */
import type { CompletionItem, CompletionSource } from './completion'

/** 一条菜单条目：完整点路径 + 候选元信息 + 可下钻判定（drillable = 点选进入下一层，否则点选提交） */
export interface PathPickerEntry {
    /** 提交/下钻的完整点路径（缺 path 的候选不构成条目——选择器的 v-model 面就是它） */
    readonly path: string
    /** 候选元信息（segment/type/description/title，展示回落归组件） */
    readonly item: CompletionItem
    readonly drillable: boolean
}

/** 取一层候选（kind 过滤后）；候选源 null 态（语法错/降级）= 空层 */
export function pathPickerEntries(source: CompletionSource, prefix: string): readonly PathPickerEntry[] {
    const result = source(prefix)
    if (result === null) return []
    const entries: PathPickerEntry[] = []
    for (const item of result.candidates) {
        if (item.kind !== 'path' || item.path === undefined) continue
        entries.push({ path: item.path, item, drillable: isDrillable(source, item.path) })
    }
    return entries
}

/** 节点可下钻判定：path 带尾点取子候选，非空 = 有下一层 */
function isDrillable(source: CompletionSource, path: string): boolean {
    const sub = source(`${path}.`)
    return sub !== null && sub.candidates.some((item) => item.kind === 'path')
}
