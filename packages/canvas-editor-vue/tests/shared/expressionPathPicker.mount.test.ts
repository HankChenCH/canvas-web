// @vitest-environment jsdom
/**
 * ExpressionPathPicker（resource-expression-single-ref 工单 05）：资源内容字段
 * 的级联路径选择器——只读展示框 + 菜单钮、逐层 source 取候选（真实内核枚举器
 * 源）、object 下钻/叶子提交、无 source/disabled 只读不渲染菜单入口、Esc/点外
 * 收、浮层垂直翻转（placePopupInViewport 接线）。
 *
 * 候选源用真实链路：parseExpressionSchema → expressionCompletionSource（根/行
 * 上下文）——行上下文形态（模板格内容层候选含 row/$index）一并在组件面钉住。
 * 挂载 attachTo 进文档：焦点断言（document.activeElement）只对在档元素生效。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

import { parseExpressionSchema, type ExpressionSchemaNode } from '@hankchen/canvas-editor'

import ExpressionPathPicker from '../../src/shared/ExpressionPathPicker.vue'
import type { CompletionSource } from '../../src/shared/completion'
import { expressionCompletionSource } from '../../src/shared/expressionContext'
import { rowsPathPickerSource } from '../../src/shared/rowsPathPickerSource'

const RAW_SCHEMA = {
    type: 'object',
    properties: {
        orderNo: { type: 'string', description: '订单编号' },
        order: {
            type: 'object',
            description: '订单',
            properties: {
                items: {
                    type: 'array',
                    description: '订单行明细',
                    items: {
                        type: 'object',
                        properties: { name: { type: 'string', description: '商品名称' } },
                    },
                },
                totalAmount: { type: 'number', description: '总金额' },
            },
        },
    },
}

function schemaOf(raw: unknown): ExpressionSchemaNode {
    const parsed = parseExpressionSchema(raw)
    if (!parsed.ok) throw new Error(parsed.detail)
    return parsed.schema
}

const wrappers: VueWrapper[] = []

/** 挂载统一入册（afterEach 卸载再清 body——Teleport 残留树不 Clean 会炸后续 patch）；
 *  source 必传（null = 未绑声明的只读面是显式被测形态） */
const mountPicker = (
    props: { source: CompletionSource | null } & Partial<{
        modelValue: string
        disabled: boolean
        placeholder: string
        ariaLabel: string
        mode: 'resource' | 'rowsPath'
    }>,
): VueWrapper => {
    const wrapper = mount(ExpressionPathPicker, {
        props: { modelValue: '', ...props },
        attachTo: document.body,
    })
    wrappers.push(wrapper)
    return wrapper
}

const menuEl = (): HTMLElement | null => document.body.querySelector('.cn-pathpicker__menu')
const optionSegments = (): string[] =>
    Array.from(document.body.querySelectorAll('.cn-pathpicker__option .cn-pathpicker__segment')).map(
        (node) => node.textContent ?? '',
    )
const optionEls = (): HTMLElement[] =>
    Array.from(document.body.querySelectorAll<HTMLElement>('.cn-pathpicker__option'))
const openMenu = async (wrapper: VueWrapper): Promise<void> => {
    await wrapper.find('.cn-pathpicker__toggle').trigger('click')
    await nextTick()
}

afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
})

describe('呈现契约：只读展示框 + 菜单入口门', () => {
    it('modelValue 原文回显（存量违例原文透传展示同款）；空值显示占位', () => {
        const wrapper = mountPicker({ modelValue: 'row.cover', source: null })
        const value = wrapper.find('.cn-pathpicker__value')
        expect(value.text()).toBe('row.cover')
        expect(value.attributes('title')).toBe('row.cover')

        const empty = mountPicker({ modelValue: '', source: null, placeholder: '未选择' })
        expect(empty.find('.cn-pathpicker__value').text()).toBe('未选择')
    })

    it('source = null（未绑声明，引用以声明为门）：不渲染菜单入口，整体只读', () => {
        const wrapper = mountPicker({ modelValue: 'row.cover', source: null })
        expect(wrapper.find('.cn-pathpicker__toggle').exists()).toBe(false)
    })

    it('disabled：同款只读不渲染菜单入口', () => {
        const wrapper = mountPicker({ modelValue: 'row.cover', source: () => null, disabled: true })
        expect(wrapper.find('.cn-pathpicker__toggle').exists()).toBe(false)
    })
})

