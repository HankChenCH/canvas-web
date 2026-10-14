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
 * - `.` 下钻走 properties 树；无 properties 节点终止该分支；数组节点收敛为叶子
 *   无具名子候选（D9 修订 D3：具名段下钻数组在求值器是静默空串——缺字段信号，
 *   不给写得出来而渲染为空白的表达式；下钻层 items 链保留供 rowsPath/`row.*`
 *   机制，类型徽标仍显示 array 本身）。开放映射信号面（D10）已随契约废除移除
 *   （ADR 0020）——schema 解析边界显式拒绝后，枚举只服务具体键声明。
 *
 * 消费契约（工单 04 浮层 + 工单 12 调用面扩展）：
 * - 入参 expr 是**光标前缀**（trim 后，来自 expressionScan + 光标切片——调用片段
 *   编辑位常在中段，工单 12）；**单个尾点 = 补全点标记**，先剥再解析（对齐工单 01
 *   备注：`row.` 按求值语义是空段错误，剥点后 `row` 才是可下钻前缀）；剥点后为空
 *   且原 expr 非空 = 孤点前缀，无合法续写 → expression_syntax_error 信号。
 * - 结果 `partial` 恒为 expr 的后缀（尾点态 = 空后缀）：接受 = 在光标锚位把
 *   partial 替换为候选 segment；候选给**全量合法子项**、不按 partial 预过滤，
 *   前缀过滤/高亮归浮层（Ctrl+Space 全量展示语义亦归浮层）。
 * - 元信息：path（补全后的完整点路径）+ schema description/title（D8 两字段分离
 *   透传，展示回落 description ?? title 归浮层）+ 类型徽标数据（type 归一）。
 *   `$root`/`row`/`$index` 结构头是下钻踏脚石（`{{$root}}`/
 *   `{{row}}` 单独求值无意义），元信息仅有行 schema 声明时的 row 携带。
 * - 内建函数建议面（工单 12，spec §1.2 ⑨「已知名单只喂补全建议」）：
 *   ① 函数名候选——片段以名字形态开头（非空裸名）时给 `名字()` 插入项
 *   （cursorBack 落括号内）；空 expr 与尾点下钻位不给（字段列表零噪音）。
 *   ② 建议分桶（工单 11 ②）——partial 非空（字段收敛中）时按子节点形状追加
 *   调用插入候选：format 标记 string → `date(path, '')`（光标落引号内 = format
 *   参数占位）、number → 数字族三函数；普通 string 不特供。桶候选携带
 *   replaceLen = 整段 expr（接受时重写整个前缀+部分段）与 filterKey = 键名
 *   （与字段候选同前缀过滤）。
 *   ③ 调用槽位路由——expr 已是调用形态（⑦）时按光标槽位分派：首参路径槽复用
 *   路径枚举（关桶/函数建议：调用不嵌套）；date 字符串槽给具名预设 + 中文模板
 *   快捷项（spec §3.4）；其余槽位/闭合调用空候选。结构红标归扫描面，此处不判。
 *
 * 降级语义：schema null（声明被拒/形态非法，经 normalizeExpressionSchemaSource
 * 收口）→ 全部无候选；schema 合法而行 schema 未解析（rowsPath 无 items 声明）→
 * 结构头 row 仍在、行子树无候选——辅助声明不作权威，全程不抛错。
 *
 * 全模块纯函数、无 DOM；层内依赖仅 expressionSchema / expressionPath /
 * expressionCall / expressionFunctions。
 */
import { isCallFragment, expressionCallSlotAtEnd } from './expressionCall'
import { DATE_FORMAT_SUGGESTIONS, EXPRESSION_FUNCTIONS, NUMBER_FUNCTION_SUGGESTIONS } from './expressionFunctions'
import { parseExpressionPath, type ExpressionPathHead, type ExpressionSyntaxError } from './expressionPath'
import {
    schemaChildEntries,
    schemaNodeAtPath,
    type ExpressionSchemaChildEntry,
    type ExpressionSchemaNode,
} from './expressionSchema'

/** 'root' = 根层三字段（独立图层）；'row' = 格内容层（模板行内） */
export type ExpressionContextKind = 'root' | 'row'

