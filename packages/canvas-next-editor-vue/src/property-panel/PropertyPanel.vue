<script setup lang="ts">
/**
 * <PropertyPanel>：schema 驱动属性面板（工单 09）。订阅 = computed 切片
 * （选中路径的图层子树/画布），表单按字段描述注册表自动生成；一切编辑经
 * usePropertyPanel.commit 分派内核 action（updateSpec/updateData/
 * updateCanvasProp），面板零直改。注册表没有的字段不渲染、不告警。
 *
 * 两条块级/复合路由（layer-panel-ux 工票 03，域内展示决策）：
 * - control === 'anchor'：锚点折叠区（默认收起 + 9 点微缩图），不经
 *   PropertyField 的 label+control 行布局，直接渲染注册表条目；
 * - control === 'pair'：两列语义行仍经 PropertyField 分发，额外下发
 *   pairDisplays（自适应禁用态替代显示），子字段提交经 sub-commit 回归
 *   同一条 commit 管线。
 *
 * 视觉：暗色「精密仪器」检视面板——设计令牌见 panel-theme.css（作用域在
 * .cn-props 根，自带主题不渗漏宿主）；工具类由宿主 tailwind 经 @source 编译。
 */
import { computed, provide } from 'vue'

import type { Anchor, Canvas, EditorSession, Layer, ResourceStatus } from '@hankchen/canvas-next-editor'

import { readField, pairItemKey, type FieldDef, type FieldDisplay } from './fieldSchema'
import AnchorDisclosureField from './fields/AnchorDisclosureField.vue'
import PropertyField from './PropertyField.vue'
import { IMAGE_UPLOAD_KEY } from './imageUpload'
import { usePropertyPanel } from './usePropertyPanel'
import type { CompletionSource } from '../shared/completion'

const props = defineProps<{ editor: EditorSession }>()

const panel = usePropertyPanel(props.editor)

// 图片上传控件缝（imageUpload）：canUpload 与裸上传动作都是会话能力——面板以
// 持有的 EditorSession 提供一次，宿主零接线（上传实现仍归宿主注入的
// uploadHandler）；控件树任意深度 inject 取用
provide(IMAGE_UPLOAD_KEY, {
    canUpload: props.editor.canUpload,
    uploadImage: (file) => props.editor.uploadImage(file),
})

/**
 * 按字段分发对应候选源（rows-path-completion 工单 03，D6）：rowsPath 标记字段走
 * 行相对专用源（rowsPathSource），其余字段（data 门）走表达式源——两源互不串场。
 */
function fieldCompletionSource(field: FieldDef): CompletionSource | null {
    return field.completion === 'rowsPath' ? panel.rowsPathSource.value : panel.completionSource.value
}

