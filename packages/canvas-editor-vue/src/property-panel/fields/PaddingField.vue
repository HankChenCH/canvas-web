<script setup lang="ts">
/**
 * PaddingField：内边距 CSS 风格简写控件（layer-panel-ux 工单 04）——单按钮
 * 循环 1→2→4 值模式（1 四边一框 / 2 上下|左右两框 / 4 四框）。初始模式由数据
 * 推导（四值全等→1、上下等且左右等→2、否则→4），数据一变即重推导（不保留
 * 上次 UI 态，见 useShorthandMode）。展开复制代表值（数据不动）；收缩取代表值
 * （上/左）立即经 change 收口写回规整——数据不因纯 UI 操作失去一致性。提交仍是
 * 完整 Padding 对象（wire 数据面不变），面板按 mergeKey 合步：子输入 input
 * 实时提交、change/blur 收口，一次聚焦会话一步历史。
 */
import { computed } from 'vue'

import type { Padding } from '@hankchen/canvas-editor'

import type { FieldDef } from '../fieldSchema'
import {
    derivePaddingMode,
    samePadding,
    shrinkPadding,
    SHORTHAND_BOXES,
    type ShorthandBox,
} from '../shorthand'
import { useShorthandMode } from '../useShorthandMode'
import NumberField from './NumberField.vue'
import ShorthandModeButton from './ShorthandModeButton.vue'

const props = defineProps<{ field: FieldDef; modelValue: Padding }>()

const emit = defineEmits<{ input: [value: Padding]; change: [value: Padding] }>()

const { mode, cycle: cycleMode } = useShorthandMode(
    () => props.modelValue,
    derivePaddingMode,
)

const boxes = computed<readonly ShorthandBox[]>(() => SHORTHAND_BOXES[mode.value])

/** 子输入的伪字段描述：key 仅作展示标识，提交按整个 Padding 对象组装 */
function boxField(box: ShorthandBox): FieldDef {
    return { key: ['padding', box.rep], label: box.label, control: 'number' }
}

/** 编辑一框：收编边同写输入值，其余边保留现值（始终组装完整 Padding 提交） */
function patch(box: ShorthandBox, value: number, final: boolean): void {
    // 领域 Padding 逐键 readonly，组装期以可变映射副本折叠
    const next = { ...props.modelValue } as { -readonly [K in keyof Padding]: Padding[K] }
    for (const side of box.sides) next[side] = value
    if (final) emit('change', next)
    else emit('input', next)
}

/** 模式循环：展开不改数据（完整对象已覆盖高模式表达）；收缩立即写回规整 */
function cycle(): void {
    const { from, to } = cycleMode()
    if (to < from) {
        const collapsed = shrinkPadding(props.modelValue, to)
        if (!samePadding(collapsed, props.modelValue)) emit('change', collapsed)
    }
}
</script>

<template>
    <!-- 间距节奏与 BorderField 对齐（外层/格内均 gap-1.5、框标签定宽 w-5）：
         两条简写行相邻时标签与输入的列缘同线（消除内嵌行视差） -->
    <span class="cn-padding flex w-full min-w-0 items-center gap-1.5">
        <ShorthandModeButton :mode="mode" label="内边距" @cycle="cycle" />
        <span class="grid min-w-0 flex-1 gap-1.5" :class="mode === 1 ? 'grid-cols-1' : 'grid-cols-2'">
            <label v-for="box in boxes" :key="box.rep" class="flex min-w-0 items-center gap-1.5">
                <span class="w-5 shrink-0 select-none text-[10px] leading-none text-cn-muted">{{ box.label }}</span>
                <NumberField
                    class="min-w-0 flex-1"
                    :field="boxField(box)"
                    :model-value="modelValue[box.rep]"
                    @input="patch(box, $event, false)"
                    @change="patch(box, $event, true)"
                />
            </label>
        </span>
    </span>
</template>
