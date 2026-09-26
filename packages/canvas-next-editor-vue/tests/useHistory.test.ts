import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { EditorSession, type Canvas, type DocRecipe, type FrameScheduler } from '@hankchen/canvas-next-editor'

import { useHistory } from '../src/useHistory'

/** 同步手动调度器：测试里不真正驱动重绘，只让会话可构造 */
const nullScheduler: FrameScheduler = () => () => {}

function makeEditor(): EditorSession {
    return new EditorSession({ scheduleFrame: nullScheduler })
}

const doc = (): Canvas => ({ width: 100, height: 80, layers: [] })

const addLayer = (priority: number): DocRecipe => (draft) => {
        draft.layers.push({
            type: 'TextLayer',
            priority,
            shape: {
                width: 10,
                height: 10,
                autoWidth: false,
                autoHeight: false,
                lineHeight: 1.2,
                padding: { top: 0, bottom: 0, left: 0, right: 0 },
                border: { top: null, bottom: null, left: null, right: null },
                backgroundColor: null,
            },
            align: { horizontal: 'left', vertical: 'top' },
            position: { anchor: 'top-left', x: 0, y: 0 },
            text: 'x',
            expression: null,
            font: '',
            fontSize: 12,
            fontColor: '#000000',
            angle: 0,
            autowrap: false,
        })
}

describe('useHistory（历史可用态桥）', () => {
    it('初始双向不可用；transact/undo/redo 后两个布尔联动', () => {
        const editor = makeEditor()
        const scope = effectScope()
        let history: ReturnType<typeof useHistory> | null = null
        scope.run(() => {
            history = useHistory(editor)
        })

        expect(history!.canUndo.value).toBe(false)
        expect(history!.canRedo.value).toBe(false)

        editor.openDocument(doc())
        expect(history!.canUndo.value).toBe(false)

        editor.store.transact(addLayer(10))
        expect(history!.canUndo.value).toBe(true)
        expect(history!.canRedo.value).toBe(false)

        editor.undo()
        expect(history!.canUndo.value).toBe(false)
        expect(history!.canRedo.value).toBe(true)

        editor.redo()
        expect(history!.canUndo.value).toBe(true)
        expect(history!.canRedo.value).toBe(false)
        scope.stop()
    })

    it('ui 分支变更不触动可用态（相机/选择不改历史栈）', () => {
        const editor = makeEditor()
        const scope = effectScope()
        let history: ReturnType<typeof useHistory> | null = null
        scope.run(() => {
            history = useHistory(editor)
        })

        editor.openDocument(doc())
        editor.panBy(-10, 0)
        editor.setSelection(['layers', 0])
        expect(history!.canUndo.value).toBe(false)
        expect(history!.canRedo.value).toBe(false)
        scope.stop()
    })

    it('打开新文档清空双栈：可用态归零', () => {
        const editor = makeEditor()
        editor.openDocument(doc())
        editor.store.transact(addLayer(10))
        editor.undo()

        const scope = effectScope()
        let history: ReturnType<typeof useHistory> | null = null
        scope.run(() => {
            history = useHistory(editor)
        })
        expect(history!.canRedo.value).toBe(true)

        editor.openDocument(doc())
        expect(history!.canUndo.value).toBe(false)
        expect(history!.canRedo.value).toBe(false)
        scope.stop()
    })

    it('scope 停止后经 onScopeDispose 注销订阅，退订幂等', () => {
        const editor = makeEditor()
        const subscribeSpy = vi.spyOn(editor, 'subscribe')
        const scope = effectScope()
        scope.run(() => {
            useHistory(editor)
        })
        const unsubscribe = subscribeSpy.mock.results[0]!.value
        scope.stop()

        expect(() => unsubscribe()).not.toThrow()
    })
})
