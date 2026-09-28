import { describe, expect, it } from 'vitest'

import { expressionFragmentAtCursor, scanExpressionFragments } from '../../src/shared/expressionScan'
import { expressionPartsToFixtureShape, rebuildTemplateFromParts } from '../support/expressionParts'

/**
 * 片段扫描纯函数：语义逐条对齐 php-canvas-next InterpolationEvaluator::evaluate
 * 扫描循环（只读对齐）——未闭合 {{ 剩余全字面（编辑器侧另立 open 片段供补全触发）、
 * 片段 trim、{{}} 不嵌套、片段外字面直通、空片段/空路径段 = expression_syntax_error 信号。
 */
describe('scanExpressionFragments', () => {
    /** 切分内容快照（略去位置）：literal=text，fragment=raw/expr/error，open=text/expr */
    const outline = expressionPartsToFixtureShape

    describe('字面直通', () => {
        it('空串无片段', () => {
            expect(scanExpressionFragments('').parts).toEqual([])
        })

        it('不含 {{ 的串整串字面（合法无意义）', () => {
            const scan = scanExpressionFragments('纯文本')
            expect(outline(scan.parts)).toEqual([{ kind: 'literal', text: '纯文本' }])
        })

        it('孤立 }} 无开标记 = 字面直通', () => {
            const scan = scanExpressionFragments('a}}b')
            expect(outline(scan.parts)).toEqual([{ kind: 'literal', text: 'a}}b' }])
        })
    })

    describe('闭合片段', () => {
        it('单片段：外壳剥除 + trim + 语法合法', () => {
            const scan = scanExpressionFragments('{{row.name}}')
            expect(outline(scan.parts)).toEqual([
                { kind: 'fragment', raw: 'row.name', expr: 'row.name', error: null },
            ])
        })

        it('花括号内 ASCII 空白容忍（trim 六字符集：空格/制表/换行/回车/NUL/垂直制表）', () => {
            const scan = scanExpressionFragments('{{\t row.name \n}}')
            expect(outline(scan.parts)).toEqual([
                { kind: 'fragment', raw: '\t row.name \n', expr: 'row.name', error: null },
            ])
        })

        it('字面与片段混排（中文前后缀）', () => {
            const scan = scanExpressionFragments('姓名：{{row.name}}（{{$index}}）')
            expect(outline(scan.parts)).toEqual([
                { kind: 'literal', text: '姓名：' },
                { kind: 'fragment', raw: 'row.name', expr: 'row.name', error: null },
                { kind: 'literal', text: '（' },
                { kind: 'fragment', raw: '$index', expr: '$index', error: null },
                { kind: 'literal', text: '）' },
            ])
        })

        it('相邻片段之间不产空字面（空字面一律省略）', () => {
            const scan = scanExpressionFragments('{{orderNo}}{{row.name}}')
            expect(outline(scan.parts)).toEqual([
                { kind: 'fragment', raw: 'orderNo', expr: 'orderNo', error: null },
                { kind: 'fragment', raw: 'row.name', expr: 'row.name', error: null },
            ])
        })

        it('片段后尾随 }} 为字面', () => {
            const scan = scanExpressionFragments('{{orderNo}}}}')
            expect(outline(scan.parts)).toEqual([
                { kind: 'fragment', raw: 'orderNo', expr: 'orderNo', error: null },
                { kind: 'literal', text: '}}' },
            ])
        })
    })

    describe('未闭合 {{（剩余全字面，编辑器另立 open 片段）', () => {
        it('未闭合尾部拆为前置字面 + open 片段（text 含 {{ 外壳，expr 为 trim 后待输入路径）', () => {
            const scan = scanExpressionFragments('价格 {{row.name')
            expect(outline(scan.parts)).toEqual([
                { kind: 'literal', text: '价格 ' },
                { kind: 'open', text: '{{row.name', expr: 'row.name' },
            ])
        })

        it('片段之后未闭合：闭合片段照常，其后全字面', () => {
            const scan = scanExpressionFragments('A{{orderNo}}B{{unclosed')
            expect(outline(scan.parts)).toEqual([
                { kind: 'literal', text: 'A' },
                { kind: 'fragment', raw: 'orderNo', expr: 'orderNo', error: null },
                { kind: 'literal', text: 'B' },
                { kind: 'open', text: '{{unclosed', expr: 'unclosed' },
            ])
        })

        it('以 {{ 结尾：open 片段 expr 为空（补全触发态）', () => {
            const scan = scanExpressionFragments('x{{')
            expect(outline(scan.parts)).toEqual([
                { kind: 'literal', text: 'x' },
                { kind: 'open', text: '{{', expr: '' },
            ])
        })

        it('未闭合吞并其后的 {{（无 }} 可收口，open 片段直到串尾）', () => {
            const scan = scanExpressionFragments('{{a{{b')
            expect(outline(scan.parts)).toEqual([
                { kind: 'open', text: '{{a{{b', expr: 'a{{b' },
            ])
        })
    })

    describe('{{}} 不嵌套（首个 }} 收口）', () => {
        it('片段内容含 {{（成为键名一部分，与求值器语义一致）', () => {
            const scan = scanExpressionFragments('{{a{{b}}}}')
            expect(outline(scan.parts)).toEqual([
                { kind: 'fragment', raw: 'a{{b', expr: 'a{{b', error: null },
                { kind: 'literal', text: '}}' },
            ])
        })

        it('三连开括号：首 {{ 为外壳，{ 落入内容', () => {
            const scan = scanExpressionFragments('{{{orderNo}}')
            expect(outline(scan.parts)).toEqual([
                { kind: 'fragment', raw: '{orderNo', expr: '{orderNo', error: null },
            ])
        })

        it('四连开括号：内容以前导 {{ 开头', () => {
            const scan = scanExpressionFragments('{{{{orderNo}}}}')
            expect(outline(scan.parts)).toEqual([
                { kind: 'fragment', raw: '{{orderNo', expr: '{{orderNo', error: null },
                { kind: 'literal', text: '}}' },
            ])
        })
    })

    describe('语法错误信号（expression_syntax_error，片段仍保留区域供光标判定）', () => {
        it('空片段 {{}}', () => {
            const scan = scanExpressionFragments('名：{{}}')
            expect(outline(scan.parts)).toEqual([
                { kind: 'literal', text: '名：' },
                { kind: 'fragment', raw: '', expr: '', error: 'expression_syntax_error' },
            ])
        })

        it('纯空白片段 trim 后为空', () => {
            const scan = scanExpressionFragments('名：{{   }}尾')
            expect(outline(scan.parts)).toEqual([
                { kind: 'literal', text: '名：' },
                { kind: 'fragment', raw: '   ', expr: '', error: 'expression_syntax_error' },
                { kind: 'literal', text: '尾' },
            ])
        })

        it('路径空段（row..name）', () => {
            const scan = scanExpressionFragments('{{row..name}}')
            expect(outline(scan.parts)).toEqual([
                { kind: 'fragment', raw: 'row..name', expr: 'row..name', error: 'expression_syntax_error' },
            ])
        })

        it('前导点/尾点空段', () => {
            for (const template of ['{{.name}}', '{{row.name.}}']) {
                const scan = scanExpressionFragments(template)
                expect(scan.parts).toHaveLength(1)
                expect(scan.parts[0]).toMatchObject({ kind: 'fragment', error: 'expression_syntax_error' })
            }
        })

        it('合法片段之后的错误片段照常切分', () => {
            const scan = scanExpressionFragments('{{orderNo}}{{row..x}}尾')
            expect(outline(scan.parts)).toEqual([
                { kind: 'fragment', raw: 'orderNo', expr: 'orderNo', error: null },
                { kind: 'fragment', raw: 'row..x', expr: 'row..x', error: 'expression_syntax_error' },
                { kind: 'literal', text: '尾' },
            ])
        })
    })

    describe('位置（JS 码元索引，end 独占；与 PHP 字节索引空间无关，由本端派生）', () => {
        it('闭合片段 start/end 覆盖含外壳区域，字面区间衔接无缝', () => {
            const scan = scanExpressionFragments('姓名：{{row.name}}（{{$index}}）')
            // '姓名：' 3 码元 + '{{row.name}}' 12 + '（' 1 + '{{$index}}' 10 + '）' 1
            expect(scan.parts.map((p) => [p.start, p.end])).toEqual([
                [0, 3],
                [3, 15],
                [15, 16],
                [16, 26],
                [26, 27],
            ])
        })

        it('切分重建恒等：parts 拼回 == 原串（任意形态）', () => {
            const templates = [
                '',
                '纯文本',
                '{{row.name}}',
                '姓名：{{ row.name }}（{{$index}}）',
                '{{orderNo}}{{row..x}}尾',
                '{{a{{b}}}}',
                '{{{{orderNo}}}}',
                '{{{orderNo}}',
                '价格 {{row.name',
                'x{{',
                '{{unclosed',
                'a}}b',
                '{{订单号}}在{{row.name}}单',
            ]
            for (const template of templates) {
                const scan = scanExpressionFragments(template)
                expect(rebuildTemplateFromParts(scan.parts), template).toBe(template)
            }
        })
    })

    describe('中文内容（码元索引与 PHP 字节索引不同空间，切分内容一致）', () => {
        it('多字节字面与片段交错', () => {
            const scan = scanExpressionFragments('{{row.name}}在{{orderNo}}单')
            expect(outline(scan.parts)).toEqual([
                { kind: 'fragment', raw: 'row.name', expr: 'row.name', error: null },
                { kind: 'literal', text: '在' },
                { kind: 'fragment', raw: 'orderNo', expr: 'orderNo', error: null },
                { kind: 'literal', text: '单' },
            ])
        })

        it('中文裸键', () => {
            const scan = scanExpressionFragments('单号：{{订单号}}')
            expect(outline(scan.parts)).toEqual([
                { kind: 'literal', text: '单号：' },
                { kind: 'fragment', raw: '订单号', expr: '订单号', error: null },
            ])
        })
    })
})

