/**
 * 表达式补全浮层的数据契约与接受手术（content-completion 工单 04）。
 * shared 域切片（表达式就地编辑 spec 决策 5 迁入）：属性面板与画布文本编辑两域
 * 共用。
 *
 * 候选源按纯函数注入（CompletionSource）——浮层控件只认这个缝，不认识
 * schema/会话态：工单 05 接线时用内核 02 的 enumerateExpressionCandidates 适配
 * （ExpressionCandidate 结构兼容 CompletionItem），将来 CM6 升级路径同缝替换
 * （评估文档 §3.3 候选源与呈现分离）。本模块零 DOM、零 Vue 依赖。
 */
import { PHP_TRIM_CHARS, type ExpressionScanFragment, type ExpressionScanOpen } from '@hankchen/canvas-editor'

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
    /**
     * 插入后光标从插入文本末端回退的码元数（expression-type-methods 工单 12）：
     * date() 调用插入 = 2（光标落引号内 format 参数占位）、函数名候选 = 1（落括号
     * 内）；缺省 0（落插入末尾）
     */
    cursorBack?: number
    /**
     * 接受时从光标锚位回退替换的长度（工单 12；缺省 = partial 长度）：桶候选携带
     * 整段 expr 长度——调用插入重写「前缀 + 部分段」全量
     */
    replaceLen?: number
    /**
     * 前缀过滤键（工单 12；缺省 = segment）：桶候选 = 字段键名——与同键路径候选
     * 一起按 partial 过滤（segment 是整段调用文本，直接过滤永不匹配）
     */
    filterKey?: string
}

/**
 * 候选源一次求值结果（工单 02 partial/candidates 契约）：浮层据此开合与渲染。
 * 开放映射信号（D10）已随契约废除移除（ADR 0020）——schema 解析边界显式拒绝后，
 * 候选源只服务具体键声明。
 */
export interface CompletionResult {
    /** 正在输入的未完整段（恒为 expr 的后缀，尾点态 = 空后缀） */
    partial: string
    /** 全量合法候选（不按 partial 预过滤——前缀过滤归浮层） */
    candidates: readonly CompletionItem[]
}

/**
 * 候选源契约（纯函数注入缝）：入参 = 光标所在片段表达式（trim 后，可能带单个
 * 补全尾点），出参 = 正在输入的 partial（恒为 expr 后缀，工单 02 契约）+ 全量
 * 合法候选（不按 partial 预过滤——前缀过滤归浮层）；null = 无补全态（语法错误/
 * 无候选），浮层不开。
 */
export type CompletionSource = (expr: string) => CompletionResult | null

/** PHP trim() 默认字符集——内核 expressionScan 导出（单一事实源，勿按值复刻） */

/**
 * 接受手术（工单 12 起光标锚定）：把**光标锚位前**的替换域换成候选段（工单 02
 * 钉定的替换面——非整段重插、不包 `{{}}` 外壳）。part 是扫描产物（start/end 为
 * 码元索引，end 独占），cursor 是刷新时的光标锚位（片段内容区内）；替换域 =
 * [锚位 - 尾随空白 - replaceLen, 锚位 - 尾随空白)，replaceLen 缺省 = partial
 * 长度（路径面与旧行为全等——尾随输入位锚定）、桶候选携带整段 expr 长度（调用
 * 插入重写前缀+部分段，工单 12）。默认替换保留漂移检验（锚位文本须等于 partial，
 * 对不上拒绝手术返回 null 由调用方安全收口）；replaceLen 面由锚位边界把守
 * （expr 全量来自同一次刷新，漂移即越界拒绝）。返回光标 = 插入末端回退
 * cursorBack（format 参数占位/括号内落点）。
 */
export function applyCompletion(
    value: string,
    part: ExpressionScanFragment | ExpressionScanOpen,
    cursor: number,
    partial: string,
    item: Pick<CompletionItem, 'segment' | 'replaceLen' | 'cursorBack'>,
): { value: string; cursor: number } | null {
    const contentStart = part.start + 2
    const contentEnd = part.kind === 'open' ? part.end : part.end - 2
    const anchor = Math.min(cursor, contentEnd)
    let trailing = 0
    while (
        anchor - trailing > contentStart &&
        PHP_TRIM_CHARS.includes(value[anchor - 1 - trailing] as string)
    ) {
        trailing += 1
    }
    const exprEnd = anchor - trailing
    const replaceLen = item.replaceLen ?? partial.length
    const replaceStart = exprEnd - replaceLen
    if (replaceStart < contentStart) return null
    if (item.replaceLen === undefined && value.slice(replaceStart, exprEnd) !== partial) return null
    const cursorBack = item.cursorBack ?? 0
    if (cursorBack > item.segment.length) return null
    return {
        value: value.slice(0, replaceStart) + item.segment + value.slice(exprEnd),
        cursor: replaceStart + item.segment.length - cursorBack,
    }
}
