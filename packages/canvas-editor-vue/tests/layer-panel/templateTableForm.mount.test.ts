// @vitest-environment jsdom
/**
 * TemplateTableForm 共享表单组件单测（rows-path-picker 工单 04 换装后形态；
 * canvas-web-template-table-drag-create 工单 02 抽出的共享组件）：
 *
 * 换装契约（spec D3/D6/D1）：手输框 + 补全浮层 → rowsPath mode 级联点选器
 * （恒根起点直连——建表只落根层表，不经起点判别件）——
 * - 确认钮禁用至选中数组（D3 必填语义，替代空串拦截；无「rowsPath 必填」标错面）；
 * - 点选数组终点 = confirm 载荷（emit('confirm', path)），流程面不变（武装与否
 *   归宿主）；点对象只下钻不选中；
 * - 剪枝候选（D5）：标量与无可达数组的对象不出现在菜单面；「行数组」徽标透出；
 * - 空态（D6）：已绑 schema 但无可达行数组 → 菜单显式空态提示，确认保持禁用；
 * - 门态（D1）：schema 缺席 → 点选器无菜单钮只读回显，确认恒禁用（表单不可发起
 *   归菜单门态，组件面兜底成死端不误武装）。
 * 宿主接线（武装 + 状态栏提示 + 关菜单）归面板 mount 测试。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

import { EditorSession, type FrameScheduler } from '@hankchen/canvas-editor'

import TemplateTableForm from '../../src/layer-panel/TemplateTableForm.vue'

const nullScheduler: FrameScheduler = () => () => {}

/** 载荷形态 schema（rowsPathForm.mount.test 同构面 + 无数组支路 meta） */
const RAW_SCHEMA = {
    type: 'object',
    properties: {
        orderNo: { type: 'string', description: '订单编号' },
        meta: { type: 'object', description: '元信息', properties: { author: { type: 'string' } } },
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

const NO_ARRAY_SCHEMA = {
    type: 'object',
    properties: { orderNo: { type: 'string' } },
}

const wrappers: VueWrapper[] = []

function makeEditor(schema?: unknown): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, background: null, layers: [] })
    if (schema !== undefined) editor.setDataSourceSchema(schema)
    return editor
}

function mountForm(editor: EditorSession): VueWrapper {
    const wrapper = mount(TemplateTableForm, {
        props: { editor },
        attachTo: document.body,
    })
    wrappers.push(wrapper)
    return wrapper
}

const pickerRoot = (wrapper: VueWrapper) => wrapper.find('[data-template-rows-path]')
const menuToggle = (wrapper: VueWrapper) => wrapper.find('.cn-pathpicker__toggle')
const valueBox = (wrapper: VueWrapper) => wrapper.find('.cn-pathpicker__value')
const confirmBtn = (wrapper: VueWrapper) => wrapper.find<HTMLButtonElement>('[data-template-confirm]')
const cancelButton = (wrapper: VueWrapper) => wrapper.find('[data-template-cancel]')

/** 级联浮层经 Teleport 挂 body，断言绕过 wrapper 直接查 document */
const menuEl = (): HTMLElement | null => document.body.querySelector('.cn-pathpicker__menu')
const optionSegments = (): string[] =>
    Array.from(document.body.querySelectorAll('.cn-pathpicker__option .cn-pathpicker__segment')).map(
        (node) => node.textContent ?? '',
    )
const optionEls = (): HTMLElement[] =>
    Array.from(document.body.querySelectorAll<HTMLElement>('.cn-pathpicker__option'))

async function openMenu(wrapper: VueWrapper): Promise<void> {
    await menuToggle(wrapper).trigger('click')
    await nextTick()
}

afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
})

