/**
 * 资源表达式模板拆装纯函数（resource-expression-single-ref 工单 05，ADR 0020）：
 * 资源字段控件壳（resourceValue 控件 / imageSrc 表达式态）在 `{{path}}` ⇄
 * `path` 间拆装——选择器 v-model 只见裸点路径，`{{}}` 外壳归壳层。
 *
 * strip 的合法面与内核资源单值门（resourcePathDiagnostics，工单 03）严格同域：
 * 门放行 ⇔ 拆得出裸路径——判定直接消费门诊断（单一事实源，不平行复刻锚定/
 * trim/括号规则），提取再走同款锚定正则 + phpTrim（内核 expressionScan 单一
 * 事实源）收整。违例形态（多片段拼接/片段外字面/函数调用/空片段/无片段）返回
 * null，调用方把原文原样交给选择器只读回显（工单 05 ③ 存量违例显示面）。
 * attach 恒产出规范形态 `{{path}}`。
 *
 * 本模块纯函数、零 DOM。
 */
import { phpTrim, resourcePathDiagnostics } from '@hankchen/canvas-editor'

/**
 * 拆壳：合法单值引用 → 裸点路径（片段内空白按 phpTrim 收整）；违例/拆不动 →
 * null（原文只读回显面）。
 */
export function stripResourceTemplate(template: string): string | null {
    if (resourcePathDiagnostics(template).length > 0) return null
    // 门放行保证形态 = 整串 `{{…}}`（容单尾 LF）：同款锚定提取片段内容
    const anchored = template.endsWith('\n') ? template.slice(0, -1) : template
    const matched = /^\{\{([^{}]*)\}\}$/.exec(anchored)
    const inner = matched?.[1]
    if (inner === undefined) return null
    const path = phpTrim(inner)
    return path === '' ? null : path
}

/** 包壳：裸点路径 → 规范形态 `{{path}}`（提交面模板原文） */
export function attachResourceTemplate(path: string): string {
    return `{{${path}}}`
}
