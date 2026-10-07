/**
 * 八柄光标映射（工单 07）：八柄全覆盖、对角同轴同向。
 * 柄点位/命中测试在内核（tests/spatial/resize.test.ts），此处只测呈现数据。
 */
import { describe, expect, it } from 'vitest'

import { RESIZE_HANDLES } from '@hankchen/canvas-editor'

import { RESIZE_HANDLE_CURSORS } from '../../src/canvas/resizeHandles'

describe('RESIZE_HANDLE_CURSORS：光标映射', () => {
    it('八柄全覆盖且对角同轴同向', () => {
        expect(Object.keys(RESIZE_HANDLE_CURSORS).sort()).toEqual([...RESIZE_HANDLES].sort())
        expect(RESIZE_HANDLE_CURSORS.nw).toBe(RESIZE_HANDLE_CURSORS.se)
        expect(RESIZE_HANDLE_CURSORS.ne).toBe(RESIZE_HANDLE_CURSORS.sw)
        expect(RESIZE_HANDLE_CURSORS.n).toBe(RESIZE_HANDLE_CURSORS.s)
        expect(RESIZE_HANDLE_CURSORS.e).toBe(RESIZE_HANDLE_CURSORS.w)
        expect(RESIZE_HANDLE_CURSORS.se).toBe('nwse-resize')
        expect(RESIZE_HANDLE_CURSORS.n).toBe('ns-resize')
    })
})
