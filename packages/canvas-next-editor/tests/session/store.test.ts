import { describe, expect, it, vi } from 'vitest'

import type { Canvas } from '@hankchen/canvas-next'

import { EditorStore, type EditorChange } from '../../src/session/store'

const doc = (layers: Canvas['layers'] = []): Canvas => ({ width: 100, height: 80, layers })

describe('EditorStore 初始态', () => {
    it('未打开文档时 doc 为 null，视口为恒等相机', () => {
        const store = new EditorStore()
        expect(store.doc).toBeNull()
        expect(store.ui.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
    })
})

describe('doc 分支：整体替换（patch 事务管线见 transact.test.ts）', () => {
    it('openDocument 替换文档并以 {scope: doc}（空 patch 组）通知', () => {
        const store = new EditorStore()
        const changes: EditorChange[] = []
        store.subscribe((c) => changes.push(c))

        const document = doc()
        store.openDocument(document)
        expect(store.doc).toBe(document)
        expect(changes).toEqual([{ scope: 'doc', patches: [], inversePatches: [] }])
    })

    it('再次打开替换引用，旧文档对象不被改写', () => {
        const store = new EditorStore()
        const first = doc()
        store.openDocument(first)
        const replacement = doc()
        store.openDocument(replacement)
        expect(store.doc).toBe(replacement)
        expect(first).toEqual({ width: 100, height: 80, layers: [] })
    })
})

describe('ui 分支：viewport 整体替换、不进历史（ui 分支无历史语义）', () => {
    it('setViewport 替换并以 {scope: ui, branch: viewport} 通知', () => {
        const store = new EditorStore()
        const changes: EditorChange[] = []
        store.subscribe((c) => changes.push(c))

        store.setViewport({ x: 10, y: -20, zoom: 2 })
        expect(store.ui.viewport).toEqual({ x: 10, y: -20, zoom: 2 })
        expect(changes).toEqual([{ scope: 'ui', branch: 'viewport' }])
    })

    it('旧 ui 切片引用保持原值（整体替换语义，computed 引用短路依赖它）', () => {
        const store = new EditorStore()
        const stale = store.ui.viewport
        store.setViewport({ x: 5, y: 5, zoom: 3 })
        expect(stale).toEqual({ x: 0, y: 0, zoom: 1 })
    })
})

describe('订阅', () => {
    it('退订后不再通知', () => {
        const store = new EditorStore()
        const listener = vi.fn()
        const unsubscribe = store.subscribe(listener)
        unsubscribe()
        store.openDocument(doc())
        expect(listener).not.toHaveBeenCalled()
    })

    it('同一监听器只注册一次', () => {
        const store = new EditorStore()
        const listener = vi.fn()
        const unsubscribe = store.subscribe(listener)
        store.subscribe(listener)
        store.openDocument(doc())
        expect(listener).toHaveBeenCalledTimes(1)
        unsubscribe()
    })
})