describe('TemplateTableForm：换装点选器（无手输缝，D3）', () => {
    it('无文本输入缝：data-template-rows-path 落点选器根、零 input/textarea', () => {
        const wrapper = mountForm(makeEditor(RAW_SCHEMA))
        expect(pickerRoot(wrapper).exists()).toBe(true)
        expect(pickerRoot(wrapper).find('input').exists()).toBe(false)
        expect(pickerRoot(wrapper).find('textarea').exists()).toBe(false)
        // 必填标错面随手输面退役
        expect(wrapper.text()).not.toContain('rowsPath 必填')
    })

    it('未选确认禁用（D3 必填替代空串拦截）：确认零发射、标错文案不出', async () => {
        const wrapper = mountForm(makeEditor(RAW_SCHEMA))
        expect(confirmBtn(wrapper).attributes('disabled')).toBeDefined()

        await confirmBtn(wrapper).trigger('click')
        expect(wrapper.emitted('confirm')).toBeUndefined()
        expect(wrapper.text()).not.toContain('rowsPath 必填')
    })

    it('点选数组终点落 confirm 载荷：回显 + 确认解锁 + emit confirm(path)', async () => {
        const wrapper = mountForm(makeEditor(RAW_SCHEMA))
        await openMenu(wrapper)

        // 剪枝候选（D5 恒根起点）：orderNo 标量与 meta（无可达数组）不出，order 对象中间站在列
        expect(menuEl()).not.toBeNull()
        expect(optionSegments()).toEqual(['order'])
        await optionEls()[0]!.click()
        await nextTick()

        // 点对象只下钻：值未选（占位文案在场）、确认仍禁用
        expect(valueBox(wrapper).text()).toBe('未选择行路径')
        expect(confirmBtn(wrapper).attributes('disabled')).toBeDefined()

        // 子层唯一条目 order.items（数组终点，带「行数组」徽标）→ 点选提交
        expect(optionSegments()).toEqual(['items'])
        expect(optionEls()[0]!.textContent).toContain('行数组')
        await optionEls()[0]!.click()
        await nextTick()

        expect(valueBox(wrapper).text()).toBe('order.items')
        expect(confirmBtn(wrapper).attributes('disabled')).toBeUndefined()
        await confirmBtn(wrapper).trigger('click')
        expect(wrapper.emitted('confirm')).toEqual([['order.items']])
    })

    it('取消钮发 cancel、零副作用（confirm 不发）', async () => {
        const wrapper = mountForm(makeEditor(RAW_SCHEMA))
        await openMenu(wrapper)
        await optionEls()[0]!.click()
        await nextTick()
        await optionEls()[0]!.click()
        await nextTick()

        await cancelButton(wrapper).trigger('click')
        expect(wrapper.emitted('cancel')).toHaveLength(1)
        expect(wrapper.emitted('confirm')).toBeUndefined()
    })
})

describe('TemplateTableForm：门态与空态（D1/D6）', () => {
    it('schema 缺席：点选器无菜单钮（只读回显），确认恒禁用（表单不可发起由菜单门态承担，组件死端兜底）', async () => {
        const wrapper = mountForm(makeEditor())
        expect(menuToggle(wrapper).exists()).toBe(false)
        expect(confirmBtn(wrapper).attributes('disabled')).toBeDefined()
        await confirmBtn(wrapper).trigger('click')
        expect(wrapper.emitted('confirm')).toBeUndefined()
    })

    it('已绑 schema 无可达行数组（D6）：菜单空态提示「声明中未发现行数组，请检查数据源绑定」，确认保持禁用', async () => {
        const wrapper = mountForm(makeEditor(NO_ARRAY_SCHEMA))
        await openMenu(wrapper)
        expect(menuEl()).not.toBeNull()
        expect(document.body.querySelector('.cn-pathpicker__empty')?.textContent).toBe(
            '声明中未发现行数组，请检查数据源绑定',
        )
        expect(confirmBtn(wrapper).attributes('disabled')).toBeDefined()
    })
})

describe('TemplateTableForm：键盘路径（级联壳既有行为回归）', () => {
    it('点选器内 Enter：对象下钻、数组终点提交落回显（不触发 confirm——确认归确认钮）', async () => {
        const wrapper = mountForm(makeEditor(RAW_SCHEMA))
        await openMenu(wrapper)
        const menu = menuEl()!
        expect(document.activeElement).toBe(menu)

        // order（对象）→ Enter 下钻
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
        await nextTick()
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        await nextTick()
        expect(optionSegments()).toEqual(['items'])

        // order.items（数组终点）→ Enter 提交：值落回显、点选器菜单收起、表单留场
        menuEl()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        await nextTick()
        expect(valueBox(wrapper).text()).toBe('order.items')
        expect(menuEl()).toBeNull()
        expect(confirmBtn(wrapper).attributes('disabled')).toBeUndefined()
        expect(wrapper.emitted('confirm')).toBeUndefined()
    })
})
