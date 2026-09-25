/// <reference lib="dom" />

import { describe, expect, it } from 'vitest'

import { decodeGraph, renderCanvas } from '@hankchen/canvas-next'
import type { TextDrawOptions } from '@hankchen/canvas-next'

import { builtinFontShorthand, isBuiltinFontRef } from '../src/fonts'
import { Canvas2DBackend } from '../src/index'

interface CtxOp {
    call: string
    args: unknown[]
}

/** 录制用假 2D 上下文：记录样式赋值与绘制调用（Node 无 DOM 环境，不产像素） */
function fakeCtx(metrics: {
    width: number
    fontAscent?: number
    fontDescent?: number
    actualAscent?: number
    actualDescent?: number
} = { width: 40, fontAscent: 30, fontDescent: 10 }) {
    const ops: CtxOp[] = []
    const state = { fillStyle: '', strokeStyle: '', lineWidth: 0, font: '' }
    const record = (call: string, ...args: unknown[]) => ops.push({ call, args })

    const ctx = {
        get fillStyle() {
            return state.fillStyle
        },
        set fillStyle(value: string) {
            state.fillStyle = value
            record('fillStyle', value)
        },
        get strokeStyle() {
            return state.strokeStyle
        },
        set strokeStyle(value: string) {
            state.strokeStyle = value
            record('strokeStyle', value)
        },
        get lineWidth() {
            return state.lineWidth
        },
        set lineWidth(value: number) {
            state.lineWidth = value
            record('lineWidth', value)
        },
        get font() {
            return state.font
        },
        set font(value: string) {
            state.font = value
            record('font', value)
        },
        measureText: (line: string) => ({
            width: metrics.width,
            fontBoundingBoxAscent: metrics.fontAscent,
            fontBoundingBoxDescent: metrics.fontDescent,
            actualBoundingBoxAscent: metrics.actualAscent,
            actualBoundingBoxDescent: metrics.actualDescent,
            // 消费端只读上述字段；断言处按字段名取用
            text: line,
        }),
        setTransform: (...args: unknown[]) => record('setTransform', ...args),
        clearRect: (...args: unknown[]) => record('clearRect', ...args),
        fillRect: (...args: unknown[]) => record('fillRect', ...args),
        fillText: (...args: unknown[]) => record('fillText', ...args),
        // 图片对象本体以占位标记记录（断言只关心源窗/目标盒数值）
        drawImage: (...args: unknown[]) => record('drawImage', '__image__', ...args.slice(1)),
        beginPath: () => record('beginPath'),
        moveTo: (...args: unknown[]) => record('moveTo', ...args),
        lineTo: (...args: unknown[]) => record('lineTo', ...args),
        stroke: () => record('stroke'),
        save: () => record('save'),
        restore: () => record('restore'),
        translate: (...args: unknown[]) => record('translate', ...args),
        rotate: (...args: unknown[]) => record('rotate', ...args),
    }

    return { ops, ctx: ctx as unknown as CanvasRenderingContext2D }
}

const TEXT_OPTIONS: TextDrawOptions = {
    font: '',
    fontSize: 12,
    fontColor: '#000000',
    horizontalAlign: 'left',
    verticalAlign: 'top',
    angle: 0,
}

