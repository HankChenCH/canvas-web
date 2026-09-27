<script setup lang="ts">
/**
 * ValueTypeSegmented：数据字段取值方式分段选择器（静态 | 表达式，layer-panel-ux
 * 工单 06）——替代原 `{{ }}` 徽章切换钮。当前态由图层 expression 标记派生
 * （面板下发 mode，本组件零本地状态）；点击非当前段上抛 change（目标态），
 * 当前段零事件（无冗余提交，不进历史）。
 *
 * 两段各有悬停 tooltip 解释态含义（文案起草、宿主审；表达式段沿用插值子集
 * 说明 {{路径}} / {{$index}} / {{$root.*}}）。视觉沿用对齐分段组的令牌语言
 * （AlignField 同款 tailwind 配方），提交管线不动——toggle 语义仍由面板
 * toggleDataMode 承担。
 */
const props = defineProps<{
    /** 当前取值方式（由图层 expression 标记派生：null → static） */
    mode: 'static' | 'expression'
}>()

const emit = defineEmits<{ change: [value: 'static' | 'expression'] }>()

/** 两段静态定义：label + 态含义 tooltip（未激活段追加切换提示） */
const SEGMENTS: readonly { value: 'static' | 'expression'; label: string; title: string }[] = [
    { value: 'static', label: '静态', title: '静态值：输入的字面内容直接显示在画布上' },
    {
        value: 'expression',
        label: '表达式',
        title: '表达式值：内容为插值原文，画布显示解析镜像（{{路径}} / {{$index}} / {{$root.*}}）',
    },
]

function pick(value: 'static' | 'expression'): void {
    if (value === props.mode) return
    emit('change', value)
}
</script>

<template>
    <span
        class="cn-valuetype flex h-7 shrink-0 items-stretch overflow-hidden rounded-md border border-cn-field-line bg-cn-field"
        role="group"
        aria-label="取值方式"
    >
        <button
            v-for="(segment, index) in SEGMENTS"
            :key="segment.value"
            type="button"
            class="cn-valuetype__option flex items-center justify-center p-0 px-1.5 text-[10px] leading-none transition-colors duration-100 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cn-accent/40"
            :class="[
                index > 0 ? 'border-l border-cn-field-line' : '',
                segment.value === mode
                    ? 'cn-valuetype__option--active bg-cn-accent-soft text-cn-accent'
                    : 'text-cn-muted hover:text-cn-fg',
            ]"
            :aria-pressed="segment.value === mode"
            :title="segment.value === mode ? segment.title : `${segment.title}；点击切换`"
            @click.prevent="pick(segment.value)"
        >
            {{ segment.label }}
        </button>
    </span>
</template>
