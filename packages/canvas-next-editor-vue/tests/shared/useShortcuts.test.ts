// @vitest-environment jsdom
/**
 * useShortcuts 绑定桥测试（工单 14）：
 * - KeyboardEvent 折算（mod = Ctrl/Cmd、composing = isComposing || keyCode 229、
 *   editing = ui.editing、editableTarget = 事件目标）→ 内核分类 → executeShortcut；
 * - 命中才 preventDefault（Delete 删层且拦默认），未命中放行；
 * - 让路场景端到端：文本编辑态 Delete 不删图层；焦点在输入框 Delete 不删图层；
 * - effect scope 停止后监听注销（重复派发不再触发动作）。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { effectScope } from 'vue'

import { EditorSession, type FrameScheduler } from '@hankchen/canvas-next-editor'

import { useShortcuts } from '../../src/shared/useShortcuts'
import { useShortcutsHelp } from '../../src/shared/useShortcutsHelp'
import { textLayer } from '../../../canvas-next-editor/tests/support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

function makeEditor(): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, layers: [textLayer({ priority: 10, text: '甲' })] })
    return editor
}

const press = (init: KeyboardEventInit & { keyCode?: number }, target: EventTarget = window): boolean => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    // 事件 target = 派发元素（冒泡到 window 监听器）；返回是否被 preventDefault
    return !target.dispatchEvent(event)
}

describe('useShortcuts：折算 → 分类 → 分派', () => {
    it('Delete 删除选中图层并拦截默认行为', () => {
        const scope = effectScope()
        const editor = makeEditor()
        scope.run(() => useShortcuts(editor))
        editor.setSelection(['layers', 0])

        const prevented = press({ key: 'Delete' })
        expect(prevented).toBe(true)
        expect(editor.store.doc!.layers).toHaveLength(0)
        scope.stop()
    })

    it('Ctrl/Cmd+D 创建副本（拦书签默认），Ctrl+Z 撤销', () => {
        const scope = effectScope()
        const editor = makeEditor()
        scope.run(() => useShortcuts(editor))
        editor.setSelection(['layers', 0])

        expect(press({ key: 'd', ctrlKey: true })).toBe(true)
        expect(editor.store.doc!.layers).toHaveLength(2)
        expect(press({ key: 'z', metaKey: true })).toBe(true)
        expect(editor.store.doc!.layers).toHaveLength(1)
        scope.stop()
    })

    it('未命中键位放行（不拦默认、不动作）', () => {
        const scope = effectScope()
        const editor = makeEditor()
        scope.run(() => useShortcuts(editor))
        editor.setSelection(['layers', 0])

        expect(press({ key: 'a', ctrlKey: true })).toBe(false)
        expect(press({ key: 'c' })).toBe(false) // 无 mod 的 c 不入表
        expect(editor.store.doc!.layers).toHaveLength(1)
        scope.stop()
    })

    it('文本编辑态 Delete 让路：图层不删（工单验收项端到端）', () => {
        const scope = effectScope()
        const editor = makeEditor()
        scope.run(() => useShortcuts(editor))
        editor.setSelection(['layers', 0])
        expect(editor.beginTextEdit(['layers', 0])).toBe(true)

        expect(press({ key: 'Delete' })).toBe(false)
        expect(editor.store.doc!.layers).toHaveLength(1)
        scope.stop()
    })

    it('焦点在输入框 Delete 让路：图层不删（属性面板输入原生编辑优先）', () => {
        const scope = effectScope()
        const editor = makeEditor()
        scope.run(() => useShortcuts(editor))
        editor.setSelection(['layers', 0])

        const input = document.createElement('input')
        document.body.appendChild(input)
        // 在输入框上派发（事件 target = input，冒泡到 window 监听器）
        const prevented = press({ key: 'Delete' }, input)
        expect(prevented).toBe(false)
        expect(editor.store.doc!.layers).toHaveLength(1)
        input.remove()
        scope.stop()
    })

    it('输入法合成中（keyCode 229 兼容位）不触发', () => {
        const scope = effectScope()
        const editor = makeEditor()
        scope.run(() => useShortcuts(editor))
        editor.setSelection(['layers', 0])

        expect(press({ key: 'z', ctrlKey: true, keyCode: 229 } as KeyboardEventInit)).toBe(false)
        expect(editor.store.doc!.layers).toHaveLength(1)
        scope.stop()
    })

    it('折算携带 alt/code：⌥⌘] 按 code 置顶、⇧1 按 code 适应画布（kbd-nav 工单 01）', () => {
        const scope = effectScope()
        const editor = new EditorSession({ scheduleFrame: nullScheduler })
        editor.openDocument({
            width: 800,
            height: 600,
            layers: [
                textLayer({ priority: 20, text: '底' }),
                textLayer({ priority: 10, text: '顶' }),
            ],
        })
        scope.run(() => useShortcuts(editor))
        editor.setSurfaceSize(800, 600)
        editor.setSelection(['layers', 0])

        // mac ⌥ 变体字符：key 不可靠，折算后的 code（BracketRight）是唯一匹配通道
        expect(press({ key: '®', metaKey: true, altKey: true, code: 'BracketRight' })).toBe(true)
        expect(editor.store.doc!.layers.map((layer) => (layer as { text: string }).text)).toEqual([
            '顶',
            '底',
        ]) // 底置顶
        expect(editor.store.doc!.layers[1]!.priority).toBe(9)

        // US 布局 Shift+1 的 key 是 '!'，折算 code（Digit1）命中适应画布
        editor.zoomAt(100, 100, 3)
        expect(press({ key: '!', shiftKey: true, code: 'Digit1' })).toBe(true)
        expect(editor.store.ui.viewport.zoom).toBeCloseTo(1, 9) // fit 800×600 → 800×600 画布为 1
        scope.stop()
    })
})

describe('useShortcuts：⌘/ 帮助面板路由（kbd-nav 工单 04，UI 面动作）', () => {
    beforeEach(() => {
        useShortcutsHelp().close()
    })

    it('⌘/ 开面板、再按收面板（开合）；不经内核 dispatcher（文档零历史步）', () => {
        const scope = effectScope()
        const editor = makeEditor()
        scope.run(() => useShortcuts(editor))
        const help = useShortcutsHelp()

        expect(help.open.value).toBe(false)
        expect(press({ key: '/', metaKey: true })).toBe(true)
        expect(help.open.value).toBe(true)
        expect(editor.store.history).toHaveLength(0) // 对话态不进内核 store

        expect(press({ key: '/', metaKey: true })).toBe(true)
        expect(help.open.value).toBe(false)
        scope.stop()
        useShortcutsHelp().close()
    })

    it('编辑态 ⌘/ 不触发（分类器让路守卫既有）', () => {
        const scope = effectScope()
        const editor = makeEditor()
        editor.setSelection(['layers', 0])
        expect(editor.beginTextEdit(['layers', 0])).toBe(true)
        scope.run(() => useShortcuts(editor))
        const help = useShortcutsHelp()

        expect(press({ key: '/', metaKey: true })).toBe(false)
        expect(help.open.value).toBe(false)
        scope.stop()
        useShortcutsHelp().close()
    })

    it('输入框焦点 ⌘/ 不触发（原生编辑优先）', () => {
        const scope = effectScope()
        const editor = makeEditor()
        scope.run(() => useShortcuts(editor))
        const help = useShortcutsHelp()

        const input = document.createElement('input')
        document.body.appendChild(input)
        expect(press({ key: '/', metaKey: true }, input)).toBe(false)
        expect(help.open.value).toBe(false)
        input.remove()
        scope.stop()
        useShortcutsHelp().close()
    })
})

describe('useShortcuts：scope 停止与注销', () => {
    it('scope 停止后监听注销', () => {
        const scope = effectScope()
        const editor = makeEditor()
        scope.run(() => useShortcuts(editor))
        editor.setSelection(['layers', 0])
        scope.stop()

        press({ key: 'Delete' })
        expect(editor.store.doc!.layers).toHaveLength(1)
    })
})
