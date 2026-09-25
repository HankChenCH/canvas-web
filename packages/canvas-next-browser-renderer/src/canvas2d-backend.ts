/// <reference lib="dom" />

/**
 * Canvas2D 五原语后端。按包红线整体不开 DOM lib，仅本文件局部引入
 * CanvasRenderingContext2D 类型（AGENTS.md 红线 2）。
 *
 * 内容绘制语义（工单 03）：
 * - drawImage：cover 等比缩放居中裁切（cover.ts），宽或高 ≤0 跳过（PHP 同门）；
 *   图片源经 setImage 预载回写（远程物化在工单 04），未注册的 src 只画盒不绘制；
 * - drawText：布局层只给纯对齐锚点，基线差由本端以 TextMetrics 消化（ADR-0003 同款——
 *   PHP 的 GD 基线魔数 round(fontSize*0.1) 不移植）；字体经 fonts.ts 的判定与注册缝。
 */
import type { Border, BorderSide, RenderBackend, TextDrawOptions } from '@hankchen/canvas-next'

import { coverCrop } from './cover'
import { builtinFontShorthand, isBuiltinFontRef } from './fonts'

/** 可绘制图片源：浏览器图片元素/位图，或结构等价的测试替身（须给得出宽高） */
export interface DrawableImage {
    readonly width: number
    readonly height: number
}

/**
 * 预览视口变换（工单 05）：begin 清屏后施加到 ctx 的 dpr×zoom×相机变换。
 * x/y 由编辑器会话给出（已对齐物理像素），本端只做与 dpr 的乘法合成。
 */
export interface PreviewViewportTransform {
    dpr: number
    zoom: number
    x: number
    y: number
}

/** 视口感知后端能力：编辑器会话在内容重绘前经此同步预览视口（可选能力口） */
export interface ViewportAwareBackend {
    setViewportTransform(transform: PreviewViewportTransform | null): void
}

/**
 * 把预览视口变换施加到 2D 上下文（内容层 begin 与宿主覆盖层共用同一几何，
 * 保证两层在缩放/平移下不错位）。调用方需先自行复位变换并清屏。
 */
export function applyViewportTransform(
    ctx: CanvasRenderingContext2D,
    transform: PreviewViewportTransform,
): void {
    const scale = transform.dpr * transform.zoom
    // 场景整数坐标经 transform 承担缩放与相机（绘制代码零改动）；平移已由
    // 会话侧对齐物理像素，此处直接乘 dpr×zoom 落到设备像素网格。
    ctx.setTransform(scale, 0, 0, scale, -transform.x * scale, -transform.y * scale)
}

export class Canvas2DBackend implements RenderBackend, ViewportAwareBackend {
    private readonly ctx: CanvasRenderingContext2D

    /** 物化回写面：src → 已加载的图片源（工单 04 的物化器落点，渲染前由宿主/物化器填充） */
    private readonly images = new Map<string, DrawableImage>()

    /** 字体引用 → 已注册族名（loadCanvasFont 的回写面；未注册 URL 回落内置默认） */
    private readonly fontFamilies = new Map<string, string>()

    /** 预览视口（工单 05）：null = 恒等变换（如导出走 begin(w,h) 全幅语义） */
    private viewportTransform: PreviewViewportTransform | null = null

    constructor(ctx: CanvasRenderingContext2D) {
        this.ctx = ctx
    }

    /** 预载回写：注册 src 对应的图片源后 drawImage 才会绘制 */
    setImage(src: string, image: DrawableImage): void {
        this.images.set(src, image)
    }

    /** 字体物化回写：注册字体引用对应的 ctx.font 族名 */
    setFontFamily(font: string, family: string): void {
        this.fontFamilies.set(font, family)
    }

    setViewportTransform(transform: PreviewViewportTransform | null): void {
        this.viewportTransform = transform
    }

    begin(_width: number, _height: number): void {
        // 新建渲染面语义：复用同一面时清残留变换与上帧像素。物理缓冲 =
        // css × dpr（工单 05 起与画布整数像素语义分离），按缓冲实尺寸清。
        this.ctx.setTransform(1, 0, 0, 1, 0, 0)
        this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height)

