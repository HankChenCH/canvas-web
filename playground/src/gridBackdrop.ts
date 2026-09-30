/**
 * 桌面网格底纹（原型）：编辑器画布背景加网格线，区分纸面（doc 矩形）与画布外
 * 的暗色桌面。
 *
 * 落点（宿主侧原型，不动四包）：子类化 Canvas2DBackend，在 begin() 清屏 + 视口
 * 变换之后、图层绘制之前垫网格——网格与图层同一画布同一帧：
 * - 只画纸面之外（evenodd 挖掉 doc 矩形）：桌面获得纹理、纸面保持平滑，边界
 *   恒清晰（纸面常有全幅底图，如 demo 的 2400×1500 #0f172a——画在图层之下若
 *   不挖纸面会被底图整片盖住；画在图层之上又会压内容，挖纸面两侧都占）；
 * - 导出不带网格：exportPreviewPng 经 forkWith() 派生的是普通 Canvas2DBackend
 *   （fork 构造器硬编码基类），网格只住编辑面这个子类实例上。
 *
 * 绘制细节：begin 后 ctx 变换即 dpr×zoom（applyViewportTransform），线宽取
 * 1/scale = 1 物理像素；线位逐线按设备像素取整（消半像素发虚）；步长随 zoom
 * 自适应倍增——相邻线距的屏幕像素低于阈值就翻倍，5%–800% 缩放全程可辨。
 * 开关态由宿主持有直改（原型会话态，不入内核 store ui 分支），变更后宿主调
 * editor.invalidate('content') 触发内容层重绘。
 */
import { Canvas2DBackend } from '@hankchen/canvas-next-browser-renderer'

export interface GridBackdropOptions {
    /** 基础步长（场景像素）；屏幕线距不足时倍增 */
    step?: number
    /** 线色（低透明度：暗桌面上呈淡青纹理，不抢纸面内容） */
    color?: string
    /** 相邻线距的最小设备像素（低于即步长翻倍） */
    minStepPx?: number
}

const DEFAULTS: Required<GridBackdropOptions> = {
    step: 10,
    color: 'rgba(56, 189, 248, 0.12)',
    minStepPx: 8,
}

export class GridBackdropBackend extends Canvas2DBackend {
    /** 宿主开关直改；变更后须 editor.invalidate('content') 才生效 */
    enabled = true

    private readonly gridCtx: CanvasRenderingContext2D
    private readonly options: Required<GridBackdropOptions>

    constructor(ctx: CanvasRenderingContext2D, options: GridBackdropOptions = {}) {
        super(ctx)
        // 基类把 ctx 持有为 private，网格绘制复用宿主手中的同一上下文实例
        this.gridCtx = ctx
        this.options = { ...DEFAULTS, ...options }
    }

    begin(width: number, height: number): void {
        super.begin(width, height) // 清屏 + 施加视口变换（内容层每帧入口）
        if (!this.enabled || width <= 0 || height <= 0) return
        paintGridBackdrop(this.gridCtx, width, height, this.options)
    }
}

/**
 * 在当前变换（dpr×zoom）下画桌面网格：线宽 1 物理像素、线位按设备像素取整；
 * 裁剪域 = 可见视口 ∪ 纸面取 evenodd（即纸面之外的桌面区域）。
 */
export function paintGridBackdrop(
    ctx: CanvasRenderingContext2D,
    docWidth: number,
    docHeight: number,
    options: Required<GridBackdropOptions>,
): void {
    const transform = ctx.getTransform()
    const scale = transform.a // dpr × zoom（begin 刚施加的视口变换）
    if (!Number.isFinite(scale) || scale <= 0) return

    // 步长自适应：相邻线距设备像素不足即翻倍（远缩不糊成一团）
    let step = options.step
    while (step * scale < options.minStepPx) step *= 2

    // 可见视口的场景范围（屏幕矩形反推），外扩一步防边缘缺线
    const sceneLeft = -transform.e / scale
    const sceneTop = -transform.f / scale
    const sceneRight = (ctx.canvas.width - transform.e) / scale
    const sceneBottom = (ctx.canvas.height - transform.f) / scale

    ctx.save()
    ctx.beginPath()
    ctx.rect(
        sceneLeft - step,
        sceneTop - step,
        sceneRight - sceneLeft + 2 * step,
        sceneBottom - sceneTop + 2 * step,
    )
    ctx.rect(0, 0, docWidth, docHeight)
    ctx.clip('evenodd')

    ctx.lineWidth = 1 / scale
    ctx.strokeStyle = options.color
    ctx.beginPath()
    // 线位锚定场景步长整数倍（平移缩放下同一批场景线），逐线对齐设备像素网格
    const snap = (scene: number, origin: number): number =>
        (Math.round(scene * scale + origin) - origin) / scale
    for (let x = snap(Math.floor(sceneLeft / step) * step, transform.e); x < sceneRight + step; x += step) {
        ctx.moveTo(x, sceneTop - step)
        ctx.lineTo(x, sceneBottom + step)
    }
    for (let y = snap(Math.floor(sceneTop / step) * step, transform.f); y < sceneBottom + step; y += step) {
        ctx.moveTo(sceneLeft - step, y)
        ctx.lineTo(sceneRight + step, y)
    }
    ctx.stroke()
    ctx.restore()
}
