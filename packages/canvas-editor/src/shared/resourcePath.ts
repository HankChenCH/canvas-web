/**
 * 资源表达式单值门诊断（resource-expression-single-ref 工单 03，ADR 0020）：
 * 已标记的图片地址/二维码值表达式必须**恰为一个裸点路径片段**——禁多片段拼接、
 * 禁片段外字面、禁内建函数（格式化标量不是数据端备好的资源引用）、禁空片段。
 *
 * 规则与求值端同源同语义（「约束是语法级的」）：逐条对齐 php-canvas-next
 * `CanvasHydrator::assertSingleResourceRef`（权威端，只读对齐）——整串锚定
 * `^\{\{([^{}]*)\}\}$` + 片段内容 PHP trim 后非空 + 无 `(`。诊断消费面与
 * expressionDiagnostics 同构（ExpressionFragmentDiagnostic：kind + 模板坐标），
 * 资源字段（QR/imageSrc）的面板标错据此路由（PropertyField 接线，工单 03 ③）。
 *
 * PCRE `$` 尾换行 parity（go-canvas 02 钉定的边角）：PCRE `$` 锚（无 `D` 修饰符）
 * 容忍串尾恰一 `\n`，LF LF / CRLF 仍拦；JS 正则 `$` 只认串尾——锚定前显式剥
 * 同款单尾 LF 对齐（求值端对 `{{x}}\n` 放行且尾换行按字面直通，编辑器标红即假红）。
 *
 * 与文本面扫描诊断（expressionScan）的分野：门是**整串判定**，不是片段级扫描——
 * 违例的是「整个值」（多片段/字面残留/无片段时无片段外壳可指），诊断 span 恒为
 * 整个模板串；空片段沿片段面 empty_fragment 同 kind（同一措辞复用）。
 *
 * 全模块纯函数、无 DOM；层内依赖仅 expressionScan（phpTrim + 诊断形态）。
 */
import { phpTrim, type ExpressionFragmentDiagnostic, type ExpressionFragmentErrorKind } from './expressionScan'

/** 整串诊断构造：门是整串判定，span 与出错子范围同为整个模板串 */
function wholeTemplateDiagnostic(template: string, kind: ExpressionFragmentErrorKind): ExpressionFragmentDiagnostic {
    return { kind, start: 0, end: template.length, at: { start: 0, end: template.length } }
}

/**
 * 资源表达式单值门（ADR 0020）：违例恰 1 条诊断、合法零诊断。门只做语法判定，
 * 与数据集/schema 在场无关；`$index`/`$root.` 前缀同为裸点路径放行，片段内
 * 空白属于键名不校验（trim 后非空 + 无 `(` 即过）。
 */
export function resourcePathDiagnostics(template: string): readonly ExpressionFragmentDiagnostic[] {
    const anchored = template.endsWith('\n') ? template.slice(0, -1) : template
    const matched = /^\{\{([^{}]*)\}\}$/.exec(anchored)
    if (matched === null) return [wholeTemplateDiagnostic(template, 'resource_not_single_ref')]
    const path = phpTrim(matched[1] ?? '')
    if (path === '') return [wholeTemplateDiagnostic(template, 'empty_fragment')]
    if (path.includes('(')) return [wholeTemplateDiagnostic(template, 'resource_function_call')]
    return []
}
