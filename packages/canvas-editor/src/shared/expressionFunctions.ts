/**
 * 内建函数已知名单与格式建议表（expression-type-methods 工单 12，spec §1.2 ⑨/§2/§3.4）。
 *
 * spec §7 JS 行：结构面识别、名单面不校验；**已知名单只喂补全建议**——本表是
 * v1 白名单（date/number/fixed/percent）的编辑器侧建议数据，不参与任何校验/标红
 * （PHP 权威端先发新函数、编辑器后跟期间避免「求值正常但编辑器假红」的名单漂移；
 * PHP 增函数时此处增量跟随，缺位代价只是少建议不误红）。
 *
 * 具名预设/中文模板快捷项（spec §3.4）：预设是求值面纯糖（'date'/'datetime' 整体
 * 等值命中展开）；中文格式不设求值预设——`YYYY年MM月DD日` 写即所得，编辑器快捷项
 * 与求值面解耦（spec 原文口径）。
 *
 * 全模块零依赖纯数据、零 DOM（editor-shared-isolation）。
 */

/** 一条内建函数建议元数据（segment 由消费方拼装：`名字()` + 光标回落括号内） */
export interface ExpressionFunctionMeta {
    name: string
    /** 签名展示（候选 tooltip/说明位） */
    signature: string
    /** 一句话语义（候选说明位） */
    summary: string
}

/** v1 内建函数白名单的建议面数据（spec §2；顺序 = 文档序，非优先级） */
export const EXPRESSION_FUNCTIONS: readonly ExpressionFunctionMeta[] = [
    { name: 'date', signature: 'date(path[, format])', summary: '日期格式化（moment 风格 token，预设 date/datetime）' },
    { name: 'number', signature: 'number(path[, n])', summary: '千分位分组' },
    { name: 'fixed', signature: 'fixed(path[, n])', summary: '定点补零（缺省 2 位）' },
    { name: 'percent', signature: 'percent(path[, n])', summary: '百分比（乘 100）' },
]

/** 数字族桶建议（工单 11 ②：type=number 字段建议三函数，插入裸调用走缺省参） */
export const NUMBER_FUNCTION_SUGGESTIONS: readonly ExpressionFunctionMeta[] = EXPRESSION_FUNCTIONS.filter((fn) =>
    fn.name !== 'date',
)

/** 一条格式串快捷项（date 第二参字符串槽的建议面） */
export interface ExpressionFormatSuggestion {
    segment: string
    description: string
}

/** date 格式串快捷项：具名预设两枚 + 中文模板（spec §3.4；写即所得不设中文求值预设） */
export const DATE_FORMAT_SUGGESTIONS: readonly ExpressionFormatSuggestion[] = [
    { segment: 'date', description: '预设 → YYYY-MM-DD' },
    { segment: 'datetime', description: '预设 → YYYY-MM-DD HH:mm:ss' },
    { segment: 'YYYY年MM月DD日', description: '中文模板（写即所得）' },
]
