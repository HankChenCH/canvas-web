<script setup lang="ts">
/**
 * AlignField：对齐分段图标按钮组（layer-panel-ux 工单 05）——Word 式按轴
 * 分排的分段控件，替代原 select 下拉：水平（左/中/右）、垂直（上/中/下）
 * 各一排，选中态 accent 高亮。取值域仍来自注册表 domain（领域常量原样
 * 引用），提交语义不变：一次点击 = change 收口 = 一步历史（已选中分段
 * 不再上报，免冗余历史步）。
 *
 * 图标与悬停文案按域值映射（选型：lucide 物件对齐族——轴线所在侧即对齐
 * 侧，水平轴用竖轴线 Align*Vertical，垂直轴用横轴线 Align*Horizontal）；
 * 未知取值域退化为文字分段（注册表「宽容不告警」语义的控件侧对位）。
 */
import type { LucideIcon } from '@lucide/vue'
import {
    AlignCenterHorizontal,
    AlignCenterVertical,
    AlignEndHorizontal,
    AlignEndVertical,
    AlignStartHorizontal,
    AlignStartVertical,
} from '@lucide/vue'
import { computed } from 'vue'

import { HORIZONTAL_ALIGNS, VERTICAL_ALIGNS } from '@hankchen/canvas-next-editor'

import PanelIcon from '../../shared/PanelIcon.vue'
import type { FieldDef } from '../fieldSchema'

const props = defineProps<{ field: FieldDef; modelValue: string }>()

const emit = defineEmits<{ change: [value: string] }>()

/** 图标 + 悬停文案按「轴 × 枚举值」映射；外层键 = domain 常量 join（值相等比较，不依赖引用同一性） */
const META_BY_DOMAIN: Record<string, Record<string, { icon: LucideIcon; title: string }>> = {
    [HORIZONTAL_ALIGNS.join('.')]: {
        left: { icon: AlignStartVertical, title: '左对齐' },
        center: { icon: AlignCenterVertical, title: '居中对齐' },
        right: { icon: AlignEndVertical, title: '右对齐' },
    },
    [VERTICAL_ALIGNS.join('.')]: {
        top: { icon: AlignStartHorizontal, title: '顶对齐' },
        center: { icon: AlignCenterHorizontal, title: '居中对齐' },
        bottom: { icon: AlignEndHorizontal, title: '底对齐' },
    },
}

interface AlignOption {
    readonly value: string
    readonly icon?: LucideIcon
    readonly title: string
}

const options = computed<readonly AlignOption[]>(() => {
    const domain = props.field.domain ?? []
    const meta = META_BY_DOMAIN[domain.join('.')]
    return domain.map((value) => ({
        value,
        icon: meta?.[value]?.icon,
        title: meta?.[value] ? `${props.field.label}：${meta[value]!.title}` : `${props.field.label}：${value}`,
    }))
})

function pick(value: string): void {
    if (value === props.modelValue) return
    emit('change', value)
}
</script>

<template>
    <span
        class="cn-align flex h-7 min-w-0 flex-1 overflow-hidden rounded-md border border-cn-field-line bg-cn-field"
        role="group"
        :aria-label="field.label"
    >
        <button
            v-for="(option, index) in options"
            :key="option.value"
            type="button"
            class="cn-align__option flex min-w-0 flex-1 items-center justify-center p-0 transition-colors duration-100 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cn-accent/40"
            :class="[
                index > 0 ? 'border-l border-cn-field-line' : '',
                option.value === modelValue
                    ? 'cn-align__option--active bg-cn-accent-soft text-cn-accent'
                    : 'text-cn-muted hover:text-cn-fg',
            ]"
            :aria-pressed="option.value === modelValue"
            :title="option.title"
            @click.prevent="pick(option.value)"
        >
            <PanelIcon v-if="option.icon" :icon="option.icon" />
            <span v-else class="truncate px-1 text-[10px] leading-none">{{ option.value }}</span>
        </button>
    </span>
</template>
