/**
 * useShortcuts：快捷键注册表的绑定层桥（工单 14）。
 *
 * window keydown → KeyboardEvent 折算（mod/alt/composing/editing/editableTarget/
 * code）→ 内核 classifyEditorShortcut（让路规则在分类器裁决，有测试锁定）→
 * preventDefault + 分发。分发三路：helpShortcuts（kbd-nav 工单 04）是 UI 面动作
 * ——开合帮助面板单例态（useShortcutsHelp），不经内核 dispatcher、不进内核
 * store；armCreate* 武装四动作（drag-create 工单 03）经内核 executeShortcut 置
 * 待命态后由桥补状态栏瞬时提示；其余动作 editor.executeShortcut。折算说明：
 * - mod = Ctrl（Windows/Linux）或 Cmd（macOS），两平台等价；alt 同理（kbd-nav
 *   工单 01 起 ⌥⌘ 组合按 code 匹配，alt 必须折算）；
 * - code = event.code（物理键码）：⌥ 变体字符与 ⇧ 数字变体场景下 key 不可靠，
 *   注册表按 code 匹配的条目只认它；
 * - composing = isComposing || keyCode === 229（历史快捷键同款兼容位）；
 * - editing = ui.editing ≠ null（文本编辑态，事件时点直读 store——非响应式读取
 *   对事件处理器正合适：keydown 采样当下状态）。
 * 命中才拦截默认行为（Ctrl+D 书签、浏览器剪贴板等）；未命中放行页面默认。
 */
import { onScopeDispose } from 'vue'

import {
    ARM_CREATE_LAYER_TYPES,
    classifyEditorShortcut,
    type EditorSession,
    type EditorShortcutAction,
} from '@hankchen/canvas-next-editor'

import { isEditableEventTarget } from './editableTarget'
import { useShortcutsHelp } from './useShortcutsHelp'
import { ARM_LAYER_CREATE_HINT } from './shortcutsHelp'
import { useTransientFeedback } from './useTransientFeedback'

/** 武装动作集：从内核映射表派生（哪四个动作是武装的单一事实源在内核，加层型零改桥） */
const ARM_CREATE_ACTIONS: ReadonlySet<EditorShortcutAction> = new Set(
    Object.keys(ARM_CREATE_LAYER_TYPES) as EditorShortcutAction[],
)

export function useShortcuts(editor: EditorSession): void {
    const help = useShortcutsHelp()
    const feedback = useTransientFeedback()
    const onKeyDown = (event: KeyboardEvent): void => {
        const action = classifyEditorShortcut({
            key: event.key,
            mod: event.ctrlKey || event.metaKey,
            shift: event.shiftKey,
            alt: event.altKey,
            code: event.code,
            composing: event.isComposing || event.keyCode === 229,
            editing: editor.store.ui.editing !== null,
            editableTarget: isEditableEventTarget(event.target),
        })
        if (action === null) return
        event.preventDefault()
        // UI 面动作（kbd-nav 工单 04）：⌘/ 开合帮助面板——对话态是 UI 关注点，
        // 不经内核 dispatcher、不进内核 store，桥在此拦截路由
        if (action === 'helpShortcuts') {
            help.toggle()
            return
        }
        editor.executeShortcut(action)
        // 武装动作（drag-create 工单 03）：内核只置待命态，操作方式提示在这里补——
        // 与面板新增项入口同句（ARM_LAYER_CREATE_HINT），武装恒成功故不查返回值
        if (ARM_CREATE_ACTIONS.has(action)) feedback.show(ARM_LAYER_CREATE_HINT)
    }
    window.addEventListener('keydown', onKeyDown)
    // failSilently：测试可在无 effect scope 的环境调用
    onScopeDispose(() => window.removeEventListener('keydown', onKeyDown), true)
}