describe('级联菜单：逐层枚举 → 下钻 → 提交（真实枚举器源，根上下文）', () => {
    const source = expressionCompletionSource(schemaOf(RAW_SCHEMA), { kind: 'root', rowSchema: null })

    it('头部层 = 根候选（orderNo/order/$root）；object 节点带下钻指示', async () => {
        const wrapper = mountPicker({ modelValue: '', source })
        await openMenu(wrapper)
        expect(menuEl()).not.toBeNull()
        expect(optionSegments()).toEqual(['orderNo', 'order', '$root'])
        // order 是 object（下钻层非空）→ 带 ›；orderNo 是 scalar 叶子
        const options = optionEls()
        expect(options[0]!.querySelector('.cn-pathpicker__drill')).toBeNull()
        expect(options[1]!.querySelector('.cn-pathpicker__drill')).not.toBeNull()
    })

    it('object 点选下钻：层级栈进一层 + 返回行；叶子点选提交全路径并收起', async () => {
        const wrapper = mountPicker({ modelValue: '', source })
        await openMenu(wrapper)

        // 点 order（object）→ 下钻层 = items/totalAmount + 返回行（目的地 = 根级）
        await optionEls()[1]!.click()
        await nextTick()
        expect(optionSegments()).toEqual(['items', 'totalAmount'])
        expect(document.body.querySelector('.cn-pathpicker__back')?.textContent).toContain('根级字段')

        // 点 items（数组收敛为叶子）→ 提交全路径，update:modelValue + change 同发
        await optionEls()[0]!.click()
        await nextTick()
        expect(wrapper.emitted('update:modelValue')!).toEqual([['order.items']])
        expect(wrapper.emitted('change')!).toEqual([['order.items']])
        expect(menuEl()).toBeNull()
    })

    it('返回行回上一层层级栈', async () => {
        const wrapper = mountPicker({ modelValue: '', source })
        await openMenu(wrapper)
        await optionEls()[1]!.click() // order 下钻
        await nextTick()
        await document.body.querySelector<HTMLElement>('.cn-pathpicker__back')!.click()
        await nextTick()
        expect(optionSegments()).toEqual(['orderNo', 'order', '$root'])
    })

    it('行上下文源（模板格内容层形态）：头部含 row/$index，$index 叶子直提', async () => {
        const rowSchema = schemaOf({
            type: 'object',
            properties: {
                items: {
                    type: 'array',
                    items: { type: 'object', properties: { name: { type: 'string' } } },
                },
            },
        })
        const rowSource = expressionCompletionSource(schemaOf(RAW_SCHEMA), { kind: 'row', rowSchema })
        const wrapper = mountPicker({ modelValue: '', source: rowSource })
        await openMenu(wrapper)
        // 行上下文头部：orderNo/order/$root/row/$index
        expect(optionSegments()).toEqual(['orderNo', 'order', '$root', 'row', '$index'])

        // $index 是标量叶子：直接提交
        await optionEls()[4]!.click()
        await nextTick()
        expect(wrapper.emitted('update:modelValue')!).toEqual([['$index']])
    })

    it('键盘：↓ 移动高亮、Enter 显式激活（object 下钻）、Esc 收起回焦触发钮', async () => {
        const wrapper = mountPicker({ modelValue: '', source })
        await openMenu(wrapper)
        const menu = menuEl()!
        expect(document.activeElement).toBe(menu)

        // ↓ 到 order（object）→ Enter 下钻
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
        await nextTick()
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        await nextTick()
        expect(optionSegments()).toEqual(['items', 'totalAmount'])

        // Esc 收起 + 回焦触发钮
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await nextTick()
        expect(menuEl()).toBeNull()
        expect(document.activeElement).toBe(wrapper.find('.cn-pathpicker__toggle').element)
    })
})

describe('收起三路与空层', () => {
    const source = expressionCompletionSource(schemaOf(RAW_SCHEMA), { kind: 'root', rowSchema: null })

    it('点外收（window pointerdown 落容器外）；容器内（触发钮/菜单本体）不收', async () => {
        const wrapper = mountPicker({ modelValue: '', source })
        await openMenu(wrapper)
        expect(menuEl()).not.toBeNull()

        const outsider = document.createElement('div')
        document.body.appendChild(outsider)
        outsider.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
        await nextTick()
        expect(menuEl()).toBeNull()

        // 再开：容器内 pointerdown 不误收（收合归触发钮 click 翻转）
        await openMenu(wrapper)
        wrapper.find('.cn-pathpicker__toggle').element.dispatchEvent(
            new MouseEvent('pointerdown', { bubbles: true }),
        )
        await nextTick()
        expect(menuEl()).not.toBeNull()
    })

    it('候选源 null 态（降级）：空层提示行，不抛不炸', async () => {
        const wrapper = mountPicker({ modelValue: '', source: () => null })
        await openMenu(wrapper)
        expect(menuEl()).not.toBeNull()
        expect(document.body.querySelector('.cn-pathpicker__empty')?.textContent).toBe('无可选字段')
    })
})

