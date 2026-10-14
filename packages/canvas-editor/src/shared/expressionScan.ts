/**
 * 片段扫描纯函数（content-completion 工单 01，spec §4 纯函数 ①）。
 *
 * 语义逐条对齐 php-canvas-next `InterpolationEvaluator::evaluate` 扫描循环（只读
 * 对齐，不改求值器）：首个未闭合 `{{` 起剩余全字面、片段内容 trim、`{{}}` 不嵌套
 * （首个 `}}` 收口，内容含 `{{`）、片段外字面直通；空片段/路径空段 =
 * `expression_syntax_error` 信号（与求值器同码）。切片语义对调用片段零改动
 * （spec §1.2 ⑤：首个 `}}` 收口、扫描器引号不感知——片段内禁 `}}` 字面）；闭合
 * 片段的错误信号按 ⑦ 分类分流（路径/调用，expression-type-methods 工单 12）。
 *
 * 与求值器的一处表示分叉（编辑器侧补全所需）：未闭合 `{{` 在求值期按字面直通，
 * 在扫描结果里另立 **open 片段**（kind: 'open'）——这正是「输入 `{{` 自动弹出」的
 * 触发态（spec §3），其 expr 是待输入路径；closed 片段仍按求值语义带错误信号。
 *
 * 位置字段是 JS 码元索引（end 独占）——与 PHP 字节索引不同空间，跨端共享 fixture
 * （expression-scan v1）只钉切分内容不钉位置，位置由本端派生并由单测锁死。
 * trim 字符集对齐 PHP `trim()` 默认六字符（" \t\n\r\0\x0B"），**不是** JS 的
 * `String.trim()`（后者含全角空格等 Unicode 空白，会造成双端漂移）。
 *
 * 全模块纯函数、无 DOM（editor-shared-isolation）。
 */
import { isCallFragment, parseExpressionCall, type ExpressionCallErrorKind, type ExpressionErrorRange } from './expressionCall'
import { parseExpressionPath, type ExpressionSyntaxError } from './expressionPath'

/** 字面直通段（不含任何 `{{`） */
export interface ExpressionScanLiteral {
    kind: 'literal'
    start: number
    end: number
    text: string
}

/** 闭合片段（含 `{{ }}` 外壳区域；raw 为外壳内原文，expr 为 trim 后路径） */
export interface ExpressionScanFragment {
    kind: 'fragment'
    start: number
    end: number
    raw: string
    expr: string
    /** 空片段/路径空段信号（与求值器 expression_syntax_error 同码）；合法为 null */
    error: ExpressionSyntaxError | null
    /**
     * 结构错诊断（expression-syntax-diagnostics 工单 01）：kind + 出错子范围，
     * 模板坐标（expr 坐标平移），at 供选中/定位；合法为 null。error 非空 ⟺
     * diagnostic 非空（同一判定的两投影，error 供 fixture/既有消费面不动）。
     */
    diagnostic: ExpressionFragmentDiagnostic | null
}

/**
 * 片段诊断 kind（结构面呈现轴，spec §1.2 ⑨ JS 本端；= 调用面子类 + 空片段 +
 * 资源门子类）。resource_* 两 kind 不由扫描面产出——资源单值门（resourcePath，
 * ADR 0020）是整串判定，诊断沿本形态面出（kind 供 vue 措辞映射，复用空片段同款）。
 */
export type ExpressionFragmentErrorKind =
    | ExpressionCallErrorKind
    | 'empty_fragment'
    | 'resource_not_single_ref' // 非「恰一闭合片段占满整串」（拼接/字面残留/未闭合/无片段）
    | 'resource_function_call' // 片段内容为函数调用形态（资源面禁内建函数）

/** 闭合片段的结构错诊断：位置由本端派生（不入跨端 fixture），措辞映射在 vue 层 */
export interface ExpressionFragmentDiagnostic {
    kind: ExpressionFragmentErrorKind
    /** 片段外壳范围（模板坐标：start 含 {{，end 含 }}） */
    start: number
    end: number
    /** 出错子范围（模板坐标，end 独占）——选中/定位用 */
    at: ExpressionErrorRange
}

/** 未闭合 `{{` 起的输入中片段（求值期按字面；编辑器侧补全触发态） */
export interface ExpressionScanOpen {
    kind: 'open'
    start: number
    end: number
    /** 含 `{{` 外壳的原文（到串尾） */
    text: string
    /** `{{` 之后内容的 trim 结果（待输入路径，可能为空串） */
    expr: string
}

export type ExpressionScanPart = ExpressionScanLiteral | ExpressionScanFragment | ExpressionScanOpen

export interface ExpressionScan {
    template: string
    /** 有序切分；parts 拼回恒等于 template（空字面一律省略） */
    parts: readonly ExpressionScanPart[]
}

