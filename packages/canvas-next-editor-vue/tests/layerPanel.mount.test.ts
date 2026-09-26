// @vitest-environment jsdom
/**
 * LayerPanel 组件集成测试（工单 10）：
 * - 面板序渲染（首行 = 视觉最上层 = 数组尾）、表格三层嵌套展开
 * - 点选 = 画布选中（双向联动的面板侧）；画布选择 → 行高亮
 * - 新增（置顶 min−1）/ 删除按钮走内核 action
 * - 拖放重排：根层走 priority 中点插值、表格行直接改数组序（合成事件流）
 */
import { describe, expect, it, vi } from 'vitest'
import { mount, type DOMWrapper } from '@vue/test-utils'

import { EditorSession, type FrameScheduler, type Layer, type TableRowLayer } from '@hankchen/canvas-next-editor'

import LayerPanel from '../src/LayerPanel.vue'
import { isUpperHalf } from '../src/useLayerPanel'

const nullScheduler: FrameScheduler = () => () => {}

function makeEditor(layers: readonly Layer[]): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, layers })
    return editor
}

/** 最小合法图层构造：只覆写 type/priority 与尺寸，其余取严格缺省 */
const baseShape = (width: number, height: number) => ({
    width,
    height,
    autoWidth: false,
    autoHeight: false,
    lineHeight: 1.2,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
    border: { top: null, bottom: null, left: null, right: null },
    backgroundColor: null,
})
const baseAlign = { horizontal: 'left' as const, vertical: 'top' as const }
const basePosition = { anchor: 'top-left' as const, x: 0, y: 0 }

const textLayer = (priority: number, text: string): Layer => ({
    type: 'TextLayer',
    priority,
    shape: baseShape(100, 50),
    align: baseAlign,
    position: basePosition,
    text,
    expression: null,
    font: '',
    fontSize: 16,
    fontColor: '#000000',
    angle: 0,
    autowrap: false,
})

const tableLayer = (rows: readonly Layer[], width = 600): Layer => ({
    type: 'TableLayer',
    priority: 5,
    shape: baseShape(width, 200),
    align: baseAlign,
    position: basePosition,
    template: null,
    rowsPath: '',
    rows: rows as TableRowLayer[],
})

const rowLayer = (priority: number, cells: readonly Layer[] = []): Layer => ({
    type: 'TableRowLayer',
    priority,
    shape: baseShape(600, 100),
    align: baseAlign,
    position: basePosition,
    cells: cells as TableRowLayer['cells'],
})

const cellLayer = (width: number): Layer => ({
    type: 'TableCellLayer',
    priority: 0,
    shape: baseShape(width, 60),
    align: baseAlign,
    position: basePosition,
    content: null,
})

const rowLabels = (wrapper: ReturnType<typeof mount>): string[] =>
    wrapper.findAll('.cn-layers__label').map((node) => node.text())

/** jsdom 的 getBoundingClientRect 全零；拖放落点判定需 mock 目标行盒（top=0 + 高 32） */
function mockRect(row: DOMWrapper<Element>): void {
    vi.spyOn(row.element as HTMLElement, 'getBoundingClientRect').mockReturnValue({ height: 32, top: 0 } as DOMRect)
}

describe('拖放落点纯函数', () => {
    it('isUpperHalf：高度退化（jsdom rect=0）视为下半', () => {
        expect(isUpperHalf(2, 32)).toBe(true)
        expect(isUpperHalf(30, 32)).toBe(false)
        expect(isUpperHalf(2, 0)).toBe(false)
    })
})

