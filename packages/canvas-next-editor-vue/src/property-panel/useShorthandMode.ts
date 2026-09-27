/**
 * useShorthandMode：简写控件的模式状态机（layer-panel-ux 工单 04，内边距/边框
 * 共用）——模式 = 数据推导为基 + 循环点击的会话内覆盖。覆盖跟着「这一份数据」
 * 走：模型值对象引用一变（图层切换/撤销/任何触及该字段的提交回声）覆盖即失效，
 * 回落推导值（不保留上次 UI 态）；纯 UI 循环与无关字段编辑不动该字段引用，
 * 覆盖保留。
 */
import { computed, ref, watch, type ComputedRef } from 'vue'

import { nextShorthandMode, type ShorthandMode } from './shorthand'

export function useShorthandMode<T>(
    /** 模型值切片的 getter（引用比较决定覆盖是否失效） */
    getValue: () => T,
    /** 初始/回落模式的数据推导（derivePaddingMode / deriveBorderMode） */
    derive: (value: T) => ShorthandMode,
): {
    /** 当前生效模式：覆盖优先，回落推导 */
    mode: ComputedRef<ShorthandMode>
    /**
     * 循环 1→2→4→1 并登记覆盖；返回迁移前后模式——收缩（to < from）时的
     * 取代表值写回规整由调用方提交（padding/border 形态不同，各自 emit）
     */
    cycle: () => { from: ShorthandMode; to: ShorthandMode }
} {
    const derivedMode = computed(() => derive(getValue()))
    const overrideMode = ref<ShorthandMode | null>(null)
    const mode = computed(() => overrideMode.value ?? derivedMode.value)
    watch(getValue, () => {
        overrideMode.value = null
    })

    function cycle(): { from: ShorthandMode; to: ShorthandMode } {
        const from = mode.value
        const to = nextShorthandMode(from)
        overrideMode.value = to
        return { from, to }
    }

    return { mode, cycle }
}
