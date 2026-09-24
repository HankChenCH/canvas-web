/**
 * @hankchen/canvas-next-editor-vue Vue 3 薄绑定公共出口。
 *
 * 脚手架占位：工单 05 起在这里长出响应式桥与 composables，工单 09–12 落
 * 属性面板/图层面板/文本 overlay/表格编辑。红线：只依赖 editor 内核，
 * 不得绕过内核直接 import canvas-next 或 browser-renderer。
 */
export const PACKAGE_NAME = '@hankchen/canvas-next-editor-vue' as const
