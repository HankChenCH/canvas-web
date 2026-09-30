/**
 * useTransientFeedback：状态栏瞬时反馈的跨域单例（kbd-nav 工单 05）。
 *
 * 模块级 ref 即单例：包内动作直写、StatusBar（status-bar 域）读取显示——域间
 * 禁横引，收口 shared（useShortcutsHelp 同款模式）。来源是包内自身的降级反馈
 * （当前唯一来源 = canvas 域拖文件入画布在 canUpload=false 时被忽略的提示），
 * 与宿主注入的 feedback prop（保存/导出等宿主动作读数，长驻语义）并存：状态栏
 * 宿主文案优先，包内瞬时文案在宿主沉默时补位。瞬时语义 = show 后数秒自动清空。
 */
import { ref, type Ref } from 'vue'

/** 瞬时反馈驻留时长：动作结果一瞥即逝，不与宿主长驻文案争位 */
const FEEDBACK_TTL_MS = 4000

const message = ref('')
let clearTimer: ReturnType<typeof setTimeout> | null = null

export interface TransientFeedback {
    /** 当前瞬时文案（空串 = 无） */
    readonly message: Ref<string>
    /** 显示一条瞬时反馈（替换前一条并重置驻留计时） */
    show(text: string): void
    /** 立即清除当前文案（取消驻留计时） */
    clear(): void
}

export function useTransientFeedback(): TransientFeedback {
    const cancelTimer = () => {
        if (clearTimer !== null) {
            clearTimeout(clearTimer)
            clearTimer = null
        }
    }
    return {
        message,
        show: (text: string) => {
            cancelTimer()
            message.value = text
            clearTimer = setTimeout(() => {
                message.value = ''
                clearTimer = null
            }, FEEDBACK_TTL_MS)
        },
        clear: () => {
            cancelTimer()
            message.value = ''
        },
    }
}
