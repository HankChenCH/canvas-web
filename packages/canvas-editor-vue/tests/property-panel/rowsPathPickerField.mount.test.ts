// @vitest-environment jsdom
/**
 * rowsPath 字段换装 mount 测试（rows-path-picker 工单 03，spec §2 D1/D2/D7）。
 *
 * 面板全链路（真实候选源 = 工单 01 起点三分流 + 剪枝枚举件，非桩）：数据节
 * rowsPath 字段 = rowsPath mode 级联点选器——无文本输入缝（只读回显框 + 菜单钮，
 * label 翻新「取行路径」）；点选数组终点双发 input+change 走既有 updateSpec 分支
 * （D7 结构语义透传，一步历史 undo 恢复）；剪枝面（标量不出、数组终点带「行数组」
 * 徽标）；嵌套表行相对候选（外层行 schema 起点，标量行键不出）；门态（D1 未绑
 * 声明：菜单钮不渲染 + 只读回显 + 弱提示行 + 不判漂移）；漂移（D2 已提交值枚举
 * 不出/终点非数组：回显标红、菜单照常可开可重选，重选落 graph 后红退）。
 * 表达式补全面零回归由既有 completionWiring/expressionCompletion 测试零改动全绿
 * 共同实证。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

import { createTemplateTable, EditorSession, type FrameScheduler, type LayerPath } from '@hankchen/canvas-editor'

import { cellLayer, rowTemplateLayer, tableLayer, textLayer } from '../../../canvas-editor/tests/support/fixtures'
import PropertyPanel from '../../src/property-panel/PropertyPanel.vue'

const nullScheduler: FrameScheduler = () => () => {}

/**
 * 载荷形态 schema：orderNo 标量与无可达数组子树不进点选面；order.items 与
 * org.members 两根可达行数组（根层表可二选一）；items 行 = name 标量 + lines/tags
 * 两数组（嵌套表行相对候选可二选一）。
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
                            tags: {
                                type: 'array',
                                description: '标签列表',
                                items: {
                                    type: 'object',
                                    properties: { label: { type: 'string' } },
                                },
                            },
                        },
                    },
                },
            },
        },
        org: {
            type: 'object',
            properties: {
                members: {
                    type: 'array',
                    description: '成员列表',
                    items: { type: 'object', properties: { role: { type: 'string' } } },
                },
            },
        },
    },
}

const wrappers: VueWrapper[] = []

function makeEditor(layers: Parameters<EditorSession['openDocument']>[0]['layers']): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, background: null, layers })
    return editor
}

function mountPanel(editor: EditorSession): VueWrapper {
    const wrapper = mount(PropertyPanel, { props: { editor } })
    wrappers.push(wrapper)
    return wrapper
}

/** 内层表（lines，行相对）装配：外层表（order.items）模板格内容即内层表 */
function nestedTableLayer() {
    const innerTable = tableLayer([], { rowsPath: 'lines', template: rowTemplateLayer([cellLayer(textLayer())]) })
    return tableLayer([], { rowsPath: 'order.items', template: rowTemplateLayer([cellLayer(innerTable)]) })
}

/** rowsPath 字段行（数据节点选器行）：label 翻新后的行定位缝 */
function rowsPathRow(wrapper: VueWrapper) {
    const row = wrapper.findAll('.cn-prop-field').find((row) => row.text().includes('取行路径'))
    if (!row) throw new Error('rowsPath 字段行未渲染（visibleWhen 未放行或 label 未翻新？）')
    return row
}

/** 菜单浮层经 Teleport 挂 body，断言绕过 wrapper 直接查 document（工单 02 mount 同款） */
const menuOpen = (): boolean => document.body.querySelector('.cn-pathpicker__menu') !== null
const optionEls = (): HTMLElement[] => Array.from(document.body.querySelectorAll('.cn-pathpicker__option'))
const optionSegments = (): string[] =>
    optionEls().map((option) => option.querySelector('.cn-pathpicker__segment')?.textContent ?? '')
const optionTexts = (): string[] => optionEls().map((option) => option.textContent ?? '')

async function openMenu(wrapper: VueWrapper): Promise<void> {
    await wrapper.find('.cn-pathpicker__toggle').trigger('click')
    await nextTick()
}

function rowsPathAt(editor: EditorSession, path: LayerPath): string {
    let node: unknown = editor.store.doc
    for (const segment of path) {
        if (node === null || typeof node !== 'object') throw new Error(`路径解不到：${path.join('.')}`)
        node = (node as Record<string, unknown>)[segment]
    }
    const layer = node as { rowsPath?: string }
    if (typeof layer.rowsPath !== 'string') throw new Error('选中层不是模板表')
    return layer.rowsPath
}

afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
})

