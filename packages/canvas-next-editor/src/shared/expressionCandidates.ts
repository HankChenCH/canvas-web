/**
 * 候选枚举器（content-completion 工单 02，spec §2 候选枚举规则表）。
 *
 * 规则逐条导出自 php-canvas-next 求值/填充语义（InterpolationEvaluator +
 * CanvasHydrator，只读对齐），非新发明：
 * - 根上下文（根层三字段）头部候选 = 载荷顶层键（D1：schema 声明即 data 载荷
 *   形状）+ `$root`；行上下文（格内容层）追加 `row` + `$index`。`$index` 仅行
 *   上下文给——行外求值为空串非报错，但不给写得出来而无效的表达式；`row.` 行外
 *   报 `expression_row_outside_loop`，同样不给。
 * - 裸键在两种上下文都走根 schema：行上下文求值上下文 = `$rowNamespace + $root`
 *   合并（CanvasHydrator::evaluateNode），行命名空间只有 row/$index 且
 *   reserved_root_key 保证根级键不遮蔽——裸键即根键。
 * - `.` 下钻走 properties 树；无 properties 节点终止该分支；数组节点 items 键树
 *   下钻（D3，walker 代理，与行上下文候选同一机制）。
 *
 * 消费契约（工单 04 浮层）：
 * - 入参 expr 是片段表达式（trim 后，来自 expressionScan）；**单个尾点 = 补全点
 *   标记**，先剥再解析（对齐工单 01 备注：`row.` 按求值语义是空段错误，剥点后
 *   `row` 才是可下钻前缀）；剥点后为空且原 expr 非空 = 孤点前缀，无合法续写 →
 *   expression_syntax_error 信号。
 * - 结果 `partial` 恒为 expr 的后缀（尾点态 = 空后缀）：接受 = 在 expr 末尾把
 *   partial 替换为候选 segment；候选给**全量合法子项**、不按 partial 预过滤，
 *   前缀过滤/高亮归浮层（Ctrl+Space 全量展示语义亦归浮层）。
 * - 元信息：path（补全后的完整点路径）+ schema description + 类型徽标数据
 *   （type 归一）。`$root`/`row`/`$index` 结构头是下钻踏脚石（`{{$root}}`/
 *   `{{row}}` 单独求值无意义），元信息仅有行 schema 声明时的 row 携带。
 *
 * 降级语义：schema null（声明被拒/形态非法，经 normalizeExpressionSchemaSource
 * 收口）→ 全部无候选；schema 合法而行 schema 未解析（rowsPath 无 items 声明）→
 * 结构头 row 仍在、行子树无候选——辅助声明不作权威，全程不抛错。
 *
 * 全模块纯函数、无 DOM；层内依赖仅 expressionSchema / expressionPath。
 */
import { parseExpressionPath, type ExpressionPathHead, type ExpressionSyntaxError } from './expressionPath'
import {
    schemaChildEntries,
    schemaNodeAtPath,
    type ExpressionSchemaChildEntry,
    type ExpressionSchemaNode,
} from './expressionSchema'

/** 'root' = 根层三字段（独立图层）；'row' = 格内容层（模板行内） */
export type ExpressionContextKind = 'root' | 'row'

/** 一条补全候选：路径 + schema 元信息（description/类型徽标） */
export interface ExpressionCandidate {
    /** 补全后的完整点路径（前缀 + 本段；头部候选即头部名），如 row.user.city */
    path: string
    /** 本段名——接受时替换 partial / 追加到前缀后的文本 */
    segment: string
    /** schema description（未声明为 undefined） */
    description?: string
    /** 类型徽标数据（schema type 归一；未声明为 undefined） */
    type?: string
}

export interface ExpressionCandidateQuery {
    context: ExpressionContextKind
    /** 当前片段表达式（trim 后；'' = 刚输入 {{；允许单个补全尾点） */
    expr: string
    /**
     * 行上下文的行键树 schema（rowsPath 数组 items，resolveRowSchema 产物）。
     * 嵌套模板表的行相对 rowsPath 由调用方按当前行 schema 解析后传入。
     * 未传/解析不出 = 行子树无候选，结构头 row 仍给。
     */
    rowSchema?: ExpressionSchemaNode | null
}

export type ExpressionCandidateResult =
    | {
          ok: true
          /** 候选所属前缀路径（'' = 上下文头部层） */
          prefix: string
          /** 正在输入的未完整段（'' = 尾点/空表达式态）；恒为 expr 的后缀 */
          partial: string
          candidates: readonly ExpressionCandidate[]
      }
    | { ok: false; reason: ExpressionSyntaxError }

function headName(head: ExpressionPathHead): string {
    if (head.kind === 'row') return 'row'
    if (head.kind === 'root') return '$root'
    return head.name
}

