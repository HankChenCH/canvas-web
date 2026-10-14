/**
 * 最小调用形解析纯函数（expression-type-methods 工单 12，spec §1.1/§1.2 ⑦⑨）。
 *
 * JS 预览端最小文法面 = **结构面识别、名单面不校验**（spec §1.2 ⑨）：
 * - 分类（⑦）：trim 后首个 token（ASCII 特界符/空白前）其后紧跟可选空白与 `(` 即
 *   调用，否则路径——`foo(bar)` / `日期(bar)` / `foo (bar)` 均按调用分类（白名单
 *   校验后置），`{{date}}` 无 `(` 恒为路径，数据集根键叫 date 合法。
 * - 结构错（括号不平衡、空参数位、尾逗号、字符串未闭合）照 `expression_syntax_error`
 *   同码标红；首参必须为路径（§1.2 ① 文法层钉死）同面标红。
 * - **未知函数名不在 JS 标红**（PHP 权威端先发新函数、编辑器后跟期间避免「求值
 *   正常但编辑器假红」的名单漂移）；签名面（参数个数/第二参类型/n 范围）同不校验。
 * - 算法逐字节镜像 php-canvas-next `InterpolationEvaluator::resolveFragment /
 *   parseCallArgs / parseCallArg`（权威端）：路径实参吞至 `,`/`)` 为止（段内空白
 *   属于键名，缺逗号非结构错）、字符串仅单引号 `''` 翻倍转义、数字无符号无指数。
 *
 * 字符集对 PHP 逐字对齐：跳空白用 PHP skipWs 四字符（" \t\n\r"）；分类与
 * parseCallArg 的 trim 用 PHP trim() 默认六字符（PHP_TRIM_CHARS，与 expressionScan
 * 同源语义）。JS `String.trim()`/正则 `\s` 含全角空白等 Unicode 集，会造成漂移勿用。
 *
 * 全模块纯函数、零 DOM；层内依赖仅 expressionPath（实参路径空段校验同码）。
 */
import { parseExpressionPath, type ExpressionSyntaxError } from './expressionPath'

/** PHP trim() 默认字符集（与 expressionScan 的 PHP_TRIM_CHARS 同一语义面） */
const TRIM_CHARS = ' \t\n\r\0\x0B'

/** PHP skipWs 字符集（比 trim 少 NUL/垂直制表——权威端两套字符集本就不同，逐字对齐） */
const WS_CHARS = ' \t\n\r'

/** ⑦ 分类首 token 的终止字符（PHP 正则 [^()',.\s]+ 的 ASCII \s = 六字符） */
const HEAD_STOP_CHARS = `()',.${TRIM_CHARS}`

function phpTrim(value: string): string {
    let start = 0
    let end = value.length
    while (start < end && TRIM_CHARS.includes(value[start] as string)) start += 1
    while (end > start && TRIM_CHARS.includes(value[end - 1] as string)) end -= 1
    return value.slice(start, end)
}

function skipWs(expr: string, pos: number): number {
    while (pos < expr.length && WS_CHARS.includes(expr[pos] as string)) pos += 1
    return pos
}

/** 实参形态（spec §1.1 实参 := 路径 | 字符串 | 数字；value = 归一后文本） */
export interface ExpressionCallArg {
    type: 'path' | 'string' | 'number'
    value: string
}

export type ExpressionCallParse =
    | { ok: true; name: string; args: readonly ExpressionCallArg[] }
    | { ok: false; error: ExpressionSyntaxError; kind: ExpressionCallErrorKind; at: ExpressionErrorRange }

/**
 * 结构错子类（编辑器诊断面，expression-syntax-diagnostics 工单 01）：呈现轴，
 * 不入跨端 fixture（位置本就由本端派生并由单测锁死）；中文措辞映射在 vue 层
 * useExpressionDiagnostics。分类对齐权威端 InterpolationEvaluator 的消息面
 * （spec §5.2），缺左括号从「括号不平衡」单列便于提示。
 */
export type ExpressionCallErrorKind =
    | 'missing_open_paren' // 名字后缺 (
    | 'unbalanced_paren' // 实参表缺右括号（含尾逗号后即串尾）
    | 'unterminated_string' // 字符串字面量未闭合
    | 'empty_arg_slot' // 尾逗号空位 / 空路径参数位
    | 'bad_arg_syntax' // 实参位出现非法字符（数字截断后的分隔位等）
    | 'trailing_after_call' // 调用后有多余内容
    | 'first_arg_not_path' // 首参非路径（§1.2 ① 文法层）
    | 'invalid_path_arg' // 路径实参空段/非法
    | 'invalid_path' // 非调用形态直入（防御面：形态分类归调用方，此处对齐路径分支）