        if (this.viewportTransform) applyViewportTransform(this.ctx, this.viewportTransform)
    }

    end(): void {
        // 预览就地绘制，无产物返回；导出（工单 13）经画布 toBlob 走
    }

    /**
     * 镜像 PHP ImageRenderer::drawRect：背景填充盒（null/空串跳过）+
     * 四边边框沿盒边描线（线宽居中于路径，与 intervention drawLine 同语义）。
     */
    drawRect(
        x: number,
        y: number,
        width: number,
        height: number,
        bgColor: string | null,
        border: Border,
    ): void {
        const ctx = this.ctx
        if (bgColor !== null && bgColor !== '') {
            ctx.fillStyle = bgColor
            ctx.fillRect(x, y, width, height)
        }

        if (border.top) this.strokeLine(x, y, x + width, y, border.top)
        if (border.bottom) this.strokeLine(x, y + height, x + width, y + height, border.bottom)
        if (border.left) this.strokeLine(x, y, x, y + height, border.left)
        if (border.right) this.strokeLine(x + width, y, x + width, y + height, border.right)
    }

    /** cover 裁切至 width×height 后放置于 (x, y)；宽或高 ≤0 跳过（PHP drawImage 同门） */
    drawImage(src: string, x: number, y: number, width: number, height: number): void {
        if (width <= 0 || height <= 0) return

        const image = this.images.get(src)
        if (!image) return // 未物化/未加载：只画盒的占位语义（工单 04 补失败态）

        const srcW = naturalWidth(image)
        const srcH = naturalHeight(image)
        if (srcW <= 0 || srcH <= 0) return

        const crop = coverCrop(srcW, srcH, width, height)
        this.ctx.drawImage(
            image as CanvasImageSource,
            crop.sx,
            crop.sy,
            crop.sw,
            crop.sh,
            x,
            y,
            width,
            height,
        )
    }

    /**
     * 单行文本，(x, y) 为对齐语义锚点：水平偏移 = 真实文本宽度（measureText，与
     * 布局启发式度量无关）× 对齐语义；垂直基线 = 锚点 + 字体 metrics 偏移
     * （top: +ascent / center: +(ascent-descent)/2 / bottom: -descent，未知取值归 top）。
     * 空行零副作用（PHP 同款空串守卫，模板仍对空行分派）。角度为度，正值视觉逆时针
     * （GD angle 惯例；canvas y 轴向下，rotate 取负）。
     */
    drawText(line: string, x: number, y: number, options: TextDrawOptions): void {
        if (line === '') return

        const ctx = this.ctx
        ctx.font = this.fontShorthand(options.font, options.fontSize)
        ctx.fillStyle = options.fontColor

        const metrics = ctx.measureText(line)
        const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent
        const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent

        // 水平：笔起点相对锚点的偏移（left: 0 / center: -宽一半 / right: -宽，未知归 left）
        let penX = 0
        if (options.horizontalAlign === 'center') penX = -metrics.width / 2
        else if (options.horizontalAlign === 'right') penX = -metrics.width

        // 垂直：基线相对锚点的偏移，由字体 metrics 消化基线差
        let baselineY = ascent
        if (options.verticalAlign === 'center') baselineY = (ascent - descent) / 2
        else if (options.verticalAlign === 'bottom') baselineY = -descent

        if (options.angle === 0) {
            ctx.fillText(line, x + penX, y + baselineY)
            return
        }

        ctx.save()
        ctx.translate(x, y)
        ctx.rotate((-options.angle * Math.PI) / 180)
        ctx.fillText(line, penX, baselineY)
        ctx.restore()
    }

    /** ctx.font 简写：内置引用（空串/纯数字）或未注册 URL → 系统无衬线默认 */
    private fontShorthand(font: string, fontSize: number): string {
        if (isBuiltinFontRef(font)) return builtinFontShorthand(fontSize)
        const family = this.fontFamilies.get(font)
        return family ? `${fontSize}px "${family}"` : builtinFontShorthand(fontSize)
    }

    private strokeLine(x1: number, y1: number, x2: number, y2: number, side: BorderSide): void {
        const ctx = this.ctx
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.strokeStyle = side.color
        ctx.lineWidth = side.width
        ctx.stroke()
    }
}

/** 图片源尺寸：优先 HTMLImageElement 的固有尺寸（SVG 等内容尺寸可能不同于布局尺寸） */
function naturalWidth(image: DrawableImage): number {
    const natural = (image as Partial<HTMLImageElement>).naturalWidth
    return typeof natural === 'number' && natural > 0 ? natural : image.width
}

function naturalHeight(image: DrawableImage): number {
    const natural = (image as Partial<HTMLImageElement>).naturalHeight
    return typeof natural === 'number' && natural > 0 ? natural : image.height
}
