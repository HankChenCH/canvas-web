<script setup lang="ts">
/**
 * ResourceValueField：资源内容字段控件（resourceValue，resource-expression-single-ref
 * 工单 05，ADR 0020）——二维码内容字段的换装控件，`{{}}` 拆装壳 + 级联路径选择器。
 *
 * - 表达式态：壳用拆装纯函数（resourceTemplate，判定与内核资源单值门同域）在
 *   `{{path}}` ⇄ `path` 间拆装——选择器 v-model 只见裸点路径，点选提交经包壳
 *   emit input+change（模板原文 `{{path}}`），面板既有 commit → updateDataExpression
 *   管线零改动。存量违例（旧拼接/函数/静态现态切换来的字面）拆不动 → 原文原样
 *   透传选择器只读回显（诊断红边 + 提示归 PropertyField 的 resource 门，工单 03），
 *   菜单在场（source 非空）= 点选即整值替换的修复通道。
 * - 静态态：退化 TextField（字面内容，与既有 QR 静态编辑同语义；无上传/无选择器）。
 * - 双根分支（v-if/v-else）与 FontField 同构：表达式态根 = 选择器（div，诊断
 *   红边经 fallthrough 落框、$el 非 input 点击定位自然退化纯展示）；静态态根 =
 *   input。
 */
import { computed } from 'vue'

import type { CompletionSource } from '../../shared/completion'
import ExpressionPathPicker from '../../shared/ExpressionPathPicker.vue'
import { attachResourceTemplate, stripResourceTemplate } from '../../shared/resourceTemplate'
import type { FieldDef } from '../fieldSchema'
import TextField from './TextField.vue'

const props = defineProps<{
    field: FieldDef
    modelValue: string | null
    /** 取值方式（面板按 expression 标记派生）：表达式态走选择器，静态态走字面输入 */
    dataMode?: 'static' | 'expression'
    /** 候选源（面板同款注入缝）；null = 未绑声明，选择器整体只读回显 */
    source?: CompletionSource | null
    disabled?: boolean
}>()

const emit = defineEmits<{ input: [value: string]; change: [value: string] }>()

const isExpression = computed(() => props.dataMode === 'expression')

/** 表达式态选择器的展示值：拆得出裸路径即 v-model 面；违例原文只读回显 */
const pickerValue = computed(() => {
    const template = props.modelValue ?? ''
    if (!isExpression.value) return ''
    return stripResourceTemplate(template) ?? template
})

/**
 * 选择器点选 → 包壳提交（模板原文走既有 commit 管线，一步历史）。选择器提交
 * 时 update:modelValue 与 change 同发，壳只取前者一处映射（映射回 input+change
 * 双事件——与手工输入同路的 live/收口语义归面板 commit 合步）。
 */
function onPick(path: string): void {
    const template = attachResourceTemplate(path)
    emit('input', template)
    emit('change', template)
}
</script>

<template>
    <ExpressionPathPicker
        v-if="isExpression"
        :model-value="pickerValue"
        :source="source ?? null"
        :disabled="disabled"
        :aria-label="field.label"
        :placeholder="'未选择字段'"
        @update:model-value="onPick"
    />
    <TextField
        v-else
        :field="field"
        :model-value="modelValue ?? ''"
        :aria-label="field.label"
        :disabled="disabled"
        @input="emit('input', $event)"
        @change="emit('change', $event)"
    />
</template>
