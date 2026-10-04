// @vitest-environment jsdom
/**
 * LayerPanel 建表表单 rowsPath 补全接线测试（rows-path-completion 工单 04，
 * D3/D7/D10）。
 *
 * 表单全链路（真实候选源 = 工单 01 枚举器根起点直连，非桩）：输入即弹（标量不出
 * 候选）、`.` 刷新下钻出「行数组」徽标、Enter 接受落值经 v-model 同路且**不触发
 * 提交**（候选态键位归浮层）、失焦关；接受后再 Enter 走既有建表管线（rowsPath 落
 * graph 形态对齐既有建表 mount 用例）。
 *
 * 降级面：无 schema 注入零弹层、手输不受阻（D7）；空串提交校验行为不变（D10）；
 * Esc 候选态只收浮层、菜单留场（表单编辑不被连坐收起）。
 *
 * 恒根起点（D3）：addTemplateTable 只建根层表（insertRootLayerInDraft），表单不经
 * 工单 01 起点三分流判别件——候选恒自载荷根 schema 起。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

import { EditorSession, type FrameScheduler } from '@hankchen/canvas-next-editor'

import LayerPanel from '../../src/layer-panel/LayerPanel.vue'

const nullScheduler: FrameScheduler = () => () => {}

/**
 * 载荷形态 schema（工单 03 同构最小面）：orderNo 标量不出候选；order 对象下钻；
 * items 行数组（徽标「行数组」+ 元信息）。
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
                    items: { type: 'object', properties: { name: { type: 'string' } } },
                },
            },
        },
    },
}

const wrappers: VueWrapper[] = []

function makeEditor(): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, layers: [] })
    return editor
}

function mountPanel(editor: EditorSession): VueWrapper {
    const wrapper = mount(LayerPanel, { props: { editor } })
    wrappers.push(wrapper)
    return wrapper
}

/** 开出建表表单：＋ → 模板表项（keepsOpen 交换）→ 表单体留场 */
async function openTemplateForm(wrapper: VueWrapper): Promise<void> {
    await wrapper.find('[data-add-menu]').trigger('click')
    await wrapper.find('[data-add-layer="template-table"]').trigger('click')
    await nextTick()
}

function rowsPathInput(wrapper: VueWrapper) {
    return wrapper.find<HTMLInputElement>('[data-template-rows-path]')
}

/** 模拟输入：直设 DOM 值 + 光标再派发 input（rowsPathWiring.mount.test 同款） */
async function typeRowsPath(wrapper: VueWrapper, value: string, cursor: number): Promise<void> {
    const input = rowsPathInput(wrapper)
    input.element.value = value
    input.element.setSelectionRange(cursor, cursor)
    await input.trigger('input')
}

async function pressKey(wrapper: VueWrapper, key: string, init: KeyboardEventInit = {}): Promise<void> {
    rowsPathInput(wrapper).element.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
    )
    await nextTick()
}

/** 浮层经 Teleport 挂 body，断言绕过 wrapper 直接查 document */
const popupOpen = (): boolean => document.body.querySelector('.cn-completion') !== null
const optionEls = (): HTMLElement[] => Array.from(document.body.querySelectorAll('.cn-completion__option'))
const optionSegments = (): string[] =>
    optionEls().map((option) => option.querySelector('.cn-completion__segment')?.textContent ?? '')
const optionTexts = (): string[] => optionEls().map((option) => option.textContent ?? '')

function createdTable(editor: EditorSession): { rowsPath: string; templateCells: number } {
    const layers = editor.store.doc!.layers
    expect(layers).toHaveLength(1)
    const table = layers[0]!
    if (table.type !== 'TableLayer') throw new Error('expected TableLayer')
    return { rowsPath: table.rowsPath, templateCells: table.template?.cells.length ?? -1 }
}

afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
})

