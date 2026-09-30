/**
 * usePropertyPanel：属性面板的响应式桥（工单 09）。useViewport/useSelection 同款
 * 模式——shallowRef 整体替换（禁深度 reactive 红线）、订阅随 effect scope 注销。
 *
 * - 订阅为 computed 切片：layer = 选中路径处的领域子树。immer 结构共享保证无关
 *   图层变更时 resolveLayer 返回同一引用，Vue 3.4 的 computed 变更传播短路让
 *   下游（字段组/控件）不重算；选中层自身变更才联动。
 * - 未选中图层时目标为画布级（宽/高字段组）；未打开文档时字段组为空。
 * - commit 是面板唯一提交口，一切文档编辑分派到内核 action（updateSpec/
 *   updateData/updateCanvasProp），面板零直改：live 提交带 mergeKey（选中路径 +
 *   字段路径，跨层/跨字段互不合并）合并为一步历史，final（change/blur）收口。
 * - 选择切换时闭合未收口的事务：字段组件按选择重挂载会丢掉 blur，此处兜底
 *   闭合，避免同键事务跨选择会话并入旧步。
 */
import { computed, onScopeDispose, shallowRef, type ComputedRef } from 'vue'

import {
    resolveLayer,
    type Canvas,
    type EditorSession,
    type Layer,
    type LayerBox,
    type LayerPath,
} from '@hankchen/canvas-next-editor'

import {
    CANVAS_FIELD_SECTIONS,
    fieldSectionsForPath,
    readField,
    type FieldDef,
    type FieldSection,
} from './fieldSchema'
import {
    expressionCompletionSource,
    expressionFieldContext,
} from './expressionContext'
import type { CompletionSource } from './fields/completion'

export type { FieldDef, FieldSection } from './fieldSchema'

export interface PropertyPanelBinding {
    /** 当前选中路径；null = 画布级目标 */
    readonly selection: ComputedRef<LayerPath | null>
    /** 选中层的领域对象切片；未选中 null */
    readonly layer: ComputedRef<Layer | null>
    /** 文档画布（画布级字段读值）；未打开文档 null */
    readonly canvas: ComputedRef<Canvas | null>
    /** 当前目标的字段组：选中层按 type/角色过滤，画布级为宽/高，无文档为空 */
    readonly sections: ComputedRef<readonly FieldSection[]>
    /**
     * 选中层的绝对盒（layer-panel-ux 工票 03）：EditorSession.layerBoxAt 的
     * computed 切片，与画布 gizmo 同源——自适应高的禁用态显示值据此计算。
     * 模板子树经 previewCanvas 解析为预览盒（isPreviewBox 驱动区分展示）。
     */
    readonly layerBox: ComputedRef<LayerBox | null>
    /** 选中路径是否落在模板子树（layerBoxAt 届时返回预览盒而非文档盒） */
    readonly isPreviewBox: ComputedRef<boolean>
    /**
     * 当前目标的补全候选源（content-completion 工单 05）：随选中路径切换上下文
     * （根层 = 根候选集 / 模板格内容层 = 行候选集）；未注入声明为 null。
     */
    readonly completionSource: ComputedRef<CompletionSource | null>
    /** 锚点折叠区开合（store ui 分支投影，会话内记忆；工票 03） */
    readonly anchorExpanded: ComputedRef<boolean>
    /** 面板唯一提交口：final = 收口提交（change/blur），否则按 mergeKey 合并累积 */
    commit(field: FieldDef, value: unknown, final: boolean): void
    /**
     * 数据字段取值方式切换（静态值/表达式，工单 02）：静态 → 表达式初值取当前
     * 字面原文（不自动包裹/猜变量）；表达式 → 静态字面接管（值保持现镜像）。
     * 各为独立一步历史；仅 data 字段且有选中目标时生效。
     */
    toggleDataMode(field: FieldDef): void
    /** 锚点折叠区开合（写 store ui 分支，不进历史） */
    setAnchorExpanded(open: boolean): void
}

