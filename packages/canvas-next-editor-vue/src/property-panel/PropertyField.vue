<script setup lang="ts">
/**
 * PropertyField：单字段的动态分发器——按 FieldDef.control 从注册表取组件，
 * `<component :is>` 渲染。控件的生命周期事件（input 实时 / change 收口）原样
 * 上抛，由 PropertyPanel 统一落 commit（面板零直改）。
 *
 * 数据字段（field.data）额外渲染取值方式切换钮（静态值/表达式，工单 02）：
 * 表达式态输入框带 cn-field--expression 视觉标识，编辑保持标记（镜像字面）。
 * 模式由面板按图层 expression 标记派生传入，本组件零本地状态。
 */
import { computed } from 'vue'

import { controlRegistry } from './controls'
import type { FieldDef } from './fieldSchema'

const props = defineProps<{
    field: FieldDef
    /** 字段当前值（面板已用 readField 解析，ok:false 的字段不会渲染到这） */
    value: unknown
    /** 数据字段取值方式；undefined = 非 data 字段（无切换钮） */
    dataMode?: 'static' | 'expression'
}>()

const emit = defineEmits<{
    input: [value: unknown]
    change: [value: unknown]
    'toggle-mode': []
}>()

const control = computed(() => controlRegistry[props.field.control])
const isExpression = computed(() => props.dataMode === 'expression')
const toggleLabel = '{{ }}'
const toggleTitle = computed(() =>
    isExpression.value
        ? '表达式取值：内容为插值原文（{{路径}} / {{$index}} / {{$root.*}}），画布显示镜像字面；点击切回静态值'
        : '切换为表达式取值：初值取当前内容，编辑为 {{路径}} 插值原文',
)
</script>

<template>
    <label class="cn-prop-field flex items-center justify-between gap-2">
        <span class="cn-prop-field__label shrink-0 select-none truncate text-[11px] leading-none text-cn-muted">
            {{ field.label }}
        </span>
        <button
            v-if="field.data"
            type="button"
            class="cn-props__data-toggle shrink-0"
            :class="{ 'cn-props__data-toggle--active': isExpression }"
            :title="toggleTitle"
            @click.prevent="emit('toggle-mode')"
        >{{ toggleLabel }}</button>
        <!-- 宽度由各控件自持：输入类自带 flex-1 撑满，定宽类（锚点九宫/开关）保持固有尺寸 -->
        <component
            :is="control"
            class="cn-prop-field__control"
            :class="{ 'cn-field--expression': isExpression }"
            :field="field"
            :model-value="value"
            @input="emit('input', $event)"
            @change="emit('change', $event)"
        />
    </label>
</template>
