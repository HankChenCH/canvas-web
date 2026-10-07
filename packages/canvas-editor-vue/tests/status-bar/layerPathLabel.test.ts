/**
 * formatLayerPath 单测（工单 14 状态栏）：路径 → 展示串的逐段投影。
 */
import { describe, expect, it } from 'vitest'

import { formatLayerPath } from '../../src/status-bar/layerPathLabel'

describe('formatLayerPath：路径展示格式化', () => {
    it('根层', () => {
        expect(formatLayerPath(['layers', 0])).toBe('图层 0')
        expect(formatLayerPath(['layers', 12])).toBe('图层 12')
    })

    it('表格嵌套：行/格/格内容逐段拼接', () => {
        expect(formatLayerPath(['layers', 1, 'rows', 0])).toBe('图层 1 · 行 0')
        expect(formatLayerPath(['layers', 1, 'rows', 2, 'cells', 3])).toBe('图层 1 · 行 2 · 格 3')
        expect(formatLayerPath(['layers', 1, 'rows', 2, 'cells', 3, 'content'])).toBe(
            '图层 1 · 行 2 · 格 3 · 格内容',
        )
    })

    it('模板子树（spec §2.2）：template 段无下标 → 行模板；替身收尾即止', () => {
        expect(formatLayerPath(['layers', 8, 'template'])).toBe('图层 8 · 行模板')
        expect(formatLayerPath(['layers', 8, 'template', 'cells', 0])).toBe('图层 8 · 行模板 · 格 0')
        expect(formatLayerPath(['layers', 8, 'template', 'cells', 0, 'content'])).toBe('图层 8 · 行模板 · 格 0 · 格内容')
    })
})
