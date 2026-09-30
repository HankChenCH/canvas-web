import { describe, expect, it, vi } from 'vitest'
import { applyPatches, type Draft } from 'immer'

import type { Canvas } from '@hankchen/canvas-next'

import type { HistoryStep } from '../../src/session/store'
import { EditorStore } from '../../src/session/store'
import { textLayer } from '../support/fixtures'

const layerDoc = (): Canvas => ({
    width: 100,
    height: 80,
    layers: [textLayer({ position: { anchor: 'top-left', x: 10, y: 10 } })],
})

const moveX = (value: number) => (draft: Draft<Canvas>) => {
    const layer = draft.layers[0]!
    layer.position.x = value
}

describe('transact：文档分支唯一写入口（immer 产物浅替换 + patch 广播）', () => {
    it('变更生效，通知携带正向/逆向 patch，patch path 前缀 = 图层路径', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())
        const changes: unknown[] = []
        store.subscribe((c) => changes.push(c))
        changes.length = 0

        store.transact(moveX(40))

        expect(store.doc!.layers[0]!.position.x).toBe(40)
        expect(changes).toEqual([
            {
                scope: 'doc',
                patches: [{ path: ['layers', 0, 'position', 'x'], op: 'replace', value: 40 }],
                inversePatches: [{ path: ['layers', 0, 'position', 'x'], op: 'replace', value: 10 }],
            },
        ])
    })

    it('逆向 patch 依序应用可回原状（patch 即可序列化历史的一等公民）', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())
        store.transact(moveX(40))

        const restored = applyPatches(store.doc!, store.history[0]!.inversePatches)
        expect(restored.layers[0]!.position.x).toBe(10)
    })

    it('无变化的变更：不进历史、不通知、doc 引用不变', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())
        const before = store.doc
        const listener = vi.fn()
        store.subscribe(listener)

        store.transact(moveX(10))

        expect(store.history).toHaveLength(0)
        expect(store.doc).toBe(before)
        expect(listener).not.toHaveBeenCalled()
    })

    it('未打开文档时 transact 空转', () => {
        const store = new EditorStore()
        expect(() => store.transact(moveX(1))).not.toThrow()
        expect(store.history).toHaveLength(0)
    })
})

describe('mergeKey 事务合并：同键连续变更合并为一步历史', () => {
    it('同键两次 transact 合并为一步，正向 patch 依序拼接、逆向逆序拼接', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())

        store.transact(moveX(20), { mergeKey: 'drag' })
        store.transact(moveX(30), { mergeKey: 'drag' })

        expect(store.history).toHaveLength(1)
        const step: HistoryStep = store.history[0]!
        expect(step.mergeKey).toBe('drag')
        expect(step.patches).toHaveLength(2)
        expect(step.patches.map((p) => (p as { value: number }).value)).toEqual([20, 30])
        // 逆向：先撤销后一次（30→20），再撤销前一次（20→10）
        expect(step.inversePatches.map((p) => (p as { value: number }).value)).toEqual([20, 10])

        const restored = applyPatches(store.doc!, step.inversePatches)
        expect(restored.layers[0]!.position.x).toBe(10)
    })

    it('不同键开启新步骤；closeMerge 键匹配才闭合，同键后续事务开新步', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())

        store.transact(moveX(20), { mergeKey: 'drag' })
        store.transact(moveX(30), { mergeKey: 'drag' })
        store.closeMerge('drag') // 拖动 pointerup 闭合
        store.transact(moveX(40), { mergeKey: 'resize' })
        expect(store.history).toHaveLength(2)
        expect(store.history.map((s) => s.mergeKey)).toEqual([null, 'resize'])

        // 第二次拖动与第一次同键，但第一步已闭合 → 开新步
        store.transact(moveX(50), { mergeKey: 'drag' })
        expect(store.history).toHaveLength(3)

        // 键不匹配的 closeMerge 不误伤（最后一步是 drag，给 resize 键应无效）
        store.closeMerge('resize')
        expect(store.history[2]!.mergeKey).toBe('drag')
        store.closeMerge()
        expect(store.history[2]!.mergeKey).toBeNull()
    })
})

describe('ui 分支扩展：selection / hovered / drag（整体替换、永不进历史）', () => {
    it('初始为全空；setter 更新并以对应分支通知', () => {
        const store = new EditorStore()
        const changes: unknown[] = []
        store.subscribe((c) => changes.push(c))

        expect(store.ui.selection).toBeNull()
        expect(store.ui.hovered).toBeNull()
        expect(store.ui.drag).toBeNull()

        store.setSelection(['layers', 0])
        store.setHovered(['layers', 1])
        store.setDrag({ path: ['layers', 0], startScene: { x: 1, y: 2 }, startPosition: { x: 3, y: 4 }, startBox: { x: 3, y: 4, width: 0, height: 0, contentX: 3, contentY: 4, contentWidth: 0, contentHeight: 0 } })

        expect(changes).toEqual([
            { scope: 'ui', branch: 'selection' },
            { scope: 'ui', branch: 'hovered' },
            { scope: 'ui', branch: 'drag' },
        ])
    })

    it('相同选择/悬停路径重复设置不通知（值等短路）', () => {
        const store = new EditorStore()
        const listener = vi.fn()
        store.subscribe(listener)

        store.setSelection(['layers', 0])
        store.setSelection(['layers', 0]) // 值等，跳过
        store.setHovered(['layers', 1])
        store.setHovered(['layers', 1]) // 值等，跳过

        expect(listener).toHaveBeenCalledTimes(2)
    })

    it('openDocument 重置选择态与历史（新文档不继承旧路径/旧事务）', () => {
        const store = new EditorStore()
        store.openDocument(layerDoc())
        store.transact(moveX(40))
        store.setSelection(['layers', 0])
        store.setDrag({ path: ['layers', 0], startScene: { x: 0, y: 0 }, startPosition: { x: 0, y: 0 }, startBox: { x: 0, y: 0, width: 0, height: 0, contentX: 0, contentY: 0, contentWidth: 0, contentHeight: 0 } })

        store.openDocument(layerDoc())

        expect(store.ui.selection).toBeNull()
        expect(store.ui.hovered).toBeNull()
        expect(store.ui.drag).toBeNull()
        expect(store.history).toHaveLength(0)
    })
})
