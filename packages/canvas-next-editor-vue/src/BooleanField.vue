<script setup lang="ts">
/**
 * BooleanField：开关控件（autoWidth/autoHeight/autowrap）。切换走 change
 * 收口（一次切换 = 一步历史）。
 */
import type { FieldDef } from './fieldSchema'

defineProps<{ field: FieldDef; modelValue: boolean }>()

const emit = defineEmits<{ change: [value: boolean] }>()

function onChange(event: Event): void {
    emit('change', (event.target as HTMLInputElement).checked)
}
</script>

<template>
    <input class="cn-bool" type="checkbox" :checked="modelValue" @change="onChange" />
</template>
