/**
 * 跨域切片桥出口：选择/视口/历史/快捷键切片桥、快捷键帮助面板（开合单例态 +
 * 展示件）、快捷键展示侧纯函数与常量（键位符号/平台侦测/武装提示句——包内
 * 散落组件与宿主工具栏共用，editor-top-toolbar 工单 03 起入出口；带档变体提示
 * armLayerCreatePresetHint 住 layer-panel 域 addMenu——面板预设二级分发专用，
 * 单域消费不进 shared，评审整改 F1）、可编辑目标
 * 谓词、面板图标统一封装、DOM File 上传组装、状态栏瞬时反馈单例、下拉菜单底座
 * （呈现件 + 开合逻辑 composable；工具栏三下拉内建触发钮直用，状态栏缩放菜单/
 * 面板＋经 #trigger/#body 受控插槽迁移消费——issues/05）与表达式补全五件（数据
 * 契约/锚点测量/浮层控件/上下文判定与候选源适配——属性面板与画布文本
 * 编辑两域共用）及裸路径补全控件 usePathCompletion（rows-path-completion 工单
 * 02：复用同门 Popup/Anchor/applyCompletion，触发语义分轨——裸路径输入即弹）、
 * rowsPath 候选源组装 rowsPathCompletionSource（工单 03/04：「行数组」文案置入
 * 的公共合流点）与 schema 声明切片桥 useDataSourceSchema（工单 04 自 status-bar
 * 收口——状态栏读数段与建表表单两域共用）与字体清单注入缝 fontPicker（
 * edit-overlay-toolbar 工单 04 自属性面板域迁入——面板字体控件与编辑浮层工具条
 * 字体段两域共用）与字段权威写 mergeKey 约定 mergeKey（面板与工具条双入口同键
 * 合并的格式单点）与资源表达式级联路径选择器 ExpressionPathPicker + `{{}}` 拆装
 * 纯函数 resourceTemplate + 弹层视口定位纯函数 popupPosition（resource-expression-
 * single-ref 工单 05/06：资源内容字段的作者面 = 纯菜单点选，垂直翻转/钳制定位
 * 两浮层与选择器菜单共用）。
 * 这是唯一允许被各域引用的层——域间横向 import 被依赖红线
 * （editor-vue-*-isolation）禁止，跨域消费一律收口到这里。
 * 下拉底座（editor-top-toolbar 工单 02 起入出口）：composable 与基础条目类型。
 * 两段式 submenu 件（canvas-web-preset-submenu 工单 02：类型 DropdownSubmenuEntry、
 * 判定 isSubmenuEntry、开合/翻转/二级键盘/焦点落点各纯函数）与包内消费域一样
 * 只经 useDropdownMenu 模块直引（呈现件/面板/工具栏/单测），无 barrel 消费者，
 * 不重复入出口（评审整改 F3 收敛——纯函数/类型导出按真实消费面入 barrel）。
 */
export { default as HelpDialog } from './HelpDialog.vue'
export { default as DropdownMenu } from './DropdownMenu.vue'
export {
    useDropdownMenu,
    type DropdownMenuController,
    type DropdownMenuEntry,
    type DropdownMenuItem,
    type DropdownMenuSlotProps,
} from './useDropdownMenu'
export {
    ARM_LAYER_CREATE_HINT,
    detectShortcutPlatform,
    shortcutActionLabel,
} from './shortcutsHelp'
export { isEditableEventTarget } from './editableTarget'
export { default as ExpressionCompletionPopup } from './ExpressionCompletionPopup.vue'
export { default as ExpressionPathPicker } from './ExpressionPathPicker.vue'
export { applyCompletion, type CompletionItem, type CompletionResult, type CompletionSource } from './completion'
export { measureCursorAnchor, type CompletionAnchor } from './completionAnchor'
export {
    expressionCompletionSource,
    expressionFieldContext,
    type ExpressionFieldContext,
} from './expressionContext'
export { useExpressionCompletion, type ExpressionCompletionState } from './useExpressionCompletion'
export { expressionDiagnosticHint, useExpressionDiagnostics } from './useExpressionDiagnostics'
export { usePathCompletion } from './usePathCompletion'
export { rowsPathCompletionSource } from './rowsPathCompletionSource'
export { attachResourceTemplate, stripResourceTemplate } from './resourceTemplate'
export { pathPickerEntries, type PathPickerEntry } from './pathPickerModel'
export {
    placePopupInViewport,
    POPUP_GAP,
    POPUP_MARGIN,
    type PopupAnchorBox,
    type PopupViewportPosition,
} from './popupPosition'
export { useHistory, type HistoryAvailability } from './useHistory'
export { useSelection } from './useSelection'
export { useDataSourceSchema } from './useDataSourceSchema'
export { useShortcuts } from './useShortcuts'
export { useShortcutsHelp, type ShortcutsHelp } from './useShortcutsHelp'
export { useTransientFeedback, type TransientFeedback } from './useTransientFeedback'
export { uploadFileFromDom } from './uploadFile'
export { FONT_PICKER_KEY, injectFontPicker, type FontPickerContext } from './fontPicker'
export { selectionFieldMergeKey } from './mergeKey'
export { useViewport } from './useViewport'
export { default as PanelIcon } from './PanelIcon.vue'
