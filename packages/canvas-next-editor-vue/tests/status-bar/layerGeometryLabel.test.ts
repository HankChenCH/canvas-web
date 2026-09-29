/**
 * formatLayerGeometry 单测（playground-canvas-first 工单 01 状态栏坐标尺寸段）：
 * position + 解析盒 → 展示串的投影（取整 / 锚点徽标 / × 拼接）。
 */
import { describe, expect, it } from 'vitest'

import { formatLayerGeometry } from '../../src/status-bar/layerGeometryLabel'

describe('formatLayerGeometry：坐标尺寸展示格式化', () => {
    it('整数 position 与盒：x/y · 宽×高 · 锚点 徽标', () => {
        expect(
            formatLayerGeometry(
                { x: 1240, y: 260, anchor: 'top-left' },
                { width: 900, height: 140 },
            ),
        ).toBe('x=1240 y=260 · 900×140 · 左上锚')
    })

    it('浮点取整：拖动中场景位移的四舍五入', () => {
        expect(
            formatLayerGeometry(
                { x: 758.3946, y: 548.9632, anchor: 'bottom-right' },
                { width: 99.6, height: 50.2 },
            ),
        ).toBe('x=758 y=549 · 100×50 · 右下锚')
    })

    it('九宫锚点徽标逐格齐备', () => {
        const cases = [
            ['top-left', '左上'],
            ['top', '中上'],
            ['top-right', '右上'],
            ['left', '左中'],
            ['center', '正中'],
            ['right', '右中'],
            ['bottom-left', '左下'],
            ['bottom', '中下'],
            ['bottom-right', '右下'],
        ] as const
        for (const [anchor, label] of cases) {
            expect(formatLayerGeometry({ x: 0, y: 0, anchor }, { width: 10, height: 10 })).toBe(
                `x=0 y=0 · 10×10 · ${label}锚`,
            )
        }
    })
})