describe('LayerPanel：渲染与联动', () => {
    it('面板序渲染：首行 = 数组尾层（视觉最上），标签带同类序号', () => {
        const editor = makeEditor([textLayer(30, '底'), textLayer(20, '中'), textLayer(10, '顶')])
        const wrapper = mount(LayerPanel, { props: { editor } })
        expect(rowLabels(wrapper)).toEqual(['TextLayer 1', 'TextLayer 2', 'TextLayer 3'])
        wrapper.unmount()
    })

    it('表格三层嵌套展开：行/格缩进呈现', () => {
        const editor = makeEditor([tableLayer([rowLayer(30), rowLayer(20)])])
        const wrapper = mount(LayerPanel, { props: { editor } })
        expect(rowLabels(wrapper)).toEqual(['TableLayer 1', '行 1', '行 2'])
        const rowNodes = wrapper.findAll('.cn-layers__row')
        expect(rowNodes).toHaveLength(3)
        wrapper.unmount()
    })

    it('点击行 = 画布选中；画布选中 = 行高亮（双向联动）', async () => {
        const editor = makeEditor([textLayer(30, '底'), textLayer(10, '顶')])
        const wrapper = mount(LayerPanel, { props: { editor } })

        await wrapper.findAll('.cn-layers__row')[1]!.trigger('click')
        expect(editor.store.ui.selection).toEqual(['layers', 0])

        // 画布侧选择（模拟画布点选）→ 行高亮跟随
        editor.setSelection(['layers', 1])
        await wrapper.vm.$nextTick()
        const selected = wrapper.findAll('.cn-layers__row--selected')
        expect(selected).toHaveLength(1)
        expect(selected[0]!.find('.cn-layers__label').text()).toBe('TextLayer 1')
        wrapper.unmount()
    })

    it('新增按钮走 addRootLayer：置顶 min−1 并自动选中', async () => {
        const editor = makeEditor([textLayer(30, '底'), textLayer(10, '顶')])
        const wrapper = mount(LayerPanel, { props: { editor } })

        await wrapper.find('[data-add="TextLayer"]').trigger('click')
        const layers = editor.store.doc!.layers
        expect(layers).toHaveLength(3)
        expect(layers[2]!.priority).toBe(9)
        expect(editor.store.ui.selection).toEqual(['layers', 2])
        wrapper.unmount()
    })

    it('删除按钮走 deleteLayer：整层移除', async () => {
        const editor = makeEditor([textLayer(30, '底'), textLayer(10, '顶')])
        const wrapper = mount(LayerPanel, { props: { editor } })

        await wrapper.findAll('.cn-layers__delete')[1]!.trigger('click')
        expect(editor.store.doc!.layers).toHaveLength(1)
        wrapper.unmount()
    })

    it('根层拖放：dragstart→dragover→drop 触发 moveRootLayer（中点插值）', async () => {
        const editor = makeEditor([textLayer(30, '底'), textLayer(20, '中'), textLayer(10, '顶')])
        const wrapper = mount(LayerPanel, { props: { editor } })
        const rows = wrapper.findAll('.cn-layers__row')

        // 面板顶（顶,10）拖到面板底行的上半（insert-before 底）→ 视觉 [中, 顶, 底]
        mockRect(rows[2]!)
        await rows[0]!.trigger('dragstart')
        await rows[2]!.trigger('dragover', { clientY: 2 })
        await rows[2]!.trigger('drop')
        await wrapper.vm.$nextTick()

        const layers = editor.store.doc!.layers
        expect(layers.map((layer) => (layer.type === 'TextLayer' ? layer.text : ''))).toEqual(['底', '顶', '中'])
        expect(layers.map((layer) => layer.priority)).toEqual([30, 25, 20])
        wrapper.unmount()
    })

    it('表格行拖放：直接改 rows 数组序（行 priority 不动）', async () => {
        const editor = makeEditor([tableLayer([rowLayer(30), rowLayer(20)])])
        const wrapper = mount(LayerPanel, { props: { editor } })
        const rows = wrapper.findAll('.cn-layers__row')

        // 行 1（面板第三行）拖到行 0 上半 → 行序变 [行1, 行0]，priority 随行原样搬移
        mockRect(rows[1]!)
        await rows[2]!.trigger('dragstart')
        await rows[1]!.trigger('dragover', { clientY: 2 })
        await rows[1]!.trigger('drop')
        await wrapper.vm.$nextTick()

        const table = editor.store.doc!.layers[0]!
        expect(table.type === 'TableLayer' && table.rows.map((row) => row.priority)).toEqual([20, 30])
        wrapper.unmount()
    })
})

