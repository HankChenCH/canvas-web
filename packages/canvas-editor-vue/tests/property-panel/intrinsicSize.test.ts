import { describe, expect, it } from 'vitest'

import { aspectRatioLabel, intrinsicSizeLabel } from '../../src/property-panel/fields/intrinsicSize'

describe('源图内在尺寸读数（image-fit 工单 05 搭车项，ADR 0023）', () => {
    it('aspectRatioLabel：整数比约化（两侧 ≤32），竖图保方向', () => {
        expect(aspectRatioLabel(1920, 1080)).toBe('16:9')
        expect(aspectRatioLabel(1080, 1920)).toBe('9:16')
        expect(aspectRatioLabel(800, 600)).toBe('4:3')
        expect(aspectRatioLabel(300, 200)).toBe('3:2')
        expect(aspectRatioLabel(21, 21)).toBe('1:1')
        expect(aspectRatioLabel(100, 4)).toBe('25:1')
    })

    it('aspectRatioLabel：约化后过大退两位小数比（奇形尺寸不再产出冗长整数比）', () => {
        expect(aspectRatioLabel(640, 361)).toBe('1.77:1')
        expect(aspectRatioLabel(361, 640)).toBe('0.56:1')
    })

    it('intrinsicSizeLabel：像素 + 宽高比一行；非法尺寸（≤0/非有限值）返回 null（不渲染读数）', () => {
        expect(intrinsicSizeLabel(1920, 1080)).toBe('1920×1080 · 16:9')
        expect(intrinsicSizeLabel(800, 600)).toBe('800×600 · 4:3')
        expect(intrinsicSizeLabel(0, 100)).toBeNull()
        expect(intrinsicSizeLabel(100, -1)).toBeNull()
        expect(intrinsicSizeLabel(Number.NaN, 100)).toBeNull()
    })
})
