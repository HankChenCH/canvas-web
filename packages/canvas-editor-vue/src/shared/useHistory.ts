/**
 * useHistory：历史可用态的响应式桥（useViewport/useSelection 同款模式）。
 * 两个布尔都随 doc 分支变更同步——transact/undo/redo/打开文档是仅有的改栈
 * 入口，且都以 doc 通知收口；ui 分支（选择/相机/拖动会话）不改栈。
 * shallowRef 整体替换（禁深度 reactive 红线），订阅随 effect scope 自动注销。
 */
import { computed, onScopeDispose, shallowRef, type ComputedRef } from 'vue'

import type { EditorSession } from '@hankchen/canvas-editor'

export interface HistoryAvailability {
    canUndo: ComputedRef<boolean>
    canRedo: ComputedRef<boolean>
}

export function useHistory(editor: EditorSession): HistoryAvailability {
    const canUndo = shallowRef(editor.store.canUndo)
    const canRedo = shallowRef(editor.store.canRedo)

    const unsubscribe = editor.subscribe((change) => {
        if (change.scope !== 'doc') return
        canUndo.value = editor.store.canUndo
        canRedo.value = editor.store.canRedo
    })
    // failSilently：测试可在无 effect scope 的环境调用
    onScopeDispose(unsubscribe, true)

    return {
        canUndo: computed(() => canUndo.value),
        canRedo: computed(() => canRedo.value),
    }
}