function candidateMeta(node: ExpressionSchemaNode): Pick<ExpressionCandidate, 'description' | 'type'> {
    const meta: Pick<ExpressionCandidate, 'description' | 'type'> = {}
    if (node.description !== undefined) meta.description = node.description
    if (node.type !== undefined) meta.type = node.type
    return meta
}

function childCandidate(entry: ExpressionSchemaChildEntry, prefix: string): ExpressionCandidate {
    const path = prefix === '' ? entry.key : `${prefix}.${entry.key}`
    return { path, segment: entry.key, ...candidateMeta(entry.node) }
}

/** 上下文头部候选：裸键（声明序）+ $root；行上下文追加 row/$index（结构头，踏脚石） */
function headCandidates(
    schema: ExpressionSchemaNode,
    context: ExpressionContextKind,
    rowSchema: ExpressionSchemaNode | null | undefined,
): readonly ExpressionCandidate[] {
    const candidates: ExpressionCandidate[] = []
    for (const entry of schemaChildEntries(schema)) {
        candidates.push(childCandidate(entry, ''))
    }
    candidates.push({ path: '$root', segment: '$root' })
    if (context === 'row') {
        candidates.push(rowSchema ? { path: 'row', segment: 'row', ...candidateMeta(rowSchema) } : { path: 'row', segment: 'row' })
        candidates.push({ path: '$index', segment: '$index' })
    }
    return candidates
}

/**
 * 枚举当前片段表达式的合法候选。schema null（声明降级态）直接无候选；
 * 其余按 spec §2 规则表分上下文路由（见模块头注），分支不可达/节点为叶子
 * 一律空候选，不抛错。
 */
export function enumerateExpressionCandidates(
    schema: ExpressionSchemaNode | null,
    query: ExpressionCandidateQuery,
): ExpressionCandidateResult {
    if (schema === null) {
        return { ok: true, prefix: '', partial: '', candidates: [] }
    }

    // 单个尾点 = 补全点标记（工单 01 备注）；孤点前缀无合法续写
    const hadTrailingDot = query.expr.endsWith('.')
    const stripped = hadTrailingDot ? query.expr.slice(0, -1) : query.expr
    if (stripped === '') {
        if (query.expr === '') {
            return { ok: true, prefix: '', partial: '', candidates: headCandidates(schema, query.context, query.rowSchema) }
        }
        return { ok: false, reason: 'expression_syntax_error' }
    }

    const parsed = parseExpressionPath(stripped)
    if (!parsed.ok) {
        return { ok: false, reason: 'expression_syntax_error' }
    }

    const { head, rest } = parsed
    // 前缀路径与正在输入的段：尾点态全路径即前缀；否则尾段是 partial、其余是前缀；
    // 余段为空 = 头部本身在输入中（前缀回落到上下文头部层）
    let prefixPath: readonly string[]
    let partial: string
    if (hadTrailingDot) {
        prefixPath = [headName(head), ...rest]
        partial = ''
    } else if (rest.length > 0) {
        prefixPath = [headName(head), ...rest.slice(0, -1)]
        partial = rest[rest.length - 1] as string
    } else {
        prefixPath = []
        partial = headName(head)
    }

    if (prefixPath.length === 0) {
        return { ok: true, prefix: '', partial, candidates: headCandidates(schema, query.context, query.rowSchema) }
    }

    // 头路由对齐求值器 resolveFragment 的 match 分支。base 与下钻段：
    // 裸键头是根 schema 的真实段（段含头名）；$root/row 是虚拟头（base 已是其
    // 指向的节点，段剥头名）
    let base: ExpressionSchemaNode | null
    let segments: readonly string[]
    if (head.kind === 'row') {
        if (query.context !== 'row') {
            return { ok: true, prefix: prefixPath.join('.'), partial, candidates: [] } // row. 行外不给
        }
        base = query.rowSchema ?? null
        segments = prefixPath.slice(1)
    } else if (head.kind === 'root') {
        base = schema
        segments = prefixPath.slice(1)
    } else if (head.name === '$index') {
        // $index 仅行上下文给（头部层已按上下文过滤）；标量注入值无子候选
        return { ok: true, prefix: prefixPath.join('.'), partial, candidates: [] }
    } else {
        base = schema // 裸键 = 根键（两种上下文一致，见模块头注）
        segments = prefixPath
    }

    const node = base === null ? null : schemaNodeAtPath(base, segments)
    const prefix = prefixPath.join('.')
    return {
        ok: true,
        prefix,
        partial,
        candidates: node === null ? [] : schemaChildEntries(node).map((entry) => childCandidate(entry, prefix)),
    }
}