export function usePropertyPanel(editor: EditorSession): PropertyPanelBinding {
    const doc = shallowRef<Canvas | null>(editor.store.doc)
    const selection = shallowRef<LayerPath | null>(editor.store.ui.selection)
    const anchorExpanded = shallowRef(editor.store.ui.anchorExpanded)
    /** 数据源 schema 声明（工单 03 注入缝，会话态）：补全候选源的唯一来源 */
    const dataSourceSchema = shallowRef(editor.store.ui.dataSourceSchema)

    const unsubscribe = editor.subscribe((change) => {
        if (change.scope === 'doc') {
            doc.value = editor.store.doc
            // openDocument 重置 selection（uiValue 整体重建）但 doc 通知不携 ui 分支——
            // 镜像在此重读（useSelection 同门），否则换文档后旧路径解到新文档同下标的
            // 层上，面板给已不被选中的层继续显示表单（工单 03 目验同族第三处收口）
            selection.value = editor.store.ui.selection
        } else if (change.scope === 'ui') {
            if (change.branch === 'selection') {
                selection.value = editor.store.ui.selection
                // 选择切换（含清空）即同步闭合开放事务：字段组件随选择重挂载，
                // blur 不再可达，避免同键事务跨选择会话并入旧步
                editor.store.closeMerge()
            } else if (change.branch === 'anchorExpanded') {
                anchorExpanded.value = editor.store.ui.anchorExpanded
            } else if (change.branch === 'dataSourceSchema') {
                dataSourceSchema.value = editor.store.ui.dataSourceSchema
            }
        }
    })
    // failSilently：测试可在无 effect scope 的环境调用
    onScopeDispose(unsubscribe, true)

    const layer = computed<Layer | null>(() => {
        const current = doc.value
        const path = selection.value
        return current && path ? resolveLayer(current, path) : null
    })

    const canvas = computed<Canvas | null>(() => doc.value)

    const sections = computed<readonly FieldSection[]>(() => {
        const current = layer.value
        const path = selection.value
        if (current && path) return fieldSectionsForPath(path, current)
        return doc.value ? CANVAS_FIELD_SECTIONS : []
    })

    const layerBox = computed<LayerBox | null>(() => {
        const path = selection.value
        return path && doc.value ? editor.layerBoxAt(path) : null
    })

    /**
     * 当前选中目标的补全候选源（content-completion 工单 05 接线）：按选中路径
     * 判定上下文（根层 = 根候选集；模板格内容层 = 行候选集，expressionContext
     * 对齐 PHP 行上下文注入面），包裹内核枚举器成工单 04 浮层的 CompletionSource。
     * schema 未注入/被拒（null）= null 源，字段侧浮层恒闭。
     */
    const completionSource = computed<CompletionSource | null>(() => {
        const schema = dataSourceSchema.value
        if (schema === null) return null
        return expressionCompletionSource(schema, expressionFieldContext(schema, doc.value, selection.value))
    })

    // 与内核 isTemplateSubtreePath 同义（path 含 template 段）；内核符号落地前
    // 域内自持，语义漂移由内核侧测试看护
    const isPreviewBox = computed(() => selection.value?.includes('template') ?? false)

    function setAnchorExpanded(open: boolean): void {
        editor.store.setAnchorExpanded(open)
    }

    /** 数据字段取值方式派生：领域 expression 标记在场即表达式态（打标/解标动作
     *  即时改状态，按现态派生与管线自洽，无需面板侧额外状态） */
    function isDataMarked(field: FieldDef): boolean {
        if (!field.data) return false
        const current = layer.value
        return current !== null && 'expression' in current && current.expression !== null
    }

    function commit(field: FieldDef, value: unknown, final: boolean): void {
        if (!doc.value) return
        const path = selection.value
        if (!path) {
            commitCanvasProp(field, value, final)
            return
        }
        // live 与 final 都带同键：final 值若与最后一次 live 不同则并入本会话，
        // 随后收口——一个输入会话至多一步历史
        const mergeKey = `sel:${path.join('.')}:${field.key.join('.')}`
        if (field.data) {
            if (isDataMarked(field)) {
                // 表达式态：编辑保持标记（expression + 镜像同改），mergeKey 与
                // 字面态分键——跨态切换不并入同一步（spec §2）
                const expressionKey = `sel:${path.join('.')}:data.expression`
                editor.updateDataExpression(path, value as string | null, { mergeKey: expressionKey })
                if (final) editor.store.closeMerge(expressionKey)
                return
            }
            // 静态态：字面写解除标记（updateData 既有语义，标记层不会走到这里）
            editor.updateData(path, value as string | null, { mergeKey })
            if (final) editor.store.closeMerge(mergeKey)
            return
        }
        editor.updateSpec(path, field.key, value, { mergeKey })
        if (final) editor.store.closeMerge(mergeKey)
    }

    function toggleDataMode(field: FieldDef): void {
        const current = layer.value
        const path = selection.value
        if (!current || !path || !field.data) return
        const read = readField(current, field.key)
        if (!read.ok) return
        const literal = typeof read.value === 'string' ? read.value : ''
        if (isDataMarked(field)) {
            // 表达式 → 静态：字面接管（值保持现镜像）
            editor.updateData(path, literal)
        } else {
            // 静态 → 表达式：初值 = 当前字面原文（不自动包裹/猜变量）
            editor.updateDataExpression(path, literal)
        }
    }

    function commitCanvasProp(field: FieldDef, value: unknown, final: boolean): void {
        const key = field.key[0]
        if ((key !== 'width' && key !== 'height') || typeof value !== 'number') return
        const mergeKey = `canvas:${key}`
        editor.updateCanvasProp(key, value, { mergeKey })
        if (final) editor.store.closeMerge(mergeKey)
    }

    return {
        selection: computed(() => selection.value),
        layer,
        canvas,
        sections,
        layerBox,
        isPreviewBox,
        completionSource,
        anchorExpanded: computed(() => anchorExpanded.value),
        commit,
        toggleDataMode,
        setAnchorExpanded,
    }
}
