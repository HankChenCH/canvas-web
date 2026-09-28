import { describe, expect, it } from 'vitest'

import type { Canvas } from '@hankchen/canvas-next'

import {
    isLayerPath,
    layerBoxByPath,
    pathsEqual,
    resolveLayer,
    rootLayerOf,
    selectionParentPath,
} from '../../src/shared/layerPath'
import { cellLayer, qrLayer, rowLayer, tableLayer, textLayer } from '../support/fixtures'

const doc = (layers: Canvas['layers']): Canvas => ({ width: 2400, height: 1500, layers })

/** 工单 06 目验同款嵌套：表 (96,1120) 600×200，两行（90/110），行一 300 宽双格 */
function tableDoc(): Canvas {
    return doc([
        textLayer({ position: { anchor: 'top-left', x: 10, y: 20 } }),
        tableLayer(
            [
                rowLayer(
                    [
                        cellLayer(textLayer({ shape: { width: 100, height: 40 }, position: { anchor: 'top-left', x: 5, y: 5 } }), {
                            shape: { width: 300, height: 90 },
                        }),
                        cellLayer(null, { shape: { width: 300, height: 90 } }),
                    ],
                    { shape: { width: 600, height: 90 } },
                ),
                rowLayer(
                    [cellLayer(null, { shape: { width: 300, height: 110 } })],
                    { shape: { width: 600, height: 110 } },
                ),
            ],
            { shape: { width: 600, height: 200 }, position: { anchor: 'top-left', x: 96, y: 1120 } },
        ),
    ])
}

describe('isLayerPath（结构校验：路径语法 = patch path 前缀语法）', () => {
    it('四种合法形态：根层 / 行 / 格 / 格内容', () => {
        expect(isLayerPath(['layers', 0])).toBe(true)
        expect(isLayerPath(['layers', 2, 'rows', 1])).toBe(true)
        expect(isLayerPath(['layers', 2, 'rows', 1, 'cells', 0])).toBe(true)
        expect(isLayerPath(['layers', 2, 'rows', 1, 'cells', 0, 'content'])).toBe(true)
    })

    it('非数组、缺索引、负数/非整索引、字符串索引一律非法', () => {
        expect(isLayerPath([])).toBe(false)
        expect(isLayerPath(['layers'])).toBe(false)
        expect(isLayerPath(['position', 0])).toBe(false)
        expect(isLayerPath(['layers', -1])).toBe(false)
        expect(isLayerPath(['layers', 1.5])).toBe(false)
        expect(isLayerPath(['layers', '0'])).toBe(false)
        expect(isLayerPath('layers')).toBe(false)
        expect(isLayerPath(null)).toBe(false)
    })

    it('下降段不完整或不合语法非法（尾段可以是 content）', () => {
        expect(isLayerPath(['layers', 0, 'position'])).toBe(false)
        expect(isLayerPath(['layers', 0, 'rows'])).toBe(false)
        expect(isLayerPath(['layers', 0, 'cells', 0])).toBe(false)
        expect(isLayerPath(['layers', 0, 'rows', 0, 'rows', 0])).toBe(false)
        expect(isLayerPath(['layers', 0, 'content'])).toBe(false)
        expect(isLayerPath(['layers', 0, 'rows', 0, 'cells', 0, 'content', 0])).toBe(false)
    })
})

describe('pathsEqual（选择身份比较：数组值相等）', () => {
    it('同序同值相等，长度/值不同不等，双 null 相等', () => {
        expect(pathsEqual(['layers', 1], ['layers', 1])).toBe(true)
        expect(pathsEqual(['layers', 1], ['layers', 0])).toBe(false)
        expect(pathsEqual(['layers', 1], ['layers', 1, 'rows', 0])).toBe(false)
        expect(pathsEqual(null, null)).toBe(true)
        expect(pathsEqual(['layers', 1], null)).toBe(false)
    })
})

describe('resolveLayer（对文档解析：越界与形态不匹配返回 null）', () => {
    it('根层与表格下钻逐级解析', () => {
        const canvas = tableDoc()
        expect(resolveLayer(canvas, ['layers', 1])).toBe(canvas.layers[1])
        const table = resolveLayer(canvas, ['layers', 1])
        expect(resolveLayer(canvas, ['layers', 1, 'rows', 0])).toBe(table && table.type === 'TableLayer' ? table.rows[0] : null)
        expect(resolveLayer(canvas, ['layers', 1, 'rows', 0, 'cells', 1])).not.toBeNull()
        expect(resolveLayer(canvas, ['layers', 1, 'rows', 0, 'cells', 0, 'content'])?.type).toBe('TextLayer')
    })

    it('索引越界、content 为空、路径形态与文档不符都返回 null', () => {
        const canvas = tableDoc()
        expect(resolveLayer(canvas, ['layers', 9])).toBeNull()
        expect(resolveLayer(canvas, ['layers', 1, 'rows', 5])).toBeNull()
        expect(resolveLayer(canvas, ['layers', 1, 'rows', 0, 'cells', 1, 'content'])).toBeNull()
        // layers[0] 是文本层，不存在 rows
        expect(resolveLayer(canvas, ['layers', 0, 'rows', 0])).toBeNull()
    })
})

