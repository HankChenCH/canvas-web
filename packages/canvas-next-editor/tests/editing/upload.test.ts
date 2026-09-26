import { describe, expect, it, vi } from 'vitest'

import { decodeGraph } from '@hankchen/canvas-next'

import { EditorSession } from '../../src/session/editor'
import { FontCatalog, type FontCatalogEntry } from '../../src/editing/fontCatalog'
import type { UploadFile } from '../../src/editing/upload'

const file = (name: string, mime = 'image/png'): UploadFile => ({
    name,
    mime,
    bytes: new Uint8Array([1, 2, 3]),
})

/** 同步完成的桩调度器（Node 无 DOM 环境的 EditorSession 组装） */
const syncScheduler = (callback: () => void) => {
    callback()
    return () => {}
}

const sessionWith = (options: Partial<ConstructorParameters<typeof EditorSession>[0]> = {}) =>
    new EditorSession({ scheduleFrame: syncScheduler, ...options })

describe('FontCatalog：内置清单可配置 + 自定义追加（清单 ≠ 物化，core 不做加载）', () => {
    it('缺省构造为空清单（宿主未配置时无内置 URL）', () => {
        const catalog = new FontCatalog()
        expect(catalog.entries).toEqual([])
    })

    it('构造入参即内置清单（URL 列表可配置），原样保留 label/ref', () => {
        const builtin: readonly FontCatalogEntry[] = [
            { label: 'Open Sans', ref: '/fonts/open-sans.ttf' },
        ]
        const catalog = new FontCatalog(builtin)
        expect(catalog.entries).toEqual(builtin)
    })

    it('addCustom 追加到清单尾并通知订阅者（上传后可选可用）', () => {
        const catalog = new FontCatalog([{ label: 'Open Sans', ref: '/fonts/open-sans.ttf' }])
        const changes: Array<readonly FontCatalogEntry[]> = []
        catalog.subscribe((entries) => changes.push(entries))

        catalog.addCustom({ label: 'My Font', ref: 'data:font/ttf;base64,AAA' })
        expect(catalog.entries).toHaveLength(2)
        expect(catalog.entries[1]).toEqual({ label: 'My Font', ref: 'data:font/ttf;base64,AAA' })
        expect(changes).toHaveLength(1)
    })

    it('同 ref 重复上传去重（只追加一次），未追加时不通知', () => {
        const catalog = new FontCatalog()
        const listener = vi.fn()
        catalog.subscribe(listener)

        catalog.addCustom({ label: 'A', ref: 'data:font/ttf;base64,AAA' })
        catalog.addCustom({ label: 'B', ref: 'data:font/ttf;base64,AAA' })
        expect(catalog.entries).toEqual([{ label: 'A', ref: 'data:font/ttf;base64,AAA' }])
        expect(listener).toHaveBeenCalledTimes(1)
    })
})

describe('uploadHandler 注入点：core 不内置上传实现', () => {
    it('未注入时 canUpload 为 false，上传动作拒绝且文档不变（降级语义明确）', async () => {
        const editor = sessionWith()
        editor.openDocument(decodeGraph({ canvas: { width: 100, height: 80 }, layers: [] }))
        expect(editor.canUpload).toBe(false)
        await expect(editor.uploadImageAsLayer(file('a.png'))).rejects.toThrow(/uploadHandler/)
        await expect(editor.uploadFont(file('a.ttf', 'font/ttf'))).rejects.toThrow(/uploadHandler/)
        expect(editor.store.doc?.layers).toHaveLength(0)
        expect(editor.canUndo).toBe(false)
    })

    it('注入后本机图片经 handler 得到可物化引用 → 新增图片层 + 写 src + 选中，一步历史', async () => {
        const handler = vi.fn(async () => 'https://cdn.example.com/a.png')
        const editor = sessionWith({ uploadHandler: handler })
        editor.openDocument(decodeGraph({ canvas: { width: 100, height: 80 }, layers: [] }))

        const path = await editor.uploadImageAsLayer(file('poster.png'))
        expect(handler).toHaveBeenCalledWith(file('poster.png'))
        expect(path).toEqual(['layers', 0])

        const doc = editor.store.doc!
        expect(doc.layers).toHaveLength(1)
        const layer = doc.layers[0]!
        expect(layer.type).toBe('ImageLayer')
        expect(layer.type === 'ImageLayer' && layer.src).toBe('https://cdn.example.com/a.png')
        expect(editor.store.ui.selection).toEqual(['layers', 0])
        // 上传→建层→写引用一次调用 = 一步历史（撤销一次回到无图层）
        expect(editor.canUndo).toBe(true)
        editor.undo()
        expect(editor.store.doc?.layers).toHaveLength(0)
    })

    it('文档未打开时上传动作不调 handler（字节不离开本机，无副作用）', async () => {
        const handler = vi.fn(async () => 'https://cdn.example.com/a.png')
        const editor = sessionWith({ uploadHandler: handler })
        expect(editor.canUpload).toBe(true)
        await expect(editor.uploadImageAsLayer(file('a.png'))).resolves.toBeNull()
        expect(handler).not.toHaveBeenCalled()
    })

    it('上传字体：handler 引用进字体清单（自定义条目），不写文档', async () => {
        const editor = sessionWith({
            uploadHandler: async () => 'data:font/ttf;base64,BBB',
            fontCatalog: [{ label: 'Open Sans', ref: '/fonts/open-sans.ttf' }],
        })
        editor.openDocument(decodeGraph({ canvas: { width: 100, height: 80 }, layers: [] }))

        const ref = await editor.uploadFont(file('brand.ttf', 'font/ttf'))
        expect(ref).toBe('data:font/ttf;base64,BBB')
        expect(editor.fontCatalog.entries).toHaveLength(2)
        expect(editor.fontCatalog.entries[1]?.ref).toBe('data:font/ttf;base64,BBB')
        // 字体清单 ≠ 文档：无历史步
        expect(editor.canUndo).toBe(false)
    })

    it('handler 失败时动作拒绝、文档不变', async () => {
        const editor = sessionWith({
            uploadHandler: async () => {
                throw new Error('存储不可用')
            },
        })
        editor.openDocument(decodeGraph({ canvas: { width: 100, height: 80 }, layers: [] }))
        await expect(editor.uploadImageAsLayer(file('a.png'))).rejects.toThrow('存储不可用')
        expect(editor.store.doc?.layers).toHaveLength(0)
        expect(editor.canUndo).toBe(false)
    })
})
