<script setup lang="ts">
/**
 * <PanelIcon>：lucide 图标的面板统一封装（layer-panel-ux 工单 02）。
 *
 * 消费形态（tree-shake 友好）：调用方按名引入所需图标经 icon prop 注入——
 * `import { Pencil } from '@lucide/vue'` → `<PanelIcon :icon="Pencil" />`。
 * 封装自身不引任何 lucide 运行时符号（LucideIcon 仅类型引入，编译期擦除），
 * 构建产物只含各域实际用到的图标（sideEffects: false 按图标摇树）。
 *
 * 统一档：面板字号 11.5px 尺度 → 默认 14px；stroke-width 默认 2（lucide 的
 * 24 viewBox 设计比例，等比缩到 14px 后描边约 1.17 设备像素，观感与图标
 * 设计稿一致）。两者可 prop 覆盖，不传即全面板一致。
 *
 * 其余 props/attrs（color、title、data-*、class 等）原样透传给 lucide 图标
 * 组件：color 落到 stroke，无 a11y 属性时 lucide 自动补 aria-hidden（装饰性
 * 默认），class 与 lucide 自带类名合并共存。
 */
import type { LucideIcon } from '@lucide/vue'

defineOptions({ inheritAttrs: false })

withDefaults(
    defineProps<{
        /** lucide 图标组件（消费方按名 import，不用字符串名——摇树按引用走） */
        icon: LucideIcon
        /** 显示边长 px（默认 14：面板 11.5px 字号尺度） */
        size?: number
        /** 描边宽（viewBox 24 尺度，默认 2 = lucide 设计比例） */
        strokeWidth?: number
    }>(),
    { size: 14, strokeWidth: 2 },
)
</script>

<template>
    <component :is="icon" :size="size" :stroke-width="strokeWidth" v-bind="$attrs" />
</template>