describe('Canvas2D 后端（begin/end/drawRect，工单 02 平移）', () => {
    it('begin 重置变换并清空画布（新建渲染面语义，二次渲染不叠影），end 收尾', () => {
        const { ops, ctx } = fakeCtx()
        const backend = new Canvas2DBackend(ctx)

        backend.begin(320, 200)
        backend.end()

        expect(ops[0]).toEqual({ call: 'setTransform', args: [1, 0, 0, 1, 0, 0] })
        expect(ops[1]).toEqual({ call: 'clearRect', args: [0, 0, 320, 200] })
    })

    it('drawRect：背景填充盒（null/空串跳过）', () => {
        const { ops, ctx } = fakeCtx()
        const backend = new Canvas2DBackend(ctx)

        backend.drawRect(10, 20, 100, 50, '#ff0000', { top: null, bottom: null, left: null, right: null })
        expect(ops).toEqual([
            { call: 'fillStyle', args: ['#ff0000'] },
            { call: 'fillRect', args: [10, 20, 100, 50] },
        ])

        ops.length = 0
        backend.drawRect(0, 0, 10, 10, null, { top: null, bottom: null, left: null, right: null })
        backend.drawRect(0, 0, 10, 10, '', { top: null, bottom: null, left: null, right: null })
        expect(ops).toEqual([])
    })

    it('drawRect：四边边框沿盒边描线，逐边 width/color（镜像 PHP drawBorderLine）', () => {
        const { ops, ctx } = fakeCtx()
        const backend = new Canvas2DBackend(ctx)

        backend.drawRect(5, 5, 30, 20, null, {
            top: { width: 2, color: '#f00' },
            bottom: { width: 4, color: '#0f0' },
            left: { width: 1, color: '#00f' },
            right: null,
        })

        expect(ops).toEqual([
            { call: 'beginPath', args: [] },
            { call: 'moveTo', args: [5, 5] },
            { call: 'lineTo', args: [35, 5] }, // 上边
            { call: 'strokeStyle', args: ['#f00'] },
            { call: 'lineWidth', args: [2] },
            { call: 'stroke', args: [] },
            { call: 'beginPath', args: [] },
            { call: 'moveTo', args: [5, 25] },
            { call: 'lineTo', args: [35, 25] }, // 下边（y + height）
            { call: 'strokeStyle', args: ['#0f0'] },
            { call: 'lineWidth', args: [4] },
            { call: 'stroke', args: [] },
            { call: 'beginPath', args: [] },
            { call: 'moveTo', args: [5, 5] },
            { call: 'lineTo', args: [5, 25] }, // 左边
            { call: 'strokeStyle', args: ['#00f'] },
            { call: 'lineWidth', args: [1] },
            { call: 'stroke', args: [] },
            // right 为 null：不画
        ])
    })

    it('模板集成：graph → 解码 → 渲染，背景盒调用序即 priority 序', () => {
        const { ops, ctx } = fakeCtx()
        const canvas = decodeGraph({
            canvas: { width: 100, height: 100 },
            layers: [
                { type: 'ImageLayer', priority: 1, spec: { shape: { width: 80, height: 80, backgroundColor: '#111' } } },
                { type: 'TextLayer', priority: 5, spec: { shape: { width: 40, height: 20, backgroundColor: '#222' } }, data: { value: '文本' } },
            ],
        })

        renderCanvas(canvas, new Canvas2DBackend(ctx))

        const fillCalls = ops.filter((op) => op.call === 'fillRect')
        expect(fillCalls).toEqual([
            { call: 'fillRect', args: [0, 0, 40, 20] }, // priority 5 先画垫底
            { call: 'fillRect', args: [0, 0, 80, 80] },
        ])
    })
})

