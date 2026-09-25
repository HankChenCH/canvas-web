import { describe, expect, it, vi } from 'vitest'
import { applyPatches, type Draft } from 'immer'

import type { Canvas } from '@hankchen/canvas-next'

import { EditorStore } from '../src/store'
import { textLayer } from './support/fixtures'

const layerDoc = (): Canvas => ({
    width: 100,
    height: 80,
    layers: [textLayer({ position: { anchor: 'top-left', x: 10, y: 10 } })],
})

const moveX =
    (value: number) =>
    (draft: Draft<Canvas>) => {
        const layer = draft.layers[0]!
        layer.position.x = value
    }

/** 追加一个图层（结构变更：数组 push，patch path 带新下标） */
const appendLayer =
    (x: number) =>
    (draft: Draft<Canvas>) => {
        draft.layers.push(textLayer({ position: { anchor: 'top-left', x }, priority: 20 }))
    }

describe('双栈 undo/redo：事务→undo→redo→undo 循环恒等', () => {
    it('undo 恢复原文档，redo 复现变更，再 undo 再恢复（值与步数均循环恒等）', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())
        const original = structuredClone(store.doc)

        store.transact(moveX(40))
        store.undo()
        expect(store.doc).toEqual(original)
        expect(store.doc!.layers[0]!.position.x).toBe(10)

        store.redo()
        expect(store.doc!.layers[0]!.position.x).toBe(40)

        store.undo()
        expect(store.doc!.layers[0]!.position.x).toBe(10)
        expect(store.canUndo).toBe(false)
        expect(store.canRedo).toBe(true)
    })

    it('逆向 patch 依序应用可回原状（undo 本质 = applyPatches(inversePatches)）', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())
        store.transact(moveX(40))
        store.transact(moveX(70))

        let doc = store.doc!
        doc = applyPatches(doc, store.history[1]!.inversePatches)
        doc = applyPatches(doc, store.history[0]!.inversePatches)
        expect(doc.layers[0]!.position.x).toBe(10)
    })

    it('undo 通知沿用 transact 契约：patches = 本次生效变更（被撤销步的逆向组）', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())
        store.transact(moveX(40))
        const changes: unknown[] = []
        store.subscribe((c) => changes.push(c))

        store.undo()

        expect(changes).toEqual([
            {
                scope: 'doc',
                patches: [{ path: ['layers', 0, 'position', 'x'], op: 'replace', value: 10 }],
                inversePatches: [{ path: ['layers', 0, 'position', 'x'], op: 'replace', value: 40 }],
            },
        ])
    })

    it('结构变更（增图层）的 undo/redo 也恒等：数组下标 patch 依序回放', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())
        const beforeAppend = structuredClone(store.doc)

        store.transact(appendLayer(99))
        expect(store.doc!.layers).toHaveLength(2)

        store.transact(moveX(40)) // 改的是 layers[0]
        store.undo()
        store.undo()
        expect(store.doc).toEqual(beforeAppend)

        store.redo()
        store.redo()
        expect(store.doc!.layers).toHaveLength(2)
        expect(store.doc!.layers[0]!.position.x).toBe(40)
        expect(store.doc!.layers[1]!.position.x).toBe(99)
    })

    it('空栈 undo/redo 双向空转：文档不变、不通知', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())
        const before = store.doc
        const listener = vi.fn()
        store.subscribe(listener)

        store.undo()
        store.redo()

        expect(store.doc).toBe(before)
        expect(listener).not.toHaveBeenCalled()
        expect(store.canUndo).toBe(false)
        expect(store.canRedo).toBe(false)
    })
})

describe('mergeKey 与双栈的交互', () => {
    it('合并步一次 undo 整步撤销、一次 redo 整步重做', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())

        store.transact(moveX(20), { mergeKey: 'drag' })
        store.transact(moveX(30), { mergeKey: 'drag' })
        store.closeMerge('drag')

        store.undo()
        expect(store.doc!.layers[0]!.position.x).toBe(10)
        store.redo()
        expect(store.doc!.layers[0]!.position.x).toBe(30)
        expect(store.history).toHaveLength(1)
    })

    it('undo 打断合并会话：撤销后同键事务开新步（不并入已撤销步之前的步）', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())

        store.transact(moveX(20), { mergeKey: 'drag' })
        store.undo()
        store.transact(moveX(50), { mergeKey: 'drag' })

        expect(store.history).toHaveLength(1)
        expect(store.canRedo).toBe(false) // undo 后的新事务改写 redo 栈
        expect(store.doc!.layers[0]!.position.x).toBe(50)
    })

    it('redo 回来的步也不延续合并：同键后续事务另起一步', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())

        store.transact(moveX(20), { mergeKey: 'drag' })
        store.undo()
        store.redo()
        store.transact(moveX(30), { mergeKey: 'drag' })

        expect(store.history).toHaveLength(2)
    })
})

