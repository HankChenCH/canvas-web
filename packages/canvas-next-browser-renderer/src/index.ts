/**
 * @hankchen/canvas-next-browser-renderer 公共出口。
 *
 * Canvas2D 五原语后端（begin → 按 priority 序分派 → end）。本包整体无 DOM lib
 * 编译，Canvas2D 类型只在用到它的文件里局部 `/// <reference lib="dom" />`。
 */
export const PACKAGE_NAME = '@hankchen/canvas-next-browser-renderer' as const

export { Canvas2DBackend } from './canvas2d-backend'
