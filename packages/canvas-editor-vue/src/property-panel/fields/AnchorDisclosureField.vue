<script setup lang="ts">
/**
 * AnchorDisclosureField：锚点折叠区（layer-panel-ux 工票 03）。锚点是块级
 * 字段——默认收起为一行标题（标题 + 9 点微缩图点亮当前锚点 + 折叠箭头），
 * 展开才是九宫选择器（原 AnchorField 形态原样保留）。开合状态住内核 store
 * ui 分支（会话内记忆），面板桥接 expanded prop / toggle 事件，本组件不自持
 * 状态、零持久化。九宫提交语义不变：点击即最终提交（一次点击 = 一步历史）。
 */
import { ANCHORS, type Anchor } from '@hankchen/canvas-editor'
import { ChevronDown } from '@lucide/vue'
import { computed, markRaw } from 'vue'

import PanelIcon from '../../shared/PanelIcon.vue'
import type { FieldDef } from '../fieldSchema'

const props = defineProps<{
    field: FieldDef
    modelValue: Anchor
    /** 开合状态（store ui 分支的投影）；本组件只上报 toggle，不自持状态 */
    expanded: boolean
}>()

const emit = defineEmits<{
    change: [value: Anchor]
    toggle: []
}>()

// ANCHORS 常量是非响应式数据，markRaw 防止被模板遍历误建 reactive 依赖
const anchorList = markRaw(ANCHORS)

/** 微缩图 3×3 网格坐标（含单词形态：top/left/right/center 按包含词判行/列） */
const DOTS = Array.from({ length: 9 }, (_, i) => ({ index: i, cx: 4 + (i % 3) * 8, cy: 4 + Math.floor(i / 3) * 8 }))

/** 当前锚点的点亮下标（行优先，top-left → 0 … bottom-right → 8）；模板逐点消费 */
const activeDot = computed(() => {
    const row = props.modelValue.includes('top') ? 0 : props.modelValue.includes('bottom') ? 2 : 1
    const col = props.modelValue.includes('left') ? 0 : props.modelValue.includes('right') ? 2 : 1
    return row * 3 + col
})

function pick(anchor: Anchor): void {
    emit('change', anchor)
}
</script>

<template>
    <span class="block">
        <button
            type="button"
            class="cn-anchor-disclosure__header flex w-full items-center justify-between gap-2"
            :aria-expanded="expanded"
            :title="expanded ? '收起锚点' : `锚点：${modelValue}（点击展开调整）`"
            @click="emit('toggle')"
        >
            <span class="cn-prop-field__label shrink-0 select-none truncate text-[11px] leading-none text-cn-muted">
                {{ field.label }}
            </span>
            <span class="flex shrink-0 items-center gap-1.5">
                <!-- 收起态锚点摘要：9 点微缩图，当前锚点点亮 -->
                <svg viewBox="0 0 24 24" class="size-3.5" aria-hidden="true">
                    <circle
                        v-for="dot in DOTS"
                        :key="dot.index"
                        :cx="dot.cx"
                        :cy="dot.cy"
                        :r="dot.index === activeDot ? 3.2 : 2.2"
                        :class="dot.index === activeDot ? 'fill-cn-accent' : 'fill-cn-muted/35'"
                    />
                </svg>
                <PanelIcon
                    :icon="ChevronDown"
                    class="text-cn-muted transition-transform duration-150"
                    :class="{ 'rotate-180': expanded }"
                />
            </span>
        </button>
        <span v-if="expanded" class="mt-2 flex justify-end">
            <span class="cn-anchor grid w-[66px] shrink-0 grid-cols-3 gap-[3px]" role="group" aria-label="九宫锚点">
                <button
                    v-for="anchor in anchorList"
                    :key="anchor"
                    type="button"
                    class="cn-anchor__cell relative aspect-square min-w-0 rounded-[4px] border p-0 transition-colors duration-100"
                    :class="
                        anchor === modelValue
                            ? 'cn-anchor__cell--active border-cn-accent bg-cn-accent shadow-[0_0_8px_rgba(56,189,248,0.35)]'
                            : 'border-cn-field-line bg-cn-field hover:border-cn-muted/50'
                    "
                    :aria-pressed="anchor === modelValue"
                    :title="anchor"
                    @click="pick(anchor)"
                ></button>
            </span>
        </span>
    </span>
</template>
