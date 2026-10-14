<script setup lang="ts">
/**
 * TextareaField：多行文本控件（文本层内容）。与 TextField 同款提交语义：
 * 实时提交 + change 收口，输入法合成中不实时提交（中文录入预编辑串不进文档）。
 *
 * 锁定态（edit-overlay-toolbar 工单 02，会话内容独占门面）：编辑会话期 disabled
 * ——编辑框草稿是内容唯一写入门，面板字段只显示文档现值，退出后随文档通知追平。
 */
import type { FieldDef } from '../fieldSchema'
import { textareaField } from '../controlStyles'

defineProps<{ field: FieldDef; modelValue: string; disabled?: boolean }>()

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
        :disabled="disabled"
        @input="onInput"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
        @change="onChange"
    ></textarea>
</template>
