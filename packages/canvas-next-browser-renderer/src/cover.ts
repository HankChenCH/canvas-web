/**
 * cover 缩放裁切几何：等比缩放至铺满目标盒，溢出居中裁掉（PHP intervention cover /
 * go-canvas image-renderer cover 同款）。明确放弃逐像素复刻 GD/浏览器 rasterizer
 * （spec Out of Scope：布局级一致、像素不求等）——本模块只算"源图上裁哪个窗"，
 * 缩放插值交给 drawImage 的原生光栅化。纯几何，无 DOM 类型（红线 2）。
 */

export interface CropWindow {
    sx: number
    sy: number
    sw: number
    sh: number
}

/**
 * 计算源图 srcW×srcH 铺满 dstW×dstH 的居中裁切窗。调用方保证 dstW/dstH 为正；
 * 裁切窗与居中偏移整型化向零截断；极端宽高比下截断可得 0 宽窗：钳到 ≥1，
 * 宁可纵横比略让也不输出空图
 */
export function coverCrop(srcW: number, srcH: number, dstW: number, dstH: number): CropWindow {
    const scale = Math.max(dstW / srcW, dstH / srcH)
    let cropW = Math.trunc(dstW / scale)
    let cropH = Math.trunc(dstH / scale)
    if (cropW < 1) cropW = 1
    if (cropH < 1) cropH = 1
    const sx = Math.trunc((srcW - cropW) / 2)
    const sy = Math.trunc((srcH - cropH) / 2)
    return { sx, sy, sw: cropW, sh: cropH }
}