describe('selectionParentPath（级联归属链：content→cell→row→table→null）', () => {
    it('逐级升级链', () => {
        expect(selectionParentPath(['layers', 1, 'rows', 0, 'cells', 0, 'content'])).toEqual([
            'layers', 1, 'rows', 0, 'cells', 0,
        ])
        expect(selectionParentPath(['layers', 1, 'rows', 0, 'cells', 0])).toEqual(['layers', 1, 'rows', 0])
        expect(selectionParentPath(['layers', 1, 'rows', 0])).toEqual(['layers', 1])
        expect(selectionParentPath(['layers', 1])).toBeNull()
    })
})

describe('layerBoxByPath（绝对盒：与渲染模板同一几何，供 gizmo/命中/适应选区共用）', () => {
    it('根层盒 = 锚点偏移 + 定位偏移', () => {
        const box = layerBoxByPath(tableDoc(), ['layers', 0])
        expect(box).toEqual({
            x: 10,
            y: 20,
            width: 100,
            height: 50,
            contentX: 10,
            contentY: 20,
            contentWidth: 100,
            contentHeight: 50,
        })
    })

    it('表格下钻：行纵向累加、格横向累加、内容随格原点', () => {
        const canvas = tableDoc()
        // 行一（第二条）y = 表 y + 行零高 90
        expect(layerBoxByPath(canvas, ['layers', 1, 'rows', 1])).toMatchObject({ x: 96, y: 1210, width: 600, height: 110 })
        // 行零第二格 x = 表 x + 首格宽 300
        expect(layerBoxByPath(canvas, ['layers', 1, 'rows', 0, 'cells', 1])).toMatchObject({ x: 396, y: 1120, width: 300, height: 90 })
        // 格内容 = 格原点 + 自身 position 偏移
        expect(layerBoxByPath(canvas, ['layers', 1, 'rows', 0, 'cells', 0, 'content'])).toMatchObject({ x: 101, y: 1125, width: 100, height: 40 })
    })

    it('负溢出图层（bottom-right 贴角外扩）盒为负偏移、可解析', () => {
        const canvas = doc([qrLayer({ shape: { width: 120, height: 0, autoHeight: true }, position: { anchor: 'bottom-right', x: -32, y: -32 } })])
        // QrCode autoHeight = 宽正方形 120；bottom-right 偏移 = (W-120-32, H-120-32)
        expect(layerBoxByPath(canvas, ['layers', 0])).toMatchObject({ x: 2400 - 120 - 32, y: 1500 - 120 - 32, width: 120, height: 120 })
    })

    it('非法/越界路径返回 null', () => {
        expect(layerBoxByPath(tableDoc(), ['layers', 9])).toBeNull()
        expect(layerBoxByPath(tableDoc(), ['layers', 1, 'rows', 9])).toBeNull()
    })
})

describe('rootLayerOf：路径所属根层（layer-panel-ux 工单 10，LayerBase 面字段读取位）', () => {
    it('任意深度路径都落到第 2 段指向的根层', () => {
        const canvas = doc([
            textLayer({ text: '甲' }),
            tableLayer([rowLayer([cellLayer(textLayer({ text: '乙' }))])]),
        ])
        expect(rootLayerOf(canvas, ['layers', 0])?.type).toBe('TextLayer')
        expect(rootLayerOf(canvas, ['layers', 1, 'rows', 0])?.type).toBe('TableLayer')
        expect(rootLayerOf(canvas, ['layers', 1, 'rows', 0, 'cells', 0, 'content'])?.type).toBe('TableLayer')
    })

    it('越界/怪形态路径返回 null（不下钻、不抛错）', () => {
        const canvas = doc([textLayer()])
        expect(rootLayerOf(canvas, ['layers', 9])).toBeNull()
        expect(rootLayerOf(canvas, ['layers'])).toBeNull()
        expect(rootLayerOf(canvas, [])).toBeNull()
        expect(rootLayerOf(canvas, ['layers', -1])).toBeNull()
    })
})