describe('rowsPath mode 终点形态分叉（rows-path-picker 工单 02，spec D3/D6）', () => {
    // 真实链路源：rowsPathPickerSource（内核剪枝枚举件适配）——orderNo 标量与
    // meta（无可达数组）被 D5 剪枝不出现；order 为对象中间站（只下钻），rows /
    // order.items 为数组终点（可激活）
    const rowsSource = rowsPathPickerSource(
        schemaOf({
            type: 'object',
            properties: {
                orderNo: { type: 'string' },
                meta: { type: 'object', properties: { author: { type: 'string' } } },
                rows: {
                    type: 'array',
                    description: '数据行',
                    items: { type: 'object', properties: { id: { type: 'string' } } },
                },
                order: {
                    type: 'object',
                    properties: {
                        items: {
                            type: 'array',
                            items: { type: 'object', properties: { id: { type: 'string' } } },
                        },
                    },
                },
            },
        }),
    )!

    it('头部层 = 剪枝候选；数组带「行数组」徽标不可下钻、对象带下钻指示', async () => {
        const wrapper = mountPicker({ modelValue: '', source: rowsSource, mode: 'rowsPath' })
        await openMenu(wrapper)
        expect(optionSegments()).toEqual(['rows', 'order'])
        const options = optionEls()
        expect(options[0]!.querySelector('.cn-pathpicker__drill')).toBeNull()
        expect(options[0]!.textContent).toContain('行数组')
        expect(options[1]!.querySelector('.cn-pathpicker__drill')).not.toBeNull()
    })

    it('点对象不可激活只下钻：不发表单事件，进子层', async () => {
        const wrapper = mountPicker({ modelValue: '', source: rowsSource, mode: 'rowsPath' })
        await openMenu(wrapper)
        await optionEls()[1]!.click() // order（对象中间站）
        await nextTick()
        expect(optionSegments()).toEqual(['items'])
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
        expect(wrapper.emitted('change')).toBeUndefined()
    })

    it('点数组终点发值并收起：update:modelValue + change 同发，value = 所选 path', async () => {
        const wrapper = mountPicker({ modelValue: '', source: rowsSource, mode: 'rowsPath' })
        await openMenu(wrapper)
        await optionEls()[0]!.click() // rows（数组终点）
        await nextTick()
        expect(wrapper.emitted('update:modelValue')!).toEqual([['rows']])
        expect(wrapper.emitted('change')!).toEqual([['rows']])
        expect(menuEl()).toBeNull()
    })

    it('下钻后点子层数组提交全路径', async () => {
        const wrapper = mountPicker({ modelValue: '', source: rowsSource, mode: 'rowsPath' })
        await openMenu(wrapper)
        await optionEls()[1]!.click() // order 下钻
        await nextTick()
        await optionEls()[0]!.click() // order.items（数组终点）
        await nextTick()
        expect(wrapper.emitted('update:modelValue')!).toEqual([['order.items']])
        expect(wrapper.emitted('change')!).toEqual([['order.items']])
    })

    it('空态（spec D6）：无可达行数组 → 显式提示行，回显框与菜单钮照常', async () => {
        const emptySource = rowsPathPickerSource(
            schemaOf({ type: 'object', properties: { orderNo: { type: 'string' } } }),
        )!
        const wrapper = mountPicker({ modelValue: '', source: emptySource, mode: 'rowsPath' })
        expect(wrapper.find('.cn-pathpicker__toggle').exists()).toBe(true)
        await openMenu(wrapper)
        expect(menuEl()).not.toBeNull()
        expect(document.body.querySelector('.cn-pathpicker__empty')?.textContent).toBe(
            '声明中未发现行数组，请检查数据源绑定',
        )
    })

    it('键盘既有行为回归：↓+Enter 下钻对象 → Enter 提交子层数组终点；Esc 收起回焦', async () => {
        const wrapper = mountPicker({ modelValue: '', source: rowsSource, mode: 'rowsPath' })
        await openMenu(wrapper)
        const menu = menuEl()!
        // 初始高亮 rows（数组终点）：先 ↓ 到 order（对象）→ Enter 下钻（矩阵：对象可下钻）
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
        await nextTick()
        menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        await nextTick()
        expect(optionSegments()).toEqual(['items'])
        // 子层唯一条目 items（数组终点）→ Enter 提交
        menuEl()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        await nextTick()
        expect(wrapper.emitted('update:modelValue')!).toEqual([['order.items']])
        expect(menuEl()).toBeNull()

        // Esc 收起回焦触发钮（壳共享面回归）
        await openMenu(wrapper)
        menuEl()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await nextTick()
        expect(menuEl()).toBeNull()
        expect(document.activeElement).toBe(wrapper.find('.cn-pathpicker__toggle').element)
    })
})

describe('浮层定位：placePopupInViewport 接线（垂直翻转）', () => {
    it('视口下方放不下：菜单翻转锚上方（工单 06 同款定位实现）', async () => {
        const source2 = expressionCompletionSource(schemaOf(RAW_SCHEMA), { kind: 'root', rowSchema: null })
        const wrapper = mountPicker({ modelValue: '', source: source2 })
        // 多根组件 wrapper.element 非本组件根（fragment 首节点），rect 钉在选择器根盒上
        const rootEl = wrapper.find('.cn-pathpicker').element
        const rootRect = { top: 400, bottom: 420, left: 50, right: 250, width: 200, height: 20, x: 50, y: 400, toJSON: () => ({}) }
        vi.spyOn(rootEl, 'getBoundingClientRect').mockReturnValue(rootRect as DOMRect)
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
            return this.classList.contains('cn-pathpicker__menu') ? 200 : 0
        })
        Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true })

        await openMenu(wrapper)
        const menu = menuEl()!
        // 下方 424 + 200 > 496 → 翻转：400 − 4 − 200 = 196
        expect(menu.style.top).toBe('196px')
    })
})
