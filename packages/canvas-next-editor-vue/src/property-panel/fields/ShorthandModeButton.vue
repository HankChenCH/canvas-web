<script setup lang="ts">
/**
 * ShorthandModeButton：简写控件的单按钮模式循环钮（layer-panel-ux 工单 04，
 * 内边距/边框共用）——1→2→4 值模式循环，图标按当前模式递进（一方框 → 上下
 * 两分 → 四宫），悬停文案说明当前态与下一态。纯展示件：点击只上抛 cycle，
 * 模式状态与迁移提交归宿主控件。
 */
import { computed } from 'vue'

import { Grid2x2, Square, SquareSplitVertical } from '@lucide/vue'

import PanelIcon from '../../shared/PanelIcon.vue'
import type { ShorthandMode } from '../shorthand'

const props = defineProps<{
    /** 当前模式（决定图标与文案） */
    mode: ShorthandMode
    /** 领域名词，用于悬停文案（如「内边距」「边框」） */
    label: string
}>()

const emit = defineEmits<{ cycle: [] }>()

const MODE_META: Record<ShorthandMode, { icon: typeof Square; title: string }> = {
    1: { icon: Square, title: '统一值' },
    2: { icon: SquareSplitVertical, title: '上下/左右' },
    4: { icon: Grid2x2, title: '四边独立' },
}

const meta = computed(() => MODE_META[props.mode])
const title = computed(() => `${props.label}：${meta.value.title}（点击切换值模式）`)
</script>

<template>
    <button
        type="button"
        class="cn-props__mode-toggle shrink-0"
        :aria-label="title"
        :title="title"
        @click.prevent="emit('cycle')"
    >
        <PanelIcon :icon="meta.icon" :size="12" />
    </button>
</template>
