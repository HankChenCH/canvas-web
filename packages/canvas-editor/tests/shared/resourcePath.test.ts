import { describe, expect, it } from 'vitest'

import { resourcePathDiagnostics } from '../../src/shared/resourcePath'

/**
 * 资源表达式单值门诊断（ADR 0020，resource-expression-single-ref 工单 03）：
 * 规则与 01/02 求值端 `assertSingleResourceRef` 同源同语义——整串锚定「恰一
 * 闭合片段占满」+ 片段内容 trim 后非空 + 无 `(`。用例形态与 php-canvas-next
 * CanvasHydratorTest::resourceViolationProvider 一一对应（同一张形态清单），
 * 另含 02 钉定的 PCRE `$` 尾换行 parity 边角（单尾 LF 放行、LF LF / CRLF 拦下）。
 *
 * 门只做语法判定：`$index`/`$root.` 前缀同为裸点路径放行；片段内空白属于键名
 * 不校验；诊断 span = 整个模板串（门是整串判定，出错的是「整个值」不是子范围）。
 */
describe('resourcePathDiagnostics（合法形态：单值裸路径）', () => {
    it('裸路径 + $root. 根上下文 + $index 行上下文（01 合法三形态）', () => {
        expect(resourcePathDiagnostics('{{orderNo}}')).toEqual([])
        expect(resourcePathDiagnostics('{{$root.orderNo}}')).toEqual([])
        expect(resourcePathDiagnostics('{{$index}}')).toEqual([])
    })

    it('单尾 LF 放行（PCRE $ 锚 parity，02 钉定：求值端尾换行按字面直通）', () => {
        expect(resourcePathDiagnostics('{{orderNo}}\n')).toEqual([])
    })

    it('片段内空白属于键名、门只判语法（ trim 后非空 + 无括号即过）', () => {
        expect(resourcePathDiagnostics('{{ orderNo }}')).toEqual([])
    })
})

describe('resourcePathDiagnostics（违例形态：01 provider 一一对应）', () => {
    /** 违例统一断言：恰 1 条诊断 + kind + 整串 span */
    function expectViolation(template: string, kind: 'resource_not_single_ref' | 'resource_function_call' | 'empty_fragment'): void {
        const diagnostics = resourcePathDiagnostics(template)
        expect(diagnostics).toHaveLength(1)
        expect(diagnostics[0]).toEqual({
            kind,
            start: 0,
            end: template.length,
            at: { start: 0, end: template.length },
        })
    }

    it('多片段拼接', () => {
        expectViolation('{{orderNo}}{{orderNo}}', 'resource_not_single_ref')
    })

    it('片段外字面（尾缀）+ 二维码实案形态', () => {
        expectViolation('{{orderNo}}.png', 'resource_not_single_ref')
        expectViolation('{{orderNo}}-qr', 'resource_not_single_ref')
    })

    it('片段外字面（前缀）', () => {
        expectViolation('https://cdn/{{orderNo}}', 'resource_not_single_ref')
    })

    it('函数调用（资源面禁内建函数，独立 kind 供教学文案）', () => {
        expectViolation('{{number(orderNo, 2)}}', 'resource_function_call')
        expectViolation("{{date(order.issueDate, 'YYYY-MM-DD')}}", 'resource_function_call')
    })

    it('空片段 + 纯空白片段（沿片段面 empty_fragment 同 kind）', () => {
        expectViolation('{{}}', 'empty_fragment')
        expectViolation('{{  }}', 'empty_fragment')
    })

    it('未闭合片段（恰一闭合片段不成立——输入中间态，与文本面 open 不标错的分野：门是整串锚定）', () => {
        expectViolation('{{orderNo', 'resource_not_single_ref')
    })

    it('LF LF / CRLF 尾缀拦下（02 PCRE $ parity：只容忍恰一尾 LF）', () => {
        expectViolation('{{orderNo}}\n\n', 'resource_not_single_ref')
        expectViolation('{{orderNo}}\r\n', 'resource_not_single_ref')
    })

    it('无片段形态（清空/纯文本）同为 not_single_ref', () => {
        expectViolation('', 'resource_not_single_ref')
        expectViolation('orderNo', 'resource_not_single_ref')
    })

    it('片段内容含花括号（嵌套 {{ 形态）不成立', () => {
        expectViolation('{{{{orderNo}}}}', 'resource_not_single_ref')
    })
})
