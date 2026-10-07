/**
 * useDoc：文档切片的响应式桥（status-bar 域内私有，与 shared/useViewport 同款
 * 模式）。shallowRef 整体替换（禁深度 reactive 红线），只在 doc 通知（编辑事务/
 * 撤销重做/打开文档）时同步；订阅随 effect scope 自动注销。
 *
 * 域内私有：目前只有状态栏坐标段消费；属性面板将来读同一文档数据时上移 shared
 * （≥2 域共享的切片桥进 shared，包内 AGENTS.md 分域纪律）。
 */
import { computed, onScopeDispose, shallowRef, type ComputedRef } from 'vue'

import type { Canvas, EditorSession } from '@hankchen/canvas-editor'

export function useDoc(editor: EditorSession): ComputedRef<Canvas | null> {
    const doc = shallowRef<Canvas | null>(editor.store.doc)

    const unsubscribe = editor.subscribe((change) => {
        if (change.scope === 'doc') doc.value = editor.store.doc
    })
    // failSilently：测试可在无 effect scope 的环境调用
    onScopeDispose(unsubscribe, true)

    return computed(() => doc.value)
}