describe('100 步上限与 redo 栈改写（Figma 语义）', () => {
    it('超过 100 步丢弃最旧步：撤销到底恰好回到初始文档', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())

        for (let i = 1; i <= 101; i += 1) store.transact(moveX(10 + i))

        expect(store.history).toHaveLength(100)
        expect(store.history[0]!.patches).toEqual([
            { path: ['layers', 0, 'position', 'x'], op: 'replace', value: 12 },
        ])

        for (let i = 0; i < 100; i += 1) store.undo()
        // 最旧步已被丢弃：撤销到底回到被丢步之后的状态（初始值不可达，截断语义）
        expect(store.doc!.layers[0]!.position.x).toBe(11)
        expect(store.canUndo).toBe(false)
    })

    it('undo 后新事务改写 redo 栈：被弃分支不可再重做', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())

        store.transact(moveX(20))
        store.transact(moveX(30))
        store.undo()
        expect(store.canRedo).toBe(true)

        store.transact(moveX(50))
        expect(store.canRedo).toBe(false)
        store.redo() // 空转
        expect(store.doc!.layers[0]!.position.x).toBe(50)
    })

    it('多步深度往返：undo×2 → redo×2 精确回到最新态', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())

        store.transact(moveX(20))
        store.transact(moveX(30))
        store.transact(moveX(40))

        store.undo()
        store.undo()
        expect(store.doc!.layers[0]!.position.x).toBe(20)
        expect(store.history).toHaveLength(1)

        store.redo()
        store.redo()
        expect(store.doc!.layers[0]!.position.x).toBe(40)
        expect(store.canRedo).toBe(false)
        expect(store.history).toHaveLength(3)
    })
})

describe('ui 分支变更（选择/相机/悬停/拖动会话）不进历史', () => {
    it('ui setter 不产生历史步、不清 redo 栈（相机与选择可穿插撤销）', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())
        store.transact(moveX(40))

        store.setSelection(['layers', 0])
        store.setHovered(['layers', 0])
        store.setDrag({ path: ['layers', 0], startScene: { x: 0, y: 0 }, startPosition: { x: 0, y: 0 } })
        store.setViewport({ x: 10, y: 10, zoom: 2 })
        store.setSelection(null)

        expect(store.history).toHaveLength(1)
        store.undo()
        expect(store.canRedo).toBe(true)
        expect(store.doc!.layers[0]!.position.x).toBe(10)
    })
    // 物化状态不经 store（住 browser-renderer 的 Materializer，工单 04 决策），
    // 天然不产生历史步；store 侧能锁定的是 ui 分支 setter 全族不落历史。
})

describe('历史是可序列化 patch（协作的将来之路）', () => {
    it('一步事务的 patch 组 JSON 往返恒等（快照锁定形状）', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())

        store.transact(moveX(40))
        const step = store.history[0]!

        expect(JSON.parse(JSON.stringify(step.patches))).toEqual([
            { path: ['layers', 0, 'position', 'x'], op: 'replace', value: 40 },
        ])
        expect(JSON.parse(JSON.stringify(step.inversePatches))).toEqual([
            { path: ['layers', 0, 'position', 'x'], op: 'replace', value: 10 },
        ])
        expect(JSON.parse(JSON.stringify(step))).toEqual({
            mergeKey: null,
            patches: [{ path: ['layers', 0, 'position', 'x'], op: 'replace', value: 40 }],
            inversePatches: [{ path: ['layers', 0, 'position', 'x'], op: 'replace', value: 10 }],
        })
    })

    it('序列化后的逆向组在异地文档上回放仍可复原（patch 自足，不引用内存态）', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())
        store.transact(moveX(40), { mergeKey: 'drag' })
        store.transact(moveX(70), { mergeKey: 'drag' })

        const serialized = JSON.parse(JSON.stringify(store.history[0])) as {
            inversePatches: Parameters<typeof applyPatches>[1]
        }
        const restored = applyPatches(layerDoc(), serialized.inversePatches)
        expect(restored.layers[0]!.position.x).toBe(10)
    })
})

describe('openDocument 清空双栈（不跨会话）', () => {
    it('已有历史 + 已撤销步，打开新文档后双向栈全空', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())
        store.transact(moveX(40))
        store.undo()
        expect(store.canRedo).toBe(true)

        store.openDocument(layerDoc())
        expect(store.history).toHaveLength(0)
        expect(store.canUndo).toBe(false)
        expect(store.canRedo).toBe(false)
    })
})
