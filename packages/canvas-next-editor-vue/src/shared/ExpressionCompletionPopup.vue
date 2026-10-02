<script setup lang="ts">
/**
 * ExpressionCompletionPopup：表达式路径补全浮层（content-completion 工单 04）。
 * shared 域切片（表达式就地编辑 spec 决策 5 迁入）：属性面板与画布文本编辑两域
 * 共用的呈现件，经域 barrel 出口。
 *
 * - portal 到 body + fixed 定位（躲 288px 面板 overflow 裁剪），锚点坐标由
 *   useExpressionCompletion 测算（mirror div 光标测量），随 scroll/resize 重算；
 * - 根元素自带 .cn-props：portal 后脱离面板 DOM 子树，靠它重建令牌命名空间
 *   （panel-theme.css 的 --cn-* 系在浮层内照常解析）；
 * - 根拦 mousedown（prevent + stop）：点击候选不夺宿主焦点（浮层不因失焦误
 *   关）、不冒泡到 document 的点外关闭；点选经 select 上抛由宿主 accept；
 * - 工单 10 两增量：open 信号（开放映射节点）渲染「动态字段，键由模板定义」
 *   占位提示行（不可接受、不进导航序）；候选说明展示回落 description ?? title
 *   （D8 两字段分离透传，二者皆缺省维持现状）；
 * - 视觉沿 panel-theme 令牌（cn-field/cn-accent 系），option 几何以 tailwind
 *   utility 留在模板，抬升底色/阴影与高亮态收口在 panel-theme.css。
 */
import { nextTick, ref, watch } from 'vue'

import type { ExpressionCompletionState } from './useExpressionCompletion'

const props = defineProps<{ state: ExpressionCompletionState }>()

const emit = defineEmits<{ select: [index: number] }>()

const rootRef = ref<HTMLElement | null>(null)

// 根元素外 exposure：宿主（PropertyField）转交 useExpressionCompletion 量宽
// 做视口右缘收口（工单 04 遗留目验项）
defineExpose({ rootEl: rootRef })

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
            @mousedown.prevent.stop
        >
            <!-- listbox 只含 option 子节点（严格 ARIA）；开放映射占位提示行在其外作脚注 -->
            <div role="listbox" aria-label="表达式路径候选">
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
                    <!-- 展示回落 description ?? title（D8：形状树两字段分离透传，回落归浮层；皆缺省不渲染） -->
                    <span
                        v-if="item.description ?? item.title"
                        class="truncate text-[10px] leading-none text-cn-muted"
                    >
                        {{ item.description ?? item.title }}
                    </span>
                </button>
            </div>
            <!--
                开放映射占位提示行（工单 10，D10）：open 节点（additionalProperties:
                true）时解释「动态字段，键由模板定义」——不可接受、不进导航序，仅说明
                无候选/候选有限的原因（行业惯例：无候选但不阻断）。非 option：点击不
                emit select（accept 无从触发），listbox 语义不受牵连。
            -->
            <div
                v-if="state.openMapping"
                class="cn-completion__hint px-2 py-1.5 text-[10px] leading-none text-cn-muted"
            >
                动态字段，键由模板定义
            </div>
        </div>
    </Teleport>
</template>
