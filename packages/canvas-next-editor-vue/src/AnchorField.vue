<script setup lang="ts">
/**
 * AnchorField：九宫锚点选择器。3×3 按钮矩阵按 ANCHORS 常量序排布
 * （top-left → bottom-right），与 wire position.position 的九串一一对应；
 * 点击即最终提交（一次点击 = 一步历史）。选中态 aria-pressed + accent 高亮，
 * 中央格带基准十字线（仪器感）。
 */
import { ANCHORS, type Anchor } from '@hankchen/canvas-next-editor'
import { markRaw } from 'vue'

import type { FieldDef } from './fieldSchema'

defineProps<{ field: FieldDef; modelValue: Anchor }>()

const emit = defineEmits<{ change: [value: Anchor] }>()

// ANCHORS 常量是非响应式数据，markRaw 防止被模板遍历误建 reactive 依赖
const anchorList = markRaw(ANCHORS)

function pick(anchor: Anchor): void {
    emit('change', anchor)
}
</script>

<template>
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
</template>