describe('建表表单弹层全链路（根起点直连，D3）', () => {
    it('输入即弹：标量不出候选、`.` 刷新下钻、「行数组」徽标与元信息透出', async () => {
        const editor = makeEditor()
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        await openTemplateForm(wrapper)

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

    it('Enter 接受候选：落值经 v-model、不触发提交（候选态键位归浮层）', async () => {
        const editor = makeEditor()
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        await openTemplateForm(wrapper)

        await typeRowsPath(wrapper, 'order.', 6)
        expect(popupOpen()).toBe(true)
        await pressKey(wrapper, 'Enter')
        expect(popupOpen()).toBe(false)
        // 接受 = 合成 input 落 v-model 同路：值补全、表单留场、零建层
        expect(rowsPathInput(wrapper).element.value).toBe('order.items')
        expect(rowsPathInput(wrapper).exists()).toBe(true)
        expect(editor.store.doc!.layers).toHaveLength(0)

        // 失焦关：浮层不再复开，表单不受影响
        await typeRowsPath(wrapper, 'order.i', 7)
        expect(popupOpen()).toBe(true)
        rowsPathInput(wrapper).trigger('blur')
        await nextTick()
        expect(popupOpen()).toBe(false)
        expect(rowsPathInput(wrapper).exists()).toBe(true)
    })
})

describe('接受候选后提交（既有建表管线不动，D10）', () => {
    it('接受 + 再 Enter 提交：table.rowsPath 落 graph（建表 mount 用例形态）', async () => {
        const editor = makeEditor()
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        await openTemplateForm(wrapper)

        await typeRowsPath(wrapper, 'order.', 6)
        await pressKey(wrapper, 'Enter')
        expect(editor.store.doc!.layers).toHaveLength(0)
        // 浮层已收，Enter 回到既有提交管线（自动选中 + 缺省格带文本）
        await pressKey(wrapper, 'Enter')
        expect(createdTable(editor)).toEqual({ rowsPath: 'order.items', templateCells: 1 })
        expect(editor.store.ui.selection).toEqual(['layers', 0])
    })

    it('鼠标点选接受 + 创建钮提交：同落 graph（pointerdown 不被菜单点外收连坐）', async () => {
        const editor = makeEditor()
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        await openTemplateForm(wrapper)

        await typeRowsPath(wrapper, 'order.', 6)
        // 真实浏览器点选候选先派 pointerdown（浮层 portal 在菜单容器外）：止于浮层
        // 根（@pointerdown.stop），底座 window 点外收不触发、菜单与表单不连坐
        optionEls()[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
        await nextTick()
        expect(popupOpen()).toBe(true)
        expect(rowsPathInput(wrapper).exists()).toBe(true)
        optionEls()[0]!.click()
        await nextTick()
        expect(popupOpen()).toBe(false)
        expect(rowsPathInput(wrapper).element.value).toBe('order.items')
        await wrapper.find('[data-template-confirm]').trigger('click')
        expect(createdTable(editor)).toEqual({ rowsPath: 'order.items', templateCells: 1 })
    })

    it('229 合成期不接受：keydown 229 Enter 不触发接受也不触发提交（浮层保持、值不变）', async () => {
        const editor = makeEditor()
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        await openTemplateForm(wrapper)

        await typeRowsPath(wrapper, 'order.', 6)
        expect(popupOpen()).toBe(true)
        rowsPathInput(wrapper).element.dispatchEvent(new Event('compositionstart'))
        await pressKey(wrapper, 'Enter', { keyCode: 229, isComposing: true } as KeyboardEventInit)
        expect(popupOpen()).toBe(true)
        expect(rowsPathInput(wrapper).element.value).toBe('order.')
        expect(editor.store.doc!.layers).toHaveLength(0)
    })
})

describe('降级与校验面（D7/D10）', () => {
    it('无 schema 注入：零弹层、手输不受阻（D7 辅助声明缺席 = 无候选态）', async () => {
        const editor = makeEditor()
        const wrapper = mountPanel(editor)
        await openTemplateForm(wrapper)

        await typeRowsPath(wrapper, 'or', 2)
        expect(popupOpen()).toBe(false)
        expect(rowsPathInput(wrapper).element.value).toBe('or')
    })

    it('空串提交校验不变：标错、零建层（schema 在场同款）', async () => {
        const editor = makeEditor()
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        await openTemplateForm(wrapper)

        // 空输入不自动弹（D4 同门）；whitespace 确认 → 就地标错、文档零变化
        await typeRowsPath(wrapper, '  ', 2)
        expect(popupOpen()).toBe(false)
        await wrapper.find('[data-template-confirm]').trigger('click')
        expect(editor.store.doc!.layers).toHaveLength(0)
        expect(
            rowsPathInput(wrapper).classes().some((c) => c.includes('border-cn-danger')),
        ).toBe(true)
    })

    it('Esc：候选态只收浮层、菜单留场；浮层已收再 Esc 收菜单', async () => {
        const editor = makeEditor()
        editor.setDataSourceSchema(RAW_SCHEMA)
        const wrapper = mountPanel(editor)
        await openTemplateForm(wrapper)

        await typeRowsPath(wrapper, 'or', 2)
        expect(popupOpen()).toBe(true)
        await pressKey(wrapper, 'Escape')
        expect(popupOpen()).toBe(false)
        // 浮层收口不连坐菜单：表单留场，草稿值保留
        expect(rowsPathInput(wrapper).exists()).toBe(true)
        expect(rowsPathInput(wrapper).element.value).toBe('or')

        await pressKey(wrapper, 'Escape')
        expect(rowsPathInput(wrapper).exists()).toBe(false)
    })
})