describe('换装面（点选器替手输框 + label 翻新）', () => {
    it('数据节 label「取行路径」+ 只读回显框 + 菜单钮，行内无文本输入缝', async () => {
        const editor = makeEditor([createTemplateTable({ rowsPath: 'order.items' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        // label 断言同步（rowspath-label-rename 随本单落地）：旧文案退役
        expect(wrapper.text()).toContain('取行路径')
        expect(wrapper.text()).not.toContain('数据行路径')

        const row = rowsPathRow(wrapper)
        // 只读回显框回显既有值；值框是 div 非输入元素（无手输缝）
        const valueBox = row.find('.cn-pathpicker__value')
        expect(valueBox.exists()).toBe(true)
        expect(valueBox.text()).toBe('order.items')
        expect(valueBox.element.tagName).toBe('DIV')
        expect(row.find('input').exists()).toBe(false)
        // 候选源在场（已绑声明）：菜单钮渲染
        expect(row.find('.cn-pathpicker__toggle').exists()).toBe(true)
    })
})

describe('点选落 graph（D7 提交管线不动）', () => {
    it('剪枝候选逐层点选数组终点：updateSpec 透传落 graph，一步历史 undo 恢复', async () => {
        const editor = makeEditor([createTemplateTable({ rowsPath: 'org.members' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        await openMenu(wrapper)
        // 头层剪枝：orderNo 标量不出；order/org 对象中间站在列。候选集形态即分发
        // 判别——rowsPath 控件源只出通往行数组的路径（表达式源在此层会含 orderNo
        // 标量与 $root 结构头），两源不串场
        expect(optionSegments()).toEqual(['order', 'org'])

        // 点对象下钻 → items 数组终点带「行数组」徽标与元信息
        await optionEls()[0]!.click()
        await nextTick()
        expect(optionSegments()).toEqual(['items'])
        expect(optionTexts()[0]).toContain('行数组')
        expect(optionTexts()[0]).toContain('订单行明细')

        // 点数组终点提交：菜单收起、值落 graph（updateSpec 结构语义透传）
        await optionEls()[0]!.click()
        await nextTick()
        expect(menuOpen()).toBe(false)
        expect(rowsPathAt(editor, ['layers', 0])).toBe('order.items')

        // 点选 = live+change 同键合步：一个点选会话至多一步历史
        expect(editor.store.history).toHaveLength(1)
        editor.undo()
        await nextTick()
        expect(rowsPathAt(editor, ['layers', 0])).toBe('org.members')
    })

    it('嵌套表行相对候选：内层起点 = 外层行 schema（标量行键不出、数组终点直点）', async () => {
        const editor = makeEditor([nestedTableLayer()])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        const innerPath: LayerPath = ['layers', 0, 'template', 'cells', 0, 'content']
        editor.setSelection(innerPath)
        await nextTick()

        await openMenu(wrapper)
        // 外层行 schema（items.items）= name 标量 + lines/tags 两数组：候选只出两数组
        // 终点（标量剪掉、数组即终点不折返下钻层）
        expect(optionSegments()).toEqual(['lines', 'tags'])
        expect(optionTexts()[1]).toContain('标签列表')

        // 数组终点头层直点：写内层 rowsPath（行相对起点，值不带外层前缀）
        await optionEls()[1]!.click()
        await nextTick()
        expect(menuOpen()).toBe(false)
        expect(rowsPathAt(editor, innerPath)).toBe('tags')
    })
})

describe('门态（D1：声明为门，不设手输缝）', () => {
    it('未绑 schema：菜单钮不渲染、只读回显既有值、弱提示行指引绑定、不判漂移', async () => {
        const editor = makeEditor([createTemplateTable({ rowsPath: 'order.items' })])
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        const row = rowsPathRow(wrapper)
        expect(row.find('.cn-pathpicker__toggle').exists()).toBe(false)
        expect(row.find('.cn-pathpicker__value').text()).toBe('order.items')
        // 弱提示（同资源面 bindingGateHint：缺席原因 + 「先绑定数据源」去向）
        expect(row.text()).toContain('绑定数据源后可选择字段')
        // 门态不判漂移：无红描边
        expect(wrapper.find('.cn-field--invalid').exists()).toBe(false)
    })
})

describe('漂移（D2：判定作用于已提交值，无输入期概念）', () => {
    it('已提交值枚举不出：回显标红、菜单照常可开可重选，重选落 graph 后红退', async () => {
        const editor = makeEditor([createTemplateTable({ rowsPath: 'order.missing' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        // 回显标红（cn-field--invalid 落展示框），漂移原文不吞
        expect(wrapper.find('.cn-field--invalid .cn-pathpicker__value').exists()).toBe(true)
        expect(wrapper.find('.cn-pathpicker__value').text()).toBe('order.missing')

        // 标红不锁菜单：照常可开、可重选
        await openMenu(wrapper)
        expect(menuOpen()).toBe(true)
        await optionEls()[0]!.click() // order 下钻
        await nextTick()
        await optionEls()[0]!.click() // items 提交
        await nextTick()
        expect(rowsPathAt(editor, ['layers', 0])).toBe('order.items')
        expect(wrapper.find('.cn-field--invalid').exists()).toBe(false)
    })

    it('终点非数组（对象/标量落点）同样判漂移标红', async () => {
        const editor = makeEditor([createTemplateTable({ rowsPath: 'order' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        editor.setSelection(['layers', 0])
        await nextTick()

        expect(wrapper.find('.cn-field--invalid .cn-pathpicker__value').exists()).toBe(true)
    })
})
