// fixture 按模块导入（resolveJsonModule，镜像 canvas-next 布局快照 runner 的消费方式）
import { describe, expect, it } from 'vitest'

import fixtureJson from '../fixtures/expression-scan.json'
import { expressionFragmentAtCursor, scanExpressionFragments } from '../../src/shared/expressionScan'
import { expressionPartsToFixtureShape, rebuildTemplateFromParts } from '../support/expressionParts'

/**
 * 表达式片段扫描共享 fixture（contract: expression-scan v1，工单 01）：
 * 用例定义与导出自检在 php-canvas-next/scripts/export-scan-fixtures.php（语义权威
 * = InterpolationEvaluator），JSON 镜像副本提交进本仓由本 runner 消费——fixture
 * diff 即双端扫描语义 diff。再生成：php ../php-canvas-next/scripts/export-scan-fixtures.php
 * （工作区两仓库并列时；CI 单仓跳过再生成，消费提交进仓的 JSON）。
 *
 * 断言规则：
 * - 逐用例：TS 扫描切分与 fixture parts 逐字段一致（kind/text/raw/expr/error）；
 * - 重建恒等：parts 拼回 == 原模板串（切分完整性）；
 * - 光标判定是编辑器侧语义（PHP 无光标概念），不入 fixture，由 expressionScan 单测覆盖。
 */

interface FixturePart {
    kind: 'literal' | 'fragment' | 'open'
    text?: string
    raw?: string
    expr?: string
    error?: string | null
}

interface FixtureCase {
    name: string
    description: string
    template: string
    expect: { parts: FixturePart[] }
}

interface FixtureDocument {
    meta: { contract: string; generator: string; notes: string[] }
    cases: FixtureCase[]
}

const fixture = fixtureJson as FixtureDocument

describe('expression-scan v1 共享 fixture', () => {
    it('契约与生成器标记', () => {
        expect(fixture.meta.contract).toBe('expression-scan v1')
        expect(fixture.meta.generator).toBe('php-canvas-next/scripts/export-scan-fixtures.php')
    })

    it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (_name, fixtureCase) => {
        const scan = scanExpressionFragments(fixtureCase.template)

        // 切分内容逐字段一致（含错误信号）
        expect(expressionPartsToFixtureShape(scan.parts)).toEqual(fixtureCase.expect.parts)

        // 重建恒等：切分拼回 == 原模板串（空字面省略下仍须无缝）
        expect(rebuildTemplateFromParts(scan.parts)).toBe(fixtureCase.template)
    })

    it('错误信号用例的光标判定不受错误影响（片段区域保留）', () => {
        const errorCase = fixture.cases.find((c) => c.name === 'empty-fragment-syntax-error')
        if (!errorCase) throw new Error('fixture 缺少 empty-fragment-syntax-error 用例')
        const scan = scanExpressionFragments(errorCase.template)
        // '名：{{}}'：片段 [2,6)，光标 3 在片段内且片段带语法错误信号
        const part = expressionFragmentAtCursor(scan, 3)
        expect(part).toMatchObject({ kind: 'fragment', error: 'expression_syntax_error' })
    })
})
