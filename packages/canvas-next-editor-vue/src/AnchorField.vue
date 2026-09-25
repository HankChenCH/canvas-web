<script setup lang="ts">
/**
 * AnchorField：九宫锚点选择器。3×3 按钮矩阵按 ANCHORS 常量序排布
 * （top-left → bottom-right），与 wire position.position 的九串一一对应；
 * 点击即最终提交（一次点击 = 一步历史）。选中态 aria-pressed + 高亮。
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
    <span class="cn-anchor" role="group" aria-label="九宫锚点">
        <button
            v-for="anchor in anchorList"
            :key="anchor"
            type="button"
            class="cn-anchor__cell"
            :class="{ 'cn-anchor__cell--active': anchor === modelValue }"
            :aria-pressed="anchor === modelValue"
            :title="anchor"
            @click="pick(anchor)"
        ></button>
    </span>
</template>

<style scoped>
.cn-anchor {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
    width: 66px;
}

.cn-anchor__cell {
    aspect-ratio: 1;
    min-width: 0;
    padding: 0;
    border: 1px solid #cbd5e1;
    border-radius: 3px;
    background: #f8fafc;
    cursor: pointer;
}

.cn-anchor__cell:hover {
    border-color: #94a3b8;
}

.cn-anchor__cell--active {
    border-color: #2563eb;
    background: #2563eb;
}
</style>
