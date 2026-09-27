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

import LayerPanel from '../../src/layer-panel/LayerPanel.vue'
import { isUpperHalf } from '../../src/layer-panel/useLayerPanel'

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
    name: '',
    visible: true,
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
    name: '',
    visible: true,
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
    name: '',
    visible: true,
    priority,
    shape: baseShape(600, 100),
    align: baseAlign,
    position: basePosition,
    cells: cells as TableRowLayer['cells'],
})

const cellLayer = (width: number): Layer => ({
    type: 'TableCellLayer',
    name: '',
    visible: true,
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

    it('根层拖放：dragstart 从把手发起，dragover→drop 触发 moveRootLayer（中点插值）', async () => {
        const editor = makeEditor([textLayer(30, '底'), textLayer(20, '中'), textLayer(10, '顶')])
        const wrapper = mount(LayerPanel, { props: { editor } })
        const rows = wrapper.findAll('.cn-layers__row')

        // 面板顶（顶,10）的把手拖到面板底行的上半（insert-before 底）→ 视觉 [中, 顶, 底]
        mockRect(rows[2]!)
        await rows[0]!.find('[data-drag-handle]').trigger('dragstart')
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

describe('LayerPanel：V2 绑定面（工票 03）', () => {
    it('新增菜单四入口锁死：不含 TableRowTemplate（模板不可新建，硬编码清单不得扩张）', async () => {
        const editor = makeEditor([])
        const wrapper = mount(LayerPanel, { props: { editor } })

        const adds = wrapper.findAll('[data-add]')
        expect(adds.map((button) => button.attributes('data-add'))).toEqual([
            'TextLayer',
            'ImageLayer',
            'QrCodeLayer',
            'TableLayer',
        ])
        wrapper.unmount()
    })
})

describe('LayerPanel：行卡片化 + 拖拽把手（工单 08）', () => {
    it('把手常显仅根层：根层行各一个 draggable 把手；行/格不加把手且整行可拖不变（I2=A）', async () => {
        const editor = makeEditor([textLayer(30, '底'), tableLayer([rowLayer(30), rowLayer(20)])])
        const wrapper = mount(LayerPanel, { props: { editor } })
        // 面板序：表（根）、行1、行2、文本（根）——把手只落在两个根层行
        const rows = wrapper.findAll('.cn-layers__row')
        expect(rows).toHaveLength(4)

        const handles = wrapper.findAll('[data-drag-handle]')
        expect(handles).toHaveLength(2)
        handles.forEach((handle) => expect(handle.attributes('draggable')).toBe('true'))
        expect(rows[0]!.find('[data-drag-handle]').exists()).toBe(true)
        expect(rows[1]!.find('[data-drag-handle]').exists()).toBe(false)
        expect(rows[2]!.find('[data-drag-handle]').exists()).toBe(false)
        expect(rows[3]!.find('[data-drag-handle]').exists()).toBe(true)

        // 根层整行禁拖（draggable 收敛到把手）；行/格整行拖拽保留
        expect(rows[0]!.attributes('draggable')).toBeUndefined()
        expect(rows[1]!.attributes('draggable')).toBe('true')
        expect(rows[2]!.attributes('draggable')).toBe('true')
        expect(rows[3]!.attributes('draggable')).toBeUndefined()
        wrapper.unmount()
    })

    it('整行拖拽禁用（根层）：行上 dragstart 不发起拖拽，后续 drop 空转文档不动', async () => {
        const editor = makeEditor([textLayer(30, '底'), textLayer(20, '中'), textLayer(10, '顶')])
        const wrapper = mount(LayerPanel, { props: { editor } })
        const rows = wrapper.findAll('.cn-layers__row')

        mockRect(rows[2]!)
        await rows[0]!.trigger('dragstart')
        await rows[2]!.trigger('dragover', { clientY: 2 })
        await rows[2]!.trigger('drop')
        await wrapper.vm.$nextTick()

        expect(editor.store.doc!.layers.map((layer) => (layer.type === 'TextLayer' ? layer.text : ''))).toEqual([
            '底',
            '中',
            '顶',
        ])
        expect(editor.store.doc!.layers.map((layer) => layer.priority)).toEqual([30, 20, 10])
        wrapper.unmount()
    })
})

describe('LayerPanel：行内重命名（工单 09）', () => {
    it('labelFor：根层 name 非空显示 name，空串回退派生标签（type 计数逻辑不动）', () => {
        const editor = makeEditor([textLayer(30, '底'), { ...textLayer(10, '顶'), name: '封面标题' }])
        const wrapper = mount(LayerPanel, { props: { editor } })
        // 面板序：顶（已命名 → 封面标题）、底（未命名 → 派生；同类计数含已命名层）
        expect(rowLabels(wrapper)).toEqual(['封面标题', 'TextLayer 2'])
        wrapper.unmount()
    })

    it('双击行标签进入行内编辑：input 覆盖标签、初值 = 显示标签、自动聚焦全选', async () => {
        const editor = makeEditor([textLayer(30, '底'), { ...textLayer(10, '顶'), name: '封面标题' }])
        // attachTo：focus/activeElement 只对已入文档的元素生效（textEditingOverlay 同款）
        const wrapper = mount(LayerPanel, { props: { editor }, attachTo: document.body })

        await wrapper.findAll('.cn-layers__label')[0]!.trigger('dblclick')
        // 第二拍：renaming watch 的 nextTick 聚焦（TextEditingOverlay 同款时序）
        await wrapper.vm.$nextTick()
        const input = wrapper.find('[data-rename-input]')
        expect(input.exists()).toBe(true)
        expect((input.element as HTMLInputElement).value).toBe('封面标题')
        expect(document.activeElement).toBe(input.element)
        expect((input.element as HTMLInputElement).selectionEnd).toBe('封面标题'.length) // 全选
        wrapper.unmount()
    })

    it('Enter 提交：name 落文档 = 一步历史，input 卸载、标签显示新名，undo 可撤销', async () => {
        const editor = makeEditor([textLayer(10, '顶')])
        const wrapper = mount(LayerPanel, { props: { editor } })

        await wrapper.findAll('.cn-layers__label')[0]!.trigger('dblclick')
        const input = wrapper.find('[data-rename-input]')
        await input.setValue('主标题')
        await input.trigger('keydown', { key: 'Enter' })

        expect(editor.store.doc!.layers[0]!.name).toBe('主标题')
        expect(editor.store.history).toHaveLength(1)
        expect(wrapper.find('[data-rename-input]').exists()).toBe(false)
        expect(rowLabels(wrapper)).toEqual(['主标题'])

        editor.undo()
        await wrapper.vm.$nextTick()
        expect(editor.store.doc!.layers[0]!.name).toBe('')
        expect(rowLabels(wrapper)).toEqual(['TextLayer 1'])
        wrapper.unmount()
    })

    it('Esc 取消：不落文档、无历史步、标签不变、input 卸载', async () => {
        const editor = makeEditor([textLayer(10, '顶')])
        const wrapper = mount(LayerPanel, { props: { editor } })

        await wrapper.findAll('.cn-layers__label')[0]!.trigger('dblclick')
        const input = wrapper.find('[data-rename-input]')
        await input.setValue('改一半')
        await input.trigger('keydown', { key: 'Escape' })

        expect(editor.store.doc!.layers[0]!.name).toBe('')
        expect(editor.store.history).toHaveLength(0)
        expect(wrapper.find('[data-rename-input]').exists()).toBe(false)
        expect(rowLabels(wrapper)).toEqual(['TextLayer 1'])
        wrapper.unmount()
    })

    it('未命名层打开编辑未改字直接提交：退化为取消——不落 name 键、无历史步（用户重命名才落键）', async () => {
        const editor = makeEditor([textLayer(10, '顶')])
        const wrapper = mount(LayerPanel, { props: { editor } })

        await wrapper.findAll('.cn-layers__label')[0]!.trigger('dblclick')
        const input = wrapper.find('[data-rename-input]')
        expect((input.element as HTMLInputElement).value).toBe('TextLayer 1') // 初值 = 派生标签
        await input.trigger('keydown', { key: 'Enter' })

        expect(editor.store.doc!.layers[0]!.name).toBe('')
        expect(editor.store.history).toHaveLength(0)
        expect(wrapper.find('[data-rename-input]').exists()).toBe(false)
        expect(rowLabels(wrapper)).toEqual(['TextLayer 1'])

        // 失焦路径同语义：blur 提交与基线一致同样空转
        await wrapper.findAll('.cn-layers__label')[0]!.trigger('dblclick')
        await wrapper.find('[data-rename-input]').trigger('blur')
        expect(editor.store.doc!.layers[0]!.name).toBe('')
        expect(editor.store.history).toHaveLength(0)
        wrapper.unmount()
    })

    it('空名提交回退派生标签：name 归空串（不落键的缺省态）', async () => {
        const editor = makeEditor([{ ...textLayer(10, '顶'), name: '封面标题' }])
        const wrapper = mount(LayerPanel, { props: { editor } })

        await wrapper.findAll('.cn-layers__label')[0]!.trigger('dblclick')
        const input = wrapper.find('[data-rename-input]')
        await input.setValue('')
        await input.trigger('keydown', { key: 'Enter' })

        expect(editor.store.doc!.layers[0]!.name).toBe('')
        expect(rowLabels(wrapper)).toEqual(['TextLayer 1'])
        wrapper.unmount()
    })

    it('失焦提交：blur 落文档（与 Enter 同一漏斗，恰一步历史）', async () => {
        const editor = makeEditor([textLayer(10, '顶')])
        const wrapper = mount(LayerPanel, { props: { editor } })

        await wrapper.findAll('.cn-layers__label')[0]!.trigger('dblclick')
        const input = wrapper.find('[data-rename-input]')
        await input.setValue('失焦提交的名')
        await input.trigger('blur')

        expect(editor.store.doc!.layers[0]!.name).toBe('失焦提交的名')
        expect(editor.store.history).toHaveLength(1)
        wrapper.unmount()
    })

    it('hover 铅笔仅根层：点击进入行内编辑；行/格无铅笔、双击标签不开会话', async () => {
        const editor = makeEditor([textLayer(30, '底'), tableLayer([rowLayer(30), rowLayer(20)])])
        const wrapper = mount(LayerPanel, { props: { editor } })
        const rows = wrapper.findAll('.cn-layers__row')
        expect(wrapper.findAll('[data-rename]')).toHaveLength(2) // 两个根层行
        expect(rows[1]!.find('[data-rename]').exists()).toBe(false)
        expect(rows[2]!.find('[data-rename]').exists()).toBe(false)

        // 行/格双击标签不开重命名会话
        await rows[1]!.find('.cn-layers__label').trigger('dblclick')
        expect(wrapper.find('[data-rename-input]').exists()).toBe(false)

        // 铅笔点击进入编辑
        await rows[0]!.find('[data-rename]').trigger('click')
        expect(wrapper.find('[data-rename-input]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('F2：选中根层后经注册表分派（executeShortcut）开会话——与 useShortcuts 同一入口', async () => {
        const editor = makeEditor([textLayer(30, '底'), textLayer(10, '顶')])
        const wrapper = mount(LayerPanel, { props: { editor } })

        editor.setSelection(['layers', 0]) // 底 = 面板底行（面板顶 = 数组尾）
        editor.executeShortcut('rename')
        await wrapper.vm.$nextTick()

        const input = wrapper.find('[data-rename-input]')
        expect(input.exists()).toBe(true)
        expect((input.element as HTMLInputElement).value).toBe('TextLayer 2') // 初值 = 派生标签
        wrapper.unmount()
    })
})
