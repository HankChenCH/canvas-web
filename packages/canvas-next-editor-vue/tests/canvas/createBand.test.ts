import { describe, expect, it } from 'vitest'

import { EditorSession, type FrameScheduler, type OverlayPaintArgs } from '@hankchen/canvas-next-editor'

import { drawCreateRubberBand } from '../../src/canvas/createBand'

const nullScheduler: FrameScheduler = () => () => {}

/**
 * 纯对象 ctx 替身：记录关键笔画调用（gizmo.test 同款思路，另记虚线/文本/气泡）。
 * measureText 按当前字号定比返回（真实度量随 font 缩放，zoom 折算断言的确定性
 * 基准：宽度 = 字号 × 4）。
 */
function mockCtx() {
    const calls: string[] = []
    const dashes: number[][] = []
    const lineWidths: number[] = []
    const fonts: string[] = []
    const texts: string[] = []
    let fontPx = 0
    return {
        calls,
        dashes,
        lineWidths,
        fonts,
        texts,
        canvas: { width: 600, height: 400 },
        setLineDash(segments: number[]) {
            dashes.push([...segments])
        },
        fillRect(...args: number[]) {
            calls.push(`fill:${args.join(',')}`)
        },
        strokeRect(...args: number[]) {
            calls.push(`stroke:${args.join(',')}`)
        },
        beginPath() {
            calls.push('beginPath')
        },
        roundRect(...args: number[]) {
            calls.push(`round:${args.join(',')}`)
        },
        fill() {
            calls.push('fillPath')
        },
        fillText(text: string, x: number, y: number) {
            texts.push(text)
            calls.push(`text:${text}@${x},${y}`)
        },
        measureText() {
            return { width: fontPx * 4 }
        },
        set lineWidth(v: number) {
            lineWidths.push(v)
        },
        set font(v: string) {
            fonts.push(v)
            fontPx = Number.parseFloat(v)
        },
    } as unknown as CanvasRenderingContext2D & {
        calls: string[]
        dashes: number[][]
        lineWidths: number[]
        fonts: string[]
        texts: string[]
    }
}

/** 每例独立会话（手势会话态有互斥残留，不复用共享实例） */
function newSession(): EditorSession {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument({ width: 2400, height: 1500, layers: [] })
    return session
}

const argsAt = (session: EditorSession, zoom: number): OverlayPaintArgs => ({
    viewport: { x: 0, y: 0, zoom },
    dpr: 1,
    doc: session.store.doc,
})

/** 武装 + 画出到 (toX,toY) 的橡皮筋会话（吸附轴空集 = 纯两点正规化） */
function bandTo(
    session: EditorSession,
    type: Parameters<EditorSession['armLayerCreate']>[0],
    toX: number,
    toY: number,
): void {
    session.armLayerCreate(type)
    session.beginLayerCreate(100, 100)
    session.createTo(toX, toY)
}

describe('drawCreateRubberBand（画拉橡皮筋呈现：虚线矩形 + 半透明底 + W×H 气泡）', () => {
    it('无画拉会话零笔画', () => {
        const session = newSession()
        const ctx = mockCtx()
        drawCreateRubberBand(ctx, session, argsAt(session, 1))
        expect(ctx.calls).toEqual([])
        expect(ctx.dashes).toEqual([])
        expect(ctx.texts).toEqual([])
    })

    it('零尺寸矩形（按下未动）零笔画——不出现 0 × 0 气泡', () => {
        const session = newSession()
        session.armLayerCreate('TextLayer')
        session.beginLayerCreate(100, 100)
        const ctx = mockCtx()
        drawCreateRubberBand(ctx, session, argsAt(session, 1))
        expect(ctx.calls).toEqual([])
    })

    it('橡皮筋：半透明底 + 虚线矩形（线宽/虚线屏幕恒定）+ 气泡挂右下角随矩形', () => {
        const session = newSession()
        bandTo(session, 'TextLayer', 180, 140) // rect (100,100) 80×40
        const ctx = mockCtx()
        drawCreateRubberBand(ctx, session, argsAt(session, 1))

        expect(ctx.calls).toEqual([
            'fill:100,100,80,40', // 半透明底
            'stroke:100,100,80,40', // 虚线矩形
            'beginPath',
            'round:186,146,56,17,3', // 气泡：右下角 + 6px 间隙，度量 44 + 12 内边距 × 11 + 6
            'fillPath',
            'text:80 × 40@192,154.5', // 中线基线：bx + padX, by + boxH/2
        ])
        expect(ctx.dashes).toEqual([[4, 3], []]) // 虚线设置后复位
        expect(ctx.lineWidths).toEqual([1]) // 1 css px 屏幕恒定
        expect(ctx.fonts).toEqual(['11px system-ui, sans-serif']) // 场景字号 = css px / zoom
    })

    it('zoom 折算：线宽/虚线/字号/间隙全部 / zoom，屏幕观感恒定（gizmo 柄同口径）', () => {
        const session = newSession()
        bandTo(session, 'TextLayer', 180, 140)
        const ctx = mockCtx()
        drawCreateRubberBand(ctx, session, argsAt(session, 2))

        expect(ctx.calls).toEqual([
            'fill:100,100,80,40',
            'stroke:100,100,80,40',
            'beginPath',
            'round:183,143,28,8.5,1.5', // 场景单位减半：间隙 3、度量 22 + 6、盒 28×8.5、圆角 1.5
            'fillPath',
            'text:80 × 40@186,147.25',
        ])
        expect(ctx.dashes).toEqual([[2, 1.5], []])
        expect(ctx.lineWidths).toEqual([0.5])
        expect(ctx.fonts).toEqual(['5.5px system-ui, sans-serif'])
    })

    it('气泡文本随会话 rect（含 QR 钳方与浮点取整）：W × H 直读求位产物', () => {
        const session = newSession()
        bandTo(session, 'QrCodeLayer', 180, 140) // QR 钳 height := width → 80×80
        const ctx = mockCtx()
        drawCreateRubberBand(ctx, session, argsAt(session, 1))
        expect(ctx.texts).toEqual(['80 × 80'])

        const session2 = newSession()
        bandTo(session2, 'TextLayer', 180.4, 140.6) // 浮点 rect 80.4×40.6 → 取整读数
        const ctx2 = mockCtx()
        drawCreateRubberBand(ctx2, session2, argsAt(session2, 1))
        expect(ctx2.texts).toEqual(['80 × 41'])
    })
})