interface RenderField {
    /** 渲染键：含选中路径——选择切换即重挂载字段组件（清草稿、闭合本地态） */
    key: string
    field: FieldDef
    value: unknown
    /** 数据字段取值方式（静态值/表达式）；undefined = 非 data 字段 */
    dataMode?: 'static' | 'expression'
    /**
     * 行级动态可见提示（placeholder-padding-hint 工单 02）：schema hint 谓词按
     * 选中层与资源态切片求值的产物；undefined = 无提示（谓词缺省/求值 null）。
     */
    hint?: string
    /**
     * 字段值的物化态（imageSrc 控件的缩略图角标）：按当前值原串查 ui 切片——
     * 无记录（宿主未桥接）= 不可知不假报；其他控件不下发。
     */
    resourceStatus?: ResourceStatus
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

/** 数据字段取值方式派生：expression 标记在场即表达式态（画布/无标记 → static） */
function readDataMode(target: Layer | Canvas): 'static' | 'expression' {
    const read = readField(target, ['expression'])
    return read.ok && read.value !== null ? 'expression' : 'static'
}

const visibleSections = computed<readonly RenderSection[]>(() => {
    // 目标对象：选中层优先；仅当确无选择时回退画布（选中存在但解析失败说明
    // 选择已失效——此时不渲染画布字段，避免展示一份提交不进去的表单）
    const target = panel.layer.value ?? (panel.selection.value ? null : panel.canvas.value)
    if (!target) return []
    const scope = panel.selection.value?.join('.') ?? 'canvas'
    // 行级动态提示只对图层级目标求值（谓词签名收图层；画布级无 hint 面）
    const hintTarget = panel.layer.value
    const statuses = panel.resourceStatuses.value
    const result: RenderSection[] = []
    for (const section of panel.sections.value) {
        const fields: RenderField[] = []
        for (const field of section.fields) {
            const read = readField(target, field.key)
            // 未知字段：不渲染、不告警（权威字段过滤的读侧兜底）
            if (!read.ok) continue
            fields.push({
                key: `${scope}:${field.key.join('.')}`,
                field,
                value: read.value,
                dataMode: field.data ? readDataMode(target) : undefined,
                hint: field.hint && hintTarget ? (field.hint(hintTarget, statuses) ?? undefined) : undefined,
                resourceStatus:
                    field.control === 'imageSrc' && typeof read.value === 'string' && read.value !== ''
                        ? statuses[read.value]
                        : undefined,
            })
        }
        if (fields.length > 0) result.push({ title: section.title, fields })
    }
    return result
})

/**
 * pair 自适应列的禁用态替代显示：自适应开 → layerBoxAt 解析值（gizmo 同源）。
 * 高自适应为工票 03 落地，宽自适应随自然宽求值补齐（autowidth 工单 04）——盒几何
 * 同源解析，两列同一视觉语言。模板子树是预览盒，preview 标记驱动斜体 + 悬停说明
 * 的区分展示。显示键按注册表推导（auto.key → 盒维度映射），不硬编码键串。
 */
const pairDisplays = computed<Record<string, FieldDisplay>>(() => {
    const displays: Record<string, FieldDisplay> = {}
    const box = panel.layerBox.value
    const layer = panel.layer.value
    if (!box || !layer) return displays

    // auto.key（相对 pair 值对象）→ 该 flag 开启时的解析维度；只收集开着的 flag
    const resolved = new Map<string, number>()
    if (layer.shape.autoWidth) resolved.set('autoWidth', Math.round(box.width * 100) / 100)
    if (layer.shape.autoHeight) resolved.set('autoHeight', Math.round(box.height * 100) / 100)
    if (resolved.size === 0) return displays

    for (const section of panel.sections.value) {
        for (const field of section.fields) {
            for (const item of field.items ?? []) {
                const value = item.auto ? resolved.get(item.auto.key.join('.')) : undefined
                if (value === undefined) continue
                displays[pairItemKey(field, item).join('.')] = {
                    value,
                    preview: panel.isPreviewBox.value,
                }
            }
        }
    }
    return displays
})

function toggleAnchorExpanded(): void {
    panel.setAnchorExpanded(!panel.anchorExpanded.value)
}
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
            <div class="flex flex-col gap-2">
                <template v-for="item in section.fields" :key="item.key">
                    <!-- 锚点 = 块级折叠区：不经 PropertyField 行布局，直接渲染注册表条目 -->
                    <AnchorDisclosureField
                        v-if="item.field.control === 'anchor'"
                        :field="item.field"
                        :model-value="item.value as Anchor"
                        :expanded="panel.anchorExpanded.value"
                        @change="panel.commit(item.field, $event, true)"
                        @toggle="toggleAnchorExpanded"
                    />
                    <PropertyField
                        v-else
                        :field="item.field"
                        :value="item.value"
                        :data-mode="item.dataMode"
                        :hint="item.hint"
                        :completion="fieldCompletionSource(item.field)"
                        :displays="pairDisplays"
                        :resource-status="item.resourceStatus"
                        @input="panel.commit(item.field, $event, false)"
                        @change="panel.commit(item.field, $event, true)"
                        @toggle-mode="panel.toggleDataMode(item.field)"
                        @sub-commit="panel.commit"
                    />
                </template>
            </div>
        </section>
    </aside>
</template>
