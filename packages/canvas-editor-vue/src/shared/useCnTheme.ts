/**
 * useCnTheme：编辑器日间/夜间主题状态 composable（editor-theme-light-dark 工票 04，
 * spec §5/§8）。
 *
 * 模块级单例 ref（同一 app 多组件共享同一状态，useTransientFeedback 同款模式）；
 * 值域 light/dark（中文日间/夜间，GLOSSARY 用语），缺省夜间（Q4）。写出即同步
 * `data-cn-theme` 到目标元素——夜间也显式写，保持信号可见（spec §8：纯 CSS 下
 * 「缺省夜间」与「缺席即日间」不可两全，靠显式信号兜底）；除该属性外不写其他
 * 属性。storageKey 传入才读写 localStorage（调用时初始化读、set 时写；持久化
 * 绑定在传入 storageKey 的句柄上），缺省不持久化。document/localStorage 访问
 * 全部延迟到函数体内：模块导入零 DOM 触碰，SSR/测试安全。
 * 不监听 prefers-color-scheme、无切换过渡动画（Q4 明确不做）。不引入新依赖
 * （不用 VueUse；宿主 VueUse 路线见 spec §7/§8）。
 */
import { ref, type Ref } from 'vue'

/** 主题信号属性名：信号只设一处（html），只写这一个属性 */
const THEME_ATTR = 'data-cn-theme'

export type CnTheme = 'light' | 'dark'

/** 模块级单例：多处调用共享同一状态；缺省夜间（Q4） */
const theme = ref<CnTheme>('dark')

/** localStorage 读出的原始串是否为合法主题值 */
function isCnTheme(raw: string | null): raw is CnTheme {
    return raw === 'light' || raw === 'dark'
}

/** 读持久化主题（storage 不可用/存值非法时静默落缺省） */
function readStoredTheme(storageKey: string): CnTheme | null {
    try {
        const raw = localStorage.getItem(storageKey)
        return isCnTheme(raw) ? raw : null
    } catch {
        return null
    }
}

/** 写持久化主题（storage 不可用时静默降级，不阻断主题切换） */
function writeStoredTheme(storageKey: string, t: CnTheme): void {
    try {
        localStorage.setItem(storageKey, t)
    } catch {
        // 隐私模式等 storage 写失败：持久化缺席，主题切换照常
    }
}

/** 把当前主题写到目标元素的信号属性（夜间也显式写） */
function applyTo(el: HTMLElement): void {
    el.setAttribute(THEME_ATTR, theme.value)
}

export function useCnTheme(options?: {
    /** localStorage 持久化键：传入才读写（调用时初始化读、set 时写），缺省不持久化 */
    storageKey?: string
    /** 信号落点注入缝：缺省 () => document.documentElement；返回 null 跳过写入 */
    target?: () => HTMLElement | null
}): { theme: Ref<CnTheme>; set(t: CnTheme): void; toggle(): void } {
    // document/localStorage 访问延迟到函数体内：模块导入零 DOM 触碰
    const storageKey = options?.storageKey
    const getTarget = options?.target ?? (() => document.documentElement)

    if (storageKey !== undefined) {
        const stored = readStoredTheme(storageKey)
        if (stored !== null) theme.value = stored
    }
    const apply = (): void => {
        const el = getTarget()
        if (el !== null) applyTo(el)
    }
    apply() // 初始化即同步信号：宿主调用后 html 信号立即可见

    const set = (t: CnTheme): void => {
        theme.value = t
        apply()
        if (storageKey !== undefined) writeStoredTheme(storageKey, t)
    }

    return {
        theme,
        set,
        toggle: () => {
            set(theme.value === 'dark' ? 'light' : 'dark')
        },
    }
}
