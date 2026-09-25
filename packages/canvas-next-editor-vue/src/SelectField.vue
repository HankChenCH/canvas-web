<script setup lang="ts">
/**
 * SelectField：枚举下拉控件（水平/垂直对齐）。取值域来自注册表 domain
 * （领域常量原样引用），变更走 change 收口（一次切换 = 一步历史）。
 * appearance-none + 自绘箭头（箭头 svg 见 panel-theme.css 的 .cn-select）。
 */
import type { FieldDef } from './fieldSchema'

defineProps<{ field: FieldDef; modelValue: string }>()

const emit = defineEmits<{ change: [value: string] }>()

function onChange(event: Event): void {
    emit('change', (event.target as HTMLSelectElement).value)
}
</script>

<template>
    <select
        class="cn-select h-7 w-full min-w-0 flex-1 cursor-pointer appearance-none rounded-md border border-cn-field-line bg-cn-field py-0 pl-2 pr-6 text-[11px] leading-none text-cn-fg outline-none transition-[border-color,box-shadow] duration-100 hover:border-cn-muted/40 focus:border-cn-accent/70 focus:ring-[3px] focus:ring-cn-accent/15 disabled:cursor-not-allowed disabled:opacity-40"
        :value="modelValue"
        @change="onChange"
    >
        <option v-for="option in field.domain ?? []" :key="option" :value="option">{{ option }}</option>
    </select>
</template>
