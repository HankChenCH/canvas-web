<script setup lang="ts">
/**
 * BorderField：边框 CSS 风格简写控件（layer-panel-ux 工单 04）——宽+色共享
 * 同一模式与循环按钮（1 单框 / 2 上下|左右两框 / 4 四框，每框宽+色）。某边
 * null = 该边关；初始模式由数据推导（四边全 null 或全等→1、上下等且左右等
 * （含 null 相等）→2、否则→4），数据一变即重推导（不保留上次 UI 态，见
 * useShorthandMode）。展开复制代表值（数据不动）；收缩取代表值（上/左）立即
 * 写回规整——上为 null 收缩到 1 即全 null（无边框），无边框空显示。宽度 0 =
 * 关（对齐解码语义），从空输入正宽度即以默认黑开启；提交仍是完整 Border 对象
 * （wire 数据面不变），面板按 mergeKey 合步，change/blur 收口。
 */
import { computed } from 'vue'

import type { Border, BorderSide } from '@hankchen/canvas-next-editor'

import type { FieldDef } from '../fieldSchema'
import {
    deriveBorderMode,
    sameBorder,
    shrinkBorder,
    SHORTHAND_BOXES,
    type ShorthandBox,
} from '../shorthand'
import { useShorthandMode } from '../useShorthandMode'
import BorderWidthInput from './BorderWidthInput.vue'
import ShorthandModeButton from './ShorthandModeButton.vue'

const props = defineProps<{ field: FieldDef; modelValue: Border }>()

const emit = defineEmits<{ input: [value: Border]; change: [value: Border] }>()

const DEFAULT_COLOR = '#000000'

const { mode, cycle: cycleMode } = useShorthandMode(
    () => props.modelValue,
    deriveBorderMode,
)

const boxes = computed<readonly ShorthandBox[]>(() => SHORTHAND_BOXES[mode.value])

function boxWidth(box: ShorthandBox): number | null {
    return props.modelValue[box.rep]?.width ?? null
}

function boxColor(box: ShorthandBox): string {
    return props.modelValue[box.rep]?.color ?? DEFAULT_COLOR
}

/** 编辑一框：收编边同写代表边值（独立副本，不共享引用） */
function patch(box: ShorthandBox, side: BorderSide | null, final: boolean): void {
    // 领域 Border 逐键 readonly，组装期以可变映射副本折叠
    const next = { ...props.modelValue } as { -readonly [K in keyof Border]: Border[K] }
    for (const key of box.sides) next[key] = side === null ? null : { ...side }
    if (final) emit('change', next)
    else emit('input', next)
}

/** 宽度实时提交；≤ 0 视为关闭（解码 width 0 → null 同语义），正数即默认黑开启 */
function onWidth(box: ShorthandBox, value: number, final: boolean): void {
    const color = props.modelValue[box.rep]?.color ?? DEFAULT_COLOR
    patch(box, value <= 0 ? null : { width: value, color }, final)
}

/** 颜色实时提交 + change 收口（仅启用框可改；空串不提交） */
function onColor(box: ShorthandBox, event: Event, final: boolean): void {
    const current = props.modelValue[box.rep]
    if (!current) return
    const color = (event.target as HTMLInputElement).value.trim()
    if (color === '') return
    patch(box, { width: current.width, color }, final)
}

/** 模式循环：展开不改数据（完整对象已覆盖高模式表达）；收缩立即写回规整 */
function cycle(): void {
    const { from, to } = cycleMode()
    if (to < from) {
        const collapsed = shrinkBorder(props.modelValue, to)
        if (!sameBorder(collapsed, props.modelValue)) emit('change', collapsed)
    }
}
</script>

<template>
    <span class="cn-border flex w-full min-w-0 items-center gap-1">
        <ShorthandModeButton :mode="mode" label="边框" @cycle="cycle" />
        <!-- 边框每框 = 一行宽+色，各模式都是单列纵排 -->
        <span class="grid min-w-0 flex-1 gap-1 grid-cols-1">
            <label v-for="box in boxes" :key="box.rep" class="flex items-center gap-1.5">
                <span class="w-5 shrink-0 select-none text-[10px] leading-none text-cn-muted">{{ box.label }}</span>
                <BorderWidthInput
                    class="cn-border__width"
                    :value="boxWidth(box)"
                    :label="box.label"
                    @input="onWidth(box, $event, false)"
                    @change="onWidth(box, $event, true)"
                />
                <input
                    class="cn-border__color size-6 shrink-0 cursor-pointer self-center rounded-md border border-cn-field-line bg-cn-field p-0.5 transition-colors hover:border-cn-muted/40 disabled:cursor-not-allowed disabled:opacity-40"
                    type="color"
                    title="边框颜色"
                    :value="boxColor(box)"
                    :disabled="modelValue[box.rep] === null"
                    @input="onColor(box, $event, false)"
                    @change="onColor(box, $event, true)"
                />
            </label>
        </span>
    </span>
</template>
