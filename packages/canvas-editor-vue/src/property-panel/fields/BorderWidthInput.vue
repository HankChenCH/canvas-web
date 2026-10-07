<script setup lang="ts">
/**
 * BorderWidthInput：边框宽度输入（layer-panel-ux 工单 04）——null（该边关）
 * 显示空串而非 0（简写模式的「空显示」契约）。草稿语义与 NumberField 同门：
 * input 实时提交成形数值，''/'-' 等非法中间态不提交；change/blur 收口并回显，
 * 非法收口回显文档值；负值/小数向零截断钳 0（提交 0 = 关闭该边，归空显示）。
 */
import { ref, watch } from 'vue'

import { numberField } from '../controlStyles'

const props = defineProps<{
    /** 代表边的当前宽度；null = 关（空显示） */
    value: number | null
    /** 无障碍标签（框语义如 上下/左右/上…） */
    label: string
}>()

const emit = defineEmits<{ input: [value: number]; change: [value: number] }>()

const draft = ref(props.value === null ? '' : String(props.value))
const focused = ref(false)

// 聚焦中的草稿是用户输入现场，外部变更（实时提交回声除外——值已一致）不打扰
watch(
    () => props.value,
    (value) => {
        if (!focused.value) draft.value = value === null ? '' : String(value)
    },
)

function clamp(value: number): number {
    return Math.max(0, Math.trunc(value))
}

/** 空串/非数字串都视为未成形的输入（Number('') === 0 会把清空误提交为 0） */
function parse(input: HTMLInputElement): number | null {
    if (input.value.trim() === '') return null
    const parsed = Number(input.value)
    return Number.isFinite(parsed) ? parsed : null
}

function echo(value: number | null): string {
    return value === null ? '' : String(value)
}

function onInput(event: Event): void {
    const input = event.target as HTMLInputElement
    draft.value = input.value
    const parsed = parse(input)
    if (parsed === null) return
    emit('input', clamp(parsed))
}

/** change/blur 收口（双发幂等）：草稿自愈为提交值；0 = 关 → 归空显示 */
function onFinish(event: Event): void {
    const parsed = parse(event.target as HTMLInputElement)
    if (parsed === null) {
        draft.value = echo(props.value)
        return
    }
    const value = clamp(parsed)
    draft.value = value === 0 ? '' : String(value)
    emit('change', value)
}
</script>

<template>
    <input
        v-model="draft"
        class="cn-field cn-field--number min-w-0 flex-1"
        :class="numberField"
        type="number"
        :aria-label="label"
        :min="0"
        step="1"
        placeholder="无边框"
        title="宽度归 0 即关闭该边"
        @input="onInput"
        @focus="focused = true"
        @blur="onFinish"
        @change="onFinish"
    />
</template>
