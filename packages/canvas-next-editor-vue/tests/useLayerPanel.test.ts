import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { EditorSession, type FrameScheduler, type Layer } from '@hankchen/canvas-next-editor'

import { useLayerPanel } from '../src/useLayerPanel'

const nullScheduler: FrameScheduler = () => () => {}

function makeEditor(layers: readonly Layer[]): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, layers })
    return editor
}

const textLayer = (priority: number, text: string) => ({
    type: 'TextLayer' as const,
    priority,
    shape: { width: 100, height: 50, autoWidth: false, autoHeight: false, lineHeight: 1.2, padding: { top: 0, bottom: 0, left: 0, right: 0 }, border: { top: null, bottom: null, left: null, right: null }, backgroundColor: null },
    align: { horizontal: 'left' as const, vertical: 'top' as const },
    position: { anchor: 'top-left' as const, x: 0, y: 0 },
    text,
    expression: null,
    font: '',
    fontSize: 16,
    fontColor: '#000000',
    angle: 0,
    autowrap: false,
})

describe('useLayerPanel（图层面板切片桥）', () => {
    it('大纲切片 = 面板序（视觉顶在先），文档变更后重算', () => {
        const editor = makeEditor([textLayer(30, '底'), textLayer(10, '顶')])
        const scope = effectScope()
        let binding: ReturnType<typeof useLayerPanel> | null = null
        scope.run(() => {
            binding = useLayerPanel(editor)
        })
        expect(binding!.outline.value.map((node) => node.path)).toEqual([['layers', 1], ['layers', 0]])

        // 新增 → 大纲重算（新层置顶在先）
        editor.addRootLayer('TextLayer')
        expect(binding!.outline.value.map((node) => node.path)).toEqual([
            ['layers', 2],
            ['layers', 1],
            ['layers', 0],
        ])
        scope.stop()
    })

    it('选择/悬停切片双向同步：面板点击与画布点选共用同一 ui 分支', () => {
        const editor = makeEditor([textLayer(30, '底'), textLayer(10, '顶')])
        const scope = effectScope()
        let binding: ReturnType<typeof useLayerPanel> | null = null
        scope.run(() => {
            binding = useLayerPanel(editor)
        })

        // 面板侧动作（setSelection）→ 切片更新
        editor.setSelection(['layers', 0])
        expect(binding!.selection.value).toEqual(['layers', 0])
        editor.setHovered(['layers', 1])
        expect(binding!.hovered.value).toEqual(['layers', 1])

        // 结构重排重映射选择（画布侧拖动同一数据源）
        editor.moveRootLayer(0, 2)
        expect(binding!.selection.value).toEqual(['layers', 1])
        scope.stop()
    })

    it('scope 停止后经 onScopeDispose 注销订阅', () => {
        const editor = makeEditor([textLayer(10, '顶')])
        const subscribeSpy = vi.spyOn(editor, 'subscribe')
        const scope = effectScope()
        scope.run(() => {
            useLayerPanel(editor)
        })
        const unsubscribe = subscribeSpy.mock.results[0]!.value
        scope.stop()
        expect(() => unsubscribe()).not.toThrow()
    })
})
