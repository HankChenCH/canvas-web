import { describe, expect, it, vi } from 'vitest'

import type { Canvas } from '@hankchen/canvas'

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

describe('ui 分支：anchorExpanded（属性面板锚点折叠区会话记忆，layer-panel-ux 工票 03）', () => {
    it('默认收起（false），setAnchorExpanded 展开并按 branch 通知', () => {
        const store = new EditorStore()
        expect(store.ui.anchorExpanded).toBe(false)

        const changes: EditorChange[] = []
        store.subscribe((c) => changes.push(c))
        store.setAnchorExpanded(true)

        expect(store.ui.anchorExpanded).toBe(true)
        expect(changes).toEqual([{ scope: 'ui', branch: 'anchorExpanded' }])
    })

    it('同值写入短路不通知（重复点击不重绘）', () => {
        const store = new EditorStore()
        const listener = vi.fn()
        store.subscribe(listener)
        store.setAnchorExpanded(false)
        expect(listener).not.toHaveBeenCalled()

        store.setAnchorExpanded(true)
        store.setAnchorExpanded(true)
        expect(listener).toHaveBeenCalledTimes(1)
    })

    it('会话内记忆：openDocument 换文档不重置（与 viewport 同款的面板偏好）', () => {
        const store = new EditorStore()
        store.setAnchorExpanded(true)
        store.openDocument(doc())
        expect(store.ui.anchorExpanded).toBe(true)
    })

    it('不进历史：展开/收起不产生 undo 步', () => {
        const store = new EditorStore()
        store.openDocument(doc())
        store.setAnchorExpanded(true)
        store.setAnchorExpanded(false)
        expect(store.history).toHaveLength(0)
    })
})

describe('ui 分支：参考线/标尺/命中吸附轴（ruler-guides-snap 工单 01）', () => {
    it('setSnapAxes 内容等短路：相同命中集不重复通知，清空后重复清空也不通知', () => {
        const store = new EditorStore()
        store.openDocument(doc())
        const listener = vi.fn()
        store.subscribe(listener)

        const axes = [{ orientation: 'vertical' as const, position: 100, source: 'layer' as const }]
        store.setSnapAxes(axes)
        store.setSnapAxes([...axes]) // 内容等（新引用），跳过
        expect(listener).toHaveBeenCalledTimes(1)

        store.setSnapAxes([])
        expect(listener).toHaveBeenCalledTimes(2)
        store.setSnapAxes([]) // 已是空，跳过
        expect(listener).toHaveBeenCalledTimes(2)
        expect(store.ui.snapAxes).toEqual([])
    })

    it('setGuides/setRulersVisible 通知对应分支，均不进历史', () => {
        const store = new EditorStore()
        store.openDocument(doc())
        const changes: EditorChange[] = []
        store.subscribe((c) => changes.push(c))

        store.setGuides([{ id: 1, orientation: 'vertical', position: 205 }])
        store.setRulersVisible(false)
        expect(changes).toEqual([
            { scope: 'ui', branch: 'guides' },
            { scope: 'ui', branch: 'rulersVisible' },
        ])
        expect(store.history).toHaveLength(0)
    })
})

describe('ui 分支：resourceStatuses（placeholder-padding-hint 工单 02：物化状态进 ui 分支，红线 3 延伸）', () => {
    it('setResourceStatuses 整体替换并按 branch 通知', () => {
        const store = new EditorStore()
        const changes: EditorChange[] = []
        store.subscribe((c) => changes.push(c))

        const statuses = { 'assets/logo.png': 'pending' } as const
        store.setResourceStatuses(statuses)
        expect(store.ui.resourceStatuses).toBe(statuses)
        expect(changes).toEqual([{ scope: 'ui', branch: 'resourceStatuses' }])
    })

    it('内容等短路：同态新引用不通知（物化桥接高频整体替换不惊动订阅方）', () => {
        const store = new EditorStore()
        const listener = vi.fn()
        store.subscribe(listener)

        store.setResourceStatuses({ 'a.png': 'pending', 'b.png': 'done' })
        store.setResourceStatuses({ 'b.png': 'done', 'a.png': 'pending' }) // 键序不同、内容等
        expect(listener).toHaveBeenCalledTimes(1)

        store.setResourceStatuses({ 'a.png': 'done', 'b.png': 'done' })
        expect(listener).toHaveBeenCalledTimes(2)
    })

    it('不写 graph、不进历史：doc 引用与 undo 栈零变化（红线 3 延伸）', () => {
        const store = new EditorStore()
        const document = doc()
        store.openDocument(document)
        store.setResourceStatuses({ 'a.png': 'failed' })
        expect(store.doc).toBe(document)
        expect(store.history).toHaveLength(0)
    })

    it('openDocument 换文档重置（资源态描述当次文档，跨文档旧 src 条目无意义）', () => {
        const store = new EditorStore()
        store.setResourceStatuses({ 'a.png': 'failed' })
        store.openDocument(doc())
        expect(store.ui.resourceStatuses).toEqual({})
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
