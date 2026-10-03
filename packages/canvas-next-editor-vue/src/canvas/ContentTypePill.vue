<script setup lang="ts">
/**
 * ContentTypePill：内容类型切换浮层（静态｜表达式，canvas-web-expression-editing
 * 工单 03，spec 决策 1/8）。
 *
 * - 编辑会话期由 TextEditingOverlay 内挂在图层框上边框居中（定位换算在
 *   useTextEditing.pillStyle——与 textarea 同一换算系：场景定位 + CSS transform
 *   scale，相机/dpr 跟随复用），随 textarea 同生共死；选中态不显示（避免与
 *   八柄/gizmo 争几何与手势面）。
 * - 激活项高亮随 ui.editing.expression（会话快照）——编辑中 pill 激活态即提交
 *   去向的权威视图（面板该窗口期显示的是提交前旧状态）；切换语义上抛 change
 *   归绑定层 setExpressionMode（仅翻会话标志，零文档变更零历史步），本组件零
 *   状态（ValueTypeSegmented 同门）。
 * - 根拦 pointerdown 默认行为：点击不夺 textarea 焦点（免 blur 延迟提交路径），
 *   不 stop 冒泡——豁免判定（ownsEventTarget 覆盖 pill）仍由表面组件 pointerdown
 *   处理器亲见（工单 03 豁免集两目标的测试面）。
 * - 视觉令牌自带主题（ContextMenu 同门，不依赖宿主接线）。
 */
import { ref } from 'vue'

const props = defineProps<{
    /** 当前会话模式（ui.editing.expression 投影）：激活项高亮随之 */
    mode: 'static' | 'expression'
}>()

const emit = defineEmits<{ change: [value: 'static' | 'expression'] }>()

const rootRef = ref<HTMLElement | null>(null)

// 根元素外 exposure：宿主（TextEditingOverlay）转交 useTextEditing 入豁免集
defineExpose({ rootEl: rootRef })

/** 两项静态定义（帮助/说明文案归表达式就地编辑工单 04，本组件只出二项切换） */
const SEGMENTS: readonly { value: 'static' | 'expression'; label: string }[] = [
    { value: 'static', label: '静态' },
    { value: 'expression', label: '表达式' },
]

function pick(value: 'static' | 'expression'): void {
    if (value === props.mode) return
    emit('change', value)
}
</script>

<template>
    <div
        ref="rootRef"
        class="cn-content-pill"
        role="group"
        aria-label="内容类型"
        data-content-pill
        @pointerdown.prevent
    >
        <button
            v-for="segment in SEGMENTS"
            :key="segment.value"
            type="button"
            class="cn-content-pill__item"
            :class="{ 'cn-content-pill__item--active': segment.value === mode }"
            :aria-pressed="segment.value === mode"
            :data-pill-static="segment.value === 'static' ? true : undefined"
            :data-pill-expression="segment.value === 'expression' ? true : undefined"
            @click="pick(segment.value)"
        >
            {{ segment.label }}
        </button>
    </div>
</template>

<style scoped>
/* 令牌与 ContextMenu 同值：自带主题（暗色检视面），不依赖宿主接线 */
.cn-content-pill {
    --cn-bg-elevated: #101a2e;
    --cn-fg: #e6edf7;
    --cn-muted: #7c8ca5;
    --cn-line: #1e2a40;
    --cn-accent: #38bdf8;
    --cn-accent-soft: rgba(56, 189, 248, 0.12);

    position: absolute;
    left: 0;
    top: 0;
    z-index: 30;
    display: inline-flex;
    align-items: stretch;
    overflow: hidden;
    background: var(--cn-bg-elevated);
    border: 1px solid var(--cn-line);
    border-radius: 7px;
    box-shadow: 0 8px 20px rgba(2, 6, 23, 0.45);
    /* 透明点击面里的可交互件：pill 本体可点，不阻画布其余事件 */
    pointer-events: auto;
    user-select: none;
}

.cn-content-pill__item {
    padding: 3px 10px;
    border: 0;
    background: transparent;
    color: var(--cn-muted);
    font-size: 11px;
    line-height: 1.4;
    white-space: nowrap;
    cursor: pointer;
}

.cn-content-pill__item + .cn-content-pill__item {
    border-left: 1px solid var(--cn-line);
}

.cn-content-pill__item:hover {
    color: var(--cn-fg);
}

.cn-content-pill__item--active {
    background: var(--cn-accent-soft);
    color: var(--cn-accent);
    cursor: default;
}
</style>
