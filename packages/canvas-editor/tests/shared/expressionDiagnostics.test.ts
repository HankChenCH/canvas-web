import { describe, expect, it } from 'vitest'

import { expressionDiagnostics } from '../../src/shared/expressionDiagnostics'

/**
 * 模板级诊断汇总（expression-syntax-diagnostics 工单 01）：扫描 + 收集全部闭合
 * 片段的结构错诊断（模板坐标）；open 片段不算错（求值期字面直通，spec §1.2 ⑤）。
 */
describe('expressionDiagnostics', () => {
    it('用户实案：第二处 date 格式串缺收尾引号 → 1 条 unterminated_string，at 指向未闭合字面量', () => {
        const template =
            "{{row.seqno}}、{{row.name}} {{date(row.start_date, 'YYYY年MM月DD日')}} - {{date(row.end_date, 'YYYY年MM月DD日)}} （{{row.time_num}}）。"
        const diagnostics = expressionDiagnostics(template)
        expect(diagnostics).toHaveLength(1)
        expect(diagnostics[0]).toMatchObject({ kind: 'unterminated_string' })
        const diagnostic = diagnostics[0]!
        expect(template.slice(diagnostic.at.start, diagnostic.at.end)).toBe("'YYYY年MM月DD日)")
        expect(template.slice(diagnostic.start, diagnostic.end)).toBe("{{date(row.end_date, 'YYYY年MM月DD日)}}")
    })

    it('合法模板零诊断（含未知函数名——名单面不校验，spec §1.2 ⑨）', () => {
        expect(expressionDiagnostics("{{row.name}} {{date(row.d, 'YYYY-MM-DD')}} {{foo(row.x)}}")).toEqual([])
    })

    it('多处错误全量收集，按片段顺序', () => {
        const diagnostics = expressionDiagnostics('{{row..x}}{{date(y,)}}')
        expect(diagnostics.map((d) => d.kind)).toEqual(['invalid_path', 'empty_arg_slot'])
    })

    it('open 片段不算错（输入 {{ 的中间态不标红）', () => {
        expect(expressionDiagnostics('你好 {{row.nam')).toEqual([])
    })

    it('无片段/纯文本零诊断', () => {
        expect(expressionDiagnostics('纯文本')).toEqual([])
        expect(expressionDiagnostics('')).toEqual([])
    })
})
