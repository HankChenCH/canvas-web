<script setup lang="ts">
/**
 * PaddingField：四键内边距控件（top/bottom/left/right 四数值联动）。子输入实时
 * 提交整个 Padding 对象——面板的 mergeKey 按字段路径（shape.padding）合步：
 * 一次聚焦会话内的连续输入并为一步历史，子输入 change/blur 收口。
 * padding 在领域模型是浮点，子字段不开 integer。
 */
import type { Padding } from '@hankchen/canvas-next-editor'

import type { FieldDef } from './fieldSchema'
import NumberField from './NumberField.vue'

const props = defineProps<{ field: FieldDef; modelValue: Padding }>()

const emit = defineEmits<{ input: [value: Padding]; change: [value: Padding] }>()

/** 子输入的伪字段描述：key 仅作展示标识，提交按整个 Padding 对象组装 */
const SIDES: readonly { side: keyof Padding; label: string; field: FieldDef }[] = [
    { side: 'top', label: '上', field: { key: ['padding', 'top'], label: '上', control: 'number' } },
    { side: 'bottom', label: '下', field: { key: ['padding', 'bottom'], label: '下', control: 'number' } },
    { side: 'left', label: '左', field: { key: ['padding', 'left'], label: '左', control: 'number' } },
    { side: 'right', label: '右', field: { key: ['padding', 'right'], label: '右', control: 'number' } },
]

function patch(side: keyof Padding, value: number, final: boolean): void {
    const next: Padding = { ...props.modelValue, [side]: value }
    if (final) emit('change', next)
    else emit('input', next)
}
</script>

<template>
    <span class="cn-padding grid w-full grid-cols-2 gap-1">
        <label v-for="entry in SIDES" :key="entry.side" class="cn-padding__side flex min-w-0 items-center gap-1">
            <span class="cn-padding__label shrink-0 select-none text-[10px] text-cn-muted">{{ entry.label }}</span>
            <NumberField
                class="min-w-0 flex-1"
                :field="entry.field"
                :model-value="modelValue[entry.side]"
                @input="patch(entry.side, $event, false)"
                @change="patch(entry.side, $event, true)"
            />
        </label>
    </span>
</template>
