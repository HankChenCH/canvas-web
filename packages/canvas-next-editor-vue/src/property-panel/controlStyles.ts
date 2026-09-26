/**
 * 面板控件的 shadcn anatomy 配方（暗色面板命名空间）。
 *
 * Tailwind 按文本扫描类名，跨 SFC 复用的配方收口在这里——避免九个控件各写
 * 一遍 input 样式串。令牌语义见 panel-theme.css（--cn-* → @theme inline →
 * --color-cn-* → bg-cn-field 等工具类）。
 */

/** 文本/数值输入的共有配方：h-7、圆角、发丝描边、focus 天蓝内环；flex-1 撑满行 */
export const fieldBase =
    'h-7 flex-1 w-full min-w-0 rounded-md border border-cn-field-line bg-cn-field text-[11.5px] leading-none text-cn-fg ' +
    'outline-none transition-[border-color,box-shadow,background-color] duration-100 ' +
    'placeholder:text-cn-muted/60 hover:border-cn-muted/40 ' +
    'focus:border-cn-accent/70 focus:ring-[3px] focus:ring-cn-accent/15 ' +
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-cn-field-line'

/** 数值输入：右对齐 + 等宽表格数字（仪器刻度） */
export const numberField = `${fieldBase} text-right font-mono tabular-nums`

/** 文本输入：左对齐 */
export const textField = fieldBase

/** 多行文本：同配方，改为块级纵向 */
export const textareaField =
    'w-full flex-1 min-w-0 resize-y rounded-md border border-cn-field-line bg-cn-field px-2 py-1.5 ' +
    'text-[11.5px] leading-5 text-cn-fg ' +
    'outline-none transition-[border-color,box-shadow] duration-100 ' +
    'placeholder:text-cn-muted/60 hover:border-cn-muted/40 ' +
    'focus:border-cn-accent/70 focus:ring-[3px] focus:ring-cn-accent/15 ' +
    'disabled:cursor-not-allowed disabled:opacity-40'

/** 原生取色器（type=color）：贴边的圆形色票 */
export const colorSwatch =
    'size-7 shrink-0 cursor-pointer self-center rounded-md border border-cn-field-line bg-cn-field p-0.5 ' +
    'transition-colors hover:border-cn-muted/40 disabled:cursor-not-allowed disabled:opacity-40'
