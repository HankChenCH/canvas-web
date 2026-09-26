<script setup lang="ts">
/**
 * ContextMenu：最小右键菜单（工单 14）——删除/副本/置顶/置底。
 *
 * - 渲染在 CanvasSurface 宿主内（与两层 canvas 同一定位上下文）；openAt 用
 *   **视口坐标**（表面本地 css 像素）定位——菜单是屏幕空间弹出层，定位换算只在
 *   打开时发生一次，pan/zoom 不跟随；越界钳位（打开后量实际尺寸）保证画布边缘
 *   完整可见。
 * - 动作全部经内核 action（duplicateSelection/bringToFront/sendToBack/
 *   deleteLayer），组件零文档写语义；可用态按选中路径裁剪（内核语义，v1 单选）：
 *   删除 = 有选择；副本 = 可复制（可落根层的类型，见 canCopySelection）；
 *   置顶/置底 = 根层选择（isRootLayerPath——容器内行/格是数组序语义，无此操作）。
 * - 关闭时机：执行任一动作、画布 pointerdown（表面组件转发 close）、Escape
 *   （表面组件转发）。菜单根拦截 pointerdown 冒泡（点菜单项不触发画布点选）与
 *   contextmenu（菜单上右键不换目标重开）。
 */
import { computed, nextTick, ref } from 'vue'

import { isRootLayerPath, type EditorSession } from '@hankchen/canvas-next-editor'

import { useSelection } from '../shared/useSelection'

const props = defineProps<{ editor: EditorSession }>()

const rootRef = ref<HTMLElement | null>(null)
const open = ref(false)
const position = ref({ x: 0, y: 0 })

const selection = useSelection(props.editor)

const isRoot = computed(() => selection.value !== null && isRootLayerPath(selection.value))
const canDuplicate = computed(() => selection.value !== null && props.editor.canCopySelection)

interface MenuItem {
    key: 'duplicate' | 'front' | 'back' | 'delete'
    label: string
    enabled: boolean
    run: () => void
}

const items = computed<MenuItem[]>(() => [
    {
        key: 'duplicate',
        label: '创建副本',
        enabled: canDuplicate.value,
        run: () => props.editor.duplicateSelection(),
    },
    { key: 'front', label: '置顶', enabled: isRoot.value, run: () => props.editor.bringToFront() },
    { key: 'back', label: '置底', enabled: isRoot.value, run: () => props.editor.sendToBack() },
    {
        key: 'delete',
        label: '删除',
        enabled: selection.value !== null,
        run: () => {
            const path = selection.value
            if (path) props.editor.deleteLayer(path)
        },
    },
])

/** 打开菜单（视口坐标，表面本地 css 像素）；打开后按实际尺寸钳位进宿主边界 */
async function openAt(x: number, y: number): Promise<void> {
    position.value = { x, y }
    open.value = true
    await nextTick()
    const el = rootRef.value
    const host = el?.parentElement
    if (!el || !host) return
    const rect = el.getBoundingClientRect()
    const maxX = host.clientWidth - rect.width - 2
    const maxY = host.clientHeight - rect.height - 2
    position.value = {
        x: Math.max(2, Math.min(position.value.x, maxX)),
        y: Math.max(2, Math.min(position.value.y, maxY)),
    }
}

function close(): void {
    open.value = false
}

function run(item: MenuItem): void {
    item.run()
    close()
}

defineExpose({ openAt, close })
</script>

<template>
    <div
        v-if="open"
        ref="rootRef"
        class="cn-context-menu"
        role="menu"
        aria-label="图层操作菜单"
        :style="{ left: `${position.x}px`, top: `${position.y}px` }"
        @pointerdown.stop
        @contextmenu.prevent
    >
        <button
            v-for="item in items"
            :key="item.key"
            type="button"
            role="menuitem"
            class="cn-context-menu__item"
            :class="[`cn-context-menu__item--${item.key}`]"
            :disabled="!item.enabled"
            @click="run(item)"
        >
            {{ item.label }}
        </button>
    </div>
</template>

<style scoped>
/* 令牌与 panel-theme.css 同值：菜单自带主题（暗色检视面），不依赖宿主接线 */
.cn-context-menu {
    --cn-bg: #0b1220;
    --cn-bg-elevated: #101a2e;
    --cn-fg: #e6edf7;
    --cn-muted: #7c8ca5;
    --cn-line: #1e2a40;
    --cn-field: rgba(148, 163, 184, 0.07);
    --cn-accent: #38bdf8;
    --cn-accent-soft: rgba(56, 189, 248, 0.12);
    --cn-danger: #f87171;

    position: absolute;
    z-index: 30;
    min-width: 120px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--cn-bg-elevated);
    border: 1px solid var(--cn-line);
    border-radius: 10px;
    box-shadow: 0 12px 32px rgba(2, 6, 23, 0.55);
}

.cn-context-menu__item {
    padding: 6px 12px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--cn-fg);
    font-size: 13px;
    line-height: 1.4;
    text-align: left;
    cursor: pointer;
}

.cn-context-menu__item:hover:not(:disabled) {
    background: var(--cn-accent-soft);
    color: var(--cn-accent);
}

.cn-context-menu__item:disabled {
    color: var(--cn-muted);
    cursor: not-allowed;
}

.cn-context-menu__item--delete:hover:not(:disabled) {
    background: rgba(248, 113, 113, 0.12);
    color: var(--cn-danger);
}
</style>
