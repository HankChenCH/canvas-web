<script setup lang="ts">
/**
 * <PropertyPanel>：schema 驱动属性面板（工单 09）。订阅 = computed 切片
 * （选中路径的图层子树/画布），表单按字段描述注册表自动生成；一切编辑经
 * usePropertyPanel.commit 分派内核 action（updateSpec/updateData/
 * updateCanvasProp），面板零直改。注册表没有的字段不渲染、不告警。
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
    <aside class="cn-props">
        <h2 class="cn-props__title">{{ panel.layer.value ? '图层属性' : '画布属性' }}</h2>
        <p v-if="visibleSections.length === 0" class="cn-props__empty">打开文档后可编辑属性</p>
        <section v-for="section in visibleSections" :key="section.title" class="cn-props__section">
            <h3 class="cn-props__section-title">{{ section.title }}</h3>
            <PropertyField
                v-for="item in section.fields"
                :key="item.key"
                :field="item.field"
                :value="item.value"
                @input="panel.commit(item.field, $event, false)"
                @change="panel.commit(item.field, $event, true)"
            />
        </section>
    </aside>
</template>

<style scoped>
.cn-props {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-self: stretch;
    box-sizing: border-box;
    width: 288px;
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    background: #fff;
    overflow-y: auto;
}

.cn-props__title {
    margin: 0;
    font-size: 14px;
    color: #0f172a;
}

.cn-props__empty {
    margin: 0;
    font-size: 12px;
    color: #94a3b8;
}

.cn-props__section {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.cn-props__section-title {
    margin: 0;
    padding-bottom: 2px;
    border-bottom: 1px solid #f1f5f9;
    font-size: 12px;
    font-weight: 600;
    color: #94a3b8;
}
</style>
