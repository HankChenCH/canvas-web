/**
 * useViewport：视口切片的响应式桥。shallowRef 整体替换（禁深度 reactive 红线），
 * 只在 ui.viewport 分支变更时同步；订阅随 effect scope 自动注销。
 */
import { computed, onScopeDispose, shallowRef, type ComputedRef } from 'vue'

import type { EditorSession, Viewport } from '@hankchen/canvas-editor'

export function useViewport(editor: EditorSession): ComputedRef<Viewport> {
    const viewport = shallowRef<Viewport>(editor.store.ui.viewport)

    const unsubscribe = editor.subscribe((change) => {
        if (change.scope === 'ui' && change.branch === 'viewport') {
            viewport.value = editor.store.ui.viewport
        }
    })
    // failSilently：测试可在无 effect scope 的环境调用
    onScopeDispose(unsubscribe, true)

    return computed(() => viewport.value)
}
