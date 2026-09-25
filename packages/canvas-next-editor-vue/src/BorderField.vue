<script setup lang="ts">
/**
 * BorderField：四边边框控件——每边「启用 + 宽 + 色」一行，禁用 = 置 null
 * （对齐解码语义：width 0 或缺边即无边框）。子输入实时提交整个 Border 对象，
 * change/blur 收口；宽 ≤ 0 视为关闭该边。
 */
import type { Border, BorderSide } from '@hankchen/canvas-next-editor'

import type { FieldDef } from './fieldSchema'
import NumberField from './NumberField.vue'

const props = defineProps<{ field: FieldDef; modelValue: Border }>()

const emit = defineEmits<{ input: [value: Border]; change: [value: Border] }>()

type SideKey = keyof Border

// 伪字段描述：key 仅作配置标识（integer/min 供 NumberField 消化），提交按整个
// Border 对象组装，不按 key 寻址
const SIDES: readonly { side: SideKey; label: string; field: FieldDef; widthField: FieldDef }[] = (
    [
        ['top', '上'],
        ['bottom', '下'],
        ['left', '左'],
        ['right', '右'],
    ] as const
).map(([side, label]) => ({
    side: side as SideKey,
    label,
    field: { key: ['border', side, 'enabled'], label, control: 'boolean' },
    widthField: { key: ['border', side, 'width'], label, control: 'number', integer: true, min: 0 },
}))

const DEFAULT_SIDE: BorderSide = { width: 1, color: '#000000' }

/** 展示态：null 边显示宽 0（输入框禁用），启用边取实际值 */
function sideWidth(side: BorderSide | null): number {
    return side?.width ?? 0
}

function sideColor(side: BorderSide | null): string {
    return side?.color ?? '#000000'
}

function patch(side: SideKey, value: BorderSide | null, final: boolean): void {
    const next: Border = { ...props.modelValue, [side]: value }
    if (final) emit('change', next)
    else emit('input', next)
}

/** 启停切换：开 = 默认边（宽1黑），关 = null；走 change 收口 */
function onToggle(side: SideKey, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked
    patch(side, checked ? { ...DEFAULT_SIDE } : null, true)
}

/** 宽度实时提交；≤ 0 视为关闭该边（解码 width 0 → null 同语义） */
function onWidth(side: SideKey, value: number, final: boolean): void {
    if (value <= 0) {
        patch(side, null, final)
        return
    }
    patch(side, { width: value, color: sideColor(props.modelValue[side]) }, final)
}

/** 颜色实时提交 + change 收口（仅启用边可改；空串不提交） */
function onColor(side: SideKey, event: Event, final: boolean): void {
    const current = props.modelValue[side]
    if (!current) return
    const color = (event.target as HTMLInputElement).value.trim()
    if (color === '') return
    patch(side, { width: current.width, color }, final)
}
</script>

<template>
    <span class="cn-border">
        <label v-for="entry in SIDES" :key="entry.side" class="cn-border__side">
            <input
                class="cn-border__toggle"
                type="checkbox"
                title="启用该边"
                :checked="modelValue[entry.side] !== null"
                @change="onToggle(entry.side, $event)"
            />
            <span class="cn-border__label">{{ entry.label }}</span>
            <NumberField
                class="cn-border__width"
                :field="entry.widthField"
                :model-value="sideWidth(modelValue[entry.side])"
                :disabled="modelValue[entry.side] === null"
                @input="onWidth(entry.side, $event, false)"
                @change="onWidth(entry.side, $event, true)"
            />
            <input
                class="cn-border__color"
                type="color"
                title="边框颜色"
                :value="sideColor(modelValue[entry.side])"
                :disabled="modelValue[entry.side] === null"
                @input="onColor(entry.side, $event, false)"
                @change="onColor(entry.side, $event, true)"
            />
        </label>
    </span>
</template>

<style scoped>
.cn-border {
    display: grid;
    gap: 4px;
}

.cn-border__side {
    display: flex;
    align-items: center;
    gap: 4px;
}

.cn-border__label {
    flex: none;
    width: 14px;
    font-size: 11px;
    color: #6b7280;
}

.cn-border__width {
    flex: 1;
    min-width: 0;
}

.cn-border__color {
    flex: none;
    width: 26px;
    height: 22px;
    padding: 0;
    border: none;
    background: none;
}
</style>
