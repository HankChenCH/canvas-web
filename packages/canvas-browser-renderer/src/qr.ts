/// <reference lib="dom" />

/**
 * QR 物化的生成端：固定选项与 php-canvas-next ResourceResolver::materializeQrCode
 * 逐项对齐（endroid/qr-code：Encoding UTF-8、ErrorCorrectionLevel::High、margin 0、
 * 黑白双色、RoundBlockSizeMode::None）。与 PHP 的差异点：PHP 按图层宽度就地生成
 * 位图（缓存键含宽度），浏览器端按固定 scale 生成一次、由渲染原语 drawImage 缩放
 * 到盒宽——同内容跨图层（不同宽）只生成一次。
 *
 * qrcode 包运行时是 CJS 同构包（Node 走 pngjs、浏览器走 canvas），类型为具名导出。
 * 本文件只产 dataURL 与模块矩阵，不触 DOM 运行时 API（Image 装载归 materializer）。
 */
import { create as createQrCode, toDataURL as qrToDataURL } from 'qrcode'

/** 固定选项（契约）：纠错 High、无静区、黑白；scale 只影响产物清晰度（终图随盒缩放） */
export const QR_FIXED_OPTIONS = {
    errorCorrectionLevel: 'H',
    margin: 0,
    scale: 4,
    color: { dark: '#000000ff', light: '#ffffffff' },
} as const

/** QR 符号的模块矩阵视图（测试取样缝：点位断言不经过 PNG 解码） */
export interface QrModuleMatrix {
    readonly size: number
    isDark(row: number, col: number): boolean
}

/** 同步生成模块矩阵（固定选项）；UTF-8 串按字节模式编码（endroid Encoding('UTF-8') 同语义） */
export function qrModuleMatrix(value: string): QrModuleMatrix {
    const qr = createQrCode(value, { errorCorrectionLevel: QR_FIXED_OPTIONS.errorCorrectionLevel })
    const { size, data } = qr.modules
    return {
        size,
        isDark: (row, col) => data[row * size + col] === 1,
    }
}

/** 生成 PNG dataURL（固定选项）；交给 Image 装载后由渲染原语缩放到盒宽 */
export function qrDataUrl(value: string): Promise<string> {
    // QR_FIXED_OPTIONS 的形状即 toDataURL 的渲染选项（errorCorrectionLevel/margin/scale/color）
    return qrToDataURL(value, QR_FIXED_OPTIONS)
}
