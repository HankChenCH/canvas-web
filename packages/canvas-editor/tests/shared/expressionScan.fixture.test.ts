// 语料按模块导入（resolveJsonModule；语料仓 submodule 在仓库根 canvas-semantics/，
// fresh clone 先 git submodule update --init——未检出时本文件 import 解析即红）
import { describe, expect, it } from 'vitest'

import corpusJson from '../../../../canvas-semantics/corpus/expression-scan/v1.0/scan.json'
import surfaceJson from '../../../../support-surface.json'
import { expressionFragmentAtCursor, scanExpressionFragments } from '../../src/shared/expressionScan'
import { expressionPartsToFixtureShape, rebuildTemplateFromParts } from '../support/expressionParts'

/**
 * 表达式片段扫描共享语料 runner（contract: expression-scan v1.0，工单 07 消费翻转）：
 * 语义权威 = 语料仓 canvas-semantics（submodule pin 消费，镜像副本已删除），三端
 * runner 共同消费同一批语料——语料 diff 即语义变更，升级 = 一次可审的 submodule
 * 指针移动。TS 扫描器与求值器扫描面钉在同一份切分语义上。
 *
 * 断言规则：
 * - 契约串与 runner 常量双写互检（语料升版本未同步即红，语义变更可审）；
 * - 逐用例：TS 扫描切分与语料 parts 逐字段一致（kind/text/raw/expr/error）；
 * - 重建恒等：parts 拼回 == 原模板串（切分完整性）；
 * - 光标判定是编辑器侧语义（语料无光标概念），不入语料面，由 expressionScan 单测覆盖。
 */

interface CorpusPart {
    kind: 'literal' | 'fragment' | 'open'
    text?: string
    raw?: string
    expr?: string
    error?: string | null
}

interface CorpusCase {
    name: string
    description: string
    template: string
    expect: { parts: CorpusPart[] }
}

interface CorpusDocument {
    meta: { contract: string; notes: string[] }
    cases: CorpusCase[]
}

// runner 钉定的契约版本串，与语料 meta.contract 双写互检
const SCAN_CONTRACT = 'expression-scan v1.0'

// 支持面声明（互检补边，GOVERNANCE §消费端 pin）：本仓消费的契约 ↔ 仓根
// support-surface.json 钉住的版本。三边分工——常量↔语料在下方钉定断言、
// 声明↔目录在 canvasctl 三互检，此处拦「pin/常量升级而声明漏重签」。
const SURFACE_DECLARATION = surfaceJson as { contracts: { id: string; version: string }[] }
const DECLARED_CONTRACTS = Object.fromEntries(
    SURFACE_DECLARATION.contracts.map((c) => [c.id, `${c.id} ${c.version}`]),
)

const corpus = corpusJson as CorpusDocument

describe('expression-scan v1.0 共享语料', () => {
    it('契约版本钉定（双写互检）', () => {
        expect(corpus.meta.contract).toBe(SCAN_CONTRACT)
    })

    it('支持面声明与 runner 常量一致（双向）', () => {
        expect(DECLARED_CONTRACTS).toEqual({ 'expression-scan': SCAN_CONTRACT })
    })

    it.each(corpus.cases.map((c) => [c.name, c] as const))('%s', (_name, corpusCase) => {
        const scan = scanExpressionFragments(corpusCase.template)

        // 切分内容逐字段一致（含错误信号）
        expect(expressionPartsToFixtureShape(scan.parts)).toEqual(corpusCase.expect.parts)

        // 重建恒等：切分拼回 == 原模板串（空字面省略下仍须无缝）
        expect(rebuildTemplateFromParts(scan.parts)).toBe(corpusCase.template)
    })

    it('错误信号用例的光标判定不受错误影响（片段区域保留）', () => {
        const errorCase = corpus.cases.find((c) => c.name === 'empty-fragment-syntax-error')
        if (!errorCase) throw new Error('语料缺少 empty-fragment-syntax-error 用例')
        const scan = scanExpressionFragments(errorCase.template)
        // '名：{{}}'：片段 [2,6)，光标 3 在片段内且片段带语法错误信号
        const part = expressionFragmentAtCursor(scan, 3)
        expect(part).toMatchObject({ kind: 'fragment', error: 'expression_syntax_error' })
    })
})
