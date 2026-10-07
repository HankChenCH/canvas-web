import { decodeGraph } from '@hankchen/canvas'

import { describe, expect, it } from 'vitest'

import { drawResourceMarkers } from '../src/markers'
import { fontResourceKey, imageResourceKey, qrResourceKey } from '../src/materializer'
import type { ResourceState } from '../src/materializer'

/** 录制用假 2D 上下文：只记路径与描边调用（标识是纯矢量笔画，无像素语义） */
function recordingMarkerCtx() {
    const ops: Array<{ call: string; args: unknown[] }> = []
    const ctx = {
        beginPath: () => ops.push({ call: 'beginPath', args: [] }),
        moveTo: (...args: unknown[]) => ops.push({ call: 'moveTo', args }),
        lineTo: (...args: unknown[]) => ops.push({ call: 'lineTo', args }),
        stroke: () => ops.push({ call: 'stroke', args: [] }),
        strokeRect: (...args: unknown[]) => ops.push({ call: 'strokeRect', args }),
        set strokeStyle(v: string) {
            ops.push({ call: 'strokeStyle', args: [v] })
        },
        set lineWidth(v: number) {
            ops.push({ call: 'lineWidth', args: [v] })
        },
    }
    return { ops, ctx: ctx as unknown as CanvasRenderingContext2D }
}

describe('drawResourceMarkers：覆盖层的物化状态标识', () => {
    it('pending 画灰叉、failed 画红叉加红框，done/无状态不画', () => {
        const doc = decodeGraph({
            canvas: { width: 200, height: 100 },
            layers: [
                { type: 'ImageLayer', spec: { shape: { width: 40, height: 30 } }, data: { value: 'pending.png' } },
                { type: 'ImageLayer', spec: { shape: { width: 40, height: 30 }, position: { x: 50, y: 0 } }, data: { value: 'failed.png' } },
                { type: 'ImageLayer', spec: { shape: { width: 40, height: 30 }, position: { x: 100, y: 0 } }, data: { value: 'done.png' } },
                { type: 'TextLayer', spec: { shape: { width: 40, height: 20 }, fontFamily: { font: 'https://fonts.example.com/pending.ttf', fontSize: 12 } }, data: { value: '文' } },
                { type: 'QrCodeLayer', spec: { shape: { width: 20, height: 20 }, position: { x: 150, y: 0 } }, data: { value: 'pending-qr' } },
            ],
        })
        const state: ResourceState = {
            [imageResourceKey('pending.png')]: { status: 'pending' },
            [imageResourceKey('failed.png')]: { status: 'failed', error: 'could not get remote file(failed.png)' },
            [imageResourceKey('done.png')]: { status: 'done' },
            [fontResourceKey('https://fonts.example.com/pending.ttf')]: { status: 'pending' },
            [qrResourceKey('pending-qr')]: { status: 'pending' },
        }

        const { ops, ctx } = recordingMarkerCtx()
        drawResourceMarkers(ctx, doc, state)

        const strokes = ops.filter(({ call }) => call === 'stroke')
        expect(strokes).toHaveLength(4) // pending 图/字体/QR 三叉 + failed 一叉

        // 每个叉 = beginPath + 两条对角线 + stroke，灰 rgba / 红 #ef4444
        const styles = ops.filter(({ call }) => call === 'strokeStyle').map(({ args }) => args[0])
        expect(styles).toContain('rgba(100, 116, 139, 0.6)')
        expect(styles).toContain('#ef4444')

        // failed 叉的坐标取图层盒对角（(50,0) 起 40×30）
        const diagonals = ops.filter(({ call }) => call === 'moveTo' || call === 'lineTo')
        expect(diagonals).toContainEqual({ call: 'moveTo', args: [50, 0] })
        expect(diagonals).toContainEqual({ call: 'lineTo', args: [90, 30] })
        expect(diagonals).toContainEqual({ call: 'moveTo', args: [90, 0] })
        expect(diagonals).toContainEqual({ call: 'lineTo', args: [50, 30] })
        // failed 红框：内缩 1px 的描边盒
        expect(ops).toContainEqual({ call: 'strokeRect', args: [51, 1, 38, 28] })
    })

    it('done 或缺失状态的图层零笔画（占位盒归内容层，覆盖层不打扰）', () => {
        const doc = decodeGraph({
            canvas: { width: 100, height: 100 },
            layers: [
                { type: 'ImageLayer', spec: { shape: { width: 40, height: 30 } }, data: { value: 'done.png' } },
                { type: 'QrCodeLayer', spec: { shape: { width: 20, height: 20 } }, data: { value: '' } },
                { type: 'TextLayer', spec: { shape: { width: 40, height: 20 }, fontFamily: { font: '3', fontSize: 12 } }, data: { value: '内置' } },
            ],
        })
        const { ops, ctx } = recordingMarkerCtx()
        drawResourceMarkers(ctx, doc, {
            [imageResourceKey('done.png')]: { status: 'done' },
        })
        expect(ops).toEqual([])
    })
})
