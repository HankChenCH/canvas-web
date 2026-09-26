/**
 * useShortcuts：快捷键注册表的绑定层桥（工单 14）。
 *
 * window keydown → KeyboardEvent 折算（mod/composing/editing/editableTarget）→
 * 内核 classifyEditorShortcut（让路规则在分类器裁决，有测试锁定）→ preventDefault
 * + executeShortcut。折算说明：
 * - mod = Ctrl（Windows/Linux）或 Cmd（macOS），两平台等价；
 * - composing = isComposing || keyCode === 229（历史快捷键同款兼容位）；
 * - editing = ui.editing ≠ null（文本编辑态，事件时点直读 store——非响应式读取
 *   对事件处理器正合适：keydown 采样当下状态）。
 * 命中才拦截默认行为（Ctrl+D 书签、浏览器剪贴板等）；未命中放行页面默认。
 */
import { onScopeDispose } from 'vue'

import { classifyEditorShortcut, type EditorSession } from '@hankchen/canvas-next-editor'

import { isEditableEventTarget } from './editableTarget'

export function useShortcuts(editor: EditorSession): void {
    const onKeyDown = (event: KeyboardEvent): void => {
        const action = classifyEditorShortcut({
            key: event.key,
            mod: event.ctrlKey || event.metaKey,
            shift: event.shiftKey,
            composing: event.isComposing || event.keyCode === 229,
            editing: editor.store.ui.editing !== null,
            editableTarget: isEditableEventTarget(event.target),
        })
        if (action === null) return
        event.preventDefault()
        editor.executeShortcut(action)
    }
    window.addEventListener('keydown', onKeyDown)
    // failSilently：测试可在无 effect scope 的环境调用
    onScopeDispose(() => window.removeEventListener('keydown', onKeyDown), true)
}
