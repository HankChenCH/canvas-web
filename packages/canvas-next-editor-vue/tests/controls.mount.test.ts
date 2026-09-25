// @vitest-environment jsdom
/**
 * 控件挂载测试（工单 09）：每种控件一枚——挂载渲染、实时/收口事件语义、
 * 取值钳位与结构化对象的组装。控件提交语义 = input 实时（面板合步）+
 * change 收口（一步历史定格）。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import type { Border, Padding } from '@hankchen/canvas-next-editor'

import AnchorField from '../src/AnchorField.vue'
import BooleanField from '../src/BooleanField.vue'
import BorderField from '../src/BorderField.vue'
import ColorField from '../src/ColorField.vue'
import NumberField from '../src/NumberField.vue'
import PaddingField from '../src/PaddingField.vue'
import SelectField from '../src/SelectField.vue'
import TextField from '../src/TextField.vue'
import TextareaField from '../src/TextareaField.vue'
import type { FieldDef } from '../src/fieldSchema'

const numField: FieldDef = { key: ['position', 'x'], label: 'X', control: 'number', integer: true }
const padding = (v: number): Padding => ({ top: v, bottom: v, left: v, right: v })
const noBorder = (): Border => ({ top: null, bottom: null, left: null, right: null })

describe('NumberField', () => {
    it('挂载渲染当前值；input 实时发出整数化数值', async () => {
        const wrapper = mount(NumberField, { props: { field: numField, modelValue: 10 } })
        const input = wrapper.find('input')
        expect((input.element as HTMLInputElement).value).toBe('10')

        // 直设 DOM 值再发 input（setValue 会连发 input+change，非逐键语义）
        input.element.value = '25.7'
        await input.trigger('input')
        expect(wrapper.emitted('input')!.at(-1)).toEqual([25])
        expect(wrapper.emitted('change')).toBeUndefined() // 实时事件不收口
    })

    it('change 收口发出最终值', async () => {
        const wrapper = mount(NumberField, { props: { field: numField, modelValue: 10 } })
        const input = wrapper.find('input')
        input.element.value = '30'
        await input.trigger('change')
        expect(wrapper.emitted('change')!.at(-1)).toEqual([30])
    })

    it('空串/清空不提交（Number("") 不得误作 0），非法收口回显文档值', async () => {
        const wrapper = mount(NumberField, { props: { field: numField, modelValue: 10 } })
        const input = wrapper.find('input')
        input.element.value = ''
        await input.trigger('input')
        expect(wrapper.emitted('input')).toBeUndefined()

        input.element.value = '18'
        await input.trigger('input')
        input.element.value = ''
        await input.trigger('blur')
        expect(wrapper.emitted('change')).toBeUndefined()
        expect((input.element as HTMLInputElement).value).toBe('10') // 回显文档值
    })

    it('blur 收口发出当前草稿值（change 未触发也有收口）', async () => {
        const wrapper = mount(NumberField, { props: { field: numField, modelValue: 10 } })
        const input = wrapper.find('input')
        input.element.value = '44'
        await input.trigger('blur')
        expect(wrapper.emitted('change')!.at(-1)).toEqual([44])
    })

    it('min 钳位', async () => {
        const wrapper = mount(NumberField, {
            props: { field: { ...numField, min: 0 }, modelValue: 5 },
        })
        wrapper.find('input').element.value = '-8'
        await wrapper.find('input').trigger('input')
        expect(wrapper.emitted('input')!.at(-1)).toEqual([0])
    })
})

describe('TextField', () => {
    const field: FieldDef = { key: ['src'], label: '资源地址', control: 'text' }

    it('挂载渲染；input 实时发出输入串', async () => {
        const wrapper = mount(TextField, { props: { field, modelValue: '/a.png' } })
        expect((wrapper.find('input').element as HTMLInputElement).value).toBe('/a.png')
        await wrapper.find('input').setValue('/b.png')
        expect(wrapper.emitted('input')!.at(-1)).toEqual(['/b.png'])
    })

    it('change 收口发出最终值', async () => {
        const wrapper = mount(TextField, { props: { field, modelValue: '/a.png' } })
        await wrapper.find('input').setValue('/final.png')
        await wrapper.find('input').trigger('change')
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['/final.png'])
    })
})

describe('TextareaField', () => {
    it('挂载渲染多行内容；input 实时发出', async () => {
        const field: FieldDef = { key: ['text'], label: '内容', control: 'textarea', data: true }
        const wrapper = mount(TextareaField, { props: { field, modelValue: '第一行' } })
        expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('第一行')
        await wrapper.find('textarea').setValue('第一行\n第二行')
        expect(wrapper.emitted('input')!.at(-1)).toEqual(['第一行\n第二行'])
    })
})

describe('ColorField', () => {
    it('非 nullable 渲染取色器 + 文本框；文本 change 收口', async () => {
        const field: FieldDef = { key: ['fontColor'], label: '字色', control: 'color' }
        const wrapper = mount(ColorField, { props: { field, modelValue: '#112233' } })
        const inputs = wrapper.findAll('input[type="text"]')
        expect(inputs).toHaveLength(1)
        expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)

        const textInput = inputs[0]!.element as HTMLInputElement
        textInput.value = 'rgba(1, 2, 3, 0.5)'
        await inputs[0]!.trigger('change')
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['rgba(1, 2, 3, 0.5)'])
    })

    it('nullable：null 禁用输入；启用切换发出 change', async () => {
        const field: FieldDef = { key: ['shape', 'backgroundColor'], label: '背景色', control: 'color', nullable: true }
        const wrapper = mount(ColorField, { props: { field, modelValue: null } })
        expect((wrapper.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false)
        expect((wrapper.find('input[type="color"]').element as HTMLInputElement).disabled).toBe(true)

        await wrapper.find('input[type="checkbox"]').setValue(true)
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['#000000'])

        await wrapper.setProps({ modelValue: '#336699' })
        expect((wrapper.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true)
        await wrapper.find('input[type="checkbox"]').setValue(false)
        expect(wrapper.emitted('change')!.at(-1)).toEqual([null])
    })

    it('取色器拖动实时提交（input），change 收口', async () => {
        const field: FieldDef = { key: ['shape', 'backgroundColor'], label: '背景色', control: 'color' }
        const wrapper = mount(ColorField, { props: { field, modelValue: '#000000' } })
        await wrapper.find('input[type="color"]').setValue('#abcdef')
        expect(wrapper.emitted('input')!.at(-1)).toEqual(['#abcdef'])
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['#abcdef'])
    })
})

describe('SelectField', () => {
    it('按 domain 渲染选项；change 发出所选值', async () => {
        const field: FieldDef = {
            key: ['align', 'horizontal'],
            label: '水平',
            control: 'select',
            domain: ['left', 'center', 'right'],
        }
        const wrapper = mount(SelectField, { props: { field, modelValue: 'left' } })
        const options = wrapper.findAll('option')
        expect(options.map((o) => o.element.value)).toEqual(['left', 'center', 'right'])

        await wrapper.find('select').setValue('center')
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['center'])
    })
})

describe('BooleanField', () => {
    it('渲染勾选态；切换发出 change', async () => {
        const wrapper = mount(BooleanField, {
            props: { field: { key: ['autowrap'], label: '自动换行', control: 'boolean' }, modelValue: false },
        })
        expect(wrapper.find('input').element.checked).toBe(false)
        await wrapper.find('input').setValue(true)
        expect(wrapper.emitted('change')!.at(-1)).toEqual([true])
    })
})

describe('AnchorField', () => {
    const field: FieldDef = { key: ['position', 'anchor'], label: '锚点', control: 'anchor' }

    it('渲染九宫格，选中态落在当前锚点', () => {
        const wrapper = mount(AnchorField, { props: { field, modelValue: 'center' } })
        const cells = wrapper.findAll('button')
        expect(cells).toHaveLength(9)
        expect(cells[4]!.classes()).toContain('cn-anchor__cell--active')
        expect(cells[4]!.attributes('aria-pressed')).toBe('true')
        expect(cells[0]!.attributes('title')).toBe('top-left')
    })

    it('点击即最终提交对应锚点', async () => {
        const wrapper = mount(AnchorField, { props: { field, modelValue: 'top-left' } })
        await wrapper.findAll('button')[8]!.trigger('click')
        expect(wrapper.emitted('change')!.at(-1)).toEqual(['bottom-right'])
    })
})

describe('PaddingField', () => {
    const field: FieldDef = { key: ['shape', 'padding'], label: '内边距', control: 'padding' }

    it('渲染四键并回显各边值', () => {
        const wrapper = mount(PaddingField, { props: { field, modelValue: padding(8) } })
        const inputs = wrapper.findAll('input[type="number"]')
        expect(inputs).toHaveLength(4)
        expect(inputs.every((i) => (i.element as HTMLInputElement).value === '8')).toBe(true)
    })

    it('改一边发出整个 Padding 对象（input 实时 / change 收口）', async () => {
        const wrapper = mount(PaddingField, { props: { field, modelValue: padding(8) } })
        const inputs = wrapper.findAll('input[type="number"]')

        // 直设 DOM 值再发 input（逐键实时语义）；change 收口后按真实接线回填 props
        // （面板提交后 modelValue 跟随，后续 patch 基于最新值组装）
        const topInput = inputs[0]!.element as HTMLInputElement
        topInput.value = '12'
        await inputs[0]!.trigger('input')
        expect(wrapper.emitted('input')!.at(-1)).toEqual([{ top: 12, bottom: 8, left: 8, right: 8 }])

        topInput.value = '12'
        await inputs[0]!.trigger('change')
        const settled = wrapper.emitted('change')!.at(-1)![0] as Padding
        expect(settled).toEqual({ top: 12, bottom: 8, left: 8, right: 8 })
        await wrapper.setProps({ modelValue: settled })

        const leftInput = inputs[2]!.element as HTMLInputElement
        leftInput.value = '20'
        await inputs[2]!.trigger('change')
        expect(wrapper.emitted('change')!.at(-1)).toEqual([{ top: 12, bottom: 8, left: 20, right: 8 }])
    })
})

describe('BorderField', () => {
    const field: FieldDef = { key: ['shape', 'border'], label: '边框', control: 'border' }
    const bordered = (): Border => ({
        top: { width: 2, color: '#334155' },
        bottom: null,
        left: null,
        right: null,
    })

    it('四边各渲染启用/宽/色；null 边禁用输入', () => {
        const wrapper = mount(BorderField, { props: { field, modelValue: bordered() } })
        expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(4)
        const numbers = wrapper.findAll('input[type="number"]')
        expect((numbers[0]!.element as HTMLInputElement).value).toBe('2')
        expect((numbers[1]!.element as HTMLInputElement).disabled).toBe(true) // bottom null
    })

    it('启用边发出完整 Border（width1 黑默认）；禁用置 null', async () => {
        const wrapper = mount(BorderField, { props: { field, modelValue: noBorder() } })
        const toggles = wrapper.findAll('input[type="checkbox"]')

        await toggles[0]!.setValue(true)
        expect(wrapper.emitted('change')!.at(-1)).toEqual([
            { top: { width: 1, color: '#000000' }, bottom: null, left: null, right: null },
        ])

        await wrapper.setProps({ modelValue: bordered() })
        await toggles[0]!.setValue(false)
        expect(wrapper.emitted('change')!.at(-1)).toEqual([noBorder()])
    })

    it('宽度实时提交整个对象；宽度 0 视为关闭该边', async () => {
        const wrapper = mount(BorderField, { props: { field, modelValue: bordered() } })
        const numbers = wrapper.findAll('input[type="number"]')

        await numbers[0]!.setValue('5')
        expect(wrapper.emitted('input')!.at(-1)).toEqual([
            { top: { width: 5, color: '#334155' }, bottom: null, left: null, right: null },
        ])

        await numbers[0]!.setValue('0')
        expect(wrapper.emitted('input')!.at(-1)).toEqual([noBorder()])
    })
})