describe('内置默认字体语义（空串/纯数字 = 渲染端内置默认）', () => {
    it('isBuiltinFontRef：空串与纯数字（旧库 GD 字体 id 血统）为内置，其余走注册', () => {
        expect(isBuiltinFontRef('')).toBe(true)
        expect(isBuiltinFontRef('1')).toBe(true)
        expect(isBuiltinFontRef('12.5')).toBe(true)
        expect(isBuiltinFontRef('-3')).toBe(true)
        expect(isBuiltinFontRef(' 2 ')).toBe(true)
        expect(isBuiltinFontRef('/fonts/demo.ttf')).toBe(false)
        expect(isBuiltinFontRef('https://cdn.example.com/f.woff2')).toBe(false)
        expect(isBuiltinFontRef('1a')).toBe(false)
    })

    it('builtinFontShorthand：系统无衬线族按字号', () => {
        expect(builtinFontShorthand(14)).toBe('14px sans-serif')
    })

    it('drawText：空串/纯数字/未注册 URL 均落内置默认简写', () => {
        for (const font of ['', '3', '/fonts/not-registered.ttf']) {
            const { ops, ctx } = fakeCtx()
            new Canvas2DBackend(ctx).drawText('文', 0, 0, { ...TEXT_OPTIONS, font })
            expect(ops[0]).toEqual({ call: 'font', args: ['12px sans-serif'] })
        }
    })

    it('drawText：注册过的 URL 字体以注册族名生效（FontFace 物化的回写面）', () => {
        const { ops, ctx } = fakeCtx()
        const backend = new Canvas2DBackend(ctx)
        backend.setFontFamily('/fonts/demo.woff2', 'canvas-next-font-abc')

        backend.drawText('Preview', 10, 10, { ...TEXT_OPTIONS, font: '/fonts/demo.woff2', fontSize: 20 })

        expect(ops[0]).toEqual({ call: 'font', args: ['20px "canvas-next-font-abc"'] })
    })
})

describe('drawText：对齐锚点落笔 + 基线经 TextMetrics 消化', () => {
    it('空行零副作用（PHP 同款守卫；模板对空行照常分派，守卫归后端）', () => {
        const { ops, ctx } = fakeCtx()
        new Canvas2DBackend(ctx).drawText('', 10, 10, TEXT_OPTIONS)
        expect(ops).toEqual([])
    })

    it('left/top：fillText 落 (x, y+ascent)，字色即 fillStyle', () => {
        const { ops, ctx } = fakeCtx()
        new Canvas2DBackend(ctx).drawText('文本', 10, 20, TEXT_OPTIONS)
        expect(ops).toEqual([
            { call: 'font', args: ['12px sans-serif'] },
            { call: 'fillStyle', args: ['#000000'] },
            { call: 'fillText', args: ['文本', 10, 50] }, // y + ascent 30
        ])
    })

    it('水平 center/right 按真实文本宽度偏移；垂直 center/bottom 按 metrics 偏移', () => {
        // 假度量：宽 40、ascent 30、descent 10
        const draw = (h: TextDrawOptions['horizontalAlign'], v: TextDrawOptions['verticalAlign']) => {
            const { ops, ctx } = fakeCtx()
            new Canvas2DBackend(ctx).drawText('文本', 100, 100, { ...TEXT_OPTIONS, horizontalAlign: h, verticalAlign: v })
            return ops.find((op) => op.call === 'fillText')
        }

        expect(draw('center', 'top')).toEqual({ call: 'fillText', args: ['文本', 80, 130] }) // -宽/2, +ascent
        expect(draw('right', 'center')).toEqual({ call: 'fillText', args: ['文本', 60, 110] }) // -宽, +(ascent-descent)/2
        expect(draw('left', 'bottom')).toEqual({ call: 'fillText', args: ['文本', 100, 90] }) // 0, -descent
    })

    it('fontBoundingBox 缺失时回退 actual 度量（旧实现浏览器）', () => {
        const { ops, ctx } = fakeCtx({ width: 40, actualAscent: 22, actualDescent: 6 })
        new Canvas2DBackend(ctx).drawText('文', 0, 0, { ...TEXT_OPTIONS, verticalAlign: 'bottom' })
        expect(ops.find((op) => op.call === 'fillText')).toEqual({ call: 'fillText', args: ['文', 0, -6] })
    })

    it('角度：save/translate/rotate(-角·π/180)/fillText 于锚点系/restore（正值视觉逆时针）', () => {
        const { ops, ctx } = fakeCtx()
        new Canvas2DBackend(ctx).drawText('旋转', 10, 20, { ...TEXT_OPTIONS, angle: 90 })

        expect(ops).toEqual([
            { call: 'font', args: ['12px sans-serif'] },
            { call: 'fillStyle', args: ['#000000'] },
            { call: 'save', args: [] },
            { call: 'translate', args: [10, 20] },
            { call: 'rotate', args: [-Math.PI / 2] },
            { call: 'fillText', args: ['旋转', 0, 30] },
            { call: 'restore', args: [] },
        ])
    })
})

