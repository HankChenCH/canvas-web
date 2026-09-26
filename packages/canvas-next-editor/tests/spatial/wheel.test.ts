import { describe, expect, it } from 'vitest'

import { classifyWheel, type WheelInput } from '../../src/spatial/wheel'

const input = (overrides: Partial<WheelInput> = {}): WheelInput => ({
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
})

describe('wheel 三态分类（ctrl/双指=缩放、plain=平移、shift=横移）', () => {
    it('plain 滚轮 → 平移', () => {
        expect(classifyWheel(input())).toBe('pan')
    })

    it('ctrl/cmd + wheel → 缩放（触控板捏合在浏览器恒派 ctrl+wheel，不串台）', () => {
        expect(classifyWheel(input({ ctrlKey: true }))).toBe('zoom')
        expect(classifyWheel(input({ metaKey: true }))).toBe('zoom')
    })

    it('shift + wheel → 横向平移', () => {
        expect(classifyWheel(input({ shiftKey: true }))).toBe('pan-x')
    })

    it('缩放优先于 shift（ctrl+shift+wheel 仍为缩放）', () => {
        expect(classifyWheel(input({ ctrlKey: true, shiftKey: true }))).toBe('zoom')
        expect(classifyWheel(input({ metaKey: true, shiftKey: true }))).toBe('zoom')
    })
})
