<script setup lang="ts">
/**
 * BooleanField：开关控件（autoWidth/autoHeight/autowrap），shadcn Switch
 * 形态——原生 checkbox（sr-only）+ peer 联动的轨道/滑块，无运行时依赖。
 * 切换走 change 收口（一次切换 = 一步历史）。
 */
import type { FieldDef } from './fieldSchema'

defineProps<{ field: FieldDef; modelValue: boolean }>()

const emit = defineEmits<{ change: [value: boolean] }>()

function onChange(event: Event): void {
    emit('change', (event.target as HTMLInputElement).checked)
}
</script>

<template>
    <label class="cn-bool relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center">
        <input class="cn-bool__input peer sr-only" type="checkbox" :checked="modelValue" @change="onChange" />
        <span
            class="absolute inset-0 rounded-full border border-cn-field-line bg-cn-field transition-colors duration-150 peer-checked:border-cn-accent/60 peer-checked:bg-cn-accent/30 peer-focus-visible:ring-[3px] peer-focus-visible:ring-cn-accent/20"
        ></span>
        <span
            class="relative mx-0.5 size-3 rounded-full bg-cn-muted shadow-sm transition-transform duration-150 peer-checked:translate-x-3 peer-checked:bg-cn-accent"
        ></span>
    </label>
</template>
