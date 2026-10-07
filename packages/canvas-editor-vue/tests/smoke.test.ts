import { describe, expect, it } from 'vitest'

import { PACKAGE_NAME } from '../src/index'

describe('包出口冒烟', () => {
    it('入口可导入', () => {
        expect(PACKAGE_NAME).toBe('@hankchen/canvas-editor-vue')
    })
})
