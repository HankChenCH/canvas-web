/**
 * 表达式扫描测试共享辅助（expressionScan 单测与 fixture runner 同用，工单 01）：
 * TS 切分 → fixture part 形态（contract: expression-scan v1，位置字段不入 fixture——
 * PHP 字节索引与 JS 码元索引不同空间）+ 切分重建恒等（parts 拼回 == 原模板串）。
 */
import type { ExpressionScanPart } from '../../src/shared/expressionScan'

export interface FixtureShapePart {
    kind: 'literal' | 'fragment' | 'open'
    text?: string
    raw?: string
    expr?: string
    error?: string | null
}

/** TS 切分 → fixture part 形态（与 expression-scan.json 的 part 字段一一对应） */
export function expressionPartsToFixtureShape(parts: readonly ExpressionScanPart[]): FixtureShapePart[] {
    return parts.map((part) => {
        if (part.kind === 'literal') return { kind: 'literal', text: part.text }
        if (part.kind === 'open') return { kind: 'open', text: part.text, expr: part.expr }
        return { kind: 'fragment', raw: part.raw, expr: part.expr, error: part.error }
    })
}

/** 切分重建：fragment 补回 {{ }} 外壳，literal/open 用原文——无缝拼回即切分完整 */
export function rebuildTemplateFromParts(parts: readonly ExpressionScanPart[]): string {
    return parts
        .map((p) => (p.kind === 'literal' || p.kind === 'open' ? p.text : `{{${p.raw}}}`))
        .join('')
}
