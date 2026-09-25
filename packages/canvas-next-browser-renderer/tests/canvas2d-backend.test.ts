/// <reference lib="dom" />

import { describe, expect, it } from 'vitest'

import { decodeGraph, renderCanvas } from '@hankchen/canvas-next'

import { Canvas2DBackend } from '../src/index'

interface CtxOp {
    call: string
    args: unknown[]
}

/** 录制用假 2D 上下文：记录样式赋值与绘制调用（Node 无 DOM 环境，不产像素） */
function fakeCtx() {
    const ops: CtxOp[] = []
    const state = { fillStyle: '', strokeStyle: '', lineWidth: 0 }
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
        setTransform: (...args: unknown[]) => record('setTransform', ...args),
        clearRect: (...args: unknown[]) => record('clearRect', ...args),
        fillRect: (...args: unknown[]) => record('fillRect', ...args),
        beginPath: () => record('beginPath'),
        moveTo: (...args: unknown[]) => record('moveTo', ...args),
        lineTo: (...args: unknown[]) => record('lineTo', ...args),
        stroke: () => record('stroke'),
    }

    return { ops, ctx: ctx as unknown as CanvasRenderingContext2D }
}

describe('Canvas2D 后端（begin/end/drawRect）', () => {
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
                { type: 'TextLayer', priority: 5, spec: { shape: { width: 40, height: 20, backgroundColor: '#222' } } },
            ],
        })

        renderCanvas(canvas, new Canvas2DBackend(ctx))

        const fillCalls = ops.filter((op) => op.call === 'fillRect')
        expect(fillCalls).toEqual([
            { call: 'fillRect', args: [0, 0, 40, 20] }, // priority 5 先画垫底
            { call: 'fillRect', args: [0, 0, 80, 80] },
        ])
    })

    it('工单 02 边界：drawImage/drawText 未实现，占位渲染不会触发', () => {
        const { ctx } = fakeCtx()
        const backend = new Canvas2DBackend(ctx)

        expect(() => backend.drawImage('a.png', 0, 0, 10, 10)).toThrow(/工单 03/)
        expect(() => backend.drawText('文本', 0, 0, {
            font: '',
            fontSize: 12,
            fontColor: '#000',
            horizontalAlign: 'left',
            verticalAlign: 'top',
            angle: 0,
        })).toThrow(/工单 03/)
    })
})
