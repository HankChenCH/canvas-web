<script setup lang="ts">
/**
 * PairField：两列语义行控件（layer-panel-ux 工票 03）——X|Y、宽|高各占一行
 * 两列（PaddingField 的 grid 模式，288px 预算内紧凑）。行级标签由 PropertyField
 * 渲染（本控件不再复述，code-review 整改：消除「尺寸 尺寸」双 label）；子字段
 * （items）相对 pair 值对象寻址（如 shape.width），提交经 sub-commit 上抛
 * 「图层根绝对键的伪字段描述」（pairItemKey 折算），面板走既有 commit 管线
 * 分派 updateSpec——mergeKey 与拆分前的独立字段同键（sel:path:shape.width），
 * 合步语义不回归。
 *
 * 自适应 prefix（工票 03）：子字段带 auto 描述符时渲染「自」切换钮，开启 →
 * 本列输入禁用（一次切换 = 一步历史）。禁用态显示归面板：宽/高自适应均显示
 * 面板传入的 layerBoxAt 解析值（工单 04 补齐宽列——自然宽求值落地后与高列
 * 同源同视觉语言；模板子树是预览盒，以斜体 + 悬停说明与文档值区分）。
 * 「自动」占位降级为盒未解析时的兜底（正常路径必有解析值）。
 */
import { computed } from 'vue'

import { pairItemKey, readField, type FieldDef, type FieldDisplay } from '../fieldSchema'
import { numberField } from '../controlStyles'
import NumberField from './NumberField.vue'

const props = defineProps<{
    /** 行级标签在本控件外由 PropertyField 渲染；items 自描述列含义 */
    field: FieldDef
    /** pair 值对象切片（position/shape 等父对象），子字段按相对键读值 */
    modelValue: Record<string, unknown>
    /** 禁用态替代显示（键 = pairItemKey 的点串）；无显示值的禁用列显 auto 占位 */
    displays?: Record<string, FieldDisplay>
}>()

const emit = defineEmits<{
    /**
     * input/change 本控件不发出，但必须声明：未声明的事件监听会被 Vue 当作
     * 原生事件穿透到根元素，内层 NumberField 的原生 input/change 冒泡即触发
     * PropertyField 的上抛链（把原生 Event 当值提交、污染历史合步）。
     */
    input: [value: unknown]
    change: [value: unknown]
    'sub-commit': [field: FieldDef, value: unknown, final: boolean]
}>()

const items = computed(() => props.field.items ?? [])

/** 自适应开关当前态（读 pair 值对象上的布尔键） */
function isAutoOn(item: FieldDef): boolean {
    if (!item.auto) return false
    const read = readField(props.modelValue, item.auto.key)
    return read.ok && read.value === true
}

/** 子字段的图层根绝对键伪描述：提交折算走 pairItemKey 公共规则 */
function absoluteField(item: FieldDef): FieldDef {
    return { ...item, key: pairItemKey(props.field, item) }
}

/** 自适应布尔的绝对键伪描述：提交走既有 boolean updateSpec 管线 */
function absoluteAutoField(item: FieldDef): FieldDef {
    return {
        key: [...props.field.key, ...(item.auto?.key ?? [])],
        label: `${item.label}自适应`,
        control: 'boolean',
    }
}

function commitItem(item: FieldDef, value: number, final: boolean): void {
    emit('sub-commit', absoluteField(item), value, final)
}

function toggleAuto(item: FieldDef): void {
    emit('sub-commit', absoluteAutoField(item), !isAutoOn(item), true)
}

function numberValue(item: FieldDef): number {
    const read = readField(props.modelValue, item.key)
    return read.ok && typeof read.value === 'number' ? read.value : 0
}

function displayFor(item: FieldDef): FieldDisplay | undefined {
    return props.displays?.[pairItemKey(props.field, item).join('.')]
}

function displayValue(item: FieldDef): string {
    const display = displayFor(item)
    return display === undefined ? '' : String(display.value)
}

function autoTitle(item: FieldDef): string {
    return isAutoOn(item)
        ? `${item.label}自适应：已开启（输入框禁用）`
        : `${item.label}自适应：开启后由内容决定，输入框禁用`
}

function disabledTitle(item: FieldDef): string {
    const display = displayFor(item)
    if (display?.preview) return '模板子树：预览盒尺寸（随行实例变化，非文档声明值）'
    return display !== undefined
        ? `${item.label}自适应：布局解析值（与画布选择框同源）`
        : `${item.label}自适应：已开启`
}
</script>

<template>
    <!-- 行级标签在 PropertyField；本根只承载两列网格（micro 档：模板里不重复调用 activeDot 类函数） -->
    <span class="grid w-full min-w-0 grid-cols-2 gap-1">
        <label
            v-for="item in items"
            :key="item.key.join('.')"
            class="flex min-w-0 items-center gap-1"
            :title="item.auto ? undefined : item.label"
        >
            <!-- 列标签定宽（1 字标签 X/Y/宽/高）：左右列输入框同线起步，位置/尺寸
                 两行的列缘对齐（ASCII 与汉字标签宽差不致输入错位） -->
            <span class="w-3.5 shrink-0 select-none text-[10px] leading-none text-cn-muted">{{ item.label }}</span>
            <button
                v-if="item.auto"
                type="button"
                class="cn-props__auto-toggle shrink-0"
                :class="{ 'cn-props__auto-toggle--active': isAutoOn(item) }"
                :aria-pressed="isAutoOn(item)"
                :title="autoTitle(item)"
                @click.prevent="toggleAuto(item)"
            >自</button>
            <NumberField
                v-if="!isAutoOn(item)"
                class="min-w-0 flex-1"
                :field="item"
                :model-value="numberValue(item)"
                @input="commitItem(item, $event, false)"
                @change="commitItem(item, $event, true)"
            />
            <input
                v-else
                class="cn-field cn-field--number min-w-0 flex-1"
                :class="[numberField, displayFor(item)?.preview ? 'cn-field--preview' : '']"
                type="number"
                disabled
                :aria-label="item.label"
                :value="displayValue(item)"
                :placeholder="item.auto?.placeholder ?? ''"
                :title="disabledTitle(item)"
            />
        </label>
    </span>
</template>
