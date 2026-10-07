import { describe, expect, it } from 'vitest'

import type { ImageLayer, Layer } from '@hankchen/canvas'

import { isImageContentUndrawn, type ResourceStatusMap } from '../../src/shared/resourceStatus'

const imageLayer = (overrides: Partial<ImageLayer> = {}): ImageLayer => ({
    type: 'ImageLayer',
    name: '',
    visible: true,
    priority: 10,
    shape: {
        width: 200,
        height: 140,
        autoWidth: false,
        autoHeight: false,
        lineHeight: 1.2,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        border: { top: null, bottom: null, left: null, right: null },
        backgroundColor: null,
    },
    align: { horizontal: 'left', vertical: 'top' } as const,
    position: { anchor: 'top-left', x: 0, y: 0 } as const,
    src: 'assets/logo.png',
    expression: null,
    ...overrides,
})

describe('isImageContentUndrawn：占位态图片层判定（placeholder-padding-hint 工单 02）', () => {
    it('① 表达式标记图片：设计态预览 src 置 null（占位盒语义），无论资源态如何都命中', () => {
        // 文档里标记层 src 恒镜像表达式原文（updateDataExpression 同门），预览视图才置空
        const layer = imageLayer({ src: '{{org.logo}}', expression: '{{org.logo}}' })
        const statuses: ResourceStatusMap = { '{{org.logo}}': 'failed' }
        expect(isImageContentUndrawn(layer, statuses)).toBe(true)
        expect(isImageContentUndrawn(layer, {})).toBe(true)
    })

    it('② 静态空引用（src null）：render 只画盒（未物化/未加载占位语义同族），命中', () => {
        expect(isImageContentUndrawn(imageLayer({ src: null }))).toBe(true)
    })

    it('② 物化未达 done（pending/failed）命中；done 与无记录不命中（不可知不假报）', () => {
        const layer = imageLayer()
        expect(isImageContentUndrawn(layer, { 'assets/logo.png': 'pending' })).toBe(true)
        expect(isImageContentUndrawn(layer, { 'assets/logo.png': 'failed' })).toBe(true)
        expect(isImageContentUndrawn(layer, { 'assets/logo.png': 'done' })).toBe(false)
        // 宿主未桥接/尚未调度：无记录 = 不可知，不提示（静态可加载层不误报的依据）
        expect(isImageContentUndrawn(layer, {})).toBe(false)
        expect(isImageContentUndrawn(layer)).toBe(false)
    })

    it('③ 解码清零的自适应尺寸（声明宽/高 0）：内容盒 ≤ 0，后端恒跳过 drawImage，命中', () => {
        expect(
            isImageContentUndrawn(imageLayer({ shape: { width: 0, height: 140, autoWidth: true, autoHeight: false, lineHeight: 1.2, padding: { top: 0, bottom: 0, left: 0, right: 0 }, border: { top: null, bottom: null, left: null, right: null }, backgroundColor: null } })),
        ).toBe(true)
        expect(
            isImageContentUndrawn(imageLayer({ shape: { width: 200, height: 0, autoWidth: false, autoHeight: true, lineHeight: 1.2, padding: { top: 0, bottom: 0, left: 0, right: 0 }, border: { top: null, bottom: null, left: null, right: null }, backgroundColor: null } })),
        ).toBe(true)
    })

    it('③ 极端 padding 内缩至内容盒 ≤ 0 同样命中（drawImage 被后端 ≤0 防护跳过）', () => {
        const layer = imageLayer({
            shape: {
                width: 100,
                height: 100,
                autoWidth: false,
                autoHeight: false,
                lineHeight: 1.2,
                padding: { top: 60, bottom: 60, left: 60, right: 60 },
                border: { top: null, bottom: null, left: null, right: null },
                backgroundColor: null,
            },
        })
        expect(isImageContentUndrawn(layer, { 'assets/logo.png': 'done' })).toBe(true)
    })

    it('静态可加载图片层不命中（done + 声明尺寸 + 内容盒 > 0）——验收反例', () => {
        const layer = imageLayer()
        expect(isImageContentUndrawn(layer, { 'assets/logo.png': 'done' })).toBe(false)
    })

    it('非图片层恒不命中（提示面只属于占位态图片层；QR 占位不在本工单范围）', () => {
        const base = imageLayer()
        const text: Layer = {
            type: 'TextLayer',
            name: '',
            visible: true,
            priority: 10,
            shape: base.shape,
            align: base.align,
            position: base.position,
            text: '文',
            expression: null,
            font: '',
            fontSize: 16,
            fontColor: '#000000',
            angle: 0,
            autowrap: false,
        }
        const qr: Layer = {
            type: 'QrCodeLayer',
            name: '',
            visible: true,
            priority: 10,
            shape: base.shape,
            align: base.align,
            position: base.position,
            value: '',
            expression: null,
        }
        expect(isImageContentUndrawn(text)).toBe(false)
        expect(isImageContentUndrawn(qr)).toBe(false)
    })
})
