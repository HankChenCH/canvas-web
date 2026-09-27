<script setup lang="ts">
/**
 * PropertyField：单字段的动态分发器——按 FieldDef.control 从注册表取组件，
 * `<component :is>` 渲染。控件的生命周期事件（input 实时 / change 收口）原样
 * 上抛，由 PropertyPanel 统一落 commit（面板零直改）。
 *
 * 复合控件（pair，两列语义行，工票 03）：面板下发的 displays（禁用态替代
 * 显示，键 = 子字段绝对键）原样转发；子字段提交经 sub-commit 上抛（含目标
 * FieldDef 与 final 标记），面板按同一条 commit 管线分派。其余控件不受影响。
 *
 * 数据字段（field.data）额外渲染取值方式分段选择器（静态 | 表达式，工单 06，
 * 替代原 `{{ }}` 徽章钮）：表达式态输入框带 cn-field--expression 视觉标识，
 * 编辑保持标记（镜像字面）。模式由面板按图层 expression 标记派生传入，本组件
 * 零本地状态；切换语义仍上抛 toggle-mode 归面板 toggleDataMode（管线不动）。
 */
import { computed } from 'vue'

import { controlRegistry } from './controls'
import type { FieldDef, FieldDisplay } from './fieldSchema'
import ValueTypeSegmented from './fields/ValueTypeSegmented.vue'

const props = defineProps<{
    field: FieldDef
    /** 字段当前值（面板已用 readField 解析，ok:false 的字段不会渲染到这） */
    value: unknown
    /** 数据字段取值方式；undefined = 非 data 字段（无切换钮） */
    dataMode?: 'static' | 'expression'
    /** pair 子字段的禁用态替代显示（键 = 子字段绝对键）；其他控件不传 */
    displays?: Record<string, FieldDisplay>
}>()

const emit = defineEmits<{
    input: [value: unknown]
    change: [value: unknown]
    'toggle-mode': []
    /** pair 子字段提交：面板按子字段绝对键走既有 commit 管线 */
    'sub-commit': [field: FieldDef, value: unknown, final: boolean]
}>()

const control = computed(() => controlRegistry[props.field.control])
const isExpression = computed(() => props.dataMode === 'expression')

/** 复合控件的子字段提交转发（模板内联箭头的参数标注不便，收口到脚本） */
function relaySubCommit(field: FieldDef, value: unknown, final: boolean): void {
    emit('sub-commit', field, value, final)
}
</script>

<template>
    <!-- pair 行根用 div（code-review 整改：其列各有 label，嵌套 label 非法且点击
         归属会被外层劫持）；其余单控件行保持 label 包裹的点击聚焦行为 -->
    <component
        :is="field.control === 'pair' ? 'div' : 'label'"
        class="cn-prop-field flex items-center justify-between gap-2"
    >
        <!-- pair 列自描述（X/Y/宽/高），行级标签不复述（消除「尺寸 尺寸」双 label） -->
        <span
            v-if="field.control !== 'pair'"
            class="cn-prop-field__label shrink-0 select-none truncate text-[11px] leading-none text-cn-muted"
        >
            {{ field.label }}
        </span>
        <!-- 数据字段取值方式分段选择器（工单 06）：目标态由组件守卫（当前段零
             事件），切换语义经既有 toggle-mode 归面板 toggleDataMode -->
        <ValueTypeSegmented
            v-if="field.data"
            :mode="dataMode ?? 'static'"
            @change="emit('toggle-mode')"
        />
        <!-- 宽度由各控件自持：输入类自带 flex-1 撑满，定宽类（锚点九宫/开关）保持固有尺寸 -->
        <component
            :is="control"
            class="cn-prop-field__control"
            :class="{ 'cn-field--expression': isExpression }"
            :field="field"
            :model-value="value"
            :displays="field.control === 'pair' ? displays : undefined"
            @input="emit('input', $event)"
            @change="emit('change', $event)"
            @sub-commit="relaySubCommit"
        />
    </component>
</template>
