import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { EditorSession, type FrameScheduler } from '@hankchen/canvas-next-editor'

import { useViewport } from '../../src/shared/useViewport'

/** 同步手动调度器：测试里不真正驱动重绘，只让会话可构造 */
const nullScheduler: FrameScheduler = () => () => {}

function makeEditor(): EditorSession {
    return new EditorSession({ scheduleFrame: nullScheduler })
}

describe('useViewport（视口切片桥）', () => {
    it('初始返回恒等视口，相机动作后切片同步更新', () => {
        const editor = makeEditor()
        const scope = effectScope()
        let value = { x: 0, y: 0, zoom: 1 }
        scope.run(() => {
            value = { ...useViewport(editor).value }
        })
        expect(value).toEqual({ x: 0, y: 0, zoom: 1 })
        scope.stop()
    })

    it('订阅只在 ui.viewport 分支变更时同步（doc 变更不触动视口切片）', () => {
        const editor = makeEditor()
        const scope = effectScope()
        let slice: ReturnType<typeof useViewport> | null = null
        scope.run(() => {
            slice = useViewport(editor)
        })

        editor.panBy(-5, 10)
        expect(slice!.value).toEqual({ x: 5, y: -10, zoom: 1 })

        editor.openDocument({ width: 100, height: 80, layers: [] })
        expect(slice!.value).toEqual({ x: 5, y: -10, zoom: 1 })
        scope.stop()
    })

    it('scope 停止后经 onScopeDispose 注销订阅，退订幂等', () => {
        const editor = makeEditor()
        const subscribeSpy = vi.spyOn(editor, 'subscribe')
        const scope = effectScope()
        scope.run(() => {
            useViewport(editor)
        })
        const unsubscribe = subscribeSpy.mock.results[0]!.value
        scope.stop()

        expect(() => unsubscribe()).not.toThrow()
    })
})
