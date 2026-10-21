/// <reference lib="dom" />

/**
 * Canvas2D 五原语后端（ADR 0026 起兼形状能力后端：drawEllipse + drawImageMasked
 * 加法可选原语对齐备，核心渲染臂探测后承接圆形档）。按包红线整体不开 DOM lib，
 * 仅本文件局部引入 CanvasRenderingContext2D 类型（AGENTS.md 红线 2）。
 *
 * 内容绘制语义（ADR 0024）：
 * - drawImage：双矩形 blit 直映射——srcRect → dstRect 原生九参 ctx.drawImage，
 *   原语零 fit 语义、零内在尺寸读取，四档 fit（cover/contain/fill/tile）的几何
 *   全在核心渲染臂算定（本包零 fit 几何，cover.ts 已退役上移核心）；
 *   图片源经 setImage 预载回写（远程物化在工单 04），未注册的 src 只画盒不绘制；
 * - drawText：布局层只给纯对齐锚点，基线差由本端以 TextMetrics 消化（ADR-0003 同款——
 *   PHP 的 GD 基线魔数 round(fontSize*0.1) 不移植）；字体经 fonts.ts 的判定与注册缝。
 *
 * 形状原语（ADR 0026，可选能力口——两成员齐备核心臂才走圆形三步，未实现即矩形降级）：
 * - drawEllipse：内切椭圆填充 + 描边一体（ctx.ellipse 路径），原语零形状语义、
 *   零 fit 语义，内切圆矩形与描边参数解析全在核心分派层；
 * - drawImageMasked：drawImage 的掩码形态——双矩形 blit 后以 maskRect 的内切椭圆
 *   裁剪合成（save/clip/restore），掩码外透明。
 *
 * 可选能力口（ADR 0023 引入、ADR 0024 扩全 fit 前置）：imageIntrinsicSize 供源图
 * 内在尺寸，核心渲染臂据此算 cover 裁窗 / fill 整图 / contain 收缩 / tile 单元——
 * 查询口非绘制原语。
 */
