<script setup lang="ts">
/**
 * <PropertyPanel>：schema 驱动属性面板（工单 09）。订阅 = computed 切片
 * （选中路径的图层子树/画布），表单按字段描述注册表自动生成；一切编辑经
 * usePropertyPanel.commit 分派内核 action（updateSpec/updateData/
 * updateCanvasProp），面板零直改。注册表没有的字段不渲染、不告警。
 *
 * 视觉：暗色「精密仪器」检视面板——设计令牌见 panel-theme.css（作用域在
 * .cn-props 根，自带主题不渗漏宿主）；工具类由宿主 tailwind 经 @source 编译。
 */
import { computed } from 'vue'

import type { EditorSession } from '@hankchen/canvas-next-editor'

import { readField, type FieldDef } from './fieldSchema'
import PropertyField from './PropertyField.vue'
import { usePropertyPanel } from './usePropertyPanel'

const props = defineProps<{ editor: EditorSession }>()

const panel = usePropertyPanel(props.editor)

interface RenderField {
    /** 渲染键：含选中路径——选择切换即重挂载字段组件（清草稿、闭合本地态） */
    key: string
    field: FieldDef
    value: unknown
}

interface RenderSection {
    title: string
    fields: RenderField[]
}

const isLayer = computed(() => panel.layer.value !== null)

const typeBadge = computed(() => {
    const layer = panel.layer.value
    if (layer) return layer.type
    return panel.canvas.value ? 'Canvas' : '—'
})

const visibleSections = computed<readonly RenderSection[]>(() => {
    // 目标对象：选中层优先；仅当确无选择时回退画布（选中存在但解析失败说明
    // 选择已失效——此时不渲染画布字段，避免展示一份提交不进去的表单）
    const target = panel.layer.value ?? (panel.selection.value ? null : panel.canvas.value)
    if (!target) return []
    const scope = panel.selection.value?.join('.') ?? 'canvas'
    const result: RenderSection[] = []
    for (const section of panel.sections.value) {
        const fields: RenderField[] = []
        for (const field of section.fields) {
            const read = readField(target, field.key)
            // 未知字段：不渲染、不告警（权威字段过滤的读侧兜底）
            if (!read.ok) continue
            fields.push({ key: `${scope}:${field.key.join('.')}`, field, value: read.value })
        }
        if (fields.length > 0) result.push({ title: section.title, fields })
    }
    return result
})
</script>

<template>
    <aside class="cn-props flex w-[288px] shrink-0 flex-col overflow-y-auto rounded-xl border border-cn-line bg-cn-bg text-cn-fg shadow-[0_16px_40px_-12px_rgba(2,6,23,0.55)]">
        <!-- 面板头：目标徽标（type 名）+ 标题 -->
        <header class="sticky top-0 z-10 border-b border-cn-line bg-cn-bg-elevated/95 px-3.5 py-2.5 backdrop-blur-sm">
            <div class="flex items-center gap-2">
                <span
                    class="inline-flex items-center gap-1.5 rounded border border-cn-accent/25 bg-cn-accent-soft px-1.5 py-0.5 font-mono text-[10px] leading-4 text-cn-accent"
                >
                    <i class="size-1.5 rounded-full bg-cn-accent" aria-hidden="true"></i>
                    {{ typeBadge }}
                </span>
                <span class="text-[12px] font-medium tracking-wide text-cn-fg/90">
                    {{ isLayer ? '图层属性' : '画布属性' }}
                </span>
            </div>
        </header>

        <p
            v-if="visibleSections.length === 0"
            class="mx-3.5 my-4 rounded-lg border border-dashed border-cn-line px-3 py-6 text-center text-[11px] leading-5 text-cn-muted"
        >
            打开文档后可编辑属性
        </p>

        <section
            v-for="section in visibleSections"
            :key="section.title"
            class="cn-props__section border-b border-cn-line/70 px-3.5 py-3 last:border-b-0"
        >
            <h3 class="cn-props__section-title mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-cn-muted">
                {{ section.title }}
            </h3>
            <div class="flex flex-col gap-1.5">
                <PropertyField
                    v-for="item in section.fields"
                    :key="item.key"
                    :field="item.field"
                    :value="item.value"
                    @input="panel.commit(item.field, $event, false)"
                    @change="panel.commit(item.field, $event, true)"
                />
            </div>
        </section>
    </aside>
</template>
