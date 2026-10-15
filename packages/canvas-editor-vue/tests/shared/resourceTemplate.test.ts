/**
 * 资源表达式模板拆装（resource-expression-single-ref 工单 05）：字段控件壳在
 * `{{path}}` ⇄ `path` 间拆装——strip 的合法面与内核资源单值门
 * （resourcePathDiagnostics，工单 03）严格同域：门放行 ⇔ 拆得出裸路径；违例
 * 形态（拼接/函数/无片段/空片段）原样透传 null，选择器据此只读回显原文。
 */
import { describe, expect, it } from 'vitest'

import {
    attachResourceTemplate,
    stripResourceTemplate,
} from '../../src/shared/resourceTemplate'

describe('stripResourceTemplate：合法单值引用拆出裸路径', () => {
    it('规范形态：{{row.a}} → row.a', () => {
        expect(stripResourceTemplate('{{row.a}}')).toBe('row.a')
    })

    it('片段内空白（键名不校验）：{{ row.a }} → row.a', () => {
        expect(stripResourceTemplate('{{ row.a }}')).toBe('row.a')
    })

    it('头部候选裸段：{{orderNo}} → orderNo；结构头 {{row}}/{{ $index }} 同拆', () => {
        expect(stripResourceTemplate('{{orderNo}}')).toBe('orderNo')
        expect(stripResourceTemplate('{{row}}')).toBe('row')
        expect(stripResourceTemplate('{{ $index }}')).toBe('$index')
    })

    it('PCRE $ 尾换行 parity（工单 03 同源）：{{x}}\\n 拆得出（求值端放行）', () => {
        expect(stripResourceTemplate('{{x}}\n')).toBe('x')
    })

    it('attach = 裸路径包壳；往返恒等（验收：{{row.a}} ⇄ row.a）', () => {
        expect(attachResourceTemplate('row.a')).toBe('{{row.a}}')
        const path = stripResourceTemplate('{{row.a}}')
        expect(path).toBe('row.a')
        expect(attachResourceTemplate(path!)).toBe('{{row.a}}')
    })
})

describe('stripResourceTemplate：违例形态原样透传 null（原文只读面）', () => {
    it('多片段拼接：{{a}}{{b}}', () => {
        expect(stripResourceTemplate('{{a}}{{b}}')).toBeNull()
    })

    it('片段外字面：前缀/后缀残留', () => {
        expect(stripResourceTemplate('前缀{{a}}')).toBeNull()
        expect(stripResourceTemplate('{{a}}后缀')).toBeNull()
    })

    it('内建函数调用：{{date(row.x)}} 拆不出（不是资源引用）', () => {
        expect(stripResourceTemplate('{{date(row.x)}}')).toBeNull()
    })

    it('空片段：{{}} 与 {{   }}（门 empty_fragment 同判）', () => {
        expect(stripResourceTemplate('{{}}')).toBeNull()
        expect(stripResourceTemplate('{{   }}')).toBeNull()
    })

    it('无片段纯文本（静态现态切换来的初值）', () => {
        expect(stripResourceTemplate('')).toBeNull()
        expect(stripResourceTemplate('hello')).toBeNull()
    })

    it('未闭合片段 {{a（open 形态）', () => {
        expect(stripResourceTemplate('{{a')).toBeNull()
    })

    it('双尾换行 / CRLF：PCRE $ parity 拦下', () => {
        expect(stripResourceTemplate('{{x}}\n\n')).toBeNull()
        expect(stripResourceTemplate('{{x}}\r\n')).toBeNull()
    })
})
