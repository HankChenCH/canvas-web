/**
 * 跨域切片桥出口：选择/视口/历史/快捷键切片桥、快捷键帮助面板（开合单例态 +
 * 展示件）、可编辑目标谓词、面板图标统一封装、DOM File 上传组装、状态栏瞬时
 * 反馈单例与表达式补全五件（数据契约/锚点测量/浮层控件/呈现件/上下文判定与
 * 候选源适配——属性面板与画布文本编辑两域共用）。这是唯一允许被各域引用的
 * 层——域间横向 import 被依赖红线（editor-vue-*-isolation）禁止，跨域消费
 * 一律收口到这里。
 */
export { default as HelpDialog } from './HelpDialog.vue'
export { default as DropdownMenu } from './DropdownMenu.vue'
export {
    useDropdownMenu,
    type DropdownMenuController,
    type DropdownMenuEntry,
    type DropdownMenuItem,
} from './useDropdownMenu'
export { isEditableEventTarget } from './editableTarget'
export { default as ExpressionCompletionPopup } from './ExpressionCompletionPopup.vue'
export { applyCompletion, type CompletionItem, type CompletionResult, type CompletionSource } from './completion'
export { measureCursorAnchor, type CompletionAnchor } from './completionAnchor'
export {
    expressionCompletionSource,
    expressionFieldContext,
    type ExpressionFieldContext,
} from './expressionContext'
export { useExpressionCompletion, type ExpressionCompletionState } from './useExpressionCompletion'
export { useHistory, type HistoryAvailability } from './useHistory'
export { useSelection } from './useSelection'
export { useShortcuts } from './useShortcuts'
export { useShortcutsHelp, type ShortcutsHelp } from './useShortcutsHelp'
export { useTransientFeedback, type TransientFeedback } from './useTransientFeedback'
export { uploadFileFromDom } from './uploadFile'
export { useViewport } from './useViewport'
export { default as PanelIcon } from './PanelIcon.vue'
