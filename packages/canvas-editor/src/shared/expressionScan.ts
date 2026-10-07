/**
 * 片段扫描纯函数（content-completion 工单 01，spec §4 纯函数 ①）。
 *
 * 语义逐条对齐 php-canvas-next `InterpolationEvaluator::evaluate` 扫描循环（只读
 * 对齐，不改求值器）：首个未闭合 `{{` 起剩余全字面、片段内容 trim、`{{}}` 不嵌套
 * （首个 `}}` 收口，内容含 `{{`）、片段外字面直通；空片段/路径空段 =
 * `expression_syntax_error` 信号（与求值器同码，经 parseExpressionPath 判定）。
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

function phpTrim(value: string): string {
    let start = 0
    let end = value.length
    while (start < end && PHP_TRIM_CHARS.includes(value[start] as string)) start += 1
    while (end > start && PHP_TRIM_CHARS.includes(value[end - 1] as string)) end -= 1
    return value.slice(start, end)
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
        const error = parseExpressionPath(expr).ok ? null : ('expression_syntax_error' as const)
        parts.push({ kind: 'fragment', start: open, end: close + 2, raw, expr, error })
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
