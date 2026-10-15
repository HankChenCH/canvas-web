// @vitest-environment jsdom
/**
 * TemplateTableForm 共享表单组件单测（canvas-web-template-table-drag-create 工单
 * 02，spec 决策 6）：rowsPath 表单从 LayerPanel.vue 抽为 layer-panel 域可导出组件，
 * 面板与工具栏弹层共用——本文件测组件自身的校验/补全/回调面，宿主接线（武装 +
 * 状态栏提示 + 关菜单）归面板 mount 测试。
 *
 * 契约面：
 * - 非空就地拦（template-authoring §2.1 基线）：空串/纯空白确认 → 标错内联文案
 *   「rowsPath 必填」、不发 confirm、草稿保留；再输入即销错。
 * - confirm(rowsPath)：trim 后非空值随事件上抛（组件零建层语义——落不落层归宿主）。
 * - cancel：取消钮 / 浮层已收后的 Esc；候选态 Esc 止于浮层收口（不连坐 cancel）。
 * - 补全接线随组件走：schema 注入即候选可用（根起点直连，D3），无 schema 静默（D7）。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

import { EditorSession, type FrameScheduler } from '@hankchen/canvas-editor'

import TemplateTableForm from '../../src/layer-panel/TemplateTableForm.vue'

const nullScheduler: FrameScheduler = () => () => {}

const RAW_SCHEMA = {
    type: 'object',
    properties: {
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

function makeEditor(schema?: unknown): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, layers: [] })
    if (schema !== undefined) editor.setDataSourceSchema(schema)
    return editor
}

function mountForm(editor: EditorSession): VueWrapper {
    const wrapper = mount(TemplateTableForm, {
        props: { editor },
    })
    wrappers.push(wrapper)
    return wrapper
}

const input = (wrapper: VueWrapper) => wrapper.find<HTMLInputElement>('[data-template-rows-path]')
const confirmBtn = (wrapper: VueWrapper) => wrapper.find('[data-template-confirm]')
const cancelButton = (wrapper: VueWrapper) => wrapper.find('[data-template-cancel]')

/** 浮层经 Teleport 挂 body，断言绕过 wrapper 直接查 document */
const popupOpen = (): boolean => document.body.querySelector('.cn-completion') !== null

async function typeRowsPath(wrapper: VueWrapper, value: string, cursor = value.length): Promise<void> {
    const field = input(wrapper)
    field.element.value = value
    field.element.setSelectionRange(cursor, cursor)
    await field.trigger('input')
}

async function pressKey(wrapper: VueWrapper, key: string, init: KeyboardEventInit = {}): Promise<void> {
    input(wrapper).element.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
    )
    await nextTick()
}

afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
})

describe('TemplateTableForm：校验面（非空就地拦）', () => {
    it('空串确认：标错内联文案、不发 confirm、草稿保留', async () => {
        const wrapper = mountForm(makeEditor())
        await typeRowsPath(wrapper, '  ')

        await confirmBtn(wrapper).trigger('click')

        expect(wrapper.emitted('confirm')).toBeUndefined()
        expect(wrapper.text()).toContain('rowsPath 必填')
        expect(input(wrapper).classes().some((c) => c.includes('border-cn-danger'))).toBe(true)
        expect(input(wrapper).element.value).toBe('  ')
    })

    it('非空确认：trim 值随 confirm 上抛；标错后再输入即销错', async () => {
        const wrapper = mountForm(makeEditor())

        // 先踩一次校验错，再修正输入——错误态应就地清除
        await confirmBtn(wrapper).trigger('click')
        expect(wrapper.text()).toContain('rowsPath 必填')
        await typeRowsPath(wrapper, ' order.items ')
        expect(wrapper.text()).not.toContain('rowsPath 必填')

        await confirmBtn(wrapper).trigger('click')
        expect(wrapper.emitted('confirm')).toEqual([['order.items']])
    })

    it('Enter 提交与确认钮同管线：空串标错不发、非空发 confirm', async () => {
        const wrapper = mountForm(makeEditor())

        await typeRowsPath(wrapper, '  ')
        await pressKey(wrapper, 'Enter')
        expect(wrapper.emitted('confirm')).toBeUndefined()
        expect(wrapper.text()).toContain('rowsPath 必填')

        await typeRowsPath(wrapper, 'order.items')
        await pressKey(wrapper, 'Enter')
        expect(wrapper.emitted('confirm')).toEqual([['order.items']])
    })
})

describe('TemplateTableForm：取消面', () => {
    it('取消钮发 cancel、零副作用', async () => {
        const wrapper = mountForm(makeEditor())
        await typeRowsPath(wrapper, 'order.items')

        await cancelButton(wrapper).trigger('click')

        expect(wrapper.emitted('cancel')).toHaveLength(1)
        expect(wrapper.emitted('confirm')).toBeUndefined()
    })

    it('浮层已收后的 Esc 发 cancel；候选态 Esc 止于浮层收口、不连坐 cancel', async () => {
        const wrapper = mountForm(makeEditor(RAW_SCHEMA))

        // 候选态：Esc 只收浮层（stop 阻断到宿主），cancel 不发
        await typeRowsPath(wrapper, 'order.')
        expect(popupOpen()).toBe(true)
        await pressKey(wrapper, 'Escape')
        expect(popupOpen()).toBe(false)
        expect(wrapper.emitted('cancel')).toBeUndefined()

        // 浮层已收：Esc 归取消
        await pressKey(wrapper, 'Escape')
        expect(wrapper.emitted('cancel')).toHaveLength(1)
    })
})

describe('TemplateTableForm：补全接线随组件走（D3/D7）', () => {
    it('schema 注入即候选可用：根起点直连、点选接受落 v-model', async () => {
        const wrapper = mountForm(makeEditor(RAW_SCHEMA))

        await typeRowsPath(wrapper, 'order.')
        expect(popupOpen()).toBe(true)

        const option = document.body.querySelector<HTMLElement>('.cn-completion__option')!
        option.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
        option.click()
        await nextTick()
        expect(popupOpen()).toBe(false)
        expect(input(wrapper).element.value).toBe('order.items')
        expect(wrapper.emitted('confirm')).toBeUndefined()
    })

    it('无 schema 注入：零弹层、手输不受阻（D7）', async () => {
        const wrapper = mountForm(makeEditor())

        await typeRowsPath(wrapper, 'order.items')
        expect(popupOpen()).toBe(false)
        expect(input(wrapper).element.value).toBe('order.items')
    })
})
