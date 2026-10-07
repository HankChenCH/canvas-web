<script setup lang="ts">
/**
 * NumberField：数值输入控件。提交语义（工单 09）——input 逐次实时提交（面板按
 * mergeKey 合并为一步历史），change/blur 收口（change 可重复发出，面板侧同值
 * 最终提交幂等）；integer 字段向零截断，min/max 钳位（PHP intval 同门）。
 * 聚焦期间本地草稿自由编辑；''/'-'/'1e' 等非法中间态不提交（空串会被 Number
 * 归 0，须显式排除），非法收口时回显文档值；未聚焦时的外部变更（拖动/撤销）
 * 回同步草稿。
 */
import { ref, watch } from 'vue'

import type { FieldDef } from '../fieldSchema'
import { numberField } from '../controlStyles'

const props = defineProps<{ field: FieldDef; modelValue: number }>()

const emit = defineEmits<{ input: [value: number]; change: [value: number] }>()

const draft = ref(String(props.modelValue))
const focused = ref(false)

// 聚焦中的草稿是用户输入现场，外部变更（实时提交回声除外——值已一致）不打扰
watch(
    () => props.modelValue,
    (value) => {
        if (!focused.value) draft.value = String(value)
    },
)

function clamp(value: number): number {
    let out = props.field.integer ? Math.trunc(value) : value
    if (props.field.min !== undefined) out = Math.max(props.field.min, out)
    if (props.field.max !== undefined) out = Math.min(props.field.max, out)
    return out
}

/** 空串/非数字串都视为未成形的输入（Number('') === 0 会把清空误提交为 0） */
function parse(input: HTMLInputElement): number | null {
    if (input.value.trim() === '') return null
    const parsed = Number(input.value)
    return Number.isFinite(parsed) ? parsed : null
}

function onInput(event: Event): void {
    const input = event.target as HTMLInputElement
    draft.value = input.value
    const parsed = parse(input)
    if (parsed === null) return
    emit('input', clamp(parsed))
}

/** change/blur 收口（双发幂等）：草稿自愈为钳位后的提交值；非法值回显文档值 */
function onFinish(event: Event): void {
    const parsed = parse(event.target as HTMLInputElement)
    if (parsed === null) {
        draft.value = String(props.modelValue)
        return
    }
    const value = clamp(parsed)
    draft.value = String(value)
    emit('change', value)
}
</script>

<template>
    <input
        v-model="draft"
        class="cn-field cn-field--number"
        :class="numberField"
        type="number"
        :aria-label="field.label"
        :min="field.min"
        :max="field.max"
        :step="field.step ?? (field.integer ? 1 : 0.1)"
        @input="onInput"
        @focus="focused = true"
        @blur="onFinish"
        @change="onFinish"
    />
</template>
