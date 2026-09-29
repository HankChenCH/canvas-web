/**
 * useDataSourceSchema：schema 声明切片的响应式桥（status-bar 域内私有，与
 * shared/useViewport 同款模式）。shallowRef 整体替换（禁深度 reactive 红线），
 * 只在 ui.dataSourceSchema 分支通知（注入/清除）时同步；订阅随 effect scope
 * 自动注销。声明随会话（openDocument 不重置），无需挂 doc 通知。
 */
import { computed, onScopeDispose, shallowRef, type ComputedRef } from 'vue'

import type { EditorSession, ExpressionSchemaNode } from '@hankchen/canvas-next-editor'

export function useDataSourceSchema(editor: EditorSession): ComputedRef<ExpressionSchemaNode | null> {
    const schema = shallowRef<ExpressionSchemaNode | null>(editor.store.ui.dataSourceSchema)

    const unsubscribe = editor.subscribe((change) => {
        if (change.scope === 'ui' && change.branch === 'dataSourceSchema') {
            schema.value = editor.store.ui.dataSourceSchema
        }
    })
    // failSilently：测试可在无 effect scope 的环境调用
    onScopeDispose(unsubscribe, true)

    return computed(() => schema.value)
}
