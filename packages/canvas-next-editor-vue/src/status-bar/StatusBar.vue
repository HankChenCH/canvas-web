<script setup lang="ts">
/**
 * StatusBar：状态栏（工单 14）——缩放百分比、选中图层路径、物化进行数。
 *
 * - 缩放/选择随内核 store 实时更新（useViewport/useSelection 切片桥：ui 分支
 *   通知驱动，doc 通知同步打开文档后的选择复位）；
 * - 物化进行数由宿主注入：Materializer 住 browser-renderer，红线禁止 editor-vue
 *   直连——宿主订阅物化状态后把在途计数作为 prop 传入；0 时该段隐藏；
 * - 路径格式化 formatLayerPath（layerPathLabel，纯函数另有单测）。
 */
import { computed } from 'vue'

import type { EditorSession } from '@hankchen/canvas-next-editor'

import { formatLayerPath } from './layerPathLabel'
import { useSelection } from '../shared/useSelection'
import { useViewport } from '../shared/useViewport'

const props = withDefaults(defineProps<{ editor: EditorSession; pendingCount?: number }>(), {
    pendingCount: 0,
})

const viewport = useViewport(props.editor)
const selection = useSelection(props.editor)

const zoomPercent = computed(() => Math.round(viewport.value.zoom * 100))
const selectionLabel = computed(() => {
    const path = selection.value
    return path === null ? '未选中图层' : formatLayerPath(path)
})
</script>

<template>
    <footer class="cn-statusbar" role="status" aria-label="编辑器状态栏">
        <span class="cn-statusbar__segment" data-zoom>{{ zoomPercent }}%</span>
        <span class="cn-statusbar__divider" aria-hidden="true"></span>
        <span class="cn-statusbar__segment" data-selection>{{ selectionLabel }}</span>
        <template v-if="props.pendingCount > 0">
            <span class="cn-statusbar__divider" aria-hidden="true"></span>
            <span class="cn-statusbar__segment cn-statusbar__segment--pending" data-pending>
                物化中 {{ props.pendingCount }}
            </span>
        </template>
    </footer>
</template>

<style scoped>
/* 令牌与 panel-theme.css 同值：状态栏自带主题，不依赖宿主接线，也不渗漏 */
.cn-statusbar {
    --cn-bg: #0b1220;
    --cn-fg: #e6edf7;
    --cn-muted: #7c8ca5;
    --cn-line: #1e2a40;
    --cn-accent: #38bdf8;

    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    background-color: var(--cn-bg);
    color: var(--cn-muted);
    font-size: 12px;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
    user-select: none;
}

.cn-statusbar__segment {
    white-space: nowrap;
}

.cn-statusbar__segment--pending {
    color: var(--cn-accent);
}

.cn-statusbar__divider {
    width: 1px;
    height: 12px;
    background: var(--cn-line);
}
</style>
