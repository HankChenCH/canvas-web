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
    pathsEqual,
    resolveLayer,
    resolveRowsPathStartSchema,
    type Canvas,
    type EditorSession,
    type Layer,
    type LayerBox,
    type LayerPath,
    type ResourceStatusMap,
    type TextEditingSession,
} from '@hankchen/canvas-editor'

import {
    CANVAS_FIELD_SECTIONS,
    fieldSectionsForPath,
    type FieldDef,
    type FieldSection,
} from './fieldSchema'
import {
    expressionCompletionSource,
    expressionFieldContext,
} from '../shared/expressionContext'
import { selectionFieldMergeKey } from '../shared/mergeKey'
import { rowsPathPickerSource, rowsPathValueDrifts } from '../shared/rowsPathPickerSource'
import type { CompletionSource } from '../shared/completion'

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
    /**
     * rowsPath 字段的级联点选候选源（rows-path-picker 工单 03）：起点三分流判别
     * （根层表 = 载荷根 schema；嵌套表 = 外层行 schema 行相对；判别降级 null）+
     * 工单 01 剪枝枚举件按前缀供给（rowsPathPickerSource 组装，候选面剪枝至
     * 「通往行数组的路径」）。起点 null = null 源（门态，菜单钮不渲染，spec D1）。
     */
    readonly rowsPathSource: ComputedRef<CompletionSource | null>
    /**
     * 已提交 rowsPath 的漂移态（rows-path-picker 工单 03，spec D2）：模板表选中
     * 态下按起点三分流判已提交值——枚举不出或终点非数组 = true（回显标红，菜单
     * 照常可开可重选）；未绑声明/字段面外（非模板表目标）恒 false（门态弱提示
     * 替代标红）。
     */
    readonly rowsPathDrifted: ComputedRef<boolean>
    /** 锚点折叠区开合（store ui 分支投影，会话内记忆；工票 03） */
    readonly anchorExpanded: ComputedRef<boolean>
    /**
     * 资源物化状态切片（placeholder-padding-hint 工单 02，store ui 分支投影）：
     * 宿主从渲染端物化状态机桥接注入，padding 行占位态动态提示的物化维度事实源。
     */
    readonly resourceStatuses: ComputedRef<ResourceStatusMap>
    /**
     * 会话内容独占（canvas-web-edit-overlay-toolbar 工单 02，ADR 0019 门面）：
     * 编辑会话在场且选中层即编辑层 → 内容面锁定（data 字段与模式段 disabled，
     * 显示随会话活标志/文档现值，退出后随文档通知追平）。会话保持但选择走开
     * （显示别的层）不锁。
     */
    readonly contentLocked: ComputedRef<boolean>
    /** 锁定时的模式显示源：编辑会话对象（活标志 = expression），非锁定为 null */
    readonly editingSession: ComputedRef<TextEditingSession | null>
    /** 数据字段当前取值方式（锁定期随会话活标志，否则随层标记态）；非 data 字段恒 false */
    isDataMarked(field: FieldDef): boolean
    /** 面板唯一提交口：final = 收口提交（change/blur），否则按 mergeKey 合并累积 */
    commit(field: FieldDef, value: unknown, final: boolean): void
    /**
     * 数据字段取值方式切换（静态值/表达式，工单 02）：语义经内核 toggleDataMode
     * 收口——非会话期正常切换（一步历史），编辑会话期命中编辑层只翻会话活标志
     * （零文档变更零历史步，防御性路由；面板锁定段常态下不可达，路由兜宿主旁路）。
     * 仅 data 字段且有选中目标时生效。
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
    /** 资源物化状态切片（工单 02 注入缝，会话态）：padding 行占位态提示的物化维度 */
    const resourceStatuses = shallowRef<ResourceStatusMap>(editor.store.ui.resourceStatuses)
    /**
     * 编辑会话投影（canvas-web-edit-overlay-toolbar 工单 02）：镜像整个会话对象
     * （useTextEditing 同款反应锚）——pill/内核 toggleDataMode 翻标志 = setEditing
     * 原位换新对象，锁定段的模式显示随翻转立即重算。doc 通知一并重读（契约注记：
     * openDocument 清会话只发 doc 通知）。
     */
    const editingSession = shallowRef<TextEditingSession | null>(editor.store.ui.editing)

    const unsubscribe = editor.subscribe((change) => {
        if (change.scope === 'doc') {
            doc.value = editor.store.doc
            // openDocument 重置 selection（uiValue 整体重建）但 doc 通知不携 ui 分支——
            // 镜像在此重读（useSelection 同门），否则换文档后旧路径解到新文档同下标的
            // 层上，面板给已不被选中的层继续显示表单（工单 03 目验同族第三处收口）
            selection.value = editor.store.ui.selection
            // resourceStatuses 同被 openDocument 重置：doc 通知一并重读（契约注记同门）
            resourceStatuses.value = editor.store.ui.resourceStatuses
            // editing 同被 openDocument 重置：doc 通知一并重读（契约注记同门）
            editingSession.value = editor.store.ui.editing
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
            } else if (change.branch === 'resourceStatuses') {
                resourceStatuses.value = editor.store.ui.resourceStatuses
            } else if (change.branch === 'editing') {
                editingSession.value = editor.store.ui.editing
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

    /**
     * rowsPath 起点三分流判别（rows-path-picker 工单 03）：点选候选源与漂移判定
     * 的共享起点（同一响应式依赖切片，一次求值两处消费）。
     */
    const rowsPathStartSchema = computed(() =>
        resolveRowsPathStartSchema(doc.value, selection.value, dataSourceSchema.value),
    )

    /**
     * rowsPath 字段的级联点选候选源（rows-path-picker 工单 03，D1/D3）：工单 01
     * 剪枝枚举件按前缀供给（候选面剪枝至「通往行数组的路径」，数组终点带 type
     * 'array' 语义标记，「行数组」徽标文案归组件呈现层映射）。schema 未注入 =
     * null 源；判别降级（外层 rowsPath 无 items 声明/漂移/途经非表）= null 源
     * （门态：菜单钮不渲染，只读回显 + 弱提示归字段层）。
     */
    const rowsPathSource = computed<CompletionSource | null>(() => rowsPathPickerSource(rowsPathStartSchema.value))

    /**
     * 已提交 rowsPath 的漂移态（spec D2）：判定作用于已提交值（无输入期概念），
     * 仅模板表目标求值（字段面外恒 false）；未绑声明 = 门态不判漂移（D1，弱提示
     * 替代标红）。
     */
    const rowsPathDrifted = computed<boolean>(() => {
        const current = layer.value
        if (current === null || current.type !== 'TableLayer' || current.template === null) return false
        return rowsPathValueDrifts(rowsPathStartSchema.value, current.rowsPath)
    })

    // 与内核 isTemplateSubtreePath 同义（path 含 template 段）；内核符号落地前
    // 域内自持，语义漂移由内核侧测试看护
    const isPreviewBox = computed(() => selection.value?.includes('template') ?? false)

    /**
     * 内容面锁定（工单 02 门面）：编辑会话在场且选中层即编辑层。锁定下 data 字段
     * 与模式段 disabled；模式显示以会话活标志为单一事实源（editingSession 投影），
     * 内容字段读数照常来自文档（live 键入不落文档 = 进入时文本；旁门接管写随
     * doc 通知追平）。
     */
    const contentLocked = computed(() => {
        const session = editingSession.value
        const path = selection.value
        return session !== null && path !== null && pathsEqual(session.path, path)
    })

    function setAnchorExpanded(open: boolean): void {
        editor.store.setAnchorExpanded(open)
    }

    /**
     * 数据字段取值方式派生：锁定期（编辑会话在场且选中层即编辑层）显示随会话
     * 活标志——pill/内核 toggleDataMode 翻转实时随动，层标记态反而滞后（ADR 0019
     * 单一事实源）；否则按领域 expression 标记现态派生（打标/解标动作即时改状态）。
     */
    function isDataMarked(field: FieldDef): boolean {
        if (!field.data) return false
        if (contentLocked.value) return editingSession.value?.expression === true
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
        // 随后收口——一个输入会话至多一步历史。键格式收口 shared（工具条权威写
        // 同键，edit-overlay-toolbar 工单 04——双入口交替操作并步的根基）
        const mergeKey = selectionFieldMergeKey(path, field.key)
        if (field.data) {
            if (isDataMarked(field)) {
                // 表达式态：编辑保持标记（expression + 镜像同改），mergeKey 与
                // 字面态分键——跨态切换不并入同一步（spec §2）
                const expressionKey = selectionFieldMergeKey(path, ['data', 'expression'])
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

    /**
     * 数据字段取值方式切换（工单 02 收口内核）：分派 editor.toggleDataMode——
     * 非会话期正常切换（一步历史），会话期命中编辑层只翻活标志（防御路由）。
     */
    function toggleDataMode(field: FieldDef): void {
        const path = selection.value
        if (!path || !field.data) return
        editor.toggleDataMode(path)
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
        rowsPathSource,
        rowsPathDrifted,
        resourceStatuses: computed(() => resourceStatuses.value),
        anchorExpanded: computed(() => anchorExpanded.value),
        contentLocked,
        editingSession: computed(() => editingSession.value),
        isDataMarked,
        commit,
        toggleDataMode,
        setAnchorExpanded,
    }
}
