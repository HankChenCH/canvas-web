<script setup lang="ts">
/**
 * TextField：单行文本控件（字体引用、图片资源地址等）。实时提交（面板按
 * mergeKey 合步）+ change 收口；输入法合成中（isComposing）不实时提交，
 * 合成结束/收口时整段提交——与内核文本编辑的 IME 守卫同款语义。
 */
import type { FieldDef } from '../fieldSchema'
import { textField } from '../controlStyles'

defineProps<{ field: FieldDef; modelValue: string }>()

const emit = defineEmits<{ input: [value: string]; change: [value: string] }>()

let composing = false

function onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value
    // 合成中的预编辑串不进文档；isComposing 兼容位兜底非标实现
    if (composing || (event as InputEvent).isComposing) return
    emit('input', value)
}

function onCompositionStart(): void {
    composing = true
}

function onCompositionEnd(event: Event): void {
    composing = false
    emit('input', (event.target as HTMLInputElement).value)
}

function onChange(event: Event): void {
    composing = false
    emit('change', (event.target as HTMLInputElement).value)
}
</script>

<template>
    <input
        class="cn-field"
        :class="textField"
        type="text"
        :value="modelValue"
        @input="onInput"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
        @change="onChange"
    />
</template>
