/**
 * rowsPath（取行路径）候选枚举器 + 起点三分流判别（rows-path-completion 工单 01，
 * spec §2 候选规则 + §4.1 落位 D9）。
 *
 * 候选规则逐条导出自水合语义（CanvasHydrator::hydrateTemplateNode，只读对齐）：
 * rowsPath 点路径自起点 schema 逐段下钻，终点必须是行数组——
 * - object 子段 = 可继续下钻的中间站候选（无徽标数据）；array 子段（type 声明为
 *   array 或声明了 items）= 合法终点候选，type 徽标数据恒 'array'（「行数组」展示
 *   文案归后续组装面，浮层零改动）；标量子段不出候选（怂恿无效路径即怂恿
 *   rows_path_invalid）。
 * - 数组内不下钻：具名段穿数组在水合端无意义（navigateRows 对列表键不命中），
 *   完成段任一落点为数组/标量 → null——数组之下不再产出任何候选（「枚举为空」
 *   以走不通同款收口：无补全态、浮层关闭、手输不受阻不阻断），与声明漂移/缺失
 *   同款，全程不抛错。开放映射信号面（D10）已随契约废除移除（ADR 0020）——
 *   schema 解析边界显式拒绝后，无 properties 的对象节点按标量判别（不可导航）。
 * - 候选给当前层全量合法子项、不按 partial 预过滤（前缀过滤归工单 02 浮层面，与
 *   表达式枚举器分工同款）；单尾点 = 剥点列全量子段；partial 恒为输入串后缀。
 * - 元信息：path（起点相对完整点路径）+ description/title 两字段分离透传（展示
 *   回落 description ?? title 归浮层）+ type 徽标数据。
 *
 * 与 expressionCandidates（content-completion D9）的分叉点：那里数组节点收敛为
 * 叶子（具名段下钻数组在求值器是静默空串——缺字段信号），本题以数组为合法终点
 * ——语义相反，故自实现逐层枚举、**不复用 schemaChildEntries**；下钻组合现成件
 * schemaNodeAtPath + 节点判别（isArrayNode/isScalarNode）。
 *
 * 起点三分流判别（D3）：按选中路径位置定枚举起点 schema——无 template 祖先
 * （根层表；建表表单同款恒根起点，不经此判别件）= 载荷根 schema；有 template
 * 祖先 = 沿路径每个 template 段行相对递归 resolveRowSchema（嵌套表自外层行取数，
 * hydrateTemplateNode 同门；判别思路对齐 editor-vue expressionContext 的
 * rowSchemaAlongPath，缺省面相反：表达式面无祖先给 null 表根上下文，本面无祖先
 * 给根 schema 表根起点，故独立落件不改 expressionContext）；任一层解析不出
 * （rowsPath 无 items 声明/漂移/途经非表）→ null 降级无候选。
 *
 * 点选器剪枝枚举件（rows-path-picker 工单 01，spec D5/D3）：级联点选器每层的
 * 候选条目——在补全枚举语义上加剪枝谓词 leadsToArray，候选面收敛至「通往行数组
 * 的路径」：标量子段不出现；对象子段仅当子树内沿 properties 链至少含一个可达
 * 数组才出现；数组子段 = 终点条目（isArray 标记），不透传 items（数组套数组的
 * 内层不可达）。无 partial 概念（纯点选无输入期），前缀 = 已积累点路径、逐段
 * 全量已消费、尾段取子层；空层/漂移/畸形前缀一律返回空数组（空态呈现归 vue
 * 面）。起点判别不在此重复造：调用方经 resolveRowsPathStartSchema 得起点后再
 * 进本件。元信息同表达式补全先例（D8）：description/title 两字段分离透传，展示
 * 回落 description ?? title 归呈现层。
 *
 * 全模块纯函数、零 DOM；层内依赖仅 expressionSchema / expressionCandidates
 * （候选类型面）/ layerPath。
 */
import type { Canvas } from '@hankchen/canvas'

import type { ExpressionCandidate } from './expressionCandidates'
import {
    resolveRowSchema,
    schemaNodeAtPath,
    type ExpressionSchemaNode,
} from './expressionSchema'
import { resolveLayer, type LayerPath } from './layerPath'

/**
 * 一条 rowsPath 候选（面同 ExpressionCandidate → 结构兼容 editor-vue 的
 * CompletionItem，浮层零改动复用）。
 */
