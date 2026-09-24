import { describe, expect, it } from 'vitest'

import { PACKAGE_NAME } from '../src/index'

describe('包出口冒烟', () => {
    it('入口可导入（headless：无 DOM 环境）', () => {
        expect(PACKAGE_NAME).toBe('@hankchen/canvas-next-editor')
        const host = globalThis as unknown as Record<string, unknown>
        expect(host.document).toBeUndefined()
    })
})
