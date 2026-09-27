/**
 * 简写模式纯函数测试（layer-panel-ux 工单 04）：Node 无 DOM 环境——模式推导、
 * 收缩写回规整、循环次序、null 语义。只断言外显行为（推导结果与规整产物）。
 */
import { describe, expect, it } from 'vitest'

import type { Border, Padding } from '@hankchen/canvas-next-editor'

import {
    deriveBorderMode,
    derivePaddingMode,
    nextShorthandMode,
    sameBorder,
    samePadding,
    shrinkBorder,
    shrinkPadding,
} from '../../src/property-panel/shorthand'

const padding = (top: number, bottom: number, left: number, right: number): Padding => ({
    top,
    bottom,
    left,
    right,
})
const side = (width: number, color: string) => ({ width, color })
const border = (
    top: ReturnType<typeof side> | null,
    bottom: ReturnType<typeof side> | null,
    left: ReturnType<typeof side> | null,
    right: ReturnType<typeof side> | null,
): Border => ({ top, bottom, left, right })

describe('nextShorthandMode（循环 1→2→4→1）', () => {
    it('1→2、2→4、4→1', () => {
        expect(nextShorthandMode(1)).toBe(2)
        expect(nextShorthandMode(2)).toBe(4)
        expect(nextShorthandMode(4)).toBe(1)
    })
})

describe('derivePaddingMode（四值全等→1；上===下 且 左===右→2；否则→4）', () => {
    it('四值全等 → 1（含 0 与浮点）', () => {
        expect(derivePaddingMode(padding(8, 8, 8, 8))).toBe(1)
        expect(derivePaddingMode(padding(0, 0, 0, 0))).toBe(1)
        expect(derivePaddingMode(padding(1.5, 1.5, 1.5, 1.5))).toBe(1)
    })

    it('上下等且左右等但不全等 → 2', () => {
        expect(derivePaddingMode(padding(8, 8, 4, 4))).toBe(2)
        expect(derivePaddingMode(padding(0, 0, 12, 12))).toBe(2)
    })

    it('上下不等左右等 → 4', () => {
        expect(derivePaddingMode(padding(8, 9, 4, 4))).toBe(4)
    })

    it('上下等左右不等 → 4', () => {
        expect(derivePaddingMode(padding(8, 8, 3, 4))).toBe(4)
    })

    it('全不等 → 4', () => {
        expect(derivePaddingMode(padding(8, 9, 3, 7))).toBe(4)
    })
})

describe('shrinkPadding（收缩取代表值 上/左 写回规整）', () => {
    it('收缩到 1：四边全取上', () => {
        expect(shrinkPadding(padding(8, 3, 5, 7), 1)).toEqual(padding(8, 8, 8, 8))
    })

    it('收缩到 2：上下取上、左右取左', () => {
        expect(shrinkPadding(padding(8, 3, 5, 7), 2)).toEqual(padding(8, 8, 5, 5))
    })

    it('收缩到 4：无规整动作（原值原样）', () => {
        const value = padding(8, 3, 5, 7)
        expect(shrinkPadding(value, 4)).toEqual(value)
    })

    it('已规整的数据收缩后值不变', () => {
        expect(shrinkPadding(padding(8, 8, 4, 4), 2)).toEqual(padding(8, 8, 4, 4))
        expect(shrinkPadding(padding(8, 8, 8, 8), 1)).toEqual(padding(8, 8, 8, 8))
    })
})

describe('samePadding', () => {
    it('四边逐值相等为真，任一不等为假', () => {
        expect(samePadding(padding(8, 8, 4, 4), padding(8, 8, 4, 4))).toBe(true)
        expect(samePadding(padding(8, 8, 4, 4), padding(8, 8, 4, 5))).toBe(false)
        expect(samePadding(padding(8, 8, 4, 4), padding(4, 8, 4, 4))).toBe(false)
    })
})