describe('drawImage：cover 绘制编排', () => {
    it('宽或高 ≤0 跳过（PHP drawImage 同门）', () => {
        const { ops, ctx } = fakeCtx()
        const backend = new Canvas2DBackend(ctx)
        backend.setImage('a.png', { width: 20, height: 10 })

        backend.drawImage('a.png', 0, 0, 0, 10)
        backend.drawImage('a.png', 0, 0, 10, 0)
        backend.drawImage('a.png', 0, 0, -5, 10)
        expect(ops).toEqual([])
    })

    it('未注册的 src 不绘制（只画盒的占位语义；物化在工单 04）', () => {
        const { ops, ctx } = fakeCtx()
        new Canvas2DBackend(ctx).drawImage('missing.png', 0, 0, 40, 20)
        expect(ops).toEqual([])
    })

    it('注册后按源图尺寸算 cover 窗：八参 drawImage（源窗 + 目标盒）', () => {
        const { ops, ctx } = fakeCtx()
        const backend = new Canvas2DBackend(ctx)
        backend.setImage('wide.png', { width: 200, height: 100 })

        backend.drawImage('wide.png', 5, 6, 120, 90)

        expect(ops).toEqual([
            // 窗 133×100 @ (33, 0)（见 cover.test.ts 同款值）
            { call: 'drawImage', args: ['__image__', 33, 0, 133, 100, 5, 6, 120, 90] },
        ])
    })
})

