/**
 * 路径段解析纯函数（content-completion 工单 01，spec §4 纯函数 ②）。
 *
 * 语义权威 = php-canvas-next `InterpolationEvaluator::resolveFragment`（只读对齐，
 * 不改求值器）：head 三分类——`row`（行命名空间）/ `$root`（显式取根，与裸名等价）/
 * 裸键（含 `$index` 等 `$` 保留名）——+ 余段原序下钻；空片段、路径含空段
 * （`row..x` / `.x` / `x.`）= `expression_syntax_error` 信号（与求值器同码）。
 *
 * 契约：入参是**已 trim** 的片段表达式（trim 是片段扫描的职责，对齐求值器
 * 先 trim 后 resolve 的次序；本函数不再 trim，空白字符属于键名）。
 * 补全消费侧（schema walker，工单 02）处理「片段内输入 `.` 刷新候选」时，
 * 先剥掉单个尾点（补全点标记）再走本函数——`row.` 按求值器语义是空段错误，
 * 剥点后的 `row` 才是可下钻前缀。
 *
 * 全模块纯函数、无 DOM、零内部依赖（editor-shared-isolation）。
 */

/** 与 PHP 侧 HydrateException 稳定错误码对齐（spec §5.2，三端一致性抓手） */
export type ExpressionSyntaxError = 'expression_syntax_error'

/** head 三分类（对齐 resolveFragment 的 match 分支；大小写敏感，Row/$ROOT 是裸键） */
export type ExpressionPathHead =
    | { kind: 'row' }
    | { kind: 'root' }
    | { kind: 'bare'; name: string }

export type ExpressionPathParse =
    | { ok: true; head: ExpressionPathHead; rest: readonly string[] }
    | { ok: false; error: ExpressionSyntaxError }

/** 解析点路径：head 分类 + 余段；语法不合法（空片段/空段）返回错误信号 */
export function parseExpressionPath(expr: string): ExpressionPathParse {
    if (expr === '') {
        return { ok: false, error: 'expression_syntax_error' }
    }

    const segments = expr.split('.')
    if (segments.includes('')) {
        return { ok: false, error: 'expression_syntax_error' }
    }

    const head = segments[0] as string
    const rest = segments.slice(1)
    if (head === 'row') return { ok: true, head: { kind: 'row' }, rest }
    if (head === '$root') return { ok: true, head: { kind: 'root' }, rest }
    return { ok: true, head: { kind: 'bare', name: head }, rest }
}
