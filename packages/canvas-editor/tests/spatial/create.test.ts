/**
 * 画拉橡皮筋求位纯函数（drag-create 工单 01，spatial/create）：
 * - 两点正规化：x = min、width = |dx|（y 同），反向拖不翻转；
 * - QrCodeLayer 钳 height := width（高随宽从动，八柄缩放 QR 同门）；
 * - 左右/上下缘各两点进 resolveSnapPoints（吸附数学零新增），修正并入几何；
 * - 死区常量：屏幕 px，场景阈值 = 阈值 / zoom（SNAP_THRESHOLD_SCREEN_PX 口径）。
 */
import { describe, expect, it } from 'vitest'

import { CREATE_DEAD_ZONE_SCREEN_PX, createRubberBandRect } from '../../src/spatial/create'
import type { SnapAxis } from '../../src/spatial/snap'

const NO_AXES: readonly SnapAxis[] = []

describe('createRubberBandRect：两点正规化', () => {
    it('右下拖：x = min、width = |dx|（y 同）', () => {
        const result = createRubberBandRect('TextLayer', { x: 100, y: 100 }, { x: 220, y: 190 }, NO_AXES, 6)
        expect(result.rect).toEqual({ x: 100, y: 100, width: 120, height: 90 })
    })

    it('反向拖（右下往左上）：矩形不翻转', () => {
        const result = createRubberBandRect('TextLayer', { x: 220, y: 190 }, { x: 100, y: 100 }, NO_AXES, 6)
        expect(result.rect).toEqual({ x: 100, y: 100, width: 120, height: 90 })
    })
})

describe('createRubberBandRect：QR 从动钳方', () => {
    it('QrCodeLayer：height := width（拖拽以横向为主也恒方）', () => {
        const result = createRubberBandRect('QrCodeLayer', { x: 100, y: 100 }, { x: 180, y: 140 }, NO_AXES, 6)
        expect(result.rect).toEqual({ x: 100, y: 100, width: 80, height: 80 })
    })

    it('反向拖的 QR 同样钳方', () => {
        const result = createRubberBandRect('QrCodeLayer', { x: 180, y: 140 }, { x: 100, y: 100 }, NO_AXES, 6)
        expect(result.rect).toEqual({ x: 100, y: 100, width: 80, height: 80 })
    })

    it('其余层型不钳方：height = |dy| 原样', () => {
        const result = createRubberBandRect('ImageLayer', { x: 0, y: 0 }, { x: 80, y: 140 }, NO_AXES, 6)
        expect(result.rect).toMatchObject({ width: 80, height: 140 })
    })
})

describe('createRubberBandRect：吸附修正并入几何', () => {
    /** 吸附源轴：层右缘 200（vertical）+ 层底缘 150（horizontal） */
    const AXES: readonly SnapAxis[] = [
        { orientation: 'vertical', position: 200, source: 'layer' },
        { orientation: 'horizontal', position: 150, source: 'layer' },
    ]

    it('左缘距轴阈值内：整矩形平移修正、边落轴上，命中轴回显', () => {
        // 左缘 196 距轴 200 为 4 ≤ 6 → dx = +4；上缘 320 距 150 远 → dy = 0
        const result = createRubberBandRect('TextLayer', { x: 196, y: 320 }, { x: 240, y: 380 }, AXES, 6)
        expect(result.rect).toEqual({ x: 200, y: 320, width: 44, height: 60 })
        expect(result.axes).toEqual([{ orientation: 'vertical', position: 200, source: 'layer' }])
    })

    it('QR 钳方先于吸附：底缘按钳方后的方边参与求位', () => {
        // 钳方后底缘 = 100 + 80 = 180，距轴 150 为 30 阈值外；上缘 100 距 150 为 50 同样阈外 → 不吸
        const result = createRubberBandRect('QrCodeLayer', { x: 100, y: 100 }, { x: 180, y: 140 }, AXES, 6)
        expect(result.rect).toEqual({ x: 100, y: 100, width: 80, height: 80 })
        expect(result.axes).toEqual([])
    })

    it('双轴同时命中：修正各自并入对应分量', () => {
        // 左缘 197 距 200 为 3、上缘 147 距 150 为 3 → 双轴修正
        const result = createRubberBandRect('TextLayer', { x: 197, y: 147 }, { x: 260, y: 220 }, AXES, 6)
        expect(result.rect).toEqual({ x: 200, y: 150, width: 63, height: 73 })
        expect(result.axes).toEqual(AXES)
    })

    it('全部缘阈外：几何原样、无命中轴', () => {
        const result = createRubberBandRect('TextLayer', { x: 400, y: 400 }, { x: 500, y: 500 }, AXES, 6)
        expect(result.rect).toEqual({ x: 400, y: 400, width: 100, height: 100 })
        expect(result.axes).toEqual([])
    })
})

describe('CREATE_DEAD_ZONE_SCREEN_PX', () => {
    it('死区常量为屏幕 css 像素口径（与拖动吸附阈值同族）', () => {
        expect(CREATE_DEAD_ZONE_SCREEN_PX).toBe(4)
    })
})
