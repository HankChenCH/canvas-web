import { describe, expect, it } from 'vitest'

import { parseExpressionPath } from '../../src/shared/expressionPath'

/**
 * 路径段解析纯函数：语义权威 = php-canvas-next InterpolationEvaluator::resolveFragment
 * （只读对齐）。head 三分类（row / $root / 裸键含 $index）+ 余段下钻 +
 * 空片段/空路径段 = expression_syntax_error 信号。
 */
describe('parseExpressionPath', () => {
    describe('head 三分类（对齐 resolveFragment 的 match 分支）', () => {
        it('row 前缀分类为行命名空间，余段跟随', () => {
            expect(parseExpressionPath('row.name')).toEqual({
                ok: true,
                head: { kind: 'row' },
                rest: ['name'],
            })
        })

        it('row 无余段（{{row}} 形态）rest 为空', () => {
            expect(parseExpressionPath('row')).toEqual({
                ok: true,
                head: { kind: 'row' },
                rest: [],
            })
        })

        it('$root 显式取根分类为 root', () => {
            expect(parseExpressionPath('$root.orderNo')).toEqual({
                ok: true,
                head: { kind: 'root' },
                rest: ['orderNo'],
            })
        })

        it('裸键分类为 bare，多层余段原序下钻', () => {
            expect(parseExpressionPath('orderNo')).toEqual({
                ok: true,
                head: { kind: 'bare', name: 'orderNo' },
                rest: [],
            })
            expect(parseExpressionPath('nested.k')).toEqual({
                ok: true,
                head: { kind: 'bare', name: 'nested' },
                rest: ['k'],
            })
        })

        it('$index 等保留名按裸键分类（非 row/root 专用头）', () => {
            expect(parseExpressionPath('$index')).toEqual({
                ok: true,
                head: { kind: 'bare', name: '$index' },
                rest: [],
            })
        })

        it('头部分类大小写敏感（Row/$ROOT 都是裸键，对齐 PHP match 严格比较）', () => {
            expect(parseExpressionPath('Row.name')).toEqual({
                ok: true,
                head: { kind: 'bare', name: 'Row' },
                rest: ['name'],
            })
            expect(parseExpressionPath('$ROOT.x')).toEqual({
                ok: true,
                head: { kind: 'bare', name: '$ROOT' },
                rest: ['x'],
            })
        })

        it('解析不 trim：空白属于键名（trim 是扫描的职责，对齐求值器先 trim 后 resolve）', () => {
            expect(parseExpressionPath(' row')).toEqual({
                ok: true,
                head: { kind: 'bare', name: ' row' },
                rest: [],
            })
        })
    })

    describe('语法错误信号（expression_syntax_error）', () => {
        it('空片段（trim 后为空）', () => {
            expect(parseExpressionPath('')).toEqual({
                ok: false,
                error: 'expression_syntax_error',
            })
        })

        it('路径中部空段（row..name）', () => {
            expect(parseExpressionPath('row..name')).toEqual({
                ok: false,
                error: 'expression_syntax_error',
            })
        })

        it('前导点/尾点/孤点均为空段错误', () => {
            expect(parseExpressionPath('.name')).toEqual({ ok: false, error: 'expression_syntax_error' })
            expect(parseExpressionPath('row.')).toEqual({ ok: false, error: 'expression_syntax_error' })
            expect(parseExpressionPath('.')).toEqual({ ok: false, error: 'expression_syntax_error' })
        })
    })
})
