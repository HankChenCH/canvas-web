/**
 * 路径选择器菜单的候选模型纯函数（resource-expression-single-ref 工单 05，
 * ADR 0020）：级联菜单逐层取候选的数据面——组件只做呈现，取数/过滤/判定
 * 收口本模块（Node 可测）。
 *
 * - 取层：`source(已积累路径)`。空串取上下文头部候选（枚举器契约：'' = 头部
 *   层）；非空带**单个补全尾点**（`row.` 形态——枚举器的下钻点标记）取该节点
 *   子候选。候选源即面板同款 CompletionSource（expressionContext 适配产物，
 *   根层/行上下文判定复用现成管线）。
 * - kind 过滤（两 mode 同款）：只留 `kind === 'path'`（工单 03 的显式分桶）
 *   ——函数名建议与形状分桶调用插入不进选择器面（ADR 0020：格式化标量不是
 *   数据端备好的资源引用），不用 filterKey/含 ( 启发式（工单 12 内部约定不作
 *   契约）。
 * - 终点形态分叉（rows-path-picker 工单 02，spec D3/Q4-A）：mode 决定可激活/
 *   可下钻判定矩阵——
 *   · 'resource'（缺省，资源面现状零改动）：探层推断——候选 path 带尾点再取
 *     一层，非空 = object/结构节点（点选下钻、不可激活）；空 = 叶子（点选提
 *     交）。数组节点收敛为叶子（枚举器 D9 语义：具名段下钻数组静默空串，不
 *     给写得出来而渲染空白的表达式）。
 *   · 'rowsPath'（取行路径面）：候选由源预剪枝（rowsPathPickerSource → 内核
 *     enumerateRowsPathPickerEntries，D5 剪枝至「通往行数组的路径」），判定
 *     按条目终点形态标记（CompletionItem.type === 'array'——内核枚举件同款
 *     语义标记）：数组终点可激活不可下钻（数组条目保留在候选面、不做探层二
 *     次推断），对象中间站只可下钻不可激活（D3：数组是唯一可点终点）。「行
 *     数组」徽标文案归组件呈现层映射，不进数据契约。
 * - 面包屑前缀（rows-path-picker 工单 06，纯呈现派生）：菜单行在段名前弱化
 *   显示已积累路径——pathPickerParentPrefix(path) = path 去尾段（`order.items`
 *   → 'order'），根层行（无父段）空串不渲染前缀；分隔符单点常量
 *   PATH_PICKER_BREADCRUMB_SEPARATOR 同住此处（展示词汇单点，两 mode 级联壳
 *   同享）。拆分呈现归组件模板（前缀 truncate、段名 shrink-0 尾段恒可见）。
 */
import type { CompletionItem, CompletionSource } from './completion'

/** 选择器终点形态（rows-path-picker 工单 02）：'resource' = 叶子终点（缺省），'rowsPath' = 数组终点 */
export type PathPickerMode = 'resource' | 'rowsPath'

/** 一条菜单条目：完整点路径 + 候选元信息 + 终点形态判定（两 mode 矩阵见模块头） */
export interface PathPickerEntry {
    /** 提交/下钻的完整点路径（缺 path 的候选不构成条目——选择器的 v-model 面就是它） */
    readonly path: string
    /** 候选元信息（segment/type/description/title，展示回落归组件） */
    readonly item: CompletionItem
    /** 点选下钻进入下一层（resource = 探层非空；rowsPath = 对象中间站） */
    readonly drillable: boolean
    /** 点选提交（resource = 叶子即 !drillable；rowsPath = 数组终点，D3 唯一可点终点） */
    readonly activatable: boolean
}

/** 取一层候选（kind 过滤后，mode 定可激活/可下钻判定矩阵）；候选源 null 态（语法错/降级）= 空层 */
export function pathPickerEntries(
    source: CompletionSource,
    prefix: string,
    mode: PathPickerMode = 'resource',
): readonly PathPickerEntry[] {
    const result = source(prefix)
    if (result === null) return []
    const entries: PathPickerEntry[] = []
    for (const item of result.candidates) {
        if (item.kind !== 'path' || item.path === undefined) continue
        entries.push(mode === 'rowsPath' ? rowsPathEntry(item.path, item) : resourceEntry(source, item.path, item))
    }
    return entries
}

/** resource 矩阵：探层推断——带尾点取子层非空 = 可下钻（不可激活），叶子可提交（数组收敛为叶子） */
function resourceEntry(source: CompletionSource, path: string, item: CompletionItem): PathPickerEntry {
    const drillable = isDrillable(source, path)
    return { path, item, drillable, activatable: !drillable }
}

/** rowsPath 矩阵：候选由源预剪枝，按终点形态标记判定——数组终点可激活，对象中间站只可下钻 */
function rowsPathEntry(path: string, item: CompletionItem): PathPickerEntry {
    const activatable = item.type === 'array'
    return { path, item, drillable: !activatable, activatable }
}

/** 节点可下钻判定（resource 面）：path 带尾点取子候选，非空 = 有下一层 */
function isDrillable(source: CompletionSource, path: string): boolean {
    const sub = source(`${path}.`)
    return sub !== null && sub.candidates.some((item) => item.kind === 'path')
}

/** 菜单行面包屑分隔符（工单 06 展示词汇单点）：前缀与现段名之间的连接符 */
export const PATH_PICKER_BREADCRUMB_SEPARATOR = '›'

/**
 * 菜单行面包屑前缀（工单 06）：path 去尾段——下钻行在段名前弱化显示已积累
 * 路径（点选途中完整落点随时可见），根层行（无父段）空串（组件不渲染前缀，
 * 呈现维持纯段名不变）。纯派生 Node 可测，拆分呈现归组件模板。
 */
export function pathPickerParentPrefix(path: string): string {
    const cut = path.lastIndexOf('.')
    return cut === -1 ? '' : path.slice(0, cut)
}
