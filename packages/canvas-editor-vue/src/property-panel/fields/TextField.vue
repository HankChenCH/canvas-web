<script setup lang="ts">
/**
 * TextField：单行文本控件（字体引用、图片资源地址等）。实时提交（面板按
 * mergeKey 合步）+ change 收口；输入法合成中（isComposing）不实时提交，
 * 合成结束/收口时整段提交——与内核文本编辑的 IME 守卫同款语义。
 * 非空校验（field.nonEmpty，spec §2.4 P4）：空提交被控件拦截（不 emit）并标错
 * （红框），键入非空即恢复——空串永不落库（解码 rows_path_missing 硬约束）。
 */
import { ref } from 'vue'

import type { FieldDef } from '../fieldSchema'
import { textField } from '../controlStyles'

const props = defineProps<{ field: FieldDef; modelValue: string }>()

const emit = defineEmits<{ input: [value: string]; change: [value: string] }>()

let composing = false
/** 非空拦截期的本地标错态：纯视觉，不进文档（modelValue 保持旧值） */
const invalid = ref(false)

function blocked(value: string): boolean {
    if (props.field.nonEmpty !== true) return false
    if (value.trim() === '') {
        invalid.value = true
        return true
    }
    invalid.value = false
    return false
}

function onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value
    // 合成中的预编辑串不进文档；isComposing 兼容位兜底非标实现
    if (composing || (event as InputEvent).isComposing) return
    if (blocked(value)) return
    emit('input', value)
}

function onCompositionStart(): void {
    composing = true
}

function onCompositionEnd(event: Event): void {
    composing = false
    const value = (event.target as HTMLInputElement).value
    if (blocked(value)) return
    emit('input', value)
}

function onChange(event: Event): void {
    composing = false
    const value = (event.target as HTMLInputElement).value
    if (blocked(value)) return
    emit('change', value)
}
</script>

<template>
    <input
        class="cn-field"
        :class="[textField, invalid ? 'cn-field--invalid' : '']"
        type="text"
        :value="modelValue"
        :placeholder="field.placeholder"
        @input="onInput"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
        @change="onChange"
    />
</template>
