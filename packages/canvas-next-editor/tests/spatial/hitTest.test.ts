import { describe, expect, it } from 'vitest'

import type { Canvas } from '@hankchen/canvas-next'

import { hitTest } from '../../src/spatial/hitTest'
import { cellLayer, imageLayer, qrLayer, rowLayer, tableLayer, textLayer } from '../support/fixtures'

const doc = (layers: Canvas['layers']): Canvas => ({ width: 2400, height: 1500, layers })

describe('叠放次序：数组尾（视觉最上层）优先', () => {
    const canvas = doc([
        imageLayer({ position: { anchor: 'top-left', x: 0, y: 0 }, shape: { width: 100, height: 100 } }),
        textLayer({ position: { anchor: 'top-left', x: 50, y: 0 }, shape: { width: 100, height: 100 } }),
    ])

    it('重叠区命中数组尾（后画在上）', () => {
        expect(hitTest(canvas, 75, 50)).toEqual(['layers', 1])
    })

    it('仅底层覆盖处命中底层', () => {
        expect(hitTest(canvas, 25, 50)).toEqual(['layers', 0])
    })

    it('都未覆盖返回 null；零尺寸图层不可命中', () => {
        expect(hitTest(canvas, 200, 50)).toBeNull()
        expect(hitTest(doc([textLayer({ shape: { width: 0, height: 100 } })]), 10, 10)).toBeNull()
    })
})

describe('表格下钻：格内容 → 格 → 行 → 表，逐级回退', () => {
    /** 表 (96,1120) 600×300，行 90/110（下余 100px 表自留区），行零双格 300 宽、首格含内容 */
    const canvas = doc([
        tableLayer(
            [
                rowLayer(
                    [
                        cellLayer(
                            textLayer({ shape: { width: 100, height: 40 }, position: { anchor: 'top-left', x: 5, y: 5 } }),
                            { shape: { width: 300, height: 90 } },
                        ),
                        cellLayer(null, { shape: { width: 300, height: 90 } }),
                    ],
                    { shape: { width: 600, height: 90 } },
                ),
                rowLayer([cellLayer(null, { shape: { width: 300, height: 110 } })], { shape: { width: 600, height: 110 } }),
            ],
            { shape: { width: 600, height: 300 }, position: { anchor: 'top-left', x: 96, y: 1120 } },
        ),
    ])

    it('点格内容命中内容层', () => {
        expect(hitTest(canvas, 150, 1140)).toEqual(['layers', 0, 'rows', 0, 'cells', 0, 'content'])
    })

    it('点格内空白处命中该格', () => {
        expect(hitTest(canvas, 350, 1180)).toEqual(['layers', 0, 'rows', 0, 'cells', 0])
    })

    it('相邻格边界归右格（半开区间，一格一点）', () => {
        expect(hitTest(canvas, 396, 1140)).toEqual(['layers', 0, 'rows', 0, 'cells', 1])
    })

    it('行外/格外的表自留区命中表本身', () => {
        expect(hitTest(canvas, 396, 1370)).toEqual(['layers', 0])
    })

    it('表外返回 null', () => {
        expect(hitTest(canvas, 90, 1125)).toBeNull()
    })
})

describe('负溢出图层可命中（命中不钳位到画布边界）', () => {
    const canvas = doc([
        textLayer({ position: { anchor: 'top-left', x: -50, y: -20 }, shape: { width: 100, height: 50 } }),
        qrLayer({ position: { anchor: 'top-left', x: 2380, y: 1460 }, shape: { width: 120, height: 120 } }),
    ])

    it('左上负偏移溢出画布外的部分可命中', () => {
        expect(hitTest(canvas, -30, 5)).toEqual(['layers', 0])
    })

    it('右下溢出画布外的部分可命中', () => {
        expect(hitTest(canvas, 2470, 1520)).toEqual(['layers', 1])
    })
})
