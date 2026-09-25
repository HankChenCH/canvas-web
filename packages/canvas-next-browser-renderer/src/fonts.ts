/// <reference lib="dom" />

/**
 * 字体契约的渲染端消化：内置默认字体判定/简写 + URL 字体的 FontFace 物化。
 * 语义镜像 PHP ImageRenderer::drawText（`$fontFile !== '' && !is_numeric($fontFile)`
 * 才走字体文件，否则 v4 内置默认字体）与 go-canvas typography.IsBuiltinFont——
 * 空串/纯数字字体 id 是旧库 GD 内置字体的血统，浏览器端对应内置默认字体 =
 * 系统无衬线族。本文件是渲染包内唯一触 DOM 运行时 API 的地方（FontFace /
 * document.fonts；Canvas2D 类型在 canvas2d-backend.ts 局部引入），包 tsconfig
 * 仍无 DOM lib（红线 2）。
 */

/** 内置默认字体判定：空串/纯数字字体引用（PHP is_numeric 同门：旧库 GD 内置字体 id） */
export function isBuiltinFontRef(font: string): boolean {
    if (font === '') return true
    // 纯数字：可选符号/小数/指数（is_numeric 的实用子集——旧库只用 '1'-'5' 字体 id）
    return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(font.trim())
}

/** 内置默认字体的 ctx.font 简写：系统无衬线族按字号取用 */
export function builtinFontShorthand(fontSize: number): string {
    return `${fontSize}px sans-serif`
}

/**
 * font-family 的 CSS 值（工单 11 textarea overlay 用）：内置默认字体 = 系统无衬线
 * 族；URL = 注册族名（与 loadCanvasFont 同一 fnv-1a 派生，注册后即命中）尾部附
 * sans-serif 兜底——未注册/未加载时回落系统无衬线，与 canvas 侧未注册 URL 落内置
 * 默认简写的行为同门。纯字符串函数，无 DOM。
 */
export function canvasFontCssFamily(font: string): string {
    if (isBuiltinFontRef(font)) return 'sans-serif'
    return `${fontFamilyFor(font)}, sans-serif`
}

/** ctx.font 可用的注册族名：由字体 URL 确定性派生（fnv-1a 32 位），CSS 安全 */
function fontFamilyFor(font: string): string {
    let hash = 0x811c9dc5
    for (let i = 0; i < font.length; i++) {
        hash ^= font.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193)
    }
    return `canvas-next-font-${(hash >>> 0).toString(36)}`
}

// URL → 注册完成态的缓存：同一字体只注册一次（PHP/Go 侧解析缓存的对位物）
const fontRegistry = new Map<string, Promise<string>>()

/**
 * URL 字体物化：经 FontFace 注册进 document.fonts，resolve 为 ctx.font 可用的族名。
 * 加载失败（离线/404/解析失败）时 reject——调用方决定降级（预览哲学：占位 +
 * 内置默认字体兜底，工单 04 补失败态标识）
 */
export function loadCanvasFont(font: string): Promise<string> {
    const cached = fontRegistry.get(font)
    if (cached) return cached

    const family = fontFamilyFor(font)
    const loading = (async () => {
        // CSS 字符串内的引号转义（graph 引用来自宿主数据，不假设 URL 干净）
        const source = `url("${font.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`
        const face = new FontFace(family, source)
        await face.load()
        // lib.dom 的 FontFaceSet 声明缺 add（运行时存在），按 Set 结构收窄
        ;(document.fonts as unknown as Set<FontFace>).add(face)
        return family
    })()
    // 失败不缓存：下一次渲染可重试（临时网络故障自愈）
    loading.catch(() => fontRegistry.delete(font))
    fontRegistry.set(font, loading)
    return loading
}
