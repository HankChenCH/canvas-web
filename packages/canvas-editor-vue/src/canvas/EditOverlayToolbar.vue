<script setup lang="ts">
/**
 * EditOverlayToolbar：编辑浮层工具条（canvas-web-edit-overlay-toolbar 工单 03，
 * ADR 0019）——ContentTypePill 原地演进：内容类型切换浮层降为工具条首段（CONTEXT
 * 词条「内容类型切换浮层」），工单 04 在此续接字体/字号/字色/水平对齐/垂直对齐/
 * 自动换行五组样式段成七段单行。
 *
 * - 编辑会话期由 TextEditingOverlay 内挂在图层框上缘中点（翻转/钳制换算在
 *   useTextEditing.toolbarStyle）；选中态不显示（工具条仅编辑会话期存在）。
 *   屏幕恒定尺寸：屏幕坐标定位、无 scale 变换（与 textarea/旧 pill 的场景像素
 *   换算系分叉，浮层定位两套并存），任何缩放级别下可读可点。
 * - 内容类型段（静态｜表达式）：激活项高亮随 ui.editing.expression（会话活标志
 *   ，ADR 0019）——激活态即提交去向的权威视图（面板锁定段同源随动）；切换语义
 *   上抛 change 归绑定层 setExpressionMode（仅翻会话标志，零文档变更零历史步），
 *   本组件零状态（ValueTypeSegmented 同门）。
 * - 根拦 pointerdown 默认行为：点工具条任意处不夺 textarea 焦点（免 blur 延迟
 *   提交路径）；不 stop 冒泡——豁免判定（ownsEventTarget 覆盖整条工具条）仍由
 *   表面组件 pointerdown 处理器亲见。
 * - 视觉令牌自带主题（ContextMenu 同门，不依赖宿主接线）。
 */
import { ref } from 'vue'

const props = defineProps<{
    /** 当前会话模式（ui.editing.expression 投影）：激活项高亮随之 */
    mode: 'static' | 'expression'
}>()

const emit = defineEmits<{ change: [value: 'static' | 'expression'] }>()

const rootRef = ref<HTMLElement | null>(null)

// 根元素外 exposure：宿主（TextEditingOverlay）转交 useTextEditing 入豁免集与实测尺寸
defineExpose({ rootEl: rootRef })

/** 两项静态定义（内容类型段，原 pill 的段定义原地收编为首段） */
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
        class="cn-edit-toolbar"
        role="toolbar"
        aria-label="文本编辑"
        data-edit-toolbar
        @pointerdown.prevent
    >
        <!-- 内容类型段（首段，原 pill 本体）：data-content-pill / data-pill-* 目验
             与测试钩子沿用（模式切换唯一入口，会话期面板锁定段同源随动） -->
        <span class="cn-edit-toolbar__segment" role="group" aria-label="内容类型" data-content-pill>
            <button
                v-for="segment in SEGMENTS"
                :key="segment.value"
                type="button"
                class="cn-edit-toolbar__item"
                :class="{ 'cn-edit-toolbar__item--active': segment.value === mode }"
                :aria-pressed="segment.value === mode"
                :data-pill-static="segment.value === 'static' ? true : undefined"
                :data-pill-expression="segment.value === 'expression' ? true : undefined"
                @click="pick(segment.value)"
            >
                {{ segment.label }}
            </button>
        </span>
        <!-- 工单 04：字体下拉｜字号步进｜字色拾色｜水平对齐三键｜垂直对齐三键｜自动换行开关 -->
    </div>
</template>

<style scoped>
/* 令牌与 ContextMenu 同值：自带主题（暗色检视面），不依赖宿主接线 */
.cn-edit-toolbar {
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
    gap: 2px;
    padding: 3px;
    background: var(--cn-bg-elevated);
    border: 1px solid var(--cn-line);
    border-radius: 8px;
    box-shadow: 0 8px 20px rgba(2, 6, 23, 0.45);
    /* 屏幕恒定尺寸（ADR 0019）：定位换算给屏幕像素（useTextEditing.toolbarStyle），
       自身不再有任何 scale 变换——zoom 只动锚点不动尺寸 */
    /* 透明点击面里的可交互件：工具条本体可点，不阻画布其余事件 */
    pointer-events: auto;
    user-select: none;
}

.cn-edit-toolbar__segment {
    display: inline-flex;
    align-items: stretch;
    overflow: hidden;
    border-radius: 5px;
}

.cn-edit-toolbar__item {
    padding: 3px 10px;
    border: 0;
    background: transparent;
    color: var(--cn-muted);
    font-size: 11px;
    line-height: 1.4;
    white-space: nowrap;
    cursor: pointer;
}

.cn-edit-toolbar__item + .cn-edit-toolbar__item {
    border-left: 1px solid var(--cn-line);
}

.cn-edit-toolbar__item:hover {
    color: var(--cn-fg);
}

.cn-edit-toolbar__item--active {
    background: var(--cn-accent-soft);
    color: var(--cn-accent);
    cursor: default;
}
</style>
