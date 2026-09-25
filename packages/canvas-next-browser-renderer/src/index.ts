/**
 * @hankchen/canvas-next-browser-renderer 公共出口。
 *
 * Canvas2D 五原语后端（begin → 按 priority 序分派 → end）+ 物化状态机（工单 04）。
 * 本包整体无 DOM lib 编译，Canvas2D/FontFace/Image 类型只在用到它的文件里局部
 * `/// <reference lib="dom" />`。
 */
export const PACKAGE_NAME = '@hankchen/canvas-next-browser-renderer' as const

export {
    Canvas2DBackend,
    applyViewportTransform,
    type DrawableImage,
    type PreviewViewportTransform,
    type ViewportAwareBackend,
} from './canvas2d-backend'
export { coverCrop, type CropWindow } from './cover'
export {
    builtinFontShorthand,
    canvasFontCssFamily,
    isBuiltinFontRef,
    loadCanvasFont,
} from './fonts'
export { QR_FIXED_OPTIONS, qrDataUrl, qrModuleMatrix, type QrModuleMatrix } from './qr'
export {
    Materializer,
    createBrowserLoaders,
    fontResourceKey,
    imageResourceKey,
    qrResourceKey,
    withImageProxy,
    type MaterializerOptions,
    type ResourceEntry,
    type ResourceLoaders,
    type ResourceState,
    type ResourceStatus,
} from './materializer'
export { drawResourceMarkers } from './markers'
export { sha256Hex } from './sha256'
