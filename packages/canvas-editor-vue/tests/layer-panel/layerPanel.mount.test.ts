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

import {
    EditorSession,
    type FrameScheduler,
    type Layer,
    type TableCellLayer,
    type TextLayer,
    type TableRowLayer,
} from '@hankchen/canvas-editor'

import LayerPanel from '../../src/layer-panel/LayerPanel.vue'
import { isUpperHalf } from '../../src/layer-panel/useLayerPanel'
import { useTransientFeedback } from '../../src/shared/useTransientFeedback'

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

// 返回精确层型（非宽 Layer union）：带标记/带内容的用例要 spread 覆写 expression/content
// 等部分成员才有的键，宽 union spread 会触发逐成员 EPC
const textLayer = (priority: number, text: string): TextLayer => ({
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

const cellLayer = (width: number): TableCellLayer => ({
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

/** 模板态表 + 一格的最小文档：格内容由调用方给（缺省 null = 无内容） */
function templateTableDoc(content: Layer | null = null): Layer[] {
    const table: Layer = {
        type: 'TableLayer',
        name: '',
        visible: true,
        priority: 5,
        shape: baseShape(600, 200),
        align: baseAlign,
        position: basePosition,
        rowsPath: 'order.items',
        rows: [],
        template: {
            type: 'TableRowTemplate',
            name: '',
            visible: true,
            priority: 0,
            shape: baseShape(600, 0),
            align: baseAlign,
            position: basePosition,
            cells: [
                {
                    type: 'TableCellLayer',
                    name: '',
                    visible: true,
                    priority: 0,
                    shape: baseShape(300, 0),
                    align: baseAlign,
                    position: basePosition,
                    content,
                },
            ],
        },
    }
    return [table]
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

    it('新增菜单点击 = armLayerCreate 武装（drag-create 工单 03）：不再直建落层——文档零变化、armedCreate 置层型、菜单收起、瞬时提示上状态栏', async () => {
        const editor = makeEditor([textLayer(30, '底'), textLayer(10, '顶')])
        const wrapper = mount(LayerPanel, { props: { editor } })

        await wrapper.find('[data-add-menu]').trigger('click')
        await wrapper.find('[data-add-layer="TextLayer"]').trigger('click')
        // 不再直建落 (0,0)：落库改由画拉 endCreate（内核工单 01 已测）
        expect(editor.store.doc!.layers).toHaveLength(2)
        expect(editor.store.history).toHaveLength(0)
        expect(editor.store.ui.armedCreate).toBe('TextLayer')
        // 菜单即收（武装是面板外的画布手势，弹层不留场）
        expect(wrapper.find('[data-add-layer]').exists()).toBe(false)
        // 武装态状态栏瞬时提示（useTransientFeedback 通道，面板与快捷键两入口同句）
        expect(useTransientFeedback().message.value).toBe('画拉或点击落层，Esc 取消')
        wrapper.unmount()
    })

    it('新增菜单连续武装换型：先文本后二维码，armedCreate 跟随最后一次武装（同型值等短路归内核）', async () => {
        const editor = makeEditor([])
        const wrapper = mount(LayerPanel, { props: { editor } })

        await wrapper.find('[data-add-menu]').trigger('click')
        await wrapper.find('[data-add-layer="TextLayer"]').trigger('click')
        expect(editor.store.ui.armedCreate).toBe('TextLayer')

        await wrapper.find('[data-add-menu]').trigger('click')
        await wrapper.find('[data-add-layer="QrCodeLayer"]').trigger('click')
        expect(editor.store.ui.armedCreate).toBe('QrCodeLayer')
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
    it('新增菜单五入口（spec §2.1）：四类图层 + 模板表（行模板不单卖，template-table 是表的创建形态）', async () => {
        const editor = makeEditor([])
        const wrapper = mount(LayerPanel, { props: { editor } })

        await wrapper.find('[data-add-menu]').trigger('click')
        const adds = wrapper.findAll('[data-add-layer]')
        expect(adds.map((button) => button.attributes('data-add-layer'))).toEqual([
            'TextLayer',
            'ImageLayer',
            'QrCodeLayer',
            'TableLayer',
            'template-table',
        ])
        wrapper.unmount()
    })

    it('新增菜单弹层走底座（issues/05）：菜单根是 DropdownMenu 壳（role=menu），aside overflow 滚动容器的裁切问题结构性消失——旧「absolute 右缘对齐 + 遮罩」手搓退役（jsdom 无几何，几何回归由浏览器回路把守）', async () => {
        const editor = makeEditor([])
        const wrapper = mount(LayerPanel, { props: { editor } })

        expect(wrapper.find('[data-dropdown-menu]').exists()).toBe(false)
        await wrapper.find('[data-add-menu]').trigger('click')
        const menu = wrapper.find('[data-dropdown-menu]')
        expect(menu.exists()).toBe(true)
        expect(menu.attributes('role')).toBe('menu')
        // 旧遮罩（点击收菜单的透明垫层）已被底座容器包含判定的点外收取代
        expect(wrapper.find('[data-add-backdrop]').exists()).toBe(false)
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

describe('LayerPanel：显示/隐藏（工单 10）', () => {
    it('眼睛钮仅根层行：行/格/内容行不加', () => {
        const editor = makeEditor([textLayer(30, '底'), tableLayer([rowLayer(30), rowLayer(20)])])
        const wrapper = mount(LayerPanel, { props: { editor } })
        const rows = wrapper.findAll('.cn-layers__row')
        // 面板序：表（根）、行1、行2、文本（根）——眼睛只落在两个根层行
        expect(wrapper.findAll('[data-visibility]')).toHaveLength(2)
        expect(rows[0]!.find('[data-visibility]').exists()).toBe(true)
        expect(rows[1]!.find('[data-visibility]').exists()).toBe(false)
        expect(rows[2]!.find('[data-visibility]').exists()).toBe(false)
        expect(rows[3]!.find('[data-visibility]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('点击眼睛走 toggleLayerVisibility：翻转 visible、一步历史可撤销', async () => {
        const editor = makeEditor([textLayer(10, '顶')])
        const wrapper = mount(LayerPanel, { props: { editor } })

        await wrapper.find('[data-visibility]').trigger('click')
        expect(editor.store.doc!.layers[0]!.visible).toBe(false)
        expect(editor.store.history).toHaveLength(1)
        // 隐藏行降不透明度（--hidden 类）+ 闭眼态（aria-pressed）
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.cn-layers__row').classes()).toContain('cn-layers__row--hidden')
        expect(wrapper.find('[data-visibility]').attributes('aria-pressed')).toBe('true')

        editor.undo()
        await wrapper.vm.$nextTick()
        expect(editor.store.doc!.layers[0]!.visible).toBe(true)
        expect(wrapper.find('.cn-layers__row').classes()).not.toContain('cn-layers__row--hidden')
        expect(wrapper.find('[data-visibility]').attributes('aria-pressed')).toBe('false')
        wrapper.unmount()
    })

    it('可见行眼睛 hover 门控（hidden 类等待 group-hover），隐藏行闭眼常显（无 hidden 类）', () => {
        const editor = makeEditor([textLayer(30, '底'), { ...textLayer(10, '顶'), visible: false }])
        const wrapper = mount(LayerPanel, { props: { editor } })
        const eyes = wrapper.findAll('[data-visibility]')
        // 面板顶 = 数组尾 = 隐藏层：常显；面板底 = 可见层：hover 门控
        expect(eyes[0]!.classes()).not.toContain('hidden')
        expect(eyes[1]!.classes()).toContain('hidden')
        wrapper.unmount()
    })

    it('点击眼睛不触发行选中（@click.stop，显隐不改选择）', async () => {
        const editor = makeEditor([textLayer(10, '顶')])
        const wrapper = mount(LayerPanel, { props: { editor } })

        await wrapper.find('[data-visibility]').trigger('click')
        expect(editor.store.ui.selection).toBeNull()
        wrapper.unmount()
    })
})

// ---- 模板创作（spec §2.1/§2.2/§2.5）：菜单建模板表 + 模板态大纲操作面 ----

describe('LayerPanel：模板表创建菜单（spec §2.1）', () => {
    it('模板表经菜单表单创建：rowsPath 必填（空串就地拦）→ 创建 + 自动选中', async () => {
        const editor = makeEditor([])
        const wrapper = mount(LayerPanel, { props: { editor } })

        await wrapper.find('[data-add-menu]').trigger('click')
        await wrapper.find('[data-add-layer="template-table"]').trigger('click')
        expect(wrapper.find('[data-template-rows-path]').exists()).toBe(true)

        // 空串确认 → 就地标错、文档零变化
        await wrapper.find('[data-template-rows-path]').setValue('  ')
        await wrapper.find('[data-template-confirm]').trigger('click')
        expect(editor.store.doc!.layers).toHaveLength(0)
        expect(wrapper.find('[data-template-rows-path]').classes().some((c) => c.includes('border-cn-danger'))).toBe(true)

        // 非空确认 → 建表 + 选中（缺省格带文本内容）；模板表保持表单直建语义
        // （spec 决策 3 唯一直建例外，不武装不提示——rowsPath 必填校验就地拦）
        await wrapper.find('[data-template-rows-path]').setValue('order.items')
        await wrapper.find('[data-template-confirm]').trigger('click')
        const layers = editor.store.doc!.layers
        expect(layers).toHaveLength(1)
        const table = layers[0]!
        if (table.type !== 'TableLayer') throw new Error('expected TableLayer')
        expect(table.rowsPath).toBe('order.items')
        expect(table.template).not.toBeNull()
        expect(table.template!.cells).toHaveLength(1)
        expect(table.template!.cells[0]!.content?.type).toBe('TextLayer')
        expect(editor.store.ui.selection).toEqual(['layers', 0])
        expect(editor.store.ui.armedCreate).toBeNull()
        wrapper.unmount()
    })
})

describe('LayerPanel：模板态大纲与操作面（spec §2.2/§2.5）', () => {
    it('大纲渲染行模板节点；+行 置灰；行模板 ✕ 置灰（spec §2.5 反馈规范）', async () => {
        const editor = makeEditor(templateTableDoc())
        const wrapper = mount(LayerPanel, { props: { editor } })

        const labels = wrapper.findAll('.cn-layers__label').map((node) => node.text())
        expect(labels).toContain('⌗ 行模板')

        const addRow = wrapper.find('[data-add-row]')
        expect(addRow.attributes('disabled')).toBeDefined()
        expect(addRow.attributes('title')).toBe('模板态不可加行——行由数据展开')

        const templateRowEl = wrapper.findAll('li').find((li) => li.text().includes('行模板'))!
        const removeButton = templateRowEl.findAll('button').find((button) => button.text() === '✕')!
        expect(removeButton.attributes('disabled')).toBeDefined()
        expect(removeButton.attributes('title')).toContain('行模板由表持有')
        wrapper.unmount()
    })

    it('行模板 +格 走 addTemplateCell：零高度耦合加格 + 自动选中新格（spec §3.1）', async () => {
        const editor = makeEditor(templateTableDoc())
        const wrapper = mount(LayerPanel, { props: { editor } })

        const templateRowEl = wrapper.findAll('li').find((li) => li.text().includes('行模板'))!
        await templateRowEl.find('[data-add-template-cell]').trigger('click')

        const table = editor.store.doc!.layers[0]!
        if (table.type !== 'TableLayer') throw new Error('expected TableLayer')
        expect(table.template!.cells).toHaveLength(2)
        expect(table.template!.shape.height).toBe(0)
        expect(table.template!.cells[1]!.content?.type).toBe('TextLayer')
        expect(editor.store.ui.selection).toEqual(['layers', 0, 'template', 'cells', 1])
        wrapper.unmount()
    })

    it('模板格同行拖拽放行（canDrop 同容器）；格点选走替身路径（spec §2.2 D3）', async () => {
        const editor = makeEditor(templateTableDoc())
        const wrapper = mount(LayerPanel, { props: { editor } })

        const cellEl = wrapper.findAll('li').find((li) => li.text().includes('格 1'))!
        await cellEl.trigger('click')
        expect(editor.store.ui.selection).toEqual(['layers', 0, 'template', 'cells', 0])
        wrapper.unmount()
    })
})

// ---- 表达式前置（layer-panel-expression-prefix 工单 02）：行内只吃预构建投影 ----

describe('LayerPanel：表达式前置（layer-panel-expression-prefix 工单 02）', () => {
    /** 带标记文本层：expression 原文照携，前置串由内核投影算好（面板零计算） */
    const marked = (expression: string, priority = 10): TextLayer => ({
        ...textLayer(priority, '内容'),
        expression,
    })

    it('根层行前置：前置 span 内容与 title = 完整片段串；未标记行零元素；全无效片段显示占位常量；点行选层不变', async () => {
        const editor = makeEditor([textLayer(30, '无标记'), marked('编号 {{ certCode }} 尾', 20), marked('纯字面')])
        const wrapper = mount(LayerPanel, { props: { editor } })

        // 面板序：占位行、certCode 行、无标记行——只两个带标记行有前置元素
        const prefixes = wrapper.findAll('.cn-layers__prefix')
        expect(prefixes).toHaveLength(2)
        expect(prefixes[0]!.text()).toBe('{{…}}')
        expect(prefixes[0]!.attributes('title')).toBe('{{…}}')
        expect(prefixes[1]!.text()).toBe('{{certCode}}')
        expect(prefixes[1]!.attributes('title')).toBe('{{certCode}}')

        // 带前置行的点选行为零变化
        await wrapper.findAll('.cn-layers__row')[1]!.trigger('click')
        expect(editor.store.ui.selection).toEqual(['layers', 1])
        wrapper.unmount()
    })

    it('覆盖面：实例格内容与模板子树格内容行显示；表/行/格/行模板骨架行无前置', () => {
        const v1Table = tableLayer([rowLayer(30, [{ ...cellLayer(600), content: marked('{{certCode}}') }])])
        const editor = makeEditor([v1Table, ...templateTableDoc(marked('{{personProfile.name}}'))])
        const wrapper = mount(LayerPanel, { props: { editor } })

        const rows = wrapper.findAll('.cn-layers__row')
        expect(rows).toHaveLength(8)
        // 前置只落在两条内容行（判据看层型 + 标记的投影结果，面板不分 role）；
        // 面板序 = 数组逆序：模板表在 layers.1 先渲染
        const prefixedKeys = rows
            .filter((row) => row.find('.cn-layers__prefix').exists())
            .map((row) => row.attributes('data-key'))
        expect(prefixedKeys).toEqual(['layers.1.template.cells.0.content', 'layers.0.rows.0.cells.0.content'])
        expect(rows[3]!.find('.cn-layers__prefix').text()).toBe('{{personProfile.name}}')
        expect(rows[7]!.find('.cn-layers__prefix').text()).toBe('{{certCode}}')
        wrapper.unmount()
    })

    it('重命名会话共存：input 只替换标签槽位，前置 span 仍在', async () => {
        const editor = makeEditor([marked('{{personProfile.name}}')])
        const wrapper = mount(LayerPanel, { props: { editor }, attachTo: document.body })

        await wrapper.findAll('.cn-layers__label')[0]!.trigger('dblclick')
        await wrapper.vm.$nextTick()
        expect(wrapper.find('[data-rename-input]').exists()).toBe(true)
        const prefix = wrapper.find('.cn-layers__prefix')
        expect(prefix.exists()).toBe(true)
        expect(prefix.text()).toBe('{{personProfile.name}}')
        wrapper.unmount()
    })
})

// ---- 锁定（canvas-web-layer-lock 工单 02）：锁定钮/删除禁用/行透明度语义 ----

describe('LayerPanel：锁定（canvas-web-layer-lock 工单 02）', () => {
    it('锁定钮仅根层行（与眼睛同门，行/格/内容不设锁）；点击走 toggleLayerLock：ui 变更零历史步、不选中行', async () => {
        const editor = makeEditor([textLayer(30, '底'), tableLayer([rowLayer(30), rowLayer(20)])])
        const wrapper = mount(LayerPanel, { props: { editor } })
        // 面板序：表(根)、行、行、文本(根)——锁钮只落两个根层行
        expect(wrapper.findAll('[data-lock]')).toHaveLength(2)
        const rows = wrapper.findAll('.cn-layers__row')
        expect(rows[1]!.find('[data-lock]').exists()).toBe(false)
        expect(rows[2]!.find('[data-lock]').exists()).toBe(false)

        // 点底行（数组头 ['layers',0]）锁钮 → 锁定；ui 变更不进历史、不触发行选中
        await rows[3]!.find('[data-lock]').trigger('click')
        expect(editor.store.ui.lockedPaths).toEqual([['layers', 0]])
        expect(editor.store.history).toHaveLength(0)
        expect(editor.store.ui.selection).toBeNull()
        // 常显闭锁态（aria-pressed 翻转）
        expect(rows[3]!.find('[data-lock]').attributes('aria-pressed')).toBe('true')

        // 再点解锁
        await rows[3]!.find('[data-lock]').trigger('click')
        expect(editor.store.ui.lockedPaths).toEqual([])
        wrapper.unmount()
    })

    it('未锁行 hover 门控（hidden 类等待 group-hover），锁定行闭锁常显（无 hidden 类）', async () => {
        const editor = makeEditor([textLayer(30, '底'), textLayer(10, '顶')])
        editor.toggleLayerLock(['layers', 0]) // 面板底行锁定
        const wrapper = mount(LayerPanel, { props: { editor } })
        const locks = wrapper.findAll('[data-lock]')
        // 面板顶 = 数组尾（未锁）：hover 门控；面板底（锁定）：常显
        expect(locks[0]!.classes()).toContain('hidden')
        expect(locks[0]!.attributes('aria-pressed')).toBe('false')
        expect(locks[1]!.classes()).not.toContain('hidden')
        expect(locks[1]!.attributes('aria-pressed')).toBe('true')
        wrapper.unmount()
    })

    it('锁定行不降不透明度：--hidden 类只随显隐走（锁定 ≠ 隐藏，两态独立可叠加）', async () => {
        const editor = makeEditor([{ ...textLayer(30, '底'), visible: false }, textLayer(10, '顶')])
        editor.toggleLayerLock(['layers', 0]) // 底行锁定 + 隐藏叠加
        const wrapper = mount(LayerPanel, { props: { editor } })
        const rows = wrapper.findAll('.cn-layers__row')
        // 锁定 + 隐藏：--hidden 来自显隐语义（降不透明度表达「不出现」）
        expect(rows[1]!.classes()).toContain('cn-layers__row--hidden')
        expect(rows[1]!.find('[data-lock]').attributes('aria-pressed')).toBe('true')
        // 锁定的可见行不加任何透明度类（locked 表达「出现但受保护」）
        editor.toggleLayerLock(['layers', 1])
        await wrapper.vm.$nextTick()
        expect(rows[0]!.classes()).not.toContain('cn-layers__row--hidden')
        wrapper.unmount()
    })

    it('删除钮对锁定子树全树 disabled（根层 + 行/格，内核 deleteLayer 空转为权威）；解锁恢复', async () => {
        const editor = makeEditor([
            tableLayer([rowLayer(30, [cellLayer(300), cellLayer(300)]), rowLayer(20)]),
            textLayer(5, '邻'),
        ])
        editor.toggleLayerLock(['layers', 0]) // 锁定表（整子树受保护）
        const wrapper = mount(LayerPanel, { props: { editor } })
        const rows = wrapper.findAll('.cn-layers__row')
        // 面板序：邻(未锁根)、表(锁根)、行0、格、格、行1
        const removeOf = (row: DOMWrapper<Element>) =>
            row.findAll('button').find((button) => button.text() === '✕')!
        expect(removeOf(rows[0]!).attributes('disabled')).toBeUndefined()
        for (const row of rows.slice(1)) {
            expect(removeOf(row)!.attributes('disabled')).toBeDefined()
            expect(removeOf(row)!.attributes('title')).toContain('锁定')
        }

        // 解锁后恢复可用
        editor.toggleLayerLock(['layers', 0])
        await wrapper.vm.$nextTick()
        expect(rows.map((row) => removeOf(row)!.attributes('disabled')).filter(Boolean)).toHaveLength(0)
        wrapper.unmount()
    })

    it('锁定子树的删除钮点击不落内核（disabled 属性拦截，无历史步）', async () => {
        const editor = makeEditor([textLayer(10, '顶')])
        editor.toggleLayerLock(['layers', 0])
        const wrapper = mount(LayerPanel, { props: { editor } })
        const remove = wrapper.findAll('button').find((button) => button.text() === '✕')!
        await remove.trigger('click')
        expect(editor.store.doc!.layers).toHaveLength(1)
        expect(editor.store.history).toHaveLength(0)
        wrapper.unmount()
    })

    it('锁定钮/删除钮的键位提示按平台渲染：缺省 win 文本系（Ctrl+Shift+L），mac 桩 ⇧⌘L', async () => {
        const editor = makeEditor([textLayer(10, '顶')])
        editor.toggleLayerLock(['layers', 0]) // 锁定行：锁定钮常显 + 删除钮置灰，两处 title 带键位提示
        const original = window.navigator
        Object.defineProperty(window, 'navigator', { value: { platform: 'MacIntel' }, configurable: true })
        try {
            const wrapper = mount(LayerPanel, { props: { editor } })
            const lock = wrapper.find('[data-lock]')
            const remove = wrapper.findAll('button').find((button) => button.text() === '✕')!
            expect(lock.attributes('title')).toBe('解锁图层（⇧⌘L）')
            expect(remove.attributes('title')).toBe('图层已锁定（⇧⌘L 解锁后可删除）')
            wrapper.unmount()
        } finally {
            Object.defineProperty(window, 'navigator', { value: original, configurable: true })
        }

        const wrapper = mount(LayerPanel, { props: { editor } })
        expect(wrapper.find('[data-lock]').attributes('title')).toBe('解锁图层（Ctrl+Shift+L）')
        expect(wrapper.findAll('button').find((button) => button.text() === '✕')!.attributes('title')).toBe(
            '图层已锁定（Ctrl+Shift+L 解锁后可删除）',
        )
        wrapper.unmount()
    })
})
