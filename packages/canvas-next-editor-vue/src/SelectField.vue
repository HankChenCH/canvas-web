<script setup lang="ts">
/**
 * SelectField：枚举下拉控件（水平/垂直对齐）。取值域来自注册表 domain
 * （领域常量原样引用），变更走 change 收口（一次切换 = 一步历史）。
 */
import type { FieldDef } from './fieldSchema'

defineProps<{ field: FieldDef; modelValue: string }>()

const emit = defineEmits<{ change: [value: string] }>()

function onChange(event: Event): void {
    emit('change', (event.target as HTMLSelectElement).value)
}
</script>

<template>
    <select class="cn-field" :value="modelValue" @change="onChange">
        <option v-for="option in field.domain ?? []" :key="option" :value="option">{{ option }}</option>
    </select>
</template>
