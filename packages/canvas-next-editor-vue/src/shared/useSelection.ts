/**
 * useSelection：选择切片的响应式桥（与 useViewport 同款模式）。shallowRef 整体
 * 替换（禁深度 reactive 红线），只在 ui.selection 分支或 doc 变更（打开文档会
 * 重置选择）时同步；订阅随 effect scope 自动注销。
 */
import { computed, onScopeDispose, shallowRef, type ComputedRef } from 'vue'

import type { EditorSession, LayerPath } from '@hankchen/canvas-next-editor'

export function useSelection(editor: EditorSession): ComputedRef<LayerPath | null> {
    const selection = shallowRef<LayerPath | null>(editor.store.ui.selection)

    const unsubscribe = editor.subscribe((change) => {
        if (change.scope === 'doc' || (change.scope === 'ui' && change.branch === 'selection')) {
            selection.value = editor.store.ui.selection
        }
    })
    // failSilently：测试可在无 effect scope 的环境调用
    onScopeDispose(unsubscribe, true)

    return computed(() => selection.value)
}
