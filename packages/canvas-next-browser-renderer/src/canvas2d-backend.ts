/// <reference lib="dom" />

/**
 * Canvas2D 五原语后端（工单 02：begin/end/drawRect 落地；drawImage/drawText 在
 * 工单 03、04 接入）。按包红线整体不开 DOM lib，仅本文件局部引入
 * CanvasRenderingContext2D 类型（AGENTS.md 红线 2）。
 */
import type { Border, BorderSide, RenderBackend, TextDrawOptions } from '@hankchen/canvas-next'

export class Canvas2DBackend implements RenderBackend {
    private readonly ctx: CanvasRenderingContext2D

    constructor(ctx: CanvasRenderingContext2D) {
        this.ctx = ctx
    }

    begin(width: number, height: number): void {
        // 新建渲染面语义：复用同一面时清残留变换与上帧像素（DPR/视口变换在工单 05 接管）
        this.ctx.setTransform(1, 0, 0, 1, 0, 0)
        this.ctx.clearRect(0, 0, width, height)
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

    drawImage(_src: string, _x: number, _y: number, _width: number, _height: number): void {
        throw new Error('drawImage 尚未实现：图片 cover 绘制在工单 03 落地')
    }

    drawText(_line: string, _x: number, _y: number, _options: TextDrawOptions): void {
        throw new Error('drawText 尚未实现：文本基线消化在工单 03 落地')
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
