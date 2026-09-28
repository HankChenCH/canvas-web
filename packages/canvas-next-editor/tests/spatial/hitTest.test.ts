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

describe('底图命中豁免（工票 16，spec「渲染与交互」2026-09-27）：全幅底层退出画布命中面', () => {
    const fullBleed = () => imageLayer({ shape: { width: 2400, height: 1500 } })

    it('全幅底层：画布内任意点不再命中（点它 = 取消选中）', () => {
        expect(hitTest(doc([fullBleed()]), 1200, 1000)).toBeNull()
    })

    it('其上叠放的普通层照常命中，豁免区仍返回 null', () => {
        const canvas = doc([
            fullBleed(),
            textLayer({ position: { anchor: 'top-left', x: 100, y: 100 }, shape: { width: 100, height: 100 } }),
        ])
        expect(hitTest(canvas, 150, 150)).toEqual(['layers', 1])
        expect(hitTest(canvas, 1200, 1000)).toBeNull()
    })

    it('非全幅底层照常命中（普通元素可点可拖）', () => {
        const canvas = doc([
            textLayer({ position: { anchor: 'top-left', x: 0, y: 0 }, shape: { width: 100, height: 100 } }),
        ])
        expect(hitTest(canvas, 50, 50)).toEqual(['layers', 0])
    })

    it('中叠全幅层照常命中（只豁免数组头，不豁免中叠全幅层）', () => {
        const canvas = doc([
            textLayer({ position: { anchor: 'top-left', x: 0, y: 0 }, shape: { width: 100, height: 100 } }),
            imageLayer({ shape: { width: 2400, height: 1500 } }),
        ])
        expect(hitTest(canvas, 1200, 1000)).toEqual(['layers', 1])
    })

    it('底层负溢出但覆盖画布仍豁免（溢出画布外的部分同层不命中）', () => {
        const canvas = doc([
            imageLayer({
                position: { anchor: 'top-left', x: -50, y: -40 },
                shape: { width: 2500, height: 1600 },
            }),
        ])
        expect(hitTest(canvas, 1200, 1000)).toBeNull()
        expect(hitTest(canvas, -30, -20)).toBeNull()
    })

    it('全幅底表自身豁免，行/格/格内容照常可命中（子树下钻不受影响）', () => {
        const canvas = doc([
            tableLayer(
                [
                    rowLayer(
                        [
                            cellLayer(
                                textLayer({
                                    shape: { width: 100, height: 40 },
                                    position: { anchor: 'top-left', x: 5, y: 5 },
                                }),
                                { shape: { width: 150, height: 90 } },
                            ),
                            cellLayer(null, { shape: { width: 150, height: 90 } }),
                        ],
                        { shape: { width: 600, height: 90 } },
                    ),
                ],
                { shape: { width: 2400, height: 1500 } },
            ),
        ])
        expect(hitTest(canvas, 75, 35)).toEqual(['layers', 0, 'rows', 0, 'cells', 0, 'content'])
        expect(hitTest(canvas, 200, 35)).toEqual(['layers', 0, 'rows', 0, 'cells', 1])
        expect(hitTest(canvas, 450, 35)).toEqual(['layers', 0, 'rows', 0])
        expect(hitTest(canvas, 1200, 1000)).toBeNull()
    })
})

describe('隐藏层命中过滤（layer-panel-ux 工单 10）：visible=false 根层整子树退出命中面', () => {
    it('隐藏顶层不被命中：点其区域穿透命中下方可见层', () => {
        const canvas = doc([
            textLayer({ position: { anchor: 'top-left', x: 0, y: 0 }, shape: { width: 100, height: 100 } }),
            textLayer({
                visible: false,
                position: { anchor: 'top-left', x: 50, y: 0 },
                shape: { width: 100, height: 100 },
            }),
        ])
        expect(hitTest(canvas, 75, 50)).toEqual(['layers', 0]) // 重叠区穿透到底层
        expect(hitTest(canvas, 120, 50)).toBeNull() // 仅隐藏层覆盖处无命中
    })

    it('隐藏表格整子树不可命中：行/格/格内容随根层一起退出', () => {
        const canvas = doc([
            tableLayer(
                [
                    rowLayer(
                        [
                            cellLayer(
                                textLayer({
                                    shape: { width: 100, height: 40 },
                                    position: { anchor: 'top-left', x: 5, y: 5 },
                                }),
                                { shape: { width: 150, height: 90 } },
                            ),
                        ],
                        { shape: { width: 300, height: 90 } },
                    ),
                ],
                { visible: false, shape: { width: 300, height: 200 }, position: { anchor: 'top-left', x: 96, y: 1120 } },
            ),
        ])
        expect(hitTest(canvas, 75, 35 + 1120)).toBeNull() // 格内容
        expect(hitTest(canvas, 200, 35 + 1120)).toBeNull() // 格
        expect(hitTest(canvas, 200, 150 + 1120)).toBeNull() // 表自留区
    })

    it('隐藏的全幅底层不命中（整层跳过含垫底层，与可见性语义一致返回 null）', () => {
        const canvas = doc([imageLayer({ visible: false, shape: { width: 2400, height: 1500 } })])
        expect(hitTest(canvas, 1200, 1000)).toBeNull()
    })

    it('中叠隐藏层不遮挡：上下可见层各自照常命中', () => {
        const canvas = doc([
            textLayer({ position: { anchor: 'top-left', x: 0, y: 0 }, shape: { width: 100, height: 100 } }),
            imageLayer({ visible: false, position: { anchor: 'top-left', x: 0, y: 0 }, shape: { width: 2400, height: 1500 } }),
            textLayer({ position: { anchor: 'top-left', x: 50, y: 0 }, shape: { width: 100, height: 100 } }),
        ])
        expect(hitTest(canvas, 25, 50)).toEqual(['layers', 0])
        expect(hitTest(canvas, 75, 50)).toEqual(['layers', 2])
        expect(hitTest(canvas, 1200, 1000)).toBeNull()
    })
})
