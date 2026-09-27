import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { EditorSession, type FrameScheduler, type Layer, type TableRowLayer } from '@hankchen/canvas-next-editor'

import { useLayerPanel } from '../../src/layer-panel/useLayerPanel'

const nullScheduler: FrameScheduler = () => () => {}

function makeEditor(layers: readonly Layer[]): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, layers })
    return editor
}

const textLayer = (priority: number, text: string) => ({
    type: 'TextLayer' as const,
    name: '',
    visible: true,
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

// ---- 工票 03：模板态表格的大纲边界（TableLayer V2） ----

const strictShape = (width: number, height: number, autoHeight = false) => ({
    width,
    height,
    autoWidth: false,
    autoHeight,
    lineHeight: 1.2,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
    border: { top: null, bottom: null, left: null, right: null },
    backgroundColor: null,
})
const strictAlign = { horizontal: 'left' as const, vertical: 'top' as const }
const strictPosition = { anchor: 'top-left' as const, x: 0, y: 0 }

/** 模板态表格（rows 空 + 行模板带一个标记文本格，spec §2.5 形态的域对象版） */
const templateTableLayer = (): Layer => ({
    type: 'TableLayer',
    name: '',
    visible: true,
    priority: 5,
    shape: strictShape(600, 200),
    align: strictAlign,
    position: strictPosition,
    template: {
        type: 'TableRowTemplate',
        name: '',
        visible: true,
        priority: 0,
        shape: strictShape(600, 0, true),
        align: strictAlign,
        position: strictPosition,
        cells: [
            {
                type: 'TableCellLayer',
                name: '',
                visible: true,
                priority: 0,
                shape: strictShape(240, 0, true),
                align: strictAlign,
                position: strictPosition,
                content: {
                    type: 'TextLayer',
                    name: '',
                    visible: true,
                    priority: 0,
                    shape: strictShape(240, 0, true),
                    align: { horizontal: 'left', vertical: 'bottom' },
                    position: strictPosition,
                    text: '姓名：{{row.name}}（{{$index}}）',
                    expression: '姓名：{{row.name}}（{{$index}}）',
                    font: '',
                    fontSize: 16,
                    fontColor: '#000000',
                    angle: 0,
                    autowrap: false,
                },
            },
        ],
    },
    rowsPath: 'order.items',
    rows: [],
})

const emptyRowLayer = (): TableRowLayer => ({
    type: 'TableRowLayer',
    name: '',
    visible: true,
    priority: 0,
    shape: strictShape(600, 60),
    align: strictAlign,
    position: strictPosition,
    cells: [],
})

describe('useLayerPanel：模板态表格的大纲边界（工票 03）', () => {
    it('模板态表格节点无 children：模板子树不进大纲（不可选中 = 预期）', () => {
        const editor = makeEditor([templateTableLayer()])
        const scope = effectScope()
        let binding: ReturnType<typeof useLayerPanel> | null = null
        scope.run(() => {
            binding = useLayerPanel(editor)
        })

        const tableNode = binding!.outline.value[0]!
        expect(tableNode.type).toBe('TableLayer')
        expect(tableNode.path).toEqual(['layers', 0])
        expect(tableNode.children).toEqual([])
        scope.stop()
    })

    it('对照：V1 rows 表格的行仍进大纲（空壳边界只属模板态）', () => {
        const v1 = templateTableLayer()
        const table: Layer =
            v1.type === 'TableLayer' ? { ...v1, template: null, rowsPath: '', rows: [emptyRowLayer()] } : v1
        const editor = makeEditor([table])
        const scope = effectScope()
        let binding: ReturnType<typeof useLayerPanel> | null = null
        scope.run(() => {
            binding = useLayerPanel(editor)
        })

        const tableNode = binding!.outline.value[0]!
        expect(tableNode.type).toBe('TableLayer')
        expect(tableNode.children).toHaveLength(1)
        expect(tableNode.children[0]!.type).toBe('TableRowLayer')
        scope.stop()
    })
})
