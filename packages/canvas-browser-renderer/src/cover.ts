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

/** contain 收缩矩形（相对目标盒原点） */
export interface FitRect {
    x: number
    y: number
    width: number
    height: number
}

/**
 * contain 收缩矩形（ADR 0023，image-fit 工单 05）：源图 srcW×srcH 完整落入
 * dstW×dstH 的居中等比矩形——两维同一缩放系数取 min（长边贴目标盒），与
 * coverCrop 同门（只算几何、缩放插值交给 drawImage；偏移向零截断）。调用方
 * 保证 dstW/dstH 为正；极端比例截断得 0 钳到 ≥1（coverCrop 房规，宁可纵横比
 * 略让也不输出空矩形）——注意与核心 containRect（PHP getContainRect 同门）的
 * 差别：核心不钳制、截断得 0 由渲染臂 drawImage ≤0 防护只画盒。本函数无图层
 * 上下文（恒居中），对齐 + 边距放置归核心渲染契约的图层感知 containRect；
 * 运行时 contain 计划在核心渲染臂，本函数供本包测试断言用
 */
export function containRect(srcW: number, srcH: number, dstW: number, dstH: number): FitRect {
    const scale = Math.min(dstW / srcW, dstH / srcH)
    let width = Math.trunc(srcW * scale)
    let height = Math.trunc(srcH * scale)
    if (width < 1) width = 1
    if (height < 1) height = 1
    return {
        x: Math.trunc((dstW - width) / 2),
        y: Math.trunc((dstH - height) / 2),
        width,
        height,
    }
}