import type { BlitRect, Border, BorderSide, RenderBackend, TextDrawOptions } from '@hankchen/canvas'

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

    /**
     * 派生同资源的导出后端（工单 13）：把本后端已物化的图片/字体注册复制到新
     * 渲染面——导出画布不经预览视口（恒等变换全幅渲染），但资源沿用编辑面的
     * 物化结果，不重新装载。
     */
    forkWith(ctx: CanvasRenderingContext2D): Canvas2DBackend {
        const fork = new Canvas2DBackend(ctx)
        for (const [src, image] of this.images) fork.images.set(src, image)
        for (const [font, family] of this.fontFamilies) fork.fontFamilies.set(font, family)
        return fork
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

    /**
     * 双矩形 blit 直映射（ADR 0024）：srcRect → dstRect 原生九参 ctx.drawImage——
     * 原语零 fit 语义、零几何计算，四档 fit 的源窗/目标矩形全由核心渲染臂算定。
     * srcRect 零宽高哨兵 = 整图（按注册图片实际尺寸取整，fill 退化与 QR 整图 blit
     * 借它表达，PHP drawImage 同门）；dstRect 宽或高 ≤0 跳过；未注册/尺寸不可用的
     * src 静默不画（JS 坏图 drawImage 静默不画的现状 parity）
     */
    drawImage(src: string, srcRect: BlitRect, dstRect: BlitRect): void {
        if (dstRect.width <= 0 || dstRect.height <= 0) return

        const image = this.images.get(src)
        if (!image) return // 未物化/未加载：只画盒的占位语义

        const srcW = naturalWidth(image)
        const srcH = naturalHeight(image)
        if (srcW <= 0 || srcH <= 0) return

        const whole = srcRect.width <= 0 || srcRect.height <= 0
        this.ctx.drawImage(
            image as CanvasImageSource,
            whole ? 0 : srcRect.x,
            whole ? 0 : srcRect.y,
            whole ? srcW : srcRect.width,
            whole ? srcH : srcRect.height,
            dstRect.x,
            dstRect.y,
            dstRect.width,
            dstRect.height,
        )
    }

    /**
     * 源图内在尺寸度量（渲染契约可选能力口）：ADR 0024 起为全 fit 前置——cover 裁窗 /
     * fill 整图 / contain 收缩 / tile 单元的分派几何全部依赖内在比例。查询键与
     * drawImage 同一 src 引用、同一次物化回写的 images 表（预览与导出 forkWith 共享，
     * 零参数穿透）。尺寸取 naturalWidth/Height 优先（与 drawImage 同门）；未注册/
     * 非法尺寸返回 null，渲染臂统一退化 fill 形态（整图拉伸进目标矩形；PHP
     * getimagesize 失败同门结局）。查询口非绘制原语
     */
    imageIntrinsicSize(src: string): { width: number; height: number } | null {
        const image = this.images.get(src)
        if (!image) return null

        const width = naturalWidth(image)
        const height = naturalHeight(image)
        if (width <= 0 || height <= 0) return null
        return { width, height }
    }

    /**
     * 椭圆绘制原语（ADR 0026 形状能力口）：(x, y) 起 width×height 外接矩形的内切
     * 椭圆，fillColor 填充与 stroke 描边一体（ctx.ellipse 路径，fill 先于 stroke——
     * 圆形框的描边环压在背景填充上）。fillColor null/空串跳过（drawRect 同门）；
     * 非正宽高零副作用（负半径会抛 IndexSizeError，防线归后端）。原语零形状语义、
     * 零 fit 语义，几何与描边参数解析全在核心分派层
     */
    drawEllipse(
        x: number,
        y: number,
        width: number,
        height: number,
        fillColor: string | null,
        stroke: BorderSide | null,
    ): void {
        if (width <= 0 || height <= 0) return

        const ctx = this.ctx
        ctx.beginPath()
        ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
        if (fillColor !== null && fillColor !== '') {
            ctx.fillStyle = fillColor
            ctx.fill()
        }
        if (stroke) {
            ctx.strokeStyle = stroke.color
            ctx.lineWidth = stroke.width
            ctx.stroke()
        }
    }

    /**
     * 掩码 blit 原语（ADR 0026 形状能力口，drawImage 的掩码形态）：双矩形 blit
     * （守卫与整图哨兵语义和 drawImage 完全一致）后，以 maskRect 的内切椭圆裁剪
     * 合成——save/beginPath/ellipse/clip → blit → restore，掩码外透明。maskRect
     * 非正零副作用（掩码空 = 不可见）。核心臂对每个 fit 块逐块调用（tile 即多次
     * save/restore 往返），裁剪态不外溢
     */
    drawImageMasked(src: string, srcRect: BlitRect, dstRect: BlitRect, maskRect: BlitRect): void {
        if (dstRect.width <= 0 || dstRect.height <= 0) return
        if (maskRect.width <= 0 || maskRect.height <= 0) return

        const image = this.images.get(src)
        if (!image) return // 未物化/未加载：只画盒的占位语义

        const srcW = naturalWidth(image)
        const srcH = naturalHeight(image)
        if (srcW <= 0 || srcH <= 0) return

        const whole = srcRect.width <= 0 || srcRect.height <= 0
        const ctx = this.ctx
        ctx.save()
        ctx.beginPath()
        ctx.ellipse(
            maskRect.x + maskRect.width / 2,
            maskRect.y + maskRect.height / 2,
            maskRect.width / 2,
            maskRect.height / 2,
            0,
            0,
            Math.PI * 2,
        )
        ctx.clip()
        ctx.drawImage(
            image as CanvasImageSource,
            whole ? 0 : srcRect.x,
            whole ? 0 : srcRect.y,
            whole ? srcW : srcRect.width,
            whole ? srcH : srcRect.height,
            dstRect.x,
            dstRect.y,
            dstRect.width,
            dstRect.height,
        )
        ctx.restore()
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