export type RowsPathCandidate = ExpressionCandidate

/** 一次枚举结果（partial/candidates 契约同表达式面）；null = 无补全态 */
export interface RowsPathCandidateResult {
    /** 正在输入的未完整段（'' = 空输入/单尾点态）；恒为输入串后缀 */
    partial: string
    /** 当前层全量合法子项（不按 partial 预过滤——前缀过滤归浮层） */
    candidates: readonly RowsPathCandidate[]
}

/** 节点判别：type 声明 array 或声明 items 即数组节点 = rowsPath 合法终点 */
function isArrayNode(node: ExpressionSchemaNode): boolean {
    return node.type === 'array' || node.items !== undefined
}

/** 节点判别：无结构声明 = 标量节点（水合端不可导航） */
function isScalarNode(node: ExpressionSchemaNode): boolean {
    return !isArrayNode(node) && node.properties === undefined
}

/** 前缀 + 段名的点路径拼接（起点相对；'' 前缀 = 头部候选即段名） */
function joinSegment(prefix: string, key: string): string {
    return prefix === '' ? key : `${prefix}.${key}`
}

/** 元信息装配（D8 共享面）：description/title 两字段分离透传，未声明不落键 */
function withMeta<T extends { description?: string; title?: string }>(
    target: T,
    node: ExpressionSchemaNode,
): T {
    if (node.description !== undefined) target.description = node.description
    if (node.title !== undefined) target.title = node.title
    return target
}

/**
 * 逐段下钻到目标层（补全/点选两枚举器共享的域规则）：数组内不下钻（具名段穿数
 * 组在水合端无意义）；声明漂移/缺失走不通；落点须对象层（终点数组之下/标量不
 * 构成层）。走不通 → null，全程不抛错。
 */
function descendToLayer(
    start: ExpressionSchemaNode,
    segments: readonly string[],
): ExpressionSchemaNode | null {
    let base = start
    for (const segment of segments) {
        if (isArrayNode(base)) return null
        const child = schemaNodeAtPath(base, [segment])
        if (child === null) return null
        base = child
    }
    return isArrayNode(base) || isScalarNode(base) ? null : base
}

/** 一条候选的元信息组装：终点数组徽标数据恒 'array'（展示文案不在此层定） */
function childCandidate(key: string, node: ExpressionSchemaNode, prefix: string): RowsPathCandidate {
    const candidate = withMeta<RowsPathCandidate>(
        { path: joinSegment(prefix, key), segment: key },
        node,
    )
    if (isArrayNode(node)) candidate.type = 'array'
    return candidate
}

/**
 * 一层的合法子项候选（声明序）：object 子段 = 中间站（无徽标数据）；array 子段 =
 * 终点（type 'array'）；标量子段不出候选。
 */
function levelCandidates(base: ExpressionSchemaNode, prefix: string): readonly RowsPathCandidate[] {
    const candidates: RowsPathCandidate[] = []
    if (base.properties !== undefined) {
        for (const [key, child] of base.properties) {
            if (isScalarNode(child)) continue
            candidates.push(childCandidate(key, child, prefix))
        }
    }
    return candidates
}

/**
 * 枚举当前输入串的合法 rowsPath 候选。起点 schema null（判别件降级态）直接无
 * 候选；完成段任一落点为数组/标量/缺失 → null（无补全态，不抛错——手输不受
 * 阻）；枚举落点为对象层 → 该层全量合法子项。
 */
export function enumerateRowsPathCandidates(
    startSchema: ExpressionSchemaNode | null,
    input: string,
): RowsPathCandidateResult | null {
    if (startSchema === null) return null

    // 单尾点 = 补全点标记：剥点列全量子段（partial 空）；其余尾段即 partial
    const segments = input.split('.')
    const partial = input.endsWith('.') ? '' : (segments[segments.length - 1] as string)
    const completed = segments.slice(0, -1)

    const base = descendToLayer(startSchema, completed)
    if (base === null) return null // 数组内不下钻/漂移/标量落点：无补全态不抛错

    const view = levelCandidates(base, completed.join('.'))
    return { partial, candidates: view }
}

/**
 * 一条 rowsPath 点选器条目（rows-path-picker 工单 01）：级联一层的可点项。
 * 与 RowsPathCandidate 的分叉：无 partial/徽标面，换显式数组终点标记——点选器
 * 按 isArray 分流「点选提交 / 只可下钻」，不再经「带尾点探一层」推断。
 */
