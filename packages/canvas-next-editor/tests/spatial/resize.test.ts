/**
 * 八柄缩放几何纯函数（工单 07）：resizeBox 各柄方向、minSize 钳位不翻转、
 * 移动边吸附求位点、角色可缩放轴与柄集合。
 * 全部为内核纯函数、headless 可测（工单验收项 1/2 的几何面）。
 */
import { describe, expect, it } from 'vitest'

import type { Canvas } from '@hankchen/canvas-next'

import {
    RESIZE_HANDLES,
    RESIZE_MIN_SIZE_PX,
    resizeBox,
    resizeHandleAt,
    resizeHandlesAt,
    resizeHandlePoint,
    resizeSnapPoints,
    resizableAxesAt,
} from '../../src/spatial/resize'
import { cellLayer, imageLayer, rowLayer, rowTemplateLayer, tableLayer, textLayer } from '../support/fixtures'

const BOX = { x: 100, y: 80, width: 200, height: 120 }

describe('resizeBox：八柄方向', () => {
    it('e：右缘随 dx 增缩，左缘与 y 不动', () => {
        expect(resizeBox(BOX, 'e', 30, 7)).toEqual({ x: 100, y: 80, width: 230, height: 120 })
        expect(resizeBox(BOX, 'e', -30, 0)).toEqual({ x: 100, y: 80, width: 170, height: 120 })
    })

    it('w：左缘随 dx 平移，右缘固定（宽 = 原右缘 − 新左缘）', () => {
        expect(resizeBox(BOX, 'w', 30, 0)).toEqual({ x: 130, y: 80, width: 170, height: 120 })
        expect(resizeBox(BOX, 'w', -30, 0)).toEqual({ x: 70, y: 80, width: 230, height: 120 })
    })

    it('s：下缘随 dy 增缩，上缘与 x 不动', () => {
        expect(resizeBox(BOX, 's', 0, 20)).toEqual({ x: 100, y: 80, width: 200, height: 140 })
        expect(resizeBox(BOX, 's', 0, -20)).toEqual({ x: 100, y: 80, width: 200, height: 100 })
    })

    it('n：上缘随 dy 平移，下缘固定', () => {
        expect(resizeBox(BOX, 'n', 0, 20)).toEqual({ x: 100, y: 100, width: 200, height: 100 })
        expect(resizeBox(BOX, 'n', 0, -20)).toEqual({ x: 100, y: 60, width: 200, height: 140 })
    })

    it('四角双轴联动：nw/ne/se/sw', () => {
        expect(resizeBox(BOX, 'nw', 10, 10)).toEqual({ x: 110, y: 90, width: 190, height: 110 })
        expect(resizeBox(BOX, 'ne', -10, -10)).toEqual({ x: 100, y: 70, width: 190, height: 130 })
        expect(resizeBox(BOX, 'se', 10, 10)).toEqual({ x: 100, y: 80, width: 210, height: 130 })
        expect(resizeBox(BOX, 'sw', -10, 10)).toEqual({ x: 90, y: 80, width: 210, height: 130 })
    })

    it('非本柄轴的位移分量被忽略（n 不吃 dx、e 不吃 dy）', () => {
        expect(resizeBox(BOX, 'n', 50, 0)).toEqual({ x: 100, y: 80, width: 200, height: 120 })
        expect(resizeBox(BOX, 'e', 0, 50)).toEqual({ x: 100, y: 80, width: 200, height: 120 })
    })
})

