/**
 * 源图内在尺寸读数（image-fit 工单 05 搭车项，ADR 0023）：像素 + 宽高比一行文本，
 * 作者判断 cover/contain 的直接依据。纯函数零 DOM——缩略图 img 装载完成后由
 * 控件以 naturalWidth/naturalHeight 调用，Node 无 DOM 环境可测。
 */

/** 宽高比显示：整数比（约化后两侧 ≤32，如 16:9）优先，否则两位小数比（如 1.77:1） */
export function aspectRatioLabel(width: number, height: number): string {
    let a = width
    let b = height
    while (b !== 0) {
        ;[a, b] = [b, a % b]
    }
    const rw = width / a
    const rh = height / a
    if (Math.max(rw, rh) <= 32) return `${rw}:${rh}`
    return `${Math.round((width / height) * 100) / 100}:1`
}

/** 整行读数（「1920×1080 · 16:9」形态）；非法尺寸（≤0/非有限值）返回 null 不渲染 */
export function intrinsicSizeLabel(width: number, height: number): string | null {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
    return `${width}×${height} · ${aspectRatioLabel(width, height)}`
}