export interface RowsPathPickerEntry {
    /** 提交/下钻的完整点路径（起点相对；点选器 v-model 面就是它） */
    path: string
    /** 本段名（无元信息时的显示回落） */
    segment: string
    /** 显示名注解（D8 两字段分离透传；展示回落 description ?? title 归呈现层） */
    title?: string
    /** 说明（未声明为 undefined） */
    description?: string
    /** 数组终点标记：true = 行数组终点（点选即提交）；false = 对象中间站（只可下钻） */
    isArray: boolean
}

/**
 * 剪枝谓词（D5，独立可测）：节点是行数组，或其子树内沿 properties 链至少含一
 * 个可达数组。只沿 properties 链下传、**不穿 items**——数组节点自身即终点（数
 * 组套数组的内层经外层已不可达，无需问 items 内部）；无 properties 的节点（标
 * 量/无键对象）= false。
 */
export function leadsToArray(node: ExpressionSchemaNode): boolean {
    if (isArrayNode(node)) return true
    if (node.properties === undefined) return false
    for (const child of node.properties.values()) {
        if (leadsToArray(child)) return true
    }
    return false
}

/** 一条条目的元信息组装（元信息面同 childCandidate：两字段分离、未声明不落键） */
function pickerEntry(key: string, node: ExpressionSchemaNode, prefix: string): RowsPathPickerEntry {
    return withMeta<RowsPathPickerEntry>(
        { path: joinSegment(prefix, key), segment: key, isArray: isArrayNode(node) },
        node,
    )
}

/**
 * 枚举点选器某层的候选条目（rows-path-picker 工单 01）：prefix 为已积累点路径，
 * 逐段全量已消费、尾段取子层（'' = 起点层）；下钻域规则走 descendToLayer，每层
 * 条目经 leadsToArray 剪枝至「通往行数组的路径」。起点 schema null / 前缀漂移
 * （段缺失/标量落点）/ 畸形（双点/尾点/头点）/ 数组落点（数组不展开）→ 空数组，
 * 全程不抛错——空态呈现归 vue 面（spec D6）。
 */
export function enumerateRowsPathPickerEntries(
    startSchema: ExpressionSchemaNode | null,
    prefix: string,
): readonly RowsPathPickerEntry[] {
    if (startSchema === null) return []
    const segments = prefix === '' ? [] : prefix.split('.')
    if (segments.includes('')) return [] // 畸形前缀：点选器只产全段路径，不构成层
    const base = descendToLayer(startSchema, segments)
    if (base === null) return [] // 数组不展开/漂移/标量落点：空层

    const entries: RowsPathPickerEntry[] = []
    if (base.properties !== undefined) {
        for (const [key, child] of base.properties) {
            if (!leadsToArray(child)) continue // D5 剪枝：标量与无可达数组的对象不出现
            entries.push(pickerEntry(key, child, prefix))
        }
    }
    return entries
}

/**
 * rowsPath 编辑起点的三分流判别（D3）：无 template 祖先 → 载荷根 schema（根层
 * 表；建表表单恒根起点同款）；有 template 祖先 → 沿选中路径每个 template 段行
 * 相对递归 resolveRowSchema（首个对根 schema、其后对当前行 schema），返回最终
 * 行 schema；任一层解析不出（rowsPath 无 items 声明/漂移/途经非 TableLayer）→
 * null 降级无候选。rootSchema null（声明未注入/被拒）→ null；doc/path 缺席 →
 * 根起点兜底（画布级判定兜底一致）。
 */
export function resolveRowsPathStartSchema(
    doc: Canvas | null,
    path: LayerPath | null,
    rootSchema: ExpressionSchemaNode | null,
): ExpressionSchemaNode | null {
    if (rootSchema === null) return null
    if (doc === null || path === null) return rootSchema
    let current: ExpressionSchemaNode | null = null
    for (let i = 0; i < path.length; i += 1) {
        if (path[i] !== 'template') continue
        const table = resolveLayer(doc, path.slice(0, i) as LayerPath)
        if (table === null || table.type !== 'TableLayer') return null
        current = resolveRowSchema(current ?? rootSchema, table.rowsPath)
        if (current === null) return null
    }
    return current ?? rootSchema
}