/** PHP trim() 默认字符集（JS String.trim 的 Unicode 空白集与之不同，勿用）；
 *  编辑器侧补全的接受手术同用此集（导出防按值复刻漂移，工单 04） */
export const PHP_TRIM_CHARS = ' \t\n\r\0\x0B'

/**
 * PHP trim() 语义（六字符集）：片段 trim 与 vue 侧补全的 expr 前缀截取同用此集
 * （光标定位参数位，expression-type-methods 工单 12——单一事实源，勿按值复刻；
 * JS `String.trim()` 含全角空格等 Unicode 空白，会造成与 PHP 的双端漂移）。
 */
export function phpTrim(value: string): string {
    let start = 0
    let end = value.length
    while (start < end && PHP_TRIM_CHARS.includes(value[start] as string)) start += 1
    while (end > start && PHP_TRIM_CHARS.includes(value[end - 1] as string)) end -= 1
    return value.slice(start, end)
}

/**
 * 片段错误判定（工单 12 适配调用片段 + expression-syntax-diagnostics 工单 01
 * 增诊断轴）：⑦ 分类分流——路径走既有 parseExpressionPath；调用走最小结构面
 * 解析（结构错 = expression_syntax_error 同码；未知函数名不标红，名单面不校验）。
 * 空片段按路径分支落错（空片段/空路径段同码，与求值器一致）。返回 expr 坐标的
 * kind + at（平移到模板坐标由 scanExpressionFragments 组装时完成）。
 */
function fragmentDiagnostic(expr: string): { kind: ExpressionFragmentErrorKind; at: ExpressionErrorRange } | null {
    if (expr === '') return { kind: 'empty_fragment', at: { start: 0, end: 0 } }
    if (isCallFragment(expr)) {
        const parsed = parseExpressionCall(expr)
        if (parsed.ok) return null
        return { kind: parsed.kind, at: parsed.at }
    }
    if (parseExpressionPath(expr).ok) return null
    return { kind: 'invalid_path', at: { start: 0, end: expr.length } }
}

/** raw 的前导 trim 宽度（expr 首字符在 raw 中的下标）：expr 坐标 → 模板坐标平移用 */
function leadingPhpTrim(value: string): number {
    let start = 0
    while (start < value.length && PHP_TRIM_CHARS.includes(value[start] as string)) start += 1
    return start
}

/** 扫描模板串的片段切分：闭合/未闭合/多片段/错误信号，语义对齐求值器扫描循环 */
export function scanExpressionFragments(template: string): ExpressionScan {
    const parts: ExpressionScanPart[] = []
    let pos = 0

    let open = template.indexOf('{{')
    while (open !== -1) {
        const close = template.indexOf('}}', open + 2)
        if (close === -1) {
            // 未闭合：剩余全字面（求值语义）；编辑器侧立 open 片段供补全触发
            if (open > pos) {
                parts.push({ kind: 'literal', start: pos, end: open, text: template.slice(pos, open) })
            }
            const text = template.slice(open)
            parts.push({ kind: 'open', start: open, end: template.length, text, expr: phpTrim(text.slice(2)) })
            return { template, parts }
        }

        if (open > pos) {
            parts.push({ kind: 'literal', start: pos, end: open, text: template.slice(pos, open) })
        }
        const raw = template.slice(open + 2, close)
        const expr = phpTrim(raw)
        let diagnostic: ExpressionFragmentDiagnostic | null = null
        const found = fragmentDiagnostic(expr)
        if (found) {
            const exprStart = open + 2 + leadingPhpTrim(raw)
            diagnostic = {
                kind: found.kind,
                start: open,
                end: close + 2,
                at: { start: exprStart + found.at.start, end: exprStart + found.at.end },
            }
        }
        parts.push({
            kind: 'fragment',
            start: open,
            end: close + 2,
            raw,
            expr,
            error: diagnostic !== null ? 'expression_syntax_error' : null,
            diagnostic,
        })
        pos = close + 2
        open = template.indexOf('{{', pos)
    }

    if (pos < template.length) {
        parts.push({ kind: 'literal', start: pos, end: template.length, text: template.slice(pos) })
    }
    return { template, parts }
}

/**
 * 光标所在片段判定（编辑器侧语义，PHP 无光标概念故不入跨端 fixture）：
 * closed 片段含光标 ⟺ start < cursor < end（`}}` 之后即离开——输入 `}}` 关闭浮层）；
 * open 片段含光标 ⟺ start < cursor <= end（串尾输入位恒在内）。
 */
export function expressionFragmentAtCursor(
    scan: ExpressionScan,
    cursor: number,
): ExpressionScanFragment | ExpressionScanOpen | null {
    for (const part of scan.parts) {
        if (part.kind === 'literal') continue
        const inside = part.kind === 'open' ? cursor > part.start && cursor <= part.end : cursor > part.start && cursor < part.end
        if (inside) return part
    }
    return null
}