describe('LayerPanel：表格容器结构编辑（工单 12）', () => {
    it('表节点「加行」按钮走 addTableRow：新行带格与文本内容、行宽=表宽、自动选中', async () => {
        const editor = makeEditor([tableLayer([rowLayer(30)])])
        const wrapper = mount(LayerPanel, { props: { editor } })

        await wrapper.find('[data-key="layers.0"]').find('[data-add-row]').trigger('click')
        await wrapper.vm.$nextTick()

        const table = editor.store.doc!.layers[0]!
        expect(table.type === 'TableLayer' && table.rows).toHaveLength(2)
        const newRow = table.type === 'TableLayer' ? table.rows[1]! : null
        expect(newRow?.shape.width).toBe(600)
        expect(newRow?.cells).toHaveLength(1)
        expect(newRow?.cells[0]!.content?.type).toBe('TextLayer')
        expect(editor.store.ui.selection).toEqual(['layers', 0, 'rows', 1])
        wrapper.unmount()
    })

    it('行节点「加格」按钮走 addTableCell：新格带文本内容、自动选中', async () => {
        const editor = makeEditor([tableLayer([rowLayer(30)])])
        const wrapper = mount(LayerPanel, { props: { editor } })

        await wrapper.find('[data-key="layers.0.rows.0"]').find('[data-add-cell]').trigger('click')
        await wrapper.vm.$nextTick()

        const table = editor.store.doc!.layers[0]!
        const row = table.type === 'TableLayer' ? table.rows[0]! : null
        expect(row?.cells).toHaveLength(1)
        expect(row?.cells[0]!.content?.type).toBe('TextLayer')
        expect(row?.cells[0]!.shape.width).toBe(600) // 首格宽 = 行宽
        expect(editor.store.ui.selection).toEqual(['layers', 0, 'rows', 0, 'cells', 0])
        wrapper.unmount()
    })

    it('格拖放：同行重排直接改 cells 数组序（格0 恒在最左）', async () => {
        const editor = makeEditor([
            tableLayer([rowLayer(30, [cellLayer(200), cellLayer(300)])]),
        ])
        const wrapper = mount(LayerPanel, { props: { editor } })

        // 格 1（宽 200）拖到格 2（宽 300）下半 → cells 序 [300, 200]
        mockRect(wrapper.find('[data-key="layers.0.rows.0.cells.1"]'))
        await wrapper.find('[data-key="layers.0.rows.0.cells.0"]').trigger('dragstart')
        await wrapper.find('[data-key="layers.0.rows.0.cells.1"]').trigger('dragover', { clientY: 20 })
        await wrapper.find('[data-key="layers.0.rows.0.cells.1"]').trigger('drop')
        await wrapper.vm.$nextTick()

        const table = editor.store.doc!.layers[0]!
        const row = table.type === 'TableLayer' ? table.rows[0]! : null
        expect(row?.cells.map((cell) => cell.shape.width)).toEqual([300, 200])
        wrapper.unmount()
    })

    it('行跨表拖放：行宽同步目标表宽（跨容器重建路径）', async () => {
        const editor = makeEditor([
            tableLayer([rowLayer(30, [cellLayer(600)])]),
            tableLayer([rowLayer(20, [cellLayer(300)])], 300),
        ])
        const wrapper = mount(LayerPanel, { props: { editor } })

        // 表A（layers.0）的行拖到表B（layers.1）行下半 → 行宽 600 → 300
        mockRect(wrapper.find('[data-key="layers.1.rows.0"]'))
        await wrapper.find('[data-key="layers.0.rows.0"]').trigger('dragstart')
        await wrapper.find('[data-key="layers.1.rows.0"]').trigger('dragover', { clientY: 20 })
        await wrapper.find('[data-key="layers.1.rows.0"]').trigger('drop')
        await wrapper.vm.$nextTick()

        const target = editor.store.doc!.layers[1]!
        expect(target.type === 'TableLayer' && target.rows).toHaveLength(2)
        const moved = target.type === 'TableLayer' ? target.rows[1]! : null
        expect(moved?.shape.width).toBe(300)
        expect(moved?.cells).toHaveLength(1) // 格与内容原样随行
        const source = editor.store.doc!.layers[0]!
        expect(source.type === 'TableLayer' && source.rows).toHaveLength(0)
        wrapper.unmount()
    })
})
