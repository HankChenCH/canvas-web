<script setup lang="ts">
/**
 * TextareaField：多行文本控件（文本层内容）。与 TextField 同款提交语义：
 * 实时提交 + change 收口，输入法合成中不实时提交（中文录入预编辑串不进文档）。
 */
import type { FieldDef } from '../fieldSchema'
import { textareaField } from '../controlStyles'

defineProps<{ field: FieldDef; modelValue: string }>()

const emit = defineEmits<{ input: [value: string]; change: [value: string] }>()

let composing = false

function onInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value
    if (composing || (event as InputEvent).isComposing) return
    emit('input', value)
}

function onCompositionStart(): void {
    composing = true
}

function onCompositionEnd(event: Event): void {
    composing = false
    emit('input', (event.target as HTMLTextAreaElement).value)
}

function onChange(event: Event): void {
    composing = false
    emit('change', (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
    <textarea
        class="cn-field"
        :class="textareaField"
        rows="3"
        :value="modelValue"
        @input="onInput"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
        @change="onChange"
    ></textarea>
</template>
