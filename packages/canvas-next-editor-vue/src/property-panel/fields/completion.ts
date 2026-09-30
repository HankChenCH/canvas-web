/**
 * 表达式补全浮层的数据契约与接受手术（content-completion 工单 04）。
 *
 * 候选源按纯函数注入（CompletionSource）——浮层控件只认这个缝，不认识
 * schema/会话态：工单 05 接线时用内核 02 的 enumerateExpressionCandidates 适配
 * （ExpressionCandidate 结构兼容 CompletionItem），将来 CM6 升级路径同缝替换
 * （评估文档 §3.3 候选源与呈现分离）。本模块零 DOM、零 Vue 依赖。
 */
import { PHP_TRIM_CHARS, type ExpressionScanFragment, type ExpressionScanOpen } from '@hankchen/canvas-next-editor'

/** 一条补全候选：接受段 + 展示元信息（path 为补全后的完整点路径） */
export interface CompletionItem {
    /** 补全后的完整点路径（头部候选即段名）；展示/悬停用，源未给可省 */
    path?: string
    /** 接受时替换 partial 的段文本 */
    segment: string
    /** schema description（未声明为 undefined） */
    description?: string
    /** schema title（D8 形状树两字段分离透传，未声明为 undefined）——浮层展示回落 description ?? title */
    title?: string
    /** 类型徽标数据（未声明为 undefined） */
    type?: string
}

/**
 * 候选源一次求值结果（工单 02 partial/candidates 契约 + 工单 10 open 信号扩展）：
 * 浮层据此开合与渲染，候选空与否和 open 信号无关（D10 语义）。
 */
export interface CompletionResult {
    /** 正在输入的未完整段（恒为 expr 的后缀，尾点态 = 空后缀） */
    partial: string
    /** 全量合法候选（不按 partial 预过滤——前缀过滤归浮层） */
    candidates: readonly CompletionItem[]
    /**
     * 开放映射信号（D10）：候选来源节点标 open（additionalProperties: true）时为
     * true，非 open 恒缺省——浮层渲染「动态字段，键由模板定义」占位提示行（不可
     * 接受、不进导航序，仅解释无候选的原因），信号在场时候选空也不关浮层。
     */
    open?: boolean
}

/**
 * 候选源契约（纯函数注入缝）：入参 = 光标所在片段表达式（trim 后，可能带单个
 * 补全尾点），出参 = 正在输入的 partial（恒为 expr 后缀，工单 02 契约）+ 全量
 * 合法候选（不按 partial 预过滤——前缀过滤归浮层）+ open 信号（工单 10）；
 * null = 无补全态（语法错误/无候选），浮层不开。
 */
export type CompletionSource = (expr: string) => CompletionResult | null

/** PHP trim() 默认字符集——内核 expressionScan 导出（单一事实源，勿按值复刻） */

/**
 * 接受手术：把片段表达式末尾的 partial 换成候选 segment（工单 02 钉定的替换
 * 面——非整段重插、不包 `{{}}` 外壳）。part 是扫描产物（start/end 为码元索引，
 * end 独占），expr 物理终点 = 片段内容区终点回退 PHP trim 尾空白，partial 恒
 * 为其后缀；值与浮层状态漂移（partial 对不上）时拒绝手术返回 null，由调用方
 * 安全收口。
 */
export function applyCompletion(
    value: string,
    part: ExpressionScanFragment | ExpressionScanOpen,
    partial: string,
    segment: string,
): { value: string; cursor: number } | null {
    const contentStart = part.start + 2
    const contentEnd = part.kind === 'open' ? part.end : part.end - 2
    let trailing = 0
    while (
        contentEnd - trailing > contentStart &&
        PHP_TRIM_CHARS.includes(value[contentEnd - 1 - trailing] as string)
    ) {
        trailing += 1
    }
    const exprEnd = contentEnd - trailing
    const partialStart = exprEnd - partial.length
    if (partialStart < contentStart || value.slice(partialStart, exprEnd) !== partial) return null
    return {
        value: value.slice(0, partialStart) + segment + value.slice(exprEnd),
        cursor: partialStart + segment.length,
    }
}