/** 出错子范围（expr 内坐标，end 独占） */
export interface ExpressionErrorRange {
    start: number
    end: number
}

/** 失败分支统一构造（error 码恒 expression_syntax_error，零新 code） */
function fail(kind: ExpressionCallErrorKind, start: number, end: number): ExpressionCallParse {
    return { ok: false, error: 'expression_syntax_error', kind, at: { start, end } }
}

/**
 * ⑦ 片段分类：首 token 后紧跟可选空白与 `(` 即调用。expr 须已 trim（片段扫描
 * 职责，与 parseExpressionPath 契约一致）。
 */
export function isCallFragment(expr: string): boolean {
    let head = 0
    while (head < expr.length && !HEAD_STOP_CHARS.includes(expr[head] as string)) head += 1
    if (head === 0) return false
    let pos = head
    while (pos < expr.length && TRIM_CHARS.includes(expr[pos] as string)) pos += 1
    return expr[pos] === '('
}

/**
 * 完整调用形结构解析（scan 错误信号与补全路由共用）：只判结构面 + 首参路径
 * （文法层），名单/签名面不校验。expr 须已 trim；非调用形态由调用方分类后进入。
 */
export function parseExpressionCall(expr: string): ExpressionCallParse {
    let head = 0
    while (head < expr.length && !HEAD_STOP_CHARS.includes(expr[head] as string)) head += 1
    if (head === 0) return fail('invalid_path', 0, expr.length) // 防御面（对齐路径分支语义）
    const name = expr.slice(0, head)

    // 实参表骨架（镜像 parseCallArgs）：skipWs 四字符后必须 (，尾随内容即结构错
    let pos = skipWs(expr, head)
    if (pos >= expr.length || expr[pos] !== '(') return fail('missing_open_paren', head, expr.length)
    const openParen = pos
    pos = skipWs(expr, pos + 1)

    const args: ExpressionCallArg[] = []
    // 实参范围并行表（expr 坐标）：首参/路径实参诊断的出错子范围取材
    const spans: ExpressionErrorRange[] = []
    if (pos < expr.length && expr[pos] === ')') {
        pos += 1
    } else {
        for (;;) {
            if (pos >= expr.length) return fail('unbalanced_paren', openParen, expr.length)
            const arg = parseCallArg(expr, pos)
            if (!arg.ok) return arg
            args.push(arg.value)
            spans.push({ start: arg.start, end: arg.end })
            pos = skipWs(expr, arg.end)
            if (pos >= expr.length) return fail('unbalanced_paren', openParen, expr.length)
            if (expr[pos] === ',') {
                const comma = pos
                pos = skipWs(expr, pos + 1)
                if (pos < expr.length && expr[pos] === ')') {
                    return fail('empty_arg_slot', comma + 1, pos) // 空参数位
                }
                continue
            }
            if (expr[pos] === ')') {
                pos += 1
                break
            }
            return fail('bad_arg_syntax', pos, pos + 1) // 调用实参语法错
        }
    }

    pos = skipWs(expr, pos)
    if (pos !== expr.length) return fail('trailing_after_call', pos, expr.length) // 调用后有多余内容（首个非空白字符起）

    // 首参文法层钉死为路径（§1.2 ①）：'格式化常量' 是伪场景，误用更早一层被抓住
    if (args[0] !== undefined && args[0].type !== 'path') {
        const span = spans[0] as ExpressionErrorRange
        return fail('first_arg_not_path', span.start, span.end)
    }
    // 路径实参空段与求值器同码（resolveCallArgValue 的 explode + 空段检查前移至此）
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i] as ExpressionCallArg
        const span = spans[i] as ExpressionErrorRange
        if (arg.type === 'path' && !parseExpressionPath(arg.value).ok) {
            return fail('invalid_path_arg', span.start, span.end)
        }
    }

    return { ok: true, name, args }
}

type CallArgParse =
    | { ok: true; value: ExpressionCallArg; start: number; end: number }
    | { ok: false; error: ExpressionSyntaxError; kind: ExpressionCallErrorKind; at: ExpressionErrorRange }

