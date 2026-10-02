/**
 * 画布表面域出口：双层 canvas 表面（CanvasSurface）与其内挂 overlay
 * （文本编辑、右键菜单、查找条）、浮于画布的呈现件（对齐浮条、标尺、参考线
 * 层）、gizmo/查找命中覆盖层画笔、rAF 帧调度、DPR 桥、文本编辑/查找会话切片桥。
 */
export { default as AlignFloatBar } from './AlignFloatBar.vue'
export { default as CanvasSurface, type CanvasSurfaceReady } from './CanvasSurface.vue'
export { default as ContextMenu } from './ContextMenu.vue'
export { default as FindBar } from './FindBar.vue'
export { default as GuidesOverlay } from './GuidesOverlay.vue'
export { default as Ruler, type RulerGuideGesture } from './Ruler.vue'
export { default as TextEditingOverlay } from './TextEditingOverlay.vue'
export { drawCreateRubberBand } from './createBand'
export { drawFindMatches, type FindHighlightOptions } from './findHighlight'
export { createGizmoOverlayPainter, drawSelectionGizmo, type GizmoOptions } from './gizmo'
export { createRafScheduler } from './scheduler'
export { useDpr, watchDprChanges } from './useDpr'
export { useFindSession, type FindSessionSlice } from './useFindSession'
export { useTextEditing, type TextEditingBinding, type TextEditingHosts } from './useTextEditing'
