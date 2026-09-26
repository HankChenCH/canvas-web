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
    type LayerPath,
} from '@hankchen/canvas-next-editor'

import {
    CANVAS_FIELD_SECTIONS,
    fieldSectionsForPath,
    type FieldDef,
    type FieldSection,
} from './fieldSchema'

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
    /** 面板唯一提交口：final = 收口提交（change/blur），否则按 mergeKey 合并累积 */
    commit(field: FieldDef, value: unknown, final: boolean): void
}

export function usePropertyPanel(editor: EditorSession): PropertyPanelBinding {
    const doc = shallowRef<Canvas | null>(editor.store.doc)
    const selection = shallowRef<LayerPath | null>(editor.store.ui.selection)

    const unsubscribe = editor.subscribe((change) => {
        if (change.scope === 'doc') {
            doc.value = editor.store.doc
        } else if (change.branch === 'selection') {
            selection.value = editor.store.ui.selection
            // 选择切换（含清空）即同步闭合开放事务：字段组件随选择重挂载，
            // blur 不再可达，避免同键事务跨选择会话并入旧步
            editor.store.closeMerge()
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
        if (field.data) editor.updateData(path, value as string | null, { mergeKey })
        else editor.updateSpec(path, field.key, value, { mergeKey })
        if (final) editor.store.closeMerge(mergeKey)
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
        commit,
    }
}