/** 单实参解析（镜像 parseCallArg 三分派）：' 串 / 数字 / 路径吞至 ,/) 止后 trim */
function parseCallArg(expr: string, pos: number): CallArgParse {
    const len = expr.length
    const start = pos
    const ch = expr[pos] as string

    // 字符串字面量：仅单引号，'' 翻倍转义；未闭合 = 结构错（at 自引号起到片段尾）
    if (ch === "'") {
        let cursor = pos + 1
        let buf = ''
        for (;;) {
            if (cursor >= len) {
                return { ok: false, error: 'expression_syntax_error', kind: 'unterminated_string', at: { start, end: len } }
            }
            if (expr[cursor] === "'") {
                if (cursor + 1 < len && expr[cursor + 1] === "'") {
                    buf += "'"
                    cursor += 2
                    continue
                }
                cursor += 1
                break
            }
            buf += expr[cursor]
            cursor += 1
        }
        return { ok: true, value: { type: 'string', value: buf }, start, end: cursor }
    }

    // 数字字面量：无符号十进制 数字+ ['.' 数字+]，无指数（`.` 仅在后随数字时消费）
    if (ch >= '0' && ch <= '9') {
        const isDigitAt = (index: number): boolean => {
            const c = expr[index]
            return c !== undefined && c >= '0' && c <= '9'
        }
        while (isDigitAt(pos)) pos += 1
        if (pos < len && expr[pos] === '.' && isDigitAt(pos + 1)) {
            pos += 1
            while (isDigitAt(pos)) pos += 1
        }
        return { ok: true, value: { type: 'number', value: expr.slice(start, pos) }, start, end: pos }
    }

    // 路径：至顶层 ',' 或 ')' 止后 trim（段内空白属于键名，缺逗号非结构错）
    while (pos < len && expr[pos] !== ',' && expr[pos] !== ')') pos += 1
    const raw = phpTrim(expr.slice(start, pos))
    if (raw === '') {
        return { ok: false, error: 'expression_syntax_error', kind: 'empty_arg_slot', at: { start, end: pos } } // 空参数位
    }
    return { ok: true, value: { type: 'path', value: raw }, start, end: pos }
}

/** 光标槽位（补全路由消费）：光标 = expr 末尾（调用方喂片段的光标前缀） */
export interface ExpressionCallSlotContext {
    /** 函数名（⑦ 首 token；名单面不校验） */
    name: string
    /** 实参槽位（0 起） */
    index: number
    /** 槽内光标前文本（字符串槽 = 引号内原文；其余 = trim 后） */
    text: string
    /** 字符串字面量槽（date 格式串建议面） */
    stringSlot: boolean
}

/**
 * 光标所在实参槽定位：容忍截断前缀（调用未写完/字符串未闭合都是常态输入），
 * 只定位不判错——结构红标归 parseExpressionCall/扫描面。返回 null = 无建议语义的
 * 落点（非调用形态 / 调用已闭合）。
 */
export function expressionCallSlotAtEnd(expr: string): ExpressionCallSlotContext | null {
    let head = 0
    while (head < expr.length && !HEAD_STOP_CHARS.includes(expr[head] as string)) head += 1
    if (head === 0) return null
    let pos = skipWs(expr, head)
    if (pos >= expr.length || expr[pos] !== '(') return null
    pos = skipWs(expr, pos + 1)

    let index = 0
    for (;;) {
        if (pos >= expr.length) return { name: expr.slice(0, head), index, text: '', stringSlot: false }
        const ch = expr[pos] as string

        // 字符串实参：闭合则完整消费；引号未闭合 = 光标在串内（格式串建议面）
        if (ch === "'") {
            let cursor = pos + 1
            for (;;) {
                if (cursor >= expr.length) {
                    return { name: expr.slice(0, head), index, text: expr.slice(pos + 1), stringSlot: true }
                }
                if (expr[cursor] === "'") {
                    if (cursor + 1 < expr.length && expr[cursor + 1] === "'") {
                        cursor += 2
                        continue
                    }
                    cursor += 1
                    break
                }
                cursor += 1
            }
            pos = cursor
        } else if (ch !== ',' && ch !== ')') {
            // 路径/数字实参：吞至顶层 ,/) 止；END = 光标在该槽内
            const argStart = pos
            while (pos < expr.length && expr[pos] !== ',' && expr[pos] !== ')') pos += 1
            if (pos >= expr.length) {
                return { name: expr.slice(0, head), index, text: phpTrim(expr.slice(argStart)), stringSlot: false }
            }
        }

        if (pos >= expr.length) return { name: expr.slice(0, head), index: index + 1, text: '', stringSlot: false }
        if (expr[pos] === ')') return null // 调用闭合：无建议
        // 顶层 ','：进入下一参槽
        index += 1
        pos = skipWs(expr, pos + 1)
    }
}
