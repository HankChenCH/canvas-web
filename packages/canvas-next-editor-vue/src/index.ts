/**
 * @hankchen/canvas-next-editor-vue Vue 3 薄绑定公共出口。
 *
 * 工单 05：双层画布表面组件（CanvasSurface）、rAF 帧调度注入物、视口切片桥。
 * 后续工单：属性面板/图层面板（09–10）、textarea 文本编辑 overlay（11）、
 * 表格编辑（12）。红线：只依赖 editor 内核，不得绕过内核直接 import
 * canvas-next 或 browser-renderer。
 */
export const PACKAGE_NAME = '@hankchen/canvas-next-editor-vue' as const

export { default as CanvasSurface, type CanvasSurfaceReady } from './CanvasSurface.vue'
export { createRafScheduler } from './scheduler'
export { useViewport } from './useViewport'
