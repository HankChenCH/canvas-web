/**
 * 跨域切片桥出口：选择/视口/历史/快捷键切片桥、可编辑目标谓词与面板图标
 * 统一封装。这是唯一允许被各域引用的层——域间横向 import 被依赖红线
 * （editor-vue-*-isolation）禁止，跨域消费一律收口到这里。
 */
export { isEditableEventTarget } from './editableTarget'
export { useHistory, type HistoryAvailability } from './useHistory'
export { useSelection } from './useSelection'
export { useShortcuts } from './useShortcuts'
export { useViewport } from './useViewport'
export { default as PanelIcon } from './PanelIcon.vue'
