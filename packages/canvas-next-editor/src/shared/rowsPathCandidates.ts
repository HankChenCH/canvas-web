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
 *   同款，全程不抛错。
 * - open 节点（additionalProperties: true）：open 信号随结果透出（信号面与候选
 *   空否无关，对齐 schemaChildEntries 的 D10 面），供浮层渲染占位提示行。
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
 * 全模块纯函数、零 DOM；层内依赖仅 expressionSchema / expressionCandidates
 * （候选类型面）/ layerPath。
 */
import type { Canvas } from '@hankchen/canvas-next'

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

/** 一次枚举结果（partial/candidates 契约同表达式面 + open 信号）；null = 无补全态 */
export interface RowsPathCandidateResult {
    /** 正在输入的未完整段（'' = 空输入/单尾点态）；恒为输入串后缀 */
    partial: string
    /** 当前层全量合法子项（不按 partial 预过滤——前缀过滤归浮层） */
    candidates: readonly RowsPathCandidate[]
    /**
     * 开放映射信号（D10 同款）：枚举落点标 open（additionalProperties: true）时为
     * true，非 open 恒缺省——浮层渲染「动态字段，键由模板定义」占位提示行，信号
     * 在场时候选空也不关浮层。
     */
    open?: boolean
}

/** 节点判别：type 声明 array 或声明 items 即数组节点 = rowsPath 合法终点 */
function isArrayNode(node: ExpressionSchemaNode): boolean {
    return node.type === 'array' || node.items !== undefined
}

/** 节点判别：无结构声明也无开放映射 = 标量节点（水合端不可导航） */
function isScalarNode(node: ExpressionSchemaNode): boolean {
    return !isArrayNode(node) && node.properties === undefined && node.open !== true
}

/** 一条候选的元信息组装：终点数组徽标数据恒 'array'（展示文案不在此层定） */
function childCandidate(key: string, node: ExpressionSchemaNode, prefix: string): RowsPathCandidate {
    const candidate: RowsPathCandidate = {
        path: prefix === '' ? key : `${prefix}.${key}`,
        segment: key,
    }
    if (node.description !== undefined) candidate.description = node.description
    if (node.title !== undefined) candidate.title = node.title
    if (isArrayNode(node)) candidate.type = 'array'
    return candidate
}

/**
 * 一层的合法子项候选（声明序）：object/open 子段 = 中间站（无徽标数据）；array
 * 子段 = 终点（type 'array'）；标量子段不出候选。open 信号随落点透出（与候选
 * 空否无关）。
 */
function levelCandidates(
    base: ExpressionSchemaNode,
    prefix: string,
): { candidates: readonly RowsPathCandidate[]; open?: boolean } {
    const candidates: RowsPathCandidate[] = []
    if (base.properties !== undefined) {
        for (const [key, child] of base.properties) {
            if (isScalarNode(child)) continue
            candidates.push(childCandidate(key, child, prefix))
        }
    }
    return base.open === true ? { candidates, open: true } : { candidates }
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

    let base = startSchema
    for (const segment of completed) {
        if (isArrayNode(base)) return null // 数组内不下钻：具名段穿数组在水合端无意义
        const child = schemaNodeAtPath(base, [segment])
        if (child === null) return null // 声明漂移/缺失/标量落点：无补全态不抛错
        base = child
    }
    if (isArrayNode(base) || isScalarNode(base)) return null // 枚举落点非对象层（终点数组之下无下钻）

    const view = levelCandidates(base, completed.join('.'))
    return {
        partial,
        candidates: view.candidates,
        ...(view.open === true ? { open: true } : {}),
    }
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