/** 点位取样：假 ctx 内建最小软件光栅（fillRect + drawImage 最近邻采样），渲染整图后逐点取色 */
describe('点位取样断言（背景色、cover 中缝）', () => {
    type RGB = [number, number, number]

    function parseColor(css: string): RGB {
        const hex = css.startsWith('#') ? css.slice(1) : ''
        const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
        return [
            parseInt(full.slice(0, 2), 16),
            parseInt(full.slice(2, 4), 16),
            parseInt(full.slice(4, 6), 16),
        ]
    }

    function makeSurfaceCtx() {
        const W = 60
        const H = 40
        const buf = new Uint8ClampedArray(W * H * 3)
        const setPx = (x: number, y: number, [r, g, b]: RGB) => {
            const i = (y * W + x) * 3
            buf[i] = r
            buf[i + 1] = g
            buf[i + 2] = b
        }

        const state = { fillStyle: '#000000' }
        const ctx = {
            set fillStyle(v: string) { state.fillStyle = v },
            setTransform: () => {},
            clearRect: () => {},
            fillRect(x: number, y: number, w: number, h: number) {
                const c = parseColor(state.fillStyle)
                for (let dy = 0; dy < h; dy++) {
                    for (let dx = 0; dx < w; dx++) setPx(x + dx, y + dy, c)
                }
            },
            drawImage(
                img: { width: number; height: number; data: Uint8ClampedArray },
                sx: number, sy: number, sw: number, sh: number,
                dx: number, dy: number, dw: number, dh: number,
            ) {
                for (let py = 0; py < dh; py++) {
                    const sY = sy + Math.floor((py * sh) / dh)
                    for (let px = 0; px < dw; px++) {
                        const sX = sx + Math.floor((px * sw) / dw)
                        const si = (sY * img.width + sX) * 4
                        setPx(dx + px, dy + py, [img.data[si]!, img.data[si + 1]!, img.data[si + 2]!])
                    }
                }
            },
        }
        return {
            ctx: ctx as unknown as CanvasRenderingContext2D,
            getPixel: (x: number, y: number): RGB => {
                const i = (y * W + x) * 3
                return [buf[i]!, buf[i + 1]!, buf[i + 2]!]
            },
        }
    }

    /** 两色源图：左半 #0000ff、右半 #00ff00 */
    function twoToneImage(width: number, height: number, left: RGB, right: RGB) {
        const data = new Uint8ClampedArray(width * height * 4)
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const [r, g, b] = x < width / 2 ? left : right
                const i = (y * width + x) * 4
                data[i] = r
                data[i + 1] = g
                data[i + 2] = b
                data[i + 3] = 255
            }
        }
        return { width, height, data }
    }

    it('padding 区露出图层背景色，cover 图铺满内容盒且中缝落在目标盒中线', () => {
        const { ctx, getPixel } = makeSurfaceCtx()
        const backend = new Canvas2DBackend(ctx)
        // 源图 20×10：scale = max(2, 2) = 2 → 整图铺到内容盒 40×20（见 padding 10）
        backend.setImage('seam.png', twoToneImage(20, 10, [0, 0, 255], [0, 255, 0]))

        const canvas = decodeGraph({
            canvas: { width: 60, height: 40 },
            layers: [{
                type: 'ImageLayer',
                spec: {
                    shape: {
                        width: 60,
                        height: 40,
                        padding: { top: 10, bottom: 10, left: 10, right: 10 },
                        backgroundColor: '#ff0000',
                    },
                },
                data: { value: 'seam.png' },
            }],
        })
        renderCanvas(canvas, backend)

        // 背景色：padding 区（内容盒外）露出
        expect(getPixel(5, 5)).toEqual([255, 0, 0])
        expect(getPixel(55, 35)).toEqual([255, 0, 0])
        // cover 内容：左半蓝、右半绿（内容盒 10..49 × 10..29）
        expect(getPixel(12, 15)).toEqual([0, 0, 255])
        expect(getPixel(48, 25)).toEqual([0, 255, 0])
        // cover 中缝：目标盒中线 x=30 处左蓝右绿
        expect(getPixel(29, 20)).toEqual([0, 0, 255])
        expect(getPixel(30, 20)).toEqual([0, 255, 0])
    })

    it('居中裁切：源图两侧被裁掉，只有中部进目标盒', () => {
        const { ctx, getPixel } = makeSurfaceCtx()
        const backend = new Canvas2DBackend(ctx)
        // 源图 40×10：两侧 10px 绿、中部 20px 蓝 → cover 到 40×20 时窗取中部 [10,30)
        backend.setImage('crop.png', twoToneImageWithMiddle(40, 10))

        const canvas = decodeGraph({
            canvas: { width: 60, height: 40 },
            layers: [{
                type: 'ImageLayer',
                spec: {
                    shape: {
                        width: 60,
                        height: 40,
                        padding: { top: 10, bottom: 10, left: 10, right: 10 },
                        backgroundColor: '#ff0000',
                    },
                },
                data: { value: 'crop.png' },
            }],
        })
        renderCanvas(canvas, backend)

        // 内容盒全部为蓝（窗居中）；若窗未居中（sx=0），右半会出现绿
        for (const x of [10, 25, 49]) {
            expect(getPixel(x, 20)).toEqual([0, 0, 255])
        }
        expect(getPixel(5, 20)).toEqual([255, 0, 0])
    })

    /** 三段源图：左右各 1/4 为绿，中段 1/2 为蓝 */
    function twoToneImageWithMiddle(width: number, height: number) {
        const data = new Uint8ClampedArray(width * height * 4)
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const [r, g, b] = x >= width / 4 && x < (width * 3) / 4 ? [0, 0, 255] : [0, 255, 0]
                const i = (y * width + x) * 4
                data[i] = r
                data[i + 1] = g
                data[i + 2] = b
                data[i + 3] = 255
            }
        }
        return { width, height, data }
    }
})
