/**
 * @hankchen/canvas-next-editor-vue Vue 3 薄绑定公共出口。
 *
 * 工单 05：双层画布表面组件（CanvasSurface）、rAF 帧调度注入物、视口切片桥。
 * 工单 06：选择切片桥（useSelection）、gizmo 覆盖层画笔（选择框 + hover 高亮，
 * 表面组件接管线：左键点选/拖动、hover 跟随、Escape 升级）。
 * 工单 08：历史可用态桥（useHistory，undo/redo 按钮接 :disabled）。
 * 工单 09：schema 驱动属性面板——字段描述注册表（fieldSchema）、面板订阅切片
 * （usePropertyPanel）、动态控件注册表（<component :is> + markRaw）与面板组件。
 * 工单 11：textarea 文本编辑 overlay——双击进入（CanvasSurface 转发）、IME 原生
 * 合成 + 提交守卫、四路退出收拢到内核 commitTextEdit 漏斗、blur 延迟提交豁免。
 * 后续工单：表格编辑（12）。
 * 红线：只依赖 editor 内核，不得绕过内核直接 import canvas-next 或
 * browser-renderer。
 */
export const PACKAGE_NAME = '@hankchen/canvas-next-editor-vue' as const

export { default as CanvasSurface, type CanvasSurfaceReady } from './CanvasSurface.vue'
export {
    CANVAS_FIELD_SECTIONS,
    FIELD_SECTIONS_BY_TYPE,
    fieldSectionsForPath,
    fieldSectionsForType,
    layerRoleAt,
    readField,
    type FieldControl,
    type FieldDef,
    type FieldReadResult,
    type FieldSection,
    type LayerRole,
} from './fieldSchema'
export { createGizmoOverlayPainter, drawSelectionGizmo, type GizmoOptions } from './gizmo'
export { controlRegistry } from './controls'
export { default as LayerPanel } from './LayerPanel.vue'
export { default as PropertyField } from './PropertyField.vue'
export { default as PropertyPanel } from './PropertyPanel.vue'
export { default as TextEditingOverlay } from './TextEditingOverlay.vue'
export { createRafScheduler } from './scheduler'
export { useHistory, type HistoryAvailability } from './useHistory'
export { isUpperHalf, useLayerPanel, type LayerPanelBinding } from './useLayerPanel'
export { usePropertyPanel, type PropertyPanelBinding } from './usePropertyPanel'
export { useSelection } from './useSelection'
export { useDpr, watchDprChanges } from './useDpr'
export { useTextEditing, type TextEditingBinding, type TextEditingHosts } from './useTextEditing'
export { useViewport } from './useViewport'
