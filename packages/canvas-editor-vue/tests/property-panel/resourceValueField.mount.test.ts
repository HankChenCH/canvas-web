// @vitest-environment jsdom
/**
 * ResourceValueField（resourceValue 控件，resource-expression-single-ref 工单 05）：
 * 二维码内容字段的换装控件——`{{}}` 拆装壳 + 级联路径选择器。验收核心：拆装
 * 往返恒等（`{{row.a}}` ⇄ `row.a`）、菜单点选提交走包壳（面板 commit 管线零
 * 改动）、存量违例原文只读回显、无 source 只读、静态态退化 TextField。
 *
 * 候选源用真实链路（parseExpressionSchema → expressionCompletionSource），菜单
 * 交互经 document.body 直取（Teleport 到 body，挂载 attachTo 进文档）。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

import { parseExpressionSchema, type ExpressionSchemaNode } from '@hankchen/canvas-editor'

import type { FieldDef } from '../../src/property-panel/fieldSchema'
import ResourceValueField from '../../src/property-panel/fields/ResourceValueField.vue'
import { expressionCompletionSource } from '../../src/shared/expressionContext'
import { attachResourceTemplate, stripResourceTemplate } from '../../src/shared/resourceTemplate'

const field: FieldDef = { key: ['value'], label: '内容', control: 'resourceValue', data: true, resource: true }

const RAW_SCHEMA = {
    type: 'object',
    properties: {
        orderNo: { type: 'string', description: '订单编号' },
        order: {
            type: 'object',
            properties: {
                items: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } },
            },
        },
    },
}

function schemaOf(raw: unknown): ExpressionSchemaNode {
    const parsed = parseExpressionSchema(raw)
    if (!parsed.ok) throw new Error(parsed.detail)
    return parsed.schema
}

const rootSource = expressionCompletionSource(schemaOf(RAW_SCHEMA), { kind: 'root', rowSchema: null })

const wrappers: VueWrapper[] = []

const mountedWith = (modelValue: string | null, extra: Record<string, unknown> = {}): VueWrapper => {
    const wrapper = mount(ResourceValueField, {
        props: { field, modelValue, source: rootSource, dataMode: 'expression', ...extra },
        attachTo: document.body,
    })
    wrappers.push(wrapper)
    return wrapper
}

const optionEls = (): HTMLElement[] =>
    Array.from(document.body.querySelectorAll<HTMLElement>('.cn-pathpicker__option'))

afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
})

describe('拆装往返恒等（验收：{{row.a}} ⇄ row.a）', () => {
    it('拆装纯函数往返：strip → attach 恒等于规范模板', () => {
        const template = '{{row.a}}'
        const path = stripResourceTemplate(template)
        expect(path).toBe('row.a')
        expect(attachResourceTemplate(path!)).toBe(template)
    })

    it('表达式态回显：{{orderNo}} 拆出裸路径展示于选择器', () => {
        const wrapper = mountedWith('{{orderNo}}')
        expect(wrapper.find('.cn-pathpicker__value').text()).toBe('orderNo')
        // 无手输缝：表达式态不存在文本输入
        expect(wrapper.find('input[type="text"]').exists()).toBe(false)
    })

    it('菜单点选 → 包壳提交：update 全程 `{{path}}` 形态（提交面模板原文）', async () => {
        const wrapper = mountedWith('{{orderNo}}')
        await wrapper.find('.cn-pathpicker__toggle').trigger('click')
        await nextTick()
        await optionEls()[0]!.click() // orderNo 叶子
        await nextTick()
        // 输入事件实时合步 + change 收口，值恒为包壳模板原文
        expect(wrapper.emitted('input')!).toEqual([['{{orderNo}}']])
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['{{orderNo}}'])
    })

    it('点选 object 下的叶子：提交带前缀全路径的模板', async () => {
        const wrapper = mountedWith('{{orderNo}}')
        await wrapper.find('.cn-pathpicker__toggle').trigger('click')
        await nextTick()
        await optionEls()[1]!.click() // order 下钻
        await nextTick()
        await optionEls()[0]!.click() // items（数组叶子）
        await nextTick()
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['{{order.items}}'])
    })
})

describe('存量违例显示（工单 05 ③）', () => {
    it('违例模板（拼接）拆不动：原文原样只读回显；菜单在场 = 点选整值替换修复通道', async () => {
        const wrapper = mountedWith('{{a}}{{b}}')
        expect(wrapper.find('.cn-pathpicker__value').text()).toBe('{{a}}{{b}}')
        // 诊断归 PropertyField 的 resource 门（工单 03），壳不重复标错——只负责原文回显
        expect(wrapper.find('.cn-pathpicker__toggle').exists()).toBe(true)

        await wrapper.find('.cn-pathpicker__toggle').trigger('click')
        await nextTick()
        await optionEls()[0]!.click()
        await nextTick()
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['{{orderNo}}'])
    })

    it('静态现态切换来的字面（无片段）：原文回显，点选即打标换表达式', async () => {
        const wrapper = mountedWith('甲', { dataMode: 'expression' })
        expect(wrapper.find('.cn-pathpicker__value').text()).toBe('甲')
        await wrapper.find('.cn-pathpicker__toggle').trigger('click')
        await nextTick()
        await optionEls()[0]!.click()
        await nextTick()
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['{{orderNo}}'])
    })
})

describe('门面：无 source 只读 / 静态态退化', () => {
    it('source = null（未绑声明）：选择器只读回显（无菜单钮），点选通道不存在', () => {
        const wrapper = mountedWith('{{orderNo}}', { source: null })
        expect(wrapper.find('.cn-pathpicker__value').text()).toBe('orderNo')
        expect(wrapper.find('.cn-pathpicker__toggle').exists()).toBe(false)
    })

    it('locked（disabled 透传）：菜单钮不渲染', () => {
        const wrapper = mountedWith('{{orderNo}}', { disabled: true })
        expect(wrapper.find('.cn-pathpicker__toggle').exists()).toBe(false)
    })

    it('静态态：退化 TextField 字面编辑（无 {{}} 拆装，提交原样）', async () => {
        const wrapper = mountedWith('甲', { dataMode: 'static' })
        expect(wrapper.find('.cn-pathpicker__value').exists()).toBe(false)
        const input = wrapper.find('input[type="text"]')
        expect((input.element as HTMLInputElement).value).toBe('甲')
        ;(input.element as HTMLInputElement).value = '乙'
        await input.trigger('change')
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['乙'])
    })
})
