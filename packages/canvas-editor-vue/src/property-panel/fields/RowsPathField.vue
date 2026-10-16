<script setup lang="ts">
/**
 * RowsPathField：取行路径控件（rowsPath，rows-path-picker 工单 03）——模板表
 * rowsPath 字段的换装控件，rowsPath mode 级联点选器（数组终点，spec D3）。
 *
 * - 纯点选不设手输缝：候选源 = 面板 rowsPathSource（起点三分流 + 工单 01 剪枝
 *   枚举件），点选数组终点 input+change 双发走既有 updateSpec 管线（spec D7
 *   结构语义透传，面板 commit 合步 = 一步历史；resourceValue 控件同门映射）。
 * - 门态（spec D1）：source null（未绑声明/判别降级）= 选择器无菜单钮只读回显；
 *   弱提示行（缺席原因 + 绑定去向）归 PropertyField 的 bindingGateHint 同缝，
 *   本控件不重复呈现。
 * - 漂移（spec D2）：面板按已提交值判定，红描边经 PropertyField 的
 *   cn-field--invalid fallthrough 落只读展示框——菜单不受影响照常可开可重选。
 */
import type { CompletionSource } from '../../shared/completion'
import ExpressionPathPicker from '../../shared/ExpressionPathPicker.vue'
import type { FieldDef } from '../fieldSchema'

defineProps<{
    field: FieldDef
    modelValue: string
    /** 候选源（面板 rowsPathSource 注入缝）；null = 未绑声明，无菜单只读回显 */
    source?: CompletionSource | null
    disabled?: boolean
}>()

const emit = defineEmits<{ input: [value: string]; change: [value: string] }>()

/** 点选提交：选择器 update:modelValue 与 change 同发，映射回 input+change 双事件（与手工提交同路的 live/收口语义归面板 commit 合步） */
function onPick(path: string): void {
    emit('input', path)
    emit('change', path)
}
</script>

<template>
    <ExpressionPathPicker
        mode="rowsPath"
        :model-value="modelValue"
        :source="source ?? null"
        :disabled="disabled"
        :aria-label="field.label"
        placeholder="未选择行路径"
        @update:model-value="onPick"
    />
</template>
