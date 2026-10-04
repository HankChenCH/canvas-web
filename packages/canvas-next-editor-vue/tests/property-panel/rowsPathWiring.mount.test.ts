// @vitest-environment jsdom
/**
 * rowsPath 补全属性面板接线测试（rows-path-completion 工单 03，D6/D3/D7/D10）。
 *
 * 面板全链路（真实候选源 = 工单 01 起点判别 + 枚举器，非桩）：rowsPath 标记字段
 * 走 usePathCompletion 裸路径浮层——输入即弹（标量不出候选）、`.` 刷新下钻出
 * 「行数组」徽标（文案在 usePropertyPanel source 组装处置入，浮层零改动）、
 * 键盘/鼠标接受 = 合成 input+change 走既有 updateSpec 分支（P3 结构语义透传不变，
 * 一步历史 undo 恢复）、229 合成期不接受、失焦关。
 *
 * 起点三分流（D3）：根层表 = 载荷根候选集；嵌套表 = 外层行 schema 行相对候选
 * （无 row 前缀——两层嵌套 = 外层表 + 格内嵌套表，图层路径语法允许的模板子树
 * 深度；更深层递归判别由绑定层测试覆盖）；外层 rowsPath 漂移 = degraded → null
 * 源零弹层（手输不受阻）。无 schema 注入零弹层（D7）。
 *
 * 按字段分发：data 门字段（text/src/value）仍走表达式源——rowsPath 源不串场
 * （表达式候选含标量键，rowsPath 候选只出 object/array，候选集形态即判别面）。
 * 表达式补全零回归由既有 completionWiring/expressionCompletion 测试零改动全绿
 * 共同实证。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

import { createTemplateTable, EditorSession, type FrameScheduler } from '@hankchen/canvas-next-editor'

import { cellLayer, rowTemplateLayer, tableLayer, textLayer } from '../../../canvas-next-editor/tests/support/fixtures'
import PropertyPanel from '../../src/property-panel/PropertyPanel.vue'

const nullScheduler: FrameScheduler = () => () => {}

/**
 * 载荷形态 schema（三层的嵌套面）：orderNo 标量不出候选；order 对象下钻；
 * items 行数组（行 = name 标量 + lines 嵌套数组；lines 行 = sku 标量）——
 * 与内核起点判别测试同构，行相对候选随层数收敛。
 */
const RAW_SCHEMA = {
    type: 'object',
    properties: {
        orderNo: { type: 'string', description: '订单编号' },
        order: {
            type: 'object',
            description: '订单信息',
            properties: {
                items: {
                    type: 'array',
                    description: '订单行明细',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: '商品名称' },
                            lines: {
                                type: 'array',
                                description: '行明细',
                                items: {
                                    type: 'object',
                                    properties: { sku: { type: 'string', description: 'SKU' } },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
}

const wrappers: VueWrapper[] = []

function makeEditor(layers: Parameters<EditorSession['openDocument']>[0]['layers']): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, layers })
    return editor
}

function mountPanel(editor: EditorSession): VueWrapper {
    const wrapper = mount(PropertyPanel, { props: { editor } })
    wrappers.push(wrapper)
    return wrapper
}

/** 外层表（order.items）→ 内层表（lines，行相对）→ 叶表（sku）两层嵌套装配 */
function nestedTableLayer() {
    const leafTable = tableLayer([], { rowsPath: 'sku', template: rowTemplateLayer([cellLayer(textLayer())]) })
    const innerTable = tableLayer([], { rowsPath: 'lines', template: rowTemplateLayer([cellLayer(leafTable)]) })
    return tableLayer([], { rowsPath: 'order.items', template: rowTemplateLayer([cellLayer(innerTable)]) })
}

/** rowsPath 输入框（数据节 text 控件，面板唯一带该 placeholder 的输入） */
function rowsPathInput(wrapper: VueWrapper) {
    const input = wrapper.find<HTMLInputElement>('input[placeholder="如 order.items"]')
    if (!input.exists()) throw new Error('rowsPath 输入框未渲染（visibleWhen 未放行？）')
    return input
}

/** 模拟输入：直设 DOM 值 + 光标再派发 input（completionWiring.mount.test 同款） */
async function typeRowsPath(wrapper: VueWrapper, value: string, cursor: number): Promise<void> {
    const input = rowsPathInput(wrapper)
    input.element.value = value
    input.element.setSelectionRange(cursor, cursor)
    await input.trigger('input')
}

async function pressEnter(wrapper: VueWrapper, init: KeyboardEventInit = {}): Promise<void> {
    rowsPathInput(wrapper).element.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init }),
    )
    await nextTick()
}

/** 浮层经 Teleport 挂 body，断言绕过 wrapper 直接查 document */
const popupOpen = (): boolean => document.body.querySelector('.cn-completion') !== null
const optionEls = (): HTMLElement[] => Array.from(document.body.querySelectorAll('.cn-completion__option'))
const optionSegments = (): string[] =>
    optionEls().map((option) => option.querySelector('.cn-completion__segment')?.textContent ?? '')
const optionTexts = (): string[] => optionEls().map((option) => option.textContent ?? '')

function rowsPathOf(editor: EditorSession): string {
    const layer = editor.store.doc!.layers[0]!
    if (layer.type !== 'TableLayer') throw new Error('选中层不是 TableLayer')
    return layer.rowsPath
}

afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
})

describe('标记字段弹层全链路（根层表 = 根候选集）', () => {
    it('输入即弹：标量不出候选、`.` 刷新下钻、「行数组」徽标与元信息透出', async () => {
        const editor = makeEditor([createTemplateTable({ rowsPath: 'or' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await typeRowsPath(wrapper, 'or', 2)
        expect(popupOpen()).toBe(true)
        // orderNo 标量不出候选（水合要求终点为数组）；order 对象中间站在列
        expect(optionSegments()).toEqual(['order'])

        // `.` 刷新下钻：items 是数组终点——「行数组」文案（source 组装处置入）
        // 与 description 元信息同透浮层
        await typeRowsPath(wrapper, 'order.', 6)
        expect(popupOpen()).toBe(true)
        expect(optionSegments()).toEqual(['items'])
        expect(optionTexts()[0]).toContain('行数组')
        expect(optionTexts()[0]).toContain('订单行明细')
    })

    it('键盘接受：Enter 补段 = 合成 input+change 走 updateSpec，一步历史 undo 恢复', async () => {
        const editor = makeEditor([createTemplateTable({ rowsPath: 'order.' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await typeRowsPath(wrapper, 'order.', 6)
        expect(popupOpen()).toBe(true)
        await pressEnter(wrapper)
        expect(popupOpen()).toBe(false)

        // P3 结构语义透传：rowsPath 落 graph 走既有 updateSpec 分支
        expect(rowsPathOf(editor)).toBe('order.items')
        // 手输（live）与接受（change 收口）同并入一个 mergeKey 会话 = 一步历史
        expect(editor.store.history).toHaveLength(1)
        editor.undo()
        await nextTick()
        expect(rowsPathOf(editor)).toBe('order.')
    })

    it('鼠标点选接受：同走提交管线落 graph', async () => {
        const editor = makeEditor([createTemplateTable({ rowsPath: 'order.' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await typeRowsPath(wrapper, 'order.', 6)
        optionEls()[0]!.click()
        await nextTick()
        expect(popupOpen()).toBe(false)
        expect(rowsPathOf(editor)).toBe('order.items')
    })

    it('229 合成期不接受：keydown 229 Enter 不触发接受（浮层保持、值不变）', async () => {
        const editor = makeEditor([createTemplateTable({ rowsPath: 'order.' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await typeRowsPath(wrapper, 'order.', 6)
        expect(popupOpen()).toBe(true)
        rowsPathInput(wrapper).element.dispatchEvent(new Event('compositionstart'))
        await pressEnter(wrapper, { keyCode: 229, isComposing: true } as KeyboardEventInit)
        expect(popupOpen()).toBe(true)
        expect(rowsPathOf(editor)).toBe('order.')
    })

    it('失焦关闭浮层', async () => {
        const editor = makeEditor([createTemplateTable({ rowsPath: 'or' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await typeRowsPath(wrapper, 'or', 2)
        expect(popupOpen()).toBe(true)
        rowsPathInput(wrapper).trigger('blur')
        await nextTick()
        expect(popupOpen()).toBe(false)
    })
})

describe('嵌套表行相对候选（D3 起点三分流）', () => {
    it('两层嵌套：内层表候选自外层行 schema（行相对无前缀，标量行键不出）', async () => {
        const editor = makeEditor([nestedTableLayer()])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0, 'template', 'cells', 0, 'content'])
        await nextTick()

        // 外层行 schema = items 的 items（name 标量 + lines 数组）：候选只出 lines
        await typeRowsPath(wrapper, 'li', 2)
        expect(popupOpen()).toBe(true)
        expect(optionSegments()).toEqual(['lines'])
    })

    it('外层 rowsPath 漂移：degraded → null 源零弹层，手输不受阻', async () => {
        const drifted = tableLayer([], {
            rowsPath: 'order.missing',
            template: rowTemplateLayer([cellLayer(tableLayer([], { rowsPath: 'lines', template: rowTemplateLayer([cellLayer(textLayer())]) }))]),
        })
        const editor = makeEditor([drifted])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0, 'template', 'cells', 0, 'content'])
        await nextTick()

        await typeRowsPath(wrapper, 'li', 2)
        expect(popupOpen()).toBe(false)
        // D7：辅助声明不作权威——静默不弹，手输照常落库
        expect(rowsPathInput(wrapper).element.value).toBe('li')
    })
})

describe('降级与分发面', () => {
    it('无 schema 注入：零弹层（D7 辅助声明缺席 = 无候选态）', async () => {
        const editor = makeEditor([createTemplateTable({ rowsPath: 'or' })])
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await typeRowsPath(wrapper, 'or', 2)
        expect(popupOpen()).toBe(false)
    })

    it('data 门字段仍走表达式源：候选含标量键（rowsPath 源不串场的判别面）', async () => {
        const editor = makeEditor([textLayer({ text: '{{or', expression: '{{or' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        const field = wrapper.find('textarea')
        field.element.value = '{{or'
        ;(field.element as HTMLTextAreaElement).setSelectionRange(5, 5)
        await field.trigger('input')
        expect(popupOpen()).toBe(true)
        // 表达式源给 orderNo（标量也出）；rowsPath 源只出 object/array——候选集形态即分发判别
        expect(optionSegments()).toEqual(['orderNo', 'order'])
    })
})