/** 一条补全候选：路径 + schema 元信息（description/title/类型徽标，展示回落归浮层） */
export interface ExpressionCandidate {
    /** 补全后的完整点路径（前缀 + 本段；头部候选即头部名；调用候选 = 插入文本） */
    path: string
    /** 本段名——接受时替换 partial / 追加到前缀后的文本 */
    segment: string
    /** schema description（未声明为 undefined） */
    description?: string
    /** schema title（D8 形状树两字段分离透传，未声明为 undefined）——浮层展示取 description ?? title */
    title?: string
    /** 类型徽标数据（schema type 归一；未声明为 undefined；函数/格式候选为建议类别） */
    type?: string
    /**
     * 插入后光标从插入文本末端回退的码元数（工单 12）：date() 调用 = 2（落引号内
     * format 参数占位）、`名字()` 函数名候选 = 1（落括号内）；缺省 0（落插入末尾）
     */
    cursorBack?: number
    /**
     * 接受时从光标锚位回退替换的长度（工单 12；缺省 = partial 长度）：桶候选携带
     * 整段 expr 长度——调用插入重写「前缀 + 部分段」全量
     */
    replaceLen?: number
    /**
     * 前缀过滤键（工单 12；缺省 = segment）：桶候选 = 字段键名——与同键路径候选
     * 一起被浮层按 partial 过滤（segment 是整段调用文本，直接过滤永不匹配）
     */
    filterKey?: string
    /**
     * 显式分桶判别（resource-expression-single-ref 工单 03，ADR 0020）：'path' =
     * 字段/结构头路径候选，'function' = 函数名建议 + 形状分桶调用插入——资源面
     * 选择器（工单 05）按 `kind === 'path'` 过滤函数桶，不用 filterKey/含 ( 启发
     * 式（工单 12 内部约定不作契约）。缺省 = 两桶之外的建议面（date 格式快捷项
     * ——资源面天然不出现）；rowsPath 候选面（RowsPathCandidate 同型别名）不产
     * 此字段。
     */
    kind?: 'path' | 'function'
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

function candidateMeta(node: ExpressionSchemaNode): Pick<ExpressionCandidate, 'description' | 'title' | 'type'> {
    const meta: Pick<ExpressionCandidate, 'description' | 'title' | 'type'> = {}
    if (node.description !== undefined) meta.description = node.description
    if (node.title !== undefined) meta.title = node.title
    if (node.type !== undefined) meta.type = node.type
    return meta
}

function childCandidate(entry: ExpressionSchemaChildEntry, prefix: string): ExpressionCandidate {
    const path = prefix === '' ? entry.key : `${prefix}.${entry.key}`
    return { path, segment: entry.key, kind: 'path', ...candidateMeta(entry.node) }
}

/**
 * 建议分桶（工单 11 ②消费，工单 12 落地）：按子节点形状在路径候选后追加调用
 * 插入候选——format 标记 string → `date(path, '')`（cursorBack 2 = 光标落引号内
 * format 参数占位，预设/模板快捷项由调用槽位路由接棒）；number → 数字族三函数
 * （裸调用走缺省参）；其余形状不特供。只影响建议面，求值三端零感知。
 * replaceLen = 整段 expr：接受时重写「前缀 + 部分段」（调用包住已输入的路径）；
 * filterKey = 键名：与同键路径候选一起按 partial 前缀过滤。
 */
function callCandidatesFor(entry: ExpressionSchemaChildEntry, path: string, exprLen: number): ExpressionCandidate[] {
    const extras: ExpressionCandidate[] = []
    if (entry.node.format === 'date' || entry.node.format === 'date-time') {
        extras.push({
            path: `date(${path}, '')`,
            segment: `date(${path}, '')`,
            cursorBack: 2,
            replaceLen: exprLen,
            filterKey: entry.key,
            kind: 'function',
            description: '日期格式化',
            type: '函数',
        })
    } else if (entry.node.type === 'number') {
        for (const fn of NUMBER_FUNCTION_SUGGESTIONS) {
            extras.push({
                path: `${fn.name}(${path})`,
                segment: `${fn.name}(${path})`,
                replaceLen: exprLen,
                filterKey: entry.key,
                kind: 'function',
                description: fn.summary,
                type: '函数',
            })
        }
    }
    return extras
}

/** 子键候选（路径候选 + 按形状分桶的调用插入候选）；exprLen = 整段 expr 长度 */
function childCandidates(entry: ExpressionSchemaChildEntry, prefix: string, exprLen: number, withBuckets: boolean): ExpressionCandidate[] {
    const base = childCandidate(entry, prefix)
    if (!withBuckets) return [base]
    return [base, ...callCandidatesFor(entry, base.path, exprLen)]
}

/** 函数名候选（spec ⑨：已知名单只喂补全建议——`名字()` 插入 + 光标落括号内） */
function functionCandidates(): ExpressionCandidate[] {
    return EXPRESSION_FUNCTIONS.map((fn) => ({
        path: fn.signature,
        segment: `${fn.name}()`,
        cursorBack: 1,
        kind: 'function',
        description: fn.summary,
        type: '函数',
    }))
}

/** date 格式串快捷项（spec §3.4：具名预设 + 中文模板，写即所得） */
function dateFormatCandidates(): ExpressionCandidate[] {
    return DATE_FORMAT_SUGGESTIONS.map((suggestion) => ({
        path: suggestion.segment,
        segment: suggestion.segment,
        description: suggestion.description,
        type: '格式',
    }))
}

/** 上下文头部候选：裸键（声明序）+ $root；行上下文追加 row/$index（结构头，踏脚石） */
function headCandidates(
    schema: ExpressionSchemaNode,
    context: ExpressionContextKind,
    rowSchema: ExpressionSchemaNode | null | undefined,
    exprLen: number,
    withBuckets: boolean,
): readonly ExpressionCandidate[] {
    const view = schemaChildEntries(schema)
    const candidates = view.entries.flatMap((entry) => childCandidates(entry, '', exprLen, withBuckets))
    candidates.push({ path: '$root', segment: '$root', kind: 'path' })
    if (context === 'row') {
        candidates.push(rowSchema ? { path: 'row', segment: 'row', kind: 'path', ...candidateMeta(rowSchema) } : { path: 'row', segment: 'row', kind: 'path' })
        candidates.push({ path: '$index', segment: '$index', kind: 'path' })
    }
    return candidates
}

/**
 * 调用槽位路由（工单 12，spec ⑨）：expr 已是调用形态（⑦ 分类）时按光标槽位
 * 分派建议面。结构红标归扫描面（fragmentSyntaxError），此处只产候选：
 * - 首参路径槽：字段建议复用路径枚举（**关桶/函数建议**——调用不嵌套，参数位只
 *   该写字段）；槽文本语法残缺/行外 row. 等枚举不出 = 空候选，不阻断不标红。
 * - date 字符串槽（第二参起）：具名预设 + 中文模板快捷项（spec §3.4）。
 * - 其余槽位（数字面/闭合后/嵌套调用形态）：空候选。
 */
function callSlotResult(
    schema: ExpressionSchemaNode,
    query: ExpressionCandidateQuery,
): ExpressionCandidateResult {
    const slot = expressionCallSlotAtEnd(query.expr)
    if (slot === null) {
        return { ok: true, prefix: '', partial: '', candidates: [] }
    }
    if (slot.stringSlot && slot.index >= 1 && slot.name === 'date') {
        return { ok: true, prefix: '', partial: slot.text, candidates: dateFormatCandidates() }
    }
    if (slot.index === 0 && !isCallFragment(slot.text)) {
        const sub = enumeratePathCandidates(schema, query, slot.text, false)
        if (!sub.ok) return { ok: true, prefix: '', partial: '', candidates: [] }
        return sub
    }
    return { ok: true, prefix: '', partial: '', candidates: [] }
}

/**
 * 枚举当前片段表达式的合法候选（工单 12 起入口按 ⑦ 分类分流：调用形态走
 * callSlotResult 槽位路由，路径形态走本函数既有规则表分派——见模块头注；
 * 分支不可达/节点为叶子一律空候选，不抛错。allowCallSuggestions = 函数名建议与
 * 建议分桶的开关：调用参数位递归关闭——调用不嵌套、参数位只该写字段）。
 */
function enumeratePathCandidates(
    schema: ExpressionSchemaNode,
    query: ExpressionCandidateQuery,
    expr: string,
    allowCallSuggestions: boolean,
): ExpressionCandidateResult {
    if (schema === null) {
        return { ok: true, prefix: '', partial: '', candidates: [] }
    }

    // 单个尾点 = 补全点标记（工单 01 备注）；孤点前缀无合法续写
    const hadTrailingDot = expr.endsWith('.')
    const stripped = hadTrailingDot ? expr.slice(0, -1) : expr
    if (stripped === '') {
        if (expr === '') {
            return {
                ok: true,
                prefix: '',
                partial: '',
                candidates: headCandidates(schema, query.context, query.rowSchema, expr.length, false),
            }
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

    // 桶候选随字段收敛出现（工单 11 ②「选字段后」）：partial 非空 = 正在收敛到
    // 某字段；空 expr / 尾点未过滤位保持既有列表零噪音
    const withBuckets = allowCallSuggestions && partial !== ''

    if (prefixPath.length === 0) {
        const view = headCandidates(schema, query.context, query.rowSchema, expr.length, withBuckets)
        // 函数名候选（spec ⑨「片段以名字+( 形态开头时建议函数名」）：非空裸名位给，
        // 空 expr / 尾点下钻位不给（字段列表零噪音；名单面只喂建议不校验）
        const fns = allowCallSuggestions && expr !== '' ? functionCandidates() : []
        return {
            ok: true,
            prefix: '',
            partial,
            candidates: [...view, ...fns],
        }
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
    if (node === null) {
        return { ok: true, prefix, partial, candidates: [] }
    }
    const view = schemaChildEntries(node)
    return {
        ok: true,
        prefix,
        partial,
        candidates: view.entries.flatMap((entry) => childCandidates(entry, prefix, expr.length, withBuckets)),
    }
}

export function enumerateExpressionCandidates(
    schema: ExpressionSchemaNode | null,
    query: ExpressionCandidateQuery,
): ExpressionCandidateResult {
    if (schema === null) {
        return { ok: true, prefix: '', partial: '', candidates: [] }
    }
    // ⑦ 分类分流（工单 12）：调用形态前缀 → 光标槽位路由；否则既有路径枚举
    if (isCallFragment(query.expr)) {
        return callSlotResult(schema, query)
    }
    return enumeratePathCandidates(schema, query, query.expr, true)
}
