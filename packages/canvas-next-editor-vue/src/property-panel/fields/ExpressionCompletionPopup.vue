<script setup lang="ts">
/**
 * ExpressionCompletionPopup：表达式路径补全浮层（content-completion 工单 04，
 * 域内行内辅助件——消费方直引，不进包级公共出口）。
 *
 * - portal 到 body + fixed 定位（躲 288px 面板 overflow 裁剪），锚点坐标由
 *   useExpressionCompletion 测算（mirror div 光标测量），随 scroll/resize 重算；
 * - 根元素自带 .cn-props：portal 后脱离面板 DOM 子树，靠它重建令牌命名空间
 *   （panel-theme.css 的 --cn-* 系在浮层内照常解析）；
 * - 根拦 mousedown（prevent + stop）：点击候选不夺宿主焦点（浮层不因失焦误
 *   关）、不冒泡到 document 的点外关闭；点选经 select 上抛由宿主 accept；
 * - 视觉沿 panel-theme 令牌（cn-field/cn-accent 系），option 几何以 tailwind
 *   utility 留在模板，抬升底色/阴影与高亮态收口在 panel-theme.css。
 */
import { nextTick, ref, watch } from 'vue'

import type { ExpressionCompletionState } from './useExpressionCompletion'

const props = defineProps<{ state: ExpressionCompletionState }>()

const emit = defineEmits<{ select: [index: number] }>()

const rootRef = ref<HTMLElement | null>(null)

// 键盘导航跟随：高亮项滚进可视区（max-height 滚动时）；jsdom 无此 API 走可选调用
watch(
    () => props.state.activeIndex,
    async () => {
        await nextTick()
        rootRef.value?.querySelector('.cn-completion__option--active')?.scrollIntoView?.({ block: 'nearest' })
    },
)
</script>

<template>
    <Teleport to="body">
        <div
            v-if="state.open"
            ref="rootRef"
            class="cn-props cn-completion fixed z-50 max-h-[200px] min-w-[140px] max-w-[280px] overflow-y-auto rounded-md border border-cn-field-line py-1 text-[11px] leading-none"
            :style="{ top: `${state.top}px`, left: `${state.left}px` }"
            role="listbox"
            aria-label="表达式路径候选"
            @mousedown.prevent.stop
        >
            <button
                v-for="(item, index) in state.items"
                :key="`${index}:${item.segment}`"
                type="button"
                role="option"
                class="cn-completion__option flex w-full items-center gap-1.5 px-2 py-1.5 text-left"
                :class="index === state.activeIndex ? 'cn-completion__option--active' : ''"
                :aria-selected="index === state.activeIndex"
                :title="item.path ?? item.segment"
                @click="emit('select', index)"
            >
                <span class="cn-completion__segment font-mono text-cn-fg">{{ item.segment }}</span>
                <span
                    v-if="item.type"
                    class="shrink-0 rounded-sm bg-cn-field px-1 py-0.5 text-[9px] leading-none text-cn-muted"
                >
                    {{ item.type }}
                </span>
                <span v-if="item.description" class="truncate text-[10px] leading-none text-cn-muted">
                    {{ item.description }}
                </span>
            </button>
        </div>
    </Teleport>
</template>
