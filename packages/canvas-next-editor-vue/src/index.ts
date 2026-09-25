/**
 * @hankchen/canvas-next-editor-vue Vue 3 薄绑定公共出口。
 *
 * 工单 05：双层画布表面组件（CanvasSurface）、rAF 帧调度注入物、视口切片桥。
 * 工单 06：选择切片桥（useSelection）、gizmo 覆盖层画笔（选择框 + hover 高亮，
 * 表面组件接管线：左键点选/拖动、hover 跟随、Escape 升级）。
 * 工单 08：历史可用态桥（useHistory，undo/redo 按钮接 :disabled）。
 * 后续工单：属性面板/图层面板（09–10）、textarea 文本编辑 overlay（11）、
 * 表格编辑（12）。红线：只依赖 editor 内核，不得绕过内核直接 import
 * canvas-next 或 browser-renderer。
 */
export const PACKAGE_NAME = '@hankchen/canvas-next-editor-vue' as const

export { default as CanvasSurface, type CanvasSurfaceReady } from './CanvasSurface.vue'
export { createGizmoOverlayPainter, drawSelectionGizmo, type GizmoOptions } from './gizmo'
export { createRafScheduler } from './scheduler'
export { useHistory, type HistoryAvailability } from './useHistory'
export { useSelection } from './useSelection'
export { useViewport } from './useViewport'
