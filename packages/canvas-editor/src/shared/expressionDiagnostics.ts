/**
 * 模板级表达式语法诊断汇总（expression-syntax-diagnostics 工单 01）：
 * 编辑器「输入期标错」的统一取数口——扫描 + 收集全部闭合片段的结构错诊断
 * （kind + 模板坐标出错子范围），供面板/画布提示消费。open 片段不算错（求值期
 * 字面直通，spec §1.2 ⑤）；结构面 only、名单面不校验（§1.2 ⑨，防名单漂移假红）。
 * 全模块纯函数、无 DOM。
 */
import { scanExpressionFragments, type ExpressionFragmentDiagnostic } from './expressionScan'

/** 汇总模板中全部片段的结构错诊断（按片段出现顺序） */
export function expressionDiagnostics(template: string): readonly ExpressionFragmentDiagnostic[] {
    const found: ExpressionFragmentDiagnostic[] = []
    for (const part of scanExpressionFragments(template).parts) {
        if (part.kind === 'fragment' && part.diagnostic !== null) found.push(part.diagnostic)
    }
    return found
}