describe('expressionFragmentAtCursor', () => {
    // '姓名：' [0,3) + '{{row.name}}' [3,15) + '后' [15,16) + '{{x' [16,19)
    const scan = scanExpressionFragments('姓名：{{row.name}}后{{x')

    it('光标在闭合片段内容区内 = 该片段', () => {
        expect(expressionFragmentAtCursor(scan, 4)).toMatchObject({ kind: 'fragment', expr: 'row.name' })
        expect(expressionFragmentAtCursor(scan, 13)).toMatchObject({ kind: 'fragment' })
    })

    it('光标紧贴片段边界：{{ 之后在内、}} 之后在外', () => {
        expect(expressionFragmentAtCursor(scan, 5)).toMatchObject({ kind: 'fragment' }) // {{ 后
        expect(expressionFragmentAtCursor(scan, 3)).toBeNull() // {{ 起点（编辑外壳本身）
        expect(expressionFragmentAtCursor(scan, 14)).toMatchObject({ kind: 'fragment' }) // }} 前
        expect(expressionFragmentAtCursor(scan, 15)).toBeNull() // }} 之后（输入 }} 即关闭）
    })

    it('光标在字面区/相邻片段之间 = null', () => {
        expect(expressionFragmentAtCursor(scan, 0)).toBeNull()
        expect(expressionFragmentAtCursor(scan, 2)).toBeNull()
    })

    it('光标在 open 片段（含串尾输入位）= open 片段', () => {
        expect(expressionFragmentAtCursor(scan, 17)).toMatchObject({ kind: 'open', expr: 'x' })
        expect(expressionFragmentAtCursor(scan, 18)).toMatchObject({ kind: 'open' })
        expect(expressionFragmentAtCursor(scan, 19)).toMatchObject({ kind: 'open' }) // 串尾输入位
        expect(expressionFragmentAtCursor(scan, 16)).toBeNull()
    })

    it('无片段命中时返回 null（纯字面串）', () => {
        expect(expressionFragmentAtCursor(scanExpressionFragments('纯文本'), 1)).toBeNull()
    })
})
