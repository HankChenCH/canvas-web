/**
 * @hankchen/canvas-next-editor-vue Vue 3 薄绑定公共出口。
 *
 * src 按领域分域组织：canvas（画布表面及其内挂 overlay/gizmo/调度）、
 * property-panel（schema 驱动属性面板，内含 fields/ 字段控件）、
 * layer-panel（图层面板）、status-bar（状态栏）、shared（跨域切片桥）。
 * 域之间禁止横向 import，跨域消费一律收口 shared——由 dependency-cruiser
 * 域隔离规则（editor-vue-*-isolation）锁定。
 * 宿主可从包根取全量符号，也可按域子路径细粒度引用
 * （@hankchen/canvas-next-editor-vue/canvas 等，见 package.json exports）。
 * 红线：只依赖 editor 内核，不得绕过内核直接 import canvas-next 或
 * browser-renderer。
 */
export const PACKAGE_NAME = '@hankchen/canvas-next-editor-vue' as const

export * from './canvas'
export * from './property-panel'
export * from './layer-panel'
export * from './status-bar'
export * from './shared'