describe('deriveBorderMode（四边全 null 或全等→1；上下等且左右等（含 null）→2；否则→4）', () => {
    it('四边全 null → 1（无边框）', () => {
        expect(deriveBorderMode(border(null, null, null, null))).toBe(1)
    })

    it('四边全等（宽+色）→ 1', () => {
        expect(deriveBorderMode(border(side(2, '#334155'), side(2, '#334155'), side(2, '#334155'), side(2, '#334155')))).toBe(1)
    })

    it('部分 null 且不成对 → 4', () => {
        expect(deriveBorderMode(border(side(2, '#000000'), null, null, null))).toBe(4)
        expect(deriveBorderMode(border(null, side(2, '#000000'), null, side(1, '#000000')))).toBe(4)
    })

    it('上下等且左右全 null → 2', () => {
        expect(deriveBorderMode(border(side(2, '#e2e8f0'), side(2, '#e2e8f0'), null, null))).toBe(2)
    })

    it('上下全 null 且左右等 → 2', () => {
        expect(deriveBorderMode(border(null, null, side(6, '#0ea5e9'), side(6, '#0ea5e9')))).toBe(2)
    })

    it('上下等且左右等（非 null）→ 2', () => {
        expect(
            deriveBorderMode(border(side(1, '#a'), side(1, '#a'), side(2, '#b'), side(2, '#b'))),
        ).toBe(2)
    })

    it('宽等色不等 → 不算等 → 4', () => {
        expect(deriveBorderMode(border(side(2, '#a'), side(2, '#b'), null, null))).toBe(4)
    })

    it('上下不等左右等 → 4', () => {
        expect(deriveBorderMode(border(side(2, '#a'), side(3, '#a'), side(1, '#b'), side(1, '#b')))).toBe(4)
    })
})

describe('shrinkBorder（收缩取代表值 上/左；上为 null 收缩到 1 即全 null）', () => {
    it('收缩到 1：四边全取上（宽+色）', () => {
        expect(shrinkBorder(border(side(3, '#112233'), side(1, '#000000'), side(2, '#ffffff'), side(5, '#abcdef')), 1)).toEqual(
            border(side(3, '#112233'), side(3, '#112233'), side(3, '#112233'), side(3, '#112233')),
        )
    })

    it('收缩到 1 且上为 null：全 null（无边框）', () => {
        expect(shrinkBorder(border(null, side(2, '#000000'), side(6, '#0ea5e9'), null), 1)).toEqual(
            border(null, null, null, null),
        )
    })

    it('收缩到 2：上下取上、左右取左（null 参与代表值）', () => {
        expect(shrinkBorder(border(null, side(2, '#000000'), side(6, '#0ea5e9'), side(1, '#fff')), 2)).toEqual(
            border(null, null, side(6, '#0ea5e9'), side(6, '#0ea5e9')),
        )
    })

    it('收缩到 4：无规整动作（原值原样）', () => {
        const value = border(side(3, '#112233'), null, side(2, '#ffffff'), null)
        expect(shrinkBorder(value, 4)).toEqual(value)
    })
})

describe('sameBorder（null 相等比较）', () => {
    it('双双 null 相等；null 与非 null 不等', () => {
        expect(sameBorder(border(null, null, null, null), border(null, null, null, null))).toBe(true)
        expect(sameBorder(border(side(1, '#a'), null, null, null), border(null, null, null, null))).toBe(false)
    })

    it('非 null 边逐字段（宽+色）比较', () => {
        expect(
            sameBorder(
                border(side(2, '#a'), side(2, '#a'), null, null),
                border(side(2, '#a'), side(2, '#a'), null, null),
            ),
        ).toBe(true)
        expect(
            sameBorder(
                border(side(2, '#a'), side(2, '#a'), null, null),
                border(side(3, '#a'), side(2, '#a'), null, null),
            ),
        ).toBe(false)
        expect(
            sameBorder(
                border(side(2, '#a'), side(2, '#a'), null, null),
                border(side(2, '#b'), side(2, '#a'), null, null),
            ),
        ).toBe(false)
    })
})
