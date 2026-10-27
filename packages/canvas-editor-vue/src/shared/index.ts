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
 * 编辑两域共用；rows-path-completion 的裸路径补全控件 usePathCompletion 与
 * rowsPathCompletionSource 手输源随 rowsPath 作者面纯点选化零消费方，已于
 * rows-path-picker 工单 05 整体退役）与点选器候选源组装
 * rowsPathPickerSource（rows-path-picker 工单 02：剪枝枚举件适配，供选择器
 * mode='rowsPath' 消费——工单 04 起建表表单与右键轻表单两入口同源）与 schema
 * 声明切片桥 useDataSourceSchema（工单 04 自 status-bar
 * 收口——状态栏读数段、建表表单与右键菜单门态多域共用）与字体清单注入缝 fontPicker（
 * edit-overlay-toolbar 工单 04 自属性面板域迁入——面板字体控件与编辑浮层工具条
 * 字体段两域共用）与字段权威写 mergeKey 约定 mergeKey（面板与工具条双入口同键
 * 合并的格式单点）与资源表达式级联路径选择器 ExpressionPathPicker + 候选模型
 * pathPickerModel（rows-path-picker 工单 02 起带终点形态分叉 mode：resource
 * 叶子终点缺省 / rowsPath 数组终点，可激活/可下钻判定矩阵归模型）+ `{{}}` 拆装
 * 纯函数 resourceTemplate + 弹层视口定位纯函数 popupPosition（resource-expression-
 * single-ref 工单 05/06：资源内容字段的作者面 = 纯菜单点选，垂直翻转/钳制定位
 * 两浮层与选择器菜单共用）与悬停提示 Tooltip（edit-toolbar-declutter 工票 01：
 * 包裹任意控件的延迟气泡——悬停/键盘聚焦出泡、离开/失焦/按下即隐，pointerdown
 * 隐藏挂 wrapper capture 段，aria-describedby 接线自带、主题令牌归 theme.css 单源（editor-theme 工票 03）；零消费方
 * 交付，消费在工票 03/04）与编辑器主题状态 useCnTheme（editor-theme-light-dark
 * 工票 04：日间/夜间单例 ref + set/toggle，写出即同步 data-cn-theme 信号到目标
 * 元素，可选 storageKey 持久化——宿主与包内组件共享主题状态，spec §5）。
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
export { default as Tooltip } from './Tooltip.vue'
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
export { rowsPathPickerSource, rowsPathValueDrifts } from './rowsPathPickerSource'
export { attachResourceTemplate, stripResourceTemplate } from './resourceTemplate'
export { pathPickerEntries, type PathPickerEntry, type PathPickerMode } from './pathPickerModel'
export {
    placePopupInViewport,
    POPUP_GAP,
    POPUP_MARGIN,
    type PopupAnchorBox,
    type PopupViewportPosition,
} from './popupPosition'
export { useHistory, type HistoryAvailability } from './useHistory'
export { useCnTheme, type CnTheme } from './useCnTheme'
export { useSelection } from './useSelection'
export { DATA_SOURCE_GATE_HINT, useDataSourceSchema, useDataSourceSchemaRejection } from './useDataSourceSchema'
export { useShortcuts } from './useShortcuts'
export { useShortcutsHelp, type ShortcutsHelp } from './useShortcutsHelp'
export { useTransientFeedback, type TransientFeedback } from './useTransientFeedback'
export { uploadFileFromDom } from './uploadFile'
export { FONT_PICKER_KEY, injectFontPicker, type FontPickerContext } from './fontPicker'
export { selectionFieldMergeKey } from './mergeKey'
export { useViewport } from './useViewport'
export { default as PanelIcon } from './PanelIcon.vue'
