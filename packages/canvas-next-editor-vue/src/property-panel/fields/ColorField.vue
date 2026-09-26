<script setup lang="ts">
/**
 * ColorField：颜色控件（研究文档 §2.7 的组合控件决策）——文本输入保留任意
 * CSS 色串能力（契约里颜色是字符串，rgba()/命名色都合法），原生取色器提供
 * 快捷拾色（只吐 #rrggbb）。nullable 字段（背景色）以复选框表达 null 语义。
 * 取色器拖动实时提交（合步），文本输入/启停切换走 change 收口。
 */
import { ref, watch } from 'vue'

import type { FieldDef } from '../fieldSchema'
import { colorSwatch, fieldBase } from '../controlStyles'

const props = defineProps<{ field: FieldDef; modelValue: string | null }>()

const emit = defineEmits<{ input: [value: string | null]; change: [value: string | null] }>()

const FALLBACK_HEX = '#000000'

/** 启用态 = 非 null；取色器只认 #rrggbb，非 hex 色串回退黑（文本框仍显示原串） */
const enabled = ref(props.modelValue !== null)
const swatchHex = ref(toHex(props.modelValue))

watch(
    () => props.modelValue,
    (value) => {
        enabled.value = value !== null
        if (!enabled.value) return
        swatchHex.value = toHex(value)
    },
)

function toHex(value: string | null): string {
    return value !== null && /^#[0-9a-fA-F]{6}$/.test(value) ? value : FALLBACK_HEX
}

/** 启停切换 = 结构变化，走 change 收口（一步历史） */
function onToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked
    enabled.value = checked
    if (!checked) {
        emit('change', null)
        return
    }
    const restored = swatchHex.value
    emit('change', restored)
}

/** 取色器拖动：实时提交（input），change 收口由原生事件走 onSwatchChange */
function onSwatchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value
    swatchHex.value = value
    emit('input', value)
}

function onSwatchChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value
    swatchHex.value = value
    emit('change', value)
}

/** 文本输入：change（blur/Enter）整段收口；清空 = nullable 时置 null，否则保留 */
function onTextChange(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim()
    if (raw === '') {
        if (props.field.nullable) emit('change', null)
        return
    }
    swatchHex.value = toHex(raw)
    emit('change', raw)
}
</script>

<template>
    <span class="cn-color flex min-w-0 flex-1 items-center gap-1.5">
        <input
            v-if="field.nullable"
            class="cn-color__toggle size-3.5 shrink-0 cursor-pointer accent-cn-accent"
            type="checkbox"
            title="启用颜色"
            :checked="enabled"
            @change="onToggle"
        />
        <input
            class="cn-color__swatch"
            :class="colorSwatch"
            type="color"
            :value="swatchHex"
            :disabled="!enabled"
            @input="onSwatchInput"
            @change="onSwatchChange"
        />
        <input
            class="cn-color__text min-w-0 flex-1"
            :class="fieldBase"
            type="text"
            :value="modelValue ?? ''"
            :disabled="!enabled"
            placeholder="无"
            @change="onTextChange"
        />
    </span>
</template>
