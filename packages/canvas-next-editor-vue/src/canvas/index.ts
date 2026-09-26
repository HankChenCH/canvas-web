/**
 * 画布表面域出口：双层 canvas 表面（CanvasSurface）与其内挂 overlay
 * （文本编辑、右键菜单）、gizmo 覆盖层画笔、rAF 帧调度、DPR 桥、
 * 文本编辑切片桥。
 */
export { default as CanvasSurface, type CanvasSurfaceReady } from './CanvasSurface.vue'
export { default as ContextMenu } from './ContextMenu.vue'
export { default as TextEditingOverlay } from './TextEditingOverlay.vue'
export { createGizmoOverlayPainter, drawSelectionGizmo, type GizmoOptions } from './gizmo'
export { createRafScheduler } from './scheduler'
export { useDpr, watchDprChanges } from './useDpr'
export { useTextEditing, type TextEditingBinding, type TextEditingHosts } from './useTextEditing'