describe('resizeBox：minSize 钳位、不产生负宽高/翻转', () => {
    it('e 拖过左缘：宽钳到 minSize、左缘不动（不翻转）', () => {
        const result = resizeBox(BOX, 'e', -(200 + 50), 0)
        expect(result).toEqual({ x: 100, y: 80, width: RESIZE_MIN_SIZE_PX, height: 120 })
    })

    it('w 拖过右缘：宽钳到 minSize、右缘固定（x = 右缘 − min）', () => {
        const result = resizeBox(BOX, 'w', 200 + 50, 0)
        expect(result).toEqual({
            x: 100 + 200 - RESIZE_MIN_SIZE_PX,
            y: 80,
            width: RESIZE_MIN_SIZE_PX,
            height: 120,
        })
    })

    it('n/s 纵向同门钳位：下缘/上缘固定', () => {
        expect(resizeBox(BOX, 'n', 0, 120 + 50)).toEqual({
            x: 100,
            y: 80 + 120 - RESIZE_MIN_SIZE_PX,
            width: 200,
            height: RESIZE_MIN_SIZE_PX,
        })
        expect(resizeBox(BOX, 's', 0, -(120 + 50))).toEqual({
            x: 100,
            y: 80,
            width: 200,
            height: RESIZE_MIN_SIZE_PX,
        })
    })

    it('角落柄双向钳位互不干扰：右下角固定', () => {
        expect(resizeBox(BOX, 'nw', 500, 500)).toEqual({
            x: 100 + 200 - RESIZE_MIN_SIZE_PX,
            y: 80 + 120 - RESIZE_MIN_SIZE_PX,
            width: RESIZE_MIN_SIZE_PX,
            height: RESIZE_MIN_SIZE_PX,
        })
    })

    it('minSize 可配置（自定义 20）', () => {
        expect(resizeBox(BOX, 'e', -180, 0, 20)).toEqual({ x: 100, y: 80, width: 20, height: 120 })
        expect(resizeBox(BOX, 'w', 180, 0, 20)).toEqual({ x: 280, y: 80, width: 20, height: 120 })
    })
})

describe('resizeSnapPoints：移动边求位点（吸附消费）', () => {
    it('e/w 各只给移动缘一个垂直位点；水平位点为空', () => {
        expect(resizeSnapPoints(BOX, 'e', 10, 0)).toEqual({ vertical: [310], horizontal: [] })
        expect(resizeSnapPoints(BOX, 'w', 10, 0)).toEqual({ vertical: [110], horizontal: [] })
    })

    it('n/s 各只给移动缘一个水平位点；垂直位点为空', () => {
        expect(resizeSnapPoints(BOX, 's', 0, 10)).toEqual({ vertical: [], horizontal: [210] })
        expect(resizeSnapPoints(BOX, 'n', 0, -10)).toEqual({ vertical: [], horizontal: [70] })
    })

    it('角柄给双轴移动缘位点；固定缘与中心不参与缩放吸附', () => {
        expect(resizeSnapPoints(BOX, 'se', 5, -5)).toEqual({ vertical: [305], horizontal: [195] })
        expect(resizeSnapPoints(BOX, 'nw', -5, 5)).toEqual({ vertical: [95], horizontal: [85] })
        expect(resizeSnapPoints(BOX, 'ne', 5, 5)).toEqual({ vertical: [305], horizontal: [85] })
        expect(resizeSnapPoints(BOX, 'sw', -5, -5)).toEqual({ vertical: [95], horizontal: [195] })
    })
})

describe('resizableAxesAt / resizeHandlesAt：角色可缩放面', () => {
    it('根层双轴可缩放，柄集合 = 全部八柄', () => {
        const doc: Canvas = { width: 800, height: 600, layers: [imageLayer()] }
        expect(resizableAxesAt(doc, ['layers', 0])).toEqual({ width: true, height: true })
        expect(resizeHandlesAt(doc, ['layers', 0])).toEqual([...RESIZE_HANDLES])
    })

    it('行只可纵向（宽强同步表宽）：n/s 两柄', () => {
        const doc: Canvas = { width: 800, height: 600, layers: [tableLayer([rowLayer([])])] }
        expect(resizableAxesAt(doc, ['layers', 0, 'rows', 0])).toEqual({ width: false, height: true })
        expect(resizeHandlesAt(doc, ['layers', 0, 'rows', 0])).toEqual(['n', 's'])
    })

    it('格双轴可缩放（内容随强同步跟随）', () => {
        const doc: Canvas = {
            width: 800,
            height: 600,
            layers: [tableLayer([rowLayer([cellLayer(null)])])],
        }
        expect(resizableAxesAt(doc, ['layers', 0, 'rows', 0, 'cells', 0])).toEqual({
            width: true,
            height: true,
        })
        expect(resizeHandlesAt(doc, ['layers', 0, 'rows', 0, 'cells', 0])).toEqual([...RESIZE_HANDLES])
    })

    it('格内容尺寸全强同步：不可缩放、无柄', () => {
        const doc: Canvas = {
            width: 800,
            height: 600,
            layers: [tableLayer([rowLayer([cellLayer(textLayer())])])],
        }
        const contentPath = ['layers', 0, 'rows', 0, 'cells', 0, 'content'] as const
        expect(resizableAxesAt(doc, contentPath)).toEqual({ width: false, height: false })
        expect(resizeHandlesAt(doc, contentPath)).toEqual([])
    })

    it('模板格内容宽耦合高豁免：仅纵向（n/s 两柄）——template 段在 len−4 位', () => {
        const doc: Canvas = {
            width: 800,
            height: 600,
            layers: [tableLayer([], { template: rowTemplateLayer([cellLayer(textLayer())]) })],
        }
        const templateContentPath = ['layers', 0, 'template', 'cells', 0, 'content'] as const
        expect(resizableAxesAt(doc, templateContentPath)).toEqual({ width: false, height: true })
        expect(resizeHandlesAt(doc, templateContentPath)).toEqual(['n', 's'])
    })

    it('行模板替身路径：双轴皆禁、无柄', () => {
        const doc: Canvas = {
            width: 800,
            height: 600,
            layers: [tableLayer([], { template: rowTemplateLayer([cellLayer(null)]) })],
        }
        expect(resizableAxesAt(doc, ['layers', 0, 'template'])).toEqual({ width: false, height: false })
        expect(resizeHandlesAt(doc, ['layers', 0, 'template'])).toEqual([])
    })

    it('路径不可解析：无轴无柄', () => {
        const doc: Canvas = { width: 800, height: 600, layers: [imageLayer()] }
        expect(resizableAxesAt(doc, ['layers', 9])).toEqual({ width: false, height: false })
        expect(resizeHandlesAt(doc, ['layers', 9])).toEqual([])
    })
})

describe('resizeHandlePoint / resizeHandleAt：柄点位与命中（工单 07）', () => {
    const BOX = { x: 100, y: 80, width: 200, height: 120 }
    const ALL = [...RESIZE_HANDLES]

    it.each([
        ['nw', { x: 100, y: 80 }],
        ['n', { x: 200, y: 80 }],
        ['ne', { x: 300, y: 80 }],
        ['e', { x: 300, y: 140 }],
        ['se', { x: 300, y: 200 }],
        ['s', { x: 200, y: 200 }],
        ['sw', { x: 100, y: 200 }],
        ['w', { x: 100, y: 140 }],
    ] as const)('%s 在盒上的正确点位', (handle, point) => {
        expect(resizeHandlePoint(BOX, handle)).toEqual(point)
    })

    it('柄中心精确命中；命中半径内命中、半径外不命中（zoom=1 场景半径 = 6px）', () => {
        expect(resizeHandleAt(ALL, BOX, 300, 200, 1)).toBe('se')
        expect(resizeHandleAt(ALL, BOX, 100, 80, 1)).toBe('nw')
        // 距 se 柄 √(4²+4²)≈5.66（≤6）命中；距 7（>6）不命中
        expect(resizeHandleAt(ALL, BOX, 296, 196, 1)).toBe('se')
        expect(resizeHandleAt(ALL, BOX, 293, 200, 1)).toBeNull()
    })

    it('屏幕半径按 zoom 折算：zoom=2 时场景半径收紧到 3', () => {
        expect(resizeHandleAt(ALL, BOX, 298, 200, 2)).toBe('se') // 距 2 ≤ 3
        expect(resizeHandleAt(ALL, BOX, 295, 200, 2)).toBeNull() // 距 5 > 3
    })

    it('可用集合外的柄不命中（调用方传 resizeHandlesAt 投影）', () => {
        expect(resizeHandleAt(['n', 's'], BOX, 300, 200, 1)).toBeNull() // se 不可用
        expect(resizeHandleAt(['n', 's'], BOX, 200, 200, 1)).toBe('s')
    })

    it('极小盒柄重合：取 RESIZE_HANDLES 次序先者（角先于边中点）', () => {
        const tiny = { x: 100, y: 80, width: 2, height: 2 }
        expect(resizeHandleAt(ALL, tiny, 101, 81, 1)).toBe('nw')
    })
})
